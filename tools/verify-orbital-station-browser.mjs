import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const output = resolve(process.env.ORBITAL_STATION_EVIDENCE ?? process.argv[2] ?? 'test-results/orbital-station');
await mkdir(output, { recursive: true });
const server = await createServer({
  root: resolve('tools/voxel-tavern'), configFile: false, logLevel: 'error',
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { host: '127.0.0.1', port: 0, strictPort: true, hmr: false, fs: { allow: [resolve()] } },
});
const viewport = { width: 940, height: 600 };
const errors = [];
const report = { viewport, errors, route: [], screenshots: [] };
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
  const result = await page.goto(`http://127.0.0.1:${address.port}/orbital-station-review.html?proof=1`, {
    waitUntil: 'load', timeout: 45_000,
  });
  assert.equal(result?.status(), 200);
  await page.waitForFunction(() => window.orbitalStationReview?.snapshot().draws > 0);
  const state = () => page.evaluate(() => window.orbitalStationReview.snapshot());
  const advance = ms => page.evaluate(elapsed => window.orbitalStationReview.advance(elapsed), ms);
  const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.n - b.n);

  async function hold(key, seconds) {
    const { tick } = await state();
    await page.keyboard.down(key);
    try { return await advance(Math.round(seconds / tick) * tick * 1000); }
    finally { await page.keyboard.up(key); }
  }

  async function look(yaw, pitch = 0) {
    const before = await state();
    const delta = wrap(yaw - before.pose.yaw), deltaPitch = pitch - before.pose.pitch;
    if (Math.abs(delta) > before.tick * before.turnRate / 2) {
      await hold(delta > 0 ? 'ArrowRight' : 'ArrowLeft', Math.abs(delta) / before.turnRate);
    }
    if (Math.abs(deltaPitch) > before.tick * before.turnRate / 2) {
      await hold(deltaPitch > 0 ? 'ArrowUp' : 'ArrowDown', Math.abs(deltaPitch) / before.turnRate);
    }
    const after = await state();
    assert.ok(Math.abs(wrap(after.pose.yaw - yaw)) <= .013);
    assert.ok(Math.abs(after.pose.pitch - pitch) <= .013);
  }

  async function walk(target) {
    const before = await state();
    const length = distance(before.pose, target);
    if (length > .012) {
      await look(Math.atan2(target.x - before.pose.x, target.n - before.pose.n));
      await hold('KeyW', length / before.speed);
    }
    const after = await state();
    assert.ok(distance(after.pose, target) <= .10, `missed ${JSON.stringify(target)} from ${JSON.stringify(after.pose)}`);
    assert.equal(after.blocked, before.blocked, `collision at ${JSON.stringify(after.pose)}`);
    report.route.push({ ...after.pose, room: after.room });
    return after;
  }

  async function capture(name) {
    const current = await state();
    assert.ok(current.draws > 0 && current.triangles > 0);
    const file = `${name}.png`;
    await page.screenshot({ path: resolve(output, file), timeout: 20_000 });
    report.screenshots.push({ file, room: current.room, pose: current.pose,
      draws: current.draws, triangles: current.triangles });
  }

  const start = await state();
  assert.equal(start.room, 'airlock');
  assert.equal(start.hub.anchors.filter(anchor => anchor.lit).length, 0);
  assert.ok(!(await page.locator('#seat').isVisible()));
  await page.keyboard.press('KeyE');
  assert.equal((await state()).lookout.seated, false);
  for (const point of start.tourRoute.slice(1)) {
    const current = await walk(point);
    if (current.room === 'living' && distance(point, start.rooms.living) === 0) await capture('living-installed');
    if (current.room === 'cockpit' && distance(point, start.rooms.cockpit) === 0) {
      const { x, n, y } = current.cockpitNameplate;
      await look(Math.atan2(x - current.pose.x, n - current.pose.n),
        Math.atan2(y - current.cameraY, Math.hypot(x - current.pose.x, n - current.pose.n)));
      const hit = await page.evaluate(() => window.orbitalStationReview.centerHitName());
      assert.equal(hit, 'orbital-sign-cockpit-nameplate');
      const side = report.route.at(-2);
      assert.ok(side.x > 5.4 && Math.abs(side.n - current.pose.n) < .12, 'production candidate side doorway was used');
      report.cockpitNameplate = { ...current.cockpitNameplate, firstHit: hit, fromSideHall: side };
      await capture('cockpit-nameplate-from-side-door');
    }
    if (current.room === 'observation' && distance(point, start.rooms.observation) === 0) {
      await look(0);
      await capture('observation-installed');
      const approach = await walk(current.lookout.approach);
      assert.equal(await page.locator('#seat').innerText(), 'E 静坐');
      const began = Date.now();
      await page.keyboard.press('KeyE');
      const seated = await state();
      assert.equal(seated.lookout.seated, true);
      assert.ok(seated.cameraY < approach.cameraY - .30);
      assert.equal(await page.locator('#seat').innerText(), 'E 起身');
      await capture('observation-seated');
      const attempted = await hold('KeyW', .30);
      assert.deepEqual(attempted.pose, seated.pose, 'sitting leaves the walking pose unchanged');
      assert.equal(attempted.walked, seated.walked);
      await page.waitForFunction(() => window.orbitalStationReview.snapshot().lookout.seconds >= 6);
      const middle = await state();
      assert.notDeepEqual(middle.lookout.frame, approach.lookout.frame);
      assert.equal(middle.lookout.completed, false);
      await capture('observation-window-cycle-in-motion');
      await page.waitForFunction(() => window.orbitalStationReview.snapshot().lookout.completed, null, { timeout: 35_000 });
      const finished = await state();
      const elapsedMs = Date.now() - began;
      assert.ok(elapsedMs >= finished.lookout.cycleSeconds * 1000 - 100);
      assert.deepEqual(finished.lookout.frame, approach.lookout.frame);
      await capture('observation-window-cycle-complete');
      await page.keyboard.press('KeyE');
      const stood = await state();
      assert.equal(stood.lookout.seated, false);
      assert.equal(stood.cameraY, approach.cameraY);
      assert.deepEqual(stood.pose, seated.pose);
      report.lookout = { elapsedMs, approach: approach.pose, seatedCameraY: seated.cameraY,
        stoodCameraY: stood.cameraY, middle: middle.lookout, finished: finished.lookout };
      await walk(start.rooms.observation);
    }
  }
  assert.deepEqual([...new Set(report.route.map(point => point.room).filter(Boolean))],
    ['airlock', 'living', 'cockpit', 'observation', 'teleport']);
  const hub = await state();
  assert.equal(hub.room, 'teleport');
  assert.equal(hub.hub.hubLit, true);
  const ids = hub.hub.anchors.map(anchor => anchor.id);
  assert.deepEqual(ids, ['starport', 'crater-bottom', 'summit', 'plaza']);
  assert.deepEqual(await page.locator('#terminal dt').allTextContents(), ['轨道舱', '星港', '坑底', '绝顶', '广场']);
  assert.deepEqual(await page.locator('#terminal dd').allTextContents(), ['已点亮', '未到访', '未到访', '未到访', '未到访']);
  await capture('teleport-untouched-anchors');
  await page.evaluate(id => window.orbitalStationReview.setVisitedAnchors([id]), ids[0]);
  assert.deepEqual((await state()).hub.anchors.map(anchor => anchor.lit), [true, false, false, false]);
  assert.equal((await state()).hub.mapVisible, false);
  await page.evaluate(visited => window.orbitalStationReview.setVisitedAnchors(visited), ids);
  assert.ok((await state()).hub.mapVisible);
  assert.deepEqual(await page.locator('#terminal dd').allTextContents(), Array(5).fill('已点亮'));
  await capture('teleport-four-anchors');
  for (const point of start.tourRoute.slice(0, -1).reverse()) await walk(point);
  const end = await state();
  assert.equal(end.room, 'airlock');
  assert.equal(end.blocked, 0);
  report.totalWalked = end.walked;
  report.totalBlocked = end.blocked;
  assert.deepEqual(errors, []);
} catch (error) {
  report.failure = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  try { await browser?.close(); }
  finally { await server.close(); }
  await writeFile(resolve(output, 'orbital-station-walk.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ browser: report.browser, passed: !report.failure, checkpoints: report.route.length,
    screenshots: report.screenshots.length, blocked: report.totalBlocked, errors: errors.length, failure: report.failure }));
}
