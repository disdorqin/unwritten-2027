import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const [url, output] = process.argv.slice(2);
assert.ok(output && url && new URL(url).hostname === '127.0.0.1');
await mkdir(output, { recursive: true });
const proof = { errors: [], states: {} };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH,
  headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

function recordPageErrors(page, errors) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => errors.push(request.url()));
  page.on('response', response => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
}

function readFlightGauge(page) {
  return page.evaluate(() => {
    const controls = document.querySelector('#aircraft-controls');
    return {
      hidden: controls.hidden,
      instances: controls.querySelectorAll('.flight-fuel-display').length,
      ratio: controls.querySelector('meter')?.value,
      time: controls.querySelector('output')?.value,
      rate: controls.querySelector('strong')?.textContent,
    };
  });
}

const stepFixedFlight = page => page.evaluate(() => window.starportFlightStep());
async function moveFixed(page, key, axis, reached) {
  await page.keyboard.down(key);
  try {
    for (let tick = 0; tick < 200; tick++) {
      if (reached((await stepFixedFlight(page)).feet[axis])) return;
    }
    assert.fail(`Ground key ${key} did not reach its ${axis} waypoint`);
  } finally { await page.keyboard.up(key); }
}

async function verifyCircuit() {
  const fixture = new URL('./fixtures/cloud-deck-circuit-keyboard.json', import.meta.url);
  const { stepMs, runs } = JSON.parse(await readFile(fixture, 'utf8'));
  assert.equal(stepMs, 100);
  const circuitProof = { chromium: browser.version(), stepMs, runs: runs.length, errors: [], events: [], samples: [], fuelGauge: {} };
  const page = await browser.newPage({ viewport: { width: 960, height: 650 } });
  recordPageErrors(page, circuitProof.errors);
  const circuitUrl = new URL(url);
  circuitUrl.searchParams.set('proof', 'clock');
  const state = () => page.evaluate(() => window.starportFlightProof());
  async function picture(name) {
    await page.evaluate(() => window.starportFlightPaint());
    assert.ok((await state()).drawCalls > 0);
    await page.screenshot({ path: join(output, `circuit-${name}.jpg`), type: 'jpeg', quality: 84 });
  }
  try {
    assert.equal((await page.goto(circuitUrl.href))?.status(), 200);
    await page.waitForFunction(() => window.starportFlightProof?.().drawCalls > 0);
    await moveFixed(page, 'w', 'north', north => north >= 673.77);
    await page.keyboard.press('e');
    assert.equal((await state()).loadout.aircraftAssembled, true);
    await moveFixed(page, 's', 'north', north => north <= 671.21);
    await moveFixed(page, 'd', 'east', east => east >= 330.79);
    await moveFixed(page, 's', 'north', north => north <= 662.41);
    await page.keyboard.press('q');
    const prepared = await state();
    assert.deepEqual(prepared.checklist, { 合体: true, 燃料: true, 空域: true });
    assert.deepEqual(prepared.fuel, { seconds: 600, ore: 2, revision: 0 });
    assert.equal((await readFlightGauge(page)).hidden, true);
    const { runway, gates } = prepared;
    await picture('01-checklist');
    await page.keyboard.press('e');
    let previous = await state();
    assert.equal(previous.flight.phase, 'rolling');
    assert.deepEqual(previous.flight.point, runway.start);
    await picture('02-roll');

    let elapsedMs = 0;
    let throttleKey = 0;
    const held = new Set();
    for (const [ticks, nextThrottle, pitch, turn] of runs) {
      if (nextThrottle !== throttleKey) {
        await page.keyboard.press(String(nextThrottle));
        throttleKey = nextThrottle;
      }
      const keys = new Set();
      if (pitch) keys.add(pitch < 0 ? 'w' : 's');
      if (turn) keys.add(turn < 0 ? 'a' : 'd');
      for (const key of held) {
        if (keys.has(key)) continue;
        await page.keyboard.up(key);
        held.delete(key);
      }
      for (const key of keys) {
        if (held.has(key)) continue;
        await page.keyboard.down(key);
        held.add(key);
      }
      for (let tick = 0; tick < ticks; tick++) {
        const current = await stepFixedFlight(page);
        const { point, phase, speed, heading, damage, recovery, touchdown } = current.flight;
        const { nextGate, stage } = current.circuit;
        elapsedMs += stepMs;
        circuitProof.samples.push({ elapsedMs, throttleKey, pitch, turn, point, phase, speed, heading,
          damage, recovery, touchdown, stage, nextGate });
        const from = previous.flight.point;
        assert.equal(damage, 0);
        assert.equal(recovery, null);
        assert.notEqual(stage, 'aborted');
        assert.ok(Math.hypot(point.east - from.east, point.north - from.north) <= 4.000001);
        const throttle = current.flight.throttle;
        if (current.flight.usesBothHands && !Object.hasOwn(circuitProof.fuelGauge, throttle)) {
          await page.evaluate(() => window.starportFlightPaint());
          const gauge = await readFlightGauge(page);
          const seconds = Math.ceil(current.fuel.seconds);
          const time = [Math.floor(seconds / 60), seconds % 60].map(part => String(part).padStart(2, '0')).join(':');
          assert.deepEqual(gauge, { hidden: false, instances: 1, ratio: current.fuel.seconds * 1_000 / 600_000,
            time: `${time} 满推`, rate: { full: '1×', cruise: '0.5×', off: '0×' }[throttle] });
          circuitProof.fuelGauge[throttle] = gauge;
        }
        if (nextGate !== previous.circuit.nextGate) {
          assert.equal(nextGate, previous.circuit.nextGate + 1);
          const gate = gates[nextGate - 1];
          const side = at => (at.east - gate.at.east) * gate.forwardEast + (at.north - gate.at.north) * gate.forwardNorth;
          const before = side(from), after = side(point);
          assert.ok(before < 0 && after >= 0);
          const fraction = -before / (after - before);
          const at = { east: from.east + fraction * (point.east - from.east),
            north: from.north + fraction * (point.north - from.north),
            height: from.height + fraction * (point.height - from.height) };
          const distanceM = Math.hypot(at.east - gate.at.east, at.north - gate.at.north, at.height - gate.at.height);
          assert.ok(distanceM <= 15);
          circuitProof.events.push({ gate: nextGate, elapsedMs: elapsedMs - stepMs + fraction * stepMs, at, distanceM });
          await picture(`0${nextGate + 3}-gate-${nextGate}`);
        }
        if (phase !== previous.flight.phase) {
          circuitProof.events.push({ phase, elapsedMs, at: point, speed, touchdown });
          if (phase === 'airborne') {
            assert.equal(current.flight.rollMetres, 40);
            assert.equal(elapsedMs, 10_000);
            await picture('03-liftoff');
          }
          if (phase === 'sliding') {
            assert.equal(touchdown, 'snow');
            assert.equal(elapsedMs, 56_900);
            await picture('08-snow-touchdown');
          }
          if (phase === 'landed') await picture('09-runway-stop');
        }
        previous = current;
      }
    }
    for (const key of held) await page.keyboard.up(key);
    const final = await state();
    circuitProof.final = final;
    assert.deepEqual(final.phases, ['rolling', 'airborne', 'sliding', 'landed']);
    assert.deepEqual(final.circuit, { stage: 'complete', nextGate: 4, durationMs: 46_900 });
    assert.equal(Math.round(final.flight.elapsed * 1_000), 57_517);
    assert.equal(final.flight.speed, 0);
    assert.equal(final.flight.usesBothHands, false);
    assert.deepEqual(Object.keys(circuitProof.fuelGauge).sort(), ['cruise', 'full', 'off']);
    assert.equal((await readFlightGauge(page)).hidden, true);
    const snowContact = circuitProof.events.find(event => event.phase === 'sliding');
    for (const { east, north, height } of [snowContact.at, final.flight.point]) {
      assert.ok(east >= Math.min(runway.start.east, runway.end.east) && east <= Math.max(runway.start.east, runway.end.east));
      assert.ok(Math.abs(north - runway.start.north) <= runway.width / 2);
      assert.equal(height, runway.start.height);
    }
    assert.deepEqual(circuitProof.errors, []);
  } catch (error) {
    circuitProof.failure = error.stack;
    throw error;
  } finally {
    await writeFile(join(output, 'starport-circuit.json'), JSON.stringify(circuitProof, null, 2) + '\n');
    await page.close();
  }
}

