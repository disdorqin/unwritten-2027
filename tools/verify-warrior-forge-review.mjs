import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const output = process.env.FORGE_PROOF_OUTPUT;
assert.ok(output, 'Set FORGE_PROOF_OUTPUT to an evidence directory');
await mkdir(output, { recursive: true });
const address = process.env.FORGE_PROOF_URL ?? 'http://127.0.0.1:4173/tools/voxel-tavern/warrior-forge-review.html';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const proof = { browser: browser.version(), checks: {}, errors: [] };
try {
  const page = await browser.newPage({ viewport: { width: 1040, height: 660 } });
  page.on('pageerror', error => proof.errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) proof.errors.push(`${response.status()} ${response.url()}`); });
  await page.goto(address);
  await page.waitForFunction(() => globalThis.__warriorForgeProof?.().frames > 1);
  const state = () => page.evaluate(() => globalThis.__warriorForgeProof());
  const snap = name => page.screenshot({ path: join(output, `${name}.png`) });
  async function walk(key, axis, threshold, increasing) {
    await page.keyboard.down(key);
    try {
      await page.waitForFunction(({ axis, threshold, increasing }) => {
        const value = globalThis.__warriorForgeProof()[axis];
        return increasing ? value >= threshold : value <= threshold;
      }, { axis, threshold, increasing }, { timeout: 12_000 });
    } finally { await page.keyboard.up(key); }
  }
  await page.keyboard.press('e');
  assert.equal((await state()).phase, 'materials');
  await walk('w', 'north', 8.82, true);
  await walk('a', 'east', 140.08, false);
  await page.keyboard.press('e');
  await page.waitForFunction(() => globalThis.__warriorForgeProof().materialBlocks);
  proof.checks.materials = await state();
  assert.deepEqual(proof.checks.materials.profile, { meteorIron: 0, stardustOre: 1, boosterOwned: false, fuelSeconds: 0 });
  await snap('01-material-table');
  await walk('d', 'east', 145.46, true);
  await walk('w', 'north', 10.61, true);
  await page.keyboard.press('e');
  await page.waitForFunction(() => {
    const stage = globalThis.__warriorForgeProof();
    return stage.phase === 'heating' && stage.heat >= .25;
  });
  proof.checks.heating = await state();
  await snap('02-heating');
  await walk('s', 'north', 8.85, false);
  await walk('a', 'east', 144.05, false);
  await walk('w', 'north', 10.72, true);
  await page.waitForFunction(() => globalThis.__warriorForgeProof().outlet, undefined, { timeout: 15_000 });
  await page.waitForTimeout(700);
  assert.equal((await state()).profile.boosterOwned, false);
  await snap('03-outlet');
  await page.keyboard.press('e');
  await page.waitForFunction(() => globalThis.__warriorForgeProof().profile.boosterOwned);
  await page.keyboard.press('r');
  await page.waitForFunction(() => globalThis.__warriorForgeProof().profile.fuelSeconds === 600);
  proof.checks.collected = await state();
  assert.deepEqual(proof.checks.collected.profile, { meteorIron: 0, stardustOre: 0, boosterOwned: true, fuelSeconds: 600 });
  assert.equal(proof.checks.collected.feet, -165);
  assert.equal(proof.checks.collected.blocked, 0);
  await snap('04-inventory');
  await page.reload();
  await page.waitForFunction(() => globalThis.__warriorForgeProof?.().frames > 1);
  proof.checks.reloaded = await state();
  assert.deepEqual(proof.checks.reloaded.profile, proof.checks.collected.profile);
  assert.deepEqual(proof.errors, []);
} finally {
  await writeFile(join(output, 'warrior-forge-walk.json'), JSON.stringify(proof, null, 2));
  await browser.close();
}
