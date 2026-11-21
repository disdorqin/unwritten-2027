import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [checkoutPath, outputPath, mode] = process.argv.slice(2);
assert.ok(checkoutPath && outputPath && (mode === undefined || mode === '--rings' || mode === '--target' || mode === '--target-straight' || mode === '--nine-course'),
  'Usage: node tools/verify-snow-wing-browser.mjs <checkout> <output> [--rings|--target|--target-straight|--nine-course]');
const withRings = mode === '--rings';
const nineCourse = mode === '--nine-course';
const withTarget = mode === '--target' || mode === '--target-straight' || nineCourse;
const straightTarget = mode === '--target-straight' || nineCourse;
const checkout = path.resolve(checkoutPath);
const output = path.resolve(outputPath);
const viteRoot = path.join(checkout, 'tools/voxel-tavern');
const builtDir = process.env.SNOW_WING_BUILT_DIR ? path.resolve(process.env.SNOW_WING_BUILT_DIR) : undefined;
const viewport = { width: 800, height: 520 };
const requireRoot = createRequire(path.join(checkout, 'package.json'));
const { chromium } = requireRoot('playwright');
const { createServer } = await import(pathToFileURL(requireRoot.resolve('vite')).href);
const started = performance.now();
const deadline = started + 225_000;
const screenshots = [];
const errors = [];
const teardownErrors = [];
let p;
let browser;
let server;
let context;
let failure;
let stateAtFailure;
let browserVersion;
let pins;

const git = (...args) => execFileSync('git', args, { cwd: checkout, encoding: 'utf8', timeout: 5_000 }).trim();
const sources = [
  ['P-1', 'cb47ce2', 'main-summit-block.ts', ['a0dd7b83be27a461a177dd6032114aef96bef6d2']],
  // The later integration refactors the original reach predicate without changing its geometry.
  ['P-4', '90019a5', 'main-summit-registration.ts', [
    '80b739784292592010f61552bc7325034d8ff33a',
    '8e8f9e990171f8c001791e920d3403767c523e1f',
  ]],
  ['F-7', '0981021', 'flight-equipment-visuals.ts', ['eb7e008899c64bf2b777d206ea8f306086a0270a']],
];

async function timed(label, run, ms) {
  let expiry;
  try {
    return await Promise.race([run, new Promise((_, reject) => {
      expiry = setTimeout(() => reject(new Error(`${label} exceeded ${ms} ms`)), ms);
    })]);
  } finally { clearTimeout(expiry); }
}

function timeLeft(max) {
  const remain = Math.floor(deadline - performance.now());
  assert.ok(remain > 0, 'Snow-wing browser evidence exceeded its test budget');
  return Math.min(remain, max);
}

const getState = () => p.evaluate(() => window.__snowWingReview.getState());

async function watch(predicate, arg, max = 25_000) {
  const found = await p.waitForFunction(predicate, arg, { timeout: timeLeft(max) });
  await found.dispose();
  return getState();
}

async function hold(key, action) {
  await p.keyboard.down(key);
  try { return await action(); }
  finally { await p.keyboard.up(key); }
}

// Ground waypoints use the actual WASD controls with the camera facing south.
async function groundAxis(axis, target, lowerKey, upperKey) {
  const initial = (await getState()).position[axis];
  const direction = Math.sign(target - initial);
  if (Math.abs(target - initial) <= .12) return getState();
  return hold(direction > 0 ? upperKey : lowerKey, () => watch(({ axis, target, direction }) => {
    const { position } = window.__snowWingReview.getState();
    return direction * (target - position[axis]) <= .12;
  }, { axis, target, direction }, 12_000));
}

const walkEast = target => groundAxis('east', target, 'd', 'a');
const walkNorth = target => groundAxis('north', target, 'w', 's');

async function faceGround(target) {
  const initial = (await getState()).groundHeading;
  const delta = Math.atan2(Math.sin(target - initial), Math.cos(target - initial));
  if (Math.abs(delta) <= .045) return getState();
  return hold(delta > 0 ? 'ArrowRight' : 'ArrowLeft', () => watch(({ initial, delta }) => {
    const { groundHeading } = window.__snowWingReview.getState();
    const angle = groundHeading - initial;
    const moved = Math.atan2(Math.sin(angle), Math.cos(angle));
    return Math.sign(delta) * moved >= Math.abs(delta) - .028;
  }, { initial, delta }, 8_000));
}

