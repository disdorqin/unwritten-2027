import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const [checkoutArg = '.', outputArg = 'zb19-town-input-evidence', mode] = process.argv.slice(2);
assert.ok(!mode || mode === '--build-only', 'Third argument must be --build-only');
const checkout = path.resolve(checkoutArg);
const output = path.resolve(outputArg);
const require = createRequire(path.join(checkout, 'package.json'));
const helper = process.env.ZB19_LOOPBACK_HELPER ??
  path.join(checkout, 'tools', 'jx1-formal', 'app-build-and-loopback.mjs');
const { build, serve, swiftShader } = await import(pathToFileURL(path.resolve(helper)).href);
const { chromium } = require('@playwright/test');
const timeout = 150_000;

function observeViewer(source) {
  const anchor = 'function snowballJumped() {';
  assert.equal(source.split(anchor).length, 2, 'Expected one viewer fixture anchor');
  const wallRules = "import { classifyFreeWallSite as zb19FreeSite, classifyWallSite as zb19TeamSite, wallCellCentre as zb19CellCentre } from '../../../src/presence/snowfight';\n";
  return wallRules + source.replace(anchor, `
if (import.meta.env.MODE === 'town-rehearsal' && location.hostname === '127.0.0.1' &&
    new URLSearchParams(location.search).has('zb19TownInputs')) {
  let snowStaged = false, rackStaged = false, frames = 0, updateSeconds = 0;
  let frame: { calls?: number; triangles?: number; frameMs?: number } | undefined;
  let localThrows = 0;
  const events: Record<string, unknown>[] = [];
  renderer.domElement.addEventListener('town-frame-profile', event => {
    frame = (event as CustomEvent).detail;
    frames++;
    updateSeconds += Math.min(.25, Math.max(0, frame?.frameMs ?? 0) / 1_000);
  });
  renderer.domElement.addEventListener('town-snowball', event => {
    const { type, shotBy } = (event as CustomEvent).detail;
    if (type === 'throw' && shotBy === 'player') localThrows++;
  });
  for (const kind of ['keydown', 'keyup', 'pointerdown', 'pointerup', 'click']) {
    document.addEventListener(kind, event => {
      const key = event instanceof KeyboardEvent ? event.code : undefined;
      const element = event.target instanceof Element ?
        event.target.closest('canvas, #world-action, #snowball-primary, #snowfight-build, #lock-look, #touch-walk, #touch-sled-brake') : null;
      if (['KeyE', 'KeyB', 'KeyW', 'Space'].includes(key ?? '') || element) events.push({
        kind, key, id: element?.id || element?.tagName,
        pointer: event instanceof PointerEvent ? event.pointerType : undefined,
        repeat: event instanceof KeyboardEvent ? event.repeat : undefined,
        trusted: event.isTrusted,
      });
    }, true);
  }
  Object.defineProperty(window, '__zb19TownInputs', { value: {
    stageSnow() {
      if (snowStaged || !moveAllowed() || !walking || homeReturn) throw new Error('Start the normal outdoor scene first');
      snowStaged = true;
      // Existing plaza south supply, one fixture landing before any action under test.
      const targetEast = 233, targetNorth = 160;
      const feetEast = 233, feetNorth = 158.35;
      const feet = dryTownLandingHeight(feetEast, feetNorth);
      if (feet === undefined || !settleTownLanding(feetEast, feetNorth, feet) ||
          Math.hypot(x - feetEast, n - feetNorth) > .001) throw new Error('Fixture landing is obstructed');
      const targetHeight = grid.heightAt(targetEast, targetNorth) + .22;
      const bearing = Math.atan2(targetEast - x, targetNorth - n);
      const tilt = Math.atan2(targetHeight - (ground + eye - .08), Math.hypot(targetEast - x, targetNorth - n));
      turnView(bearing - yaw, tilt - pitch);
      renderer.domElement.focus({ preventScroll: true });
      if (!aimsAtNearbySnow() || gatherCheck.supply?.id !== 'south') throw new Error('The game ray did not hit south supply');
    },
    stageRack() {
      if (rackStaged || !snowStaged || !moveAllowed() || sledRide.active() || homeReturn) throw new Error('Finish the on-foot control section first');
      rackStaged = true;
      const rack = sledRacks.find(site => site.x === 378 && site.n === 303);
      if (!rack) throw new Error('The existing north-slope rack is missing');
      const feet = dryTownLandingHeight(rack.x, rack.n, rack.y);
      if (feet === undefined || !settleTownLanding(rack.x, rack.n, feet) || Math.hypot(x - rack.x, n - rack.n) > .001)
        throw new Error('The existing north-slope rack is obstructed');
      if (currentAction()?.label !== '乘雪橇') throw new Error('Expected the native rack interaction');
      // Establish a native snow ray next to the real rack before holding the input.
      let found = false;
      for (const bearing of [160, 130, 190, 100, 220, 70, 250, 40, 280, 10, 310, 340]) {
        for (const tilt of [-.8, -.95, -1.1, -1.25]) {
          turnView(bearing * Math.PI / 180 - yaw, tilt - pitch);
          if (aimsAtNearbySnow()) { found = true; break; }
        }
        if (found) break;
      }
      if (!found) throw new Error('Expected reachable natural snow beside the native rack');
      storeWalkView(walkRender);
      walkCurrent.copy(walkRender);
      walkPrevious.copy(walkRender);
      renderer.domElement.focus({ preventScroll: true });
    },
    sample() {
      aimSnowball();
      const gx = wallCellOf(tossOrigin.x + tossDirection.x * 2.2);
      const gy = wallCellOf(-tossOrigin.z - tossDirection.z * 2.2);
      const aimedAtSnow = aimsAtNearbySnow();
      const controls = (id: string) => document.getElementById(id);
      const visible = (id: string) => {
        const button = controls(id);
        return !!button && button.getClientRects().length > 0;
      };
      return { walking, canMove: moveAllowed(), east: x, north: n, ground, yaw, pitch, frame, frames, updateSeconds,
        stock: snowballs.getState().ammo, buildMode: teamFight.buildMode(), localThrows,
        wall: { gx, gy, layers: teamFight.wallColumnAt(gx, gy)?.height ?? 0,
          freeSiteRejection: zb19FreeSite(zb19CellCentre(gx), zb19CellCentre(gy)) ?? null,
          teamSiteRejection: zb19TeamSite(zb19CellCentre(gx), zb19CellCentre(gy)) ?? null },
        snowfight: { canBuild: teamFight.canBuild(), active: teamFight.active(),
          available: presence.snowfightAvailable(), freeWalls: presence.freeSnowWallsAvailable() },
        focusedTag: document.activeElement?.tagName ?? null,
        aimedAtSnow, aimedAtSouthSupply: aimedAtSnow && gatherCheck.supply?.id === 'south',
        action: currentAction()?.label ?? null,
        riding: sledRide.active(), recovering: sledRide.recovering(), brake: sledRide.braking(), speed: sledRide.speed(),
        airborne: airHeight !== undefined || sledRide.airborne(),
        parked: sledRide.parked() ?? null,
        ui: { action: controls('world-action')?.textContent,
          primary: visible('snowball-primary'), wall: visible('snowfight-build'),
          jump: visible('touch-jump'), sprint: visible('touch-sprint'), brake: visible('touch-sled-brake'),
          brakePressed: controls('touch-sled-brake')?.getAttribute('aria-pressed'),
          direction: controls('touch-walk')?.getAttribute('aria-label') },
        mouseLocked: document.pointerLockElement === renderer.domElement,
        presenceId: presence.selfId(), events: events.slice() };
    },
    wallAt(gx: number, gy: number) {
      return { gx, gy, layers: teamFight.wallColumnAt(gx, gy)?.height ?? 0 };
    },
  } });
}
${anchor}`);
}

