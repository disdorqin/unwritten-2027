import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const checkout = fileURLToPath(new URL('../', import.meta.url));
const root = path.join(checkout, 'tools', 'voxel-tavern');
const output = process.argv[2] && path.resolve(process.argv[2]);
assert.ok(output, 'Usage: node tools/verify-starport-assembly-flight-browser.mjs OUTPUT');
await mkdir(output, { recursive: true });
const requireRoot = createRequire(path.join(checkout, 'package.json'));
const requireVite = createRequire(path.join(root, 'package.json'));
const { chromium } = requireRoot('playwright');
const vite = path.resolve(path.dirname(requireVite.resolve('vite/package.json')), 'dist/node/index.js');
const { build, preview } = await import(pathToFileURL(vite));

const parts = ['snow-wing', 'booster', 'navigation-core'];
const report = {
  source: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: checkout, encoding: 'utf8' }).trim(),
  status: 'failed', browser: null, steps: [], errors: [], screenshots: [],
};
const viewport = { width: 960, height: 650 };
const eyeHeight = 1.58;
const entry = 'starport-flight-review.html';
const fixture = new URL('./fixtures/cloud-deck-circuit-keyboard.json', import.meta.url);
let server, browser, page, dist;

const state = () => page.evaluate(() => window.starportFlightProof());
const step = () => page.evaluate(() => window.starportFlightStep());
const wrap = value => Math.atan2(Math.sin(value), Math.cos(value));

async function snapshot(name, capture = false) {
  if (capture) {
    await page.evaluate(() => window.starportFlightPaint());
    const filename = name + '.jpg';
    await page.screenshot({ path: path.join(output, filename), quality: 84 });
    report.screenshots.push(filename);
  }
  const current = await state();
  if (capture) assert.ok(current.drawCalls > 0);
  report.steps.push({ name, ...current });
  return current;
}

async function hold(key, action) {
  await page.keyboard.down(key);
  try {
    return await action();
  } finally {
    await page.keyboard.up(key);
  }
}

async function align(field, target) {
  const heading = field === 'heading';
  const difference = current => heading ? wrap(target - current[field]) : target - current[field];
  const initial = difference(await state());
  const tolerance = heading ? .0226 : .0201;
  const keys = heading ? ['ArrowLeft', 'ArrowRight'] : ['ArrowDown', 'ArrowUp'];
  if (Math.abs(initial) <= tolerance) return;
  await hold(keys[initial > 0 ? 1 : 0], async () => {
    for (let i = 0; i < 150; i++) {
      const current = await step();
      if (Math.abs(difference(current)) <= tolerance) return;
    }
    assert.fail(`Native camera input cannot align ${field} to ${target}`);
  });
}

async function walkAxis(axis, target) {
  await align('heading', 0);
  const start = (await state()).feet[axis];
  if (Math.abs(target - start) <= .07) return;
  const increasing = target > start;
  const key = axis === 'east' ? (increasing ? 'd' : 'a') : (increasing ? 'w' : 's');
  await hold(key, async () => {
    for (let i = 0; i < 300; i++) {
      const value = (await step()).feet[axis];
      if (increasing ? value >= target - .07 : value <= target + .07) return;
    }
    assert.fail(`Native movement ${key} cannot reach ${axis} ${target}`);
  });
  assert.ok(Math.abs((await state()).feet[axis] - target) <= .15, `Walk missed ${axis} ${target}`);
}

async function aimAt(slot) {
  const target = (await state()).assembly.targets[slot];
  await walkAxis('east', target.east);
  const { feet } = await state();
  const east = target.east - feet.east;
  const north = target.north - feet.north;
  await align('heading', Math.atan2(east, north));
  await align('pitch', Math.atan2(target.height - feet.height - eyeHeight, Math.hypot(east, north)));
  const aimed = await state();
  assert.equal(aimed.assembly.aimed, slot, `Native look did not select ${slot}`);
  assert.ok(Math.hypot(east, north) <= 2.12, `Player is beyond the accepted reach of ${slot}`);
}

async function interact(slot, kind) {
  assert.equal((await state()).assembly.aimed, slot);
  await page.keyboard.press('e');
  const wait = await page.waitForFunction(expected => window.starportFlightProof().assembly.lastResult === expected, kind);
  await wait.dispose();
  return (await state()).assembly.profile;
}

