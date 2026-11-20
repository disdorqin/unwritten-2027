import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const [origin, output, segment = 'all'] = process.argv.slice(2);
assert.ok(origin && output, 'Use the production-preview loopback URL and an evidence directory');
const url = new URL('/?profile', origin);
assert.equal(url.protocol, 'http:');
assert.equal(url.hostname, '127.0.0.1');
assert.ok(['station', 'cloud', 'gate', 'crater', 'all'].includes(segment), segment);

const spawn = [223, 180];
const station = [
  [245, 192], [251, 192], [278, 192], [304, 192], [315, 199], [319, 230], [332, 245],
  [350, 249], [382, 220], [398, 207], [410, 207], [427, 214], [445, 221], [456, 222],
  [453, 254], [473, 276], [506, 286], [526, 312], [526, 317.15], [536.8, 317.15],
];
const westShore = [
  [192, 180], [161, 181], [151, 156], [127, 140], [108, 114], [85, 131], [77, 164], [1, 159],
];
const cloudStop = [336, 640];
const cloudRunway = [[336, 657], [326.82, 657]];
const crater = [[-12, 159], [-40, 159], [-67, 159]];
const gate = [[336, 663.25], [300, 663.25], [300, 676], [300, 696], [300, 683], [307.25, 683]];
const viewport = { width: 1160, height: 720 };
const tau = 2 * Math.PI;
const yawDistance = (from, to) => ((to - from + Math.PI) % tau + tau) % tau - Math.PI;
const positionPattern = /东\s*(-?[\d.]+)\s*m\s*·\s*北\s*(-?[\d.]+)\s*m/;
const report = { url: url.href, segment, paths: [], pageErrors: [], consoleErrors: [], requestFailures: [], httpErrors: [] };

await mkdir(output, { recursive: true });
let browser;
let lastPage;
let measuring = true;

async function openTown(name) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: 'zh-CN' });
  const page = await context.newPage();
  lastPage = page;
  const evidence = { name, checkpoints: [], sockets: [], poses: [] };
  report.paths.push(evidence);
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
    const socketPath = new URL(socket.url()).pathname;
    if (!socketPath.startsWith('/presence')) return;
    const mountain = socketPath.startsWith('/presence-mountain');
    evidence.sockets.push(socket.url());
    socket.on('framesent', ({ payload }) => {
      if (!Buffer.isBuffer(payload) || payload.byteLength !== 12 || payload.readUInt16LE(0) !== 0) return;
      evidence.poses.push({
        ms: Date.now(),
        east: payload.readUInt16LE(2) / 100,
        north: payload.readUInt16LE(4) / 100 + (mountain ? 540 : 0),
        area: mountain ? 'mountain' : 'town',
        height: payload.readUInt16LE(6) / 100,
        yaw: payload.readUInt16LE(8) * tau / 65536,
        seq: payload.readUInt16LE(10),
      });
    });
  });
  await page.addInitScript(() => {
    // Use the production drag fallback for consistent native mouse input in headless Chromium.
    // Only the browser API is made unavailable. All movement still runs through the viewer.
    Object.defineProperty(Element.prototype, 'requestPointerLock', { value: undefined });
    document.addEventListener('town-frame-profile', event => { window.__za22Frame = event.detail; }, true);
  });
  const response = await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  assert.equal(response?.status(), 200);
  assert.equal(new URL(page.url()).pathname, '/', 'Use the normal production root entry');
  await page.locator('#scene canvas').waitFor({ state: 'visible', timeout: 90_000 });
  await page.waitForFunction(pattern => {
    const hud = document.querySelector('#position')?.textContent ?? '';
    return new RegExp(pattern).test(hud) && window.__za22Frame?.calls > 0;
  }, positionPattern.source, { timeout: 90_000 });
  const start = await readPose(page);
  assert.ok(Math.hypot(start.east - spawn[0], start.north - spawn[1]) < .3, JSON.stringify(start));
  assert.ok(Math.abs(start.height - 12) < .3, JSON.stringify(start));
  await page.locator('#scene canvas').click({ position: { x: 440, y: 335 } });
  await waitForWire(page, evidence);
  evidence.checkpoints.push({ label: 'spawn', ...start, wire: evidence.poses.at(-1) });
  return { page, evidence };
}

