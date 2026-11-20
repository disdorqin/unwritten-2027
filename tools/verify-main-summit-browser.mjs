import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [checkoutArg, outputArg, mode] = process.argv.slice(2);
assert.ok(checkoutArg && outputArg && (mode === undefined || mode === '--isolated' || mode === '--town'),
  'Usage: node verify-main-summit-browser.mjs <checkout> <output> [--isolated|--town]');
const townOnly = mode === '--town';
const assembled = mode === undefined;
const checkout = path.resolve(checkoutArg);
const output = path.resolve(outputArg);
const viteRoot = path.join(checkout, 'tools', 'voxel-tavern');
const viewport = townOnly ? { width: 1240, height: 816 } : { width: 640, height: 416 };
const checkoutRequire = createRequire(path.join(checkout, 'package.json'));
const fixtureRequire = createRequire(path.join(viteRoot, 'package.json'));
const { chromium } = checkoutRequire('playwright');
const { createServer } = await import(pathToFileURL(fixtureRequire.resolve('vite')).href);
const started = performance.now();
const deadline = started + (assembled || townOnly ? 255_000 : 145_000);
const evidenceTitle = townOnly ? 'main-summit-town-skyline-evidence' :
  assembled ? 'main-summit-assembly-browser-evidence' : 'main-summit-browser-evidence';
const expectedParts = ['P-1', 'P-2', 'P-3', 'P-4', 'P-7', 'P-9'];
const clusterSources = [
  ['P-1', 'main-summit-block.ts', 'a0dd7b83be27a461a177dd6032114aef96bef6d2'],
  ['P-2', 'main-summit-cable.ts'],
  ['P-3 trail', 'main-summit-trail.ts'],
  ['P-3 snow surface', 'main-summit-snow-belt.ts'],
  ['P-4', 'main-summit-registration.ts'],
  ['P-7', 'main-summit-cable-stations.ts'],
  ['P-9', 'main-summit-pavilions.ts'],
];
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
let sourceProvenance;

function git(args) {
  return execFileSync('git', args, { cwd: checkout, encoding: 'utf8', timeout: 5_000 }).trim();
}

function verifySourceProvenance() {
  const sources = townOnly ? [clusterSources[0], ['town viewer', 'viewer.ts']] : clusterSources;
  return sources.map(([part, filename, frozen]) => {
    const file = path.posix.join('tools', 'voxel-tavern', 'town-blockout', filename);
    const committedBlob = git(['rev-parse', 'HEAD:' + file]);
    assert.equal(git(['hash-object', file]), committedBlob, `Assembly has modified source for ${part}`);
    if (frozen) assert.equal(committedBlob, frozen, `P-1 height-field blob changed: ${file}`);
    return { part, file, blob: committedBlob };
  });
}

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

