import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build, serve, swiftShader } from './app-build-and-loopback.mjs';
import { instrument } from './viewer-probe.mjs';

const timeout = 60_000;
const menu = '#market-home-entrance';
const outdoor = 1;
const shared = 2;
const reentryLabel = '出门 · 返回来时的屋门';
const legacyLabel = '进入屋舍空间';
const desktop = { viewport: { width: 1000, height: 650 }, deviceScaleFactor: 1 };
const mobile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const exact = 1e-6;
const distance = (a, b) => Math.hypot(a.east - b.east, a.north - b.north);
const near = (a, b, eps, label) => assert.ok(Math.abs(a - b) <= eps, `${label}: got ${a}, expected ${b} ±${eps}`);
const doorPose = door => ({ east: door.x, north: door.n, ground: door.ground });
const relativeAngle = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const sample = page => page.evaluate(() => window.__jx1ProductionProof.sample());
const observe = (page, method, value) => page.evaluate(([method, value]) => window.__jx1ProductionProof[method](value), [method, value]);
const control = (page, action) => page.locator(`${menu} [data-market-home-action='${action}']`);

async function frame(page, expected = {}, limit = timeout) {
  return (await page.waitForFunction(expected => {
    const pose = window.__jx1ProductionProof?.sample();
    if (!pose?.lastFrame?.calls || !pose?.lastFrame?.triangles || !pose.walking || pose.travelling) return;
    if (pose.frames <= (expected.after ?? 0)) return;
    for (const key of ['mask', 'home', 'menuId', 'dialogOpen', 'canvasFocused', 'canMove', 'segmentRejected']) {
      if (key in expected && pose[key] !== expected[key]) return;
    }
    if (expected.action && !pose.action.includes(expected.action)) return;
    if (expected.near && Math.hypot(pose.east - expected.near.east, pose.north - expected.near.north) > expected.tolerance) return;
    return pose;
  }, expected, { timeout: limit })).jsonValue();
}

let sessionCount = 0;
async function start(browser, url, isTouch) {
  const context = await browser.newContext({ ...(isTouch ? mobile : desktop), locale: 'zh-CN', reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', event => {
    if (event.type() === 'error' && /建筑清单读取失败|栋替换模型加载失败|Loading extension streets/.test(event.text())) errors.push(event.text());
  });
  try {
    const response = await page.goto(`${url}/town-blockout.html?profile&jx1ProductionProof`, { waitUntil: 'domcontentloaded', timeout });
    assert.equal(response?.status(), 200);
    await page.waitForFunction(() => Boolean(window.__jx1ProductionProof), null, { timeout });
    await page.locator('#jump').selectOption({ label: '东北纪念馆' });
    await frame(page, { mask: outdoor, home: null, canMove: true });
    const cdp = isTouch ? await context.newCDPSession(page) : undefined;
    if (isTouch) {
      assert.ok(await page.evaluate(() => matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0));
    }
    return { id: ++sessionCount, context, page, errors, cdp };
  } catch (error) {
    await context.close();
    throw error;
  }
}

function compareRegistry(expected, actual, enabledIds) {
  const expectedIds = expected.doors.map(door => door.id).sort();
  assert.deepEqual(actual.doors.map(door => door.id).sort(), expectedIds, 'The complete 92-door registry must stay equal');
  const actualById = new Map(actual.doors.map(door => [door.id, door]));
  for (const old of expected.doors) {
    const current = actualById.get(old.id);
    assert.equal(old.zone, current.zone, `${old.id} zone`);
    for (const field of ['x', 'n', 'ground']) near(current[field], old[field], exact, `${old.id} ${field}`);
    near(relativeAngle(current.exitYaw, old.exitYaw), 0, exact, `${old.id} exitYaw`);
  }
  assert.deepEqual([...actual.active].sort(), [...enabledIds].sort(), 'Only explicitly enabled and successfully constructed candidates may activate');
  const plain = expectedIds.filter(id => !expected.marketIds.includes(id));
  assert.equal(plain.length, 75);
  for (const id of expected.marketIds) {
    const spots = actualById.get(id).spots.filter(spot => spot.label === '集市屋门' && spot.range === 1.6);
    assert.equal(spots.length, 1, `${id} must retain one chooser spot before and after physical activation`);
  }
  for (const id of plain) {
    assert.ok(actualById.get(id).spots.some(spot => spot.label === legacyLabel && spot.range === 1.6), `${id} lost its registered legacy spot`);
  }
  return { checked: expectedIds.length, market: expected.marketIds.length, legacySpots: plain.length };
}

