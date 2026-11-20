import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [checkoutArg, outputArg] = process.argv.slice(2);
assert.ok(checkoutArg && outputArg, 'Usage: node verify-warrior-city-browser.mjs <checkout> <evidence>');
const checkout = path.resolve(checkoutArg), output = path.resolve(outputArg);
const root = path.join(checkout, 'tools', 'voxel-tavern');
const { chromium } = createRequire(path.join(checkout, 'package.json'))('playwright');
const vite = createRequire(path.join(root, 'package.json')).resolve('vite');
const { createServer } = await import(pathToFileURL(vite).href);
const viewport = { width: 800, height: 520 };
const errors = [], stops = [];
let server, browser, page, failure, chromiumVersion;

const state = () => page.evaluate(() => window.__warriorCityReview());
async function walk(key, field, target, label) {
  const before = await state();
  const growing = target >= before[field];
  await page.keyboard.down(key);
  try {
    await page.waitForFunction(({ field, target, growing }) => {
      const current = window.__warriorCityReview()[field];
      return growing ? current >= target : current <= target;
    }, { field, target, growing }, { timeout: 48_000 });
  } finally {
    await page.keyboard.up(key);
  }
  const after = await state();
  assert.ok(after.frames > before.frames && after.accepted > before.accepted);
  stops.push({ label, before, after });
  return after;
}

async function photo(name) {
  const before = await state();
  assert.ok(before.draws > 0 && before.triangles > 0);
  await page.screenshot({ path: path.join(output, `${name}.png`), timeout: 24_000 });
  stops.push({ photo: `${name}.png`, state: before });
}

async function select(view) {
  await page.locator(`[data-view="${view}"]`).click({ timeout: 12_000 });
  await page.waitForFunction(view => window.__warriorCityReview().view === view, view, { timeout: 10_000 });
}

await mkdir(output, { recursive: true });
try {
  server = await createServer({ root, configFile: false, logLevel: 'warn',
    optimizeDeps: { noDiscovery: true, include: [] }, server: { host: '127.0.0.1', port: 0, hmr: false } });
  await server.listen();
  const { port } = server.httpServer.address();
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  chromiumVersion = browser.version();
  page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  page.on('pageerror', error => errors.push(String(error)));
  page.on('requestfailed', request => errors.push(`${request.url()} ${request.failure()?.errorText}`));
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  const response = await page.goto(`http://127.0.0.1:${port}/underground-warrior-city-review.html`);
  assert.equal(response?.status(), 200);
  await page.waitForFunction(() => window.__warriorCityReview?.().frames > 2, null, { timeout: 20_000 });
  await photo('gate-entry');
  for (const [east, id] of [[21, 'gate-lane'], [49, 'stone-houses'], [96, 'central-square'], [139, 'market-approach'], [176.5, 'descent-forecourt']]) {
    const at = await walk('w', 'east', east, id);
    assert.equal(at.feet, -165);
    assert.equal(at.blocked, 0);
    await photo(id);
  }
  await select('house');
  await walk('w', 'north', 9.5, 'enter one-end stone house');
  await photo('open-stone-house');
  await walk('s', 'north', 5.8, 'return through the single doorway');
  await select('market');
  await walk('w', 'east', 135, 'pass beneath market arches');
  await photo('market-arcade');
  await walk('w', 'east', 155.9, 'continue through the arcade');
  await select('wall');
  const stairs = await walk('w', 'north', 28.1, 'climb the real stair treads');
  assert.equal(stairs.feet, -158.7);
  assert.ok(stairs.maxStep > 0 && stairs.maxStep <= .31);
  await page.keyboard.press('e');
  await photo('wall-lookout');
  await walk('w', 'east', 175.4, 'walk the wall deck toward its collapsed end');
  const before = await state();
  await page.keyboard.down('w');
  try {
    await page.waitForFunction(blocks => window.__warriorCityReview().blocked > blocks, before.blocked, { timeout: 8_000 });
  } finally { await page.keyboard.up('w'); }
  const stopped = await state();
  assert.ok(stopped.east < 177 && stopped.feet === -158.7);
  stops.push({ label: 'rubble stops travel', before, after: stopped });
  await photo('collapsed-wall-end');
  assert.deepEqual(errors, []);
} catch (error) {
  failure = String(error);
  throw error;
} finally {
  await browser?.close();
  await server?.close();
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: checkout, encoding: 'utf8' }).trim();
  await writeFile(path.join(output, 'warrior-city-evidence.json'), JSON.stringify({
    head, chromiumVersion, viewport, fixture: 'U-10 local skeleton', passed: !failure, failure, stops, errors,
  }, null, 2) + '\n');
  console.log(JSON.stringify({ head, chromiumVersion, passes: !failure, stops: stops.length, errors }));
}