async function verifyNightWindow() {
  const nightProof = { chromium: browser.version(), errors: [], states: {} };
  const page = await browser.newPage({ viewport: { width: 960, height: 650 } });
  recordPageErrors(page, nightProof.errors);
  const nightUrl = new URL(url);
  nightUrl.searchParams.set('proof', 'night-window');
  const read = () => page.evaluate(() => window.starportNightProof());
  const clock = now => page.evaluate(now => window.starportNightClock(now), now);
  const receive = at => page.evaluate(at => window.starportNightBeacon(at), at);

  async function check(name, phase, open, lit) {
    await moveFixed(page, 'w', 'north', north => north >= 673.51);
    const before = await read();
    const { door, feet } = before;
    const doorRangeM = Math.hypot(feet.east - door.east, feet.north - door.north, feet.height - door.height);
    assert.ok(doorRangeM <= 1.6);
    await page.keyboard.press('e');
    const result = await read();
    assert.equal(result.trustedGateChecks, before.trustedGateChecks + 1);
    assert.equal(result.state.phase, phase);
    assert.equal(result.state.canEnterRestricted, open);
    assert.equal(result.state.layersOverlap, lit);
    assert.equal(result.ring.lit, lit);
    assert.equal(result.state.chapterGatesLocked, true);
    assert.equal(result.lockResult, 'locked');
    assert.deepEqual(result.feet, feet);
    assert.equal(await page.locator('#status').textContent(), '已锁定。');

    // Back up with the same walk controls so every screenshot frames the whole ring.
    await moveFixed(page, 's', 'north', north => north <= 673.16);
    await page.evaluate(() => window.starportFlightPaint());
    const { feet: cameraFeet, ring } = await read();
    assert.equal(ring.lit, lit);
    const image = await page.screenshot({ path: join(output, `night-window-${name}.jpg`), type: 'jpeg', quality: 84 });
    const imageSha256 = createHash('sha256').update(image).digest('hex');
    nightProof.states[name] = { ...result, doorRangeM, cameraFeet, imageSha256 };
    return imageSha256;
  }

  try {
    assert.equal((await page.goto(nightUrl.href))?.status(), 200);
    await page.waitForFunction(() => window.starportFlightProof?.().drawCalls > 0);
    const { schedule: { duskAt, beaconAt, morningBellAt } } = await read();
    await moveFixed(page, 'd', 'east', east => east >= 319.9);
    await clock(duskAt - 1);
    const dark = await check('01-day', 'day', false, false);
    await clock(duskAt);
    assert.equal(await receive(beaconAt), undefined);
    await check('02-dusk-awaiting', 'awaiting-beacon', false, false);
    await clock(beaconAt);
    await check('03-beacon-time-no-receipt', 'awaiting-beacon', false, false);
    nightProof.receipt = await receive(beaconAt);
    assert.equal(nightProof.receipt?.kind, 'town-night-beacon');
    assert.equal(nightProof.receipt?.at, beaconAt);
    assert.equal(await receive(beaconAt), undefined);
    const bright = await check('04-received-0ms', 'night-window', true, true);
    await clock(beaconAt + 59_999);
    const lastLit = await check('05-received-59999ms', 'night-window', true, true);
    await clock(beaconAt + 60_000);
    const firstDark = await check('06-received-60000ms', 'night-window', true, false);
    await clock(morningBellAt);
    const dawn = await check('07-morning-bell', 'day', false, false);
    assert.notEqual(bright, dark);
    assert.notEqual(lastLit, firstDark);
    assert.notEqual(lastLit, dawn);
    assert.deepEqual(nightProof.errors, []);
  } catch (error) {
    nightProof.failure = error.stack;
    throw error;
  } finally {
    await writeFile(join(output, 'starport-night-window.json'), JSON.stringify(nightProof, null, 2) + '\n');
    await page.close();
  }
}

