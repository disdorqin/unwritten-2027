import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const output = resolve(process.env.ORBITAL_CABIN_EVIDENCE ?? process.argv[2] ?? 'test-results/orbital-cabins');
await mkdir(output, { recursive: true });
const server = await createServer({
  root: resolve('tools/voxel-tavern'), configFile: false, logLevel: 'error',
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { host: '127.0.0.1', port: 0, strictPort: true, hmr: false },
});
const viewport = { width: 880, height: 560 };
const errors = [];
const report = { viewport, errors, evidence: {}, screenshots: [] };
let browser;

try {
  await server.listen();
  const address = server.httpServer.address();
  assert.ok(address && typeof address === 'object');
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH, headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  report.browser = browser.version();
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204, body: '' }));
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => errors.push(`${request.url()} ${request.failure()?.errorText}`));
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  const response = await page.goto(`http://127.0.0.1:${address.port}/orbital-cabin-review.html?proof=1`, {
    waitUntil: 'load', timeout: 60_000,
  });
  assert.equal(response?.status(), 200);
  await page.waitForFunction(() => window.orbitalCabinReview?.snapshot().draws > 0);

  const state = () => page.evaluate(() => window.orbitalCabinReview.snapshot());
  const advance = ms => page.evaluate(elapsed => window.orbitalCabinReview.advance(elapsed), ms);
  const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
  const planarDistance = (left, right) => Math.hypot(right.x - left.x, right.n - left.n);
  const wholeTicks = (seconds, tick) => Math.round(seconds / tick) * tick * 1000;
  async function hold(key, seconds) {
    const before = await state();
    await page.keyboard.down(key);
    try { return await advance(wholeTicks(seconds, before.tick)); }
    finally { await page.keyboard.up(key); }
  }
  async function look(yaw, pitch = 0) {
    const before = await state();
    const heading = wrap(yaw - before.pose.yaw);
    const tilt = pitch - before.pose.pitch;
    if (Math.abs(heading) >= 0.00625) await hold(heading > 0 ? 'ArrowRight' : 'ArrowLeft', Math.abs(heading) / before.turnRate);
    if (Math.abs(tilt) >= 0.00625) await hold(tilt > 0 ? 'ArrowUp' : 'ArrowDown', Math.abs(tilt) / before.turnRate);
    const after = await state();
    assert.ok(Math.abs(wrap(after.pose.yaw - yaw)) <= 0.013 && Math.abs(after.pose.pitch - pitch) <= 0.013);
    return after;
  }
  async function walk(target) {
    const before = await state();
    const distance = planarDistance(before.pose, target);
    if (distance >= 0.012) {
      await look(Math.atan2(target.x - before.pose.x, target.n - before.pose.n));
      await hold('KeyW', distance / before.speed);
    }
    const after = await state();
    assert.ok(planarDistance(after.pose, target) <= 0.075,
      `Walking missed target (${target.x}, ${target.n}): ${JSON.stringify(after.pose)}`);
    assert.equal(after.pose.ground, target.ground);
    assert.equal(after.blocked, before.blocked, 'Normal walking route hit a body obstruction');
    return after;
  }
  async function capture(name) {
    const current = await advance(0);
    assert.ok(current.draws > 0 && current.triangles > 0);
    const file = `${name}.png`;
    await page.screenshot({ path: resolve(output, file), timeout: 20_000 });
    report.screenshots.push({ file, room: current.id, pose: current.pose, draws: current.draws, triangles: current.triangles });
  }

  const observation = await state();
  assert.equal(observation.id, 'observation');
  assert.deepEqual([observation.pose.x, observation.pose.n, observation.pose.ground], [0, -.85, 0]);
  const center = { x: 0, n: observation.windowView.n, ground: observation.windowView.ground };
  const observationWalk = [];
  for (const point of [observation.port.frame, observation.port.arrival, center, observation.windowView]) {
    observationWalk.push((await walk(point)).pose);
  }
  await look(Math.PI / 2);
  await capture('s6-side-window');
  const touchedBench = await hold('KeyW', 1.1);
  assert.ok(touchedBench.blocked > observation.blocked && touchedBench.pose.x > 3.7 &&
    touchedBench.pose.x + 0.27 <= observation.bench.footprint.minX + 1e-6);
  for (const point of [center, observation.port.arrival, observation.port.frame, observation.port.approach]) {
    observationWalk.push((await walk(point)).pose);
  }
  await look(0);
  await capture('s6-port-return');
  report.evidence.observation = { start: observation.pose, route: observationWalk, benchCollision: touchedBench.pose,
    collisionSamples: touchedBench.blocked };

  await page.getByRole('button', { name: '生活舱', exact: true }).click();
  const living = await state();
  assert.equal(living.id, 'living');
  assert.deepEqual([living.pose.x, living.pose.n, living.pose.ground], [0, -.45, 0]);
  assert.equal(living.route.length, 15);
  await capture('s7-living-cabin-entrance');
  const livingWalk = [];
  for (const point of living.route) {
    const current = await walk(point);
    livingWalk.push(current.pose);
    const { view, berth, point: item } = living.privateItem;
    if (planarDistance(point, view) > 1e-9) continue;
    assert.equal(berth, 3);
    const yaw = Math.atan2(item.x - current.pose.x, item.n - current.pose.n);
    const pitch = Math.atan2(item.ground + .13 - current.eye - current.pose.ground, planarDistance(item, current.pose));
    await look(yaw, pitch);
    await capture('s7-third-berth');
  }
  await look(0);
  const returned = await state();
  assert.equal(returned.blocked, 0);
  assert.ok(planarDistance(returned.pose, living.port.approach) <= .075);
  await capture('s7-port-return');
  report.evidence.living = { start: living.pose, route: livingWalk, returned: returned.pose, moves: returned.steps,
    collisionSamples: returned.blocked, inventoryInteraction: false };
  assert.deepEqual(errors, []);
} catch (error) {
  report.failure = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  try { await browser?.close(); }
  finally { await server.close(); }
  await writeFile(resolve(output, 'orbital-cabin-walk.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ browser: report.browser, passed: !report.failure, screenshots: report.screenshots.length,
    scenes: Object.keys(report.evidence), failure: report.failure }));
}