async function openMenu(session, id, allowVisit = true) {
  const { page, cdp } = session;
  const before = await frame(page, { mask: outdoor, home: null, canMove: true });
  assert.ok(before.action, 'The player must have a real door action at the current position');
  if (cdp) await page.locator('#world-action').tap({ timeout });
  else await page.keyboard.press('e');
  await page.locator(`#place-card[open] ${menu}`).waitFor({ state: 'visible', timeout });
  assert.equal(await page.locator(menu).getAttribute('data-door-id'), id);
  assert.equal((await control(page, 'shared').textContent())?.trim(), legacyLabel);
  assert.equal((await control(page, 'visit').textContent())?.trim(), '参观这户');
  for (const kind of ['shared', 'visit', 'cancel']) {
    assert.equal(await control(page, kind).count(), 1, `Missing a unique ${kind} button`);
    assert.equal(await control(page, kind).isEnabled(), kind !== 'visit' || allowVisit, `Unexpected ${kind} permission`);
  }
  return before;
}

async function choose(session, kind) {
  const { page, cdp } = session;
  const button = control(page, kind);
  if (cdp) return button.tap({ timeout });
  // A real Tab sequence must reach each choice, including the second menu item.
  for (let count = 0; count <= 12; count++) {
    if (await button.evaluate(element => element === document.activeElement)) return page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
  }
  assert.fail(`Could not reach ${kind} by keyboard`);
}

function assertVisitStayed(before, after) {
  near(distance(before, after), 0, exact, 'Visit choice moved the player');
  near(after.ground, before.ground, exact, 'Visit choice changed support');
  assert.deepEqual(after.visits, before.visits, 'Physical visit must leave the B13 visit book untouched');
}

async function afterCancel(session, before) {
  const after = await frame(session.page, {
    after: before.frames, mask: outdoor, home: null, canMove: true, dialogOpen: false, canvasFocused: true,
  });
  assertVisitStayed(before, after);
  return after;
}

async function capture(page, output, filename) {
  const png = await page.screenshot({ path: path.join(output, filename), animations: 'disabled', timeout });
  assert.ok(png.length > 10_000, 'Screenshot has too little data to show the production scene');
  return filename;
}

