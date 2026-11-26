import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('.', import.meta.url));
const pageUrl = 'http://127.0.0.1:5215/friend2-photo-preview.html';
const evidenceDir = 'C:/Users/99243/AppData/Local/Temp';
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'preview', '--config', 'friend2-vite.fr04-preview.config.ts'],
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
  throw new Error(`FR-04 preview server did not start.\n${serverOutput}`);
}

async function canvasSignature(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('#photo-canvas');
    if (!(canvas instanceof HTMLCanvasElement)) return 0;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 0;
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 2166136261;
    for (let index = 0; index < pixels.length; index += 97) {
      hash = Math.imul(hash ^ pixels[index], 16777619) >>> 0;
    }
    return hash;
  });
}

await waitForServer();
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await desktop.newPage();
  track(page, 'desktop');
  await page.goto(pageUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector('#photo-canvas');
  const frameCount = await page.locator('.f2-frame').count();
  if (frameCount !== 3) throw new Error(`Expected 3 frames, got ${frameCount}`);

  const pngBase64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 800;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    const sky = ctx.createLinearGradient(0, 0, 0, 800);
    sky.addColorStop(0, '#16283c');
    sky.addColorStop(1, '#eef5fb');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 1200, 800);
    ctx.fillStyle = '#c05b4d';
    ctx.fillRect(420, 280, 360, 220);
    ctx.fillStyle = '#ffcf77';
    ctx.fillRect(500, 340, 80, 80);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.setInputFiles('#photo-input', {
    name: 'sample.png',
    mimeType: 'image/png',
    buffer: Buffer.from(pngBase64, 'base64'),
  });
  await page.waitForFunction(() => document.querySelector('#photo-status')?.textContent?.includes('已载入'));
  const loaded = await canvasSignature(page);
  if (!loaded) throw new Error('Photo canvas is empty after load');

  await page.locator('[data-frame="snow-night"]').click();
  await delay(100);
  const framed = await canvasSignature(page);
  if (framed === loaded) throw new Error('Frame change did not redraw the canvas');

  await page.locator('#date-toggle').click();
  await delay(100);
  const withoutDate = await canvasSignature(page);
  if (withoutDate === framed) throw new Error('Date toggle did not redraw the canvas');
  await page.locator('#date-toggle').click();

  await page.locator('#nickname-input').fill('阿雪');
  await delay(100);
  const renamed = await canvasSignature(page);
  if (renamed === withoutDate) throw new Error('Nickname change did not redraw the canvas');

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#save-button').click();
  const download = await downloadPromise;
  const filename = download.suggestedFilename();
  if (!filename.startsWith('unwritten-photo-')) throw new Error(`Unexpected download: ${filename}`);
  await page.screenshot({ path: `${evidenceDir}/fr04-photo-desktop.png`, fullPage: true });

  await page.locator('#reset-button').click();
  await delay(100);
  if ((await page.getAttribute('[data-frame="warm-wood"]', 'aria-pressed')) !== 'true') {
    throw new Error('Reset did not restore the default frame');
  }

  const touch = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
    acceptDownloads: true,
  });
  const touchPage = await touch.newPage();
  track(touchPage, 'touch');
  await touchPage.goto(pageUrl, { waitUntil: 'networkidle' });
  await touchPage.waitForSelector('#photo-canvas');
  const overflow = await touchPage.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) throw new Error(`Touch layout overflows by ${overflow}px`);
  const sizes = await touchPage.$$eval('.f2-frame, .f2-primary, .f2-upload', elements => elements.map(element => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }));
  if (sizes.some(size => size.width < 44 || size.height < 44)) {
    throw new Error(`Touch target below 44px: ${JSON.stringify(sizes[0])}`);
  }
  await touchPage.locator('[data-frame="lantern-glow"]').tap();
  await delay(100);
  if ((await touchPage.getAttribute('[data-frame="lantern-glow"]', 'aria-pressed')) !== 'true') {
    throw new Error('Touch frame selection failed');
  }
  await touchPage.screenshot({ path: `${evidenceDir}/fr04-photo-touch.png`, fullPage: true });

  if (errors.length) throw new Error(`Browser errors:\n${errors.join('\n')}`);

  console.log(JSON.stringify({
    ok: true,
    desktop: {
      frames: frameCount,
      upload: 'sample.png',
      frameChange: true,
      dateToggle: true,
      nickname: '阿雪',
      download: filename,
      reset: true,
    },
    touch: {
      viewport: '390x844',
      overflow,
      touchTarget: sizes[0],
      frameSelected: 'lantern-glow',
    },
    screenshots: [
      `${evidenceDir}/fr04-photo-desktop.png`,
      `${evidenceDir}/fr04-photo-touch.png`,
    ],
    errors,
  }, null, 2));
} finally {
  if (browser) await browser.close();
  server.kill();
}