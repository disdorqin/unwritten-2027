import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const checkout = fileURLToPath(new URL('../', import.meta.url));
const root = path.join(checkout, 'tools', 'voxel-tavern');
const output = process.argv[2] && path.resolve(process.argv[2]);
assert.ok(output, 'Usage: node tools/verify-main-summit-outlook.mjs OUTPUT');
await mkdir(output, { recursive: true });
const requireRoot = createRequire(path.join(checkout, 'package.json'));
const requireVite = createRequire(path.join(root, 'package.json'));
const vite = path.resolve(path.dirname(requireVite.resolve('vite/package.json')), 'dist/node/index.js');
const { build, preview } = await import(pathToFileURL(vite));
const { chromium } = requireRoot('@playwright/test');

const entry = 'main-summit-p4-review.html';
const viewport = { width: 840, height: 472 };
const report = {
  source: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: checkout, encoding: 'utf8' }).trim(),
  status: 'failed', viewport, input: 'Native area click, WASD, arrow key turn and E. The P-4 proof clock advances held inputs.',
  errors: [], checks: [], screenshots: [],
};
let server, browser, page, outDir;

const snapshot = () => page.evaluate(() => window.p4.snapshot());

function assertAt(state, east, north, label) {
  assert.equal(state.area, 'summit');
  const axes = { east, north, height: 800 };
  for (const [axis, expected] of Object.entries(axes)) {
    assert.ok(Math.abs(state.position[axis] - expected) <= 0.035,
      `${label} ${axis}: expected ${expected}, got ${state.position[axis]}`);
  }
}

function record(label, state) {
  const { area, position, arrived, insideHut, profile, action, collisions, yaw, outlook, render } = state;
  report.checks.push({ label, area, position, arrived, insideHut, profile, action, collisions, yaw, outlook, render });
}

async function hold(key, milliseconds) {
  await page.keyboard.down(key);
  try {
    await page.evaluate(duration => window.p4.advance(duration), milliseconds);
  } finally {
    await page.keyboard.up(key);
  }
  return snapshot();
}

async function move(east, north, label) {
  const before = await snapshot();
  const deltaEast = east - before.position.east;
  const deltaNorth = north - before.position.north;
  assert.ok(Math.min(Math.abs(deltaEast), Math.abs(deltaNorth)) < 0.035, `${label}: invalid route leg`);
  assert.ok(Math.abs(before.yaw) < 1e-8, `${label}: player should face north for cardinal WASD`);
  const lateral = Math.abs(deltaEast) >= Math.abs(deltaNorth);
  const delta = lateral ? deltaEast : deltaNorth;
  const key = lateral ? (delta >= 0 ? 'KeyD' : 'KeyA') : (delta >= 0 ? 'KeyW' : 'KeyS');
  const after = await hold(key, Math.abs(delta) * 1000 / 3.2);
  assertAt(after, east, north, label);
  assert.equal(after.collisions, before.collisions, `${label}: normal route should clear all colliders`);
  return after;
}

async function capture(filename, state) {
  assert.ok(state.render.draws > 0 && state.render.triangles > 0);
  assert.ok(state.outlook.draws > 0, 'The displayed frame has no visible outlook geometry');
  await page.screenshot({ path: path.join(output, filename), timeout: 20_000 });
  report.screenshots.push(filename);
}

