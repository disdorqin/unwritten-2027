import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const checkout = fileURLToPath(new URL('../', import.meta.url));
const root = path.join(checkout, 'tools', 'voxel-tavern');
const output = process.argv[2] && path.resolve(process.argv[2]);
assert.ok(output, 'Usage: node tools/verify-sky-city-reveal-browser.mjs OUTPUT');
await mkdir(output, { recursive: true });
const requireRoot = createRequire(path.join(checkout, 'package.json'));
const requireVite = createRequire(path.join(root, 'package.json'));
const vite = path.resolve(path.dirname(requireVite.resolve('vite/package.json')), 'dist/node/index.js');
const { build, preview } = await import(pathToFileURL(vite));
const { chromium } = requireRoot('playwright');
const result = { source: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: checkout, encoding: 'utf8' }).trim(),
  status: 'failed', errors: [], checks: [] };

let server, browser, page;
const shot = name => page.screenshot({ path: path.join(output, name + '.jpg'), quality: 82 });
const snapshot = () => page.evaluate(() => window.skyCityRevealQA.latest);
const observe = (condition, value) => page.waitForFunction(condition, value, { polling: 'raf', timeout: 20_000 });
const takeEvidence = async label => {
  result.checks.push({ label, frame: await snapshot() });
};
async function hold(key, condition) {
  await page.keyboard.down(key);
  try { await observe(condition); }
  finally { await page.keyboard.up(key); }
}

async function finishVisibleRide() {
  await page.keyboard.press('e');
  await observe(() => {
    const frame = window.skyCityRevealQA.latest;
    return frame?.source === 'mountain' && frame.running && frame.height < 380;
  });
  await observe(() => {
    const frame = window.skyCityRevealQA.latest;
    return frame?.source === 'mountain' && frame.height >= 560 &&
      !frame.whiteout && frame.inView && frame.silhouetteVisible;
  });
}

