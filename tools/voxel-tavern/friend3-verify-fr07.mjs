import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('.', import.meta.url));
const pageUrl = 'http://127.0.0.1:5207/friend3-audio-preview.html';
const evidenceDir = 'C:/Users/99243/AppData/Local/Temp';
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'preview', '--config', 'vite.fr07-preview.config.ts'],
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
  throw new Error(`FR-07 preview server did not start.\n${serverOutput}`);
}

function audioContextScript() {
  window.__fr07Contexts = 0;
  const Original = window.AudioContext;
  if (Original) {
    window.AudioContext = new Proxy(Original, {
      construct(target, args, newTarget) {
        window.__fr07Contexts += 1;
        return Reflect.construct(target, args, newTarget);
      },
    });
  }
}

async function contexts(page) {
  return page.evaluate(() => window.__fr07Contexts ?? 0);
}

async function assertStopped(page, soundId) {
  const playing = await page.getAttribute(`[data-sound="${soundId}"]`, 'data-playing');
  const state = await page.textContent(`[data-sound="${soundId}"] .f3-sound-state`);
  if (playing !== 'false' || state?.trim() !== '待试听') {
    throw new Error(`${soundId} did not stop: ${playing} / ${state}`);
  }
}

await waitForServer();
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await desktop.addInitScript(audioContextScript);
  const page = await desktop.newPage();
  track(page, 'desktop');
  await page.goto(pageUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector('.f3-sound');
  const soundCount = await page.locator('.f3-sound').count();
  if (soundCount !== 6) throw new Error(`Expected 6 sounds, got ${soundCount}`);
  const contextsBefore = await contexts(page);
  if (contextsBefore !== 0) throw new Error(`AudioContext was created before a gesture: ${contextsBefore}`);

  await page.locator('[data-sound="wind-chime"] .f3-sound-play').click();
  await delay(350);
  const contextsAfter = await contexts(page);
  const windPlaying = await page.getAttribute('[data-sound="wind-chime"]', 'data-playing');
  const windState = await page.textContent('[data-sound="wind-chime"] .f3-sound-state');
  if (contextsAfter < 1) throw new Error('AudioContext did not start on first play');
  if (windPlaying !== 'true' || windState?.trim() !== '播放中') {
    throw new Error(`Wind chime did not start: ${windPlaying} / ${windState}`);
  }
  await page.screenshot({ path: `${evidenceDir}/fr07-audio-desktop.png`, fullPage: true });

  await page.locator('[data-sound="wind-chime"] .f3-sound-play').click();
  await delay(250);
  await assertStopped(page, 'wind-chime');

  await page.locator('[data-sound="stove"] .f3-sound-loop').click();
  await page.locator('[data-sound="stove"] .f3-sound-play').click();
  await delay(450);
  const stoveState = await page.textContent('[data-sound="stove"] .f3-sound-state');
  if (stoveState?.trim() !== '循环中') throw new Error(`Stove did not loop: ${stoveState}`);
  await page.locator('[data-sound="stove"] .f3-sound-play').click();
  await delay(300);
  await assertStopped(page, 'stove');

  await page.locator('#volume').evaluate(element => {
    const input = element;
    input.value = '30';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await delay(100);
  const volumeText = (await page.textContent('#volume-value'))?.trim();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('unwritten.friend3.audio.v1') ?? 'null'));
  if (volumeText !== '30' || stored?.volume !== 30) {
    throw new Error(`Volume not applied or persisted: ${volumeText} / ${JSON.stringify(stored)}`);
  }

  await page.locator('#mute').click();
  await delay(80);
  const muted = await page.getAttribute('#mute', 'aria-pressed');
  const muteText = (await page.textContent('#mute'))?.trim();
  if (muted !== 'true' || muteText !== '取消静音') throw new Error(`Mute failed: ${muted} / ${muteText}`);
  await page.locator('#mute').click();
  await delay(80);
  if ((await page.getAttribute('#mute', 'aria-pressed')) !== 'false') throw new Error('Unmute failed');

  await page.locator('[data-sound="wood-step"] .f3-sound-play').click();
  await page.locator('[data-sound="snow-step"] .f3-sound-play').click();
  await delay(150);
  await page.locator('#stop-all').click();
  await delay(300);
  await assertStopped(page, 'wood-step');
  await assertStopped(page, 'snow-step');

  const touch = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });
  await touch.addInitScript(audioContextScript);
  const touchPage = await touch.newPage();
  track(touchPage, 'touch');
  await touchPage.goto(pageUrl, { waitUntil: 'networkidle' });
  await touchPage.waitForSelector('.f3-sound');
  const overflow = await touchPage.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) throw new Error(`Touch layout overflows by ${overflow}px`);
  const touchTargets = await touchPage.$$eval('.f3-sound-actions button', buttons => buttons.map(button => {
    const rect = button.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }));
  if (touchTargets.some(size => size.width < 44 || size.height < 44)) {
    throw new Error(`Touch target below 44px: ${JSON.stringify(touchTargets[0])}`);
  }
  const touchBefore = await contexts(touchPage);
  if (touchBefore !== 0) throw new Error(`Touch AudioContext was created before a gesture: ${touchBefore}`);
  await touchPage.locator('[data-sound="wood-door"] .f3-sound-play').tap();
  await delay(350);
  if ((await contexts(touchPage)) < 1) throw new Error('Touch AudioContext did not start');
  const touchPlaying = await touchPage.getAttribute('[data-sound="wood-door"]', 'data-playing');
  if (touchPlaying !== 'true') throw new Error('Touch play did not start');
  await touchPage.screenshot({ path: `${evidenceDir}/fr07-audio-touch.png`, fullPage: true });

  if (errors.length) throw new Error(`Browser errors:\n${errors.join('\n')}`);

  console.log(JSON.stringify({
    ok: true,
    desktop: {
      sounds: soundCount,
      contextsBefore,
      contextsAfterFirstPlay: contextsAfter,
      windChime: windState?.trim(),
      stoveLoop: stoveState?.trim(),
      volume: volumeText,
      muted,
      stopAll: true,
    },
    touch: {
      viewport: '390x844',
      overflow,
      touchTarget: touchTargets[0],
      contextsBefore: touchBefore,
      woodDoorPlaying: touchPlaying,
    },
    screenshots: [
      `${evidenceDir}/fr07-audio-desktop.png`,
      `${evidenceDir}/fr07-audio-touch.png`,
    ],
    errors,
  }, null, 2));
} finally {
  if (browser) await browser.close();
  server.kill();
}