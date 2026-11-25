import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const [origin, output, stage = 'all'] = process.argv.slice(2);
assert.ok(origin && output, 'Supply a production-preview loopback URL and an evidence directory');
assert.ok(['all', 'books'].includes(stage));
const url = new URL('/?profile', origin);
assert.equal(url.protocol, 'http:');
assert.equal(url.hostname, '127.0.0.1');

const viewport = { width: 960, height: 570 };
const deviceScaleFactor = Number(process.env.ZA19_DPR ?? 1);
assert.ok(deviceScaleFactor >= .25 && deviceScaleFactor <= 2);
const hudPattern = /东\s*(-?[\d.]+)\s*m\s*·\s*北\s*(-?[\d.]+)\s*m/;
const turn = 2 * Math.PI;
const angleTo = (from, to) => ((to - from + Math.PI) % turn + turn) % turn - Math.PI;
const books = [[214.09, 219.38], [214.66, 219.38]];
const hall = [[226, 212], [226, 216], [226, 223], [218.2, 223], [218.2, 219.38]];
const ordinaryStart = [223, 180];
// This follows the existing spiral route established by tests/town-blockout-tower.test.ts.
const local = (x, z) => [226 + x, 223 - z];
const corners = [[3.21875, 3.21875], [3.21875, -3.21875], [-3.21875, -3.21875], [-3.21875, 3.21875]];
const lookout = local(-.48, 1.29);
const serverTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
const report = {
  url: url.href, stage, viewport, deviceScaleFactor, checkpoints: [], wirePoses: [], nightSamples: [], books: [], captures: [],
  pageErrors: [], consoleErrors: [], requestFailures: [], httpErrors: [],
};
await mkdir(output, { recursive: true });

let browser;
let page;
let measuring = true;
let sequence = 0;
let movementId = 0;

async function readPose() {
  const reading = await page.evaluate(() => ({
    hud: document.querySelector('#position')?.textContent ?? '',
    action: document.querySelector('#world-action')?.textContent ?? '',
    status: document.querySelector('#town-presence-status')?.textContent ?? '',
    cameraY: window.__za19Frame?.cameraY,
    calls: window.__za19Frame?.calls,
    triangles: window.__za19Frame?.triangles,
  }));
  const point = hudPattern.exec(reading.hud);
  return {
    ...reading, east: point ? Number(point[1]) : NaN, north: point ? Number(point[2]) : NaN,
    ground: Number.isFinite(reading.cameraY) ? reading.cameraY - 1.65 : NaN,
  };
}

async function waitForWire(predicate = pose => Boolean(pose), timeout = 16_000) {
  const deadline = Date.now() + timeout;
  while (!predicate(report.wirePoses.at(-1)) && Date.now() < deadline) await page.waitForTimeout(35);
  const pose = report.wirePoses.at(-1);
  assert.ok(predicate(pose), `No matching pose on the live Presence socket: ${JSON.stringify(pose)}`);
  return pose;
}

async function drag(dx, dy = 0, attempt = 0) {
  const anchor = await page.evaluate(({ dx, dy, attempt }) => {
    const canvas = document.querySelector('#scene canvas');
    const points = [[.48, .51], [.41, .37], [.40, .61], [.56, .45], [.37, .48]];
    for (let i = 0; i < points.length; i++) {
      const [fx, fy] = points[(i + attempt) % points.length];
      const x = Math.round(innerWidth * fx), y = Math.round(innerHeight * fy);
      if (x + dx > 0 && x + dx < innerWidth && y + dy > 0 && y + dy < innerHeight &&
        document.elementFromPoint(x, y) === canvas) return { x, y };
    }
  }, { dx, dy, attempt });
  assert.ok(anchor, 'No unobstructed pointer target on the scene canvas');
  await page.mouse.move(anchor.x, anchor.y);
  await page.mouse.down();
  try {
    await page.mouse.move(anchor.x + dx, anchor.y + dy, { steps: Math.max(2, Math.ceil(Math.hypot(dx, dy) / 55)) });
  } finally {
    await page.mouse.up();
  }
}

