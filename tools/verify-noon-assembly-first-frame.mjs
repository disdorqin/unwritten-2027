import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const [server, output] = process.argv.slice(2);
assert.ok(server && output, 'Provide the loopback site URL and evidence directory.');
const url = new URL('/town-blockout.html?profile', server);
assert.equal(url.protocol, 'http:');
assert.equal(url.hostname, '127.0.0.1');

await mkdir(output, { recursive: true });
const viewport = { width: 1000, height: 650 };
const report = { url: url.href, viewport, pageErrors: [], requestFailures: [], httpErrors: [] };
let browser;
let measuring = true;
try {
  browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  report.browser = browser.version();
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1, locale: 'zh-CN' });
  page.on('pageerror', error => { if (measuring) report.pageErrors.push(String(error)); });
  page.on('requestfailed', request => {
    if (measuring) report.requestFailures.push({ url: request.url(), error: request.failure()?.errorText });
  });
  page.on('response', response => {
    if (measuring && response.status() >= 400) report.httpErrors.push({ url: response.url(), status: response.status() });
  });
  await page.addInitScript(() => {
    document.addEventListener('town-frame-profile', event => {
      if (!window.noonAssemblyFirstFrame) window.noonAssemblyFirstFrame = event.detail;
    }, true);
  });
  const response = await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  report.httpStatus = response?.status();
  assert.equal(report.httpStatus, 200);
  const first = await page.waitForFunction(() => window.noonAssemblyFirstFrame, null, { timeout: 100_000 });
  report.firstFrame = await first.jsonValue();
  await first.dispose();
  assert.ok(Number.isInteger(report.firstFrame.calls) && report.firstFrame.calls > 0);
  assert.ok(Number.isInteger(report.firstFrame.triangles) && report.firstFrame.triangles > 0);
  await page.locator('#scene canvas').waitFor({ state: 'visible', timeout: 10_000 });
  await page.screenshot({ path: join(output, 'town.png'), timeout: 45_000 });
  assert.equal(report.pageErrors.length + report.requestFailures.length + report.httpErrors.length, 0);
} catch (error) {
  report.failure = error instanceof Error ? error.stack : String(error);
  process.exitCode = 1;
} finally {
  measuring = false;
  report.draws = report.firstFrame?.calls ?? null;
  report.tris = report.firstFrame?.triangles ?? null;
  report.errors = report.pageErrors.length + report.requestFailures.length + report.httpErrors.length;
  console.log(JSON.stringify({ draws: report.draws, tris: report.tris, errors: report.errors, failure: report.failure }));
  await writeFile(join(output, 'first-frame.json'), JSON.stringify(report, null, 2) + '\n');
  await browser?.close();
}
