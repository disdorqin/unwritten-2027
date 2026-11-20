import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';

const [origin, output, segment = 'all'] = process.argv.slice(2);
assert.ok(origin && output, 'Use the production-preview loopback URL and an evidence directory');
const bare = segment === 'gate';
const url = bare ? new URL(origin) : new URL('/?profile', origin);
assert.equal(url.protocol, 'http:');
assert.equal(url.hostname, '127.0.0.1');
if (bare) assert.equal(url.href, `${url.origin}/`, 'Use the bare production root, with no query or hash');
assert.ok(['station', 'cloud', 'gate', 'crater', 'all'].includes(segment), segment);

const spawn = [223, 180];
const station = [
  [245, 192], [251, 192], [278, 192], [304, 192], [315, 199], [319, 230], [332, 245],
  [350, 249], [382, 220], [398, 207], [410, 207], [427, 214], [445, 221], [456, 222],
  [453, 254], [473, 276], [506, 286], [526, 312], [526, 317.15], [536.8, 317.15],
];
// Use the surveyed center of the open plaza, then the northeast road mouth.
// Short axis-aligned legs give the headless walk independent progress checks.
const bareStation = [[235.8, 180], [242, 180], [242, 192], ...station.slice(1)];
const westShore = [
  [192, 180], [161, 181], [151, 156], [127, 140], [108, 114], [85, 131], [77, 164], [1, 159],
];
const cloudStop = [336, 640];
const cloudRunway = [[336, 657], [326.82, 657]];
const crater = [[-12, 159], [-40, 159], [-67, 159], [-71, 159]];
const gate = [[336, 663.25], [300, 663.25], [300, 676], [300, 696], [300, 683], [307.25, 683]];
const [width, height] = (process.env.ZA22_VIEWPORT ?? '960x540').split('x').map(Number);
assert.ok(Number.isInteger(width) && width >= 320 && Number.isInteger(height) && height >= 200);
const viewport = { width, height };
const deviceScaleFactor = Number(process.env.ZA22_DEVICE_SCALE ?? (bare ? 1 : .25));
assert.ok(Number.isFinite(deviceScaleFactor) && deviceScaleFactor > 0 && deviceScaleFactor <= 2);
const dragX = Math.round(width * .48), dragY = Math.round(height * .51);
const maxDrag = Math.round(width * .34);
const tau = 2 * Math.PI;
const yawDistance = (from, to) => ((to - from + Math.PI) % tau + tau) % tau - Math.PI;
const positionPattern = /东\s*(-?[\d.]+)\s*m\s*·\s*北\s*(-?[\d.]+)\s*m/;
const hardware = process.env.ZA22_HARDWARE === '1';
const graphicsArgs = hardware ? (process.platform === 'win32' ? ['--use-gl=angle', '--use-angle=d3d11'] : [])
  : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const report = { url: url.href, segment, viewport, deviceScaleFactor, quality: bare ? 'fresh default' : 'smooth',
  gpu: null, paths: [], pageErrors: [], consoleErrors: [], requestFailures: [], httpErrors: [] };
if (bare) {
  report.input = 'native keyboard and mouse, using the game’s pointer-drag fallback';
  if (process.env.ZA30_LOCAL_TEST_NIGHT) report.serverTestNight = JSON.parse(process.env.ZA30_LOCAL_TEST_NIGHT);
}

await mkdir(output, { recursive: true });
let browser;
let lastPage;
let measuring = true;

