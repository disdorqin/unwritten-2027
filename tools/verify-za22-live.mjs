import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const [origin, output, segment = 'all'] = process.argv.slice(2);
assert.ok(origin && output, 'Use the production-preview loopback URL and an evidence directory');
const url = new URL('/?profile', origin);
assert.equal(url.protocol, 'http:');
assert.equal(url.hostname, '127.0.0.1');
assert.ok(['station', 'cloud', 'gate', 'crater', 'all', 'palace', 'station-ticket', 'mascot-patrol'].includes(segment), segment);

const spawn = [223, 180];
const station = [
  [245, 192], [251, 192], [278, 192], [304, 192], [315, 199], [319, 230], [332, 245],
  [350, 249], [382, 220], [398, 207], [410, 207], [427, 214], [445, 221], [456, 222],
  [453, 254], [473, 276], [506, 286], [526, 312], [526, 317.15], [536.8, 317.15],
];
const ticketWindow = [516.1, 329.14];
const stationTicket = [...station.slice(0, -2), [526, 313], [526, 329.14], ticketWindow];
const ticketTitle = '永不启程的车票';
const catalogueTitle = '等一班不来的车';
const ticketClaim = `E · 领取${ticketTitle}`;
const ticketCatalogue = `E · 查看图鉴 · ${catalogueTitle}`;
const westShore = [
  [192, 180], [161, 181], [151, 156], [127, 140], [108, 114], [85, 131], [77, 164], [1, 159],
];
const cloudStop = [336, 640];
const cloudRunway = [[336, 657], [326.82, 657]];
const crater = [[-12, 159], [-40, 159], [-67, 159], [-71, 159]];
const gate = [[336, 663.25], [300, 663.25], [300, 676], [300, 696], [300, 683], [307.25, 683]];
const palaceWestDoor = [
  ...station.slice(0, 9), [396, 189], [391, 157], [374, 129], [402, 132], [445, 136],
  [446, 107], [447, 80], [460, 72], [462.8, 72],
];
const palacePoints = [
  ['cold-lever', '拨动引寒机关', [471, 73.3], [471, 74.63]],
  ['crystal-pillar', '采集冰晶片', [478.05, 77.43], [478.05, 78.62]],
  ['ship-fragment', '拾取船件碎片', [484.35, 77.47], [484.35, 78.47]],
  ['solstice-altar', '行安雪礼', [485.4, 65.03], [485.4, 63.75]],
];
const [width, height] = (process.env.ZA22_VIEWPORT ?? '960x540').split('x').map(Number);
assert.ok(Number.isInteger(width) && width >= 320 && Number.isInteger(height) && height >= 200);
const viewport = { width, height };
const deviceScaleFactor = Number(process.env.ZA22_DEVICE_SCALE ?? .25);
assert.ok(Number.isFinite(deviceScaleFactor) && deviceScaleFactor > 0 && deviceScaleFactor <= 2);
const dragX = Math.round(width * .48), dragY = Math.round(height * .51);
const maxDrag = Math.round(width * .34);
const tau = 2 * Math.PI;
const yawDistance = (from, to) => ((to - from + Math.PI) % tau + tau) % tau - Math.PI;
const positionPattern = /东\s*(-?[\d.]+)\s*m\s*·\s*北\s*(-?[\d.]+)\s*m/;
const hardware = process.env.ZA22_HARDWARE === '1';
const graphicsArgs = hardware ? (process.platform === 'win32' ? ['--use-gl=angle', '--use-angle=d3d11'] : [])
  : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const report = { url: url.href, segment, viewport, quality: 'smooth', gpu: null, paths: [], pageErrors: [], consoleErrors: [], requestFailures: [], httpErrors: [] };

await mkdir(output, { recursive: true });
let browser;
let lastPage;
let measuring = true;

