import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [checkoutArg, outputArg] = process.argv.slice(2);
assert.ok(checkoutArg && outputArg, 'Usage: node verify-main-summit-pavilions-browser.mjs <checkout> <output>');
const checkout = path.resolve(checkoutArg);
const output = path.resolve(outputArg);
const viteRoot = path.join(checkout, 'tools', 'voxel-tavern');
const repoRequire = createRequire(path.join(checkout, 'package.json'));
const viteRequire = createRequire(path.join(viteRoot, 'package.json'));
const { chromium } = repoRequire('playwright');
const { createServer } = await import(pathToFileURL(viteRequire.resolve('vite')).href);
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: checkout, encoding: 'utf8', timeout: 3_000 }).trim();
const viewport = { width: 760, height: 480 };
const started = performance.now();
const deadline = started + 105_000;
const errors = [];
const teardownErrors = [];
const pavilions = [];
let server;
let browser;
let context;
let page;
let failure;
let browserVersion;

async function limited(label, promise, duration) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${duration} ms`)), duration);
    })]);
  } finally {
    clearTimeout(timer);
  }
}

function timeLeft(limit) {
  const remaining = Math.floor(deadline - performance.now());
  assert.ok(remaining > 0, 'P-9 browser evidence exceeded the time budget');
  return Math.min(remaining, limit);
}

const sample = () => page.evaluate(() => window.__p9Review.sample());

async function afterInput(beforeFrame) {
  const ready = await page.waitForFunction(frame => window.__p9Review.sample().frame > frame,
    beforeFrame, { timeout: timeLeft(8_000) });
  await ready.dispose();
  return sample();
}

async function press(key) {
  const { frame } = await sample();
  await page.keyboard.press(key);
  return afterInput(frame);
}

async function select(id) {
  const { frame } = await sample();
  await page.locator('#' + id).click({ timeout: timeLeft(8_000) });
  return afterInput(frame);
}

async function screenshot(file) {
  await page.screenshot({ path: path.join(output, file), timeout: timeLeft(8_000) });
  return file;
}

async function inspect(id) {
  const approach = await select(id);
  assert.equal(approach.site.id, id);
  assert.equal(approach.view, 'approach');
  assert.ok(approach.inCloudBand && Number.isFinite(approach.pedestalGround) && Number.isFinite(approach.approachGround));
  assert.ok(approach.draws > 0 && approach.triangles > 0 && approach.pavilionDraws > 0);
  for (const material of ['cloud-pavilion-stone', 'cloud-pavilion-wood']) {
    assert.ok(approach.materials.includes(material), `${id}: ${material} did not render from the approach`);
  }
  const approachImage = await screenshot(`${id}-approach.png`);
  const centered = await select('center');
  assert.equal(centered.view, 'center');
  assert.equal(centered.site.id, id);
  assert.ok(Math.abs(centered.camera.position[1] - centered.site.height - 1.65) < .001);
  assert.ok(centered.draws > 0 && centered.triangles > 0);
  const { pavilionHit, terrainHit, terrainSamples, terrainClearance, rayDirection, windowDistance } = centered.sightline;
  assert.equal(pavilionHit, null, `${id}: pavilion geometry blocks the vista centerline`);
  assert.equal(terrainHit, null, `${id}: the visible terrain mesh blocks the vista centerline`);
  assert.ok(terrainSamples > 0 && terrainClearance > 0, `${id}: the surveyed P-1 ground crosses the vista centerline`);
  const { viewEast, viewNorth } = centered.site;
  const horizontalRay = Math.hypot(rayDirection[0], rayDirection[2]);
  assert.equal(windowDistance, centered.site.visibilityMetres);
  assert.ok(Math.abs(Math.atan2(rayDirection[1], horizontalRay) + Math.PI / 12) < 1e-7);
  assert.ok((viewEast * rayDirection[0] - viewNorth * rayDirection[2]) /
    (Math.hypot(viewEast, viewNorth) * horizontalRay) >= 1 - 1e-7);
  const vistaImage = await screenshot(`${id}-vista.png`);
  const left = await press('ArrowLeft');
  const restored = await press('Home');
  const right = await press('ArrowRight');
  const final = await press('Home');
  assert.ok(left.yaw > 0 && right.yaw < 0);
  assert.notDeepEqual(left.camera.quaternion, centered.camera.quaternion);
  assert.notDeepEqual(right.camera.quaternion, centered.camera.quaternion);
  assert.deepEqual(restored.camera, centered.camera);
  assert.deepEqual(final.camera, centered.camera);
  pavilions.push({ id, approach, approachImage, centered, vistaImage, left, right, final });
}

async function main() {
  server = await limited('Vite initialization', createServer({
    root: viteRoot, configFile: path.join(viteRoot, 'vite.config.ts'), logLevel: 'warn',
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { host: '127.0.0.1', port: 0, strictPort: true, hmr: false },
  }), timeLeft(20_000));
  await limited('Vite listen', server.listen(), timeLeft(12_000));
  const address = server.httpServer.address();
  assert.equal(address.address, '127.0.0.1');
  const url = `http://127.0.0.1:${address.port}/main-summit-pavilions-review.html`;
  const entry = await fetch(url, { signal: AbortSignal.timeout(timeLeft(5_000)) });
  assert.equal(entry.status, 200);
  assert.match(await entry.text(), /main-summit-pavilions-review\.ts/);
  const executablePath = process.env.CHROMIUM_PATH ??
    (!existsSync(chromium.executablePath()) && existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  browser = await chromium.launch({
    headless: true, executablePath, timeout: timeLeft(20_000),
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
  });
  browserVersion = browser.version();
  context = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: 'zh-CN', reducedMotion: 'reduce' });
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
  page.on('response', response => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeLeft(22_000) });
  assert.equal(response?.status(), 200);
  const ready = await page.waitForFunction(() => window.__p9Review?.sample().frame > 0, null, { timeout: timeLeft(12_000) });
  await ready.dispose();
  await inspect('lower-cloud');
  await inspect('upper-cloud');
  assert.deepEqual(errors, [], 'P-9 browser or asset errors occurred');
}

await mkdir(output, { recursive: true });
try {
  await main();
} catch (error) {
  failure = String(error);
  if (page && !page.isClosed() && deadline - performance.now() > 1_000) {
    try { await page.screenshot({ path: path.join(output, 'aborted-scene.png'), timeout: timeLeft(3_000) }); }
    catch (captureError) { errors.push(String(captureError)); }
  }
  throw error;
} finally {
  for (const [label, close] of [
    ['context', () => context?.close()], ['browser', () => browser?.close()], ['Vite', () => server?.close()],
  ]) {
    try { await limited(`close ${label}`, Promise.resolve().then(close), 3_500); }
    catch (error) { teardownErrors.push(String(error)); }
  }
  const result = {
    head, browserVersion, viewport, elapsedMs: Math.round(performance.now() - started),
    passed: !failure && teardownErrors.length === 0, pavilions, errors, failure, teardownErrors,
    fixture: 'Isolated P-9 inspection in loopback Vite using P-1 local terrain and software WebGL.',
  };
  await writeFile(path.join(output, 'pavilion-browser.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ passed: result.passed, head, browserVersion, pavilions: pavilions.length, elapsedMs: result.elapsedMs }));
  if (!failure) assert.deepEqual(teardownErrors, [], 'A fixture process failed to close cleanly');
}