async function observe(page, predicate, argument, waitMs = timeout) {
  const handle = await page.waitForFunction(predicate, argument, { timeout: waitMs });
  try { return await handle.jsonValue(); } finally { await handle.dispose(); }
}

const sample = page => page.evaluate(() => window.__zb19TownInputs.sample());
const buildButton = '#snowfight-build';
const snowButton = '#snowball-primary';
const actionButton = '#world-action';
const brakeButton = '#touch-sled-brake';

function watchWallFrames(socket, frames) {
  if (new URL(socket.url()).pathname !== '/presence') return;
  function record(direction, payload) {
    if (frames.length >= 32) return;
    if (typeof payload === 'string') {
      try {
        const message = JSON.parse(payload);
        if (message?.type === 'snowfight-rejected' && typeof message.reason === 'string') {
          frames.push({ direction, kind: 'rejected', reason: message.reason });
        }
      } catch {
        // Other presence messages are outside this trace.
      }
    } else if (payload[0] === 0xff) {
      if (payload[1] === 3 && payload.length === 8) {
        frames.push({ direction, kind: 'place', gx: payload.readUInt16LE(2), gy: payload.readUInt16LE(4) });
      } else if (payload[1] === 5 && payload.length >= 12) {
        frames.push({ direction, kind: 'wall-set', gx: payload.readUInt16LE(2), gy: payload.readUInt16LE(4),
          layer: payload[6], team: payload[10] });
      } else if (payload[1] === 6 && payload.length >= 3) {
        frames.push({ direction, kind: 'wall-clear', count: payload[2] });
      }
    }
  }
  socket.on('framesent', ({ payload }) => record('sent', payload));
  socket.on('framereceived', ({ payload }) => record('received', payload));
}