async function openTown(name) {
  const context = await browser.newContext({ viewport, deviceScaleFactor, locale: 'zh-CN' });
  const page = await context.newPage();
  lastPage = page;
  const evidence = { name, checkpoints: [], sockets: [], poses: [] };
  report.paths.push(evidence);
  page.on('pageerror', error => { if (measuring) report.pageErrors.push(String(error)); });
  page.on('console', message => {
    if (measuring && message.type() === 'error') report.consoleErrors.push({ text: message.text(), url: message.location().url });
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
    const west = socketPath.startsWith('/presence-west');
    evidence.sockets.push(socket.url());
    socket.on('framesent', ({ payload }) => {
      if (!Buffer.isBuffer(payload) || payload.byteLength !== 12 || payload.readUInt16LE(0) !== 0) return;
      evidence.poses.push({
        ms: Date.now(),
        east: payload.readUInt16LE(2) / 100 - (west ? 240 : 0),
        north: payload.readUInt16LE(4) / 100 + (mountain ? 540 : 0),
        area: mountain ? 'mountain' : west ? 'west' : 'town',
        height: payload.readUInt16LE(6) / 100 - (west ? 64 : 0),
        yaw: payload.readUInt16LE(8) * tau / 65536,
        seq: payload.readUInt16LE(10),
      });
    });
  });
  await page.addInitScript(() => {
    // Use the production drag fallback for consistent native mouse input in headless Chromium.
    // Only the browser API is made unavailable. All movement still runs through the viewer.
    Object.defineProperty(Element.prototype, 'requestPointerLock', { value: undefined });
    // This is the viewer's ordinary saved graphics setting. It does not change the world or movement.
    localStorage.setItem('unwritten.quality.tier.v1', 'smooth');
    document.addEventListener('town-frame-profile', event => { window.__za22Frame = event.detail; }, true);
  });
  const response = await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  assert.equal(response?.status(), 200);
  await enterTown(page, evidence, 'spawn');
  return { page, evidence };
}

