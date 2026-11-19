import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { build, near, ordinaryClock, readFrame, serve, swiftShader, timeoutMs, width, height } from './b13-browser-fixture.mjs';

const entryId = 'district:513:366';
const targetId = 'district:550:412';
const expectedLanding = { east: 543.6, north: 412, ground: 11.893461799621578, yaw: -Math.PI / 2 };
const zoneLabels = ['中央 9', '集市 28', '纪念 14', '湖畔 20', '森林 21'];

async function saveScreenshot(page, output, result, state) {
  const filename = `${result.motion}-${state}.png`;
  await page.screenshot({ path: path.join(output, filename), animations: 'disabled', timeout: timeoutMs });
  result.screenshots[state] = filename;
}

async function checkDoorBook(browser, url, output, result) {
  const context = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: 1, locale: 'zh-CN', reducedMotion: result.motion,
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
    window.__b13DoorClicks = [];
    addEventListener('keydown', event => {
      if (['KeyE', 'KeyD', 'KeyW', 'Escape'].includes(event.code)) {
        window.__b13DoorKeys.push({ code: event.code, trusted: event.isTrusted, repeat: event.repeat });
      }
    });
    addEventListener('click', event => {
      if (!(event.target instanceof Element)) return;
      const door = event.target.closest('[data-house-door]');
      if (!door) return;
      window.__b13DoorClicks.push({
        id: door.getAttribute('data-house-door'),
        trusted: event.isTrusted,
        travelling: window.__b13DoorBaseline?.sample().travelling,
        fadePresent: Boolean(document.querySelector('.house-door-fade')),
        dialogOpen: Boolean(document.querySelector('#place-card[open]')),
      });
    });
  });
  const dialog = page.locator('#place-card');
  const book = dialog.locator('.house-door-book');
  const zones = book.locator('[data-house-door-zone]');
  const entries = book.locator('[data-house-door]');
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
    const door = await page.evaluate(doorId => window.__b13DoorBaseline.stage(doorId), entryId);
    result.door = door;
    const approach = await readFrame(page, { after: openAir.frames, home: null, mask: 1, action: '进入屋舍空间' });
    result.approach = approach;
    near(approach.east, door.x, .05, 'Approach east');
    near(approach.north, door.n, .05, 'Approach north');
    result.step = 'press-e-to-enter';
    await page.keyboard.press('e');
    const inside = await readFrame(page, { after: approach.frames, home: entryId, mask: 2 });
    result.inside = inside;
    near(inside.east, 625.18, .05, 'Shared-room spawn east');
    near(inside.north, 493.64, .05, 'Shared-room spawn north');
    near(inside.ground, 150, .01, 'Shared-room ground');
    assert.equal(inside.sharedRoomVisible, true);
    result.step = 'walk-to-book';
    await page.keyboard.down('d');
    let threshold;
    try {
      threshold = await readFrame(page, { after: inside.frames, home: entryId, mask: 2, action: '百门册 · 选一扇门出去' });
    } finally {
      await page.keyboard.up('d');
    }
    result.threshold = threshold;
    assert.ok(threshold.east > inside.east + .5, 'D moved toward the shared-room book');

    result.step = 'read-book-and-close-with-escape';
    await page.keyboard.press('e');
    await book.waitFor({ state: 'visible', timeout: timeoutMs });
    assert.equal(await dialog.locator('#place-title').textContent(), '百门册 · 一屋通百门');
    result.zoneLabels = await zones.allTextContents();
    assert.deepEqual(result.zoneLabels, zoneLabels, 'Exact e80f983 door counts by zone');
    assert.equal(await zones.filter({ hasText: '集市 28' }).getAttribute('aria-pressed'), 'true');
    assert.equal(await entries.count(), 28);
    assert.equal(await entries.first().getAttribute('data-house-door'), entryId);
    assert.match(await entries.first().textContent(), /刚从这儿进/);
    const search = book.getByRole('searchbox', { name: '搜门名或附近地标' });
    await search.fill('b13-no-matching-door');
    await book.getByText('没有找到这扇门。', { exact: true }).waitFor({ timeout: timeoutMs });
    assert.equal(await entries.count(), 0);
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden', timeout: timeoutMs });
    await page.waitForFunction(() => document.activeElement === document.querySelector('#scene canvas'), null, { timeout: timeoutMs });
    result.afterEscape = await readFrame(page, { after: threshold.frames, home: entryId, mask: 2 });
    near(result.afterEscape.east, threshold.east, .25, 'Escape preserves indoor east');
    near(result.afterEscape.north, threshold.north, .25, 'Escape preserves indoor north');

    result.step = 'reopen-and-select-memorial-door';
    await page.keyboard.press('e');
    await book.waitFor({ state: 'visible', timeout: timeoutMs });
    assert.equal(await search.inputValue(), '');
    await book.locator('[data-house-door-zone="memorial"]').click();
    assert.equal(await entries.count(), 14);
    const target = book.locator(`button[data-house-door="${targetId}"]`);
    assert.equal(await target.count(), 1);
    await saveScreenshot(page, output, result, 'door-book');
    result.step = 'click-and-observe-destination';
    await target.click();
    const returned = await readFrame(page, { after: result.afterEscape.frames, home: null, mask: 1 });
    result.landing = returned;
    near(returned.east, expectedLanding.east, .05, 'Destination east');
    near(returned.north, expectedLanding.north, .05, 'Destination north');
    near(returned.ground, expectedLanding.ground, .05, 'Destination ground');
    near(Math.atan2(Math.sin(returned.yaw - expectedLanding.yaw), Math.cos(returned.yaw - expectedLanding.yaw)),
      0, .01, 'Destination outward yaw');
    assert.equal(returned.sharedRoomVisible, false);
    await dialog.waitFor({ state: 'hidden', timeout: timeoutMs });
    await page.locator('.house-door-fade').waitFor({ state: 'detached', timeout: timeoutMs });
    result.clicks = await page.evaluate(() => window.__b13DoorClicks);
    assert.deepEqual(result.clicks, [{
      id: targetId, trusted: true, travelling: true, fadePresent: result.motion === 'no-preference', dialogOpen: false,
    }]);
    await saveScreenshot(page, output, result, 'landed');

    result.step = 'walk-after-transition';
    await page.keyboard.down('w');
    try {
      result.afterWalk = await readFrame(page, { after: returned.frames, home: null, mask: 1, westOf: returned.east - .2 });
    } finally {
      await page.keyboard.up('w');
    }
    result.step = 'check-trusted-input';
    const input = await page.evaluate(() => window.__b13DoorKeys);
    result.input = input;
    assert.deepEqual(input.filter(key => !key.repeat).map(key => [key.code, key.trusted]),
      [['KeyE', true], ['KeyD', true], ['KeyE', true], ['Escape', true], ['KeyE', true], ['KeyW', true]]);
    assert.deepEqual(result.errors, [], 'Viewer raised errors');
    result.step = 'passed';
  } finally {
    if (result.step !== 'passed') {
      result.lastObserved = await page.evaluate(() => ({
        pose: window.__b13DoorBaseline?.sample(),
        input: window.__b13DoorKeys,
        clicks: window.__b13DoorClicks,
        dialogOpen: Boolean(document.querySelector('#place-card[open]')),
        fadePresent: Boolean(document.querySelector('.house-door-fade')),
      })).catch(() => null);
    }
    await context.close();
  }
}

