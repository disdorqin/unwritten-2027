import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const [url, output] = process.argv.slice(2);
assert.ok(output && url && new URL(url).hostname === '127.0.0.1');
await mkdir(output, { recursive: true });
const logs = { errors: [], poses: [] };
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 920, height: 620 } });
  page.on('pageerror', error => logs.errors.push(error.message));
  page.on('requestfailed', request => logs.errors.push(request.url()));
  assert.equal((await page.goto(url))?.status(), 200);
  await page.waitForFunction(() => document.querySelector('#pig-review').dataset.occupied === 'true');
  const state = () => page.locator('#pig-review').evaluate(node => ({ ...node.dataset }));
  async function toward(key, field, goal) {
    await page.keyboard.down(key);
    try {
      await page.waitForFunction(({ field, goal }) => Number(document.querySelector('#pig-review').dataset[field]) >= goal,
        { field, goal }, { timeout: 10_000 });
    } finally { await page.keyboard.up(key); }
    logs.poses.push(await state());
  }
  await page.keyboard.press('e');
  assert.equal((await state()).held, 'false');
  await toward('w', 'north', 1013.95);
  await toward('d', 'east', 65.86);
  await toward('w', 'north', 1015.86);
  await page.screenshot({ path: join(output, '01-occupied.png') });
  await page.keyboard.press('e');
  await page.waitForFunction(() => document.querySelector('#pig-review').dataset.held === 'true');
  logs.after = await state();
  assert.equal(logs.after.occupied, 'false');
  assert.equal(logs.after.empty, 'true');
  assert.equal(logs.after.rejectedSteps, '0');
  await page.keyboard.press('e');
  await page.screenshot({ path: join(output, '02-empty.png') });
  assert.deepEqual(logs.errors, []);
} finally {
  await writeFile(join(output, 'pig-stone.json'), JSON.stringify(logs, null, 2) + '\n');
  await browser.close();
}
