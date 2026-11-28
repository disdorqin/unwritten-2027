import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('.', import.meta.url));
const pageUrl = 'http://127.0.0.1:5219/friend3-weather-audio-preview.html';
const evidenceDir = 'C:/Users/99243/AppData/Local/Temp';
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'preview', '--config', 'friend3-vite.weather-audio-preview.config.ts'],
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
  throw new Error(`Night-F3 preview server did not start.\n${serverOutput}`);
}

function audioContextScript() {
  window.__f3wContexts = 0;
  const Original = window.AudioContext;
  if (Original) {
    window.AudioContext = new Proxy(Original, {
      construct(target, args, newTarget) {
        window.__f3wContexts += 1;
        return Reflect.construct(target, args, newTarget);
      },
    });
  }
}

async function contexts(page) {
  return page.evaluate(() => window.__f3wContexts ?? 0);
}

async function debugState(page) {
  return page.evaluate(() => window.__friend3WeatherAudioPreview?.getState());
}

async function debugTargets(page) {
  return page.evaluate(() => window.__friend3WeatherAudioPreview?.getTargets());
}

async function setRange(page, selector, value) {
  await page.locator(selector).evaluate((element, next) => {
    const input = element;
    input.value = String(next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

await waitForServer();
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await desktop.addInitScript(audioContextScript);
  const page = await desktop.newPage();
  track(page, 'desktop');
  await page.goto(pageUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector('#weather-start');
  const contextsBefore = await contexts(page);
  if (contextsBefore !== 0) throw new Error(`AudioContext was created before a gesture: ${contextsBefore}`);
  if ((await debugState(page))?.weights.town !== 1) throw new Error('Initial town weight is not 1');

  await page.locator('#weather-start').click();
  await delay(300);
  const contextsAfter = await contexts(page);
  if (contextsAfter < 1) throw new Error('AudioContext did not start');
  if (!(await page.evaluate(() => window.__friend3WeatherAudioPreview?.isStarted()))) {
    throw new Error('Weather audio did not report started');
  }
  const mountainBefore = (await debugTargets(page))?.regions.mountain ?? 0;

  await page.locator('.f3w-preset[data-region="mountain"]').click();
  await delay(300);
  const mountainState = await debugState(page);
  if (!mountainState || mountainState.weights.mountain < 0.99) throw new Error(`Mountain preset failed: ${JSON.stringify(mountainState)}`);
  const mountainTarget = (await debugTargets(page))?.regions.mountain ?? 0;
  if (mountainTarget <= mountainBefore) throw new Error('Mountain target gain did not rise');

  await setRange(page, '#weather-indoor', 100);
  await delay(300);
  const indoorState = await debugState(page);
  const indoorTargets = await debugTargets(page);
  if (indoorState?.indoor !== 1) throw new Error(`Indoor did not apply: ${indoorState?.indoor}`);
  if ((indoorTargets?.regions.mountain ?? 0) >= mountainTarget) throw new Error('Indoor did not attenuate mountain gain');

  await setRange(page, '#weather-wind', 100);
  await setRange(page, '#weather-snow', 100);
  await delay(250);
  const weatherState = await debugState(page);
  if (weatherState?.wind !== 1 || weatherState?.snow !== 1) throw new Error(`Weather sliders failed: ${JSON.stringify(weatherState)}`);

  await page.locator('#weather-mute').click();
  await delay(250);
  const mutedTargets = await debugTargets(page);
  if ((mutedTargets?.regions.mountain ?? 1) !== 0 || (mutedTargets?.snowHiss ?? 1) !== 0) {
    throw new Error('Mute did not zero targets');
  }
  await page.locator('#weather-mute').click();

  await page.locator('[data-accent="chime"]').click();
  await page.locator('[data-accent="ice-crack"]').click();
  await page.locator('[data-accent="rail-clack"]').click();
  await delay(250);
  await page.locator('#weather-apply-field').click();
  await delay(250);
  await page.screenshot({ path: `${evidenceDir}/friend3-weather-desktop.png`, fullPage: true });

  await page.locator('#weather-stop').click();
  await delay(200);
  if ((await debugState(page))?.enabled !== false) throw new Error('Stop did not disable audio');

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
  await touchPage.waitForSelector('#weather-start');
  const touchBefore = await contexts(touchPage);
  if (touchBefore !== 0) throw new Error(`Touch AudioContext was created before a gesture: ${touchBefore}`);
  await touchPage.locator('#weather-start').tap();
  await delay(300);
  if ((await contexts(touchPage)) < 1) throw new Error('Touch AudioContext did not start');
  const overflow = await touchPage.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) throw new Error(`Touch layout overflows by ${overflow}px`);
  const sizes = await touchPage.$$eval('.f3w-startbar button, .f3w-preset, .f3w-accent, .f3w-section button', elements => elements.map(element => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }));
  if (sizes.some(size => size.width < 44 || size.height < 44)) {
    throw new Error(`Touch target below 44px: ${JSON.stringify(sizes[0])}`);
  }
  await touchPage.locator('.f3w-preset[data-region="crater"]').tap();
  await delay(250);
  if ((await debugState(touchPage))?.weights.crater < 0.99) throw new Error('Touch crater preset failed');
  await touchPage.screenshot({ path: `${evidenceDir}/friend3-weather-touch.png`, fullPage: true });

  if (errors.length) throw new Error(`Browser errors:\n${errors.join('\n')}`);

  console.log(JSON.stringify({
    ok: true,
    desktop: {
      contextsBefore,
      contextsAfterFirstStart: contextsAfter,
      mountainTarget,
      indoorTarget: indoorTargets?.regions.mountain,
      wind: weatherState?.wind,
      snow: weatherState?.snow,
      muted: true,
      accents: 3,
      stopped: true,
    },
    touch: {
      viewport: '390x844',
      contextsBefore: touchBefore,
      overflow,
      touchTarget: sizes[0],
      craterWeight: (await debugState(touchPage))?.weights.crater,
    },
    screenshots: [
      `${evidenceDir}/friend3-weather-desktop.png`,
      `${evidenceDir}/friend3-weather-touch.png`,
    ],
    errors,
  }, null, 2));
} finally {
  if (browser) await browser.close();
  server.kill();
}