async function flyCircuit(runway, initialFuel) {
  const { stepMs, runs } = JSON.parse(await readFile(fixture, 'utf8'));
  assert.equal(stepMs, 100);
  const active = new Set();
  const phases = [];
  const gates = [];
  let throttleKey = 0;
  let elapsedMs = 0;
  let previous = await state();
  assert.equal(previous.flight.phase, 'rolling');
  assert.deepEqual(previous.flight.point, runway.start);

  try {
    for (const [ticks, throttle, pitch, turn] of runs) {
      if (throttle !== throttleKey) {
        await page.keyboard.press(String(throttle));
        throttleKey = throttle;
      }
      const requested = new Set();
      if (pitch) requested.add(pitch < 0 ? 'w' : 's');
      if (turn) requested.add(turn < 0 ? 'a' : 'd');
      for (const key of active) {
        if (requested.has(key)) continue;
        await page.keyboard.up(key);
        active.delete(key);
      }
      for (const key of requested) {
        if (active.has(key)) continue;
        await page.keyboard.down(key);
        active.add(key);
      }
      const samples = await page.evaluate(count =>
        Array.from({ length: count }, () => window.starportFlightStep()), ticks);
      for (const current of samples) {
        elapsedMs += stepMs;
        const { flight, circuit } = current;
        assert.equal(flight.recovery, null);
        assert.equal(flight.damage, 0);
        if (circuit.nextGate !== previous.circuit.nextGate) {
          assert.equal(circuit.nextGate, previous.circuit.nextGate + 1);
          gates.push({ gate: circuit.nextGate, elapsedMs, point: flight.point });
        }
        if (flight.phase !== previous.flight.phase) {
          phases.push({ phase: flight.phase, elapsedMs, point: flight.point, speed: flight.speed });
          if (flight.phase === 'airborne') {
            assert.equal(flight.rollMetres, 40);
            assert.ok(flight.point.height > runway.start.height);
            assert.ok(current.fuel.seconds < initialFuel);
            await snapshot('03-liftoff', true);
          }
          if (flight.phase === 'sliding') assert.equal(flight.touchdown, 'snow');
        }
        previous = current;
      }
    }
  } finally {
    for (const key of active) await page.keyboard.up(key);
  }
  assert.deepEqual(phases.map(({ phase }) => phase), ['airborne', 'sliding', 'landed']);
  assert.deepEqual(gates.map(({ gate }) => gate), [1, 2, 3, 4]);
  const final = await snapshot('landed-after-full-circuit');
  assert.equal(final.circuit.stage, 'complete');
  assert.equal(final.circuit.nextGate, 4);
  assert.equal(final.flight.speed, 0);
  assert.equal(final.flight.point.height, runway.start.height);
  assert.ok(Math.abs(final.flight.point.north - runway.start.north) <= runway.width / 2);
  assert.equal(final.assembly.profile.ignited, true);
  report.circuit = { phases, gates, durationMs: final.circuit.durationMs, fuelUsed: initialFuel - final.fuel.seconds };
}

