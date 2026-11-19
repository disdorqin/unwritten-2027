import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const url = new URL(process.env.P3_SNOW_URL ??
  'http://127.0.0.1:5813/tools/voxel-tavern/main-summit-snow-belt-preview.html');
assert.equal(url.protocol, 'http:');
assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname));
assert.equal(url.pathname, '/tools/voxel-tavern/main-summit-snow-belt-preview.html');
url.searchParams.set('proof', '1');
const output = process.env.P3_SNOW_OUTPUT ?? process.argv[2];
assert.ok(output, 'Set P3_SNOW_OUTPUT to the evidence directory');
await mkdir(output, { recursive: true });

const viewport = { width: 768, height: 432 };
const errors = [], screenshots = [];
const report = { viewport, errors, screenshots };
let browser;
try {
  browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  report.browser = browser.version();
  const page = await browser.newPage({ viewport });
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204, body: '' }));
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => errors.push(`${request.url()} ${request.failure()?.errorText}`));
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  const response = await page.goto(url.href, { waitUntil: 'load', timeout: 60_000 });
  assert.equal(response?.status(), 200);
  await page.waitForFunction(() => typeof window.p3Snow?.advance === 'function', undefined, { timeout: 20_000 });
  await page.locator('canvas').waitFor({ state: 'visible' });

  const advance = ms => page.evaluate(duration => window.p3Snow.advance(duration), ms);
  const position = () => page.evaluate(() => window.p3Snow.snapshot());
  const distance = (a, b) => Math.hypot(a.east - b.east, a.north - b.north);
  const wrap = yaw => Math.atan2(Math.sin(yaw), Math.cos(yaw));
  async function capture(name) {
    const state = await advance(0);
    assert.ok(state.draws > 0 && state.triangles > 0);
    const file = `${name}.png`;
    await page.screenshot({ path: join(output, file) });
    screenshots.push(file);
  }

  const start = await position();
  assert.deepEqual([start.east, start.north, start.height, start.active], [79, 1004, 800, false]);
  await capture('01-absolute-summit');
  await page.keyboard.press('KeyE');
  const mounted = await position();
  assert.equal(mounted.active, true);
  assert.equal(mounted.ticks, 0);

  await page.keyboard.down('KeyW');
  const forward = await advance(1_250);
  await page.keyboard.up('KeyW');
  assert.ok(forward.active && !forward.airborne && forward.speed > 0 && distance(forward, mounted) > 0.7);
  assert.ok(forward.ticks >= 74 && forward.height < mounted.height);
  await capture('02-engineered-snow-belt');

  await page.keyboard.down('KeyA');
  const left = await advance(100);
  await page.keyboard.up('KeyA');
  await page.keyboard.down('KeyD');
  const right = await advance(100);
  await page.keyboard.up('KeyD');
  assert.ok(left.active && right.active);
  assert.ok(wrap(left.yaw - forward.yaw) < -0.08 && wrap(right.yaw - left.yaw) > 0.08);
  report.summit = { start, mounted, forward, left, right };

  await page.locator('#seam').click();
  const seam = await position();
  assert.ok(seam.active && seam.lowerPreview && seam.seamOffset < 0);
  await capture('03-lower-preview-seam');
  assert.match(await page.locator('#status').textContent(), /未接前山 R2/);
  report.lowerPreview = seam;
  assert.deepEqual(errors, []);
} catch (error) {
  report.failure = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await writeFile(join(output, 'snow-preview-browser.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
