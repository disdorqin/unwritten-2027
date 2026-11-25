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
  scope: 'C2-07 visual differential and segmented first-person entry/bypass/exit evidence over the registered second-mine domain; formal water snapshot, no viewer or production transition wiring',
  uncertified: [
    'viewer/town-presence production switching, real descent facility and online walkthrough are not wired',
    'prefab and water differential remain visual-only and do not change floor, canStand, collision, ore or inventory authority',
    'trusted-W bypass walks use the fixture camera and existing passageAt; they do not certify a production player controller',
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
    ['support', true, 'middle', 'town-c2-m140-support-night.png'],
    ['upperWest', true, 'middle', 'town-c2-m140-upper-west-night.png'],
    ['upperEast', true, 'middle', 'town-c2-m140-upper-east-night.png'],
    ['nearWest', true, 'middle', 'town-c2-m140-near-bank-night.png'],
    ['nearBankEast', true, 'middle', 'town-c2-m140-near-bank-east-night.png'],
    ['farWest', true, 'middle', 'town-c2-m140-far-bank-night.png'],
    ['farBankEast', true, 'middle', 'town-c2-m140-far-bank-east-night.png'],
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

  const walkRoute = await page.evaluate(() => window.townC2MineReview.walkRoute);
  assert.equal(walkRoute.length, 6, 'entry, four bypass points and exit must form the surveyed route');
  const routeLength = walkRoute.slice(1).reduce((total, point, index) => total +
    Math.hypot(point.east - walkRoute[index].east, point.north - walkRoute[index].north), 0);
  for (const state of ['high', 'middle', 'low']) {
    const start = await page.evaluate(value => {
      window.townC2MineReview.setRiverState(value);
      window.townC2MineReview.setNight(true);
      return window.townC2MineReview.setView('entry') ? window.townC2MineReview.inspect() : null;
    }, state);
    assert.ok(start, state + ' entry is blocked');
    assert.equal(start.state, state);
    const legs = [];
    let segmentCount = 0;
    for (let index = 1; index < walkRoute.length; index++) {
      const target = walkRoute[index];
      const length = Math.hypot(target.east - walkRoute[index - 1].east,
        target.north - walkRoute[index - 1].north);
      const segments = Math.ceil(length / 6);
      const seconds = length / segments / 3;
      for (let segment = 0; segment < segments; segment++) {
        assert.equal(await page.evaluate(point => window.townC2MineReview.faceLocal(point), target), true,
          state + ' cannot face surveyed bypass point ' + index);
        await page.keyboard.down('w');
        let accepted = false;
        try {
          accepted = await page.evaluate(value => window.townC2MineReview.step(value), seconds);
        } finally {
          await page.keyboard.up('w');
        }
        assert.equal(accepted, true, state + ' rejected W segment ' + segment + ' toward point ' + index);
        segmentCount++;
      }
      const leg = await page.evaluate(() => window.townC2MineReview.inspect());
      const distance = Math.hypot(leg.localFoot.east - target.east, leg.localFoot.north - target.north);
      legs.push({ point: target, distance, eye: leg.eye, localFoot: leg.localFoot, room: leg.room });
      assert.ok(distance < .05, state + ' did not reach surveyed bypass point ' + index);
    }
    const end = await page.evaluate(() => window.townC2MineReview.inspect());
    const exit = walkRoute[walkRoute.length - 1];
    const endpointDistance = Math.hypot(end.localFoot.east - exit.east, end.localFoot.north - exit.north);
    const walk = {
      ...end,
      walked: end.walked - start.walked,
      rejected: end.rejected - start.rejected,
      trustedW: end.trustedW - start.trustedW,
      route: walkRoute,
      segmentCount,
      legs,
      endpoint: {
        name: 'exit', reached: endpointDistance < .05, distance: endpointDistance,
        localFoot: end.localFoot, room: end.room,
      },
    };
    report.walks[state] = walk;
    assert.equal(walk.rejected, 0, state + ' bypass walk was rejected');
    assert.ok(walk.trustedW > 0, state + ' bypass walk did not receive trusted W input');
    assert.ok(Math.abs(walk.walked - routeLength) < .05, state + ' bypass walk distance is incomplete');
    assert.equal(walk.endpoint.reached, true, state + ' bypass walk did not reach exit');
    assert.equal(walk.endpoint.room, 'exit');
    assert.ok(Math.abs(walk.localFoot.height) < 1e-6, state + ' bypass walk ended off the surveyed exit floor');
  }

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