async function waitForWallFrame(frames, start, accepts, label) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const frame = frames.slice(start).find(accepts);
    if (frame) return frame;
    await delay(25);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function centre(page, selector) {
  const button = page.locator(selector);
  await button.waitFor({ state: 'visible', timeout });
  const box = await button.boundingBox();
  assert.ok(box, `Expected the existing ${selector} control`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function holdInteraction(context, page, touch) {
  if (!touch) {
    await page.keyboard.down('e');
    return () => page.keyboard.up('e');
  }
  const point = await centre(page, actionButton);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart',
    touchPoints: [point] });
  return () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function checkBrake(context, page, touch, trace) {
  trace.status = 'driving';
  let cdp, stick, brake;
  if (touch) {
    const origin = await centre(page, '#touch-walk');
    stick = { ...origin, y: origin.y - 40, id: 1 };
    brake = { ...await centre(page, brakeButton), id: 2 };
    cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...origin, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [stick] });
  } else await page.keyboard.down('w');
  try {
    trace.beforeBrake = await observe(page, () => {
      const state = window.__zb19TownInputs.sample();
      return state.riding && !state.recovering && !state.brake && state.speed >= 2.5 && state;
    });
    trace.status = 'braking';
    if (touch) await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [stick, brake] });
    else await page.keyboard.down('Space');
    trace.braking = await observe(page, ({ speed, touch }) => {
      const state = window.__zb19TownInputs.sample();
      return state.riding && !state.recovering && state.brake && state.speed <= speed - .4 &&
        (!touch || state.ui.brakePressed === 'true') && state;
    }, { speed: trace.beforeBrake.speed, touch });
    if (touch) {
      for (const id of ['touch-walk', 'touch-sled-brake']) assert.ok(trace.braking.events.some(event =>
        event.kind === 'pointerdown' && event.id === id && event.pointer === 'touch' && event.trusted));
    } else {
      for (const key of ['KeyW', 'Space']) assert.ok(trace.braking.events.some(event =>
        event.kind === 'keydown' && event.key === key && event.trusted));
      await page.keyboard.up('w');
      trace.status = 'dismount with brake held';
      await page.keyboard.press('e');
      trace.brakedDismount = await observe(page, () => {
        const state = window.__zb19TownInputs.sample();
        return !state.riding && !state.brake && state.parked && state.action === '重新上橇' && state;
      });
      trace.status = 'remount before releasing Space';
      await page.keyboard.press('e');
      const remounted = await observe(page, () => {
        const state = window.__zb19TownInputs.sample();
        return state.riding && !state.parked && !state.brake && !state.airborne && state;
      });
      await page.keyboard.down('Space');
      trace.repeatedSpace = await observe(page, start => {
        const state = window.__zb19TownInputs.sample();
        const repeated = state.events.slice(start.events).some(event =>
          event.key === 'Space' && event.kind === 'keydown' && event.repeat && event.trusted);
        return state.frames >= start.frames + 4 && repeated && state;
      }, { events: remounted.events.length, frames: remounted.frames });
      assert.equal(trace.repeatedSpace.riding, true);
      assert.equal(trace.repeatedSpace.brake, false, 'Held Space repeated into the newly mounted sled');
      assert.equal(trace.repeatedSpace.airborne, false, 'Riding Space should not jump');
    }
  } finally {
    if (touch) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    else {
      await page.keyboard.up('Space');
      await page.keyboard.up('w');
    }
  }
  trace.afterBrake = await observe(page, () => {
    const state = window.__zb19TownInputs.sample();
    return state.riding && !state.brake && state.ui.brakePressed === 'false' && state;
  });
}

