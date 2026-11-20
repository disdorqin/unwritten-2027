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

const mineBlob = checkedInBlob('src/shared/underground-mine-layout.ts');
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
  scope: 'Chromium runs the checked-in entry authority and mine layout with the expansion disabled. The fixture advances host time and uses sessionStorage to replay an opener reconnect. Server file persistence is covered by the entry-store tests.',
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

async function windFirstShaft(page, capture) {
  await page.keyboard.press('e');
  const tapped = await inspect(page);
  assert.equal(tapped.coverVisible, true);
  assert.equal(tapped.locked, false);
  assert.equal(tapped.winchTurns, 0);

  await page.keyboard.down('e');
  for (let step = 0; step < 10; step++) await advance(page, 100);
  const partial = await inspect(page);
  assert.equal(partial.winchTurns, .4);
  assert.equal(partial.coverVisible, true);
  await page.keyboard.up('e');
  const interrupted = await inspect(page);
  assert.equal(interrupted.winchTurns, 0);
  assert.equal(interrupted.events.at(-1).code, 'KeyEUp');
  assert.equal(interrupted.events.at(-1).trusted, true);

  await page.keyboard.down('e');
  const twoTurns = await driveUntil(page, state => state.winchTurns >= 2, 'two accepted turns', 5_000);
  assert.equal(twoTurns.winchTurns, 2);
  assert.equal(twoTurns.coverVisible, true);
  if (capture) await checkpoint(page, 'windlass');
  const almost = await driveUntil(page, state => state.winchTurns >= 2.96, 'one tick before opening', 2_400);
  assert.equal(almost.coverVisible, true);
  assert.equal(almost.locked, false);
  const opened = await advance(page, 100);
  await page.keyboard.up('e');
  assert.equal(opened.winchTurns, 3);
  assert.equal(opened.coverVisible, false);
  assert.equal(opened.locked, false);
  assert.equal(opened.atShaftMouth, false);
  assert.equal(opened.firstFallPending, true);
  assert.deepEqual(opened.foot, almost.foot);
  return { tapped, partial, interrupted, twoTurns, almost, opened };
}

async function walkIntoShaft(page) {
  const start = await inspect(page);
  assert.equal(start.atShaftMouth, false);
  assert.equal(start.firstFallPending, true);
  await page.keyboard.press('e');
  const fromWinch = await inspect(page);
  assert.equal(fromWinch.tripId, undefined);
  assert.equal(fromWinch.locked, false);
  assert.deepEqual(fromWinch.foot, start.foot);

  let stepped = fromWinch;
  for (let step = 0; step < 20 && !stepped.locked; step++) {
    await page.keyboard.press('w');
    const previous = stepped;
    stepped = await inspect(page);
    assert.ok(stepped.foot.north < previous.foot.north);
    assert.equal(stepped.events.at(-1).code, 'KeyW');
    assert.equal(stepped.events.at(-1).trusted, true);
    assert.equal(stepped.locked, stepped.atShaftMouth);
  }
  assert.equal(stepped.first, true);
  assert.equal(stepped.atShaftMouth, true);
  assert.equal(stepped.locked, true);
  return stepped;
}