async function beginForward(session) {
  const { page, cdp } = session;
  if (!cdp) {
    await page.keyboard.down('w');
    return () => page.keyboard.up('w');
  }
  const box = await page.locator('#touch-walk').boundingBox({ timeout });
  assert.ok(box, 'Production joystick must be visible');
  const x = Math.round(box.x + box.width / 2);
  const y = Math.round(box.y + box.height / 2);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  try {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 28 }] });
  } catch (error) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    throw error;
  }
  return () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function moveTo(session, target, options = {}) {
  const { page } = session;
  const before = await sample(page);
  const tolerance = target.tolerance ?? .22;
  if (!options.block && distance(before, target) <= tolerance) return { before, after: before, moves: [], length: 0 };
  await observe(page, 'aim', target);
  await observe(page, 'startSegment');
  let end;
  let observed;
  let moves;
  try {
    end = await beginForward(session);
    if (options.block) {
      observed = await frame(page, {
        after: before.frames, home: before.home, mask: before.mask, segmentRejected: true,
      }, target.timeout ?? 12_000);
    } else {
      observed = await frame(page, {
        after: before.frames, home: before.home, mask: before.mask, near: target, tolerance,
      }, target.timeout ?? 20_000);
    }
  } finally {
    try { if (end) await end(); } finally { moves = await observe(page, 'endSegment'); }
    options.diagnostics?.push({ target, before, observed, moves });
  }
  const accepted = moves.filter(move => move.accepted);
  const rejected = moves.filter(move => !move.accepted);
  assert.ok(moves.length > 0, 'Input did not reach production tryMove');
  if (options.block) {
    assert.ok(rejected.length > 0, 'The attempted wall approach had no rejected production movement');
    assert.ok(distance(observed, target) > tolerance, 'The player reached a point on the wrong side of the adjacent wall');
  } else assert.deepEqual(rejected, [], 'The surveyed passable route collided');
  for (const move of accepted) {
    assert.equal(move.before.air, null, 'Movement started airborne');
    assert.equal(move.after.air, null, 'Movement lost continuous support');
    assert.ok(Math.abs(move.after.ground - move.before.ground) <= .430001, 'Observed support exceeded 0.43 m step');
    const support = move.support;
    assert.ok(support.floors.length || support.ramps.length || support.solids.length ||
      Math.abs(support.surface - move.after.ground) <= .001, 'Missing observed support');
    assert.ok(distance(move.before, move.after) <= .5, 'Observed displacement exceeds one physics step');
  }
  const after = await frame(page, { after: observed.frames, home: before.home, mask: before.mask });
  if (!options.block) assert.ok(distance(after, target) <= tolerance + .15, 'The waypoint overshot after releasing movement');
  return { target, before, after, moves, length: accepted.reduce((sum, move) => sum + distance(move.before, move.after), 0) };
}

async function legacyReturn(session, id, stand) {
  const { page, cdp } = session;
  const spawn = await frame(page, { mask: shared, home: id });
  near(spawn.east, 625.18, .05, 'Shared room spawn east');
  near(spawn.north, 493.64, .05, 'Shared room spawn north');
  near(spawn.ground, 150, .01, 'Shared room spawn ground');
  assert.ok(spawn.visits.includes(id), 'Shared action must write the originating visit');
  const target = { east: 625.18, north: 492.85, tolerance: .13 };
  await moveTo(session, target);
  const atExit = await frame(page, { mask: shared, home: id, action: reentryLabel });
  if (cdp) await page.locator('#world-action').tap({ timeout });
  else await page.keyboard.press('e');
  const returned = await frame(page, { after: atExit.frames, mask: outdoor, home: null, canMove: true });
  near(distance(returned, stand), 0, exact, 'Shared action original-door horizontal return');
  near(returned.ground, stand.ground, exact, 'Shared action original-door support');
  return { spawn, atExit, returned };
}