async function lodgeInteraction(action) {
  await p.keyboard.press('e');
  return watch(expected => window.__snowWingReview.getState().lodgeAction === expected, action, 8_000);
}

async function walkToRack(stand) {
  await walkEast(65.55);
  await walkNorth(stand.north);
  await walkEast(stand.east);
  await faceGround(Math.PI / 2);
  const atRack = await watch(() => window.__snowWingReview.getState().rack.inReach, null, 8_000);
  assert.ok(Math.hypot(atRack.position.east - stand.east,
    atRack.position.north - stand.north) <= .4, 'Native walking must reach the wing-rack stand');
  return atRack;
}

async function walkFromRackToRegistry() {
  await faceGround(Math.PI);
  await walkEast(65.55);
  await walkNorth(1014);
  return walkEast(62.5);
}

async function capture(label) {
  await p.keyboard.press('p');
  try {
    const state = await watch(() => window.__snowWingReview.getState().paused);
    const file = label + '.png';
    await p.screenshot({ path: path.join(output, file), timeout: timeLeft(14_000) });
    screenshots.push({ file, state });
    return state;
  } finally { await p.keyboard.press('p'); }
}

async function main() {
  pins = sources.map(([part, ref, name, expected]) => {
    const file = 'tools/voxel-tavern/town-blockout/' + name;
    const blob = git('hash-object', file);
    assert.ok(expected.includes(blob), `${part} does not match any reviewed source pin: ${blob}`);
    return { part, ref, file, blob };
  });
  if (builtDir) {
    assert.ok(existsSync(path.join(builtDir, 'main-summit-snow-wing-review.html')),
      'Compiled review must already exist; do not serve a stale or missing preview');
    const sirv = requireRoot('sirv');
    const http = createHttpServer(sirv(builtDir, { dev: false, single: false }));
    server = { httpServer: http, close: () => new Promise((resolve, reject) =>
      http.close(error => error ? reject(error) : resolve())) };
    await timed('Built preview HTTP listen', new Promise((resolve, reject) =>
      http.once('error', reject).listen(0, '127.0.0.1', resolve)), timeLeft(12_000));
  } else {
    server = await timed('Vite start', createServer({
      root: viteRoot, configFile: path.join(viteRoot, 'vite.config.ts'),
      cacheDir: path.join(output, '.vite-cache'),
      optimizeDeps: { noDiscovery: true, include: [] }, logLevel: 'warn',
      server: { host: '127.0.0.1', port: 0, strictPort: true, hmr: false },
    }), timeLeft(20_000));
    await timed('Vite listen', server.listen(), timeLeft(12_000));
  }
  const { port } = server.httpServer.address();
  const executablePath = process.env.CHROMIUM_PATH ??
    (!existsSync(chromium.executablePath()) && existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  browser = await chromium.launch({
    headless: true, executablePath, timeout: timeLeft(20_000),
    args: process.platform === 'win32' ? ['--use-gl=angle', '--use-angle=d3d11'] :
      ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
  });
  browserVersion = browser.version();
  context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce', locale: 'zh-CN' });
  p = await context.newPage();
  p.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  p.on('pageerror', error => errors.push(error.message));
  p.on('requestfailed', request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
  p.on('response', response => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  const reviewUrl = `http://127.0.0.1:${port}/main-summit-snow-wing-review.html?proof=1${withRings ? '&rings=1' : ''}${withTarget ? '&target=1' : ''}${nineCourse ? '&course=nine' : ''}`;
  const response = await p.goto(reviewUrl, {
    waitUntil: 'domcontentloaded', timeout: timeLeft(30_000),
  });
  assert.equal(response?.status(), 200);
  const initial = await watch(() => window.__snowWingReview?.getState().frame > 1);
  assert.deepEqual(initial.position, { east: 62.5, north: 1006, height: 800 });
  assert.equal(initial.flightTimeScale, 12);
  assert.ok(!initial.claimed && !initial.registration.snowWingEligible && !initial.wing.visible);
  if (withRings) assert.deepEqual(initial.rings?.passed ?? [], []);
  else if (nineCourse) {
    assert.equal(initial.rings?.count, 9, 'The all-course reviewer must mount all nine surveyed hoops');
    assert.equal(initial.rings.score.nextRing, 0);
    assert.equal(initial.nineRingArt?.lightCount, 2);
    assert.ok(initial.nineRingArt?.text.launch.includes('九环试飞'));
    assert.ok(initial.nineRingArt?.budgetDraws <= 20);
    assert.ok(initial.nineRingArt.drawCount > 0, 'At least one of the authored signs or pennants must actually render');
    assert.equal(initial.nineRingAuthority, null, 'Host-run cannot start before accepted takeoff');
    assert.deepEqual(initial.ringAudio, { enabled: false, played: 0, failed: 0, disposed: false },
      'Original gameplay feedback must be muted by default');
    assert.match(await p.locator('#ring-audio-reading').evaluate(element => element.value), /已静音/);
    await p.keyboard.press('m');
    const withAudio = await watch(() => window.__snowWingReview.getState().ringAudio?.enabled);
    assert.equal(withAudio.ringAudio.failed, 0, 'Keyboard opt-in audio must initialize without errors');
    assert.match(await p.locator('#ring-audio-reading').evaluate(element => element.value), /已开启/);
    assert.equal(initial.nightPreview, false);
    assert.equal(initial.skyHex, 'b1c5dc');
    const help = await p.locator('#course-help').evaluate(element => ({ hidden: element.hidden, text: element.textContent }));
    assert.equal(help.hidden, false);
    assert.match(help.text, /正穿得 1 分.*擦环得 0.5 分.*正式主峰每日风场/);
  } else assert.equal(initial.rings ?? null, null);
  if (withTarget) {
    assert.equal(initial.practiceTarget?.lamps, 2, 'Target must use two real PointLight sources');
    assert.ok(initial.practiceTarget.target.north < -3000, 'Practice target must be surveyed at the neutral flight touchdown');
    assert.equal(initial.practiceTarget.settlement ?? null, null);
  } else assert.equal(initial.practiceTarget ?? null, null);
  const outside = await lodgeInteraction('out-of-reach');
  assert.ok(!outside.registration.snowWingEligible && !outside.claimed);
  await walkNorth(1013.55);
  const unregisteredRack = await walkToRack(initial.rack.stand);
  assert.ok(unregisteredRack.rack.visible && unregisteredRack.rack.draws > 0, 'The physical rack should be visible from its stand');
  const denied = await lodgeInteraction('need-registration');
  assert.ok(!denied.registration.snowWingEligible && !denied.claimed);
  await walkFromRackToRegistry();
  const registered = await lodgeInteraction('registered');
  assert.ok(registered.registration.snowWingEligible && !registered.claimed);
  const deskRepeat = await lodgeInteraction('already-registered');
  assert.ok(!deskRepeat.claimed, 'A second E at the registry does not grant the wing');
  await walkToRack(initial.rack.stand);
  await capture('f1-physical-wing-rack');
  const claimed = await lodgeInteraction('claimed');
  assert.ok(claimed.claimed && claimed.registration.snowWingEligible);
  assert.ok(Math.hypot(claimed.position.east - registered.position.east,
    claimed.position.north - registered.position.north) > 2, 'Wing claim requires a separate walk from the desk');
  await capture('f1-lodge-wing-claim');
  const duplicate = await lodgeInteraction('already-claimed');
  assert.ok(duplicate.claimed);
  assert.deepEqual(duplicate.position, claimed.position);
  const readyToLaunch = await walkFromRackToRegistry();
  if (withRings) assert.deepEqual(readyToLaunch.rings?.passed ?? [], [], 'Ground travel must not count as flying through a ring');

  const lift = await hold('w', () => watch(() => {
    const s = window.__snowWingReview.getState();
    return s.flight?.usesBothHands && s.wing.draws === 1;
  }, null, 38_000));
  assert.equal(lift.launchProbe.north, 975);
  assert.equal(lift.launchProbe.height, 800);
  assert.ok(lift.launchProbe.pathClear && lift.launchProbe.drop >= 15);
  assert.equal(lift.wing.name, 'snow-wing');
  assert.ok(lift.wing.width >= 3.79);
  if (withTarget) {
    const guidance = await p.locator('#target-reading').evaluate(output => output.value);
    assert.match(guidance, /练习落靶导航.*距目标.*m.*修正|练习落靶导航.*距目标.*m.*正前方/);
  }
  if (straightTarget) {
    if (nineCourse) {
      assert.equal(lift.nineRingAuthority?.lastFrame > 0, true);
      assert.equal(lift.nineRingAuthority?.rejectedFrames, 0);
      const first = await watch(() => window.__snowWingReview.getState().rings?.score?.nextRing >= 1);
      assert.equal(first.rings.score.results[0].grade, 'clean');
      assert.ok(first.ringAudio.played >= 1, 'After keyboard opt-in, actual flight ring must emit an original feedback cue');
      assert.ok(first.nineRingArt.drawCount > 0, 'The native airborne camera must render real course art');
      await capture('zd08-nine-first-hoop');
      await p.keyboard.press('n');
      const dark = await watch(() => window.__snowWingReview.getState().nightPreview);
      assert.equal(dark.skyHex, '1b2a43');
      assert.ok(dark.ambientIntensity < initial.ambientIntensity);
      await capture('zd08-nine-night-hoops');
      await p.keyboard.press('n');
      await watch(() => !window.__snowWingReview.getState().nightPreview);
      const middle = await watch(() => window.__snowWingReview.getState().rings?.score?.nextRing >= 5);
      assert.equal(middle.rings.score.scoreHalfPoints, 10);
      await capture('zd08-nine-middle-hoops');
      await p.keyboard.press('m');
      const muted = await watch(() => !window.__snowWingReview.getState().ringAudio.enabled);
      assert.match(await p.locator('#ring-audio-reading').evaluate(element => element.value), /已静音/);
      const beforeMute = muted.ringAudio.played;
      const cleared = await watch(() => window.__snowWingReview.getState().rings?.score?.nextRing === 9);
      assert.equal(cleared.rings.score.scoreHalfPoints, 18);
      assert.equal(cleared.rings.score.streak, 9);
      assert.equal(cleared.ringAudio.played, beforeMute, 'Muted remaining rings must not emit feedback cues');
      assert.deepEqual(cleared.rings.score.results.map(ring => ring.grade), Array(9).fill('clean'));
      assert.equal(cleared.rings.results.length, 9);
      await capture('zd08-nine-all-clear');
      await p.keyboard.press('n');
      await watch(() => window.__snowWingReview.getState().nightPreview);
    }
    const touchdown = await watch(() => {
      const s = window.__snowWingReview.getState();
      return s.flight?.phase === 'landed' && !!s.practiceTarget?.settlement;
    }, null, 85_000);
    const landed = await capture(nineCourse ? 'zd08-nine-night-bullseye' : 'zd08-practice-bullseye');
    assert.equal(landed.practiceTarget.settlement.grade, 'bullseye', 'Neutral real flight should land at its surveyed target');
    assert.ok(landed.practiceTarget.settlement.horizontalMetres <= 2,
      `Native bullseye miss: ${landed.practiceTarget.settlement.horizontalMetres} m`);
    assert.equal(landed.flight.touchdown, 'soft');
    if (nineCourse) {
      assert.equal(landed.rings.score.nextRing, 9);
      assert.equal(landed.rings.score.scoreHalfPoints, 18);
      assert.equal(landed.rings.score.streak, 9);
      assert.equal(landed.rings.count, 9);
      assert.equal(landed.nineRingAuthority?.finalized, true);
      assert.equal(landed.nineRingAuthority?.rejectedFrames, 0);
      assert.equal(landed.nineRingAuthority?.nextRing, 9);
      assert.equal(landed.nineRingAuthority?.scoreHalfPoints, 18);
      assert.equal(landed.nineRingAuthority?.streak, 9);
      assert.equal(landed.nineRingAuthority?.target?.grade, 'bullseye');
      assert.equal(landed.nineRingAuthority?.target?.horizontalMetres,
        landed.practiceTarget?.settlement?.horizontalMetres, 'Renderer scoring and host-accepted landing must agree');
      assert.ok(landed.nineRingArt.drawCount > 0, 'The finished route board must be visible from the landing camera');
      assert.equal(landed.nightPreview, true, 'The authored landing board must be checked in nighttime lighting');
      assert.ok(screenshots.every(entry => entry.state.draws <= 150 && entry.state.triangles <= 120_000),
        'The isolated nine-ring art must stay within main summit draw and triangle budgets');
    }
    assert.deepEqual(errors, []);
    return { initial, lift, touchdown, landed, walkedAfterLanding: landed };
  }
  let ringEvidence;
  if (withRings) {
    assert.equal(lift.rings?.count, 3);
    assert.deepEqual(lift.rings.passed, [], 'No ring is passed at takeoff');
    await watch(() => {
      const { rings } = window.__snowWingReview.getState();
      return rings?.draws > 0 && rings.passed.length < 2;
    });
    const visible = await capture('f1-glide-rings');
    assert.ok(visible.rings.draws > 0 && visible.rings.passed.length < 2,
      'The ring screenshot must show the course before passing the second ring');
    ringEvidence = { visible };
  }
  const steady = await watch(() => {
    const s = window.__snowWingReview.getState();
    return s.flight?.phase === 'glide' && s.flight.speed === 15 && s.wing.draws === 1;
  });
  const straight = await watch(time => window.__snowWingReview.getState().flight.elapsed >= time + 2, steady.flight.elapsed);
  const ratio = (straight.flight.horizontalMetres - steady.flight.horizontalMetres) /
    (steady.flight.height - straight.flight.height);
  assert.ok(Math.abs(ratio - 6) < 1e-7, 'Neutral browser flight did not retain the 6:1 glide ratio');
  await capture('f1-steady-glide');
  if (ringEvidence) {
    const completed = await watch(() => {
      const s = window.__snowWingReview.getState();
      return s.flight?.phase === 'glide' && s.rings?.passed.length === 3;
    });
    assert.deepEqual(completed.rings.passed, ['ring-1', 'ring-2', 'ring-3']);
    ringEvidence.completed = completed;
  }

  const banked = await hold('a', async () => {
    await watch(() => window.__snowWingReview.getState().flight.bank <= -.5);
    return capture('f1-banked-wing');
  });
  assert.ok(banked.flight.bank <= -.5 && banked.flight.bank >= -35 * Math.PI / 180 - 1e-9);
  assert.equal(banked.wing.bank, banked.flight.bank);
  assert.equal(banked.wing.draws, 1);
  assert.equal(banked.flight.speed, 15);
  await watch(() => window.__snowWingReview.getState().flight.bank === 0);

  const stalled = await hold('s', async () => {
    await watch(() => window.__snowWingReview.getState().flight.phase === 'settling');
    return capture('f1-soft-stall');
  });
  assert.equal(stalled.flight.stallCue, 'settling');
  const cues = stalled.events.filter(entry => entry.kind === 'stall-cue').map(entry => entry.value);
  assert.deepEqual(cues.slice(-3), ['flutter', 'dim', 'settling']);
  assert.equal(stalled.wing.draws, 1);
  const afterHold = await watch(time => window.__snowWingReview.getState().flight.elapsed >= time + 1, stalled.flight.elapsed);
  const sink = (stalled.flight.height - afterHold.flight.height) / (afterHold.flight.elapsed - stalled.flight.elapsed);
  assert.ok(Math.abs(sink - 6) < 1e-7, 'Settling did not maintain the 6 m/s descent cap');

  const recovered = await hold('w', () => watch(() => window.__snowWingReview.getState().flight.phase === 'glide'));
  const held = recovered.events.findLast(entry => entry.kind === 'down' && entry.value === 'KeyW');
  const recoveredAt = recovered.events.findLast(entry => entry.kind === 'phase' && entry.value === 'glide');
  assert.ok(Math.abs(recoveredAt.elapsed - held.elapsed - 1) < .018, 'Recovery did not follow one second of continuous dive');
  await capture('f1-recovered');
  await watch(() => {
    const s = window.__snowWingReview.getState();
    return s.flight.phase === 'landed' && !s.wing.visible && s.wing.draws === 0;
  }, null, 85_000);
  const landed = await capture('f1-touchdown');
  assert.equal(landed.flight.touchdown, 'soft');
  if (withTarget) {
    assert.equal(landed.practiceTarget.settlement?.targetId, 'practice-finish');
    assert.equal(landed.practiceTarget.settlement?.touchdown, landed.flight.touchdown);
    assert.ok(Number.isFinite(landed.practiceTarget.settlement?.horizontalMetres));
    assert.ok(landed.practiceTarget.settlement?.horizontalMetres >= 0);
    const targetText = await p.locator('#target-reading').evaluate(output => output.value);
    assert.match(targetText, /练习落靶.*距心.*m/);
  }
  assert.equal(landed.flight.usesBothHands, false);
  assert.ok(landed.claimed && landed.registration.snowWingEligible);
  if (ringEvidence) assert.deepEqual(landed.rings.passed, ringEvidence.completed.rings.passed);
  const { east, north, height, heading } = landed.flight;
  assert.deepEqual(landed.position, { east, north, height });
  assert.equal(landed.groundHeading, heading);
  await hold('w', () => watch(({ east, north, heading }) => {
    const { position } = window.__snowWingReview.getState();
    return (position.east - east) * Math.sin(heading) + (position.north - north) * Math.cos(heading) >= 1;
  }, { east, north, heading }, 10_000));
  const walkedAfterLanding = await capture('f1-walk-after-touchdown');
  assert.equal(walkedAfterLanding.position.height, height);
  assert.ok(!walkedAfterLanding.wing.visible && walkedAfterLanding.wing.draws === 0);
  assert.deepEqual(walkedAfterLanding.flight, landed.flight);
  assert.deepEqual(errors, [], 'The snow-wing preview reported a browser or resource error');
  return { initial, outside, unregisteredRack, denied, registered, deskRepeat, claimed, duplicate,
    lift, steady, straight, ratio, ringEvidence, banked, stalled, afterHold, sink, recovered, held, recoveredAt, landed,
    walkedAfterLanding };
}

await mkdir(output, { recursive: true });
let walkthrough;
try {
  walkthrough = await main();
} catch (error) {
  failure = String(error);
  if (p) {
    try { stateAtFailure = await timed('failure state', getState(), 4_000); } catch {}
  }
  throw error;
} finally {
  for (const [name, close] of [
    ['context', () => context?.close()], ['browser', () => browser?.close()], ['Vite', () => server?.close()],
  ]) {
    try { await timed('close ' + name, Promise.resolve().then(close), 15_000); }
    catch (error) { teardownErrors.push(String(error)); }
  }
  const evidence = {
    head: git('rev-parse', 'HEAD'), browserVersion, viewport, pins, screenshots, walkthrough, errors, teardownErrors, failure,
    servedCompiledBundle: Boolean(builtDir),
    stateAtFailure, elapsedMs: Math.round(performance.now() - started), passed: !failure && teardownErrors.length === 0,
    fixture: 'Isolated summit P-1/P-4/F-7 scene. Real browser keys walk from outside through the lodge to the registry and wing rack. Flight uses the 12× evidence clock and a flat terrain fallback outside P-1.' +
      (withRings ? ' In this run, a neutral glide passes three surveyed rings in order before the turning and recovery checks.' : '') +
      (withTarget ? ' The target is an isolated neutral-landing practice fixture, not the official ZD-08 world-host footslope course.' : '') +
      (straightTarget ? ' The native keyboard takeoff is followed by hands-off neutral flight and a surveyed bullseye touchdown.' : '') +
      (nineCourse ? ' Nine surveyed rings each score a clean accepted-frame forward crossing with real rendered pennants and an authored landing board.' : '') +
      (builtDir ? ' Served from the compiled static release candidate rather than the Vite dev server.' : ''),
  };
  await writeFile(path.join(output, 'snow-wing-browser-evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({ passed: evidence.passed, elapsedMs: evidence.elapsedMs, screenshots: screenshots.length,
    ratio: walkthrough?.ratio, stallSink: walkthrough?.sink, rings: walkthrough?.ringEvidence?.completed.rings.passed,
    practiceTarget: walkthrough?.landed.practiceTarget?.settlement,
    nineCourse: nineCourse && { score: walkthrough?.landed.rings?.score, render: walkthrough?.landed.nineRingArt,
      authority: walkthrough?.landed.nineRingAuthority },
    errors, teardownErrors, failure }));
  if (!failure) assert.deepEqual(teardownErrors, [], 'A fixture process failed to close cleanly');
}
