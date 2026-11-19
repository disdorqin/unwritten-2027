import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const url = new URL(process.env.P7_URL ?? 'http://127.0.0.1:5814/tools/voxel-tavern/main-summit-cable-stations-review.html');
assert.ok(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname));
url.searchParams.set('proof', '1');
const output = process.argv[2];
assert.ok(output);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 840, height: 540 } });
  const errors = [];
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204, body: '' }));
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const response = await page.goto(url.href, { waitUntil: 'networkidle' });
  assert.equal(response?.status(), 200);
  await page.waitForFunction(() => typeof window.p7?.advance === 'function');
  assert.equal(await page.evaluate(() => window.p7.jambBlocks()), true);
  const plans = ['gate', 'guardroom', 'gate-to-station', 'cloud-deck-0', 'cloud-deck-1', 'summit-0', 'summit-1'];
  const evidence = [];
  async function move(key, milliseconds) {
    await page.keyboard.down(key);
    try {
      return await page.evaluate(ms => window.p7.advance(ms, true), milliseconds);
    } finally {
      await page.keyboard.up(key);
    }
  }
  function horizontal(a, b) {
    return Math.hypot(a.east - b.east, a.north - b.north);
  }
  for (const plan of plans) {
    await page.selectOption('#route', plan);
    const start = await page.evaluate(() => window.p7.snapshot());
    const stopped = await page.evaluate(() => window.p7.advance(700, false));
    assert.deepEqual(stopped.position, start.position);
    if (['gate', 'cloud-deck-0', 'summit-0'].includes(plan)) {
      await page.screenshot({ path: join(output, `${plan}-entry.png`) });
    }
    const end = await move('KeyW', 10_000);
    assert.equal(end.arrived, true, plan);
    assert.equal(end.blockedSteps, 0, plan);
    assert.ok(end.ticks >= 25 && end.travelled > 2, plan);
    assert.ok(horizontal(end.position, end.destination) < 1e-7, plan);
    assert.ok(end.render.draws > 0 && end.render.triangles > 0, plan);
    await page.screenshot({ path: join(output, `${plan}-arrived.png`) });
    const back = await move('KeyS', 10_000);
    assert.equal(back.blockedSteps, 0, plan);
    assert.ok(horizontal(back.position, start.position) < 1e-7, plan);
    assert.ok(Math.abs(back.position.height - start.position.height) < 1e-7, plan);
    evidence.push({ plan, start, end, back });
  }
  assert.deepEqual(errors, []);
  const report = JSON.stringify({ browser: browser.version(), jambBlocks: true, errors, evidence }, null, 2);
  await writeFile(join(output, 'browser.json'), report + '\n');
  console.log(report);
} finally {
  await browser.close();
}
