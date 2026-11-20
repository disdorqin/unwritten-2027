import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const [outputDirectory] = process.argv.slice(2);
assert.ok(outputDirectory, 'Usage: node tools/verify-flight-equipment-visuals.mjs <output-directory>');
const root = fileURLToPath(new URL('./voxel-tavern/', import.meta.url));
const renders = resolve(outputDirectory);
await mkdir(renders, { recursive: true });
const pageHtml = `<!doctype html><html lang="zh-CN">
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>雪翼与助推器 · 模型走查</title>
  <link rel="icon" href="data:,">
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #18242d; color: #dce7ec; font: 14px system-ui; }
    header { height: 44px; display: flex; align-items: center; padding: 0 18px; border-bottom: 1px solid #5e737d; }
    #view { margin-left: auto; color: #afc5ce; }
    canvas { display: block; width: 100%; height: calc(100vh - 44px); }
  </style>
  <main><header><strong>雪翼与助推器</strong><span id="view">模型走查</span></header><div id="stage"></div></main>
  <script type="module" src="/town-blockout/flight-equipment-review.ts"></script>
</html>`;
const server = await createServer({
  configFile: false,
  root,
  mode: 'development',
  publicDir: false,
  cacheDir: resolve(renders, '.vite'),
  optimizeDeps: { noDiscovery: true, include: [] },
  plugins: [{
    name: 'f7-browser-evidence-page',
    configureServer(vite) {
      vite.middlewares.use('/__f7-review.html', (_request, response) => {
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end(pageHtml);
      });
    },
  }],
  server: { host: '127.0.0.1', port: 43571, hmr: false, fs: { allow: [fileURLToPath(new URL('../', import.meta.url))] } },
});
let browser;
const errors = [];
const views = ['wing-front', 'wing-top', 'booster-side', 'booster-rear', 'assembly-rear', 'assembly-side', 'assembly-front', 'mount-register'];
try {
  await server.listen();
  const address = server.httpServer?.address();
  assert.ok(address && typeof address !== 'string');
  browser = await chromium.launch({
    ...(process.env.F7_CHROMIUM_PATH ? { executablePath: process.env.F7_CHROMIUM_PATH } : {}),
    headless: true,
    timeout: 20000,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1120, height: 748 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => errors.push(String(request.failure()?.errorText) + ' ' + request.url()));
  page.on('response', response => { if (response.status() >= 400) errors.push('HTTP ' + response.status() + ' ' + response.url()); });
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`http://127.0.0.1:${address.port}/__f7-review.html`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForFunction(() => typeof window.f7Probe?.render === 'function', null, { timeout: 12000 });
  const assets = await page.evaluate(() => window.f7Probe.inspect());
  const captures = [];
  for (const id of views) {
    const capture = await page.evaluate(name => window.f7Probe.render(name), id);
    const buffer = await page.screenshot({ path: resolve(renders, `${id}.png`), animations: 'disabled' });
    captures.push({ ...capture, bytes: buffer.length });
  }
  const source = 'town-blockout/flight-equipment-visuals.ts';
  const digest = createHash('sha256').update(await readFile(resolve(root, source))).digest('hex');
  const result = { browser: browser.version(), source, digest, passed: false, assets, views: captures, errors };
  await writeFile(resolve(renders, 'f7-browser-evidence.json'), JSON.stringify(result, null, 2) + '\n');
  assert.deepEqual(errors, []);
  assert.equal(assets.wing.name, 'snow-wing');
  assert.equal(assets.booster.name, 'flight-booster');
  assert.equal(assets.mating.parent, 'snow-wing');
  assert.ok(assets.mating.gap <= 1e-7);
  assert.equal(assets.mating.axesDot, 1);
  assert.ok(assets.mating.contactPairs > 0);
  assert.equal(assets.mating.penetrationPairs, 0);
  for (const part of [assets.wing, assets.booster]) {
    for (const axis of [0, 1, 2]) {
      assert.ok(Math.abs(part.declared.min[axis] - part.measured.min[axis]) <= 1e-6);
      assert.ok(Math.abs(part.declared.max[axis] - part.measured.max[axis]) <= 1e-6);
    }
    for (const mount of Object.values(part.mounts)) {
      assert.ok(Math.abs(Math.hypot(...mount.forward) - 1) <= 1e-7);
    }
  }
  const { leftHand, rightHand } = assets.wing.mounts;
  const { leftExhaust, rightExhaust } = assets.booster.mounts;
  for (const [left, right] of [[leftHand, rightHand], [leftExhaust, rightExhaust]]) {
    assert.ok(left.position[0] < 0 && right.position[0] > 0);
    assert.ok(Math.abs(left.position[0] + right.position[0]) < 1e-7);
    assert.deepEqual(left.position.slice(1), right.position.slice(1));
  }
  assert.deepEqual(leftExhaust.forward, [0, 0, -1]);
  assert.deepEqual(rightExhaust.forward, [0, 0, -1]);
  for (const capture of captures) {
    const expected = capture.id.startsWith('wing-') ? ['snow-wing-voxels']
      : capture.id.startsWith('booster-') ? ['flight-booster-voxels'] : ['flight-booster-voxels', 'snow-wing-voxels'];
    assert.deepEqual(Object.keys(capture.batches).sort(), expected);
    assert.ok(capture.imagePixels > 3000, `Insufficient rendered pixels for ${capture.id}`);
    assert.equal(capture.glError, 0);
    assert.ok(capture.pixelBounds.low.x > 10 && capture.pixelBounds.high.x < capture.width - 10);
    assert.ok(capture.pixelBounds.low.y > 10 && capture.pixelBounds.high.y < capture.height - 10);
  }
  result.passed = true;
  await writeFile(resolve(renders, 'f7-browser-evidence.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ browser: result.browser, renderer: assets.graphics.renderer, assets, views: captures.map(v => ({ name: v.id, draws: v.rendered.calls, triangles: v.rendered.triangles, imagePixels: v.imagePixels })), errors }));
} catch (error) {
  console.error(error, errors);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await server.close();
}
