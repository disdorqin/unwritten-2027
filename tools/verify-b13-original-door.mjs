import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { build, near, ordinaryClock, readFrame, serve, swiftShader, timeoutMs, width, height } from './b13-browser-fixture.mjs';

const doorIds = ['district:513:366', 'district:550:412'];

async function saveScreenshot(page, output, result, state) {
  const filename = `${result.id.replaceAll(':', '-')}-${state}.png`;
  await page.screenshot({ path: path.join(output, filename), animations: 'disabled', timeout: timeoutMs });
  result.screenshots[state] = filename;
}

async function checkDoor(browser, url, id, output, result) {
  const context = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: 1, locale: 'zh-CN', reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  page.on('pageerror', error => result.errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /建筑清单读取失败|栋替换模型加载失败|Loading extension streets/.test(message.text())) {
      result.errors.push(message.text());
    }
  });
  await page.addInitScript(() => {
    window.__b13DoorKeys = [];
    addEventListener('keydown', event => {
      if (event.code === 'KeyE' || event.code === 'KeyS') {
        window.__b13DoorKeys.push({ code: event.code, trusted: event.isTrusted, repeat: event.repeat });
      }
    });
  });
  try {
    result.step = 'open';
    const response = await page.goto(`${url}/town-blockout.html?profile&b13DoorBaseline`, {
      waitUntil: 'domcontentloaded', timeout: timeoutMs,
    });
    assert.equal(response?.status(), 200);
    await page.waitForFunction(() => Boolean(window.__b13DoorBaseline), null, { timeout: timeoutMs });
    await page.locator('#jump').selectOption({ label: '东北纪念馆' });
    const openAir = await readFrame(page, { home: null, mask: 1 });
    // This sole placement sets up the audited stand. The subsequent inputs use
    // the real keyboard listener and the same movement code as a player.
    result.step = 'stage-original-door';
    const door = await page.evaluate(doorId => window.__b13DoorBaseline.stage(doorId), id);
    result.door = door;
    const approach = await readFrame(page, { after: openAir.frames, home: null, mask: 1, action: '进入屋舍空间' });
    result.approach = approach;
    near(approach.east, door.x, .05, 'Approach east');
    near(approach.north, door.n, .05, 'Approach north');
    result.step = 'press-e-to-enter';
    await page.keyboard.press('e');
    const inside = await readFrame(page, { after: approach.frames, home: id, mask: 2 });
    result.inside = inside;
    near(inside.east, 625.18, .05, 'Shared-room spawn east');
    near(inside.north, 493.64, .05, 'Shared-room spawn north');
    near(inside.ground, 150, .01, 'Shared-room ground');
    await saveScreenshot(page, output, result, 'inside');
    result.step = 'walk-to-original-door';
    await page.keyboard.down('s');
    let threshold;
    try {
      threshold = await readFrame(page, { after: inside.frames, home: id, mask: 2, action: '出门 · 返回来时的屋门' });
    } finally {
      await page.keyboard.up('s');
    }
    result.threshold = threshold;
    assert.ok(threshold.north < inside.north - .15, 'S moved toward the shared-room exit');
    result.step = 'press-e-to-return';
    await page.keyboard.press('e');
    const returned = await readFrame(page, { after: threshold.frames + 2, home: null, mask: 1 });
    result.returned = returned;
    near(returned.east, door.x, .05, 'Original door return east');
    near(returned.north, door.n, .05, 'Original door return north');
    near(returned.ground, approach.ground, .05, 'Original door return ground');
    near(Math.atan2(Math.sin(returned.yaw - door.exitYaw), Math.cos(returned.yaw - door.exitYaw)),
      0, .01, 'Original door outward yaw');
    await saveScreenshot(page, output, result, 'returned');
    result.step = 'check-trusted-input';
    const input = await page.evaluate(() => window.__b13DoorKeys);
    result.input = input;
    assert.deepEqual(input.filter(key => !key.repeat).map(key => [key.code, key.trusted]),
      [['KeyE', true], ['KeyS', true], ['KeyE', true]]);
    assert.deepEqual(result.errors, [], 'Viewer raised errors');
    result.step = 'passed';
  } finally {
    if (result.step !== 'passed') {
      result.lastObserved = await page.evaluate(() => ({
        pose: window.__b13DoorBaseline?.sample(),
        input: window.__b13DoorKeys,
      })).catch(() => null);
    }
    await context.close();
  }
}

const [sourcePath, outputPath, option] = process.argv.slice(2);
assert.ok(sourcePath && outputPath && (!option || option === '--build-only'),
  'Usage: node verify-b13-original-door.mjs CHECKOUT OUTPUT_DIR [--build-only]');
const checkout = path.resolve(sourcePath);
const output = path.resolve(outputPath);
const temporary = await mkdtemp(path.join(tmpdir(), 'town-b13-loopback-'));
let browser;
let server;
const evidence = {
  status: 'building', browser: null, viewport: { width, height, dpr: 1 },
  clock: new Date(ordinaryClock).toISOString(), results: [],
};
await mkdir(output, { recursive: true });
try {
  const dist = path.join(temporary, 'dist');
  await build(checkout, dist);
  if (!option) {
    const resolvePackage = createRequire(path.join(checkout, 'package.json'));
    const { chromium } = resolvePackage('@playwright/test');
    const executablePath = process.env.B13_CHROMIUM_PATH;
    evidence.status = 'launching-browser';
    browser = await chromium.launch({ args: swiftShader, executablePath });
    evidence.browser = browser.version();
    evidence.status = 'starting-loopback';
    const started = await serve(checkout, dist);
    server = started.server;
    evidence.status = 'checking-doors';
    for (const id of doorIds) {
      const result = { id, step: 'starting-context', screenshots: {}, errors: [] };
      evidence.results.push(result);
      try {
        await checkDoor(browser, started.url, id, output, result);
        console.log(`Passed E entry and E original-door return: ${id}`);
      } catch (error) {
        result.failure = error.message;
        console.error(`${id} failed at ${result.step}: ${error.message}`);
      }
    }
    evidence.status = evidence.results.every(result => result.step === 'passed' && !result.failure) ? 'passed' : 'failed';
    if (evidence.status === 'failed') process.exitCode = 1;
  } else {
    evidence.status = 'build-only';
    console.log('Rehearsal viewer build and untouched source verified.');
  }
} catch (error) {
  evidence.failure = error.message;
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await writeFile(path.join(output, 'b13-original-door.json'), JSON.stringify(evidence, null, 2) + '\n');
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
  await rm(temporary, { recursive: true, force: true });
}
