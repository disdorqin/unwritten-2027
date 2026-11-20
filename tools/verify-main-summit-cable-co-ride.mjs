import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mountSummitCableCoRideServer } from './main-summit-cable-co-ride-fixture.ts';

const checkout = fileURLToPath(new URL('../', import.meta.url));
const root = path.join(checkout, 'tools', 'voxel-tavern');
const output = process.argv[2] && path.resolve(process.argv[2]);
assert.ok(output, 'Usage: node --import tsx tools/verify-main-summit-cable-co-ride.mjs OUTPUT');
await mkdir(output, { recursive: true });
const lookup = createRequire(path.join(checkout, 'package.json'));
const lookupVite = createRequire(path.join(root, 'package.json'));
const vite = path.resolve(path.dirname(lookupVite.resolve('vite/package.json')), 'dist/node/index.js');
const { build, preview } = await import(pathToFileURL(vite));
const { chromium } = lookup('playwright');

const entry = 'main-summit-cable-review.html';
const viewport = { width: 768, height: 432 };
const report = {
  source: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: checkout, encoding: 'utf8' }).trim(),
  status: 'failed', viewport, transport: {}, checks: [], screenshots: [], errors: [],
};
let browser, server, fixture, outDir;
const clients = [];

const snapshot = page => page.evaluate(() => window.p2.render());
const feetDistance = (a, b) => Math.hypot(a.east - b.east, a.north - b.north, a.height - b.height);

async function stateWhen(page, expected) {
  const handle = await page.waitForFunction(({ time, seated, roster, rejected, peerVisible }) => {
    const state = window.p2?.render();
    const coRide = state?.coRide;
    if (!coRide?.connected || !coRide.selfId) return false;
    if (time !== undefined && state.nowMs !== time) return false;
    if (seated !== undefined && state.rider !== seated) return false;
    if (roster !== undefined && coRide.riders.length !== roster) return false;
    if (rejected !== undefined && coRide.rejected !== rejected) return false;
    if (peerVisible && coRide.peerDraws < 1) return false;
    return state;
  }, expected, { polling: 100, timeout: 12_000 });
  const state = await handle.jsonValue();
  await handle.dispose();
  return state;
}

