import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = resolve(process.argv[2] ?? 'docs/交流区/GPT/C2-R09-铁匠铺门外操作面-2026-11-25');
const cache = resolve(out, '.vite-cache');
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const sourceTreeHash = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: root, encoding: 'utf8' }).trim();
const sourceStatus = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim();
const sourceTree = { root, commit: sourceCommit, tree: sourceTreeHash, dirty: sourceStatus.length > 0, status: sourceStatus };
const html = '<!doctype html><html lang="zh-CN"><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<link rel="icon" href="data:,"><style>html,body{margin:0;overflow:hidden;background:#151a20}canvas{display:block}</style>' +
  '<script type="module" src="/tools/voxel-tavern/town-blockout/town-c2-r30-forge-exterior-review.ts"></script></html>';
await mkdir(out, { recursive: true });
const app = await createServer({
  configFile: false, root, publicDir: false, cacheDir: cache, resolve: { dedupe: ['three'] },
  plugins: [{ name: 'c2-r30-forge-exterior-review', configureServer(vite) {
    vite.middlewares.use((req, res, next) => {
      if (req.url?.split('?')[0] !== '/c2-r30-forge-exterior-review') return next();
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(html);
    });
  } }],
  server: { host: '127.0.0.1', port: 0, hmr: false },
});
const angle = process.env.TOWN_C2_ANGLE ?? 'd3d11';
assert.ok(['swiftshader', 'd3d11', 'gl'].includes(angle));
const glArgs = angle === 'swiftshader'
  ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  : ['--use-gl=angle', '--use-angle=' + angle];
const report = {
  schema: 'town-c2-r30-forge-exterior-review/v1',
  sourceCommit, sourceTree,
  scope: 'C2-R09 local art review over the existing warrior-city candidate and forge hall; no production wiring',
  uncertified: [
    'review-only city/forge host; no C-certified world frame or production mount',
    'exterior adds no interaction socket, loot, gate, presence or real light',
    'headless FPS is a fixture sample, not a device benchmark',
  ],
  errors: { pageerror: [], consoleError: [], requestFailed: [] },
  views: {}, walk: null, fpsSample: null, passed: false,
};
let browser;
let problem;
async function settle(page) {
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
}
function watch(page) {
  page.on('pageerror', error => report.errors.pageerror.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.consoleError.push(message.text()); });
  page.on('requestfailed', request => report.errors.requestFailed.push(
    request.url() + ': ' + (request.failure()?.errorText ?? 'failed')));
}
async function capture(page, name, file, isNight) {
  assert.equal(await page.evaluate(args => {
    window.__forgeExteriorReview.choose(args.name);
    return window.__forgeExteriorReview.setNight(args.isNight);
  }, { name, isNight }), true);
  await settle(page);
  const stats = await page.evaluate(() => window.__forgeExteriorReview.inspect());
  assert.equal(stats.siteCertified, true);
  assert.ok(stats.pieces > 80);
  assert.ok(stats.batches <= 9);
  assert.equal(stats.realLights, 0);
  assert.equal(stats.interactionSockets, 0);
  assert.equal(stats.worldAnchor, false);
  assert.equal(stats.fixtureOnly, true);
  assert.equal(stats.productionCertified, false);
  assert.ok(stats.render.calls > 0 && stats.render.triangles > 0);
  const shot = await page.screenshot({ path: resolve(out, file) });
  assert.ok(shot.byteLength > 1000, file + ' looks blank');
  report.views[file] = { ...stats, bytes: shot.byteLength };
  return stats;
}
try {
  await app.listen();
  const addr = app.httpServer.address();
  assert.ok(addr && typeof addr === 'object');
  const executablePath = existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')
    ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined;
  browser = await chromium.launch({ executablePath, headless: true, args: [
    ...glArgs,
    '--disable-features=PointerLock', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  ] });
  report.renderer = { executablePath: executablePath ?? 'Playwright bundled Chromium', headless: true, gl: angle };
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  watch(page);
  await page.goto('http://127.0.0.1:' + addr.port + '/c2-r30-forge-exterior-review', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__forgeExteriorReview?.inspect().frames > 2);

  await capture(page, 'gate-front', 'gate-front-day.png', false);
  await capture(page, 'gate-front', 'gate-front-night.png', true);
  await capture(page, 'anvil-yard', 'anvil-yard-day.png', false);
  await capture(page, 'quench-edge', 'quench-edge-day.png', false);
  await capture(page, 'street-seam', 'street-seam-day.png', false);

  assert.equal(await page.evaluate(() => {
    window.__forgeExteriorReview.choose('gate-front');
    window.__forgeExteriorReview.setNight(false);
    window.__forgeExteriorReview.resetWalk();
    return true;
  }), true);
  await page.keyboard.down('w');
  try {
    for (let index = 0; index < 3; index++) {
      assert.equal(await page.evaluate(() => window.__forgeExteriorReview.step(1)), true,
        'forge approach W step rejected');
    }
  } finally {
    await page.keyboard.up('w');
  }
  report.walk = await page.evaluate(() => window.__forgeExteriorReview.inspect());
  assert.ok(report.walk.walked > 2.99 && report.walk.trustedW > 0 && report.walk.rejected === 0);

  assert.equal(await page.evaluate(() => {
    window.__forgeExteriorReview.choose('anvil-yard');
    window.__forgeExteriorReview.setNight(true);
    window.__forgeExteriorReview.resetFPS();
    return true;
  }), true);
  const sampleStarted = Date.now();
  await page.waitForTimeout(20000);
  report.fpsSample = {
    scene: 'anvil-yard-night', requestedMs: 20000, wallMs: Date.now() - sampleStarted,
    stats: await page.evaluate(() => window.__forgeExteriorReview.inspect()),
    certification: 'fixture-only ' + angle + ' sample',
  };
  assert.ok(report.fpsSample.wallMs >= 19000);
  assert.ok(report.fpsSample.stats.frames > 0 && Number.isFinite(report.fpsSample.stats.fps));
  assert.deepEqual(report.errors.pageerror, []);
  assert.deepEqual(report.errors.consoleError, []);
  assert.deepEqual(report.errors.requestFailed, []);
  report.passed = true;
} catch (error) {
  problem = error;
  report.failure = String(error);
} finally {
  await browser?.close().catch(() => {});
  await app.close().catch(() => {});
  await rm(cache, { recursive: true, force: true });
  report.finishedAt = new Date().toISOString();
  await writeFile(resolve(out, 'source-commit.txt'), sourceCommit + '\n', 'utf8');
  await writeFile(resolve(out, 'source-tree.txt'), sourceTreeHash + '\n', 'utf8');
  await writeFile(resolve(out, 'review-stats.json'), JSON.stringify(report, null, 2), 'utf8');
}
console.log(JSON.stringify({
  passed: report.passed, out, sourceCommit,
  views: Object.keys(report.views),
  walk: report.walk && { walked: report.walk.walked, rejected: report.walk.rejected, trustedW: report.walk.trustedW },
  fps: report.fpsSample?.stats.fps,
  errors: report.errors,
  failure: report.failure,
}, null, 2));
if (problem) throw problem;
