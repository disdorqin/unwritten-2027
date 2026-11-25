/* Browser audit for the stand-alone B-owned modeled scene.
   Reuse the D-drive dependency cache; never create another C-drive node_modules. */
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const root = 'D:/computer learning/vibe_coding/unwritten-2027';
const pkg = root + '/node_modules';
const vite = require(require.resolve('vite', { paths: [root] }));
const playwright = require(require.resolve('playwright', { paths: [root] }));
const aliases = [
  { find: /^three\/addons\//, replacement: pkg + '/three/examples/jsm/' },
  { find: /^three$/, replacement: pkg + '/three/build/three.module.js' },
  { find: /^@dimforge\/rapier3d-compat$/, replacement: pkg + '/@dimforge/rapier3d-compat' },
  { find: /^ws$/, replacement: pkg + '/ws' },
];

async function main() {
  const app = await vite.createServer({
    root: path.resolve('tools/voxel-tavern'),
    configFile: false,
    logLevel: 'silent',
    resolve: { alias: aliases },
    server: { host: '127.0.0.1', port: 0, strictPort: false },
    optimizeDeps: { noDiscovery: true },
  });
  let browser;
  try {
    await app.listen();
    browser = await playwright.chromium.launch({ channel: 'chrome', headless: true });
    const observations = {};
    for (const [kind, dims] of [
      ['desktop', { width: 1280, height: 720 }],
      ['mobile', { width: 390, height: 844 }],
    ]) {
      const page = await browser.newPage({
        viewport: dims,
        deviceScaleFactor: 1,
        isMobile: kind === 'mobile',
        hasTouch: kind === 'mobile',
      });
      const errors = [];
      page.on('pageerror', e => errors.push(String(e)));
      page.on('response', r => { if (r.status() >= 500) errors.push('HTTP ' + r.status() + ': ' + r.url()); });
      const url = app.resolvedUrls.local[0] + 'windbreak-model-preview.html';
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForFunction(() => window.__windbreakStats?.loaded && window.__windbreakStats?.calls > 0, { timeout: 25000 });
      await page.waitForTimeout(200);
      const base = await page.evaluate(() => window.__windbreakStats);
      assert.equal(base.entryClear, true);
      assert.ok(base.blocks > 350);
      assert.ok(base.calls <= 20, 'draw-call budget including ground must stay <= 20');
      const shots = {};
      for (const view of ['overview', 'interior', 'weather', 'hearth']) {
        await page.locator('#' + view).click();
        await page.waitForTimeout(120);
        if (kind === 'desktop') {
          const filename = 'tests/fixtures/windbreak-' + view + '.png';
          fs.mkdirSync(path.dirname(filename), { recursive: true });
          await page.screenshot({ path: filename, animations: 'disabled' });
          shots[view] = filename;
        }
      }
      observations[kind] = { stats: base, errors, shots };
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('WINDBREAK_BROWSER_AUDIT', JSON.stringify(observations));
  } finally {
    if (browser) await browser.close();
    await app.close();
  }
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
