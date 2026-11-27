import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('.', import.meta.url));
const pageUrl = 'http://127.0.0.1:5216/friend2-guide-preview.html';
const evidenceDir = 'C:/Users/99243/AppData/Local/Temp';
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'preview', '--config', 'friend2-vite.fr06-preview.config.ts'],
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
    if (message.text().includes('favicon') || message.text().includes('Failed to load resource')) return;
    errors.push(`${label} console: ${message.text()}`);
  });
  page.on('response', response => {
    if (response.status() < 400 || response.url().includes('favicon')) return;
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
  throw new Error(`FR-06 preview server did not start.\n${serverOutput}`);
}

async function cardCount(page) {
  return page.locator('.f2-guide-card').count();
}

await waitForServer();
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await desktop.newPage();
  track(page, 'desktop');
  await page.goto(pageUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector('.f2-guide-card');
  const initial = await cardCount(page);
  if (initial < 12) throw new Error(`Expected at least 12 guide entries, got ${initial}`);
  const initialCount = (await page.textContent('#guide-count'))?.trim();
  if (!initialCount?.includes('规划')) throw new Error(`Planned count missing: ${initialCount}`);

  await page.locator('#guide-search').fill('大钟楼');
  await delay(100);
  if ((await cardCount(page)) !== 1) throw new Error('Keyword search did not narrow to one card');
  await page.locator('#guide-search').fill('');
  await delay(100);

  await page.locator('[data-category="controls"]').click();
  await delay(100);
  const controls = await cardCount(page);
  if (controls < 2) throw new Error(`Controls filter too small: ${controls}`);
  await page.locator('[data-category="all"]').click();
  await delay(100);

  const firstCard = page.locator('.f2-guide-card').first();
  await firstCard.click();
  await delay(100);
  const detailTitle = (await page.textContent('#guide-detail h2'))?.trim();
  if (!detailTitle) throw new Error('Detail title did not render');
  const detailText = (await page.textContent('#guide-detail'))?.trim() ?? '';
  if (!detailText.includes('怎么看 / 怎么去')) throw new Error('Detail how-to missing');
  await page.screenshot({ path: `${evidenceDir}/fr06-guide-desktop.png`, fullPage: true });

  await page.getByRole('button', { name: '返回列表' }).click();
  await delay(100);
  if ((await page.textContent('#guide-detail'))?.includes('返回列表')) throw new Error('Detail did not return to placeholder');

  const touch = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });
  const touchPage = await touch.newPage();
  track(touchPage, 'touch');
  await touchPage.goto(pageUrl, { waitUntil: 'networkidle' });
  await touchPage.waitForSelector('.f2-guide-card');
  const overflow = await touchPage.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) throw new Error(`Touch layout overflows by ${overflow}px`);
  const sizes = await touchPage.$$eval('.f2-guide-card, .f2-guide-category', elements => elements.map(element => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }));
  if (sizes.some(size => size.width < 44 || size.height < 44)) {
    throw new Error(`Touch target below 44px: ${JSON.stringify(sizes[0])}`);
  }
  await touchPage.locator('.f2-guide-card').first().tap();
  await delay(100);
  const touchTitle = (await touchPage.textContent('#guide-detail h2'))?.trim();
  if (!touchTitle) throw new Error('Touch detail did not render');
  await touchPage.screenshot({ path: `${evidenceDir}/fr06-guide-touch.png`, fullPage: true });

  if (errors.length) throw new Error(`Browser errors:\n${errors.join('\n')}`);

  console.log(JSON.stringify({
    ok: true,
    desktop: {
      initialCards: initial,
      initialCount,
      searchClocktower: 1,
      controlsCards: controls,
      detailTitle,
      returned: true,
    },
    touch: {
      viewport: '390x844',
      overflow,
      touchTarget: sizes[0],
      detailTitle: touchTitle,
    },
    screenshots: [
      `${evidenceDir}/fr06-guide-desktop.png`,
      `${evidenceDir}/fr06-guide-touch.png`,
    ],
    errors,
  }, null, 2));
} finally {
  if (browser) await browser.close();
  server.kill();
}