try {
  report.step = 'Vite build and preview';
  outDir = await mkdtemp(path.join(output, '.preview-'));
  await build({ root, configFile: false, logLevel: 'warn', build: { outDir,
    emptyOutDir: false, rollupOptions: { input: path.join(root, entry) } } });
  server = await preview({ root, configFile: false, logLevel: 'warn', build: { outDir },
    preview: { host: '127.0.0.1', port: 0 } });
  const args = process.platform === 'win32' ? ['--use-gl=angle', '--use-angle=d3d11'] :
    ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'];
  const executablePath = process.env.CHROMIUM_PATH ?? process.env.P4_CHROMIUM_PATH ??
    (!existsSync(chromium.executablePath()) && existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  browser = await chromium.launch({ executablePath, args });
  report.browser = browser.version();
  page = await browser.newPage({ viewport });
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  page.on('response', response => {
    if (response.status() >= 400) report.errors.push(`${response.status()} ${response.url()}`);
  });
  page.on('requestfailed', request => report.errors.push(`${request.url()}: ${request.failure()?.errorText}`));

  report.step = 'surveyed P-4 approach';
  const { port } = server.httpServer.address();
  const response = await page.goto(`http://127.0.0.1:${port}/${entry}?proof=1`, { waitUntil: 'load' });
  assert.equal(response?.status(), 200);
  await page.waitForFunction(() => typeof window.p4?.snapshot === 'function', null, { timeout: 15_000 });
  const initial = await snapshot();
  assert.equal(initial.area, 'cloud-deck');
  assert.equal(initial.outlook, null);
  await page.locator('[data-p4-area="summit"]').click();
  const landing = await snapshot();
  assertAt(landing, 30, 982, 'P-3 trail landing');
  assert.deepEqual(landing.outlook.stand, { east: 80, north: 998, height: 800 });
  record('P-3 trail landing', landing);
  await move(62.5, 982, 'Main summit plateau');
  const apron = await move(62.5, 1004.8, 'P-4 summit entry');
  assert.equal(apron.arrived, true);
  assert.equal(apron.insideHut, false);
  record('P-4 summit entry', apron);

  report.step = 'outlook stand and fixed telescope';
  await move(72, 1004.8, 'East of the entry');
  await move(72, 998, 'Outlook western approach');
  const stand = await move(80, 998, 'Outlook stand');
  assert.equal(stand.action, null, 'The telescope is scenery');
  const view = await hold('ArrowRight', Math.PI * 1000 / 4);
  assert.ok(Math.abs(view.yaw - Math.PI / 2) < 1e-8, 'The viewport should face due east');
  assertAt(view, 80, 998, 'East-facing outlook');
  record('east-facing outlook and fixed telescope', view);
  await capture('01-east-outlook.png', view);
  await page.keyboard.press('KeyE');
  const afterAction = await snapshot();
  assert.equal(afterAction.action, null);
  assert.equal(afterAction.lastAction, null);
  assert.deepEqual(afterAction.profile, landing.profile);
  await hold('ArrowLeft', Math.PI * 1000 / 4);

  report.step = 'east rail and walk back';
  await move(80, 997.25, 'East rail approach clear of the telescope');
  const rail = await hold('KeyD', 2_000);
  assert.ok(rail.position.east > 83 && rail.position.east < 84.1, `Unexpected east rail stop E${rail.position.east}`);
  assert.ok(Math.abs(rail.position.north - 997.25) <= 0.035);
  assert.ok(Math.abs(rail.position.height - 800) <= 0.035);
  assert.ok(rail.collisions > stand.collisions, 'The east rail should stop further keyboard movement');
  record('east rail collision at the cliff boundary', rail);
  await move(80, 997.25, 'Retreat from rail');
  await move(80, 998, 'Outlook return stand');
  await move(72, 998, 'Return from outlook');
  await move(72, 1004.8, 'Return to entry latitude');
  const returned = await move(62.5, 1004.8, 'Return to the lodge apron');
  assert.equal(returned.arrived, true);
  assert.equal(returned.insideHut, false);
  assert.deepEqual(returned.profile, landing.profile);
  record('returned to P-4 entry along the same path', returned);
  await page.locator('[data-p4-area="cloud-deck"]').click();
  const remounted = await snapshot();
  assert.equal(remounted.area, 'cloud-deck');
  assert.equal(remounted.outlook, null);
  assert.deepEqual(remounted.profile, landing.profile);
  record('outlook unmounted on cloud-deck', remounted);
  assert.deepEqual(report.errors, []);
  report.status = 'passed';
} catch (error) {
  report.failure = error.stack ?? String(error);
  if (page) report.last = await snapshot().catch(() => undefined);
  process.exitCode = 1;
} finally {
  for (const close of [() => browser?.close(), () => server?.close(),
    () => outDir && rm(outDir, { recursive: true, force: true })]) {
    try { await close(); }
    catch (error) {
      report.errors.push(String(error));
      report.status = 'failed';
      process.exitCode = 1;
    }
  }
  await writeFile(path.join(output, 'summit-outlook-result.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, step: report.step, screenshots: report.screenshots,
    errors: report.errors, failure: report.failure }));
}
