import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { crystalCave, crystalCaveMainPath, crystalCaveMoonstonePath } from './voxel-tavern/town-blockout/underground-crystal-cave.ts';

const url = new URL(process.env.U9_URL ?? 'http://127.0.0.1:4173/tools/voxel-tavern/town-crystal-cave-review.html');
assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) && url.protocol === 'http:', 'Use the isolated runner-local Vite preview');
const output = process.env.U9_OUTPUT ?? 'test-results/u9-crystal-cave';
await mkdir(output, { recursive: true });
const view = { width: 760, height: 560 };
const record = { browser: null, view, scene: 'U-9 local first-person preview', capture: [], waypoints: [], pageErrors: [], requestErrors: [] };
let browser;

try {
  browser = await chromium.launch({
    headless: true, executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  record.browser = browser.version();
  const page = await browser.newPage({ viewport: view, deviceScaleFactor: 1 });
  page.on('pageerror', error => record.pageErrors.push(error.message));
  page.on('console', msg => { if (msg.type() === 'error' && !msg.text().includes('favicon.ico')) record.pageErrors.push(msg.text()); });
  page.on('response', response => {
    if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) {
      record.requestErrors.push(`${response.status()} ${response.url()}`);
    }
  });
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204, body: '' }));
  const response = await page.goto(url.href, { waitUntil: 'load', timeout: 75_000 });
  assert.equal(response?.status(), 200);
  const canvas = page.locator('#cave-scene canvas');
  await canvas.waitFor({ state: 'visible' });
  await page.waitForFunction(() => Number(document.querySelector('#cave-scene canvas')?.dataset.draws) > 0);
  const area = await canvas.boundingBox();
  assert.ok(area);
  const origin = { x: area.x + area.width / 2, y: area.y + area.height / 2 };

  async function state() {
    return canvas.evaluate(element => ({
      east: Number(element.dataset.east), north: Number(element.dataset.north), height: Number(element.dataset.footHeight),
      yaw: Number(element.dataset.yaw), zone: element.dataset.region,
      draws: Number(element.dataset.draws), triangles: Number(element.dataset.triangles),
    }));
  }
  function normalized(angle) { return Math.atan2(Math.sin(angle), Math.cos(angle)); }
  async function drag(dx, dy = 0) {
    const count = Math.max(1, Math.ceil(Math.max(Math.abs(dx) / (area.width * .39), Math.abs(dy) / (area.height * .39))));
    for (let index = 0; index < count; index++) {
      await page.mouse.move(origin.x, origin.y);
      await page.mouse.down();
      await page.mouse.move(origin.x + dx / count, origin.y + dy / count);
      await page.mouse.up();
    }
  }
  async function aim(e, n) {
    const before = await state();
    const goal = Math.atan2(e - before.east, n - before.north);
    const offset = normalized(goal - before.yaw);
    if (Math.abs(offset) > .004) await drag(offset / .003);
  }
  async function stepTo([east, north], phase) {
    const before = await state();
    if (Math.hypot(before.east - east, before.north - north) > .19) {
      await aim(east, north);
      await page.keyboard.down('w');
      try {
        await page.waitForFunction(({ east, north }) => {
          const { dataset } = document.querySelector('#cave-scene canvas');
          if (Math.hypot(Number(dataset.east) - east, Number(dataset.north) - north) > .19) return false;
          window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
          return true;
        }, { east, north }, { timeout: 80_000 });
      } finally { await page.keyboard.up('w'); }
    }
    const after = await state();
    assert.ok(Math.hypot(after.east - east, after.north - north) <= .35, `${phase}: missed ${east}/${north}`);
    record.waypoints.push({ phase, expected: [east, north], ...after });
  }
  async function snapshot(name, zone) {
    const pose = await state();
    assert.equal(pose.zone, zone);
    assert.ok(pose.draws > 0 && pose.triangles > 0);
    const path = `${name}.png`;
    await canvas.screenshot({ path: join(output, path) });
    record.capture.push({ path, ...pose });
  }

  await snapshot('01-entrance', 'crystal-forest');
  for (const point of crystalCaveMainPath.slice(1)) {
    await stepTo(point, 'main-out');
    const [e, n] = point;
    if (e === 0 && n === 19) {
      await aim(0, 35);
      await drag(0, -95);
      await snapshot('02-cold-hall', 'crystal-hall');
      await drag(0, 95);
    }
    if (e === 0 && n === 31) {
      for (const target of crystalCaveMoonstonePath.slice(1)) await stepTo(target, 'vein-out');
      await aim(30, 32);
      await snapshot('03-moonstone-vein', 'moonstone-vein');
      for (const target of [...crystalCaveMoonstonePath].reverse().slice(1)) await stepTo(target, 'vein-return');
    }
    if (e === 7.9 && n === 59.5) {
      await aim(...crystalCave.pool.centre);
      await snapshot('04-pool-bank', 'underground-pool');
    }
    if (e === 0 && n === 98) {
      await aim(...crystalCave.exit);
      await snapshot('05-dark-bend', 'dark-passage');
      assert.equal(await page.locator('#cave-location').isVisible(), false);
    }
  }
  await snapshot('06-exit-seam', 'dark-passage');
  for (const point of [...crystalCaveMainPath].reverse().slice(1)) await stepTo(point, 'main-return');
  await aim(0, 10);
  await snapshot('07-return-to-entrance', 'crystal-forest');
  assert.equal(record.waypoints.length, 2 * (crystalCaveMainPath.length - 1) + 2 * (crystalCaveMoonstonePath.length - 1));
  assert.deepEqual(record.pageErrors, []);
  assert.deepEqual(record.requestErrors, []);
} catch (error) {
  record.failure = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await writeFile(join(output, 'walk.json'), `${JSON.stringify(record, null, 2)}\n`);
  console.log(JSON.stringify({ ...record, waypoints: record.waypoints.length, capture: record.capture.map(x => x.path) }));
}
