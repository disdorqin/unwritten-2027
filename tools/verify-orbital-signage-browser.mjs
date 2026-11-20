import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const output = resolve(process.env.ORBITAL_SIGNAGE_EVIDENCE ?? process.argv[2] ?? 'test-results/orbital-signage');
await mkdir(output, { recursive: true });
const server = await createServer({
  root: resolve('tools/voxel-tavern'), configFile: false, logLevel: 'error',
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { host: '127.0.0.1', port: 0, strictPort: true, hmr: false },
});
const viewport = { width: 920, height: 600 };
const errors = [];
const report = { scope: 'isolated S-1/S-2 candidate room fixtures with S-11 signs', viewport, views: [], errors };
let browser;

try {
  await server.listen();
  const address = server.httpServer.address();
  assert.ok(address && typeof address === 'object');
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH, headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  report.browser = browser.version();
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204, body: '' }));
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => errors.push(`${request.url()} ${request.failure()?.errorText}`));
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  const response = await page.goto(`http://127.0.0.1:${address.port}/orbital-signage-review.html?proof=1`, {
    waitUntil: 'load', timeout: 60_000,
  });
  assert.equal(response?.status(), 200);
  await page.waitForFunction(() => typeof window.orbitalSignageReview?.inspect === 'function');

  const labels = [
    ['airlock-nameplate', '未央号'], ['cockpit-nameplate', '未央号'], ['to-cockpit', '驾驶舱'],
    ['to-airlock', '气闸舱'], ['teleport', '传送'], ['life-support', '维生'],
  ];
  for (const [id, text] of labels) {
    await page.locator(`button[data-sign="${id}"]`).click();
    const view = await page.evaluate(() => window.orbitalSignageReview.inspect());
    assert.equal(view.placement.id, id);
    assert.equal(view.placement.text, text);
    assert.equal(view.placement.origin, id === 'airlock-nameplate' ? 's2-wall' : 's11-sign');
    assert.equal(view.firstHit.name, id === 'airlock-nameplate' ? 'orbital-status-wall' : `orbital-sign-${id}`);
    assert.deepEqual(view.indicators, { red: 16, green: 2, chronicleRings: 2 });
    assert.ok(view.draws > 0 && view.triangles > 0 && view.firstHit.distance > 0);
    const image = `s11-${id}.png`;
    await page.screenshot({ path: resolve(output, image), timeout: 20_000 });
    report.views.push({ image, ...view });
  }
  assert.equal(report.views.length, 6);
  assert.deepEqual(errors, []);
} catch (error) {
  report.failure = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  try { await browser?.close(); }
  finally { await server.close(); }
  await writeFile(resolve(output, 'orbital-signage-views.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ browser: report.browser, views: report.views.length, failure: report.failure }));
}