try {
  result.step = 'build';
  const outDir = path.join(output, 'dist');
  const entry = 'sky-city-reveal-review.html';
  await build({ root, configFile: false, logLevel: 'warn', build: { outDir,
    emptyOutDir: false, rollupOptions: { input: path.join(root, entry) } } });
  server = await preview({ root, configFile: false, logLevel: 'warn', build: { outDir },
    preview: { host: '127.0.0.1', port: 0 } });
  const args = process.platform === 'win32' ? ['--use-gl=angle', '--use-angle=d3d11'] :
    ['--enable-unsafe-swiftshader'];
  browser = await chromium.launch({ executablePath: process.env.SKY_CITY_CHROME, args });
  result.browser = browser.version();
  page = await browser.newPage({ viewport: { width: 800, height: 520 } });
  page.on('pageerror', error => result.errors.push(error.message));
  page.on('console', console => { if (console.type() === 'error') result.errors.push(console.text()); });
  page.on('response', response => { if (response.status() >= 400) result.errors.push(`${response.status()} ${response.url()}`); });
  await page.addInitScript(() => {
    const state = { latest: null, frames: [] };
    window.skyCityRevealQA = state;
    document.addEventListener('sky-city-reveal-frame', event => {
      state.latest = event.detail;
      state.frames.push({
        phase: event.detail.phase, height: event.detail.height, whiteout: event.detail.whiteout,
        cueCount: event.detail.cueCount, glow: event.detail.glow, audioPlaying: event.detail.audioPlaying,
      });
    });
  });

  result.step = 'ground tier';
  const address = server.httpServer.address();
  assert.equal((await page.goto(`http://127.0.0.1:${address.port}/${entry}`)).status(), 200);
  await observe(() => Boolean(window.skyCityRevealQA.latest));
  await page.keyboard.press('g');
  await observe(() => window.skyCityRevealQA.latest?.source === 'ground');
  const ground = await snapshot();
  assert.equal(ground.silhouetteVisible, false);
  assert.equal(ground.cityDraws, 0);
  assert.equal(ground.cueCount, 0);
  await takeEvidence('ground renders no city');
  await shot('01-ground');

  result.step = 'native ascent with camera turned away';
  await page.keyboard.press('r');
  await observe(() => window.skyCityRevealQA.latest?.source === 'mountain');
  await hold('ArrowLeft', () => Math.abs(window.skyCityRevealQA.latest?.yaw) > 1.36);
  await page.keyboard.press('e');
  await observe(() => {
    const frame = window.skyCityRevealQA.latest;
    return frame?.source === 'mountain' && frame.running && frame.height < 380;
  });
  await takeEvidence('ride started below the cloud belt');
  await observe(() => {
    const frame = window.skyCityRevealQA.latest;
    return frame?.whiteout && frame.height >= 380 && frame.height < 560;
  });
  const inBelt = await snapshot();
  assert.equal(inBelt.cueCount, 0);
  assert.equal(inBelt.glow, 0);
  await takeEvidence('inside the cloud belt before the cue');
  await shot('02-in-cloud');
  await observe(() => {
    const frame = window.skyCityRevealQA.latest;
    return frame?.height >= 560 && !frame.whiteout && frame.silhouetteVisible;
  });
  const away = await snapshot();
  assert.equal(away.inView, false);
  assert.equal(away.seen, false);
  assert.equal(away.cueCount, 0);
  assert.equal(away.glow, 0);
  assert.equal(away.audioPlaying, false);
  await takeEvidence('emerged with the city outside the viewport');
  await shot('03-looking-away');

  result.step = 'first visible silhouette with light and sound';
  await hold('ArrowRight', () => {
    const frame = window.skyCityRevealQA.latest;
    return frame?.inView && frame.cueCount === 1;
  });
  await observe(() => window.skyCityRevealQA.latest?.glow > .25);
  const first = await snapshot();
  assert.equal(first.seen, true);
  assert.equal(first.cueCount, 1);
  assert.equal(first.audioAvailable, true);
  assert.ok(first.cityDraws > 0, 'The observed silhouette must produce rendered triangles');
  await takeEvidence('first visible silhouette with glow');
  await shot('04-first-cue');
  await observe(() => {
    const frame = window.skyCityRevealQA.latest;
    return frame?.cueCount === 1 && frame.glow === 0 && !frame.audioPlaying;
  });
  const timeline = await page.evaluate(() => window.skyCityRevealQA.frames);
  assert.equal(timeline.some(frame => frame.audioPlaying), true, 'The first-view wind cue must play after a native action');
  const maxGlow = Math.max(...timeline.map(frame => frame.glow));
  assert.ok(maxGlow >= .9, 'Reveal glow must rise and return to zero');
  assert.equal(Math.max(...timeline.map(frame => frame.cueCount)), 1);
  result.checks.push({ label: 'one complete light and wind cue', maxGlow, audibleFrames: timeline.filter(frame => frame.audioPlaying).length });

  result.step = 'mountain re-entry preserves discovery';
  await page.keyboard.press('r');
  await observe(() => {
    const frame = window.skyCityRevealQA.latest;
    return frame?.source === 'mountain' && frame.seen && !frame.running && frame.height < 380;
  });
  const prior = (await snapshot()).cueCount;
  await finishVisibleRide();
  const second = await snapshot();
  assert.equal(second.seen, true);
  assert.equal(second.cueCount, prior);
  assert.equal(second.glow, 0);
  assert.equal(second.audioPlaying, false);
  await takeEvidence('mountain re-entry renders the silhouette without a new cue');

  result.step = 'same browser reload preserves discovery';
  await page.reload();
  await observe(() => Boolean(window.skyCityRevealQA.latest?.seen));
  const afterReload = await snapshot();
  assert.equal(afterReload.cueCount, 0);
  if (afterReload.source !== 'mountain') {
    await page.keyboard.press('r');
    await observe(() => window.skyCityRevealQA.latest?.source === 'mountain');
  }
  await finishVisibleRide();
  const persisted = await snapshot();
  assert.equal(persisted.seen, true);
  assert.equal(persisted.cueCount, 0);
  assert.equal(persisted.glow, 0);
  assert.equal(persisted.audioPlaying, false);
  await takeEvidence('same-page reload does not replay discovery');
  await shot('05-reloaded-seen');
  assert.deepEqual(result.errors, []);
  result.status = 'passed';
} catch (error) {
  result.failure = error.stack;
  if (page) {
    result.last = await snapshot().catch(() => undefined);
    await shot('failed').catch(() => {});
  }
  process.exitCode = 1;
} finally {
  await browser?.close();
  await server?.close();
  await writeFile(path.join(output, 'sky-city-reveal-result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
}
