import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('.', import.meta.url));
const pageUrl = 'http://127.0.0.1:5205/friend3-card-game-preview.html';
const evidenceDir = 'C:/Users/99243/AppData/Local/Temp';
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'preview', '--config', 'friend3-vite.fr05-preview.config.ts'],
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
  throw new Error(`FR-05 preview server did not start.\n${serverOutput}`);
}

async function cardSymbols(page) {
  return page.$$eval('#board .f3-card', cards => cards.map(card => ({
    index: Number(card.dataset.index),
    symbol: card.dataset.symbol,
  })));
}

async function clickPair(page, symbol) {
  const cards = await cardSymbols(page);
  const pair = cards.filter(card => card.symbol === symbol);
  if (pair.length !== 2) throw new Error(`Expected two cards for ${symbol}, got ${pair.length}`);
  await page.locator(`#board .f3-card[data-index="${pair[0].index}"]`).click();
  await page.locator(`#board .f3-card[data-index="${pair[1].index}"]`).click();
  await delay(50);
}

async function completeCozyGame(page) {
  if (await page.locator('#start-screen').isVisible()) {
    await page.locator('[data-difficulty="cozy"]').click();
    await page.locator('#start-button').click();
    await page.waitForSelector('#play-screen:not([hidden])');
  }
  const count = await page.locator('#board .f3-card').count();
  if (count !== 12) throw new Error(`Expected 12 cozy cards, got ${count}`);
  const symbols = [...new Set((await cardSymbols(page)).map(card => card.symbol))];
  for (const symbol of symbols) await clickPair(page, symbol);
  await page.waitForSelector('#win-screen:not([hidden])');
  const summary = await page.textContent('#win-summary');
  if (!summary?.includes('6/6')) throw new Error(`Unexpected win summary: ${summary}`);
  return { count, summary, errors: [] };
}

await waitForServer();
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await desktop.newPage();
  track(page, 'desktop');
  await page.goto(pageUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector('#start-screen:not([hidden])');
  const difficultyCount = await page.locator('.f3-difficulty').count();
  if (difficultyCount !== 3) throw new Error(`Expected 3 difficulties, got ${difficultyCount}`);

  await page.locator('[data-difficulty="cozy"]').click();
  await page.locator('#start-button').click();
  await page.waitForSelector('#play-screen:not([hidden])');
  const firstCard = page.locator('#board .f3-card').first();
  await firstCard.focus();
  await page.keyboard.press('Enter');
  await delay(60);
  const keyboardFaceUp = await firstCard.getAttribute('data-face-up');
  if (keyboardFaceUp !== 'true') throw new Error('Keyboard Enter did not flip the card');
  await page.screenshot({ path: `${evidenceDir}/fr05-board-desktop.png`, fullPage: true });

  await page.locator('#restart-button').click();
  await page.waitForSelector('#play-screen:not([hidden])');
  const restartedCount = await page.locator('#board .f3-card').count();
  if (restartedCount !== 12) throw new Error(`Expected 12 cards after restart, got ${restartedCount}`);
  const restartedPairs = await page.textContent('#hud-pairs');
  if (restartedPairs?.trim() !== '配对 0/6') throw new Error(`Unexpected restart pairs: ${restartedPairs}`);

  const cozy = await completeCozyGame(page);
  await page.screenshot({ path: `${evidenceDir}/fr05-win-desktop.png`, fullPage: true });

  await page.locator('#again-button').click();
  await page.waitForSelector('#play-screen:not([hidden])');
  const againCount = await page.locator('#board .f3-card').count();
  if (againCount !== 12) throw new Error(`Expected 12 cards after replay, got ${againCount}`);
  const againPairs = await page.textContent('#hud-pairs');
  if (againPairs?.trim() !== '配对 0/6') throw new Error(`Unexpected replay pairs: ${againPairs}`);

  await page.locator('#exit-button').click();
  await page.waitForSelector('#start-screen:not([hidden])');
  const afterExitCards = await page.locator('#board .f3-card').count();
  if (afterExitCards !== 0) throw new Error(`Expected empty board after exit, got ${afterExitCards}`);

  const touch = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });
  const touchPage = await touch.newPage();
  track(touchPage, 'touch');
  await touchPage.goto(pageUrl, { waitUntil: 'networkidle' });
  await touchPage.waitForSelector('#start-screen:not([hidden])');
  await touchPage.locator('[data-difficulty="blizzard"]').tap();
  await touchPage.locator('#start-button').tap();
  await touchPage.waitForSelector('#play-screen:not([hidden])');
  const touchCount = await touchPage.locator('#board .f3-card').count();
  if (touchCount !== 20) throw new Error(`Expected 20 blizzard cards, got ${touchCount}`);
  const overflow = await touchPage.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) throw new Error(`Touch layout overflows by ${overflow}px`);
  const cardSizes = await touchPage.$$eval('#board .f3-card', cards => cards.map(card => {
    const rect = card.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }));
  if (cardSizes.some(size => size.width < 44 || size.height < 44)) {
    throw new Error(`Touch target below 44px: ${JSON.stringify(cardSizes[0])}`);
  }
  const touchCards = await cardSymbols(touchPage);
  const first = touchCards[0];
  const mate = touchCards.find(card => card.symbol === first.symbol && card.index !== first.index);
  if (!mate) throw new Error('Touch pair not found');
  await touchPage.locator(`#board .f3-card[data-index="${first.index}"]`).tap();
  await touchPage.locator(`#board .f3-card[data-index="${mate.index}"]`).tap();
  await delay(80);
  const touchPairs = await touchPage.textContent('#hud-pairs');
  if (touchPairs?.trim() !== '配对 1/10') throw new Error(`Unexpected touch pairs: ${touchPairs}`);
  await touchPage.screenshot({ path: `${evidenceDir}/fr05-board-touch.png`, fullPage: true });

  if (errors.length) throw new Error(`Browser errors:\n${errors.join('\n')}`);

  console.log(JSON.stringify({
    ok: true,
    desktop: {
      difficulties: difficultyCount,
      keyboardFlip: keyboardFaceUp === 'true',
      restartCards: restartedCount,
      cozyCards: cozy.count,
      winSummary: cozy.summary,
      replayCards: againCount,
      exitCards: afterExitCards,
    },
    touch: {
      viewport: '390x844',
      blizzardCards: touchCount,
      overflow,
      card: cardSizes[0],
      pairsAfterOneMatch: touchPairs?.trim(),
    },
    screenshots: [
      `${evidenceDir}/fr05-board-desktop.png`,
      `${evidenceDir}/fr05-win-desktop.png`,
      `${evidenceDir}/fr05-board-touch.png`,
    ],
    errors,
  }, null, 2));
} finally {
  if (browser) await browser.close();
  server.kill();
}