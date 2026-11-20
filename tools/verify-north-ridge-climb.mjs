import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const url = new URL(process.env.P14_URL ?? 'http://127.0.0.1:4173/tools/voxel-tavern/town-north-ridge-climb-review.html');
assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) && url.protocol === 'http:');
const out = process.env.P14_OUTPUT ?? 'test-results/p14-climb';
await mkdir(out, { recursive: true });
const evidence = { scope: 'North Ridge 350 local obstacle geometry and keyboard operation', capture: [], trace: [], pageErrors: [], requestErrors: [] };
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  evidence.browser = browser.version();
  const page = await browser.newPage({ viewport: { width: 768, height: 560 }, deviceScaleFactor: 1 });
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
  async function climbUntil(target, timeout = 120_000) {
    await page.keyboard.down('w');
    try {
      await page.waitForFunction(target => {
        const d = document.querySelector('#climb-scene canvas').dataset;
        if (!(target.flag ? d[target.flag] === target.value : Number(d.height) > target.height)) return false;
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
        return true;
      }, target, { timeout });
    } finally { await page.keyboard.up('w'); }
  }

  await mode('standing');
  await shot('01-start-shelf');
  for (const [key, modeName] of [['g', 'flight'], ['r', 'sled']]) {
    await page.keyboard.press(key);
    await mode(modeName);
    await page.keyboard.press('e');
    await stateField('lastGrip', 'false');
    await mode(modeName);
    await page.keyboard.press('q');
    await mode('standing');
  }
  await page.keyboard.press('e');
  await mode('climbing');
  await climbUntil({ height: 72 });
  const lateralBefore = await read();
  await page.keyboard.down('d');
  try {
    await page.waitForFunction(previous => Number(document.querySelector('#climb-scene canvas')?.dataset.east) - previous > .32,
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

  await climbUntil({ flag: 'slips', value: '1' });
  await mode('standing');
  const recovered = await read();
  assert.equal(recovered.shelf, '2');
  assert.equal(recovered.height, '98.0000');
  assert.equal(recovered.recoveries, '1');
  assert.equal(recovered.damage, '0');
  await shot('03-safe-prior-shelf');

  await page.keyboard.press('e');
  await mode('climbing');
  for (let i = 0; i < 2; i++) {
    await climbUntil({ flag: 'warning', value: 'true' });
    const paused = await read();
    await stateField('settled', 'true');
    const stable = await read();
    assert.equal(stable.height, paused.height);
    assert.equal(stable.slips, '1');
    await shot(`04-ice-hold-${i + 1}`);
  }
  await climbUntil({ flag: 'mode', value: 'standing' });
  const finish = await read();
  assert.equal(finish.height, '233.0000');
  assert.equal(finish.shelf, '11');
  assert.equal(finish.damage, '0');
  assert.equal(finish.slips, '1');
  assert.ok(Number(finish.swaps) > 450);
  await shot('05-final-shelf');
  evidence.trace = await page.evaluate(() => window.p14Trace);
  assert.ok(evidence.trace.some(row => row[1] === 'slipping'));
  assert.deepEqual([...new Set(evidence.trace.map(row => row[5]))].sort((a,b) => a-b), Array.from({length:12}, (_,i)=>i));
  assert.ok(evidence.trace.every(row => row[10] === 0));
  assert.deepEqual(evidence.pageErrors, []);
  assert.deepEqual(evidence.requestErrors, []);
} catch (error) {
  evidence.failure = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await writeFile(join(out, 'climb.json'), `${JSON.stringify(evidence)}\n`);
  console.log(JSON.stringify({ ...evidence, trace: evidence.trace.length }));
}