async function expectWaterFilm(page) {
  await driveUntil(page, state => state.waterFilmPlays > 0, 'the water-film cue');
  await page.waitForFunction(() => window.undergroundDescentReview.inspect().waterFilmPeak > .001);
  const state = await inspect(page);
  assert.equal(state.waterFilmPlays, 1);
  assert.ok(state.travelMs > state.elapsed);
  return { elapsed: state.elapsed, peak: state.waterFilmPeak };
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

async function releaseAndWake(page, first, lyingShot = 'pool-lying') {
  await driveUntil(page, state => state.elapsed >= state.travelMs, 'physical arrival');
  assert.equal(await page.evaluate(() => window.undergroundDescentReview.allowLanding()), true);
  await page.waitForFunction(() => window.undergroundDescentReview.inspect().scene === 'mine');
  await driveUntil(page, state => state.wakeProgress !== undefined || !state.locked, 'wake');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  const wake = await inspect(page);
  if (wake.phase === 'waking') await checkpoint(page, lyingShot);
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

  evidence.runs.fullThenRepeat.winch = await windFirstShaft(page, true);
  const first = await walkIntoShaft(page);
  assert.equal(first.locked, true);
  assert.equal(first.first, true);
  assert.equal(first.events.at(-1).trusted, true);
  await checkpoint(page, 'cage');
  await page.keyboard.press('w');
  assert.deepEqual((await inspect(page)).foot, first.foot);
  await driveUntil(page, state => state.phase === 'screech', 'metal screech');
  await page.waitForFunction(() => window.undergroundDescentReview.inspect().audioPeak > .001);
  const firstWaterFilm = await expectWaterFilm(page);
  const firstBlack = await blackoutPending(page, true, 'first-black');
  assert.equal(firstBlack.waiting.waterFilmPlays, 1);
  assert.ok(firstBlack.waiting.flashPeak > 0);
  assert.ok(firstBlack.waiting.swayPeak > 0);
  const firstWake = await releaseAndWake(page, true);
  assert.equal(firstWake.wake.wakeProgress, 0);
  assert.ok(firstWake.wake.camera.pitch > .6);
  assert.ok(firstWake.settled.camera.eyeY - firstWake.wake.camera.eyeY > 1);
  assert.equal(firstWake.settled.camera.pitch, 0);
  await checkpoint(page, 'pool-after-wake');
  evidence.runs.fullThenRepeat.first = { ...firstBlack, ...firstWake, waterFilm: firstWaterFilm, phases: phaseSequence(firstWake.settled) };

  await page.keyboard.press('e');
  assert.equal((await inspect(page)).scene, 'crater');
  await page.keyboard.press('e');
  const repeat = await inspect(page);
  assert.equal(repeat.first, false);
  assert.notEqual(repeat.tripId, first.tripId);
  const repeatWaterFilm = await expectWaterFilm(page);
  const repeatBlack = await blackoutPending(page, false, 'repeat-black');
  assert.equal(repeatBlack.waiting.waterFilmPlays, 1);
  const repeatWake = await releaseAndWake(page, false);
  const fullPhases = phaseSequence(firstWake.settled);
  const shortPhases = phaseSequence(repeatWake.settled);
  assert.deepEqual(fullPhases, ['boarding', 'sway', 'flash', 'screech', 'blackout', 'waking', 'sitting', 'complete']);
  assert.deepEqual(shortPhases, ['boarding', 'ride', 'sway', 'blackout', 'complete']);
  assert.equal(repeatBlack.waiting.flashPeak, 0);
  assert.equal(repeatBlack.waiting.audioPeak, 0);
  evidence.runs.fullThenRepeat.repeat = { ...repeatBlack, ...repeatWake, waterFilm: repeatWaterFilm, phases: shortPhases };
  assert.deepEqual(errors, []);
  await context.close();

  context = await browser.newContext({ viewport: { width: 880, height: 520 } });
  page = await context.newPage();
  page.setDefaultTimeout(12_000);
  const skipErrors = [];
  const skipTrace = evidence.runs.skip = { errors: skipErrors };
  await openScene(page, url, skipErrors);
  skipTrace.winch = await windFirstShaft(page, false);
  skipTrace.departure = await walkIntoShaft(page);
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
  assert.equal(skipTrace.landed.settled.waterFilmPlays, held.waterFilmPlays);
  assert.ok(!phaseSequence(skipTrace.landed.settled).some(phase => ['waking', 'sitting'].includes(phase)));
  assert.deepEqual(skipErrors, []);
  await context.close();

  context = await browser.newContext({ viewport: { width: 880, height: 520 } });
  page = await context.newPage();
  page.setDefaultTimeout(12_000);
  const reopenedErrors = [];
  const reopened = evidence.runs.pendingReconnect = { errors: reopenedErrors };
  await openScene(page, url, reopenedErrors);
  await windFirstShaft(page, false);
  reopened.beforeReload = await inspect(page);
  assert.equal(reopened.beforeReload.firstFallPending, true);
  assert.equal(reopened.beforeReload.entrySaves, 1);
  await page.reload();
  await page.waitForFunction(() => Boolean(window.undergroundDescentReview));
  await page.locator('main canvas').click();
  reopened.restored = await inspect(page);
  assert.equal(reopened.restored.scene, 'crater');
  assert.equal(reopened.restored.mode, 'peace');
  assert.equal(reopened.restored.coverVisible, false);
  assert.equal(reopened.restored.firstFallPending, true);
  assert.equal(reopened.restored.cageAvailable, false);
  assert.equal(reopened.restored.entrySaves, 0);
  reopened.restarted = await walkIntoShaft(page);
  assert.equal(reopened.restarted.first, true);
  assert.equal(reopened.restarted.winchTurns, 0);
  assert.equal(reopened.restarted.entrySaves, 0);
  reopened.black = await blackoutPending(page, true, 'reopened-first-black');
  reopened.landed = await releaseAndWake(page, true, 'reopened-pool-lying');
  assert.equal(reopened.landed.settled.firstFallPending, false);
  assert.equal(reopened.landed.settled.entrySaves, 1);
  assert.deepEqual(reopenedErrors, []);
  await context.close();
  evidence.passed = true;
  console.log('Underground descent: three accepted winch turns, full, repeat, native skip, pending reconnect, blackout, zero damage, and restored movement.');
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
