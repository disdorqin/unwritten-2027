import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';

const { values } = parseArgs({ options: { base: { type: 'string' }, out: { type: 'string' } } });
assert.ok(values.base && values.out, 'Usage: node tools/verify-main-summit-clouds-browser.mjs --base http://127.0.0.1:5173 --out <artifact-directory>');
const output = resolve(values.out);
await mkdir(output, { recursive: true });
const frozenP1 = 'a0dd7b83be27a461a177dd6032114aef96bef6d2';
const actualP1 = execFileSync('git', ['hash-object', 'tools/voxel-tavern/town-blockout/main-summit-block.ts'], { encoding: 'utf8' }).trim();
assert.equal(actualP1, frozenP1);

const observations = [];
const screenshots = [];
const errors = [];
let browser;
let browserVersion;
let transect;
let drift;
let failure;

try {
  browser = await chromium.launch({
    executablePath: process.env.P8_CHROMIUM_EXECUTABLE,
    headless: true,
    timeout: 15000,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  browserVersion = browser.version();
  const page = await browser.newPage({ viewport: { width: 1080, height: 728 } });
  page.setDefaultTimeout(6500);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => errors.push(request.failure()?.errorText ?? request.url()));
  await page.goto(new URL('/p8-cloud-preview.html', values.base).href, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await (await page.waitForFunction(() => window.p8Review?.state().frame > 0)).dispose();

  const state = () => page.evaluate(() => window.p8Review.state());
  async function click(id) {
    const before = await state();
    await page.locator('#' + id).click();
    await (await page.waitForFunction(frame => window.p8Review.state().frame > frame, before.frame)).dispose();
    const after = await state();
    assert.equal(after.webglError, 0, 'WebGL error after ' + id);
    assert.ok(after.renderer.triangles > 0 && after.renderer.cloudCalls > 0);
    assert.deepEqual(after.terrain.map(({ east, north, surveyed, sampled }) => [east, north, surveyed, sampled]),
      [[-550, 900, 560, 560], [590, 1080, 610, 610]]);
    return after;
  }

  async function take(name) {
    const image = await page.screenshot({ path: resolve(output, name + '.png') });
    screenshots.push({ name, sha256: createHash('sha256').update(image).digest('hex') });
  }

  await click('overview');
  await take('01-double-shoulder-overview');
  for (const [view, height] of [['below', 350], ['bottom', 380], ['inside', 474], ['top', 560], ['above', 650]]) {
    const reading = await click(view);
    assert.equal(reading.camera.height, height);
    assert.equal(reading.sample.density, view === 'inside' ? 1 : 0);
    assert.equal(reading.sample.visibility, view === 'inside' ? 300 : undefined);
    observations.push({ stage: view, reading });
    if (['below', 'inside', 'above'].includes(view)) await take('02-altitude-' + view);
  }

  transect = await page.evaluate(() => window.p8Review.transect());
  assert.deepEqual(transect.filter(sample => sample.density > 0).map(sample => sample.height), [400, 440, 474, 525, 548]);
  assert.ok(transect.filter(sample => sample.visibility !== undefined).every(sample => sample.visibility >= 300 && sample.visibility <= 500));
  assert.deepEqual((await state()).cloud.eyes.map(eye => eye.diameter), [112, 132, 96]);

  await click('overview');
  for (const [wind, east, north] of [
    ['calm', 0, 0], ['weak', 4.99, 0], ['threshold', 5, 0], ['eastward', 9, 0],
    ['westward', -9, 0], ['northward', 0, 9], ['southward', 0, -9],
  ]) {
    const reading = await click(wind);
    assert.equal(reading.wind, wind);
    const triggered = Math.hypot(east, north) >= 5;
    assert.equal(reading.renderer.cloudCalls, triggered ? 2 : 1);
    for (const { mount, lobes } of reading.cloud.flags) {
      assert.equal(lobes.length > 0, triggered);
      for (const lobe of lobes) {
        assert.ok((lobe.east - mount.east) * east + (lobe.north - mount.north) * north > 0);
        assert.ok(lobe.clearance >= 3 - 1e-9);
      }
    }
    observations.push({ stage: wind, reading });
    if (['calm', 'eastward', 'westward'].includes(wind)) await take('03-wind-' + wind);
  }

  for (const shoulder of ['west', 'east']) {
    const reading = await click(shoulder);
    assert.equal(reading.view, shoulder);
    await click('eastward');
    await take('04-' + shoulder + '-shoulder-eastward');
    await click('westward');
    await take('04-' + shoulder + '-shoulder-westward');
  }

  const before = await state();
  await click('drift');
  await (await page.waitForFunction(epoch => window.p8Review.state().epoch > epoch + 160, before.epoch)).dispose();
  await page.locator('#drift').click();
  const after = await state();
  const moved = before.cloud.eyes.map((eye, index) => Math.hypot(
    eye.east - after.cloud.eyes[index].east, eye.north - after.cloud.eyes[index].north));
  assert.ok(moved.every(displacement => displacement > 0));
  drift = { from: before.epoch, to: after.epoch, moved };
  const screenshotHash = name => screenshots.find(image => image.name === name)?.sha256;
  assert.notEqual(screenshotHash('02-altitude-inside'), screenshotHash('02-altitude-above'));
  assert.notEqual(screenshotHash('03-wind-eastward'), screenshotHash('03-wind-westward'));
  assert.deepEqual(errors, []);

  await page.close({ runBeforeUnload: false });
} catch (error) {
  failure = error;
} finally {
  await writeFile(resolve(output, 'p8-browser-proof.json'), JSON.stringify({
    frozenP1: actualP1, browserVersion, observations, transect, drift, screenshots, errors, failure: failure?.stack,
    scope: 'Isolated main summit terrain. No town mount, live weather or final composition approval.',
  }, null, 2) + '\n');
  let timer;
  try {
    await Promise.race([browser?.close(), new Promise(resolve => { timer = setTimeout(resolve, 3000); })]);
  } finally {
    clearTimeout(timer);
  }
}

if (failure) throw failure;
console.log(`P-8 Chromium ${browserVersion} · ${observations.length} observations · ${screenshots.length} screenshots`);
