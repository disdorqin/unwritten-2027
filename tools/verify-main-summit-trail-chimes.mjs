import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const checkout = fileURLToPath(new URL('../', import.meta.url));
const root = path.join(checkout, 'tools', 'voxel-tavern');
const output = process.argv[2] && path.resolve(process.argv[2]);
assert.ok(output, 'Usage: node tools/verify-main-summit-trail-chimes.mjs OUTPUT');
await mkdir(output, { recursive: true });
const requireRoot = createRequire(path.join(checkout, 'package.json'));
const requireVite = createRequire(path.join(root, 'package.json'));
const vite = path.resolve(path.dirname(requireVite.resolve('vite/package.json')), 'dist/node/index.js');
const { build, preview } = await import(pathToFileURL(vite));
const { chromium } = requireRoot('@playwright/test');

const entry = 'main-summit-trails-review.html';
const viewport = { width: 800, height: 520 };
const report = {
  source: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: checkout, encoding: 'utf8' }).trim(),
  status: 'failed', viewport, input: 'Native clicks enable audio and change modes. Hold W to walk and press E to mount.',
  errors: [], checks: [], screenshots: [],
};
let server, browser, page, outDir;

const snapshot = () => page.evaluate(() => window.p3.snapshot());
const advance = ms => page.evaluate(duration => window.p3.advance(duration), ms);

function quiet(state, rings) {
  assert.equal(state.chime.site, null, 'No chime source should target an inactive route section');
  assert.equal(state.chime.playing, false, 'Audio must stop outside active cloud travel');
  assert.equal(state.chime.rings, rings, 'No new chime should ring outside active cloud travel');
}

function audible(state, distance, previousRings) {
  const { ready, playing, rings, site } = state.chime;
  assert.equal(ready, true);
  assert.ok(playing && rings > previousRings, 'An unlocked browser should play a new chime');
  assert.ok(site && [site.east, site.north, site.height, site.metres].every(Number.isFinite));
  assert.ok(state.position.height >= 380 && state.position.height <= 560);
  assert.ok(site.height >= 380 && site.height <= 562, 'The bell hangs just above its cloud-trail anchor');
  assert.ok(site.metres > distance, 'The active chime should be ahead along the route');
}

function record(label, state) {
  const { mode, position, walk, sled, chime, render } = state;
  report.checks.push({ label, mode, position, walkDistance: walk.distance, sled, chime, render });
}

async function shot(filename, state) {
  assert.ok(state.render.draws > 0 && state.render.triangles > 0, 'The route must render before capture');
  await page.screenshot({ path: path.join(output, filename), timeout: 20_000 });
  report.screenshots.push(filename);
}

async function selectSled(rings) {
  await page.locator('[data-p3-action="sled"]').click();
  const ready = await snapshot();
  assert.equal(ready.mode, 'sled-ready');
  assert.equal(ready.chime.ready, true);
  quiet(ready, rings);
  return ready;
}

async function beginRide(rings) {
  await page.keyboard.press('KeyE');
  const start = await snapshot();
  assert.equal(start.mode, 'sled');
  assert.equal(start.sled.section, 'above-cloud');
  assert.ok(start.position.height > 560);
  quiet(start, rings);
  return start;
}

async function walkIntoCloud(rings) {
  await page.keyboard.down('KeyW');
  try {
    for (let step = 0; step < 2; step++) {
      const below = await advance(45_000);
      assert.equal(below.mode, 'walk');
      assert.ok(below.walk.distance > 0 && below.position.height < 380);
      quiet(below, rings);
    }
    let current = await advance(25_000);
    for (let step = 0; step < 25 && !current.chime.playing; step++) current = await advance(400);
    assert.equal(current.mode, 'walk');
    audible(current, current.walk.distance, rings);
    return current;
  } finally {
    await page.keyboard.up('KeyW');
  }
}

async function findRinging(start) {
  let current = start;
  while (current.sled.elapsedMs < 600_000 && current.sled.section !== 'below-cloud') {
    const step = current.sled.section === 'above-cloud' ? 8_000 : 400;
    current = await advance(step);
    if (current.sled.section !== 'through-cloud') {
      quiet(current, start.chime.rings);
    } else if (current.chime.playing && current.chime.rings > start.chime.rings) {
      audible(current, current.sled.distance, start.chime.rings);
      return current;
    }
  }
  assert.fail('No positional chime rang during the 380–560 m cloud ride');
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
  const executablePath = process.env.CHROMIUM_PATH ?? process.env.P3_CHROME ??
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

  report.step = 'silent load and native click';
  const { port } = server.httpServer.address();
  const response = await page.goto(`http://127.0.0.1:${port}/${entry}?proof=1`, { waitUntil: 'load' });
  assert.equal(response?.status(), 200);
  await page.waitForFunction(() => window.p3?.snapshot().chime, null, { timeout: 15_000 });
  const initial = await snapshot();
  assert.equal(initial.mode, 'walk');
  assert.equal(initial.chime.ready, false, 'The page should wait for a native gesture before enabling audio');
  quiet(initial, 0);
  record('initial walk is quiet', initial);

  report.step = 'walk into the cloud with native W';
  await page.locator('[data-p3-action="walk"]').click();
  await page.waitForFunction(() => window.p3.snapshot().chime.ready, null, { timeout: 10_000 });
  const walking = await walkIntoCloud(initial.chime.rings);
  record('in-cloud chime plays ahead of the walker', walking);
  const ready = await selectSled(walking.chime.rings);
  record('switching to the sled stops the walk chime', ready);

  // AudioContext time runs independently of the accelerated proof clock.
  await wait(3_300);
  const start = await beginRide(ready.chime.rings);
  record('upper sled trail is quiet', start);

  report.step = 'audible source ahead in the cloud';
  const ringing = await findRinging(start);
  record('in-cloud chime plays ahead of the rider', ringing);
  await shot('01-cloud-chime.png', ringing);

  report.step = 'quiet after descending below the cloud';
  let exit = ringing;
  let prior;
  while (exit.sled.section === 'through-cloud' && exit.sled.elapsedMs < 600_000) {
    prior = exit;
    exit = await advance(8_000);
  }
  assert.equal(exit.sled.section, 'below-cloud');
  assert.ok(exit.position.height < 380);
  quiet(exit, prior.chime.rings);
  record('lower trail is quiet', exit);
  await shot('02-below-cloud-quiet.png', exit);
  quiet(await advance(2_000), exit.chime.rings);

  report.step = 'mode switch stops a currently playing chime';
  await wait(3_300);
  const secondReady = await selectSled(exit.chime.rings);
  const secondRing = await findRinging(await beginRide(secondReady.chime.rings));
  record('chime plays again on a new ride', secondRing);
  await page.locator('[data-p3-action="walk"]').click();
  const walk = await snapshot();
  assert.equal(walk.mode, 'walk');
  quiet(walk, secondRing.chime.rings);
  record('switching to the walk stops the chime', walk);
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
  await writeFile(path.join(output, 'trail-chimes-result.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, step: report.step, screenshots: report.screenshots,
    errors: report.errors, failure: report.failure }));
}
