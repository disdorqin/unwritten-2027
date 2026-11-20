import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const require = createRequire(join(process.cwd(), 'package.json'));
const { chromium, expect } = require('@playwright/test');
const url = new URL(process.env.DB2_BROWSER_URL ?? 'http://127.0.0.1:4173/town-blockout.html');
const artifacts = resolve(process.env.DB2_BROWSER_ARTIFACTS ?? 'db2-aim-proof');
const viewport = { width: 960, height: 768 };
const start = { x: 550, y: 335 };
const ammoNumber = text => Number(/^雪球 (\d+)\/10/.exec(text)?.[1] ?? 0);
const shotEvent = 'town-snowball';

async function observeInput(page) {
  await page.addInitScript(eventName => {
    const proof = { x: 0, y: 0, motionSamples: 0, events: [] };
    Object.defineProperty(window, '__db2AimProof', { value: proof });
    document.addEventListener('mousemove', event => {
      if (!event.isTrusted || document.pointerLockElement?.tagName !== 'CANVAS') return;
      proof.x += event.movementX;
      proof.y += event.movementY;
      proof.motionSamples++;
    }, true);
    document.addEventListener(eventName, event => {
      if (event.target?.tagName !== 'CANVAS') return;
      const { id, type, thrower, shotBy, scoreable, scored, targetId, origin, dir, at, zone } = event.detail;
      if (thrower !== 'local' || shotBy !== 'player') return;
      const vector = value => value && [value.x, value.y, value.z];
      proof.events.push({
        id, type, thrower, shotBy, scoreable, scored, targetId, origin: vector(origin),
        direction: vector(dir), at: vector(at), zone, capturedAt: performance.now(),
      });
    }, true);
  }, shotEvent);
}