async function face(yaw) {
  for (let attempt = 0; attempt < 16; attempt++) {
    const first = await waitForWire();
    const delta = angleTo(first.yaw, yaw);
    if (Math.abs(delta) <= .006) return;
    const dx = Math.max(-350, Math.min(350, Math.round(delta / .003)));
    await drag(dx, 0, attempt);
    const until = Date.now() + 800;
    while (report.wirePoses.at(-1)?.seq === first.seq && Date.now() < until) await page.waitForTimeout(30);
    await page.waitForTimeout(120);
  }
  assert.fail(`Native mouse drag could not face ${yaw}`);
}

async function walk(target, label, tolerance = .24) {
  const [east, north] = target;
  for (let attempt = 0; attempt < 9; attempt++) {
    const from = await readPose();
    const dx = east - from.east, dn = north - from.north;
    const distance = Math.hypot(dx, dn);
    assert.ok(Number.isFinite(distance), JSON.stringify(from));
    if (distance <= tolerance) {
      report.checkpoints.push({ label, target, ...from, wire: report.wirePoses.at(-1) });
      return from;
    }
    // Backward walking gives a slow correction without triggering the double-W sprint.
    const backwards = distance < 1.5;
    await face(Math.atan2(dx, dn) + (backwards ? Math.PI : 0));
    const key = backwards ? 's' : 'w';
    await page.keyboard.down(key);
    try {
      const reached = await page.waitForFunction(({ id, pattern, from, east, north, dx, dn, distance, tolerance }) => {
        const point = new RegExp(pattern).exec(document.querySelector('#position')?.textContent ?? '');
        if (!point) return false;
        const x = Number(point[1]), n = Number(point[2]);
        const advance = ((x - from.east) * dx + (n - from.north) * dn) / distance;
        if (Math.hypot(x - east, n - north) <= tolerance || advance >= distance) return 'arrived';
        // Use the actual HUD movement heartbeat to distinguish a blocked route from slow rendering.
        const now = performance.now();
        const tracked = window.__za19Travel;
        if (tracked?.id !== id || advance > tracked.advance + .06) window.__za19Travel = { id, advance, started: now };
        else if (now - tracked.started > 18_000) return 'blocked';
        return false;
      }, { id: ++movementId, pattern: hudPattern.source, from, east, north, dx, dn, distance, tolerance: tolerance * .75 },
      { timeout: 23_000 + Math.ceil(distance * 13_000) });
      assert.equal(await reached.jsonValue(), 'arrived');
    } catch (error) {
      throw new Error(`Native walk stopped before ${label}: ${JSON.stringify(await readPose())}`, { cause: error });
    } finally {
      await page.keyboard.up(key);
    }
  }
  assert.fail(`Native walk did not settle at ${label}: ${JSON.stringify(await readPose())}`);
}

async function follow(points, prefix) {
  for (const [index, point] of points.entries()) await walk(point, `${prefix}-${index + 1}`);
}

async function action(label) {
  await page.waitForFunction(label => {
    const hint = document.querySelector('#world-action');
    return hint && !hint.hidden && hint.textContent.includes(label);
  }, label, { timeout: 15_000 });
  await page.keyboard.press('e');
}

async function readBook(title) {
  await action(`翻看${title}`);
  await page.waitForFunction(title => {
    const heading = document.querySelector('#place-title');
    return heading?.closest('dialog')?.open && heading.textContent.trim() === title;
  }, title, { timeout: 12_000 });
  return { title, text: (await page.locator('#place-text').textContent())?.trim(), ...await readPose() };
}

async function capture(label) {
  const reading = await readPose();
  assert.ok(reading.calls > 0 && reading.triangles > 0, JSON.stringify(reading));
  const filename = `${label}.png`;
  const png = await page.screenshot({ path: join(output, filename), timeout: 45_000 });
  report.captures.push({ filename, sha256: createHash('sha256').update(png).digest('hex'), ...reading });
}