async function checkMenu(browser, url, id, isTouch, output, result, allowVisit = true) {
  const session = await start(browser, url, isTouch);
  const { page } = session;
  try {
    const registry = await observe(page, 'registry');
    const door = registry.doors.find(door => door.id === id);
    assert.ok(door, `Market door ${id} fell out of the registry`);
    result.stand = await observe(page, 'stage', id);
    const initial = await openMenu(session, id, allowVisit);
    result.menu = await capture(page, output, `${id.replaceAll(':', '-')}-${isTouch ? 'touch' : 'keyboard'}-menu.png`);
    if (isTouch) await choose(session, 'cancel');
    else await page.keyboard.press('Escape');
    result.cancel = await afterCancel(session, initial);
    if (allowVisit) {
      const visitBefore = await openMenu(session, id);
      await choose(session, 'visit');
      result.visit = await frame(page, { after: visitBefore.frames, mask: outdoor, home: null, canMove: true, dialogOpen: false });
      assertVisitStayed(visitBefore, result.visit);
    } else {
      result.visitDisabled = true;
    }
    await openMenu(session, id, allowVisit);
    await choose(session, 'shared');
    result.shared = await legacyReturn(session, id, result.stand);
    near(relativeAngle(result.shared.returned.yaw, door.exitYaw), 0, exact, 'Selected shared-room exit yaw');
    result.input = await observe(page, 'events');
    assert.ok(result.input.every(event => event.trusted), 'Menu verification received an untrusted event');
    if (isTouch) {
      assert.ok(result.input.some(event => event.id === 'world-action' && event.pointer === 'touch'));
      for (const kind of allowVisit ? ['cancel', 'visit', 'shared'] : ['cancel', 'shared']) {
        assert.ok(result.input.some(event => event.action === kind && event.pointer === 'touch'));
      }
      assert.ok(result.input.some(event => event.id === 'touch-walk' && event.type === 'touchmove'));
    } else {
      for (const code of ['KeyE', 'Escape', 'Enter']) assert.ok(result.input.some(event => event.code === code));
    }
    assert.deepEqual(session.errors, []);
  } finally {
    result.lastObserved = await sample(page).catch(() => null);
    await session.context.close();
  }
}

async function checkLegacy(browser, url, door, result) {
  const session = await start(browser, url, false);
  const { page } = session;
  try {
    await observe(page, 'registry');
    const stand = await observe(page, 'stage', door.id);
    const before = await frame(page, { mask: outdoor, home: null, action: legacyLabel });
    await page.keyboard.press('e');
    result.legacy = await legacyReturn(session, door.id, stand);
    assert.equal(result.legacy.spawn.dialogOpen, false);
    assert.equal(result.legacy.spawn.menuId, null);
    near(relativeAngle(result.legacy.returned.yaw, door.exitYaw), 0, exact, 'Legacy exit yaw');
    assert.ok(result.legacy.spawn.frames > before.frames);
    assert.deepEqual(session.errors, []);
  } finally {
    result.lastObserved = await sample(page).catch(() => null);
    await session.context.close();
  }
}

function requirePoint(point, label) {
  assert.ok(point && Number.isFinite(point.east) && Number.isFinite(point.north), `${label} needs finite east/north`);
  return point;
}

function validatePlan(plan, baseline) {
  assert.ok(['closed-gate', 'menu-smoke', 'staged-walk-smoke', 'continuous-walk'].includes(plan.mode));
  const eligible = new Set(baseline.marketIds);
  assert.equal(eligible.size, 17);
  assert.ok(Array.isArray(plan.enableIds) && new Set(plan.enableIds).size === plan.enableIds.length);
  assert.ok(plan.enableIds.every(id => eligible.has(id)), 'Only the 17 authorized old-town IDs are eligible for the loopback build');
  const doors = new Map(baseline.doors.map(door => [door.id, door]));
  assert.ok(doors.has(plan.legacyDoor) && !eligible.has(plan.legacyDoor), 'Supply an original legacy door');
  const tours = plan.tours ?? [];
  const tourIds = new Set(tours.map(tour => tour.id));
  const menuDoors = plan.menuDoors ?? plan.enableIds.slice(0, 1);
  assert.ok(menuDoors.every(id => plan.enableIds.includes(id)));
  assert.ok([...tourIds].every(id => plan.enableIds.includes(id)), 'A route contains a non-enabled door');
  assert.equal(tourIds.size, tours.length, 'Duplicate route ID');
  if (plan.mode === 'closed-gate') assert.equal(plan.enableIds.length, 0);
  else assert.ok(menuDoors.length > 0);
  if (plan.mode === 'continuous-walk') {
    assert.ok(tours.length >= 9, 'A continuous run requires at least nine distinct surveyed homes');
    requirePoint(plan.start, 'Continuous street origin');
    assert.ok(tourIds.has(plan.touchTour), 'Provide a surveyed full touch route');
  }
  if (plan.mode === 'staged-walk-smoke') assert.ok(tours.length > 0);
  for (const tour of tours) {
    assert.ok(Array.isArray(tour.street) && tour.street.length > 0, `${tour.id} needs its surveyed street approach`);
    assert.ok(Array.isArray(tour.ingress) && tour.ingress.length > 0, `${tour.id} needs ingress points`);
    assert.ok(Array.isArray(tour.egress) && tour.egress.length > 0, `${tour.id} needs separate egress points`);
    assert.ok(Array.isArray(tour.returnStreet) && tour.returnStreet.length > 0, `${tour.id} needs a street return point`);
    for (const point of [...tour.street, ...tour.ingress, ...tour.egress, ...tour.returnStreet, tour.object, tour.threshold]) {
      requirePoint(point, `${tour.id} waypoint`);
    }
    if (plan.mode === 'continuous-walk') {
      assert.ok(tour.wallProbe?.approach?.length && tour.wallProbe?.recover?.length, `${tour.id} needs a wall-negative probe and recovery`);
      requirePoint(tour.wallProbe.target, `${tour.id} wall target`);
      tour.wallProbe.approach.forEach(point => requirePoint(point, `${tour.id} wall approach`));
      tour.wallProbe.recover.forEach(point => requirePoint(point, `${tour.id} wall recovery`));
    }
  }
  return { doors, tours, menuDoors };
}

