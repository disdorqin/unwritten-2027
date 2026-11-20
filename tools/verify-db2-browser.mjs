import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const require = createRequire(join(process.cwd(), 'package.json'));
const { chromium, devices, expect } = require('@playwright/test');
const route = new URL(process.env.DB2_BROWSER_URL ?? 'http://127.0.0.1:4173/town-blockout.html');
const artifacts = resolve(process.env.DB2_BROWSER_ARTIFACTS ?? 'db2-browser-artifacts');
const wait = expect.configure({ timeout: 45_000 });
const roundText = /^移动靶场 · (\d+) 秒 · 命中 0$/;
const actionText = /^(?:E · )?开始移动靶练习$/;
const sceneLabel = '雪团练习场';

async function openPractice(page) {
  const response = await page.goto(route.href, { waitUntil: 'domcontentloaded', timeout: 150_000 });
  assert.ok(response?.ok(), `Town page returned ${response?.status() ?? 'no response'}`);
  await wait(page.locator('#scene canvas')).toBeVisible();
  await page.locator('#quality-tier').selectOption('smooth');
  const destination = page.locator('#jump');
  await wait(destination.locator('option').filter({ hasText: sceneLabel })).toHaveCount(1);
  await destination.selectOption({ label: sceneLabel });
  await wait(page.locator('#walk')).toHaveAttribute('aria-pressed', 'true');

  const canvas = page.locator('#scene canvas');
  const action = page.locator('#world-action').filter({ hasText: actionText });
  const hud = page.locator('#snow-practice-status');
  const notice = page.locator('#town-activity-status');
  await wait(page.locator('#snowball-controls')).toBeVisible();
  await wait(action).toBeVisible();
  await wait(hud).toBeHidden();
  return { canvas, action, hud, notice };
}

async function beginRound(controls, start) {
  const { action, hud } = controls;
  const gestureAt = performance.now();
  await start();
  await wait(hud).toBeVisible();
  await wait(hud).toHaveText(roundText);
  const shownSeconds = Number((await hud.innerText()).match(roundText)?.[1]);
  assert.ok(shownSeconds >= 50 && shownSeconds <= 60, `Unexpected opening countdown: ${shownSeconds}`);
  await wait(action).toBeHidden();
  await expect.poll(async () => {
    const shown = (await hud.innerText()).match(roundText)?.[1];
    return shown === undefined ? Number.POSITIVE_INFINITY : Number(shown);
  }, { timeout: 12_000 }).toBeLessThan(shownSeconds);
  return gestureAt;
}

async function runContext(browser, name, options, verify) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  page.setDefaultTimeout(45_000);
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.stack ?? error.message));
  try {
    const evidence = await verify(page);
    assert.deepEqual(pageErrors, [], 'Uncaught page errors');
    console.log(JSON.stringify({ name, route: route.href, ...evidence }));
  } catch (error) {
    if (pageErrors.length) console.error(pageErrors.join('\n'));
    await page.screenshot({ path: join(artifacts, `${name}-failure.png`), timeout: 10_000 }).catch(() => {});
    throw error;
  } finally {
    await context.close();
  }
}

await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  await runContext(browser, 'desktop', { viewport: { width: 1024, height: 768 } }, async page => {
    const controls = await openPractice(page);
    await wait(controls.action).toHaveText('E · 开始移动靶练习');
    await controls.canvas.focus();
    const gestureAt = await beginRound(controls, () => page.keyboard.press('e'));
    await page.screenshot({ path: join(artifacts, 'desktop-active.png'), timeout: 15_000 });
    await expect(controls.notice).toHaveText('移动靶结算 · 命中 0', { timeout: 85_000 });
    const elapsedMs = Math.round(performance.now() - gestureAt);
    assert.ok(elapsedMs >= 59_000, `Round settled too early after ${elapsedMs} ms`);
    await wait(controls.hud).toBeHidden();
    await wait(controls.action).toBeVisible();
    await page.screenshot({ path: join(artifacts, 'desktop-settled.png'), timeout: 15_000 });
    return { settled: true, elapsedMs };
  });
  await runContext(browser, 'touch', devices['Pixel 7'], async page => {
    const controls = await openPractice(page);
    await wait(page.locator('#touch-walk')).toBeVisible();
    await wait(controls.action).toHaveText('开始移动靶练习');
    await beginRound(controls, () => controls.action.tap());
    await page.screenshot({ path: join(artifacts, 'touch-active.png'), timeout: 15_000 });
    return { tapStartedRound: true };
  });
} finally {
  await browser.close();
}
