import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const output = resolve(process.argv[2] ?? 'u11-browser-evidence');
const root = fileURLToPath(new URL('./voxel-tavern/', import.meta.url));
await mkdir(output, { recursive: true });
const server = await createServer({ root, configFile: false, clearScreen: false,
  server: { host: '127.0.0.1', port: 49211, strictPort: true } });
await server.listen();

let browser;
let failure;
let state;
const errors = [];
const checkpoints = [];
const started = performance.now();
const views = new Map([[0, 'stairs'], [2, 'colonnade'], [5, 'bypass'], [8, 'throne-hall'], [11, 'forecourt'], [12, 'vault-opening']]);
try {
  browser = await chromium.launch({
    executablePath: process.env.U11_CHROMIUM_PATH,
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 880, height: 560 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) errors.push(response.url()); });
  const response = await page.goto('http://127.0.0.1:49211/underground-palace-review.html');
  assert.equal(response?.status(), 200);
  await page.waitForFunction(() => window.palaceReview?.snapshot().calls > 0);
  const route = await page.evaluate(() => window.palaceReview.route);
  for (const [direction, goals] of [['toward-vault', route.slice(1)], ['return', [...route].reverse().slice(1)]]) {
    for (const [index, target] of goals.entries()) {
      await page.evaluate(([e, n]) => window.palaceReview.seek(e, n), target);
      await page.keyboard.down('w');
      try {
        await page.waitForFunction(([e, n]) => {
          const { east, north } = window.palaceReview.snapshot();
          return Math.hypot(east - e, north - n) < .01;
        }, target, { timeout: 18_000 });
      } finally {
        await page.keyboard.up('w');
      }
      state = await page.evaluate(() => window.palaceReview.snapshot());
      checkpoints.push({ direction, target, state });
      const view = direction === 'toward-vault' ? views.get(index) : index === goals.length - 1 ? 'return' : undefined;
      if (view === 'return') {
        await page.evaluate(() => {
          window.palaceReview.seek(0, 16);
          return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        });
      }
      if (view) await page.screenshot({ path: resolve(output, `${view}.png`) });
    }
  }
  assert.deepEqual(errors, []);
  assert.equal(checkpoints.length, 26);
  assert.equal(state.blocked, 0);
  assert.ok(state.maxLip <= .15000001);
  assert.equal(state.columns, 6);
  assert.ok(checkpoints.some(({ state: frame }) => frame.calls >= 2 && frame.triangles > 0));
} catch (error) {
  failure = String(error);
  throw error;
} finally {
  const evidence = { browser: browser?.version(), milliseconds: Math.round(performance.now() - started),
    passed: failure === undefined, failure, errors, state, checkpoints };
  await writeFile(resolve(output, 'walk-result.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  try { await browser?.close(); } finally { await server.close(); }
  console.log(JSON.stringify({ passed: evidence.passed, checkpoints: checkpoints.length, state, output }));
}
