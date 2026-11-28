import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright';

/**
 * D31 browser acceptance for the real four-sector host.
 *
 * Opens the D2 host review page, drives its four viewpoints (A south, B west,
 * D2 summit, D2 north wall) and screenshots each one. Every view must render
 * real draw calls and triangles, the host must report A and B really installed
 * with real cut tiles, the live check must pass for the mounted sectors, and
 * the run must produce zero browser errors. It never edits shared viewer files.
 */
const root = resolve('.');
const out = resolve(process.argv[2] ?? '.evidence/d2-r30-production-host-2026-11-27');
await mkdir(out, { recursive: true });

let server, browser, page;
const errors = [];
const views = ['south', 'west', 'summit', 'north', 'east'];
const results = [];

try {
  server = await createServer({
    root: join(root, 'tools/voxel-tavern'),
    mode: 'town-preview',
    configFile: join(root, 'tools/voxel-tavern/vite.config.ts'),
    cacheDir: join(out, '.vite-cache'),
    optimizeDeps: { noDiscovery: true, include: [] },
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, hmr: false, fs: { allow: [root] } },
  });
  await server.listen();
  const port = server.httpServer.address().port;

  const chrome = process.env.CHROMIUM_PATH
    ?? (existsSync(chromium.executablePath()) ? undefined : 'C:/Program Files/Google/Chrome/Application/chrome.exe');
  browser = await chromium.launch({
    headless: true, executablePath: chrome, args: ['--use-gl=angle', '--use-angle=d3d11'],
  });
  page = await browser.newPage({ viewport: { width: 1140, height: 700 }, deviceScaleFactor: .8, locale: 'zh-CN' });
  page.on('pageerror', e => errors.push('page:' + e.message));
  page.on('console', m => {
    if (m.type() === 'error' && !m.text().includes('favicon.ico')) errors.push('console:' + m.text() + ' ' + m.location().url);
  });
  page.on('response', r => {
    if (r.status() >= 400 && !r.url().endsWith('favicon.ico')) errors.push('http:' + r.status() + ':' + r.url());
  });

  await page.goto('http://127.0.0.1:' + port + '/town-d2-production-host-review.html', {
    waitUntil: 'domcontentloaded', timeout: 120000,
  });
  await page.waitForFunction(() => window.__d2HostReview, null, { timeout: 120000 });
  await page.waitForTimeout(2500);

  for (const view of views) {
    await page.locator('#view-' + view).click();
    await page.waitForTimeout(900);
    const state = await page.evaluate(() => window.__d2HostReview.getState());
    await page.screenshot({ path: join(out, view + '.png') });
    results.push({
      view,
      draws: state.draws,
      triangles: state.triangles,
      eyeHeight: state.eyeHeight,
      installed: state.host.installed,
      tiles: state.host.tiles,
      live: state.live,
    });
    assert.ok(state.draws > 0, `${view} must render at least one draw call`);
    assert.ok(state.triangles > 0, `${view} must render triangles`);
    // The real host, not a report: both sectors are mounted with cut tiles.
    assert.deepEqual(state.host.installed, ['A', 'B', 'C2'], `${view} lost a sector`);
    assert.ok(state.host.tiles.cut > 0, `${view} shows no excavated canonical tile`);
    assert.deepEqual(state.host.duplicates, [], `${view} mounted a sector twice`);
    const live = new Map(state.live.sectors.map(sector => [sector.sector, sector]));
    for (const key of ['A', 'B', 'C2', 'D2']) {
      const sector = live.get(key);
      assert.ok(sector.installed, `${view} reports ${key} not installed`);
      assert.equal(sector.unsupported, 0, `${view} has unsupported ${key} ground`);
      assert.equal(sector.floatingDeck, 0, `${view} has a floating ${key} deck`);
    }
    assert.equal(state.live.ready, true, `${view} four-sector live check is not ready`);
    console.log('D2-host', view, JSON.stringify({
      draws: state.draws, triangles: state.triangles, cut: state.host.tiles.cut,
      sectors: state.live.sectors.map(sector => sector.sector + ':' + sector.samples),
    }));
  }

  await writeFile(join(out, 'report.json'), JSON.stringify({
    views: results, errors,
    passed: errors.length === 0 && results.length === views.length,
  }, null, 2));
  const realErrors = errors.filter(e => !e.includes('favicon.ico'));
  assert.equal(realErrors.length, 0, 'no browser errors expected: ' + realErrors.join('; '));
  console.log(`D2 production host browser verification PASSED: ${results.length} views, ${realErrors.length} real errors`);
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) await server.close().catch(() => {});
}
