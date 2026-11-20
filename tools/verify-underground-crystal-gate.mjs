import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

assert.ok(process.argv[2], 'Use: node tools/verify-underground-crystal-gate.mjs <evidence-dir>');
const out = resolve(process.argv[2]);
const scratch = await mkdtemp(resolve(tmpdir(), 'crystal-gate-browser-'));
const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(out, { recursive: true });
const pageHtml = `<!doctype html>
<html lang="zh-CN">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>矿一铁闸评审</title>
<link rel="icon" href="data:,">
<style>
  body { margin: 0; background: #171f27; color: #f3eddf; font: 16px/1.5 system-ui, sans-serif; }
  canvas { display: block; }
  aside { position: fixed; left: 1rem; bottom: 1rem; background: #111820db; padding: .6rem .85rem; }
  output { display: block; color: #afe4ec; }
</style>
<main></main>
<aside>W / S 前后移动 · E 转动绞盘 · F 模拟清段
  <output aria-live="polite">矿一铁闸评审</output>
</aside>
<script type="module" src="/tools/fixtures/underground-crystal-gate-review.ts"></script>
</html>`;
const server = await createServer({
  configFile: false, root, cacheDir: resolve(scratch, 'vite'), publicDir: false,
  plugins: [{
    name: 'underground-crystal-gate-verification',
    configureServer(vite) {
      vite.middlewares.use('/underground-crystal-gate-check', (_request, response) => {
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end(pageHtml);
      });
    },
  }],
  server: { host: '127.0.0.1', port: 0, hmr: false },
});
let browser;
const records = {};
const errors = [];
try {
  await server.listen();
  browser = await chromium.launch({
    executablePath: process.env.UNWRITTEN_CHROMIUM_EXECUTABLE,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => errors.push(request.url()));
  page.on('response', response => { if (response.status() >= 400) errors.push(String(response.status()) + ' ' + response.url()); });
  await page.goto('http://127.0.0.1:' + server.httpServer.address().port + '/underground-crystal-gate-check');
  await page.waitForFunction(() => window.undergroundCrystalGateReview?.inspect().frame > 1);
  const inspect = () => page.evaluate(() => window.undergroundCrystalGateReview.inspect());
  const step = async (key, count) => { for (let i = 0; i < count; i++) await page.keyboard.press(key); };
  const take = async label => {
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    records[label] = await inspect();
    assert.equal(records[label].webglError, 0);
    assert.ok(records[label].draws > 0);
    await page.screenshot({ path: resolve(out, label + '.png') });
  };
  const start = await inspect();
  await step('e', 1);
  assert.equal((await inspect()).status, '请靠近绞盘');
  await step('w', 14);
  await step('e', 1);
  assert.equal((await inspect()).status, '先完成矿一清段');
  await step('w', 8);
  const closedBlocked = await inspect();
  assert.ok(closedBlocked.blocked > 0);
  assert.ok(closedBlocked.footZ < start.gateZ);
  await step('s', 4);
  await take('closed');
  await step('f', 1);
  await step('e', 1);
  assert.equal((await inspect()).stage, 'ajar');
  await take('ajar');
  await step('w', 8);
  const ajarBlocked = await inspect();
  assert.equal(ajarBlocked.stage, 'ajar');
  assert.ok(ajarBlocked.blocked > closedBlocked.blocked);
  assert.ok(ajarBlocked.footZ < start.gateZ);
  await step('s', 4);
  await page.waitForFunction(() => window.undergroundCrystalGateReview.inspect().stage === 'open');
  await take('open');
  await step('w', 14);
  const crossed = await inspect();
  assert.ok(crossed.footZ > start.gateZ + .5);
  await take('crossed');
  await step('s', 14);
  const returned = await inspect();
  assert.ok(returned.footZ < start.gateZ - .5);
  assert.ok(Math.abs(returned.footZ - records.open.footZ) < .001);
  assert.equal(returned.blocked, ajarBlocked.blocked);
  assert.equal(returned.trustedKeys, 70);
  assert.deepEqual(errors, []);
  const evidence = { chromium: browser.version(), start, closedBlocked, ajarBlocked, crossed, returned, records, errors };
  await writeFile(resolve(out, 'walk.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await browser?.close();
  await server.close();
  await rm(scratch, { recursive: true, force: true });
}
