import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [checkoutPath, outputPath, mode] = process.argv.slice(2);
assert.ok(checkoutPath && outputPath && (mode === undefined || mode === '--rings'),
  'Usage: node tools/verify-snow-wing-browser.mjs <checkout> <output> [--rings]');
const withRings = mode === '--rings';
const checkout = path.resolve(checkoutPath);
const output = path.resolve(outputPath);
const viteRoot = path.join(checkout, 'tools/voxel-tavern');
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
  ['P-1', 'cb47ce2', 'main-summit-block.ts', 'a0dd7b83be27a461a177dd6032114aef96bef6d2'],
  ['P-4', '90019a5', 'main-summit-registration.ts', '80b739784292592010f61552bc7325034d8ff33a'],
  ['F-7', '0981021', 'flight-equipment-visuals.ts', 'eb7e008899c64bf2b777d206ea8f306086a0270a'],
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
    assert.equal(blob, expected, `${part} does not match the reviewed source pin`);
    return { part, ref, file, blob };
  });
  server = await timed('Vite start', createServer({
    root: viteRoot, configFile: path.join(viteRoot, 'vite.config.ts'),
    cacheDir: path.join(output, '.vite-cache'),
    optimizeDeps: { noDiscovery: true, include: [] }, logLevel: 'warn',
    server: { host: '127.0.0.1', port: 0, strictPort: true, hmr: false },
  }), timeLeft(20_000));
  await timed('Vite listen', server.listen(), timeLeft(12_000));
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
  const reviewUrl = `http://127.0.0.1:${port}/main-summit-snow-wing-review.html?proof=1${withRings ? '&rings=1' : ''}`;
  const response = await p.goto(reviewUrl, {
    waitUntil: 'domcontentloaded', timeout: timeLeft(30_000),
  });
  assert.equal(response?.status(), 200);
  const initial = await watch(() => window.__snowWingReview?.getState().frame > 1);
  assert.deepEqual(initial.position, { east: 62.5, north: 1006, height: 800 });
  assert.equal(initial.flightTimeScale, 12);
  assert.ok(!initial.claimed && !initial.registration.snowWingEligible && !initial.wing.visible);
  if (withRings) assert.deepEqual(initial.rings?.passed ?? [], []);
  else assert.equal(initial.rings ?? null, null);
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
    stateAtFailure, elapsedMs: Math.round(performance.now() - started), passed: !failure && teardownErrors.length === 0,
    fixture: 'Isolated summit P-1/P-4/F-7 scene. Real browser keys walk from outside through the lodge to the registry and wing rack. Flight uses the 12× evidence clock and a flat terrain fallback outside P-1.' +
      (withRings ? ' In this run, a neutral glide passes three surveyed rings in order before the turning and recovery checks.' : ''),
  };
  await writeFile(path.join(output, 'snow-wing-browser-evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({ passed: evidence.passed, elapsedMs: evidence.elapsedMs, screenshots: screenshots.length,
    ratio: walkthrough?.ratio, stallSink: walkthrough?.sink, rings: walkthrough?.ringEvidence?.completed.rings.passed,
    errors, teardownErrors, failure }));
  if (!failure) assert.deepEqual(teardownErrors, [], 'A fixture process failed to close cleanly');
}
