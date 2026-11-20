import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [checkoutArg = '.', outputArg = 'zb15-town-input-evidence', mode] = process.argv.slice(2);
assert.ok(!mode || mode === '--build-only', 'Third argument must be --build-only');
const checkout = path.resolve(checkoutArg);
const output = path.resolve(outputArg);
const require = createRequire(path.join(checkout, 'package.json'));
const helper = process.env.ZB15_LOOPBACK_HELPER ??
  path.join(checkout, 'tools', 'jx1-formal', 'app-build-and-loopback.mjs');
const { build, serve, swiftShader } = await import(pathToFileURL(path.resolve(helper)).href);
const { chromium } = require('@playwright/test');
const timeout = 150_000;

function observeViewer(source) {
  const anchor = 'function snowballJumped() {';
  assert.equal(source.split(anchor).length, 2, 'Expected one viewer fixture anchor');
  return source.replace(anchor, `
if (import.meta.env.MODE === 'town-rehearsal' && location.hostname === '127.0.0.1' &&
    new URLSearchParams(location.search).has('zb15TownInputs')) {
  let staged = false;
  let frame: { calls?: number; triangles?: number } | undefined;
  let localThrows = 0;
  const events: Record<string, unknown>[] = [];
  renderer.domElement.addEventListener('town-frame-profile', event => { frame = (event as CustomEvent).detail; });
  renderer.domElement.addEventListener('town-snowball', event => {
    const { type, shotBy } = (event as CustomEvent).detail;
    if (type === 'throw' && shotBy === 'player') localThrows++;
  });
  for (const kind of ['keydown', 'keyup', 'pointerdown', 'pointerup', 'click']) {
    document.addEventListener(kind, event => {
      const key = event instanceof KeyboardEvent ? event.code : undefined;
      const element = event.target instanceof Element ?
        event.target.closest('canvas, #snowball-primary, #snowfight-build, #lock-look') : null;
      if (key === 'KeyE' || key === 'KeyB' || element) events.push({
        kind, key, id: element?.id || element?.tagName,
        pointer: event instanceof PointerEvent ? event.pointerType : undefined,
        trusted: event.isTrusted,
      });
    }, true);
  }
  Object.defineProperty(window, '__zb15TownInputs', { value: {
    stage() {
      if (staged || !moveAllowed() || !walking || homeReturn) throw new Error('Start the normal outdoor scene first');
      staged = true;
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
    sample() {
      aimSnowball();
      const gx = wallCellOf(tossOrigin.x + tossDirection.x * 2.2);
      const gy = wallCellOf(-tossOrigin.z - tossDirection.z * 2.2);
      return { walking, canMove: moveAllowed(), east: x, north: n, ground, yaw, pitch, frame,
        stock: snowballs.getState().ammo, buildMode: teamFight.buildMode(), localThrows,
        wall: { gx, gy, layers: teamFight.wallColumnAt(gx, gy)?.height ?? 0 },
        aimedAtSouthSupply: aimsAtNearbySnow() && gatherCheck.supply?.id === 'south',
        mouseLocked: document.pointerLockElement === renderer.domElement,
        presenceId: presence.selfId(), events: events.slice() };
    },
  } });
}
${anchor}`);
}

async function observe(page, predicate, argument) {
  const handle = await page.waitForFunction(predicate, argument, { timeout });
  try { return await handle.jsonValue(); } finally { await handle.dispose(); }
}

const sample = page => page.evaluate(() => window.__zb15TownInputs.sample());
const buildButton = '#snowfight-build';
const snowButton = '#snowball-primary';

