import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright';

/**
 * D2-R4/R5 browser visual acceptance for the central main-summit domain.
 *
 * Opens the canonical main-summit review page, drives its six viewpoints
 * (gate, cluster, north, east, south, west) and screenshots each one. Every
 * view must render real draw calls and triangles, report the mounted R30
 * sub-packages, and produce zero browser/console/HTTP errors. Screenshots and
 * a JSON report land in the evidence directory; this script never edits
 * shared viewer/terrain files.
 */
const root = resolve('.');
const out = resolve(process.argv[2] ?? '.evidence/d2-r30-summit-browser-2026-11-27');
await mkdir(out, { recursive: true });

let server, browser, page;
const errors = [];
const views = ['gate', 'cluster', 'north', 'east', 'south', 'west'];
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
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('favicon.ico')) errors.push('console:' + m.text() + ' ' + m.location().url) });
  page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('favicon.ico')) errors.push('http:' + r.status() + ':' + r.url()) });

  await page.goto('http://127.0.0.1:' + port + '/main-summit-review.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__p1Review, null, { timeout: 60000 });
  await page.waitForTimeout(2500);

  for (const view of views) {
    const buttonId = view === 'gate' ? '#gate' : `#view-${view}`;
    await page.locator(buttonId).click();
    await page.waitForTimeout(900);
    const state = await page.evaluate(() => window.__p1Review.getState());
    await page.screenshot({ path: join(out, view + '.png') });
    results.push({
      view,
      draws: state.draws,
      triangles: state.triangles,
      mountedParts: state.assembly.mountedParts,
      camera: state.camera,
      east: state.east, north: state.north, feet: state.feet,
    });
    assert.ok(state.draws > 0, `${view} must render at least one draw call`);
    assert.ok(state.triangles > 0, `${view} must render triangles`);
    // The R30 production mount must carry the core sub-packages in every view.
    for (const part of ['P-1', 'P-2', 'P-8']) {
      assert.ok(state.assembly.mountedParts.includes(part), `${view} missing mounted part ${part}`);
    }
    console.log('D2-summit', view, JSON.stringify({
      draws: state.draws, triangles: state.triangles, parts: state.assembly.mountedParts,
    }));
  }

  await writeFile(join(out, 'report.json'), JSON.stringify({
    views: results, errors,
    passed: errors.length === 0 && results.length === views.length,
  }, null, 2));
  // The browser auto-requests /favicon.ico, which the dev server answers 404;
  // that is not a rendering defect, so filter it before the hard gate.
  const realErrors = errors.filter(e => !e.includes('favicon.ico'));
  assert.equal(realErrors.length, 0, 'no browser errors expected: ' + realErrors.join('; '));
  console.log(`D2-summit browser verification PASSED: ${results.length} views, ${realErrors.length} real errors`);
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) await server.close().catch(() => {});
}