async function openClient(name, port) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  clients.push({ name, context, page });
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204, body: '' }));
  const sockets = [];
  report.transport[name] = sockets;
  page.on('websocket', socket => {
    const url = new URL(socket.url());
    if (url.pathname !== '/p2-co-ride') return;
    const stats = { url: socket.url(), sent: 0, received: 0 };
    sockets.push(stats);
    socket.on('framesent', () => { stats.sent++; });
    socket.on('framereceived', () => { stats.received++; });
    socket.on('socketerror', error => report.errors.push(`${name} socket: ${error}`));
  });
  page.on('pageerror', error => report.errors.push(`${name} page: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') report.errors.push(`${name} console: ${message.text()}`);
  });
  page.on('response', response => {
    if (response.status() >= 400) report.errors.push(`${name} HTTP ${response.status()}: ${response.url()}`);
  });
  page.on('requestfailed', request => {
    report.errors.push(`${name} request: ${request.url()} ${request.failure()?.errorText}`);
  });
  const response = await page.goto(`http://127.0.0.1:${port}/${entry}?coRide=1`, { waitUntil: 'load' });
  assert.equal(response?.status(), 200);
  await stateWhen(page, { time: 0, seated: false, roster: 0 });
  return page;
}

function assertSharedCabin(a, b, label) {
  assert.equal(a.nowMs, b.nowMs, `${label}: clock differs`);
  assert.notEqual(a.coRide.selfId, b.coRide.selfId, `${label}: contexts have identical player IDs`);
  assert.deepEqual(a.coRide.riders, b.coRide.riders, `${label}: clients disagree on cabin roster`);
  const assigned = [a, b].map(state => state.coRide.riders.find(rider => rider.id === state.coRide.selfId));
  assert.ok(assigned.every(rider => rider?.cabinIndex === 0), `${label}: both riders must be in cabin A`);
  assert.deepEqual(assigned.map(rider => rider.seat).sort(), [0, 1], `${label}: seat assignments overlap`);
  assert.ok(a.coRide.seatFeet && b.coRide.seatFeet, `${label}: co-rider feet are missing`);
  const separation = feetDistance(a.coRide.seatFeet, b.coRide.seatFeet);
  assert.ok(separation > .25 && separation < 3, `${label}: invalid in-cabin separation ${separation}`);
  assert.ok(Math.abs(a.coRide.seatFeet.height - b.coRide.seatFeet.height) < 1e-8, `${label}: cabin floors differ`);
  for (const state of [a, b]) {
    const { east, north, height } = state.coRide.seatFeet;
    assert.ok(Math.hypot(state.camera[0] - east, state.camera[2] + north) < 1e-8,
      `${label}: camera is detached from its assigned seat`);
    assert.ok(Math.abs(state.camera[1] - height - 1.43) < 1e-8, `${label}: cabin camera eye height changed`);
  }
  return separation;
}

async function peerView(page) {
  let state = await snapshot(page);
  for (let turn = 0; turn < 24 && state.coRide.peerDraws === 0; turn++) {
    await page.keyboard.press('ArrowRight');
    state = await snapshot(page);
  }
  assert.ok(state.coRide.peerDraws > 0, 'A full cabin look-around never rendered the other passenger');
  return state;
}

async function capture(page, filename) {
  await page.screenshot({ path: path.join(output, filename), timeout: 20_000 });
  report.screenshots.push(filename);
}

try {
  report.step = 'Vite build and loopback ride authority';
  outDir = await mkdtemp(path.join(output, '.preview-'));
  await build({ root, configFile: false, logLevel: 'warn', build: { outDir,
    emptyOutDir: false, rollupOptions: { input: path.join(root, entry) } } });
  server = await preview({ root, configFile: false, logLevel: 'warn', build: { outDir },
    preview: { host: '127.0.0.1', port: 0 } });
  fixture = mountSummitCableCoRideServer(server.httpServer);
  const args = process.platform === 'win32' ? ['--use-gl=angle', '--use-angle=d3d11'] :
    ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'];
  const executablePath = process.env.CHROMIUM_PATH ??
    (!existsSync(chromium.executablePath()) && existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  browser = await chromium.launch({ executablePath, args });
  report.browser = browser.version();
  const { port } = server.httpServer.address();
  const a = await openClient('A', port);
  const b = await openClient('B', port);
  const clock = await a.evaluate(() => ({ legMs: window.p2.legMs, travelMs: window.p2.travelMs }));
  assert.deepEqual(await b.evaluate(() => ({ legMs: window.p2.legMs, travelMs: window.p2.travelMs })), clock);
  report.clock = clock;

  report.step = 'native E rejects the middle of the platform and allocates two distinct seats';
  for (let i = 0; i < 4; i++) await a.keyboard.press('KeyW');
  assert.equal((await snapshot(a)).progress, .5);
  await a.keyboard.press('KeyE');
  report.checks.push({ label: 'invalid boarding location rejected',
    A: await stateWhen(a, { time: 0, seated: false, roster: 0, rejected: true }) });
  for (let i = 0; i < 4; i++) await a.keyboard.press('KeyS');
  assert.equal((await snapshot(a)).progress, 0);
  await a.keyboard.press('KeyE');
  await stateWhen(a, { time: 0, seated: true, roster: 1 });
  await b.keyboard.press('KeyE');
  const seated = await Promise.all([a, b].map(page => stateWhen(page, { time: 0, seated: true, roster: 2 })));
  report.checks.push({ label: 'two browser contexts boarded cabin A', A: seated[0], B: seated[1],
    separation: assertSharedCabin(...seated, 'boarding') });

  report.step = 'travel uses one clock and both views can render the other rider';
  const intoCloudMs = clock.legMs - clock.travelMs + 70_000;
  fixture.setTime(intoCloudMs);
  await Promise.all([a, b].map(page => stateWhen(page, { time: intoCloudMs, seated: true, roster: 2 })));
  const travelling = [await peerView(a), await peerView(b)];
  for (const state of travelling) {
    assert.equal(state.phase, 'enter-cloud');
    assert.equal(state.hintsVisible, false);
    assert.ok(state.drawCalls > 0 && state.coRide.peerDraws > 0);
  }
  report.checks.push({ label: 'both contexts rendered their co-rider during travel', A: travelling[0], B: travelling[1],
    separation: assertSharedCabin(...travelling, 'entering cloud') });
  await capture(a, 'p2-co-ride-passenger.png');

  report.step = 'mid-travel E is rejected independently in the whiteout';
  const whiteoutMs = clock.legMs - clock.travelMs + 100_000;
  fixture.setTime(whiteoutMs);
  await Promise.all([a, b].map(page => stateWhen(page, { time: whiteoutMs, seated: true, roster: 2 })));
  assert.equal((await snapshot(b)).coRide.rejected, false);
  await a.keyboard.press('KeyE');
  const aRejected = await stateWhen(a, { time: whiteoutMs, seated: true, roster: 2, rejected: true });
  assert.equal((await snapshot(b)).coRide.rejected, false, 'A rejection must not affect passenger B');
  await b.keyboard.press('KeyE');
  const bRejected = await stateWhen(b, { time: whiteoutMs, seated: true, roster: 2, rejected: true });
  for (const state of [aRejected, bRejected]) {
    assert.equal(state.phase, 'whiteout');
    assert.equal(state.whiteout, true);
    assert.equal(state.hintsVisible, false);
    assert.equal(state.drawCalls, 0, 'Whiteout should render the blank weather scene');
    assert.equal(state.coRide.peerDraws, 0);
  }
  report.checks.push({ label: 'whiteout retains both poses and rejects each attempted exit', A: aRejected, B: bRejected,
    separation: assertSharedCabin(aRejected, bRejected, 'whiteout') });
  await capture(a, 'p2-co-ride-whiteout.png');

  report.step = 'both cameras retain high-altitude poses from the authority';
  const beforeDockMs = clock.legMs - 1;
  fixture.setTime(beforeDockMs);
  const high = await Promise.all([a, b].map(page => stateWhen(page, { time: beforeDockMs, seated: true, roster: 2 })));
  for (const state of high) {
    assert.equal(state.phase, 'arrival');
    assert.equal(state.station, null);
    assert.ok(state.coRide.seatFeet.height > 655.35, 'The seat height must survive the old packed-coordinate limit');
  }
  assert.equal((await a.evaluate(() => window.p2.time(0))).nowMs, beforeDockMs);
  assert.equal((await snapshot(b)).nowMs, beforeDockMs);
  report.checks.push({ label: 'shared clock and both high-altitude seat poses survive a local clock request',
    A: high[0], B: high[1], separation: assertSharedCabin(...high, 'before docking') });

  report.step = 'independent exits on the surveyed summit platform and disconnect releases a seat';
  fixture.setTime(clock.legMs);
  const arrived = await Promise.all([a, b].map(page => stateWhen(page, { time: clock.legMs, seated: true, roster: 2 })));
  assertSharedCabin(...arrived, 'arrival');
  for (const state of arrived) assert.equal(state.station, 'summit');
  await a.keyboard.press('KeyE');
  const aExited = await stateWhen(a, { time: clock.legMs, seated: false, roster: 1 });
  const bRemains = await stateWhen(b, { time: clock.legMs, seated: true, roster: 1 });
  assert.equal(bRemains.coRide.riders[0].id, bRemains.coRide.selfId);
  await b.keyboard.press('KeyE');
  const bExited = await stateWhen(b, { time: clock.legMs, seated: false, roster: 0 });
  for (const state of [aExited, bExited]) {
    assert.equal(state.station, 'summit');
    assert.equal(state.progress, 0);
    assert.equal(state.coRide.seatFeet, null);
    assert.ok(Math.abs(state.camera[1] - 801.60) < 1e-8, 'Wrong summit approach height');
  }
  assert.deepEqual(aExited.camera, bExited.camera, 'Both exits should land on the same surveyed approach');
  report.checks.push({ label: 'both riders got off at the same station without affecting one another',
    A: aExited, B: bExited, remaining: bRemains });
  await b.keyboard.press('KeyE');
  const returnedToCabin = await stateWhen(b, { time: clock.legMs, seated: true, roster: 1 });
  assert.equal(returnedToCabin.coRide.riders[0].seat, 0, 'The vacated seat should be reusable');
  await stateWhen(a, { time: clock.legMs, seated: false, roster: 1 });
  await clients[1].context.close();
  const disconnected = await stateWhen(a, { time: clock.legMs, seated: false, roster: 0 });
  report.checks.push({ label: 'reboarded seat is released when that browser context closes',
    reboarded: returnedToCabin, A: disconnected });

  for (const [name, sockets] of Object.entries(report.transport)) {
    assert.equal(sockets.length, 1, `${name}: expected one real co-ride WebSocket`);
    assert.ok(sockets[0].sent >= 3 && sockets[0].received >= 8, `${name}: insufficient live WebSocket traffic`);
  }
  assert.deepEqual(report.errors, []);
  report.status = 'passed';
} catch (error) {
  report.failure = error.stack ?? String(error);
  report.last = Object.fromEntries(await Promise.all(clients.map(async ({ name, page }) =>
    [name, page.isClosed() ? null : await snapshot(page).catch(() => null)])));
  process.exitCode = 1;
} finally {
  for (const close of [() => browser?.close(), () => fixture?.close(), () => server?.close(),
    () => outDir && rm(outDir, { recursive: true, force: true })]) {
    try { await close(); }
    catch (error) {
      report.errors.push(String(error));
      report.status = 'failed';
      process.exitCode = 1;
    }
  }
  await writeFile(path.join(output, 'summit-cable-co-ride-result.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, step: report.step, checks: report.checks.length,
    screenshots: report.screenshots, errors: report.errors, failure: report.failure }));
}