async function holdMobile(context, page) {
  const snow = page.locator(snowButton);
  await snow.waitFor({ state: 'visible', timeout });
  const box = await snow.boundingBox();
  assert.ok(box, 'Expected the production snow button');
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart',
    touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
  return () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function testControls(browser, dist, touch, evidence) {
  const modality = touch ? 'touch' : 'desktop';
  const trace = evidence.controls[modality] = { status: 'starting', errors: [], connectionLogs: [] };
  const { server, url } = await serve(checkout, dist, require, trace.connectionLogs);
  let browserContext;
  try {
    browserContext = await browser.newContext(touch ?
      { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } :
      { viewport: { width: 1000, height: 650 }, deviceScaleFactor: 1 });
    const page = await browserContext.newPage();
    const socketUrls = [];
    page.on('pageerror', error => trace.errors.push(error.message));
    page.on('websocket', socket => socketUrls.push(socket.url()));

    const response = await page.goto(`${url}/town-blockout.html?profile&zb15TownInputs`, { waitUntil: 'domcontentloaded', timeout });
    assert.equal(response?.status(), 200);
    await observe(page, () => Boolean(window.__zb15TownInputs));
    await page.locator('#jump').selectOption({ label: '雪团练习场' }, { timeout });
    await observe(page, () => {
      const s = window.__zb15TownInputs.sample();
      return s.walking && s.canMove && s.frame?.calls > 0 && s.presenceId !== null;
    });
    trace.normalEntrance = await sample(page);
    await page.evaluate(() => window.__zb15TownInputs.stage());
    assert.ok(socketUrls.some(value => new URL(value).pathname === '/presence'), 'Expected a real presence WebSocket');
    trace.before = await sample(page);
    assert.equal(trace.before.stock, 0);
    assert.equal(trace.before.aimedAtSouthSupply, true);
    assert.equal(trace.before.wall.layers, 0);
    trace.status = 'collecting';
    const release = touch ? await holdMobile(browserContext, page) : await (async () => {
      await page.keyboard.down('e');
      return () => page.keyboard.up('e');
    })();
    try {
      await observe(page, () => window.__zb15TownInputs.sample().stock >= 4);
    } finally {
      await release();
    }
    trace.afterHold = await sample(page);
    assert.equal(trace.afterHold.localThrows, trace.before.localThrows);
    assert.equal(trace.afterHold.wall.layers, 0);

    if (!touch) {
      await page.locator('#lock-look').click({ timeout });
      await observe(page, () => window.__zb15TownInputs.sample().mouseLocked);
    }
    const primary = touch ? () => page.locator(snowButton).tap({ timeout }) : () => page.mouse.click(500, 325);
    trace.status = 'throwing';
    await primary();
    trace.afterThrow = await observe(page, before => {
      const s = window.__zb15TownInputs.sample();
      return s.stock === before.stock - 1 && s.localThrows === before.localThrows + 1 && s;
    }, trace.afterHold);
    assert.equal(trace.afterThrow.wall.layers, 0);

    trace.status = 'building';
    if (touch) await page.locator(buildButton).tap({ timeout });
    else await page.keyboard.press('b');
    await observe(page, () => window.__zb15TownInputs.sample().buildMode);
    await primary();
    trace.afterPlace = await observe(page, before => {
      const s = window.__zb15TownInputs.sample();
      return s.stock === before.stock - 3 && s.wall.gx === before.wall.gx &&
        s.wall.gy === before.wall.gy && s.wall.layers === before.wall.layers + 1 && s;
    }, trace.afterThrow);
    assert.equal(trace.afterPlace.localThrows, trace.afterThrow.localThrows);
    // The game attaches layers only on real wall-set broadcasts, not on local reservation.
    const actions = trace.afterPlace.events;
    assert.ok(actions.some(event => event.kind === 'pointerdown' && event.trusted &&
      event.pointer === (touch ? 'touch' : 'mouse') && event.id === (touch ? 'snowball-primary' : 'CANVAS')));
    if (touch) {
      assert.ok(actions.some(event => event.id === 'snowfight-build' && event.pointer === 'touch' && event.trusted));
    } else {
      for (const key of ['KeyE', 'KeyB']) assert.ok(actions.some(event => event.key === key && event.trusted));
    }
    assert.deepEqual(trace.errors, []);
    trace.status = 'passed';
  } catch (error) {
    trace.failure = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    await browserContext?.close();
    await server.close();
  }
}

await mkdir(output, { recursive: true });
const temp = await mkdtemp(path.join(tmpdir(), 'zb15-town-inputs-'));
const dist = path.join(temp, 'dist');
const evidence = { scope: 'production town runtime and loopback presence with one initial test landing per device',
  candidate: {}, controls: {}, status: 'building' };
let browser;
try {
  for (const file of ['tools/voxel-tavern/town-blockout/viewer.ts',
    'tools/voxel-tavern/town-blockout.html', 'tools/voxel-tavern/town-blockout/town-snow-controls.ts',
    'src/shared/snow-stock.ts', 'src/presence/server.ts']) {
    evidence.candidate[file] = createHash('sha256').update(await readFile(path.join(checkout, file))).digest('hex');
  }
  await build(checkout, dist, observeViewer);
  evidence.status = 'build-only passed';
  if (mode !== '--build-only') {
    evidence.status = 'running';
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH, args: swiftShader });
    await testControls(browser, dist, false, evidence);
    await testControls(browser, dist, true, evidence);
    evidence.status = 'passed';
  }
} catch (error) {
  evidence.failure = error instanceof Error ? error.message : String(error);
  evidence.status = 'failed';
  process.exitCode = 1;
} finally {
  await writeFile(path.join(output, 'zb15-town-inputs.json'), JSON.stringify(evidence, null, 2) + '\n');
  await browser?.close();
  await rm(temp, { force: true, recursive: true });
}
console.log(JSON.stringify({ status: evidence.status, output, controls: Object.fromEntries(
  Object.entries(evidence.controls).map(([key, trace]) => [key, trace.status])), failure: evidence.failure }));