async function readPose(page) {
  const frame = await page.evaluate(() => ({
    hud: document.querySelector('#position')?.textContent ?? '',
    cameraY: window.__za22Frame?.cameraY,
    action: document.querySelector('#world-action')?.textContent ?? '',
    status: document.querySelector('#town-presence-status')?.textContent ?? '',
  }));
  const point = positionPattern.exec(frame.hud);
  return { ...frame, east: point ? Number(point[1]) : undefined, north: point ? Number(point[2]) : undefined,
    height: Number.isFinite(frame.cameraY) ? Math.round((frame.cameraY - 1.65) * 100) / 100 : undefined };
}

async function waitForWire(page, evidence, predicate = pose => Boolean(pose), timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate(evidence.poses.at(-1)) && Date.now() < deadline) await page.waitForTimeout(35);
  const pose = evidence.poses.at(-1);
  assert.ok(predicate(pose), `No expected pose from the real presence socket: ${JSON.stringify(pose)}`);
  return pose;
}

async function face(page, evidence, desired) {
  for (let attempt = 0; attempt < 7; ++attempt) {
    const before = await waitForWire(page, evidence);
    const delta = yawDistance(before.yaw, desired);
    if (Math.abs(delta) <= .005) return;
    const dx = Math.max(-340, Math.min(340, Math.round(delta / .003)));
    await page.mouse.move(500, 335);
    await page.mouse.down();
    try { await page.mouse.move(500 + dx, 335, { steps: Math.max(2, Math.ceil(Math.abs(dx) / 55)) }); }
    finally { await page.mouse.up(); }
    const expected = before.yaw + dx * .003;
    await waitForWire(page, evidence, current => current && Math.abs(yawDistance(current.yaw, expected)) < .014);
  }
  assert.fail(`Native mouse drag could not face ${desired}`);
}

async function walkTo(page, evidence, target, label) {
  const [east, north] = target;
  let after = await readPose(page);
  for (let attempt = 0; attempt < 6; ++attempt) {
    assert.ok(Number.isFinite(after.east) && Number.isFinite(after.north), JSON.stringify(after));
    const from = after;
    const dx = east - from.east, dn = north - from.north;
    const distance = Math.hypot(dx, dn);
    if (distance <= .46) {
      evidence.checkpoints.push({ label, target, ...from, wire: evidence.poses.at(-1) });
      return;
    }
    const desired = Math.atan2(dx, dn);
    await face(page, evidence, desired);
    // For small final corrections use the slow backward movement, avoiding double-W sprint.
    const backwards = distance < 1.4;
    if (backwards) await face(page, evidence, desired + Math.PI);
    const key = backwards ? 's' : 'w';
    const fast = distance > 9;
    if (fast) await page.keyboard.down('Shift');
    await page.keyboard.down(key);
    try {
      await page.waitForFunction(({ pattern, start, east, north, dx, dn, distance }) => {
        const point = new RegExp(pattern).exec(document.querySelector('#position')?.textContent ?? '');
        if (!point) return false;
        const x = Number(point[1]), n = Number(point[2]);
        if (Math.hypot(x - east, n - north) <= .32) return true;
        const forward = ((x - start.east) * dx + (n - start.north) * dn) / distance;
        return forward >= distance;
      }, { pattern: positionPattern.source, start: from, east, north, dx, dn, distance },
      { timeout: Math.ceil(12_000 + (distance / 1.55) * 1000) });
    } catch (error) {
      const stopped = await readPose(page);
      throw new Error(`Native walking stopped before ${label} (${east}, ${north}): ${JSON.stringify(stopped)}`, { cause: error });
    } finally {
      await page.keyboard.up(key);
      if (fast) await page.keyboard.up('Shift');
    }
    after = await readPose(page);
  }
  assert.fail(`Native walking did not settle at ${label}: ${JSON.stringify(after)}`);
}

async function follow(page, evidence, knots, prefix) {
  for (const [index, target] of knots.entries()) await walkTo(page, evidence, target, `${prefix}-${index + 1}`);
}

async function action(page, label, timeout = 20_000) {
  await page.waitForFunction(text => {
    const button = document.querySelector('#world-action');
    return button && !button.hidden && button.textContent.includes(text);
  }, label, { timeout });
  await page.keyboard.press('e');
}

