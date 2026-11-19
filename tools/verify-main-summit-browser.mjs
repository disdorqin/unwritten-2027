import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [checkoutArg, outputArg] = process.argv.slice(2);
assert.ok(checkoutArg && outputArg, 'Usage: node verify-main-summit-browser.mjs <checkout> <output>');
const checkout = path.resolve(checkoutArg);
const output = path.resolve(outputArg);
const viteRoot = path.join(checkout, 'tools', 'voxel-tavern');
const viewport = { width: 640, height: 416 };
const checkoutRequire = createRequire(path.join(checkout, 'package.json'));
const fixtureRequire = createRequire(path.join(viteRoot, 'package.json'));
const { chromium } = checkoutRequire('playwright');
const { createServer } = await import(pathToFileURL(fixtureRequire.resolve('vite')).href);
const started = performance.now();
const deadline = started + 145_000;
const stages = [];
const views = [];
const walkthroughImages = [];
const errors = [];
const teardownErrors = [];
let server;
let browser;
let context;
let page;
let failure;
let browserVersion;
let abortImage;

async function limited(label, promise, duration) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} exceeded ${duration} ms`)), duration);
    })]);
  } finally {
    clearTimeout(timer);
  }
}

function timeLeft(limit) {
  const remaining = Math.floor(deadline - performance.now());
  assert.ok(remaining > 0, 'P-1 browser evidence exceeded its runtime budget');
  return Math.min(remaining, limit);
}

const getState = page => page.evaluate(() => window.__p1Review.getState());

async function watch(page, predicate, argument, limit = 12_000) {
  const result = await page.waitForFunction(predicate, argument, { timeout: timeLeft(limit) });
  await result.dispose();
  return getState(page);
}

async function afterFrames(page, lastFrame, additional = 2) {
  return watch(page, ({ lastFrame, additional }) =>
    window.__p1Review.getState().frame >= lastFrame + additional, { lastFrame, additional });
}

async function button(page, id, view) {
  const { frame } = await getState(page);
  await page.locator('#' + id).click({ timeout: timeLeft(5_000) });
  return watch(page, ({ view, frame }) => {
    const state = window.__p1Review.getState();
    return state.view === view && state.frame >= frame + 2;
  }, { view, frame });
}

async function walk(page, key, stage, predicate, argument, limit = 12_000) {
  const before = await getState(page);
  let observed;
  await page.keyboard.down(key);
  try {
    observed = await watch(page, predicate, argument, limit);
  } catch (error) {
    stages.push({ stage, key, before, stoppedAt: await getState(page), error: String(error) });
    throw error;
  } finally {
    await page.keyboard.up(key);
  }
  const after = await afterFrames(page, observed.frame);
  assert.ok(after.frame > before.frame, `${stage} did not advance a rendered frame`);
  stages.push({ stage, key, before, observed, after });
  return after;
}

async function main() {
  server = await limited('Vite initialization', createServer({
    root: viteRoot, configFile: path.join(viteRoot, 'vite.config.ts'),
    optimizeDeps: { noDiscovery: true, include: [] },
    logLevel: 'warn', server: { host: '127.0.0.1', port: 0, strictPort: true, hmr: false },
  }), timeLeft(20_000));
  await limited('Vite listen', server.listen(), timeLeft(15_000));
  const address = server.httpServer.address();
  assert.notEqual(typeof address, 'string');
  assert.equal(address.address, '127.0.0.1');
  const url = `http://127.0.0.1:${address.port}/main-summit-review.html`;
  const source = await fetch(url, { signal: AbortSignal.timeout(timeLeft(5_000)) });
  assert.equal(source.status, 200);
  assert.match(await source.text(), /main-summit-review\.ts/);

  const executablePath = process.env.CHROMIUM_PATH ??
    (!existsSync(chromium.executablePath()) && existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  browser = await chromium.launch({
    headless: true, executablePath, timeout: timeLeft(20_000),
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
  });
  browserVersion = browser.version();
  context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce', locale: 'zh-CN' });
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
  page.on('response', response => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  const response = await page.goto(url, {
    waitUntil: 'domcontentloaded', timeout: timeLeft(22_000),
  });
  assert.equal(response?.status(), 200);
  await watch(page, () => window.__p1Review?.getState().frame > 1, null, 14_000);

  const initial = await button(page, 'gate', 'gate');
  assert.equal(initial.gateMounted, true);
  assert.equal(initial.gateMeshes, 3);
  assert.ok(initial.apronPresent && initial.coarsePresent);
  assert.ok(Math.abs(initial.east) < .01 && Math.abs(initial.north + 14) < .01);
  assert.ok(Math.abs(initial.feet - 347) < .01);
  const offset = await walk(page, 'd', 'move to the side of the gate', () => window.__p1Review.getState().east >= 2.375);
  const blocked = await walk(page, 'w', 'stop at the side jamb', before => {
    const state = window.__p1Review.getState();
    return state.blocked > before && state.lastBlock === 'gate';
  }, offset.blocked);
  assert.ok(blocked.east > 2 && blocked.north <= -10 && blocked.north >= -11);
  assert.ok(blocked.wallClearance >= 0 && !blocked.frontierReached);
  await walk(page, 'a', 'recover into the clear center', () => Math.abs(window.__p1Review.getState().east) <= .20);
  const interior = await walk(page, 'w', 'walk through the gate to the arrival plateau',
    () => window.__p1Review.getState().frontierReached);
  assert.ok(interior.north >= 20 && interior.gateMounted);
  assert.ok(Math.abs(interior.feet - 347) < .01 && interior.accepted > initial.accepted);
  assert.equal(interior.seamCrossings - initial.seamCrossings, 1);
  await page.screenshot({ path: path.join(output, 'arrival-plateau.png'), timeout: timeLeft(8_000) });
  walkthroughImages.push({ file: 'arrival-plateau.png', state: interior });

  const outside = await walk(page, 's', 'return on foot and unload the gate',
    () => window.__p1Review.getState().returned);
  assert.ok(outside.north <= -14 && outside.coarsePresent && outside.apronPresent);
  assert.ok(Math.abs(outside.feet - 347) < .01);
  assert.equal(outside.seamCrossings - initial.seamCrossings, 2);
  assert.ok(outside.maxAcceptedStep <= .01, 'The traversal changed support height at the terrace seam');
  assert.equal(outside.gateMounted, false);
  assert.equal(outside.gateMeshes, 0);
  assert.equal(outside.gateGeometryDisposals - initial.gateGeometryDisposals, 3);
  assert.equal(outside.gateMaterialDisposals - initial.gateMaterialDisposals, 1);
  assert.equal(outside.coarseGeometryDisposals, initial.coarseGeometryDisposals);
  assert.equal(outside.coarseMaterialDisposals, initial.coarseMaterialDisposals);
  assert.ok(outside.geometries <= initial.geometries, 'The unloaded gate retains extra renderer geometries');
  await page.screenshot({ path: path.join(output, 'outside-return.png'), timeout: timeLeft(8_000) });
  walkthroughImages.push({ file: 'outside-return.png', state: outside });

  for (const heading of ['north', 'east', 'south', 'west']) {
    const state = await button(page, 'view-' + heading, heading);
    assert.ok(state.coarseVisible && state.coarsePresent && state.draws > 0 && state.triangles > 0);
    const file = `summit-${heading}.png`;
    await page.screenshot({ path: path.join(output, file), timeout: timeLeft(8_000) });
    const after = await getState(page);
    assert.deepEqual(after.camera, state.camera, `Camera shifted during the ${heading} capture`);
    views.push({ heading, file, state, after });
  }

  const reentered = await button(page, 'remount', 'gate');
  assert.ok(reentered.gateMounted && reentered.coarsePresent && !reentered.returned);
  assert.equal(reentered.gateMeshes, initial.gateMeshes);
  assert.equal(reentered.gateGeometryDisposals, outside.gateGeometryDisposals);
  assert.equal(reentered.gateMaterialDisposals, outside.gateMaterialDisposals);
  assert.ok(reentered.geometries <= initial.geometries, 'Remount retained extra renderer geometries');
  await page.locator('#dispose').click({ timeout: timeLeft(5_000) });
  const disposed = await watch(page, () => window.__p1Review.getState().disposed);
  assert.ok(!disposed.gateMounted && !disposed.apronPresent && !disposed.coarsePresent);
  assert.equal(disposed.gateGeometryDisposals - outside.gateGeometryDisposals, 3);
  assert.equal(disposed.gateMaterialDisposals - outside.gateMaterialDisposals, 1);
  assert.equal(disposed.coarseGeometryDisposals - outside.coarseGeometryDisposals, 1);
  assert.equal(disposed.coarseMaterialDisposals - outside.coarseMaterialDisposals, 1);
  await limited('post-disposal frame verification', page.evaluate(() =>
    new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))), timeLeft(3_000));
  assert.equal((await getState(page)).frame, disposed.frame, 'The disposed viewer still advances its render loop');
  stages.push({ stage: 'mount, return, remount, dispose', initial, outside, reentered, disposed });
  assert.deepEqual(errors, [], 'The browser reported a page or resource error');
}

