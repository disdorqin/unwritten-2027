import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('.', import.meta.url));
const pageUrl = 'http://127.0.0.1:5208/friend3-decor-preview.html';
const evidenceDir = 'C:/Users/99243/AppData/Local/Temp';
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'preview', '--config', 'friend3-vite.fr08-preview.config.ts'],
  { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] },
);
let serverOutput = '';
server.stdout.on('data', chunk => {
  serverOutput += chunk.toString();
});
server.stderr.on('data', chunk => {
  serverOutput += chunk.toString();
});
process.on('exit', () => server.kill());

const errors = [];
function track(page, label) {
  page.on('pageerror', error => errors.push(`${label} pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    if (message.text().includes('favicon')) return;
    if (message.text().includes('Failed to load resource')) return;
    errors.push(`${label} console: ${message.text()}`);
  });
  page.on('response', response => {
    if (response.status() < 400) return;
    if (response.url().includes('favicon')) return;
    errors.push(`${label} HTTP ${response.status()}: ${response.url()}`);
  });
  page.on('requestfailed', request => {
    if (request.url().includes('favicon')) return;
    errors.push(`${label} requestfailed: ${request.url()} ${request.failure()?.errorText ?? ''}`);
  });
}

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(pageUrl);
      if (response.ok) return;
    } catch {
      // Wait for the preview server to bind the port.
    }
    await delay(250);
  }
  throw new Error(`FR-08 preview server did not start.\n${serverOutput}`);
}

async function counts(page) {
  return (await page.textContent('#decor-counts'))?.trim();
}

async function placeAll(page) {
  await page.locator('.f3-kind[data-kind="lantern"]').click();
  for (const id of ['lantern-1', 'lantern-2', 'lantern-3', 'lantern-4', 'lantern-5']) {
    await page.locator(`[data-anchor="${id}"]`).click();
  }
  await page.locator('.f3-kind[data-kind="postcard"]').click();
  for (const id of ['postcard-1', 'postcard-2', 'postcard-3', 'postcard-4', 'postcard-5']) {
    await page.locator(`[data-anchor="${id}"]`).click();
  }
}

await waitForServer();
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await desktop.newPage();
  track(page, 'desktop');
  await page.goto(pageUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector('#decor-scene canvas');
  await page.waitForSelector('.f3-anchor');
  const anchorCount = await page.locator('.f3-anchor').count();
  const kindCount = await page.locator('.f3-kind').count();
  const variantCount = await page.locator('.f3-variant').count();
  if (anchorCount !== 10) throw new Error(`Expected 10 anchors, got ${anchorCount}`);
  if (kindCount !== 2) throw new Error(`Expected 2 kinds, got ${kindCount}`);
  if (variantCount !== 3) throw new Error(`Expected 3 variants, got ${variantCount}`);
  if ((await counts(page)) !== '灯笼 0/5 · 明信片 0/5') throw new Error(`Unexpected initial counts: ${await counts(page)}`);

  await page.locator('[data-anchor="lantern-1"]').click();
  await delay(120);
  if ((await counts(page)) !== '灯笼 1/5 · 明信片 0/5') throw new Error(`Place failed: ${await counts(page)}`);
  if ((await page.getAttribute('[data-anchor="lantern-1"]', 'data-occupied')) !== 'true') {
    throw new Error('Anchor did not become occupied');
  }
  await page.locator('[data-anchor="lantern-1"]').click();
  await delay(120);
  if ((await counts(page)) !== '灯笼 0/5 · 明信片 0/5') throw new Error(`Remove failed: ${await counts(page)}`);

  await page.locator('[data-anchor="lantern-1"]').click();
  await page.locator('[data-anchor="lantern-2"]').click();
  await page.locator('[data-anchor="lantern-3"]').click();
  await page.locator('.f3-kind[data-kind="postcard"]').click();
  await page.locator('[data-anchor="postcard-2"]').click();
  await page.locator('[data-anchor="postcard-4"]').click();
  await delay(250);
  if ((await counts(page)) !== '灯笼 3/5 · 明信片 2/5') throw new Error(`Mixed layout failed: ${await counts(page)}`);
  await page.screenshot({ path: `${evidenceDir}/fr08-decor-desktop.png`, fullPage: true });

  await page.locator('#undo').click();
  await delay(100);
  if ((await counts(page)) !== '灯笼 3/5 · 明信片 1/5') throw new Error(`Undo failed: ${await counts(page)}`);
  await page.locator('#clear').click();
  await delay(100);
  if ((await counts(page)) !== '灯笼 0/5 · 明信片 0/5') throw new Error(`Clear failed: ${await counts(page)}`);

  await page.locator('.f3-kind[data-kind="postcard"]').click();
  await page.locator('[data-anchor="lantern-2"]').click();
  const mismatchStatus = (await page.textContent('#decor-status'))?.trim();
  if (!mismatchStatus?.includes('灯笼挂点')) throw new Error(`Mismatch guidance missing: ${mismatchStatus}`);

  await page.locator('.f3-kind[data-kind="postcard"]').click();
  const screenPoint = await page.evaluate(() => window.__friend3DecorPreview?.screenPoint('postcard-3'));
  if (!screenPoint) throw new Error('Canvas projection helper missing');
  await page.mouse.click(screenPoint.x, screenPoint.y);
  await delay(150);
  if ((await counts(page)) !== '灯笼 0/5 · 明信片 1/5') throw new Error(`Canvas place failed: ${await counts(page)}`);
  await page.mouse.click(screenPoint.x, screenPoint.y);
  await delay(150);
  if ((await counts(page)) !== '灯笼 0/5 · 明信片 0/5') throw new Error(`Canvas remove failed: ${await counts(page)}`);

  const stageBox = await page.locator('#decor-scene').boundingBox();
  if (!stageBox) throw new Error('Stage has no bounds');
  await page.mouse.move(stageBox.x + stageBox.width / 2, stageBox.y + stageBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(stageBox.x + stageBox.width / 2 + 90, stageBox.y + stageBox.height / 2 + 10, { steps: 6 });
  await page.mouse.up();
  await delay(100);
  if ((await counts(page)) !== '灯笼 0/5 · 明信片 0/5') throw new Error('Camera drag placed a decoration');

  await page.locator('#zoom-in').click();
  await page.locator('#zoom-out').click();
  await page.locator('#reset-view').click();
  await delay(100);

  await placeAll(page);
  await delay(150);
  if ((await counts(page)) !== '灯笼 5/5 · 明信片 5/5') throw new Error(`Full layout failed: ${await counts(page)}`);
  const fullStatus = (await page.textContent('#decor-status'))?.trim();
  if (!fullStatus?.includes('全部布置完成')) throw new Error(`Full completion status missing: ${fullStatus}`);
  await page.locator('#clear').click();
  await delay(100);

  const touch = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });
  const touchPage = await touch.newPage();
  track(touchPage, 'touch');
  await touchPage.goto(pageUrl, { waitUntil: 'networkidle' });
  await touchPage.waitForSelector('#decor-scene canvas');
  await touchPage.waitForSelector('.f3-anchor');
  const overflow = await touchPage.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) throw new Error(`Touch layout overflows by ${overflow}px`);
  const anchorSizes = await touchPage.$$eval('.f3-anchor', anchors => anchors.map(anchor => {
    const rect = anchor.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }));
  if (anchorSizes.some(size => size.width < 44 || size.height < 44)) {
    throw new Error(`Touch anchor below 44px: ${JSON.stringify(anchorSizes[0])}`);
  }
  await touchPage.locator('[data-anchor="lantern-1"]').tap();
  await delay(150);
  if ((await counts(touchPage)) !== '灯笼 1/5 · 明信片 0/5') throw new Error(`Touch place failed: ${await counts(touchPage)}`);
  await touchPage.screenshot({ path: `${evidenceDir}/fr08-decor-touch.png`, fullPage: true });

  if (errors.length) throw new Error(`Browser errors:\n${errors.join('\n')}`);

  console.log(JSON.stringify({
    ok: true,
    desktop: {
      anchors: anchorCount,
      kinds: kindCount,
      variants: variantCount,
      fullCounts: '灯笼 5/5 · 明信片 5/5',
      fullStatus,
      canvasPlaceAndRemove: true,
      cameraDragSafe: true,
    },
    touch: {
      viewport: '390x844',
      overflow,
      anchorTarget: anchorSizes[0],
      placed: '灯笼 1/5 · 明信片 0/5',
    },
    screenshots: [
      `${evidenceDir}/fr08-decor-desktop.png`,
      `${evidenceDir}/fr08-decor-touch.png`,
    ],
    errors,
  }, null, 2));
} finally {
  if (browser) await browser.close();
  server.kill();
}