async function walkGroup(session, points, record) {
  const summary = [];
  for (const target of points) {
    // Keep all rejected and accepted native calls in the per-leg evidence on failure too.
    const result = await moveTo(session, target, { diagnostics: record });
    summary.push({ target, after: result.after, length: result.length, movementCalls: result.moves.length });
  }
  return summary;
}

function checkCrossing(entries, threshold, door, ingress) {
  const projection = point => (point.east - threshold.east) * Math.sin(door.exitYaw) +
    (point.north - threshold.north) * Math.cos(door.exitYaw);
  const moves = entries.flatMap(entry => entry.moves).filter(move => move.accepted);
  assert.ok(moves.length > 0);
  const allPoses = [moves[0].before, ...moves.map(move => move.after)];
  assert.ok(ingress ? projection(allPoses[0]) > 0 && projection(allPoses.at(-1)) < 0
    : projection(allPoses[0]) < 0 && projection(allPoses.at(-1)) > 0, 'Route missed the surveyed door plane');
  const crossing = moves.find(move => ingress ? projection(move.before) >= 0 && projection(move.after) < 0
    : projection(move.before) <= 0 && projection(move.after) > 0);
  assert.ok(crossing && distance(crossing.after, threshold) <= (threshold.tolerance ?? .4), 'Movement crossed outside the surveyed opening');
  return crossing;
}