async function openTown() {
  const context = await browser.newContext({ viewport, deviceScaleFactor, locale: 'zh-CN' });
  page = await context.newPage();
  page.on('pageerror', error => { if (measuring) report.pageErrors.push(String(error)); });
  page.on('console', message => {
    if (measuring && message.type() === 'error') report.consoleErrors.push(message.text());
  });
  page.on('requestfailed', request => {
    if (measuring) report.requestFailures.push({ url: request.url(), error: request.failure()?.errorText });
  });
  page.on('response', response => {
    if (measuring && response.status() >= 400) report.httpErrors.push({ url: response.url(), status: response.status() });
  });
  page.on('websocket', socket => {
    if (new URL(socket.url()).pathname !== '/presence') return;
    let serverEpochMs;
    socket.on('framereceived', ({ payload }) => {
      if (!measuring || typeof payload !== 'string') return;
      let frame;
      try { frame = JSON.parse(payload); } catch { return; }
      if (!frame || typeof frame !== 'object') return;
      if (frame.type === 'join' && frame.self === true && Number.isSafeInteger(frame.epochMs)) {
        serverEpochMs = frame.epochMs;
        if (frame.townNightWindow) report.nightSamples.push({ seq: ++sequence, source: 'join',
          serverEpochMs, snapshot: frame.townNightWindow });
      } else if (frame.type === 'clock' && Number.isSafeInteger(frame.epochMs)) {
        serverEpochMs = frame.epochMs;
      } else if (frame.type === 'event' && frame.kind === 'town-night-window' && frame.state && serverEpochMs !== undefined) {
        report.nightSamples.push({ seq: ++sequence, source: frame.kind, serverEpochMs, snapshot: frame.state });
      }
    });
    socket.on('framesent', ({ payload }) => {
      if (!Buffer.isBuffer(payload) || payload.byteLength !== 12 || payload.readUInt16LE(0) !== 0) return;
      report.wirePoses.push({
        east: payload.readUInt16LE(2) / 100, north: payload.readUInt16LE(4) / 100,
        height: payload.readUInt16LE(6) / 100, yaw: payload.readUInt16LE(8) * turn / 65536,
        seq: payload.readUInt16LE(10),
      });
    });
  });
  await page.addInitScript(() => {
    // Exercise the shipping mouse-drag fallback in headless Chromium.
    Object.defineProperty(Element.prototype, 'requestPointerLock', { value: undefined });
    document.addEventListener('town-frame-profile', event => { window.__za19Frame = event.detail; }, true);
  });
  const response = await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  assert.equal(response?.status(), 200);
  assert.equal(new URL(page.url()).pathname, '/');
  await page.locator('#scene canvas').waitFor({ state: 'visible', timeout: 90_000 });
  await page.waitForFunction(pattern => {
    const pos = document.querySelector('#position')?.textContent ?? '';
    return new RegExp(pattern).test(pos) && window.__za19Frame?.calls > 0;
  }, hudPattern.source, { timeout: 90_000 });
  const start = await readPose();
  assert.ok(Math.hypot(start.east - ordinaryStart[0], start.north - ordinaryStart[1]) < .25, JSON.stringify(start));
  assert.ok(Math.abs(start.ground - 12) < .15, JSON.stringify(start));
  await page.locator('#scene canvas').click({ position: { x: 430, y: 285 } });
  report.checkpoints.push({ label: 'ordinary-spawn', ...start, wire: await waitForWire() });
}

function scheduleShape({ snapshot, serverEpochMs }) {
  return snapshot && ['day', 'awaiting-beacon', 'night-window'].includes(snapshot.phase) &&
    Number.isSafeInteger(serverEpochMs) && Number.isSafeInteger(snapshot.beaconAt) &&
    Number.isSafeInteger(snapshot.morningBellAt) && snapshot.beaconAt < snapshot.morningBellAt &&
    serverEpochMs < snapshot.morningBellAt;
}

