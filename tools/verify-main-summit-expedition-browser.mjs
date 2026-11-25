import assert from 'node:assert/strict';
import { createServer as createHttpServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [source, evidence] = process.argv.slice(2);
assert.ok(source && evidence, 'Usage: node tools/verify-main-summit-expedition-browser.mjs <checkout> <D-drive-evidence>');
const checkout = path.resolve(source);
const out = path.resolve(evidence);
assert.ok(/^[dD]:[/\\]/.test(out), 'Browser proofs must be written to D:, not C:');
const requireFromRoot = createRequire(path.join(checkout, 'package.json'));
const { chromium } = requireFromRoot('playwright');
const { createServer } = await import(pathToFileURL(requireFromRoot.resolve('vite')).href);
const staticDir = process.env.EXPEDITION_BUILT_DIR && path.resolve(process.env.EXPEDITION_BUILT_DIR);
const started = performance.now();
const errors = [];
const captures = [];
const stats = [];
const events = [];
let browser, page, context, server;
let failure;
let modelBudget;
let voxelCount;
let siteCount;
const git = (...args) => execFileSync('git', args, { cwd: checkout, encoding: 'utf8' }).trim();
const getState = () => page.evaluate(() => window.__expeditionReview.getState());
const waitState = (predicate, timeout = 16_000) =>
  page.waitForFunction(predicate, { timeout });

async function screenshot(name) {
  const state = await getState();
  const file = name + '.png';
  await page.screenshot({ path: path.join(out, file), timeout: 16_000 });
  captures.push({ file, state: {
    selectedId: state.selectedId, night: state.night,
    renders: state.renderCalls, triangles: state.triangles,
    position: state.player, walkedMetres: state.walkedMetres,
  } });
  return state;
}
async function jump(index) {
  await page.keyboard.press(String(index + 1));
  const state = await getState();
  assert.equal(state.selectedIndex, index);
  return state;
}
async function walkForward(metres, timeout = 20_000) {
  const start = (await getState()).walkedMetres;
  await page.keyboard.down('w');
  try {
    await page.waitForFunction(goal =>
      window.__expeditionReview.getState().walkedMetres >= goal,
      start + metres, { timeout });
  } finally {
    await page.keyboard.up('w');
  }
  return getState();
}
async function action(key, kind) {
  await page.keyboard.press(key);
  const current = await getState();
  assert.equal(current.lastInteraction?.accepted, true,
    'Story action ' + kind + ' at ' + current.selectedId + ': ' + JSON.stringify(current.lastInteraction));
  assert.equal(current.lastInteraction.action, kind);
  events.push({ id: current.selectedId, action: kind, copy: current.lastInteraction.copy });
  return current;
}

await mkdir(out, { recursive: true });
try {
  const root = path.join(checkout, 'tools', 'voxel-tavern');
  if (staticDir) {
    assert.ok(existsSync(path.join(staticDir, 'main-summit-expedition-review.html')));
    const sirv = requireFromRoot('sirv');
    const http = createHttpServer(sirv(staticDir, { dev: false, single: false }));
    server = { httpServer: http, close: () => new Promise((resolve, reject) =>
      http.close(error => error ? reject(error) : resolve())) };
    await new Promise((resolve, reject) => http.once('error', reject).listen(0, '127.0.0.1', resolve));
  } else {
    server = await createServer({
      root, configFile: path.join(root, 'vite.config.ts'),
      cacheDir: path.join(out, '.vite-cache'),
      optimizeDeps: { noDiscovery: true, include: [] },
      logLevel: 'warn', server: { host: '127.0.0.1', port: 0, hmr: false,
        fs: { allow: [checkout] } },
    });
    await server.listen();
  }
  const port = server.httpServer.address().port;
  const executablePath = process.env.CHROMIUM_PATH ?? (existsSync(chromium.executablePath())
    ? undefined : 'C:/Program Files/Google/Chrome/Application/chrome.exe');
  browser = await chromium.launch({
    headless: true, executablePath,
    args: process.platform === 'win32' ? ['--use-gl=angle', '--use-angle=d3d11']
      : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  context = await browser.newContext({ viewport: { width: 1160, height: 760 },
    deviceScaleFactor: 1, locale: 'zh-CN', reducedMotion: 'reduce' });
  page = await context.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push('console:' + m.text()); });
  page.on('pageerror', error => errors.push('page:' + error.message));
  page.on('requestfailed', request => errors.push('request:' + request.url() + ':' + request.failure()?.errorText));
  page.on('response', response => {
    if (response.status() >= 400) errors.push('http:' + response.status() + ':' + response.url());
  });
  const response = await page.goto(
    `http://127.0.0.1:${port}/main-summit-expedition-review.html?proof=1`,
    { waitUntil: 'domcontentloaded', timeout: 30_000 });
  assert.equal(response.status(), 200);
  await page.waitForFunction(() => window.__expeditionReview?.getState().frame > 3, { timeout: 30_000 });
  const initial = await getState();
  modelBudget = initial.modelBudget;
  voxelCount = initial.voxelCount;
  siteCount = initial.siteCount;
  assert.ok(initial.voxelCount > 2500, 'This review must render actual detailed models, not placeholders');
  assert.ok(initial.voxelDrawBudget <= 23, 'All expedition and bell voxels must remain instanced');
  assert.ok(initial.modelBudget.draws <= 150,
    'All authored expedition/bench/waymark/puzzle meshes together exceed the 150 draw ceiling');
  assert.ok(initial.modelBudget.triangles <= 120_000,
    'All authored expedition meshes together exceed the 120k triangle ceiling');
  assert.equal(initial.lights, 17, 'Six expedition, two workshop and nine cloud-bell lamps exist');
  assert.ok(initial.signs.length >= 7);
  assert.equal(initial.bellCount, 9);
  assert.equal(initial.realSignTextures, true, 'Actual canvas-backed Chinese signs are required');
  assert.deepEqual(initial.mainParts.length, 7);
  assert.ok(initial.siteCount > 45);
  assert.deepEqual(initial.playableProps, {
    movingStarFragments: 3, hearthLogs: 6, ropeAnchors: 6,
    mechanicalInspectionMarks: 2, yearStampCount: 1,
  }, 'R6 must include real moving scene models, not only copied story text');
  assert.equal(initial.selectedId, 'expedition-cable-machine-room');
  for (let index = 0; index < 6; index++) {
    const before = await jump(index);
    const name = ['machine', 'cloud-shelter', 'ice-shelter', 'watch-ruins', 'icefall', 'summit-flag'][index];
    await page.waitForFunction(() => {
      const r = window.__expeditionReview.getState().reference;
      return r.complete && r.naturalWidth > 0;
    }, { timeout: 14_000 });
    const day = await screenshot('zd-main-' + (index + 1) + '-' + name + '-day');
    assert.equal(day.night, false);
    assert.ok(day.renderCalls > 0 && day.triangles > 0);
    await page.keyboard.press('n');
    const night = await screenshot('zd-main-' + (index + 1) + '-' + name + '-night');
    assert.equal(night.night, true);
    assert.ok(night.renderCalls <= 350 && night.triangles <= 260_000,
      'Single-frame main summit art is outside the review performance budget');
    await page.keyboard.press('n');
    assert.equal((await getState()).night, false);

    // Use the actual first-person walking controls. The model must remain
    // approachable and story triggers must be reachable, not decorative only.
    const approached = await walkForward(index === 0 ? 4.3 : index === 3 ? 4.2 : 6.2, 18_000);
    assert.ok(approached.walkedMetres > 4, name + ' has no genuine walkable approach');
    await screenshot('zd-main-' + (index + 1) + '-' + name + '-approach');
    await action('v', 'view');
    await action('l', 'listen');
    await action('e', 'touch');
    const siteId = (await getState()).selectedId;
    const totalTouches = [3, 3, 3, 3, 6, 1][index];
    for (let step = 1; step < totalTouches; step++) await action('e', 'touch');
    const after = await getState();
    assert.equal(after.interactions[siteId]?.touches, totalTouches);
    assert.equal(after.physicalStory[siteId]?.touched, totalTouches);
    assert.equal(after.physicalStory[siteId]?.appearanceChanged, true,
      'E must move real meshes, reveal models or change an inspection fixture');
    await screenshot('zd-main-' + (index + 1) + '-' + name + '-activated');
    stats.push({
      name, reference: after.reference.src, initial: before.player,
      approach: after.player, metres: after.walkedMetres,
      rejected: after.rejectedWalk, dayDraws: day.renderCalls,
      nightDraws: night.renderCalls, dayTris: day.triangles,
      nightTris: night.triangles,
      touch: after.interactions[after.selectedId]?.touches,
    });
  }
  assert.equal(events.length, 31, 'Six V/L plus 19 actual E story actions must run');
  await jump(6);
  const bellDay = await screenshot('zd-main-7-cloud-nine-bells-day');
  assert.equal(bellDay.selectedId, 'cloud-bell-1');
  await page.keyboard.press('n');
  await screenshot('zd-main-7-cloud-nine-bells-night');
  await page.keyboard.press('n');
  const atFirstBell = await walkForward(1.7);
  assert.ok(atFirstBell.walkedMetres >= 1.7);
  await screenshot('zd-main-7-cloud-first-bell-approach');
  await action('v', 'view');
  await action('l', 'listen');
  await action('e', 'touch');
  for (const span of [380,720,380]) {
    await page.waitForTimeout(span);
    await action('e', 'touch');
  }
  const locked = await getState();
  assert.equal(locked.bellState.finished, true, 'Real keyboard rhythm must unlock the nine-lamp relay');
  await page.waitForTimeout(6400);
  const after = await getState();
  assert.equal(after.bellState.lit, 9);
  await page.keyboard.press('n');
  await screenshot('zd-main-7-all-nine-bells-lit-night');
  await page.keyboard.press('n');
  assert.equal(events.length, 37, 'The first bell adds two observations and four actual keyboard strikes');
  assert.deepEqual(errors, []);
} catch (error) {
  failure = String(error);
} finally {
  const teardownErrors = [];
  for (const [name, close] of [['context', () => context?.close()],
    ['browser', () => browser?.close()], ['server', () => server?.close()]]) {
    try { await close(); } catch (error) { teardownErrors.push(name + ': ' + String(error)); }
  }
  const summary = {
    passed: !failure && !errors.length && !teardownErrors.length,
    head: git('rev-parse', 'HEAD'), built: Boolean(staticDir),
    modelBudget, voxelCount, siteCount,
    elapsedMs: Math.round(performance.now() - started), captured: captures.length,
    captures, stats, events, errors, teardownErrors, failure,
  };
  await writeFile(path.join(out, 'expedition-native-review.json'),
    JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({
    passed: summary.passed, head: summary.head, built: summary.built,
    elapsedMs: summary.elapsedMs, screenshots: summary.captured,
    modelBudget, voxelCount, siteCount,
    stats: summary.stats, errors, teardownErrors, failure,
  }));
  if (!summary.passed) process.exitCode = 1;
}