const [sourcePath, outputPath, option] = process.argv.slice(2);
assert.ok(sourcePath && outputPath && (!option || option === '--build-only'),
  'Usage: node verify-b13-door-book.mjs CHECKOUT OUTPUT_DIR [--build-only]');
const checkout = path.resolve(sourcePath);
const output = path.resolve(outputPath);
const temporary = await mkdtemp(path.join(tmpdir(), 'town-b13-loopback-'));
let browser;
let server;
const evidence = {
  status: 'building', browser: null, viewport: { width, height, dpr: 1 },
  clock: new Date(ordinaryClock).toISOString(), route: { entryId, targetId }, results: [],
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
    evidence.status = 'checking-door-book';
    for (const motion of ['no-preference', 'reduce']) {
      const result = { motion, step: 'starting-context', screenshots: {}, errors: [] };
      evidence.results.push(result);
      try {
        await checkDoorBook(browser, started.url, output, result);
        console.log(`Passed B13 book exit and resumed movement: ${motion}`);
      } catch (error) {
        result.failure = error.message;
        console.error(`${motion} failed at ${result.step}: ${error.message}`);
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
  await writeFile(path.join(output, 'b13-door-book.json'), JSON.stringify(evidence, null, 2) + '\n');
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
  await rm(temporary, { recursive: true, force: true });
}