async function card(page, title) {
  await page.waitForFunction(text => {
    const label = document.querySelector('#place-title');
    return label?.closest('dialog')?.open && label.textContent.includes(text);
  }, title, { timeout: 12_000 });
}

async function snapshot(page, evidence, label) {
  await page.screenshot({ path: join(output, `${label}.png`), timeout: 45_000 });
  evidence.checkpoints.push({ label, ...await readPose(page), wire: evidence.poses.at(-1) });
}

try {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  report.browser = browser.version();
  if (segment !== 'crater') {
    const { page, evidence } = await openTown('cable');
    await follow(page, evidence, station, 'station');
    if (segment === 'station') {
      await action(page, '老闸');
      await card(page, '北岭缆车');
      await snapshot(page, evidence, 'station');
    } else {
      await action(page, '乘缆车一线前往云海台', 180_000);
      await page.waitForFunction(() => document.querySelector('#position')?.textContent?.includes('缆车一线'),
        null, { timeout: 135_000 });
      await snapshot(page, evidence, 'cable-boarding');
      await page.waitForFunction(() => {
        const riding = document.querySelector('#position')?.textContent?.includes('缆车一线');
        const height = window.__za22Frame?.cameraY;
        return riding && height > 80 && height < 300;
      }, null, { timeout: 90_000 });
      await snapshot(page, evidence, 'cable-moving');

      await page.waitForFunction(({ pattern, destination }) => {
        const pose = new RegExp(pattern).exec(document.querySelector('#position')?.textContent ?? '');
        return pose && Math.hypot(Number(pose[1]) - destination[0], Number(pose[2]) - destination[1]) < 1
          && Math.abs((window.__za22Frame?.cameraY ?? 0) - 348.65) < .55;
      }, { pattern: positionPattern.source, destination: cloudStop }, { timeout: 210_000 });
      await waitForWire(page, evidence, pose => pose?.area === 'mountain' && Math.abs(pose.height - 347) < .7);
      await snapshot(page, evidence, 'cloud-cable-arrival');
      if (segment === 'cloud' || segment === 'all') {
        await follow(page, evidence, cloudRunway, 'cloud-runway');
        await action(page, '查看星港坪装配和起飞线');
        await card(page, '星港坪');
        await snapshot(page, evidence, 'cloud-runway');
      }
      if (segment === 'gate' || segment === 'all') {
        if (segment === 'all') {
          await page.keyboard.press('Escape');
          await walkTo(page, evidence, cloudRunway[0], 'return-to-cloud-walkway');
        }
        await follow(page, evidence, gate, 'gate');
        await action(page, '查看山门班次');
        await card(page, '山门');
        await snapshot(page, evidence, 'mountain-gate');
      }
    }
  }
  if (segment === 'crater' || segment === 'all') {
    const { page, evidence } = await openTown('crater');
    await follow(page, evidence, westShore, 'west-shore');
    await follow(page, evidence, crater, 'crater');
    await face(page, evidence, -Math.PI / 2);
    const rim = await readPose(page);
    assert.ok(rim.east < -66.5 && Math.abs(rim.north - 159) < .5 && Math.abs(rim.height - 10.7773) < .5,
      JSON.stringify(rim));
    await snapshot(page, evidence, 'crater');
  }
  assert.equal(report.pageErrors.length + report.consoleErrors.length + report.requestFailures.length + report.httpErrors.length, 0);
} catch (error) {
  report.failure = error instanceof Error ? error.stack : String(error);
  if (lastPage && !lastPage.isClosed()) {
    try {
      report.lastPose = await readPose(lastPage);
      await lastPage.screenshot({ path: join(output, 'failed-position.png'), timeout: 10_000 });
    } catch {}
  }
  process.exitCode = 1;
} finally {
  measuring = false;
  report.errors = report.pageErrors.length + report.consoleErrors.length + report.requestFailures.length + report.httpErrors.length;
  await writeFile(join(output, 'za22-live-walk.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ segment, paths: report.paths.map(path => ({ name: path.name, checkpoints: path.checkpoints.length,
    frames: path.poses.length, last: path.checkpoints.at(-1) })), errors: report.errors, failure: report.failure }));
  await browser?.close();
}
