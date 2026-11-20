import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
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
  let nextSeconds;
  await expect.poll(async () => {
    const shown = (await hud.innerText()).match(roundText)?.[1];
    nextSeconds = shown === undefined ? Number.POSITIVE_INFINITY : Number(shown);
    return nextSeconds;
  }, { timeout: 12_000 }).toBeLessThan(shownSeconds);
  return { gestureAt, shownSeconds, nextSeconds };
}

async function verifyTouchRound(page) {
  await page.addInitScript(() => {
    const proof = { canvasTouches: [], throws: [] };
    Object.defineProperty(window, '__db2TouchProof', { value: proof });
    for (const type of ['pointerdown', 'pointermove', 'pointerup']) {
      document.addEventListener(type, event => {
        if (event.isTrusted && event.pointerType === 'touch' && event.target instanceof HTMLCanvasElement)
          proof.canvasTouches.push({ type, at: event.timeStamp, x: event.clientX, y: event.clientY });
      }, true);
    }
    document.addEventListener('town-snowball', event => {
      const shot = event.detail;
      if (shot.type !== 'throw' || shot.thrower !== 'local' || shot.shotBy !== 'player') return;
      proof.throws.push({
        id: shot.id, scoreable: shot.scoreable, at: performance.now(),
        origin: [shot.origin.x, shot.origin.y, shot.origin.z],
        direction: [shot.dir.x, shot.dir.y, shot.dir.z],
      });
    }, true);
  });
  const controls = await openPractice(page);
  const pad = page.locator('#touch-walk');
  const ammo = page.locator('#snowball-score');
  const meter = page.locator('#snowball-action-meter');
  const position = page.locator('#position');
  const readProof = () => page.evaluate(() => window.__db2TouchProof);
  const readAmmo = async () => Number(/^雪球 (\d+)\/10/.exec(await ammo.innerText())?.[1]);
  function parsePosition(text) {
    const match = /东 ([\d.]+) m · 北 ([\d.]+) m/.exec(text);
    assert.ok(match, text);
    return { east: Number(match[1]), north: Number(match[2]) };
  }
  await wait(pad).toBeVisible();
  await wait(controls.action).toHaveText('开始移动靶练习');
  await wait(ammo).toHaveText(/^雪球 0\/10/);
  const session = await page.context().newCDPSession(page);
  const touch = (type, point) => session.send('Input.dispatchTouchEvent', {
    type, touchPoints: point ? [{ x: point.x, y: point.y, id: 1 }] : [],
  });

  const padBox = await pad.boundingBox();
  assert.ok(padBox);
  const padCenter = { x: padBox.x + padBox.width / 2, y: padBox.y + padBox.height / 2 };
  async function steer(dx, dy, field, threshold) {
    await touch('touchStart', padCenter);
    try {
      await touch('touchMove', { x: padCenter.x + dx, y: padCenter.y + dy });
      await page.waitForFunction(({ field, threshold }) => {
        const text = document.querySelector('#position')?.textContent ?? '';
        const match = /东 ([\d.]+) m · 北 ([\d.]+) m/.exec(text);
        return match && (field === 'east' ? Number(match[1]) >= threshold : Number(match[2]) <= threshold);
      }, { field, threshold }, { timeout: 60_000 });
    } finally {
      await touch('touchEnd');
    }
  }
  // The paved practice marker has no snow. Walk to the existing southern supply pile.
  await steer(0, 27, 'north', 158.5);
  await steer(27, 0, 'east', 233);
  const atSupply = await position.innerText();
  const supplyPose = parsePosition(atSupply);
  const east = 233 - supplyPose.east, north = 160 - supplyPose.north;
  const range = Math.hypot(east, north);
  assert.ok(north > 0 && range >= .8 && range <= 2.1, atSupply);

  const box = await controls.canvas.boundingBox();
  assert.ok(box);
  const aimPoint = { x: Math.round(box.x + box.width * .69), y: Math.round(box.y + box.height * .35) };
  assert.equal(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, aimPoint), 'CANVAS');
  const downYaw = Math.atan2(east, north);
  const downPitch = Math.atan2(.27 - 1.57, range) - .09;
  // One deliberate hold before the drag leaves the stable 100 ms touch-look response.
  const focal = box.height / (2 * Math.tan(29 * Math.PI / 180));
  let gain = 1.4;
  let scoopPoint;
  for (let i = 0; i < 8; i++) {
    const dx = Math.tan(downYaw / gain) * focal;
    const dy = -Math.tan(downPitch / gain) * focal;
    const speed = Math.hypot(dx, dy) * 10;
    gain = 1.4 * (1 + .9 * speed / (speed + 850));
    scoopPoint = { x: Math.round(aimPoint.x + dx), y: Math.round(aimPoint.y + dy) };
  }
  assert.ok(scoopPoint.x >= box.x && scoopPoint.x < box.x + box.width &&
    scoopPoint.y < box.y + box.height, 'The native down-look gesture must stay inside the viewport');
  await touch('touchStart', aimPoint);
  try {
    await page.waitForTimeout(225);
    await touch('touchMove', scoopPoint);
    await wait(meter).toHaveAttribute('aria-label', '攒雪球进度');
    await expect.poll(readAmmo, { timeout: 45_000 }).toBeGreaterThanOrEqual(1);
  } finally {
    await touch('touchEnd');
  }
  const gatheredAmmo = await readAmmo();
  const afterGather = await readProof();
  assert.equal(afterGather.throws.length, 0, 'Letting go over snow must retain the ammunition');
  assert.equal(afterGather.canvasTouches[0]?.type, 'pointerdown');
  assert.equal(afterGather.canvasTouches.at(-1)?.type, 'pointerup');
  assert.ok(afterGather.canvasTouches.some(event => event.type === 'pointermove' &&
    event.at - afterGather.canvasTouches[0].at >= 150));

  const destinations = page.locator('#jump');
  await destinations.selectOption({ label: '广场南侧' });
  await destinations.selectOption({ label: sceneLabel });
  await wait(controls.action).toHaveText('开始移动靶练习');
  const shooter = parsePosition(await position.innerText());
  assert.ok(Math.abs(shooter.east - 223) <= .25 && Math.abs(shooter.north - 163) <= .75,
    `The practice start must be near E223/N163. Received E${shooter.east}/N${shooter.north}`);
  const round = await beginRound(controls, () => controls.action.tap());
  const startingAmmo = await readAmmo();
  assert.equal(startingAmmo, gatheredAmmo);
  await touch('touchStart', aimPoint);
  try {
    await wait(meter).toHaveAttribute('aria-label', '瞄准雪球');
    await wait(meter).toBeVisible();
    await touch('touchMove', { x: aimPoint.x + 24, y: aimPoint.y });
  } finally {
    await touch('touchEnd');
  }
  await expect.poll(async () => (await readProof()).throws.length, { timeout: 30_000 }).toBe(1);
  await expect.poll(readAmmo, { timeout: 30_000 }).toBe(startingAmmo - 1);
  const { canvasTouches, throws: [shot] } = await readProof();
  const aimingTouches = canvasTouches.slice(afterGather.canvasTouches.length);
  assert.equal(aimingTouches[0]?.type, 'pointerdown');
  assert.equal(aimingTouches.at(-1)?.type, 'pointerup');
  assert.ok(aimingTouches.some(event => event.type === 'pointermove' && event.x > aimingTouches[0].x));
  assert.ok(shot.at >= aimingTouches.at(-1).at);
  assert.ok(shot.scoreable && Math.abs(shot.origin[0] - shooter.east) < .15 &&
    Math.abs(shot.origin[2] + shooter.north) < .15);
  assert.ok(Math.atan2(shot.direction[0], -shot.direction[2]) > .02, 'Touch drag must steer the actual projectile');

  await expect(controls.notice).toHaveText(/^移动靶结算 · 命中 [01]$/, { timeout: 85_000 });
  const elapsedMs = Math.round(performance.now() - round.gestureAt);
  assert.ok(elapsedMs >= 59_000, `Touch round settled too early after ${elapsedMs} ms`);
  await wait(controls.hud).toBeHidden();
  await wait(controls.action).toBeVisible();
  await session.detach();
  return {
    tapStartedRound: true, shownSeconds: round.shownSeconds, nextSeconds: round.nextSeconds,
    gather: { atSupply, ammunition: gatheredAmmo, touches: afterGather.canvasTouches },
    throw: { shooter, shot, touches: aimingTouches, remainingAmmo: await readAmmo() },
    settled: true, elapsedMs, notice: await controls.notice.innerText(),
  };
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
    const record = { name, route: route.href, pageErrors, ...evidence };
    const json = JSON.stringify(record, null, 2);
    await writeFile(join(artifacts, `${name}.json`), `${json}\n`);
    console.log(json);
    // Keep the timed input proof independent of the software compositor.
    await page.screenshot({ path: join(artifacts, `${name}-result.png`), timeout: 5000 })
      .catch(error => console.warn(`${name} screenshot unavailable: ${error.message}`));
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
    const { gestureAt, shownSeconds, nextSeconds } = await beginRound(controls, () => page.keyboard.press('e'));
    await expect(controls.notice).toHaveText('移动靶结算 · 命中 0', { timeout: 85_000 });
    const elapsedMs = Math.round(performance.now() - gestureAt);
    assert.ok(elapsedMs >= 59_000, `Round settled too early after ${elapsedMs} ms`);
    await wait(controls.hud).toBeHidden();
    await wait(controls.action).toBeVisible();
    return { settled: true, elapsedMs, shownSeconds, nextSeconds, notice: await controls.notice.innerText() };
  });
  await runContext(browser, 'touch', devices['Pixel 7'], verifyTouchRound);
} finally {
  await browser.close();
}
