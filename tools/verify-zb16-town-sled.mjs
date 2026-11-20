import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [checkoutArg = '.', outputArg = 'zb16-town-sled-evidence', mode] = process.argv.slice(2);
assert.ok(!mode || mode === '--build-only', 'Third argument must be --build-only');
const checkout = path.resolve(checkoutArg);
const output = path.resolve(outputArg);
const require = createRequire(path.join(checkout, 'package.json'));
const helper = process.env.ZB16_LOOPBACK_HELPER ??
  path.join(checkout, 'tools', 'jx1-formal', 'app-build-and-loopback.mjs');
const { build, serve, swiftShader } = await import(pathToFileURL(path.resolve(helper)).href);
const { chromium } = require('@playwright/test');
const timeout = 45_000;
const travelTimeout = 320_000;

function instrument(source) {
  const access = 'const sledTrackView = createSledTrackView(scene, sledGroundAt);';
  const interact = 'function interact() {\n  currentAction()?.run();';
  assert.equal(source.split(access).length, 2, 'Expected one sled observer anchor');
  assert.equal(source.split(interact).length, 2, 'Expected one real world-action route');
  return source.replace(access, `
let zb16NoteSledAction: ((label: string | undefined) => void) | undefined;
if (import.meta.env.MODE === 'town-rehearsal' && location.hostname === '127.0.0.1' &&
    new URLSearchParams(location.search).has('zb16TownSled')) {
  let staged = false, frame = 0, drawCalls = 0;
  let mountedOnce = false, released = false, surpriseDismount = false;
  const inputs: Record<string, unknown>[] = [];
  const actions: { label: string; state: ReturnType<typeof pose> }[] = [];
  const tumbles: ReturnType<typeof pose>[] = [];
  function pose() {
    const parked = sledRide.parked();
    return { x, n, ground, yaw, frame, drawCalls, walking, canMove: moveAllowed(),
      active: sledRide.active(), recovery: sledRide.recovering(), roll: sledRide.roll(), speed: sledRide.speed(),
      sled: { ...sledRide.spot }, parked: parked ? { ...parked } : null,
      rackDistance: Math.min(...sledRacks.map(rack => Math.hypot(rack.x - x, rack.n - n))),
      action: currentAction()?.label, surpriseDismount };
  }
  zb16NoteSledAction = label => {
    if (label === '下橇') released = true;
    if (label === '乘雪橇' || label === '下橇' || label === '重新上橇') actions.push({ label, state: pose() });
  };
  renderer.domElement.addEventListener('town-frame-profile', event => {
    frame++;
    drawCalls = (event as CustomEvent).detail.calls;
    if (sledRide.active()) mountedOnce = true;
    if (mountedOnce && !released && !sledRide.active()) surpriseDismount = true;
    if (sledRide.recovering() && Math.abs(sledRide.roll()) > .03 && tumbles.length < 120) tumbles.push(pose());
  });
  for (const kind of ['keydown', 'keyup']) document.addEventListener(kind, event => {
    if (event instanceof KeyboardEvent && ['KeyE', 'KeyW', 'KeyS'].includes(event.code) && !event.repeat)
      inputs.push({ kind, key: event.code, trusted: event.isTrusted });
  }, true);
  Object.defineProperty(window, '__zb16TownSled', { value: {
    stage() {
      if (staged || sledRide.active() || !moveAllowed() || homeReturn) throw new Error('Enter the ordinary outdoor view first');
      staged = true;
      const rack = sledRacks.find(site => site.x === 378 && site.n === 303);
      if (!rack) throw new Error('The existing north-slope rack is missing');
      const feet = dryTownLandingHeight(rack.x, rack.n, rack.y);
      if (feet === undefined || !settleTownLanding(rack.x, rack.n, feet) ||
          Math.hypot(x - rack.x, n - rack.n) > .001) throw new Error('North-slope rack approach is obstructed');
      turnView(160 * Math.PI / 180 - yaw, -pitch);
      storeWalkView(walkRender);
      walkCurrent.copy(walkRender);
      walkPrevious.copy(walkRender);
      renderer.domElement.focus({ preventScroll: true });
    },
    read() { return { ...pose(), inputs: inputs.slice(), actions: actions.slice(), tumbles: tumbles.slice() }; },
  } });
}
${access}`).replace(interact, `function interact() {
  const action = currentAction();
  action?.run();
  zb16NoteSledAction?.(action?.label);`);
}

async function wait(page, predicate, arg, limit = timeout) {
  const handle = await page.waitForFunction(predicate, arg, { timeout: limit });
  try { return await handle.jsonValue(); } finally { await handle.dispose(); }
}

const read = page => page.evaluate(() => window.__zb16TownSled.read());
const distance = (a, b) => Math.hypot(a.x - b.x, a.n - b.n);

async function holdKey(page, key, task) {
  await page.keyboard.down(key);
  try { return await task(); } finally { await page.keyboard.up(key); }
}