async function watch(page, predicate, argument, limit = assembled ? 30_000 : 12_000) {
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

async function walk(page, key, stage, predicate, argument, limit = assembled ? 40_000 : 12_000) {
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

function assertDetail(state, frontPresent, arrivalPresent, frontReleased, arrivalReleased) {
  assert.equal(state.apronPresent, frontPresent);
  assert.equal(state.arrivalDetailPresent, arrivalPresent);
  assert.equal(state.detailLayer, frontPresent ? 'front-ridge' : arrivalPresent ? 'main-summit' : null);
  assert.deepEqual(state.frontFloorDisposals, { geometry: frontReleased, material: frontReleased });
  assert.deepEqual(state.arrivalFloorDisposals, { geometry: arrivalReleased, material: arrivalReleased });
}

function assertAssembly(state) {
  if (!assembled) return;
  const { assembly } = state;
  assert.ok(assembly, 'The assembled browser did not expose the mounted world-domain state');
  assert.deepEqual(assembly.worldAnchor, { east: 300, north: 676 });
  assert.deepEqual([...assembly.mountedParts].sort(), expectedParts);
  assert.equal(assembly.lowSledTailMounted, false);
  assert.ok(Math.abs(assembly.worldFeet.east - (300 + state.east)) < .001);
  assert.ok(Math.abs(assembly.worldFeet.north - (676 + state.north)) < .001);
  assert.ok(Math.abs(assembly.worldFeet.height - state.feet) < .001);
  assert.equal(assembly.apronSeamHeight, 347);
  assert.ok(Number.isFinite(assembly.frontSnowDepth) && assembly.frontSnowDepth >= 0 && assembly.frontSnowDepth <= 1);
  assert.ok(Math.abs(assembly.summitSnowDepth - assembly.frontSnowDepth) < .000001, 'The seam has a snow-depth discontinuity');
}

function trackBrowserErrors(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
  page.on('response', response => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
}

async function townSkyline(url) {
  for (const candidate of [false, true]) {
    context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce', locale: 'zh-CN' });
    page = await context.newPage();
    trackBrowserErrors(page);
    await page.addInitScript(() => {
      window.skylineProfiles = [];
      // Capture the existing mouse-drag fallback on a headless display.
      HTMLCanvasElement.prototype.requestPointerLock = undefined;
      document.addEventListener('town-frame-profile', event => {
        if (window.skylineProfiles.length === 30) window.skylineProfiles.shift();
        window.skylineProfiles.push(event.detail);
      }, true);
    });
    const response = await page.goto(url + '?profile' + (candidate ? '&summitSkyline=on' : ''), {
      waitUntil: 'domcontentloaded', timeout: timeLeft(80_000),
    });
    assert.equal(response?.status(), 200);
    const canvas = page.locator('#scene canvas');
    await canvas.waitFor({ state: 'visible', timeout: timeLeft(35_000) });
    await page.locator('#jump').selectOption('东侧扩建步道', { timeout: timeLeft(18_000) });
    await page.waitForFunction(() => document.querySelector('#walk')?.getAttribute('aria-pressed') === 'true',
      null, { timeout: timeLeft(10_000) });
    await page.mouse.move(917, 654);
    await page.mouse.down();
    try { await page.mouse.move(398, 547, { steps: 10 }); }
    finally { await page.mouse.up(); }
    await page.evaluate(() => { window.skylineProfiles.length = 0; });
    const ready = await page.waitForFunction(candidate => {
      const profiles = window.skylineProfiles;
      if (profiles.length < 3) return false;
      return profiles.slice(-3).every(profile => profile.calls > 0 && (candidate
        ? profile.summitSkyline?.draws === 1 &&
          profile.summitSkyline.peakNdc.every(value => Number.isFinite(value) && Math.abs(value) <= 1)
        : profile.summitSkyline === undefined));
    }, candidate, { timeout: timeLeft(40_000) });
    await ready.dispose();
    const frames = await page.evaluate(() => window.skylineProfiles.slice(-3));
    const last = frames.at(-1);
    if (candidate) {
      assert.equal(last.summitSkyline.far, 2400);
      assert.ok(Math.abs(last.summitSkyline.camera[0] - 443) < .3 &&
        Math.abs(last.summitSkyline.camera[2] + 221) < .3, 'The candidate used a different town vantage');
      assert.ok(Math.abs(last.cameraY - views[0].frames.at(-1).cameraY) < .001, 'The town eye position shifted');
    }
    const file = `skyline-${candidate ? 'candidate' : 'baseline'}.png`;
    await canvas.screenshot({ path: path.join(output, file), timeout: timeLeft(16_000) });
    views.push({ candidate, viewpoint: '东侧扩建步道', file, frames });
    await limited('close skyline context', context.close(), timeLeft(8_000));
    context = undefined;
    page = undefined;
  }
  assert.deepEqual(errors, [], 'The town browser reported a page or resource error');
}

async function walkCloudStation() {
  const from = await button(page, 'cloud-station', 'gate');
  assertAssembly(from);
  assert.ok(Math.abs(from.east - 36) < .01 && Math.abs(from.north + 36) < .01,
    'P-11 did not start at the front cable surveyed terminal');
  assert.ok(Math.abs(from.feet - 347) < .01 && from.gateMounted);
  await page.screenshot({ path: path.join(output, 'cloud-terminal-start.png'), timeout: timeLeft(8_000) });
  walkthroughImages.push({ file: 'cloud-terminal-start.png', state: from });

  const bend = await walk(page, 'w', 'walk from front terminal to the terrace corner',
    () => window.__p1Review.getState().north >= -14.5);
  assert.ok(Math.abs(bend.east - 36) < .01 && bend.north <= -13);
  const approach = await walk(page, 'a', 'walk the front terrace across to the gate center',
    () => window.__p1Review.getState().east <= .4);
  assert.ok(approach.east >= -.6 && Math.abs(approach.north - bend.north) < .001);
  const interior = await walk(page, 'w', 'cross the assembled gate from the front terminal',
    () => window.__p1Review.getState().frontierReached);
  assertAssembly(interior);
  assert.ok(interior.north >= 20 && interior.gateMounted);
  assert.equal(interior.seamCrossings - from.seamCrossings, 1);
  assert.ok(interior.arrivalDetailPresent && !interior.apronPresent);
  await page.screenshot({ path: path.join(output, 'cloud-terminal-gate-interior.png'), timeout: timeLeft(8_000) });
  walkthroughImages.push({ file: 'cloud-terminal-gate-interior.png', state: interior });

  const outside = await walk(page, 's', 'walk back through the gate to the terrace',
    () => window.__p1Review.getState().returned);
  assertAssembly(outside);
  assert.ok(outside.north <= -14 && outside.north >= -15 && !outside.gateMounted);
  assert.ok(outside.apronPresent && !outside.arrivalDetailPresent);
  assert.equal(outside.seamCrossings - from.seamCrossings, 2);
  assert.equal(outside.gateGeometryDisposals - from.gateGeometryDisposals, 3);
  assert.equal(outside.gateMaterialDisposals - from.gateMaterialDisposals, 1);
  assert.deepEqual(outside.layerTransitions.slice(-2).map(({ from, to }) => [from, to]),
    [['front-ridge', 'main-summit'], ['main-summit', 'front-ridge']]);
  assert.equal(outside.layerTransitions.length - from.layerTransitions.length, 2);
  assert.ok(outside.layerTransitions.slice(-2).every(change =>
    change.coarseRendered && change.activeDetailRendered && change.gateMounted && change.draws > 0));
  const returnBend = await walk(page, 'd', 'return across the terrace after gate disposal',
    () => window.__p1Review.getState().east >= 35.6);
  assert.ok(returnBend.east <= 37 && Math.abs(returnBend.north - outside.north) < .001);
  const terminal = await walk(page, 's', 'return to the exact front terminal side',
    () => window.__p1Review.getState().north <= -35.5);
  assertAssembly(terminal);
  assert.ok(terminal.north >= -37 && Math.abs(terminal.east - 36) <= .6 &&
    Math.abs(terminal.feet - 347) < .01 && !terminal.gateMounted && terminal.coarsePresent);
  assert.ok(terminal.maxAcceptedStep <= .43, 'The front terminal route exceeded its standing step allowance');
  await page.screenshot({ path: path.join(output, 'cloud-terminal-return.png'), timeout: timeLeft(8_000) });
  walkthroughImages.push({ file: 'cloud-terminal-return.png', state: terminal });
  stages.push({ stage: 'P-11 exact front terminal on-foot round trip', from, approach, interior, outside, terminal });
}

async function main() {
  if (assembled || townOnly) sourceProvenance = verifySourceProvenance();
  server = await limited('Vite initialization', createServer({
    root: viteRoot, configFile: path.join(viteRoot, 'vite.config.ts'),
    optimizeDeps: { noDiscovery: true, include: [] },
    logLevel: 'warn', server: { host: '127.0.0.1', port: 0, strictPort: true, hmr: false },
  }), timeLeft(20_000));
  await limited('Vite listen', server.listen(), timeLeft(15_000));
  const address = server.httpServer.address();
  assert.notEqual(typeof address, 'string');
  assert.equal(address.address, '127.0.0.1');
  const entry = townOnly ? 'town-blockout' : 'main-summit-review';
  const url = `http://127.0.0.1:${address.port}/${entry}.html`;
  const source = await fetch(url, { signal: AbortSignal.timeout(timeLeft(5_000)) });
  assert.equal(source.status, 200);
  assert.ok((await source.text()).includes(townOnly ? '/viewer.ts' : '/main-summit-review.ts'));

  const executablePath = process.env.CHROMIUM_PATH ??
    (!existsSync(chromium.executablePath()) && existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  browser = await chromium.launch({
    headless: true, executablePath, timeout: timeLeft(20_000),
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
  });
  browserVersion = browser.version();
  if (townOnly) return townSkyline(url);
  context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce', locale: 'zh-CN' });
  page = await context.newPage();
  trackBrowserErrors(page);
  const response = await page.goto(url, {
    waitUntil: 'domcontentloaded', timeout: timeLeft(assembled ? 35_000 : 22_000),
  });
  assert.equal(response?.status(), 200);
  await watch(page, () => window.__p1Review?.getState().frame > 1, null, assembled ? 35_000 : 14_000);

  const initial = await button(page, 'gate', 'gate');
  assert.equal(initial.gateMounted, true);
  assert.equal(initial.gateMeshes, 3);
  assert.ok(initial.coarsePresent);
  assertAssembly(initial);
  assertDetail(initial, true, false, 0, 0);
  assert.equal(initial.layerTransitions.length, 0);
  assert.ok(Math.abs(initial.east) < .01 && Math.abs(initial.north + 14) < .01);
  assert.ok(Math.abs(initial.feet - 347) < .01);
  await page.screenshot({ path: path.join(output, 'gate-approach.png'), timeout: timeLeft(8_000) });
  walkthroughImages.push({ file: 'gate-approach.png', state: initial });
  const offset = await walk(page, 'd', 'move to the side of the gate', () => window.__p1Review.getState().east >= 2.375);
  const blocked = await walk(page, 'w', 'stop at the side jamb', before => {
    const state = window.__p1Review.getState();
    return state.blocked > before && state.lastBlock === 'gate';
  }, offset.blocked);
  assert.ok(blocked.east > 2 && blocked.north <= -10 && blocked.north >= -11);
  assert.ok(blocked.wallClearance >= 0 && !blocked.frontierReached);
  assertDetail(blocked, true, false, 0, 0);
  assertAssembly(blocked);
  assert.equal(blocked.layerTransitions.length, 0);
  const around = await walk(page, 'd', 'move beyond the outer jamb', () => window.__p1Review.getState().east >= 4.25);
  const bypass = await walk(page, 'w', 'refuse a crossing beyond the jamb', before => {
    const state = window.__p1Review.getState();
    return state.blocked > before && state.lastBlock === 'aperture';
  }, around.blocked);
  assert.ok(bypass.east >= 4.25 && bypass.north < -10 && bypass.north > -10.3);
  assert.ok(bypass.wallClearance > .3 && !bypass.frontierReached);
  assert.equal(bypass.seamCrossings, 0);
  assert.equal(bypass.layerTransitions.length, 0);
  assertDetail(bypass, true, false, 0, 0);
  assertAssembly(bypass);
  await walk(page, 's', 'clear the front of the jamb', () => window.__p1Review.getState().north <= -10.6);
  await walk(page, 'a', 'recover into the clear center', () => Math.abs(window.__p1Review.getState().east) <= .20);
  const interior = await walk(page, 'w', 'walk through the gate to the arrival plateau',
    () => window.__p1Review.getState().frontierReached);
  assert.ok(interior.north >= 20 && interior.gateMounted);
  assert.ok(Math.abs(interior.feet - 347) < .01 && interior.accepted > initial.accepted);
  assert.equal(interior.seamCrossings - initial.seamCrossings, 1);
  assertDetail(interior, false, true, 1, 0);
  assertAssembly(interior);
  assert.equal(interior.layerTransitions.length, 1);
  await page.screenshot({ path: path.join(output, 'arrival-plateau.png'), timeout: timeLeft(8_000) });
  walkthroughImages.push({ file: 'arrival-plateau.png', state: interior });

  const outside = await walk(page, 's', 'return on foot and unload the gate',
    () => window.__p1Review.getState().returned);
  assert.ok(outside.north <= -14 && outside.coarsePresent);
  assertDetail(outside, true, false, 1, 1);
  assertAssembly(outside);
  assert.ok(Math.abs(outside.feet - 347) < .01);
  assert.equal(outside.seamCrossings - initial.seamCrossings, 2);
  assert.ok(outside.maxAcceptedStep <= .01, 'The traversal changed support height at the terrace seam');
  assert.equal(outside.gateMounted, false);
  assert.equal(outside.gateMeshes, 0);
  assert.equal(outside.gateGeometryDisposals - initial.gateGeometryDisposals, 3);
  assert.equal(outside.gateMaterialDisposals - initial.gateMaterialDisposals, 1);
  assert.equal(outside.coarseGeometryDisposals, initial.coarseGeometryDisposals);
  assert.equal(outside.coarseMaterialDisposals, initial.coarseMaterialDisposals);
  if (!assembled) assert.ok(outside.geometries <= initial.geometries, 'The unloaded gate retains extra renderer geometries');
  const transitions = outside.layerTransitions;
  assert.equal(transitions.length, 2);
  assert.deepEqual(transitions.map(({ from, to }) => [from, to]),
    [['front-ridge', 'main-summit'], ['main-summit', 'front-ridge']]);
  assert.deepEqual(transitions.map(({ frontPresent, arrivalDetailPresent }) => [frontPresent, arrivalDetailPresent]),
    [[false, true], [true, false]]);
  assert.ok(transitions[0].frame > initial.frame && transitions[1].frame > transitions[0].frame);
  for (const transition of transitions) {
    assert.ok(transition.coarsePresent && transition.gateMounted && transition.draws > 0 && transition.triangles > 0,
      'A detail-layer transition did not produce a rendered frame with the retained coarse object and gate');
    if (assembled) assert.ok(transition.coarseRendered && transition.activeDetailRendered,
      'The assembled transition did not render both the retained coarse mesh and its incoming detail');
  }
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

  if (assembled && await page.locator('#view-cluster').count()) {
    const overview = await button(page, 'view-cluster', 'cluster');
    assertAssembly(overview);
    assert.ok(overview.draws > 0 && overview.triangles > 0);
    const file = 'assembled-summit-overview.png';
    await page.screenshot({ path: path.join(output, file), timeout: timeLeft(8_000) });
    views.push({ heading: 'cluster', file, state: overview });
  }

  const reentered = await button(page, 'remount', 'gate');
  assert.ok(reentered.gateMounted && reentered.coarsePresent && !reentered.returned);
  assert.equal(reentered.gateMeshes, initial.gateMeshes);
  assert.equal(reentered.gateGeometryDisposals, outside.gateGeometryDisposals);
  assert.equal(reentered.gateMaterialDisposals, outside.gateMaterialDisposals);
  if (!assembled) assert.ok(reentered.geometries <= initial.geometries, 'Remount retained extra renderer geometries');
  assertDetail(reentered, true, false, 1, 1);
  assert.deepEqual(reentered.layerTransitions, transitions);
  let beforeDisposal = reentered;
  if (assembled) {
    await walkCloudStation();
    beforeDisposal = await button(page, 'remount', 'gate');
    assertAssembly(beforeDisposal);
    assert.ok(beforeDisposal.gateMounted && beforeDisposal.gateMeshes === initial.gateMeshes);
  }
  await page.locator('#dispose').click({ timeout: timeLeft(5_000) });
  const disposed = await watch(page, () => window.__p1Review.getState().disposed);
  assert.ok(!disposed.gateMounted && !disposed.coarsePresent);
  assertDetail(disposed, false, false, beforeDisposal.frontFloorDisposals.geometry + 1,
    beforeDisposal.arrivalFloorDisposals.geometry);
  assert.deepEqual(disposed.layerTransitions, beforeDisposal.layerTransitions);
  assert.equal(disposed.gateGeometryDisposals - beforeDisposal.gateGeometryDisposals, 3);
  assert.equal(disposed.gateMaterialDisposals - beforeDisposal.gateMaterialDisposals, 1);
  assert.equal(disposed.coarseGeometryDisposals - beforeDisposal.coarseGeometryDisposals, 1);
  assert.equal(disposed.coarseMaterialDisposals - beforeDisposal.coarseMaterialDisposals, 1);
  await limited('post-disposal frame verification', page.evaluate(() =>
    new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))), timeLeft(3_000));
  assert.equal((await getState(page)).frame, disposed.frame, 'The disposed viewer still advances its render loop');
  stages.push({ stage: 'mount, return, remount, dispose', initial, outside, reentered, disposed });
  assert.deepEqual(errors, [], 'The browser reported a page or resource error');
}

await mkdir(output, { recursive: true });
const head = git(['rev-parse', 'HEAD']);
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
    head, browserVersion, viewport, sourceProvenance, milliseconds: Math.round(performance.now() - started),
    passed: !failure && teardownErrors.length === 0,
    fixture: townOnly
      ? 'Normal town viewer at the eastern expansion path with matching baseline and opt-in skyline camera input. Loopback software WebGL.'
      : assembled
        ? 'Mounted P-1/2/3/4/7/9 candidate cluster over Vite loopback, with the declared world translation. Software WebGL. No production or multiplayer connection.'
        : 'Isolated P-1 local terrain module over Vite loopback. Software WebGL. No production or multiplayer connection.',
    stages, views, walkthroughImages, abortImage, errors, failure, teardownErrors,
  };
  await writeFile(path.join(output, evidenceTitle + '.json'), JSON.stringify(evidence, null, 2) + '\n');
  if (!failure) assert.deepEqual(teardownErrors, [], 'A fixture process failed to close cleanly');
  console.log(JSON.stringify({ passed: evidence.passed, head, browserVersion, stages: stages.length,
    directions: views.length, milliseconds: evidence.milliseconds }));
}