// Observe the viewer's actual WebGL submissions on the normal canvas. No
// profiling URL, quality preference, or application state is set in bare mode.
function observeBareTown() {
  const prototype = WebGL2RenderingContext.prototype;
  const locate = prototype.getUniformLocation;
  const setMatrix = prototype.uniformMatrix4fv;
  const draw = prototype.drawElements;
  const viewLocations = new WeakSet();
  const observation = { cameraY: null, draws: 0, recentIndexedDraws: [] };
  window.__za22Bare = observation;

  prototype.getUniformLocation = function (program, name) {
    const location = locate.call(this, program, name);
    if (location && name === 'viewMatrix') viewLocations.add(location);
    return location;
  };
  prototype.uniformMatrix4fv = function (location, transpose, values, ...offsets) {
    setMatrix.call(this, location, transpose, values, ...offsets);
    if (this.canvas.parentElement?.id !== 'scene' || !viewLocations.has(location)) return;
    const m = offsets[0] ? values.subarray(offsets[0]) : values;
    observation.cameraY = -(m[4] * m[12] + m[5] * m[13] + m[6] * m[14]);
  };
  prototype.drawElements = function (mode, count, type, offset) {
    draw.call(this, mode, count, type, offset);
    if (this.canvas.parentElement?.id !== 'scene' || mode !== this.TRIANGLES) return;
    observation.draws++;
    observation.recentIndexedDraws.push({ count, type });
    if (observation.recentIndexedDraws.length > 256) observation.recentIndexedDraws.shift();
  };
}

async function openTown(name) {
  const context = await browser.newContext({ viewport, deviceScaleFactor, locale: 'zh-CN' });
  if (bare) await context.addInitScript(observeBareTown);
  const page = await context.newPage();
  lastPage = page;
  const evidence = { name, checkpoints: [], sockets: [], poses: [] };
  let westWindow;
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
    if (west) {
      const current = {};
      westWindow = current;
      socket.on('framereceived', ({ payload }) => {
        if (typeof payload !== 'string') return;
        const frame = JSON.parse(payload);
        if (frame.type === 'join' && frame.self === true) {
          current.state = frame.townNightWindow;
          current.joinEpoch = frame.epochMs;
          current.joinReceivedAt = Date.now();
        } else if (frame.type === 'event' && frame.kind === 'town-night-window') {
          current.state = frame.state;
        }
      });
      socket.on('close', () => { if (westWindow === current) westWindow = undefined; });
    }
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
  await page.addInitScript(bare => {
    // Use the production drag fallback for consistent native mouse input in headless Chromium.
    // Only the browser API is made unavailable. All movement still runs through the viewer.
    Object.defineProperty(Element.prototype, 'requestPointerLock', { value: undefined });
    if (bare) return;
    // This is the viewer's ordinary saved graphics setting. It does not change the world or movement.
    localStorage.setItem('unwritten.quality.tier.v1', 'smooth');
    document.addEventListener('town-frame-profile', event => { window.__za22Frame = event.detail; }, true);
  }, bare);
  const response = await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  assert.equal(response?.status(), 200);
  assert.equal(new URL(page.url()).pathname, '/', 'Use the normal production root entry');
  if (bare) assert.equal(page.url(), url.href, 'The navigated document must stay at the bare root');
  await page.locator('#scene canvas').waitFor({ state: 'visible', timeout: 90_000 });
  await page.waitForFunction(({ pattern, bare }) => {
    const hud = document.querySelector('#position')?.textContent ?? '';
    const rendered = bare ? window.__za22Bare?.draws > 0 && Number.isFinite(window.__za22Bare?.cameraY)
      : window.__za22Frame?.calls > 0;
    return new RegExp(pattern).test(hud) && rendered;
  }, { pattern: positionPattern.source, bare }, { timeout: 90_000 });
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
  await waitForWire(page, evidence);
  evidence.checkpoints.push({ label: 'spawn', ...start, wire: evidence.poses.at(-1) });
  if (bare) await snapshot(page, evidence, 'ordinary-spawn');
  console.log(JSON.stringify({ phase: 'spawn', east: start.east, north: start.north, y: start.height }));
  return { page, evidence, westWindow: () => westWindow };
}