async function tourHome(session, plan, door, output, result) {
  const { page } = session;
  result.legs = {};
  result.frameCounts = {};
  result.door = door;
  const tourStartsAt = await sample(page);
  result.wall = null;
  if (plan.wallProbe) {
    result.legs.wallApproach = [];
    await walkGroup(session, plan.wallProbe.approach, result.legs.wallApproach);
    result.legs.wallNegative = [];
    const block = await moveTo(session, plan.wallProbe.target, { block: true, diagnostics: result.legs.wallNegative });
    result.wall = { before: block.before, after: block.after, blocked: block.moves.filter(move => !move.accepted).length };
    result.legs.wallRecovery = [];
    await walkGroup(session, plan.wallProbe.recover, result.legs.wallRecovery);
  }
  result.legs.street = [];
  await walkGroup(session, plan.street, result.legs.street);
  const visitBefore = await openMenu(session, door.id);
  assert.ok(distance(visitBefore, doorPose(door)) <= 1.6, 'Interaction started outside the original 1.6 m radius');
  assert.ok(Math.abs(visitBefore.ground - door.ground) <= .55, 'Interaction started beyond the original door height tolerance');
  await choose(session, 'visit');
  const visitAfter = await frame(page, { after: visitBefore.frames, mask: outdoor, home: null, canMove: true, dialogOpen: false });
  assertVisitStayed(visitBefore, visitAfter);
  result.legs.ingress = [];
  await walkGroup(session, [...plan.ingress, plan.object], result.legs.ingress);
  result.ingressThreshold = checkCrossing(result.legs.ingress, plan.threshold, door, true);
  const inside = await frame(page, { mask: outdoor, home: null });
  assert.ok(distance(inside, plan.object) <= (plan.object.tolerance ?? .22) + .15, 'Did not pass the surveyed interactive piece');
  if (plan.object.action) result.objectAction = await frame(page, { mask: outdoor, home: null, action: plan.object.action });
  result.insideScreenshot = await capture(page, output, `${door.id.replaceAll(':', '-')}-${session.cdp ? 'touch' : 'desktop'}-inside.png`);
  result.legs.egress = [];
  await walkGroup(session, plan.egress, result.legs.egress);
  result.egressThreshold = checkCrossing(result.legs.egress, plan.threshold, door, false);
  result.originalStand = await frame(page, { mask: outdoor, home: null, near: doorPose(door), tolerance: .32 });
  near(result.originalStand.ground, door.ground, .43, 'Physical return at the historic door stand');
  result.legs.returnStreet = [];
  await walkGroup(session, plan.returnStreet, result.legs.returnStreet);
  result.returned = await frame(page, { mask: outdoor, home: null, canMove: true });
  assert.deepEqual(result.returned.visits, visitBefore.visits);
  result.frameCounts = { start: tourStartsAt.frames, inside: inside.frames, returned: result.returned.frames };
  result.inside = inside;
  result.started = tourStartsAt;
  result.traveled = Object.fromEntries(Object.entries(result.legs).map(([role, entries]) => [role, entries
    .flatMap(entry => entry.moves).filter(move => move.accepted).reduce((sum, move) => sum + distance(move.before, move.after), 0)]));
  const inputs = await observe(page, 'events');
  assert.ok(inputs.every(event => event.trusted));
  assert.ok(session.cdp ? inputs.some(event => event.type === 'touchmove' && event.id === 'touch-walk')
    : inputs.some(event => event.code === 'KeyW'));
  assert.deepEqual(session.errors, []);
}

async function runTours(browser, url, plan, tours, doors, output, evidence) {
  const append = (tour, session) => {
    const entry = { id: tour.id, session: session.id, touch: Boolean(session.cdp) };
    evidence.tours.push(entry);
    return entry;
  };
  if (plan.mode === 'continuous-walk') {
    const session = await start(browser, url, false);
    try {
      await observe(session.page, 'registry');
      await observe(session.page, 'stage', plan.start);
      for (const tour of tours) await tourHome(session, tour, doors.get(tour.id), output, append(tour, session));
    } finally { await session.context.close(); }
  } else {
    for (const tour of tours) {
      const session = await start(browser, url, false);
      try {
        await observe(session.page, 'registry');
        await observe(session.page, 'stage', tour.start ?? tour.street[0]);
        await tourHome(session, tour, doors.get(tour.id), output, append(tour, session));
      } finally { await session.context.close(); }
    }
  }
  if (plan.touchTour) {
    const tour = tours.find(tour => tour.id === plan.touchTour);
    assert.ok(tour);
    const session = await start(browser, url, true);
    try {
      await observe(session.page, 'registry');
      await observe(session.page, 'stage', tour.start ?? tour.street[0]);
      await tourHome(session, tour, doors.get(tour.id), output, append(tour, session));
    } finally { await session.context.close(); }
  }
}