await mkdir(output, { recursive: true });
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: checkout, encoding: 'utf8', timeout: 3_000 }).trim();
try {
  await main();
} catch (error) {
  failure = String(error);
  if (page && !page.isClosed() && deadline - performance.now() > 1_000) {
    try {
      await page.screenshot({ path: path.join(output, 'aborted-scene.png'), timeout: timeLeft(3_000) });
      abortImage = 'aborted-scene.png';
    } catch (captureError) {
      errors.push(`Abort capture failed: ${String(captureError)}`);
    }
  }
  throw error;
} finally {
  for (const [label, close] of [
    ['context', () => context?.close()], ['browser', () => browser?.close()], ['Vite', () => server?.close()],
  ]) {
    try { await limited(`close ${label}`, Promise.resolve().then(close), 3_500); }
    catch (error) { teardownErrors.push(String(error)); }
  }
  const evidence = {
    head, browserVersion, viewport, milliseconds: Math.round(performance.now() - started),
    passed: !failure && teardownErrors.length === 0,
    fixture: 'Isolated P-1 local terrain module over Vite loopback. Software WebGL. No production or multiplayer connection.',
    stages, views, walkthroughImages, abortImage, errors, failure, teardownErrors,
  };
  await writeFile(path.join(output, 'main-summit-browser-evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
  if (!failure) assert.deepEqual(teardownErrors, [], 'A fixture process failed to close cleanly');
  console.log(JSON.stringify({ passed: evidence.passed, head, browserVersion, stages: stages.length,
    directions: views.length, milliseconds: evidence.milliseconds }));
}
