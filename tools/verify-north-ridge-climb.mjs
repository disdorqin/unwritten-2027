import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const url = new URL(process.env.P14_URL ?? 'http://127.0.0.1:4173/tools/voxel-tavern/town-north-ridge-climb-review.html');
assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) && url.protocol === 'http:');
const out = process.env.P14_OUTPUT ?? 'test-results/p14-climb';
await mkdir(out, { recursive: true });
const evidence = { scope: 'North Ridge 350 local obstacle geometry and keyboard operation', capture: [], trace: [], inputs: [], pageErrors: [], requestErrors: [] };
let browser;
let page;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  evidence.browser = browser.version();
  page = await browser.newPage({ viewport: { width: 768, height: 560 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => evidence.pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') evidence.pageErrors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) evidence.requestErrors.push(`${response.status()} ${response.url()}`); });
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204, body: '' }));
  const response = await page.goto(url.href, { waitUntil: 'load', timeout: 60_000 });
  assert.equal(response?.status(), 200);
  const viewport = page.locator('#climb-scene');
  const canvas = viewport.locator('canvas');
  await canvas.waitFor({ state: 'visible' });
  await page.waitForFunction(() => Number(document.querySelector('#climb-scene canvas')?.dataset.draws) > 0);
  await canvas.focus();
  await page.evaluate(() => {
    const canvas = document.querySelector('#climb-scene canvas');
    window.p14Trace = [];
    window.p14Inputs = [];
    const measuredKeys = new Set(['KeyW', 'KeyS', 'KeyD', 'KeyE', 'KeyG', 'KeyR', 'KeyQ']);
    for (const type of ['keydown', 'keyup']) {
      window.addEventListener(type, event => {
        if (measuredKeys.has(event.code)) {
          window.p14Inputs.push({ type, code: event.code, trusted: event.isTrusted, tick: Number(canvas.dataset.ticks) });
        }
      }, { capture: true });
    }
    let last;
    const scan = () => {
      const d = canvas.dataset;
      if (d.ticks !== last) {
        const row = [Number(d.ticks), d.mode, Number(d.height), Number(d.east), Number(d.north), Number(d.shelf),
          d.lead, d.warning === 'true', Number(d.slips), Number(d.recoveries), Number(d.damage)];
        window.p14Trace.push(row);
        last = d.ticks;
      }
      requestAnimationFrame(scan);
    };
    requestAnimationFrame(scan);
  });

  async function read() { return canvas.evaluate(element => ({ ...element.dataset })); }
  async function mode(expected) {
    await page.waitForFunction(expected => document.querySelector('#climb-scene canvas')?.dataset.mode === expected,
      expected, { timeout: 25_000 });
  }
  async function stateField(key, value) {
    await page.waitForFunction(({ key, value }) => document.querySelector('#climb-scene canvas')?.dataset[key] === value,
      { key, value }, { timeout: 25_000 });
  }
  async function shot(name) {
    const state = await read();
    assert.ok(Number(state.draws) > 0 && Number(state.triangles) > 0);
    const file = `${name}.png`;
    await viewport.screenshot({ path: join(out, file) });
    evidence.capture.push({ file, ...state });
  }
  async function climbUntil(key, target) {
    await page.keyboard.down(key);
    try {
      await page.waitForFunction(({ key, target }) => {
        const d = document.querySelector('#climb-scene canvas').dataset;
        if (target.flag) return d[target.flag] === target.value;
        return key === 'w' ? Number(d.height) > target.height : Number(d.height) < target.height;
      }, { key, target }, { timeout: 120_000 });
    } finally { await page.keyboard.up(key); }
  }
  async function settleOverBothIceTongues(key, label, priorSlips) {
    const shelves = [];
    for (let i = 0; i < 2; i++) {
      await climbUntil(key, { flag: 'warning', value: 'true' });
      await stateField('moving', 'false');
      const paused = await read();
      await stateField('settled', 'true');
      const stable = await read();
      assert.equal(stable.mode, 'climbing');
      assert.equal(stable.height, paused.height);
      assert.equal(stable.slips, priorSlips);
      shelves.push(Number(stable.shelf));
      await shot(`${label}-${i + 1}`);
    }
    return shelves;
  }
  async function verifyStandingGates() {
    for (const [key, modeName] of [['g', 'flight'], ['r', 'sled']]) {
      await page.keyboard.press(key);
      await mode(modeName);
      await stateField(key === 'g' ? 'lastFlight' : 'lastSled', 'true');
      await page.keyboard.press('e');
      await stateField('lastGrip', 'false');
      await mode(modeName);
      await page.keyboard.press('q');
      await mode('standing');
    }
  }

  await mode('standing');
  await shot('01-start-shelf');
  await verifyStandingGates();
  await page.keyboard.press('e');
  await mode('climbing');
  await climbUntil('w', { height: 72 });
  const lateralBefore = await read();
  await page.keyboard.down('d');
  try {
    await page.waitForFunction(previous => previous - Number(document.querySelector('#climb-scene canvas')?.dataset.east) > .32,
      Number(lateralBefore.east), { timeout: 20_000 });
  } finally { await page.keyboard.up('d'); }
  await page.keyboard.press('e');
  await stateField('lastRelease', 'false');
  await page.keyboard.press('g');
  await stateField('lastFlight', 'false');
  await page.keyboard.press('r');
  await stateField('lastSled', 'false');
  await mode('climbing');
  await shot('02-locked-while-gripped');

  await climbUntil('w', { flag: 'slips', value: '1' });
  await mode('standing');
  const recovered = await read();
  assert.equal(recovered.shelf, '2');
  assert.equal(recovered.height, '98.0000');
  assert.equal(recovered.recoveries, '1');
  assert.equal(recovered.damage, '0');
  await shot('03-safe-prior-shelf');

  await page.keyboard.press('e');
  await mode('climbing');
  assert.deepEqual(await settleOverBothIceTongues('w', '04-ice-hold', '1'), [2, 6]);
  await climbUntil('w', { flag: 'mode', value: 'standing' });
  const finish = await read();
  assert.equal(finish.height, '233.0000');
  assert.equal(finish.shelf, '11');
  assert.equal(finish.damage, '0');
  assert.equal(finish.slips, '1');
  assert.ok(Number(finish.swaps) > 450);
  await shot('05-final-shelf');

  await verifyStandingGates();
  await page.keyboard.press('e');
  await mode('climbing');
  await climbUntil('s', { height: 229 });
  await page.keyboard.press('g');
  await stateField('lastFlight', 'false');
  await page.keyboard.press('r');
  await stateField('lastSled', 'false');
  await mode('climbing');
  await shot('06-descent-locked-while-gripped');
  // Descending shelf indices name the shelf above the current wall position.
  const descentIceShelves = await settleOverBothIceTongues('s', '07-descent-ice-hold', '1');
  assert.deepEqual(descentIceShelves, [7, 3]);
  await climbUntil('s', { flag: 'mode', value: 'standing' });
  const returned = await read();
  assert.equal(returned.height, '68.0000');
  assert.equal(returned.shelf, '0');
  assert.equal(returned.damage, '0');
  assert.equal(returned.slips, '1');
  assert.equal(returned.recoveries, '1');
  assert.ok(Number(returned.swaps) - Number(finish.swaps) > 450);
  await shot('08-returned-to-start-shelf');
  await verifyStandingGates();
  await mode('standing');

  Object.assign(evidence, await page.evaluate(() => ({ trace: window.p14Trace, inputs: window.p14Inputs })));
  const ascent = evidence.trace.filter(row => row[0] <= Number(finish.ticks));
  const bottomSample = evidence.trace.find(row => row[0] >= Number(returned.ticks) && row[1] === 'standing' && row[5] === 0);
  assert.ok(bottomSample, 'The browser trace includes standing on the bottom shelf');
  const descent = evidence.trace.filter(row => row[0] >= Number(finish.ticks) && row[0] <= bottomSample[0]);
  const shelves = trace => [...new Set(trace.map(row => row[5]))];
  assert.ok(ascent.some(row => row[1] === 'slipping'));
  assert.deepEqual(shelves(ascent), Array.from({ length: 12 }, (_, i) => i));
  assert.deepEqual(shelves(descent), Array.from({ length: 12 }, (_, i) => 11 - i));
  assert.ok(descent.every((row, i) => row[1] !== 'slipping' && (i === 0 || row[2] <= descent[i - 1][2])));
  assert.ok(evidence.trace.every(row => row[10] === 0));
  assert.ok(evidence.inputs.every(event => event.trusted));
  const downInputs = evidence.inputs.filter(event => event.code === 'KeyS');
  assert.deepEqual(downInputs.map(event => event.type), ['keydown', 'keyup', 'keydown', 'keyup', 'keydown', 'keyup', 'keydown', 'keyup']);
  assert.ok(downInputs.every(event => event.tick >= Number(finish.ticks)));
  evidence.descent = { shelves: shelves(descent), iceShelves: descentIceShelves, traceRows: descent.length,
    handSwaps: Number(returned.swaps) - Number(finish.swaps), start: finish, finish: returned };
  assert.deepEqual(evidence.pageErrors, []);
  assert.deepEqual(evidence.requestErrors, []);
} catch (error) {
  evidence.failure = error instanceof Error ? error.message : String(error);
  if (page) {
    const partial = await page.evaluate(() => ({ trace: window.p14Trace ?? [], inputs: window.p14Inputs ?? [] })).catch(() => undefined);
    if (partial) Object.assign(evidence, partial);
  }
  process.exitCode = 1;
} finally {
  await browser?.close();
  await writeFile(join(out, 'climb.json'), `${JSON.stringify(evidence)}\n`);
  console.log(JSON.stringify({ ...evidence, trace: evidence.trace.length, inputs: evidence.inputs.length }));
}