async function testControls(browser, dist, touch, evidence) {
  const modality = touch ? 'touch' : 'desktop';
  const trace = evidence.controls[modality] = { status: 'starting', errors: [], connectionLogs: [], wallFrames: [] };
  const { server, url } = await serve(checkout, dist, require, trace.connectionLogs);
  let browserContext;
  let page;
  try {
    browserContext = await browser.newContext(touch ?
      { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } :
      { viewport: { width: 1000, height: 650 }, deviceScaleFactor: 1 });
    page = await browserContext.newPage();
    const socketUrls = [];
    page.on('pageerror', error => trace.errors.push(error.message));
    page.on('websocket', socket => {
      socketUrls.push(socket.url());
      watchWallFrames(socket, trace.wallFrames);
    });

    const response = await page.goto(`${url}/town-blockout.html?profile&zb19TownInputs`, { waitUntil: 'domcontentloaded', timeout });
    assert.equal(response?.status(), 200);
    await observe(page, () => Boolean(window.__zb19TownInputs));
    await observe(page, () => {
      const s = window.__zb19TownInputs.sample();
      return s.walking && s.canMove && s.frame?.calls > 0 && s.presenceId !== null;
    });
    trace.normalEntrance = await sample(page);
    await page.evaluate(() => window.__zb19TownInputs.stageSnow());
    assert.ok(socketUrls.some(value => new URL(value).pathname === '/presence'), 'Expected a real presence WebSocket');
    trace.before = await sample(page);
    assert.equal(trace.before.stock, 0);
    assert.equal(trace.before.aimedAtSouthSupply, true);
    assert.equal(trace.before.action, null, 'The open-snow section must have no interaction target');
    assert.equal(trace.before.wall.layers, 0);
    trace.status = 'collecting';
    const release = await holdInteraction(browserContext, page, touch);
    try {
      await observe(page, () => window.__zb19TownInputs.sample().stock >= 4);
    } finally {
      await release();
    }
    trace.afterHold = await sample(page);
    assert.equal(trace.afterHold.localThrows, trace.before.localThrows);
    assert.equal(trace.afterHold.wall.layers, 0);

    if (!touch) {
      await page.locator('#lock-look').click({ timeout });
      await observe(page, () => window.__zb19TownInputs.sample().mouseLocked);
    }
    const primary = touch ? () => page.locator(snowButton).tap({ timeout }) : () => page.mouse.click(500, 325);
    trace.status = 'throwing';
    await primary();
    trace.afterThrow = await observe(page, before => {
      const s = window.__zb19TownInputs.sample();
      return s.stock === before.stock - 1 && s.localThrows === before.localThrows + 1 && s;
    }, trace.afterHold);
    assert.equal(trace.afterThrow.wall.layers, 0);

    trace.status = 'switching-build-mode';
    if (touch) await page.locator(buildButton).tap({ timeout });
    else await page.keyboard.press('b');
    trace.afterToggle = await observe(page, () => {
      const status = window.__zb19TownInputs.sample();
      return status.buildMode && status;
    });
    trace.status = 'awaiting-wall-ack';
    const firstWallFrame = trace.wallFrames.length;
    await primary();
    trace.afterPlaceAttempt = await sample(page);
    const request = trace.wallRequest = await waitForWallFrame(trace.wallFrames, firstWallFrame,
      frame => frame.direction === 'sent' && frame.kind === 'place', 'the placement request after primary input');
    const reply = trace.wallReply = await waitForWallFrame(trace.wallFrames, firstWallFrame,
      frame => frame.direction === 'received' && (frame.kind === 'rejected' ||
        (frame.kind === 'wall-set' && frame.gx === request.gx && frame.gy === request.gy)), 'the matching authority reply');
    assert.equal(reply.kind, 'wall-set', reply.reason && `The server rejected the placement: ${reply.reason}`);
    assert.equal(reply.layer, 0, 'Expected one new layer in the fresh town session');
    // Pointer-lock input may move the aim between throwing and placing. Inspect the cell the click actually sent.
    trace.afterPlace = await observe(page, ({ gx, gy, stock }) => {
      const probe = window.__zb19TownInputs;
      const state = probe.sample();
      const placedWall = probe.wallAt(gx, gy);
      return state.stock === stock - 3 && placedWall.layers === 1 && { ...state, placedWall };
    }, { gx: request.gx, gy: request.gy, stock: trace.afterToggle.stock });
    assert.equal(trace.wallFrames.slice(firstWallFrame).filter(frame => frame.direction === 'sent' && frame.kind === 'place').length, 1);
    assert.equal(trace.afterPlace.localThrows, trace.afterThrow.localThrows);
    // The game attaches layers only on real wall-set broadcasts, not on local reservation.
    const actions = trace.afterPlace.events;
    assert.ok(actions.some(event => event.kind === 'pointerdown' && event.trusted &&
      event.pointer === (touch ? 'touch' : 'mouse') && event.id === (touch ? 'snowball-primary' : 'CANVAS')));
    if (touch) {
      for (const id of ['world-action', 'snowfight-build']) assert.ok(actions.some(event =>
        event.kind === 'pointerdown' && event.id === id && event.pointer === 'touch' && event.trusted));
    } else {
      for (const key of ['KeyE', 'KeyB']) assert.ok(actions.some(event => event.key === key && event.trusted));
    }
    trace.status = 'snow with an interaction target';
    await page.evaluate(() => window.__zb19TownInputs.stageRack());
    trace.beforeTargetHold = await observe(page, () => {
      const state = window.__zb19TownInputs.sample();
      return state.action === '乘雪橇' && state.aimedAtSnow && state;
    });
    const releaseTarget = await holdInteraction(browserContext, page, touch);
    try {
      trace.duringTargetHold = await observe(page, start => {
        const state = window.__zb19TownInputs.sample();
        return state.frames >= start.frames + 36 && state.updateSeconds >= start.updateSeconds + 1.6 && state;
      }, { frames: trace.beforeTargetHold.frames, updateSeconds: trace.beforeTargetHold.updateSeconds });
    } finally {
      await releaseTarget();
    }
    trace.afterTargetHold = await sample(page);
    for (const state of [trace.duringTargetHold, trace.afterTargetHold]) {
      assert.equal(state.aimedAtSnow, true);
      assert.equal(state.action, '乘雪橇');
      assert.equal(state.stock, trace.beforeTargetHold.stock, 'Held interaction incorrectly gathered snow');
      assert.equal(state.riding, false, 'Held interaction incorrectly mounted the sled');
    }

    trace.status = 'short interaction mounts';
    if (touch) await page.locator(actionButton).tap({ timeout });
    else await page.keyboard.press('e');
    trace.mounted = await observe(page, touch => {
      const state = window.__zb19TownInputs.sample();
      return state.riding && state.action === '下橇' && !state.buildMode &&
        (!touch || (state.ui.brake && state.ui.direction === '驾驶摇杆' && !state.ui.primary && !state.ui.wall &&
          !state.ui.jump && !state.ui.sprint)) && state;
    }, touch);
    await checkBrake(browserContext, page, touch, trace);
    trace.status = 'short interaction dismounts';
    if (touch) await page.locator(actionButton).tap({ timeout });
    else await page.keyboard.press('e');
    trace.dismounted = await observe(page, touch => {
      const state = window.__zb19TownInputs.sample();
      return !state.riding && (!touch || (!state.ui.brake && state.ui.direction === '移动摇杆')) && state;
    }, touch);
    assert.deepEqual(trace.errors, []);
    trace.status = 'passed';
  } catch (error) {
    trace.failure = error instanceof Error ? error.message : String(error);
    if (page && !page.isClosed()) {
      try {
        trace.last = await observe(page, () => window.__zb19TownInputs?.sample(), undefined, 5_000);
      } catch (diagnosticError) {
        trace.lastError = diagnosticError instanceof Error ? diagnosticError.message : String(diagnosticError);
      }
    }
    throw error;
  } finally {
    await browserContext?.close();
    await server.close();
  }
}