async function verifyBooks() {
  await follow(hall, 'hall');
  await walk(books[0], 'daily-ledger', .19);
  const ordinary = await readBook('活人账');
  assert.ok(Math.abs(ordinary.ground - 12.3125) < .15, JSON.stringify(ordinary));
  const pattern = /^日常报时 · (\d\d):00:00　下一整点 · (\d\d):00:00$/;
  const parsed = pattern.exec(ordinary.text);
  assert.ok(parsed && (Number(parsed[1]) + 1) % 24 === Number(parsed[2]), ordinary.text);
  report.books.push(ordinary);
  await capture('01-local-clock-ledger');
  await page.keyboard.press('Escape');
  await walk(books[1], 'night-ledger', .19);
  let night;
  // Reopen through native input if the Presence connection is replacing its night state.
  for (let attempt = 0; attempt < 3; attempt++) {
    night = await readBook('魂账');
    if (!night.text.includes('未同步')) break;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(4_200);
  }
  const schedules = report.nightSamples.filter(scheduleShape);
  assert.ok(schedules.length, 'Presence sent no configured night schedule');
  const authoritative = schedules.toReversed().find(({ snapshot }) => {
    const { beaconAt, morningBellAt } = snapshot;
    return night.text.includes(serverTime.format(beaconAt)) && night.text.includes(serverTime.format(morningBellAt));
  });
  assert.ok(authoritative, `Displayed ledger did not match a live authority read: ${night.text}`);
  assert.ok(Math.abs(night.ground - 12.3125) < .15, JSON.stringify(night));
  const plannedHour = Number(serverTime.format(authoritative.serverEpochMs).slice(0, 2));
  assert.ok([plannedHour, (plannedHour + 23) % 24].includes(Number(parsed[1])),
    'Daily ledger does not follow the same server hour');
  report.books.push({ ...night, authoritative });
  await capture('02-authoritative-night-ledger');
  await page.keyboard.press('Escape');
}

async function verifyLookout() {
  await follow([[218.2, 219.38], [218.2, 223], [226, 223], local(0, 3.2), local(...corners[0])], 'spiral-entry');
  for (let flight = 1; flight <= 31; flight++) {
    const corner = local(...corners[flight % 4]);
    await walk(corner, `spiral-flight-${flight}`);
    if (flight === 27) {
      const side = [local(-1.625, 3.21875), local(-1.625, .9), local(-1, .9)];
      await follow(side, 'belfry-branch');
      const approach = await readPose();
      assert.ok(Math.abs(approach.ground - 96.71875) < .55, JSON.stringify(approach));
      const casting = [225.87, 224.39, approach.ground + 3.44];
      await face(Math.atan2(casting[0] - approach.east, casting[1] - approach.north));
      const pitch = Math.atan2(casting[2] - approach.cameraY, Math.hypot(casting[0] - approach.east, casting[1] - approach.north));
      const dy = Math.round(-pitch / .003);
      const partial = Math.round(dy / 2);
      await drag(0, partial);
      await drag(0, dy - partial);
      await capture('03-bell-interior-casting');
      await drag(0, -partial);
      await drag(0, partial - dy);
      await follow([...side].reverse().slice(1).concat([corner]), 'belfry-return');
    }
  }
  await follow([local(-1.4375, 2.8125), local(-1.4375, -2.59375), local(1.03125, -2.59375),
    local(1.03125, 1.30), local(0, 1.30)], 'spire-stairs');
  await walk(lookout, 'watch-plate', .10);
  const before = await readPose();
  assert.ok(Math.abs(before.ground - 118.8125) < .20, JSON.stringify(before));
  await action('在塔顶守夜');
  await waitForWire(pose => pose && Math.abs(angleTo(pose.yaw, Math.PI)) < .08);
  const after = await readPose();
  assert.ok(Math.hypot(after.east - before.east, after.north - before.north, after.ground - before.ground) < .15,
    'The watch interaction moved the player');
  assert.equal(await page.locator('#place-title').evaluate(node => node.closest('dialog').open), false);
  await capture('04-native-watch-point');
}

try {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: process.env.ZA22_HARDWARE === '1' && process.platform === 'win32'
      ? ['--use-gl=angle', '--use-angle=d3d11']
      : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  report.browser = browser.version();
  await openTown();
  await verifyBooks();
  if (stage === 'all') await verifyLookout();
  assert.equal(report.pageErrors.length + report.consoleErrors.length + report.requestFailures.length + report.httpErrors.length, 0);
} catch (error) {
  report.failure = error instanceof Error ? error.stack : String(error);
  if (page && !page.isClosed()) {
    try {
      report.lastPose = await readPose();
      await page.screenshot({ path: join(output, 'failed-position.png'), timeout: 12_000 });
    } catch {}
  }
  process.exitCode = 1;
} finally {
  measuring = false;
  report.errors = report.pageErrors.length + report.consoleErrors.length + report.requestFailures.length + report.httpErrors.length;
  await writeFile(join(output, 'za19-clock-live.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ stage, checkpoints: report.checkpoints.length, books: report.books.length,
    frames: report.wirePoses.length, captures: report.captures.length, errors: report.errors, failure: report.failure }));
  await browser?.close();
}
