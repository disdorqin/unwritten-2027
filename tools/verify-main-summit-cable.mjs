import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

const outputDirectory = process.argv[2] ?? '/tmp/p2-evidence';
await mkdir(outputDirectory, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 768, height: 432 } });
  const errors = [];
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204, body: '' }));
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('http://127.0.0.1:5812/tools/voxel-tavern/main-summit-cable-review.html', { waitUntil: 'networkidle' });
  assert.deepEqual(errors, []);
  await page.waitForFunction(() => window.p2, undefined, { timeout: 10_000 });
  const clock = await page.evaluate(() => ({ legMs: window.p2.legMs, travelMs: window.p2.travelMs }));
  const state = () => page.evaluate(() => window.p2.render());
  const time = ms => page.evaluate(now => window.p2.time(now), ms);
  const evidence = [];
  for (const [leg, from, to] of [[0, 'cloud-deck', 'summit'], [1, 'summit', 'cloud-deck']]) {
    const start = leg * clock.legMs;
    assert.equal((await time(start)).station, from);
    if (leg === 0) {
      for (let i = 0; i < 4; i++) await page.keyboard.press('KeyW');
      await page.keyboard.press('KeyE');
      assert.equal((await state()).rider, false);
      for (let i = 0; i < 4; i++) await page.keyboard.press('KeyW');
    }
    assert.equal((await state()).progress, leg === 0 ? 1 : 0);
    await page.keyboard.press('KeyE');
    assert.equal((await state()).rider, true);
    for (const [elapsed, phase] of [[0, 'departure'], [70_000, 'enter-cloud'], [100_000, 'whiteout'],
      [130_000, 'arrival'], [clock.travelMs - 1, 'arrival']]) {
      const current = await time(start + 10_000 + elapsed);
      assert.equal(current.phase, phase);
      assert.equal(current.hintsVisible, false);
      assert.equal(current.whiteout, phase === 'whiteout');
      if (phase === 'whiteout') {
        await page.keyboard.press('KeyE');
        await page.keyboard.press('Space');
        assert.deepEqual(await state(), current);
      }
      if (elapsed === 70_000 || elapsed === 100_000 || elapsed === 130_000) {
        await page.screenshot({ path: join(outputDirectory, `p2-${from}-${phase}.png`) });
      }
      evidence.push(current);
    }
    const arrive = await time(start + clock.legMs);
    assert.equal(arrive.station, to);
    await page.keyboard.press('KeyE');
    assert.equal((await state()).rider, false);
    const exit = await state();
    assert.equal(exit.progress, 0);
    assert.ok(exit.drawCalls > 0);
    assert.ok(Math.abs(exit.camera[1] - (to === 'summit' ? 801.6 : 348.6)) < 1e-8);
    evidence.push(exit);
    await page.screenshot({ path: join(outputDirectory, `p2-${to}-platform.png`) });
  }
  assert.deepEqual(errors, []);
  const report = JSON.stringify({ browser: browser.version(), ...clock, errors, evidence }, null, 2);
  await writeFile(join(outputDirectory, 'browser.json'), report + '\n');
  console.log(report);
} finally {
  await browser.close();
}