await mkdir(output, { recursive: true });
const temp = await mkdtemp(path.join(tmpdir(), 'zb19-town-inputs-'));
const dist = path.join(temp, 'dist');
const evidence = { scope: 'A composed town and loopback presence, two native fixture landings per device before trusted input',
  candidate: {}, controls: {}, status: 'building' };
let browser;
try {
  for (const file of ['tools/voxel-tavern/town-blockout/viewer.ts',
    'tools/voxel-tavern/town-blockout.html', 'tools/voxel-tavern/town-blockout/town-snow-controls.ts',
    'tools/voxel-tavern/town-blockout/town-mobile-controls.ts', 'tools/voxel-tavern/town-blockout/sled-ride.ts',
    'src/shared/snow-stock.ts', 'src/presence/server.ts']) {
    evidence.candidate[file] = createHash('sha256').update(await readFile(path.join(checkout, file))).digest('hex');
  }
  await build(checkout, dist, observeViewer);
  evidence.status = 'build-only passed';
  if (mode !== '--build-only') {
    evidence.status = 'running';
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH, args: swiftShader });
    const failures = [];
    for (const touch of [false, true]) {
      try {
        await testControls(browser, dist, touch, evidence);
      } catch (error) {
        failures.push(`${touch ? 'touch' : 'desktop'}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (failures.length) throw new Error(failures.join(' | '));
    evidence.status = 'passed';
  }
} catch (error) {
  evidence.failure = error instanceof Error ? error.message : String(error);
  evidence.status = 'failed';
  process.exitCode = 1;
} finally {
  await writeFile(path.join(output, 'zb19-town-inputs.json'), JSON.stringify(evidence, null, 2) + '\n');
  await browser?.close();
  await rm(temp, { force: true, recursive: true });
}
console.log(JSON.stringify({ status: evidence.status, output, controls: Object.fromEntries(
  Object.entries(evidence.controls).map(([key, trace]) => [key, trace.status])), failure: evidence.failure }));
