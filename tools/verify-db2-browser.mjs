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

async function verifyTouchRound(page, evidence) {
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
  evidence.stage = 'open the touch practice route';
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
  evidence.pad = padBox;
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
  evidence.stage = 'walk to the southern snow supply';
  await steer(0, 27, 'north', 158.5);
  await steer(27, 0, 'east', 233);
  const atSupply = await position.innerText();
  const supplyPose = parsePosition(atSupply);
  const east = 233 - supplyPose.east, north = 160 - supplyPose.north;
  const range = Math.hypot(east, north);
  evidence.supply = { atSupply, east, north, range };
  assert.ok(north > 0 && range >= .8 && range <= 2.1, atSupply);

  async function canvasGesture(dx, dy) {
    const selection = await controls.canvas.evaluate((canvas, { dx, dy }) => {
      const box = canvas.getBoundingClientRect();
      const left = Math.max(0, box.left);
      const top = Math.max(0, box.top);
      const right = Math.min(innerWidth, box.right);
      const bottom = Math.min(innerHeight, box.bottom);
      // The initial touch belongs on the right half; the entire drag must stay in view.
      const minX = Math.ceil(Math.max(box.left + box.width / 2, left, left - dx) + 1);
      const maxX = Math.floor(Math.min(right, right - dx) - 1);
      const minY = Math.ceil(Math.max(top, top - dy) + 1);
      const maxY = Math.floor(Math.min(bottom, bottom - dy) - 1);
      const search = { minX, maxX, minY, maxY };
      if (minX > maxX || minY > maxY) return { search, blockedBy: ['drag outside visible canvas'] };
      function sampleAxis(min, max) {
        const count = Math.max(1, Math.ceil((max - min) / 12));
        const middle = (min + max) / 2;
        return Array.from({ length: count + 1 }, (_, index) => Math.round(min + (max - min) * index / count))
          .sort((a, b) => Math.abs(a - middle) - Math.abs(b - middle));
      }
      const blockedBy = new Set();
      for (const y of sampleAxis(minY, maxY)) {
        for (const x of sampleAxis(minX, maxX)) {
          const element = document.elementFromPoint(x, y);
          if (element === canvas) return { search, start: { x, y }, end: { x: x + dx, y: y + dy } };
          blockedBy.add(element?.id || element?.tagName || 'no element');
        }
      }
      return { search, blockedBy: [...blockedBy] };
    }, { dx, dy });
    evidence.gestures ??= [];
    evidence.gestures.push({ stage: evidence.stage, dx, dy, ...selection });
    assert.ok(selection.start && selection.end, `No free canvas touch point: ${JSON.stringify(selection)}`);
    return selection;
  }

  evidence.stage = 'scoop with a held touch and drag';
  const box = await controls.canvas.boundingBox();
  assert.ok(box);
  const downYaw = Math.atan2(east, north);
  const downPitch = Math.atan2(.27 - 1.57, range) - .09;
  // One deliberate hold before the drag leaves the stable 100 ms touch-look response.
  const focal = box.height / (2 * Math.tan(29 * Math.PI / 180));
  let gain = 1.4;
  let dx = 0, dy = 0;
  for (let i = 0; i < 8; i++) {
    dx = Math.tan(downYaw / gain) * focal;
    dy = -Math.tan(downPitch / gain) * focal;
    const speed = Math.hypot(dx, dy) * 10;
    gain = 1.4 * (1 + .9 * speed / (speed + 850));
  }
  const scoop = await canvasGesture(Math.round(dx), Math.round(dy));
  await touch('touchStart', scoop.start);
  try {
    await page.waitForTimeout(225);
    await touch('touchMove', scoop.end);
    await wait(meter).toHaveAttribute('aria-label', '攒雪球进度');
    await expect.poll(readAmmo, { timeout: 45_000 }).toBeGreaterThanOrEqual(1);
  } finally {
    await touch('touchEnd');
  }
  const gatheredAmmo = await readAmmo();
  evidence.gatheredAmmo = gatheredAmmo;
  const afterGather = await readProof();
  assert.equal(afterGather.throws.length, 0, 'Letting go over snow must retain the ammunition');
  assert.equal(afterGather.canvasTouches[0]?.type, 'pointerdown');
  assert.equal(afterGather.canvasTouches.at(-1)?.type, 'pointerup');
  assert.ok(afterGather.canvasTouches.some(event => event.type === 'pointermove' &&
    event.at - afterGather.canvasTouches[0].at >= 150));

  const destinations = page.locator('#jump');
  evidence.stage = 'start the round with the touch action';
  await destinations.selectOption({ label: '广场南侧' });
  await destinations.selectOption({ label: sceneLabel });
  await wait(controls.action).toHaveText('开始移动靶练习');
  const shooter = parsePosition(await position.innerText());
  assert.ok(Math.abs(shooter.east - 223) <= .25 && Math.abs(shooter.north - 163) <= .75,
    `The practice start must be near E223/N163. Received E${shooter.east}/N${shooter.north}`);
  const round = await beginRound(controls, () => controls.action.tap());
  evidence.round = { shooter, shownSeconds: round.shownSeconds, nextSeconds: round.nextSeconds };
  const startingAmmo = await readAmmo();
  assert.equal(startingAmmo, gatheredAmmo);
  evidence.stage = 'aim and release a native touch throw';
  const aim = await canvasGesture(24, 0);
  await touch('touchStart', aim.start);
  try {
    await wait(meter).toHaveAttribute('aria-label', '瞄准雪球');
    await wait(meter).toBeVisible();
    await touch('touchMove', aim.end);
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

  evidence.stage = 'wait for natural touch round settlement';
  await expect(controls.notice).toHaveText(/^移动靶结算 · 命中 [01]$/, { timeout: 85_000 });
  const elapsedMs = Math.round(performance.now() - round.gestureAt);
  assert.ok(elapsedMs >= 59_000, `Touch round settled too early after ${elapsedMs} ms`);
  await wait(controls.hud).toBeHidden();
  await wait(controls.action).toBeVisible();
  await session.detach();
  return {
    tapStartedRound: true, shownSeconds: round.shownSeconds, nextSeconds: round.nextSeconds,
    gather: { atSupply, ammunition: gatheredAmmo, touches: afterGather.canvasTouches, gesture: scoop },
    throw: { shooter, shot, touches: aimingTouches, remainingAmmo: await readAmmo(), gesture: aim },
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
  await runContext(browser, 'touch', devices['Pixel 7'], async page => {
    const evidence = {};
    try {
      return await verifyTouchRound(page, evidence);
    } catch (error) {
      evidence.failure = error instanceof Error ? error.message : String(error);
      evidence.browser = await page.evaluate(() => {
        const read = id => document.getElementById(id)?.textContent ?? null;
        const meter = document.getElementById('snowball-action-meter');
        return {
          position: read('position'), ammunition: read('snowball-score'), notice: read('town-activity-status'),
          round: read('snow-practice-status'), meterLabel: meter?.getAttribute('aria-label'), meterHidden: meter?.hidden,
          trustedInputs: window.__db2TouchProof,
        };
      }).catch(error => ({ failure: error.message }));
      const json = JSON.stringify(evidence, null, 2);
      await writeFile(join(artifacts, 'touch-failure.json'), json + '\n');
      console.error(json);
      throw error;
    }
  });
} finally {
  await browser.close();
}