await mkdir(output, { recursive: true });
const temp = await mkdtemp(path.join(tmpdir(), 'zb16-town-sled-'));
const dist = path.join(temp, 'dist');
const evidence = { status: 'building', candidate: {}, errors: [], connectionLogs: [],
  scope: 'real town and inputs after one native landing at the existing rack; no test-triggered crash' };
let server, browser, page;
try {
  for (const file of ['tools/voxel-tavern/town-blockout/viewer.ts', 'tools/voxel-tavern/town-blockout/sled-ride.ts'])
    evidence.candidate[file] = createHash('sha256').update(await readFile(path.join(checkout, file))).digest('hex');
  await build(checkout, dist, instrument);
  evidence.status = 'build-only passed';
  if (mode !== '--build-only') {
    const service = await serve(checkout, dist, require, evidence.connectionLogs);
    server = service.server;
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH, args: swiftShader });
    page = await browser.newPage({ viewport: { width: 1000, height: 650 }, deviceScaleFactor: 1 });
    page.on('pageerror', error => evidence.errors.push(error.message));
    evidence.status = 'entering';
    const response = await page.goto(`${service.url}/town-blockout.html?profile&zb16TownSled`, { timeout, waitUntil: 'domcontentloaded' });
    assert.equal(response?.status(), 200);
    await wait(page, () => Boolean(window.__zb16TownSled));
    await page.locator('#jump').selectOption({ label: '东北纪念馆' });
    evidence.entrance = await wait(page, () => {
      const s = window.__zb16TownSled.read();
      return s.walking && s.canMove && s.drawCalls > 0 && s;
    });
    await page.evaluate(() => window.__zb16TownSled.stage());
    await wait(page, () => window.__zb16TownSled.read().action === '乘雪橇');
    await page.keyboard.press('e');
    evidence.mounted = await wait(page, () => {
      const s = window.__zb16TownSled.read();
      return s.active && s.actions.some(a => a.label === '乘雪橇') && s;
    });

    evidence.status = 'riding for natural tumble';
    evidence.tumble = await holdKey(page, 'w', () => wait(page, () => {
      const s = window.__zb16TownSled.read();
      return (s.tumbles.length || s.surpriseDismount) && s;
    }, undefined, travelTimeout));
    assert.ok(evidence.tumble.tumbles.length, 'No native rotation before the rider was dropped');
    assert.ok(evidence.tumble.tumbles.every(frame => frame.active && !frame.parked));
    assert.equal(evidence.tumble.surpriseDismount, false);
    const recovered = await wait(page, () => {
      const s = window.__zb16TownSled.read();
      return !s.recovery && s.active && s.action === '下橇' && s;
    });
    assert.ok(distance(recovered.sled, evidence.mounted.sled) > 5);

    evidence.status = 'leaving mid-route';
    await page.keyboard.press('e');
    evidence.parked = await wait(page, () => {
      const s = window.__zb16TownSled.read();
      return !s.active && s.parked && s.actions.some(a => a.label === '下橇') && s;
    });
    assert.ok(evidence.parked.rackDistance > 2.4);
    evidence.status = 'walking away on foot';
    evidence.walkedAway = await holdKey(page, 's', () => wait(page, () => {
      const s = window.__zb16TownSled.read();
      return s.parked && Math.hypot(s.x - s.parked.x, s.n - s.parked.n) > 2.65 &&
        s.action !== '重新上橇' && s;
    }, undefined, travelTimeout));
    evidence.status = 'approaching the same sled';
    await holdKey(page, 'w', () => wait(page, () => window.__zb16TownSled.read().action === '重新上橇',
      undefined, travelTimeout));
    await page.keyboard.press('e');
    evidence.remounted = await wait(page, () => {
      const s = window.__zb16TownSled.read();
      return s.active && !s.parked && s.actions.some(a => a.label === '重新上橇') && s;
    });
    const remountPose = evidence.remounted.actions.find(a => a.label === '重新上橇').state.sled;
    assert.equal(distance(remountPose, evidence.parked.parked), 0);
    assert.equal(remountPose.yaw, evidence.parked.parked.yaw);
    assert.deepEqual(evidence.remounted.actions.map(a => a.label), ['乘雪橇', '下橇', '重新上橇']);
    for (const key of ['KeyE', 'KeyW', 'KeyS']) assert.ok(evidence.remounted.inputs.some(e => e.key === key && e.trusted));
    assert.deepEqual(evidence.errors, []);
    evidence.status = 'passed';
  }
} catch (error) {
  if (page) evidence.lastFrame = await read(page).catch(() => undefined);
  evidence.failedAt = evidence.status;
  evidence.status = 'failed';
  evidence.failure = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  await writeFile(path.join(output, 'zb16-town-sled.json'), JSON.stringify(evidence, null, 2) + '\n');
  await browser?.close();
  await server?.close();
  await rm(temp, { force: true, recursive: true });
}
console.log(JSON.stringify({ status: evidence.status, output, failedAt: evidence.failedAt, failure: evidence.failure }));
