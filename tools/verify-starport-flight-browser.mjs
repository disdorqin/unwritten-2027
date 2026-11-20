import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const [url, output] = process.argv.slice(2);
assert.ok(output && url && new URL(url).hostname === '127.0.0.1');
await mkdir(output, { recursive: true });
const proof = { errors: [], states: {} };
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 650 } });
  page.on('pageerror', error => proof.errors.push(error.message));
  page.on('requestfailed', request => proof.errors.push(request.url()));
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
  await record('04-airborne');
  assert.deepEqual(proof.errors, []);
} finally {
  await writeFile(join(output, 'starport-flight.json'), JSON.stringify(proof, null, 2) + '\n');
  await browser.close();
}
