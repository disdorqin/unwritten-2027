import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const repo = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(process.argv[2] ??
  'docs/交流区/GPT/窗C-U10建模审图-2026-11-21');
const viteCache = resolve(output, '.vite-cache');
await mkdir(output, { recursive: true });

const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" href="data:,"><title>U10 architecture reviewer - offline fixture</title>
<style>html,body{margin:0;overflow:hidden;background:#2c3648}canvas{display:block}</style>
</head><body><script type="module" src="/tools/fixtures/underground-warrior-architecture-review.ts"></script></body></html>`;
const server = await createServer({
  configFile: false, root: repo, publicDir: false, cacheDir: viteCache,
  resolve: { dedupe: ['three'] },
  plugins: [{
    name: 'warrior-city-render-review',
    configureServer(vite) {
      vite.middlewares.use('/warrior-architecture-review', (_req, res) => {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(html);
      });
    },
  }],
  server: { host: '127.0.0.1', port: 0, hmr: false },
});
let browser;
let error;
const verdict = { scope: 'LOCAL model-only fixture; not mounted in the default town, not a live -165m world.',
  views: {}, openHouseWalk: undefined, sealedHouseWalk: undefined, passed: false, errors: [] };
try {
  await server.listen();
  const address = server.httpServer.address();
  assert.equal(typeof address, 'object');
  const url = `http://127.0.0.1:${address.port}/warrior-architecture-review`;
  // Prefer the machine's existing Chrome, avoiding a large Playwright browser
  // download into C:\\Users\\... and new headless-shell cache trees.
  browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  page.on('pageerror', issue => verdict.errors.push('page: ' + issue.message));
  page.on('requestfailed', request => verdict.errors.push('request: ' + request.url()));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.warriorArchitectureReview?.inspect().frames >= 2);
  for (const [index, name] of ['home-street', 'home-interior', 'market-arcade', 'citywall-top'].entries()) {
    const ok = await page.evaluate(value => window.warriorArchitectureReview.setView(value), name);
    assert.equal(ok, true);
    await page.evaluate(() => new Promise(done => requestAnimationFrame(() =>
      requestAnimationFrame(done))));
    const stats = await page.evaluate(() => window.warriorArchitectureReview.inspect());
    assert.equal(stats.kind, 'ready');
    assert.equal(stats.view, name);
    assert.ok(stats.architecture.architecturePieces > 6000);
    assert.equal(stats.architecture.accessible, 4);
    assert.equal(stats.lights, 6);
    assert.equal(stats.visibleLights, 3);
    assert.ok(stats.drawCalls <= 14, 'more than fourteen draw calls in the review framing');
    assert.ok(stats.triangles > 70000 && stats.triangles < 125000,
      'review frame is empty, or detail geometry exceeded budget');
    assert.ok(Math.abs(stats.eyeHeight - [1.67, 1.67, 1.68, 8.77][index]) < .001);
    assert.equal(stats.walk.clear, true, 'review camera must start at a valid physical foot');
    const file = resolve(output, `${index + 1}-${name}.png`);
    const image = await page.screenshot({ path: file });
    assert.ok(image.byteLength > 15000, 'reference shot rendered blank or not at all');
    // Verified real Chromium keyboard W, not simply replaying a scripted camera
    // teleport. The fixture's step() sweeps a 27cm-radius avatar in ≤11cm chunks
    // against the same 77 physical blockers as the registered city scene.
    await page.keyboard.down('w');
    const moved = await page.evaluate(() => window.warriorArchitectureReview.step(.52));
    await page.keyboard.up('w');
    const walking = await page.evaluate(() => window.warriorArchitectureReview.inspect());
    assert.equal(moved, true, name + ': real W must advance first-person view');
    assert.ok(walking.walk.meters >= stats.walk.meters + 1.35,
      name + ': expected ≥1.35 m of actual swept keyboard movement');
    assert.equal(walking.walk.clear, true,
      name + ': the finished point must remain clear to a standing capsule');
    assert.equal(walking.walk.rejectedSteps, stats.walk.rejectedSteps,
      name + ': unexpected stone collider snag during routine walk');
    assert.ok(walking.walk.trustedWEvents > stats.walk.trustedWEvents,
      name + ': only real browser keyboard input counts as walk proof');
    verdict.views[name] = { ...stats, walkAfterKeyW: walking.walk,
      screenshot: file, imageBytes: image.byteLength };
    if (name === 'home-street') {
      // Continue from the street, through the actual 2.52m doorway, to the
      // furnished chamber. This scene is based on one of the FOUR open homes.
      await page.keyboard.down('w');
      await page.evaluate(() => window.warriorArchitectureReview.step(2.5));
      await page.evaluate(() => window.warriorArchitectureReview.step(1.2));
      await page.keyboard.up('w');
      const entered = await page.evaluate(() => window.warriorArchitectureReview.inspect());
      assert.ok(entered.walk.north > 9.7 && entered.walk.north < 16,
        'open-home street entry must actually reach inside the roofed room');
      assert.ok(Math.abs(entered.walk.east - 37.75) < .2);
      assert.equal(entered.walk.clear, true);
      assert.equal(entered.walk.rejectedSteps, walking.walk.rejectedSteps,
        'furnished wall cannot trap the player entering by the open main door');
      await page.evaluate(() => new Promise(done => requestAnimationFrame(() =>
        requestAnimationFrame(done))));
      const thresholdFile = resolve(output, '5-entered-open-home.png');
      const thresholdShot = await page.screenshot({ path: thresholdFile });
      assert.ok(thresholdShot.byteLength > 15000);
      verdict.openHouseWalk = { ...entered.walk, screenshot: thresholdFile };
    }
  }
  // A sealed home must never become a shortcut to the rear of the street.
  await page.evaluate(() => window.warriorArchitectureReview.setView('sealed-house'));
  const blockedBefore = await page.evaluate(() => window.warriorArchitectureReview.inspect());
  await page.keyboard.down('w');
  await page.evaluate(() => window.warriorArchitectureReview.step(2.5));
  await page.evaluate(() => window.warriorArchitectureReview.step(2.5));
  await page.keyboard.up('w');
  const sealed = await page.evaluate(() => window.warriorArchitectureReview.inspect());
  assert.ok(sealed.walk.north >= 4 && sealed.walk.north < 8.15,
    'sealed home must block the actual forward walk before the front wall');
  assert.ok(sealed.walk.rejectedSteps > blockedBefore.walk.rejectedSteps,
    'a physically blocked stair/door must explicitly reject a capsule step');
  assert.equal(sealed.walk.clear, true);
  const sealedFile = resolve(output, '6-sealed-home-rejects-entry.png');
  const sealedScreenshot = await page.screenshot({ path: sealedFile });
  assert.ok(sealedScreenshot.byteLength > 15000);
  verdict.sealedHouseWalk = { ...sealed.walk, screenshot: sealedFile };
  assert.deepEqual(verdict.errors, []);
  verdict.passed = true;
  await page.close();
} catch (caught) {
  error = caught;
  verdict.errors.push(String(caught));
} finally {
  await browser?.close().catch(() => {});
  await server.close();
  await rm(viteCache, { recursive: true, force: true });
  await writeFile(resolve(output, 'review-stats.json'), JSON.stringify(verdict, null, 2), 'utf8');
}
console.log(JSON.stringify({ passed: verdict.passed, errors: verdict.errors,
  views: Object.fromEntries(Object.entries(verdict.views).map(([name, item]) =>
    [name, { drawCalls: item.drawCalls, triangles: item.triangles, bytes: item.imageBytes }])) }, null, 2));
if (error) throw error;