async function enterTown(page, evidence, label, poseCursor = 0) {
  assert.equal(new URL(page.url()).pathname, '/', 'Use the normal production root entry');
  await page.locator('#scene canvas').waitFor({ state: 'visible', timeout: 90_000 });
  await page.waitForFunction(pattern => {
    const hud = document.querySelector('#position')?.textContent ?? '';
    return new RegExp(pattern).test(hud) && window.__za22Frame?.calls > 0;
  }, positionPattern.source, { timeout: 90_000 });
  if (!report.gpu) report.gpu = await page.evaluate(() => {
    const gl = document.querySelector('#scene canvas')?.getContext('webgl2');
    const names = gl?.getExtension('WEBGL_debug_renderer_info');
    return names ? { vendor: gl.getParameter(names.UNMASKED_VENDOR_WEBGL),
      renderer: gl.getParameter(names.UNMASKED_RENDERER_WEBGL) } : null;
  });
  const start = await readPose(page);
  assert.ok(Math.hypot(start.east - spawn[0], start.north - spawn[1]) < .3, JSON.stringify(start));
  assert.ok(Math.abs(start.height - 12) < .3, JSON.stringify(start));
  await page.locator('#scene canvas').click({ position: { x: Math.round(width * .35), y: dragY } });
  const wire = await waitForWire(page, evidence, pose => evidence.poses.length > poseCursor &&
    pose.area === 'town' && Math.hypot(pose.east - spawn[0], pose.north - spawn[1]) < .3 &&
    Math.abs(pose.height - 12) < .3);
  evidence.checkpoints.push({ label, ...start, wire });
  console.log(JSON.stringify({ phase: label, east: start.east, north: start.north, y: start.height }));
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
  for (let attempt = 0; attempt < 16; ++attempt) {
    const before = await waitForWire(page, evidence);
    const delta = yawDistance(before.yaw, desired);
    if (Math.abs(delta) <= .009) return;
    const dx = Math.max(-maxDrag, Math.min(maxDrag, Math.round(delta / .003)));
    const anchor = await page.evaluate(({ width, height, dx, attempt }) => {
      const canvas = document.querySelector('#scene canvas');
      const candidates = [[.48, .51], [.41, .37], [.40, .61], [.56, .45], [.37, .48]];
      for (let index = 0; index < candidates.length; ++index) {
        const [cx, cy] = candidates[(index + attempt) % candidates.length];
        const x = Math.round(width * cx), y = Math.round(height * cy);
        if (x + dx > 0 && x + dx < width && document.elementFromPoint(x, y) === canvas) return { x, y };
      }
    }, { width, height, dx, attempt });
    assert.ok(anchor, 'The canvas needs an unobstructed native mouse target');
    await page.mouse.move(anchor.x, anchor.y);
    await page.mouse.down();
    try { await page.mouse.move(anchor.x + dx, anchor.y, { steps: Math.max(2, Math.ceil(Math.abs(dx) / 55)) }); }
    finally { await page.mouse.up(); }
    // Sample the actual view. Native pointer coordinates may be rounded at a fractional raster scale.
    const until = Date.now() + 800;
    while (evidence.poses.at(-1)?.seq === before.seq && Date.now() < until) await page.waitForTimeout(30);
    await page.waitForTimeout(120);
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
      console.log(JSON.stringify({ phase: label, east: from.east, north: from.north, y: from.height }));
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
      { timeout: Math.ceil(30_000 + distance * 1000) });
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

async function showTicketCard(page, evidence, actionLabel, title, description, label) {
  const prompt = page.getByRole('button', { name: actionLabel, exact: true }).and(page.locator('#world-action'));
  await prompt.waitFor({ timeout: 20_000 });
  evidence.checkpoints.push({ label: `${label}-prompt`, ...await readPose(page), wire: evidence.poses.at(-1) });
  await page.keyboard.press('e');
  const dialog = page.locator('#place-card[open]');
  await dialog.getByRole('heading', { name: title, exact: true }).waitFor({ timeout: 12_000 });
  await dialog.getByText(description, { exact: true }).waitFor({ timeout: 12_000 });
  await snapshot(page, evidence, label);
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden', timeout: 12_000 });
}

async function walkToTicketWindow(page, evidence, prefix) {
  await follow(page, evidence, stationTicket, prefix);
  return waitForWire(page, evidence, pose => pose?.area === 'town' &&
    Math.hypot(pose.east - ticketWindow[0], pose.north - ticketWindow[1]) <= .5 &&
    Math.abs(pose.height - 26.14) <= .08);
}

async function checkStationTicket() {
  const { page, evidence } = await openTown('station-ticket');
  evidence.ticketWindow = { target: ticketWindow, firstVisit: await walkToTicketWindow(page, evidence, 'ticket-approach') };
  await showTicketCard(page, evidence, ticketClaim, ticketTitle,
    `已收进扩展收集页 · ${catalogueTitle}`, 'station-ticket-collected');
  await showTicketCard(page, evidence, ticketCatalogue, catalogueTitle, ticketTitle, 'station-ticket-catalogue');

  const poseCursor = evidence.poses.length;
  const refreshed = await page.reload({ waitUntil: 'domcontentloaded', timeout: 90_000 });
  assert.equal(refreshed?.status(), 200);
  await enterTown(page, evidence, 'station-ticket-reloaded-spawn', poseCursor);
  evidence.ticketWindow.afterReload = await walkToTicketWindow(page, evidence, 'ticket-reloaded-approach');
  await showTicketCard(page, evidence, ticketCatalogue, catalogueTitle, ticketTitle, 'station-ticket-persisted');
}

async function checkMascotPatrol() {
  const { mascotDayPatrolLegs, mascotPatrolSites, mascotWhiteoutReturnPaths } =
    await import('./voxel-tavern/town-blockout/mascot-patrol-sites.ts');
  const { page, evidence } = await openTown('mascot-patrol-geometry');

  async function reach(point, label) {
    await walkTo(page, evidence, point, label);
    const checkpoint = evidence.checkpoints.at(-1);
    checkpoint.wire = await waitForWire(page, evidence, pose => pose?.area === 'town' &&
      Math.hypot(pose.east - point[0], pose.north - point[1]) <= .55 &&
      Math.hypot(pose.east - checkpoint.east, pose.north - checkpoint.north) <= .35 &&
      Math.abs(pose.height - checkpoint.height) <= .1);
  }

  const pen = mascotPatrolSites.pen;
  const approach = mascotWhiteoutReturnPaths.plazaSun;
  await follow(page, evidence, approach.slice(0, -2), 'mascot-pen-approach');
  await reach(mascotPatrolSites.penEntrance, 'mascot-pen-gate-in');
  await reach(pen, 'mascot-pen-foot-in');
  await face(page, evidence, -Math.PI / 2);
  await snapshot(page, evidence, 'mascot-pen-entered');

  const names = ['plaza', 'tavern', 'old-home', 'return'];
  for (const [legIndex, leg] of mascotDayPatrolLegs.entries()) {
    for (const [pointIndex, point] of leg.slice(1).entries()) {
      await reach(point, `mascot-${names[legIndex]}-${pointIndex + 1}`);
    }
  }
  await face(page, evidence, -Math.PI / 2);
  await snapshot(page, evidence, 'mascot-pen-returned');
}

async function checkPalacePoint(page, evidence, id, label, point, fixture) {
  const lane = [point[0], 72];
  await walkTo(page, evidence, lane, `palace-${id}-aisle`);
  await walkTo(page, evidence, point, `palace-${id}-foot`);
  const wire = await waitForWire(page, evidence, pose => pose?.area === 'town' &&
    Math.hypot(pose.east - point[0], pose.north - point[1]) <= .5 && Math.abs(pose.height - 12.12) <= .07);
  await face(page, evidence, Math.atan2(fixture[0] - wire.east, fixture[1] - wire.north));
  const surface = () => page.evaluate(() => {
    const button = document.querySelector('#world-action');
    return { action: button && !button.hidden ? button.textContent.trim() : '',
      dialogueOpen: document.querySelector('#place-card')?.open === true,
      notice: document.querySelector('#ice-palace-pickup-notice')?.textContent?.trim() ?? '',
      activity: document.querySelector('#town-activity-status')?.textContent?.trim() ?? '' };
  });
  const before = await surface();
  assert.equal(before.dialogueOpen, false);
  assert.equal(before.action, '', `${label}: this proof expects no eligible action before E`);
  await page.keyboard.press('e');
  await page.waitForTimeout(350);
  const after = await surface();
  const afterPose = await readPose(page);
  assert.ok(Math.hypot(afterPose.east - point[0], afterPose.north - point[1]) <= .5,
    `${label}: E moved the player from the palace footpoint`);
  assert.equal(after.dialogueOpen, false);
  assert.equal(after.action, '');
  assert.equal(after.notice, '');
  assert.doesNotMatch(after.activity, /冰晶片入包|获得冰晶片|船件碎片|安雪礼已完成|镜湖坚冰/);
  evidence.palacePoints.push({ id, target: point, wire, reached: true, input: 'E',
    authority: 'action-unavailable', before, after, afterPose });
  await snapshot(page, evidence, `palace-${id}`);
  await walkTo(page, evidence, lane, `palace-${id}-return`);
}

try {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: graphicsArgs,
  });
  report.browser = browser.version();
  if (['station', 'cloud', 'gate', 'all'].includes(segment)) {
    const { page, evidence } = await openTown('cable');
    await follow(page, evidence, station, 'station');
    if (segment === 'station') {
      await action(page, '老闸');
      await card(page, '北岭缆车');
      await snapshot(page, evidence, 'station');
    } else {
      await action(page, '乘缆车一线前往云海台', 620_000);
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
  if (segment === 'station-ticket') await checkStationTicket();
  if (segment === 'mascot-patrol') await checkMascotPatrol();
  if (segment === 'palace') {
    const { page, evidence } = await openTown('palace-geometry');
    evidence.palacePoints = [];
    await follow(page, evidence, palaceWestDoor, 'palace-approach');
    for (const row of palacePoints) await checkPalacePoint(page, evidence, ...row);
  }
  if (segment === 'crater' || segment === 'all') {
    const { page, evidence } = await openTown('crater');
    await follow(page, evidence, westShore, 'west-shore');
    await follow(page, evidence, crater, 'crater');
    await face(page, evidence, -Math.PI / 2);
    const rim = await readPose(page);
    assert.ok(rim.east < -70.55 && Math.abs(rim.north - 159) < .5 && Math.abs(rim.height - 10.7773) < .5,
      JSON.stringify(rim));
    await snapshot(page, evidence, 'crater-entrance');
    await waitForWire(page, evidence, pose => pose?.area === 'west' && pose.east < -70.55);
    const gateWindow = await page.waitForFunction(async () => {
      const response = await fetch('/presence/night-window', { cache: 'no-store' });
      if (!response.ok) return false;
      const state = await response.json();
      return state.canEnterRestricted && state.morningBellAt - state.now > 15_000 ? state : false;
    }, null, { polling: 600, timeout: 620_000 });
    evidence.craterWindow = await gateWindow.jsonValue();
    await gateWindow.dispose();
    await walkTo(page, evidence, [-72.1, 159], 'crater-crossed-lip');
    await waitForWire(page, evidence, pose => pose?.area === 'west' && pose.east < -71.8);
    await face(page, evidence, -Math.PI / 2);
    await snapshot(page, evidence, 'crater-inside');
    await walkTo(page, evidence, [-67, 159], 'crater-return');
    await snapshot(page, evidence, 'crater-return');
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
  const filename = {
    palace: 'za18-live-walk.json',
    'station-ticket': 'za21-live-walk.json',
    'mascot-patrol': 'za26-live-walk.json',
  }[segment] ?? 'za22-live-walk.json';
  await writeFile(join(output, filename),
    `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ segment, paths: report.paths.map(path => ({ name: path.name, checkpoints: path.checkpoints.length,
    frames: path.poses.length, last: path.checkpoints.at(-1) })), errors: report.errors, failure: report.failure }));
  await browser?.close();
}