async function proveAim(page, report) {
  await observeInput(page);
  const response = await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  assert.equal(response?.ok(), true);
  await page.locator('#quality-tier').selectOption('smooth');
  await page.locator('#jump').selectOption({ label: '雪团练习场' });
  await expect(page.locator('#walk')).toHaveAttribute('aria-pressed', 'true', { timeout: 45_000 });
  const canvas = page.locator('#scene canvas');
  const action = page.locator('#world-action');
  const ammunition = page.locator('#snowball-score');
  const meter = page.locator('#snowball-action-meter');
  const round = page.locator('#snow-practice-status');
  await expect(canvas).toBeVisible({ timeout: 45_000 });
  await expect(action).toHaveText('E · 开始移动靶练习', { timeout: 45_000 });
  await expect(ammunition).toContainText('雪球 0/10');

  const readInput = () => page.evaluate(() => window.__db2AimProof);
  const pointerLocked = () => page.evaluate(() =>
    document.pointerLockElement === document.querySelector('#scene canvas'));
  const position = () => page.locator('#position').innerText({ timeout: 30_000 });
  async function readPracticeStand() {
    const text = await position();
    const pose = /东 ([\d.]+) m · 北 ([\d.]+) m/.exec(text);
    assert.ok(pose, text);
    const east = Number(pose[1]);
    const north = Number(pose[2]);
    // The host may safely adjust the jump landing within the real action radius.
    assert.ok(Math.hypot(east - 223, north - 163) <= .85, text);
    return { east, north, position: text };
  }
  report.firstStand = await readPracticeStand();
  async function lockMouse() {
    await page.mouse.click(start.x, start.y);
    await expect.poll(pointerLocked, { timeout: 12_000 }).toBe(true);
    return readInput();
  }

  let initial = await lockMouse();
  async function pointAt(dx, dy) {
    await page.mouse.move(start.x + dx, start.y + dy);
    await expect.poll(async () => {
      const state = await readInput();
      return [state.x - initial.x, state.y - initial.y];
    }, { timeout: 8000 }).toEqual([dx, dy]);
  }

  async function walkUntil(key, axis, limit) {
    await page.keyboard.down(key);
    try {
      await page.waitForFunction(({ axis, limit, key }) => {
        const text = document.querySelector('#position')?.textContent ?? '';
        const match = /东 ([\d.]+) m · 北 ([\d.]+) m/.exec(text);
        if (!match) return false;
        const value = Number(match[axis === 'east' ? 1 : 2]);
        return key === 'd' ? value >= limit : value <= limit;
      }, { axis, limit, key }, { timeout: 100_000, polling: 50 });
    } finally {
      await page.keyboard.up(key);
    }
  }

  // The practice marker is on the paved plaza. Use the real south shovel pile instead.
  await walkUntil('s', 'north', 158.5);
  await walkUntil('d', 'east', 233);
  const supplyApproach = await position();
  const pose = /东 ([\d.]+) m · 北 ([\d.]+) m/.exec(supplyApproach);
  assert.ok(pose, supplyApproach);
  const east = 233 - Number(pose[1]);
  const north = 160 - Number(pose[2]);
  const range = Math.hypot(east, north);
  assert.ok(range >= 0.8 && range <= 2.05, supplyApproach);
  const yaw = Math.atan2(east, north);
  const pitch = Math.atan2(.27 - 1.57, range);
  const snowX = Math.round(yaw / .003);
  const snowY = Math.round((.09 - pitch) / .003);
  await pointAt(snowX, snowY);
  await page.mouse.down();
  try {
    await expect(meter).toHaveAttribute('aria-label', '攒雪球进度', { timeout: 30_000 });
    await expect.poll(async () => ammoNumber(await ammunition.innerText()), { timeout: 45_000 })
      .toBeGreaterThanOrEqual(6);
    report.gather = { supplyApproach, ammunition: await ammunition.innerText(), mousePixels: [snowX, snowY] };
  } finally {
    await page.mouse.up();
  }
  assert.equal((await readInput()).events.length, 0, 'Gather release must leave the ammo unthrown');

  await page.keyboard.press('Escape');
  await expect.poll(pointerLocked, { timeout: 12_000 }).toBe(false);
  const destinations = page.locator('#jump');
  await destinations.selectOption({ label: '广场南侧' });
  await destinations.selectOption({ label: '雪团练习场' });
  await expect.poll(async () => ammoNumber(await ammunition.innerText()), { timeout: 30_000 })
    .toBeGreaterThanOrEqual(6);
  await expect(action).toHaveText('E · 开始移动靶练习', { timeout: 30_000 });
  const launchStand = report.launchStand = await readPracticeStand();
  await page.waitForTimeout(1550); // Chromium guards immediate pointer-lock reentry after Escape.
  initial = await lockMouse();

  await page.keyboard.press('e');
  await expect(round).toHaveText(/^移动靶场 · (?:[5][0-9]|60) 秒 · 命中 0$/, { timeout: 30_000 });
  report.opened = await round.innerText();
  for (const yawPixels of [0, 32, -32, 0, -32, 32, 0, 32, -32]) {
    await expect(round).toBeVisible();
    if (!ammoNumber(await ammunition.innerText())) break;
    const startEventCount = (await readInput()).events.length;
    await pointAt(yawPixels, 0);
    await page.mouse.down();
    try {
      await expect(meter).toHaveAttribute('aria-label', '瞄准雪球', { timeout: 8000 });
      await expect(meter).toBeVisible();
    } finally {
      await page.mouse.up();
    }

    await page.waitForFunction(count =>
      window.__db2AimProof.events.slice(count).some(event => event.type !== 'throw'),
    startEventCount, { timeout: 11_000, polling: 100 });
    const events = (await readInput()).events.slice(startEventCount);
    const launch = events.find(event => event.type === 'throw');
    const terminal = events.find(event => event.type !== 'throw' && event.id === launch?.id);
    report.attempts.push({ yawPixels, launch, terminal, round: await round.innerText() });
    assert.equal(launch?.scoreable, true, 'A native release should yield an eligible outdoor throw');
    assert.equal(terminal?.id, launch.id);
    // The HUD rounds to 0.1 m and the real muzzle is 0.06 m ahead of the eye.
    assert.ok(Math.abs(launch.origin[0] - launchStand.east) < .12);
    assert.ok(Math.abs(launch.origin[2] + launchStand.north) < .12);
    assert.ok(Math.abs(Math.atan2(launch.direction[0], -launch.direction[2]) - yawPixels * .003) < .0031);
    if (terminal.type !== 'impact' || terminal.targetId !== 'snow-practice' || terminal.scored !== true) continue;
    await expect(round).toHaveText(/^移动靶场 · \d+ 秒 · 命中 1$/);
    report.hit = { id: launch.id, impact: terminal.at, zone: terminal.zone, round: await round.innerText() };
    return;
  }
  assert.fail('No native attempt scored against the moving practice target while its round was active');
}

await mkdir(artifacts, { recursive: true });
const report = { url: url.href, attempts: [] };
const browser = await chromium.launch({
  headless: process.env.DB2_BROWSER_HEADLESS !== 'false',
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: process.env.DB2_BROWSER_HARDWARE === '1'
    ? [] : ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage({ viewport });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.stack ?? error.message));
  try {
    await proveAim(page, report);
    assert.deepEqual(pageErrors, []);
  } catch (error) {
    report.failure = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    report.pageErrors = pageErrors;
    const output = JSON.stringify(report, null, 2);
    await writeFile(join(artifacts, 'native-mouse-moving-target.json'), output + '\n');
    console.log(output);
    if (process.env.DB2_BROWSER_SCREENSHOT === '1') {
      await page.screenshot({ path: join(artifacts, 'native-mouse-moving-target.png'), timeout: 5000 })
        .catch(error => console.warn('Supplemental screenshot: ' + error.message));
    }
  }
} finally {
  await browser.close();
}
