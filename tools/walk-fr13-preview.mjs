import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';

const URL = 'http://127.0.0.1:5213/tools/voxel-tavern/fr13-underground-props-preview.html';
mkdirSync('test-results', { recursive: true });

const browser = await chromium.launch({
  channel: 'msedge',
  headless: true,
  args: ['--window-size=1440,900'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(60000);
const errors = [];
const consoleErrors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + String(e)));
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.__FR13_PREVIEW__ && window.__FR13_PREVIEW__.count === 8, null, { timeout: 60000 });
await page.waitForTimeout(1200);

const report = { count: await page.evaluate(() => window.__FR13_PREVIEW__.count), steps: [] };

// 1) overview shot
await page.screenshot({ path: 'test-results/fr13-overview.png' });
report.steps.push('overview');

// 2) walk every stand button, confirm active id + meta text updates
const names = await page.evaluate(() => [...document.querySelectorAll('#asset-list .item')].map((b) => b.textContent.trim()));
const metas = [];
for (let i = 0; i < names.length; i += 1) {
  await page.evaluate((idx) => window.__FR13_PREVIEW__.selectAsset(idx, true), i);
  await page.waitForTimeout(180);
  metas.push({
    idx: i,
    name: names[i],
    activeId: await page.evaluate(() => window.__FR13_PREVIEW__.activeId),
    metaText: (await page.locator('#meta-box').textContent()).replace(/\s+/g, ' ').trim().slice(0, 160),
  });
}
report.stands = metas;
await page.screenshot({ path: 'test-results/fr13-last-stand.png' });

// 3) LOD toggle -> proxy visible, detail hidden
await page.click('#btn-lod');
await page.waitForTimeout(400);
report.lodLabel = (await page.locator('#btn-lod').textContent()).trim();
await page.screenshot({ path: 'test-results/fr13-lod-low.png' });
await page.click('#btn-lod');

// 4) collider wireframe toggle
await page.click('#btn-col');
await page.waitForTimeout(300);
report.colLabel = (await page.locator('#btn-col').textContent()).trim();
await page.screenshot({ path: 'test-results/fr13-colliders.png' });
await page.click('#btn-col');

// 5) dim / campfire mode + back-view instanced batch
await page.click('#btn-day');
await page.waitForTimeout(300);
await page.click('#btn-back');
await page.waitForTimeout(700);
report.backViewShot = true;
await page.screenshot({ path: 'test-results/fr13-back-batch.png' });
await page.click('#btn-overview');
await page.waitForTimeout(500);

report.pageErrors = errors;
report.consoleErrors = consoleErrors;
writeFileSync('test-results/fr13-preview-report.json', JSON.stringify(report, null, 2));

await browser.close();
console.log(JSON.stringify({
  count: report.count,
  stands: report.stands.length,
  lodLabel: report.lodLabel,
  colLabel: report.colLabel,
  pageErrors: errors,
  consoleErrors,
}, null, 2));
