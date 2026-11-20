import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

assert.ok(process.argv[2], 'Use: node tools/verify-underground-descent.mjs <evidence-dir>');
const output = resolve(process.argv[2]);
const repo = fileURLToPath(new URL('../', import.meta.url));
const git = args => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();

function checkedInBlob(path) {
  const blob = git(['rev-parse', '--verify', `HEAD:${path}`]);
  assert.equal(git(['hash-object', '--', path]), blob, `Run the verifier with the checked-in ${path}`);
  return blob;
}

const mineBlob = checkedInBlob('tools/voxel-tavern/town-blockout/underground-mine-layout.ts');
const entryBlob = checkedInBlob('src/presence/underground-entry.ts');
const scratch = await mkdtemp(resolve(tmpdir(), 'underground-descent-'));
await mkdir(output, { recursive: true });
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><link rel="icon" href="data:,">
<style>body{margin:0;background:#15181c}canvas:first-child{display:block}</style>
<main></main><script type="module" src="/tools/fixtures/underground-descent-review.ts"></script>`;
const server = await createServer({
  configFile: false, root: repo, publicDir: false, cacheDir: resolve(scratch, 'vite'),
  resolve: { dedupe: ['three'] },
  plugins: [{ name: 'underground-descent-review', configureServer(vite) {
    vite.middlewares.use('/underground-descent-review', (_req, res) => {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(html);
    });
  } }],
  server: { host: '127.0.0.1', port: 0, hmr: false },
});

const evidence = {
  scope: 'Chromium runs the checked-in entry authority and mine layout with the expansion disabled. The fixture advances host time explicitly and runs input, frames, audio plumbing and compositing in Chromium.',
  mineBlob,
  entryBlob,
  runs: {}, passed: false,
};
let browser;
let page;
const inspect = page => page.evaluate(() => window.undergroundDescentReview.inspect());
const advance = (page, elapsed) => page.evaluate(elapsed => window.undergroundDescentReview.advance(elapsed), elapsed);

async function driveUntil(page, matches, label, maxElapsed = 34_000) {
  let state = await inspect(page);
  for (let elapsed = 0; elapsed < maxElapsed && !matches(state); elapsed += 100) {
    state = await advance(page, 100);
  }
  assert.ok(matches(state), `Did not reach ${label}: ${JSON.stringify(state)}`);
  return state;
}

async function checkpoint(page, name) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return page.screenshot({ path: resolve(output, `${name}.png`) });
}

async function assertBlackPixels(page, name) {
  const screenshot = await checkpoint(page, name);
  const samples = await page.evaluate(async encoded => {
    const bytes = Uint8Array.from(atob(encoded), value => value.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    return [[4, 4], [canvas.width - 5, 4], [4, canvas.height - 5],
      [canvas.width - 5, canvas.height - 5], [canvas.width >> 1, canvas.height >> 1]].map(([x, y]) =>
      Array.from(ctx.getImageData(x, y, 1, 1).data).slice(0, 3));
  }, screenshot.toString('base64'));
  assert.deepEqual(samples, Array.from({ length: 5 }, () => [0, 0, 0]));
  return samples;
}

function phaseSequence(state) {
  return [...new Set(state.phases.map(entry => entry.phase))];
}

async function openScene(page, launchUrl, errors) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => errors.push(request.url()));
  page.on('response', response => { if (response.status() >= 400) errors.push(response.url()); });
  await page.goto(launchUrl);
  await page.waitForFunction(() => Boolean(window.undergroundDescentReview));
  await page.locator('main canvas').click();
}

async function blackoutPending(page, first, shot) {
  const beforeDock = await driveUntil(page, state => state.overlayOpaque, 'the full black frame');
  if (beforeDock.elapsed < beforeDock.travelMs) assert.deepEqual(beforeDock.requests, []);
  await driveUntil(page, state => state.elapsed >= state.travelMs, 'physical arrival');
  await page.waitForFunction(() => window.undergroundDescentReview.inspect().requests.length > 0);
  const waiting = await inspect(page);
  assert.equal(waiting.scene, 'crater');
  assert.equal(waiting.locked, true);
  assert.equal(waiting.mode, 'peace');
  assert.equal(waiting.cageAvailable, !first);
  assert.deepEqual(waiting.transfers, []);
  assert.equal(waiting.requests.length, 1);
  assert.equal(waiting.requests[0].tripId, waiting.tripId);
  assert.ok(waiting.requests[0].frame >= waiting.blackoutFrame + 2);
  const pixels = await assertBlackPixels(page, shot);
  return { beforeDock, waiting, pixels };
}

async function releaseAndWake(page, first) {
  await driveUntil(page, state => state.elapsed >= state.travelMs, 'physical arrival');
  assert.equal(await page.evaluate(() => window.undergroundDescentReview.allowLanding()), true);
  await page.waitForFunction(() => window.undergroundDescentReview.inspect().scene === 'mine');
  await driveUntil(page, state => state.wakeProgress !== undefined || !state.locked, 'wake');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  const wake = await inspect(page);
  if (wake.phase === 'waking') await checkpoint(page, 'pool-lying');
  await driveUntil(page, state => !state.locked, 'restored controls');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  const settled = await inspect(page);
  assert.equal(settled.scene, 'mine');
  assert.equal(settled.mode, 'survival');
  assert.equal(settled.cageAvailable, true);
  assert.equal(settled.overlayOpaque, false);
  assert.equal(settled.transfers.length, 1);
  const arrival = settled.transfers[0];
  assert.equal(arrival.tripId, settled.tripId);
  assert.equal(arrival.first, first);
  assert.equal(arrival.wasBlack, true);
  assert.equal(arrival.fallDamage, 0);
  assert.deepEqual(arrival.foot, { east: 0, north: -2, height: -90 });
  assert.equal(arrival.healthBefore, 100);
  assert.equal(arrival.healthAfter, 100);
  await page.keyboard.press('w');
  const walked = await inspect(page);
  assert.ok(walked.foot.north < settled.foot.north, 'Real movement did not return after waking');
  assert.equal(walked.events.at(-1).trusted, true);
  return { wake, settled, walked };
}

try {
  await server.listen();
  const address = server.httpServer?.address();
  assert.ok(address && typeof address === 'object');
  const url = `http://127.0.0.1:${address.port}/underground-descent-review`;
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  evidence.browser = browser.version();
  let context = await browser.newContext({ viewport: { width: 880, height: 520 } });
  page = await context.newPage();
  page.setDefaultTimeout(12_000);
  const errors = [];
  evidence.runs.fullThenRepeat = { errors };
  await openScene(page, url, errors);

  await page.keyboard.press('e');
  const first = await inspect(page);
  assert.equal(first.locked, true);
  assert.equal(first.first, true);
  assert.equal(first.events.at(-1).trusted, true);
  await checkpoint(page, 'cage');
  await page.keyboard.press('w');
  assert.deepEqual((await inspect(page)).foot, first.foot);
  await driveUntil(page, state => state.phase === 'screech', 'metal screech');
  await page.waitForFunction(() => window.undergroundDescentReview.inspect().audioPeak > .001);
  const firstBlack = await blackoutPending(page, true, 'first-black');
  assert.ok(firstBlack.waiting.flashPeak > 0);
  assert.ok(firstBlack.waiting.swayPeak > 0);
  const firstWake = await releaseAndWake(page, true);
  assert.equal(firstWake.wake.wakeProgress, 0);
  assert.ok(firstWake.wake.camera.pitch > .6);
  assert.ok(firstWake.settled.camera.eyeY - firstWake.wake.camera.eyeY > 1);
  assert.equal(firstWake.settled.camera.pitch, 0);
  await checkpoint(page, 'pool-after-wake');
  evidence.runs.fullThenRepeat.first = { ...firstBlack, ...firstWake, phases: phaseSequence(firstWake.settled) };

  await page.keyboard.press('e');
  assert.equal((await inspect(page)).scene, 'crater');
  await page.keyboard.press('e');
  const repeat = await inspect(page);
  assert.equal(repeat.first, false);
  assert.notEqual(repeat.tripId, first.tripId);
  const repeatBlack = await blackoutPending(page, false, 'repeat-black');
  const repeatWake = await releaseAndWake(page, false);
  const fullPhases = phaseSequence(firstWake.settled);
  const shortPhases = phaseSequence(repeatWake.settled);
  assert.deepEqual(fullPhases, ['boarding', 'sway', 'flash', 'screech', 'blackout', 'waking', 'sitting', 'complete']);
  assert.deepEqual(shortPhases, ['boarding', 'ride', 'sway', 'blackout', 'complete']);
  assert.equal(repeatBlack.waiting.flashPeak, 0);
  assert.equal(repeatBlack.waiting.audioPeak, 0);
  evidence.runs.fullThenRepeat.repeat = { ...repeatBlack, ...repeatWake, phases: shortPhases };
  assert.deepEqual(errors, []);
  await context.close();

  context = await browser.newContext({ viewport: { width: 880, height: 520 } });
  page = await context.newPage();
  page.setDefaultTimeout(12_000);
  const skipErrors = [];
  const skipTrace = evidence.runs.skip = { errors: skipErrors };
  await openScene(page, url, skipErrors);
  await page.keyboard.press('e');
  const skip = page.locator('[data-underground-lift-skip]');
  assert.equal(await skip.isVisible(), false);
  assert.equal(await page.evaluate(() => window.undergroundDescentReview.askSkip()), false);
  await page.keyboard.press('Escape');
  skipTrace.early = await inspect(page);
  assert.equal(skipTrace.early.scene, 'crater');
  assert.equal(skipTrace.early.locked, true);
  assert.equal(skipTrace.early.skipVisible, false);
  assert.deepEqual(skipTrace.early.transfers, []);

  skipTrace.available = await driveUntil(page, state => state.skipVisible && state.overlayOpaque, 'optional skip');
  assert.ok(skipTrace.available.elapsed >= skipTrace.available.travelMs / 2);
  assert.ok(skipTrace.available.elapsed < skipTrace.available.travelMs);
  assert.equal(await skip.isVisible(), true);
  await skip.click();
  assert.equal(await page.evaluate(() => window.undergroundDescentReview.allowLanding()), false);
  const held = await inspect(page);
  assert.ok(held.events.some(event => event.code === 'skip' && event.trusted));
  assert.equal(held.scene, 'crater');
  assert.equal(held.cageAvailable, false);
  assert.equal(held.locked, true);
  assert.equal(held.overlayOpaque, true);
  assert.deepEqual(held.requests, []);
  skipTrace.black = await blackoutPending(page, true, 'skip-black');
  skipTrace.landed = await releaseAndWake(page, true);
  assert.ok(!phaseSequence(skipTrace.landed.settled).some(phase => ['waking', 'sitting'].includes(phase)));
  assert.deepEqual(skipErrors, []);
  await context.close();
  evidence.passed = true;
  console.log('Underground descent: full, repeat, native skip, blackout handoff, zero damage, and restored movement.');
} catch (error) {
  evidence.failure = String(error);
  if (page && !page.isClosed()) {
    try { evidence.lastState = await inspect(page); } catch {}
    try { await checkpoint(page, 'failure'); } catch {}
  }
  throw error;
} finally {
  await writeFile(resolve(output, 'underground-descent.json'), JSON.stringify(evidence, null, 2) + '\n');
  try { await browser?.close(); } finally {
    await server.close();
    await rm(scratch, { recursive: true, force: true });
  }
}