try {
  report.step = 'build and start starport preview';
  dist = await mkdtemp(path.join(output, '.preview-'));
  await build({ root, configFile: false, logLevel: 'warn', build: {
    outDir: dist, emptyOutDir: false, rollupOptions: { input: path.join(root, entry) },
  } });
  server = await preview({ root, configFile: false, logLevel: 'warn', build: { outDir: dist },
    preview: { host: '127.0.0.1', port: 0 } });
  const args = process.platform === 'win32' ? ['--use-gl=angle', '--use-angle=d3d11'] :
    ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'];
  const executablePath = process.env.CHROMIUM_PATH ?? process.env.STARPORT_ASSEMBLY_CHROME ??
    (!existsSync(chromium.executablePath()) && existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  browser = await chromium.launch({ executablePath, args });
  report.browser = browser.version();
  page = await browser.newPage({ viewport });
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204, body: '' }));
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  page.on('requestfailed', request => report.errors.push(`${request.url()} ${request.failure()?.errorText}`));
  page.on('response', response => { if (response.status() >= 400) report.errors.push(`${response.status()} ${response.url()}`); });
  await page.addInitScript(() => {
    window.starportHandoffNative = { interact: 0, move: 0, look: 0 };
    window.addEventListener('keydown', event => {
      if (!event.isTrusted || event.repeat) return;
      if (event.code === 'KeyE') window.starportHandoffNative.interact++;
      if (['KeyW', 'KeyA', 'KeyD', 'KeyS'].includes(event.code)) window.starportHandoffNative.move++;
      if (event.code.startsWith('Arrow')) window.starportHandoffNative.look++;
    });
  });
  const { port } = server.httpServer.address();
  assert.equal((await page.goto(`http://127.0.0.1:${port}/${entry}?proof=assembly-handoff`))?.status(), 200);
  const ready = await page.waitForFunction(() => window.starportFlightProof?.().assembly?.targets?.ignition);
  await ready.dispose();

  report.step = 'walk to the mounted three-slot rack';
  const initial = await snapshot('arrive-on-foot');
  assert.deepEqual(initial.assembly.profile.installed, []);
  assert.deepEqual([...initial.assembly.profile.carried].sort(), [...parts].sort());
  assert.equal(initial.assembly.profile.ignited, false);
  assert.equal(initial.loadout.aircraftAssembled, false);
  await walkAxis('north', 673.77);
  await aimAt('ignition');
  assert.deepEqual(await interact('ignition', 'incomplete'), initial.assembly.profile);
  for (const [index, part] of parts.entries()) {
    await aimAt(part);
    const placed = await interact(part, 'placed');
    assert.deepEqual(placed.installed, parts.slice(0, index + 1));
    assert.deepEqual(placed.carried, parts.slice(index + 1));
    assert.equal(placed.revision, initial.assembly.profile.revision + index + 1);
    assert.equal(placed.ignited, false);
    await snapshot('fit-' + part);
    if (index === 0) assert.deepEqual(await interact(part, 'already-installed'), placed);
  }

  report.step = 'verify both ignition inputs against the published beacon';
  await aimAt('ignition');
  const installed = (await state()).assembly.profile;
  assert.deepEqual(await interact('ignition', 'missing-key'), installed);
  await snapshot('missing-key-rejected');
  await page.evaluate(() => window.starportAssemblyKeyOne());
  await page.evaluate(() => window.starportNightClock(420_000));
  assert.deepEqual(await interact('ignition', 'window-closed'), installed);
  const blocked = await snapshot('01-three-installed-awaiting-beacon', true);
  assert.equal(blocked.loadout.aircraftAssembled, false);
  assert.equal(blocked.assembly.keyOne, true);
  const receipt = await page.evaluate(() => window.starportNightBeacon(420_000));
  assert.equal(receipt?.kind, 'town-night-beacon');
  assert.equal(receipt.state.layersOverlap, true);
  report.beacon = receipt;
  const ignited = await interact('ignition', 'ignited');
  assert.deepEqual(ignited.installed, parts);
  assert.deepEqual(ignited.carried, []);
  assert.equal(ignited.ignited, true);
  assert.equal(ignited.revision, installed.revision + 1);
  assert.equal((await snapshot('ignition-committed')).loadout.aircraftAssembled, true);

  report.step = 'walk to the real runway and fly the F-9 circuit with the assembled aircraft';
  await walkAxis('north', 671.2);
  await walkAxis('east', initial.runway.start.east);
  await walkAxis('north', initial.runway.start.north + .28);
  await page.keyboard.press('q');
  const prepared = await snapshot('02-runway-checklist', true);
  assert.deepEqual(prepared.checklist, { 合体: true, 燃料: true, 空域: true });
  assert.equal(prepared.flight, undefined);
  assert.ok(prepared.runwaySurvey.ok && prepared.runwaySurvey.checkedMetres >= 40);
  await page.keyboard.press('e');
  await flyCircuit(prepared.runway, prepared.fuel.seconds);
  report.native = await page.evaluate(() => window.starportHandoffNative);
  assert.ok(report.native.interact >= 9 && report.native.move > 0 && report.native.look > 0);
  assert.deepEqual(report.errors, []);
  report.status = 'passed';
} catch (error) {
  report.failure = error.stack ?? String(error);
  if (page) report.last = await state().catch(() => null);
  process.exitCode = 1;
} finally {
  for (const close of [() => browser?.close(), () => server?.close(),
    () => dist && rm(dist, { recursive: true, force: true })]) {
    try {
      await close();
    } catch (error) {
      report.errors.push(String(error));
      report.status = 'failed';
      process.exitCode = 1;
    }
  }
  await writeFile(path.join(output, 'starport-assembly-flight-result.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, step: report.step, checks: report.steps.length,
    screenshots: report.screenshots, circuit: report.circuit?.durationMs, errors: report.errors, failure: report.failure }));
}