async function readPose(page) {
  const frame = await page.evaluate(bare => ({
    hud: document.querySelector('#position')?.textContent ?? '',
    cameraY: bare ? window.__za22Bare?.cameraY : window.__za22Frame?.cameraY,
    action: document.querySelector('#world-action')?.textContent ?? '',
    status: document.querySelector('#town-presence-status')?.textContent ?? '',
  }), bare);
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

async function waitForBareWalk(evidence, from, east, north) {
  const dx = east - from.east, dn = north - from.north;
  const distance = Math.hypot(dx, dn);
  const started = Date.now();
  const deadline = started + 30_000 + distance * 8_000;
  let lastProgress = started;
  let furthest = 0;

  // Headless software rendering can take seconds per frame. Keep waiting only
  // while real input is producing new position frames along this leg.
  while (Date.now() < deadline) {
    const wire = evidence.poses.at(-1);
    if (wire && wire.ms >= started) {
      const projected = ((wire.east - from.east) * dx + (wire.north - from.north) * dn) / distance;
      if (Math.hypot(wire.east - east, wire.north - north) <= .32 || projected >= distance) return;
      if (projected > furthest + .05) {
        furthest = projected;
        lastProgress = wire.ms;
      }
    }
    if (Date.now() - lastProgress > 20_000) {
      throw new Error(`No forward position progress for 20 seconds after ${furthest.toFixed(2)} m`);
    }
    await delay(80);
  }
  throw new Error(`Reached the walking time limit after ${furthest.toFixed(2)} m of ${distance.toFixed(2)} m`);
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
      if (bare) await waitForBareWalk(evidence, from, east, north);
      else await page.waitForFunction(({ pattern, start, east, north, dx, dn, distance }) => {
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
      throw new Error(`Native walking stopped before ${label} (${east}, ${north}): ${JSON.stringify(stopped)}. ${error.message}`,
        { cause: error });
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
  const file = `${label}.png`;
  const bytes = await page.screenshot({ path: join(output, file), timeout: 45_000 });
  const image = { file, sha256: createHash('sha256').update(bytes).digest('hex') };
  evidence.checkpoints.push({ label, ...await readPose(page), wire: evidence.poses.at(-1), image });
}

try {
  if (bare) {
    const health = await fetch(new URL('/healthz', url), { signal: AbortSignal.timeout(5_000), redirect: 'error' });
    assert.ok(health.ok, `Production preview health probe returned ${health.status}`);
    report.release = (await health.text()).trim();
    if (process.env.GITHUB_SHA) assert.equal(report.release, `town-preview ${process.env.GITHUB_SHA}`);
  }
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.UNWRITTEN_CHROMIUM_EXECUTABLE || process.env.CHROMIUM_PATH || undefined,
    args: graphicsArgs,
  });
  report.browser = browser.version();
  if (segment !== 'crater') {
    const { page, evidence } = await openTown('cable');
    await follow(page, evidence, bare ? bareStation : station, 'station');
    if (segment === 'station') {
      await action(page, '老闸');
      await card(page, '北岭缆车');
      await snapshot(page, evidence, 'station');
    } else {
      await action(page, '乘缆车一线前往云海台', 620_000);
      await page.waitForFunction(() => document.querySelector('#position')?.textContent?.includes('缆车一线'),
        null, { timeout: 135_000 });
      await snapshot(page, evidence, 'cable-boarding');
      const cableProgress = await page.waitForFunction(({ bare, pattern, destination }) => {
        const hud = document.querySelector('#position')?.textContent ?? '';
        const riding = document.querySelector('#position')?.textContent?.includes('缆车一线');
        const height = bare ? window.__za22Bare?.cameraY : window.__za22Frame?.cameraY;
        if (riding && height > 80 && height < 300) return 'moving';
        if (!bare) return false;
        const pose = new RegExp(pattern).exec(hud);
        return pose && Math.hypot(Number(pose[1]) - destination[0], Number(pose[2]) - destination[1]) < 1
          ? 'hud-arrival' : false;
      }, { bare, pattern: positionPattern.source, destination: cloudStop }, { timeout: bare ? 210_000 : 90_000 });
      evidence.cableProgress = await cableProgress.jsonValue();
      await cableProgress.dispose();
      if (evidence.cableProgress === 'moving') await snapshot(page, evidence, 'cable-moving');

      await page.waitForFunction(({ pattern, destination, bare }) => {
        const pose = new RegExp(pattern).exec(document.querySelector('#position')?.textContent ?? '');
        return pose && Math.hypot(Number(pose[1]) - destination[0], Number(pose[2]) - destination[1]) < 1
          && (bare || Math.abs((window.__za22Frame?.cameraY ?? 0) - 348.65) < .55);
      }, { pattern: positionPattern.source, destination: cloudStop, bare }, { timeout: 210_000 });
      await waitForWire(page, evidence, pose => pose?.area === 'mountain' && Math.abs(pose.height - 347) < .7 &&
        Math.hypot(pose.east - cloudStop[0], pose.north - cloudStop[1]) < 1);
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
        if (bare) {
          await follow(page, evidence, gate.slice(0, 2), 'gate-approach');
          await face(page, evidence, 0);
          await snapshot(page, evidence, 'mountain-gate-approach');
          await follow(page, evidence, gate.slice(2, 4), 'gate-crossing');
          await waitForWire(page, evidence, wire => wire?.area === 'mountain' && Math.abs(wire.east - 300) < .65 &&
            wire.north > 695 && wire.north < 697 && Math.abs(wire.height - 347) < .7);
          await snapshot(page, evidence, 'mountain-gate-crossing');
          await follow(page, evidence, gate.slice(4), 'gate-interior');
          await waitForWire(page, evidence, wire => wire?.area === 'mountain' && wire.north > 682 && wire.north < 684);
          await snapshot(page, evidence, 'mountain-gate-walk');
          evidence.canvas = await page.evaluate(() => {
            const canvas = document.querySelector('#scene canvas');
            const { cameraY, draws, recentIndexedDraws } = window.__za22Bare;
            return { width: canvas.width, height: canvas.height, cameraY, draws, recentIndexedDraws };
          });
          assert.ok(evidence.canvas.width > 0 && evidence.canvas.height > 0 && evidence.canvas.draws > 0);
        } else await follow(page, evidence, gate, 'gate');
        await action(page, '查看山门班次');
        await card(page, '山门');
        await snapshot(page, evidence, 'mountain-gate');
      }
    }
  }
  if (segment === 'crater' || segment === 'all') {
    const { page, evidence, westWindow } = await openTown('crater');
    await follow(page, evidence, westShore, 'west-shore');
    await follow(page, evidence, crater, 'crater');
    await face(page, evidence, -Math.PI / 2);
    const rim = await readPose(page);
    assert.ok(rim.east < -70.55 && Math.abs(rim.north - 159) < .5 && Math.abs(rim.height - 10.7773) < .5,
      JSON.stringify(rim));
    await snapshot(page, evidence, 'crater-entrance');
    await waitForWire(page, evidence, pose => pose?.area === 'west' && pose.east < -70.55);
    const deadline = Date.now() + 620_000;
    while (Date.now() < deadline) {
      const frame = westWindow();
      if (frame?.state?.canEnterRestricted) {
        const now = frame.joinEpoch + Date.now() - frame.joinReceivedAt;
        if (frame.state.morningBellAt - now > 15_000) {
          evidence.craterWindow = { ...frame.state, now };
          break;
        }
      }
      await page.waitForTimeout(600);
    }
    assert.ok(evidence.craterWindow, 'The west Presence room did not report an open crater window');
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
  try {
    const reportFile = bare ? 'zd01-default-mountain-walk.json' : 'za22-live-walk.json';
    await writeFile(join(output, reportFile), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ segment, paths: report.paths.map(path => ({ name: path.name, checkpoints: path.checkpoints.length,
      frames: path.poses.length, last: path.checkpoints.at(-1) })), errors: report.errors, failure: report.failure }));
  } finally {
    await browser?.close();
  }
}