const [checkoutArg, baselineArg, planArg, outArg, option] = process.argv.slice(2);
assert.ok(checkoutArg && baselineArg && planArg && outArg && (!option || option === '--build-only'),
  'Usage: node verify-jx1-production.mjs CHECKOUT BASELINE_JSON PLAN_JSON OUTPUT_DIR [--build-only]');
const checkout = path.resolve(checkoutArg);
const output = path.resolve(outArg);
const [baseline, plan] = await Promise.all([baselineArg, planArg].map(async file => JSON.parse(await readFile(file, 'utf8'))));
const { doors, tours, menuDoors } = validatePlan(plan, baseline);
const temporary = await mkdtemp(path.join(tmpdir(), 'jx1-production-proof-'));
const dist = path.resolve(temporary, 'dist');
const evidence = {
  baseline: baseline.commit, runtime: process.env.JX1_RUNTIME_COMMIT ?? null, mode: plan.mode, status: 'starting',
  probeActivation: plan.enableIds, desktop, mobile, menus: [], tours: [], connectionLogs: [],
};
await mkdir(output, { recursive: true });
let server;
let browser;
try {
  evidence.step = 'build';
  await build(checkout, dist, code => instrument(code, plan.enableIds));
  if (option) {
    evidence.status = 'build-only';
    console.log('JX-1 loopback probe built. Viewer source files unchanged.');
  } else {
    evidence.step = 'serve-loopback';
    const resolvePackage = createRequire(path.join(checkout, 'package.json'));
    const { chromium } = resolvePackage('@playwright/test');
    const started = await serve(checkout, dist, resolvePackage, evidence.connectionLogs);
    server = started.server;
    evidence.step = 'launch-browser';
    browser = await chromium.launch({ executablePath: process.env.JX1_CHROMIUM_PATH, args: swiftShader });
    evidence.browser = browser.version();
    evidence.step = 'compare-complete-registry';
    const session = await start(browser, started.url, false);
    try {
      evidence.registry = await observe(session.page, 'registry');
      evidence.comparison = compareRegistry(baseline, evidence.registry, plan.enableIds);
      assert.deepEqual(session.errors, []);
    } finally { await session.context.close(); }
    evidence.step = 'check-original-legacy-action';
    evidence.plainDoor = {};
    await checkLegacy(browser, started.url, doors.get(plan.legacyDoor), evidence.plainDoor);
    const closedMarketId = baseline.marketIds.find(id => !plan.enableIds.includes(id));
    if (closedMarketId) {
      evidence.step = 'check-unverified-market-door-chooser';
      evidence.closedMarketDoor = { id: closedMarketId, modality: 'keyboard' };
      await checkMenu(browser, started.url, closedMarketId, false, output, evidence.closedMarketDoor, false);
    }
    for (const id of menuDoors) {
      evidence.step = `keyboard-menu:${id}`;
      const result = { id, modality: 'keyboard' };
      evidence.menus.push(result);
      await checkMenu(browser, started.url, id, false, output, result);
    }
    if (menuDoors.length) {
      const id = plan.touchMenu ?? menuDoors[0];
      assert.ok(plan.enableIds.includes(id));
      evidence.step = `touch-menu:${id}`;
      const result = { id, modality: 'touch' };
      evidence.menus.push(result);
      await checkMenu(browser, started.url, id, true, output, result);
    }
    if (tours.length) {
      evidence.step = 'physical-street-to-home-tours';
      await runTours(browser, started.url, plan, tours, doors, output, evidence);
    }
    evidence.status = `${plan.mode}-passed`;
    evidence.step = 'passed';
  }
} catch (error) {
  evidence.status = 'failed';
  evidence.failure = error.message;
  console.error(error.stack);
  process.exitCode = 1;
} finally {
  try {
    if (browser) await browser.close();
    if (server) await server.close();
  } finally {
    await writeFile(path.join(output, 'jx1-production-proof.json'), JSON.stringify(evidence, null, 2) + '\n');
    await rm(temporary, { recursive: true, force: true });
  }
}
