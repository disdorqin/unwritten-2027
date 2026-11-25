import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const [entry, evidenceDir] = process.argv.slice(2);
assert.ok(entry && evidenceDir, 'Provide the candidate entry URL and an evidence directory');
const url = new URL(entry);
assert.equal(url.protocol, 'http:');
assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
await mkdir(evidenceDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_EXECUTABLE,
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: 1 });
const errors = [];
const views = [];
const footsteps = [];
const actions = [];
const viewport = page.locator('#status-viewport');
const current = () => viewport.evaluate(element => ({ ...element.dataset }));
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => {
  if (response.status() >= 400 && new URL(response.url()).pathname !== '/favicon.ico') {
    errors.push(`${response.status()} ${response.url()}`);
  }
});
page.on('requestfailed', request => errors.push(request.failure()?.errorText ?? request.url()));

async function aim(axis, target, increase, decrease) {
  const start = Number((await current())[axis]);
  const difference = target - start;
  const delta = axis === 'yaw' ? Math.atan2(Math.sin(difference), Math.cos(difference)) : difference;
  if (Math.abs(delta) <= .035) return;
  const key = delta > 0 ? increase : decrease;
  await page.keyboard.down(key);
  try {
    await page.waitForFunction(({ axis, start, delta }) => {
      const value = Number(document.querySelector('#status-viewport').dataset[axis]);
      return (value - start) * Math.sign(delta) >= Math.abs(delta) - .022;
    }, { axis, start, delta }, { timeout: 6500 });
  } finally {
    await page.keyboard.up(key);
  }
}

async function walkTo(x, n) {
  for (let stride = 0; stride < 30; stride++) {
    const state = await current();
    const startX = Number(state.x), startN = Number(state.n);
    const east = x - startX, north = n - startN;
    const distance = Math.hypot(east, north);
    if (distance <= .16) {
      footsteps.push({ target: { x, n }, x: startX, n: startN, ground: Number(state.ground),
        steps: Number(state.steps), blocked: Number(state.blocked) });
      return state;
    }
    await aim('yaw', Math.atan2(-east, north), 'ArrowLeft', 'ArrowRight');
    const length = Math.min(1.2, distance - .07);
    await page.keyboard.down('w');
    try {
      await page.waitForFunction(({ startX, startN, length, targetX, targetN, blocked }) => {
        const data = document.querySelector('#status-viewport').dataset;
        const east = Number(data.x), north = Number(data.n);
        return Number(data.blocked) > blocked || Math.hypot(east - targetX, north - targetN) <= .16 ||
          Math.hypot(east - startX, north - startN) >= length;
      }, { startX, startN, length, targetX: x, targetN: n, blocked: Number(state.blocked) }, { timeout: 6500 });
    } finally {
      await page.keyboard.up('w');
    }
  }
  throw new Error(`Could not reach reviewed footpoint ${x},${n}`);
}

async function logKeys(name, keys, slot, lastPage = 'false') {
  const previously = Number((await current()).logKeyPresses);
  try {
    for (const key of keys) await page.keyboard.down(key);
  } finally {
    for (const key of keys) await page.keyboard.up(key);
  }
  await page.waitForFunction(expected => Number(document.querySelector('#status-viewport').dataset.logKeyPresses) >= expected,
    previously + keys.length, { timeout: 6500 });
  const state = await current();
  actions.push({ name, keys, state });
  assert.equal(state.slot, slot, name);
  assert.equal(state.lastPage, lastPage, name);
  assert.equal(state.pageText, '', name);
  assert.equal(state.lastPageFill, lastPage === 'true' ? '0.5' : '', name);
}

async function capture(name, view, slot, lastPage = 'false') {
  const state = await current();
  const status = await page.locator('#status-line').textContent();
  assert.equal(state.view, view, name);
  assert.equal(state.slot, slot, name);
  assert.equal(state.lastPage, lastPage, name);
  assert.ok(Number(state.draws) > 0 && Number(state.triangles) > 0, name);
  assert.deepEqual([state.red, state.green, state.off], ['16', '2', '0'], name);
  await viewport.screenshot({ path: join(evidenceDir, name + '.png') });
  views.push({ name, state, status });
}

let failure;
try {
  const response = await page.goto(url.href);
  assert.equal(response?.status(), 200);
  await viewport.locator('canvas').waitFor();
  await page.waitForFunction(() => Number(document.querySelector('#status-viewport').dataset.draws) > 0);
  await logKeys('airlock-rejects-two-hands', ['q', 'e'], '');
  await capture('01-airlock', 'airlock', '');
  await walkTo(2.55, -1.44);
  const vent = await current();
  await aim('yaw', Math.atan2(Number(vent.x) - 2.95, -3.51 - Number(vent.n)), 'ArrowLeft', 'ArrowRight');
  await aim('pitch', .22, 'ArrowUp', 'ArrowDown');
  await capture('02-life-support', 'life-support', '');
  for (const [x, n] of [[2.55, .1], [0, .1], [0, 5.65], [1.25, 5.65]]) await walkTo(x, n);

  // Cross north of the captain's table, with space for normal keyboard coasting.
  const side = await walkTo(1.25, 8.72);
  assert.deepEqual([side.leftReach, side.rightReach], ['false', 'true']);
  await logKeys('right-hand-position-rejects-two-hands', ['q', 'e'], '');
  const center = await walkTo(0, 8.72);
  assert.deepEqual([center.ground, center.leftReach, center.rightReach], ['0.3200', 'true', 'true']);
  assert.ok(Number(center.steps) > 0);
  await aim('yaw', 0, 'ArrowLeft', 'ArrowRight');
  await aim('pitch', -.43, 'ArrowUp', 'ArrowDown');
  await capture('03-cockpit-before', 'cockpit', '');
  await logKeys('turn-before-opening', ['Space'], '');
  await logKeys('left-hand-alone', ['q'], '');
  await logKeys('right-hand-alone', ['e'], '');
  await logKeys('both-hands-open', ['q', 'e'], '1');
  await capture('04-log-first', 'cockpit', '1');
  await logKeys('turn-one-page', ['Space'], '2');
  await capture('05-log-interior', 'cockpit', '2');
  await logKeys('turn-to-final-half-page', ['Space'], '3', 'true');
  await capture('06-cockpit-after', 'cockpit', '3', 'true');
  await logKeys('turn-after-final', ['Space'], '3', 'true');
  assert.deepEqual(errors, []);
} catch (error) {
  failure = error instanceof Error ? error.stack : String(error);
  await page.screenshot({ path: join(evidenceDir, 'failure.png') }).catch(() => {});
  throw error;
} finally {
  const report = { scope: 'S-5 keyboard footsteps, both hand positions and blank log turns on the S-2 host',
    browser: browser.version(), views, footsteps, actions, errors, failure };
  await writeFile(join(evidenceDir, 'orbital-status.json'), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
