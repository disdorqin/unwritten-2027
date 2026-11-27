import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('.', import.meta.url));
const pageUrl = 'http://127.0.0.1:5217/friend2-accessibility-preview.html';
const evidenceDir = 'C:/Users/99243/AppData/Local/Temp';
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'preview', '--config', 'friend2-vite.fr09-preview.config.ts'],
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
  throw new Error(`FR-09 preview server did not start.\n${serverOutput}`);
}

async function demoStyle(page) {
  return page.evaluate(() => {
    const demo = document.querySelector('#a11y-demo');
    const copy = document.querySelector('.a11y-copy');
    const button = document.querySelector('.a11y-sample-button');
    if (!(demo instanceof HTMLElement) || !(copy instanceof HTMLElement) || !(button instanceof HTMLElement)) {
      return undefined;
    }
    const demoStyle = getComputedStyle(demo);
    const copyStyle = getComputedStyle(copy);
    const buttonStyle = getComputedStyle(button);
    return {
      theme: demo.dataset.theme,
      text: demo.dataset.text,
      touch: demo.dataset.touch,
      background: demoStyle.backgroundColor,
      font: copyStyle.fontSize,
      buttonHeight: button.getBoundingClientRect().height,
    };
  });
}

await waitForServer();
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await desktop.newPage();
  track(page, 'desktop');
  await page.goto(pageUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector('#a11y-demo');
  const themeCount = await page.locator('#a11y-themes .f2-a11y-option').count();
  const textCount = await page.locator('#a11y-texts .f2-a11y-option').count();
  const touchCount = await page.locator('#a11y-touches .f2-a11y-option').count();
  if (themeCount !== 3 || textCount !== 4 || touchCount !== 3) {
    throw new Error(`Unexpected option counts: ${themeCount}/${textCount}/${touchCount}`);
  }

  const initial = await demoStyle(page);
  if (!initial || initial.theme !== 'night' || initial.font !== '14px' || initial.buttonHeight < 44) {
    throw new Error(`Unexpected default demo style: ${JSON.stringify(initial)}`);
  }

  await page.locator('#a11y-themes [data-theme="contrast"]').click();
  await delay(300);
  const contrast = await demoStyle(page);
  if (contrast?.background === initial.background || contrast?.theme !== 'contrast') {
    throw new Error(`Contrast theme did not apply: ${JSON.stringify(contrast)}`);
  }

  await page.locator('#a11y-texts [data-scale="1.5"]').click();
  await delay(300);
  const largeText = await demoStyle(page);
  if (!largeText || parseFloat(largeText.font) <= parseFloat(initial.font)) throw new Error(`Text scale did not increase: ${largeText?.font}`);

  await page.locator('#a11y-touches [data-touch="xlarge"]').click();
  await delay(300);
  const largeTouch = await demoStyle(page);
  if (!largeTouch || largeTouch.buttonHeight <= initial.buttonHeight || largeTouch.buttonHeight < 58) throw new Error(`Touch size did not increase: ${largeTouch?.buttonHeight}`);

  await page.locator('#a11y-primary').focus();
  await page.keyboard.press('Enter');
  await delay(300);
  const countText = (await page.textContent('#a11y-click-count'))?.trim();
  if (countText !== '1 次操作') throw new Error(`Keyboard activation failed: ${countText}`);

  await page.locator('#a11y-reset').click();
  await delay(300);
  const reset = await demoStyle(page);
  if (!reset || reset.theme !== 'night' || parseFloat(reset.font) !== parseFloat(initial.font) || reset.buttonHeight < 44) {
    throw new Error(`Reset failed: ${JSON.stringify(reset)}`);
  }
  if ((await page.textContent('#a11y-click-count'))?.trim() !== '0 次操作') throw new Error('Reset count failed');
  await page.screenshot({ path: `${evidenceDir}/fr09-a11y-desktop.png`, fullPage: true });

  const touch = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });
  const touchPage = await touch.newPage();
  track(touchPage, 'touch');
  await touchPage.goto(pageUrl, { waitUntil: 'networkidle' });
  await touchPage.waitForSelector('#a11y-demo');
  const overflow = await touchPage.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) throw new Error(`Touch layout overflows by ${overflow}px`);
  const sizes = await touchPage.$$eval('.f2-a11y-option, .f2-a11y-reset, .a11y-sample-button', elements => elements.map(element => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }));
  if (sizes.some(size => size.width < 44 || size.height < 44)) {
    throw new Error(`Touch target below 44px: ${JSON.stringify(sizes[0])}`);
  }
  await touchPage.locator('#a11y-themes [data-theme="day"]').tap();
  await delay(300);
  const touchTheme = await touchPage.getAttribute('#a11y-demo', 'data-theme');
  if (touchTheme !== 'day') throw new Error(`Touch theme failed: ${touchTheme}`);
  await touchPage.screenshot({ path: `${evidenceDir}/fr09-a11y-touch.png`, fullPage: true });

  if (errors.length) throw new Error(`Browser errors:\n${errors.join('\n')}`);

  console.log(JSON.stringify({
    ok: true,
    desktop: {
      themes: themeCount,
      textScales: textCount,
      touchSizes: touchCount,
      initial,
      contrast: contrast?.theme,
      largeText: largeText?.font,
      largeTouch: largeTouch?.buttonHeight,
      keyboardEnter: countText,
      reset: reset?.theme,
    },
    touch: {
      viewport: '390x844',
      overflow,
      touchTarget: sizes[0],
      theme: touchTheme,
    },
    screenshots: [
      `${evidenceDir}/fr09-a11y-desktop.png`,
      `${evidenceDir}/fr09-a11y-touch.png`,
    ],
    errors,
  }, null, 2));
} finally {
  if (browser) await browser.close();
  server.kill();
}