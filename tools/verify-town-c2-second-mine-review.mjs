import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = resolve(process.argv[2] ?? 'docs/交流区/GPT/town-c2-20261124-负140建模实走原件');
const cache = resolve(out, '.vite-cache');
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const sourceTreeHash = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: root, encoding: 'utf8' }).trim();
const sourceStatus = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim();
const sourceTree = { root, commit: sourceCommit, tree: sourceTreeHash, dirty: sourceStatus.length > 0, status: sourceStatus };
const html = '<!doctype html><html lang="zh-CN"><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<link rel="icon" href="data:,"><style>html,body{margin:0;overflow:hidden;background:#10171e}canvas{display:block}</style>' +
  '<script type="module" src="/tools/fixtures/town-c2-second-mine-review.ts"></script></html>';
await mkdir(out, { recursive: true });
const app = await createServer({
  configFile: false, root, publicDir: false, cacheDir: cache, resolve: { dedupe: ['three'] },
  plugins: [{ name: 'town-c2-second-mine-review', configureServer(vite) {
    vite.middlewares.use((req, res, next) => {
      if (req.url?.split('?')[0] !== '/town-c2-second-mine-review') return next();
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(html);
    });
  } }],
  server: { host: '127.0.0.1', port: 0, hmr: false },
});
const angle = process.env.TOWN_C2_ANGLE ?? 'swiftshader';
assert.ok(['swiftshader', 'd3d11', 'gl'].includes(angle), 'TOWN_C2_ANGLE must be swiftshader, d3d11 or gl');
const glArgs = angle === 'swiftshader'
  ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  : ['--use-gl=angle', '--use-angle=' + angle];
const report = {
  schema: 'town-c2-second-mine-review/v1',
  sourceCommit,
  sourceTree,
  scope: 'C2-07 visual differential over the registered second-mine domain; formal water snapshot, no viewer or production transition wiring',
  uncertified: [
    'viewer/town-presence production switching, real descent facility and online walkthrough are not wired',
    'prefab and water differential remain visual-only and do not change floor, canStand, collision, ore or inventory authority',
    'high/mid/low selection is fixture input; the accepted water reader is tested separately',
    'Headless FPS is a review sample, not a device benchmark',
    'screenshots do not replace human visual acceptance',
  ],
  errors: { pageerror: [], consoleError: [], requestFailed: [] },
  views: {},
  walks: {},
  fpsSample: null,
  passed: false,
};
let browser;
let problem;
async function settle(page) {
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
}
function watch(page, label) {
  page.on('pageerror', error => report.errors.pageerror.push(label + ': ' + error.message));
  page.on('console', message => {
    if (message.type() === 'error') report.errors.consoleError.push(label + ': ' + message.text());
  });
  page.on('requestfailed', request => report.errors.requestFailed.push(
    label + ': ' + request.url() + ': ' + (request.failure()?.errorText ?? 'failed')));
}
async function capture(page, file) {
  await settle(page);
  const stats = await page.evaluate(() => window.townC2MineReview.inspect());
  assert.equal(stats.fixtureOnly, true);
  assert.equal(stats.productionCertified, false);
  assert.equal(stats.prefab.moduleCount, 8);
  assert.ok(stats.prefab.pieceCount > 3000);
  assert.equal(stats.prefab.realLightCount, 3);
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
  watch(page, 'second-mine');
  await page.addInitScript(() => {
    Object.defineProperty(Element.prototype, 'requestPointerLock', {
      configurable: true, value() { throw new Error('PointerLock is disabled in the C2 review fixture'); },
    });
  });
  await page.goto('http://127.0.0.1:' + addr.port + '/town-c2-second-mine-review', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.townC2MineReview?.inspect().frames > 2);

  const shots = [
    ['entry', false, 'middle', 'town-c2-m140-entry-day.png'],
    ['entry', true, 'middle', 'town-c2-m140-entry-night.png'],
    ['upperWest', true, 'middle', 'town-c2-m140-upper-west-night.png'],
    ['upperEast', true, 'middle', 'town-c2-m140-upper-east-night.png'],
    ['nearWest', true, 'middle', 'town-c2-m140-near-bank-night.png'],
    ['farWest', true, 'middle', 'town-c2-m140-far-bank-night.png'],
    ['bypass', true, 'high', 'town-c2-m140-bypass-high-night.png'],
    ['collapse', true, 'middle', 'town-c2-m140-collapse-night.png'],
    ['barracks', true, 'middle', 'town-c2-m140-barracks-night.png'],
    ['river', true, 'high', 'town-c2-m140-river-high-night.png'],
    ['river', true, 'middle', 'town-c2-m140-river-middle-night.png'],
    ['river', true, 'low', 'town-c2-m140-river-low-night.png'],
  ];
  for (const [name, isNight, state, file] of shots) {
    assert.equal(await page.evaluate(args => {
      window.townC2MineReview.setRiverState(args.state);
      window.townC2MineReview.setNight(args.isNight);
      return window.townC2MineReview.setView(args.name);
    }, { name, isNight, state }), true, 'blocked view: ' + name);
    const stats = await capture(page, file);
    assert.equal(stats.state, state);
    assert.equal(stats.registered, true);
    assert.equal(stats.water.waterMode, state === 'high' ? 'raised' : state === 'low' ? 'hidden' : 'baseline');
    assert.equal(stats.water.ferryRunning, state === 'middle');
    assert.equal(stats.water.groundedBoat, state === 'low');
  }

  assert.equal(await page.evaluate(() => {
    window.townC2MineReview.setRiverState('middle');
    window.townC2MineReview.setNight(true);
    window.townC2MineReview.setView('nearWest');
    window.townC2MineReview.resetFPS();
    return true;
  }), true);
  const sampleStarted = Date.now();
  await page.waitForTimeout(20000);
  report.fpsSample = {
    scene: 'near-bank-night', requestedMs: 20000, wallMs: Date.now() - sampleStarted,
    stats: await page.evaluate(() => window.townC2MineReview.inspect()),
    certification: 'fixture-only ' + angle + ' sample',
  };
  assert.ok(report.fpsSample.wallMs >= 19000);
  assert.ok(report.fpsSample.stats.frames > 0 && Number.isFinite(report.fpsSample.stats.fps));

  assert.equal(await page.evaluate(() => {
    window.townC2MineReview.setRiverState('middle');
    window.townC2MineReview.setNight(false);
    window.townC2MineReview.setView('bypass');
    return true;
  }), true);
  await page.keyboard.down('w');
  const step = await page.evaluate(() => window.townC2MineReview.step(2));
  await page.keyboard.up('w');
  assert.equal(step, true, 'bypass ground step rejected');
  report.walks.bypass = await page.evaluate(() => window.townC2MineReview.inspect());
  assert.ok(report.walks.bypass.walked > 5.99 && report.walks.bypass.trustedW > 0 && report.walks.bypass.rejected === 0);

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
  passed: report.passed,
  out,
  sourceCommit,
  views: Object.keys(report.views),
  walks: report.walks,
  fps: report.fpsSample?.stats.fps,
  errors: report.errors,
  failure: report.failure,
}, null, 2));
if (problem) throw problem;
