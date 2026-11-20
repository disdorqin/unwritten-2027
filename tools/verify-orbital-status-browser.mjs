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
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => {
  if (response.status() >= 400 && new URL(response.url()).pathname !== '/favicon.ico') {
    errors.push(`${response.status()} ${response.url()}`);
  }
});
page.on('requestfailed', request => errors.push(request.failure()?.errorText ?? request.url()));

try {
  const response = await page.goto(url.href);
  assert.equal(response?.status(), 200);
  const viewport = page.locator('#status-viewport');
  await viewport.locator('canvas').waitFor();
  async function capture(name, expected) {
    await page.waitForFunction(expected => {
      const { view, lastPage, draws } = document.getElementById('status-viewport').dataset;
      return view === expected.view && lastPage === expected.lastPage && Number(draws) > 0;
    }, expected);
    const state = await viewport.evaluate(element => ({ ...element.dataset }));
    const status = await page.locator('#status-line').textContent();
    assert.ok(Number(state.triangles) > 0);
    assert.deepEqual([state.red, state.green, state.off], ['16', '2', '1']);
    await viewport.screenshot({ path: join(evidenceDir, name + '.png') });
    views.push({ name, state, status });
  }

  await capture('01-airlock', { view: 'airlock', lastPage: 'false' });
  await page.getByRole('button', { name: '维生通风' }).click();
  await capture('02-life-support', { view: 'life-support', lastPage: 'false' });
  await page.getByRole('button', { name: '驾驶舱控制台' }).click();
  await capture('03-cockpit-before', { view: 'cockpit', lastPage: 'false' });
  await page.getByRole('button', { name: '检视日志末页' }).click();
  await capture('04-cockpit-after', { view: 'cockpit', lastPage: 'true' });
  assert.deepEqual(errors, []);
} finally {
  const report = { scope: 'S-5 presentation on the isolated S-2 host', browser: browser.version(), views, errors };
  await writeFile(join(evidenceDir, 'orbital-status.json'), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