try {
  const page = await browser.newPage({ viewport: { width: 960, height: 650 } });
  recordPageErrors(page, proof.errors);
  assert.equal((await page.goto(url))?.status(), 200);
  await page.waitForFunction(() => window.starportFlightProof?.().drawCalls > 0);
  const state = () => page.evaluate(() => window.starportFlightProof());
  async function move(key, field, target, sign = 1) {
    await page.keyboard.down(key);
    try {
      await page.waitForFunction(({ field, target, sign }) => sign * window.starportFlightProof().feet[field] >= sign * target,
        { field, target, sign }, { timeout: 12_000 });
    } finally { await page.keyboard.up(key); }
  }
  async function record(name) {
    proof.states[name] = await state();
    await page.screenshot({ path: join(output, `${name}.png`) });
  }
  const initial = await state();
  assert.deepEqual(initial.emergencySites, ['cloud-deck', 'square', 'mirror-lake']);
  assert.equal((await readFlightGauge(page)).hidden, true);
  await move('w', 'north', 673.74);
  await page.keyboard.press('e');
  assert.equal((await state()).loadout.aircraftAssembled, true);
  await record('01-assembled');
  await move('s', 'north', 671.06, -1);
  await move('d', 'east', 319.90);
  await move('w', 'north', 673.75);
  await page.keyboard.press('e');
  assert.equal((await state()).lockResult, 'locked');
  await move('s', 'north', 671.06, -1);
  await move('d', 'east', 327.83);
  await move('w', 'north', 674.34);
  await page.keyboard.press('f');
  assert.deepEqual((await state()).fuel, { seconds: 1200, ore: 1, revision: 1 });
  assert.equal((await readFlightGauge(page)).hidden, true);
  await record('02-refuel');
  await move('s', 'north', 662.17, -1);
  await move('d', 'east', 330.85);
  await page.keyboard.press('q');
  assert.deepEqual((await state()).checklist, { 合体: true, 燃料: true, 空域: true });
  await record('03-ready');
  await page.keyboard.press('e');
  await page.waitForFunction(() => window.starportFlightProof().flight?.phase === 'airborne', null, { timeout: 35_000 });
  const airborne = await state();
  assert.equal(airborne.flight.rollMetres, 40);
  assert.equal(airborne.flight.damage, 0);
  assert.equal(airborne.circuit.stage, 'airborne');
  await page.keyboard.press('f');
  assert.equal((await state()).fuel.revision, 1);
  proof.refueledGauge = await readFlightGauge(page);
  assert.equal(proof.refueledGauge.instances, 1);
  assert.equal(proof.refueledGauge.hidden, false);
  assert.ok(proof.refueledGauge.ratio > .95 && proof.refueledGauge.ratio < 1);
  assert.equal(proof.refueledGauge.rate, '1×');
  await record('04-airborne');
  assert.deepEqual(proof.errors, []);
  await page.close();
  await verifyCircuit();
  await verifyNightWindow();
} finally {
  await writeFile(join(output, 'starport-flight.json'), JSON.stringify(proof, null, 2) + '\n');
  await browser.close();
}
