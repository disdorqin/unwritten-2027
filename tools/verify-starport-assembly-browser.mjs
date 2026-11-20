import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const checkout = fileURLToPath(new URL('../', import.meta.url));
const root = path.join(checkout, 'tools', 'voxel-tavern');
const output = process.argv[2] && path.resolve(process.argv[2]);
assert.ok(output, 'Usage: node tools/verify-starport-assembly-browser.mjs OUTPUT');
await mkdir(output, { recursive: true });
const requireRoot = createRequire(path.join(checkout, 'package.json'));
const requireVite = createRequire(path.join(root, 'package.json'));
const vite = path.resolve(path.dirname(requireVite.resolve('vite/package.json')), 'dist/node/index.js');
const { build, preview } = await import(pathToFileURL(vite));
const { chromium } = requireRoot('playwright');
const result = {
  source: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: checkout, encoding: 'utf8' }).trim(),
  status: 'failed', errors: [], checks: [],
};
const targets = {
  'snow-wing': { x: -1.9, y: 1.28, z: .32 },
  booster: { x: 0, y: 1.28, z: .32 },
  'navigation-core': { x: 1.9, y: 1.28, z: .32 },
  ignition: { x: 0, y: 2.04, z: .36 },
};
const slots = ['snow-wing', 'booster', 'navigation-core'];
const eyeHeight = 1.65;

let browser, server, page;
const current = () => page.evaluate(() => window.starportAssemblyQA.frame);
const observe = (condition, data, timeout = 7_000) =>
  page.waitForFunction(condition, data, { polling: 'raf', timeout });
const shot = name => page.screenshot({ path: path.join(output, name + '.jpg'), quality: 84 });
const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

async function hold(key, until, data) {
  await page.keyboard.down(key);
  try { await observe(until, data); } finally { await page.keyboard.up(key); }
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function alignAngle(field, target, increase, decrease) {
  const value = (await current())[field];
  const offset = field === 'yaw' ? wrap(target - value) : target - value;
  if (Math.abs(offset) <= .045) return;
  await hold(offset > 0 ? increase : decrease, ({ field, start, offset }) => {
    let moved = window.starportAssemblyQA.frame[field] - start;
    if (field === 'yaw') moved = Math.atan2(Math.sin(moved), Math.cos(moved));
    return moved * Math.sign(offset) >= Math.abs(offset) - .017;
  }, { field, start: value, offset });
}

async function aimAt(slot) {
  const target = targets[slot];
  await alignAngle('yaw', 0, 'ArrowRight', 'ArrowLeft');
  let { foot } = await current();
  if (foot.z > 2.27) {
    await hold('w', () => window.starportAssemblyQA.frame.foot.z <= 2.23);
    ({ foot } = await current());
  }
  const direction = Math.sign(target.x - foot.x);
  if (Math.abs(foot.x - target.x) > .12) {
    await hold(direction > 0 ? 'd' : 'a', ({ x, direction }) =>
      (x - window.starportAssemblyQA.frame.foot.x) * direction <= .07, { x: target.x, direction });
  }
  // Use actual first-person feet after strafing so timing variation cannot alter the aim.
  const at = (await current()).foot;
  const targetYaw = Math.atan2(target.x - at.x, at.z - target.z);
  const targetPitch = Math.atan2(target.y - (at.y + eyeHeight), Math.hypot(target.x - at.x, at.z - target.z));
  await alignAngle('yaw', targetYaw, 'ArrowRight', 'ArrowLeft');
  await alignAngle('pitch', targetPitch, 'ArrowUp', 'ArrowDown');
  await observe(slot => window.starportAssemblyQA.frame?.aimedSlot === slot, slot);
}

async function interact(target, lastResult) {
  const before = await current();
  assert.equal(before.aimedSlot, target);
  await page.keyboard.press('e');
  await observe(attempts => window.starportAssemblyQA.frame?.attempts > attempts, before.attempts);
  const after = await current();
  assert.equal(after.attempts, before.attempts + 1);
  assert.equal(after.lastResult, lastResult, JSON.stringify(after));
  return { before, after };
}

function parts(frame, installed, carried) {
  assert.deepEqual([...frame.installed].sort(), [...installed].sort());
  assert.deepEqual([...frame.carried].sort(), [...carried].sort());
}

function unchanged(before, after) {
  parts(after, before.installed, before.carried);
  assert.equal(after.assembled, before.assembled);
  assert.equal(after.ignited, before.ignited);
}

try {
  result.step = 'build';
  const entry = 'starport-assembly-review.html';
  const outDir = path.join(output, 'dist');
  await build({ root, configFile: false, logLevel: 'warn', build: { outDir,
    emptyOutDir: false, rollupOptions: { input: path.join(root, entry) } } });
  server = await preview({ root, configFile: false, logLevel: 'warn', build: { outDir },
    preview: { host: '127.0.0.1', port: 0 } });
  const args = process.platform === 'win32' ? ['--use-gl=angle', '--use-angle=d3d11'] :
    ['--enable-unsafe-swiftshader'];
  browser = await chromium.launch({ executablePath: process.env.STARPORT_ASSEMBLY_CHROME ?? process.env.SKY_CITY_CHROME, args });
  result.browser = browser.version();
  page = await browser.newPage({ viewport: { width: 960, height: 650 } });
  page.on('pageerror', error => result.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') result.errors.push(message.text()); });
  page.on('requestfailed', request => result.errors.push(request.url()));
  page.on('response', response => { if (response.status() >= 400) result.errors.push(`${response.status()} ${response.url()}`); });
  await page.addInitScript(() => {
    const audit = { frame: null, native: { interact: 0, move: 0, look: 0 } };
    window.starportAssemblyQA = audit;
    document.addEventListener('starport-assembly-review-frame', event => { audit.frame = event.detail; });
    window.addEventListener('keydown', event => {
      if (!event.isTrusted || event.repeat) return;
      if (event.code === 'KeyE') audit.native.interact++;
      if (['KeyW', 'KeyA', 'KeyD', 'KeyS'].includes(event.code)) audit.native.move++;
      if (event.code.startsWith('Arrow')) audit.native.look++;
    });
  });

  result.step = 'loaded assembly rack';
  const address = server.httpServer.address();
  assert.equal((await page.goto(`http://127.0.0.1:${address.port}/${entry}`))?.status(), 200);
  await observe(() => Boolean(window.starportAssemblyQA.frame));
  const initial = await current();
  parts(initial, [], slots.slice(0, 2));
  assert.deepEqual(initial.foot, { x: 0, y: 0, z: 2.25 });
  assert.equal(initial.eyeHeight ?? eyeHeight, eyeHeight);
  await shot('01-initial-rack');

  result.step = 'aimed socket rejects missing navigation core';
  await aimAt('navigation-core');
  const missing = await interact('navigation-core', 'not-carried');
  unchanged(missing.before, missing.after);
  result.checks.push({ label: 'missing-navigation-core', frame: missing.after });

  result.step = 'install wing then refuse duplicate';
  await aimAt('snow-wing');
  const wing = await interact('snow-wing', 'placed');
  parts(wing.after, ['snow-wing'], ['booster']);
  assert.equal(wing.after.assembled, false);
  const duplicate = await interact('snow-wing', 'already-installed');
  unchanged(duplicate.before, duplicate.after);
  result.checks.push({ label: 'wing-install', frame: wing.after }, { label: 'duplicate-install', frame: duplicate.after });
  await shot('02-wing-installed');

  result.step = 'install booster';
  await aimAt('booster');
  const booster = await interact('booster', 'placed');
  parts(booster.after, ['snow-wing', 'booster'], []);
  assert.equal(booster.after.assembled, false);
  result.checks.push({ label: 'booster-install', frame: booster.after });

  result.step = 'third component completes assembly';
  await page.locator('#review-nav').click();
  await observe(() => window.starportAssemblyQA.frame?.carried.includes('navigation-core'));
  await aimAt('navigation-core');
  const nav = await interact('navigation-core', 'placed');
  parts(nav.after, slots, []);
  assert.equal(nav.after.assembled, true);
  assert.equal(nav.after.ignited, false);
  result.checks.push({ label: 'three-part-assembly', frame: nav.after });
  await shot('03-assembly-complete');

  result.step = 'assembled aircraft remains locked without both conditions';
  await aimAt('ignition');
  const locked = await interact('ignition', 'missing-key');
  unchanged(locked.before, locked.after);
  assert.equal(locked.after.ignited, false);
  await page.locator('#review-key').click();
  await aimAt('ignition');
  const keyOnly = await interact('ignition', 'window-closed');
  unchanged(keyOnly.before, keyOnly.after);
  result.checks.push({ label: 'ignition-locked', frame: locked.after }, { label: 'key-alone-locked', frame: keyOnly.after });
  await shot('04-key-alone-locked');

  result.step = 'ignite with key and authoritative window together';
  await page.locator('#review-night').click();
  await aimAt('ignition');
  const ignition = await interact('ignition', 'ignited');
  parts(ignition.after, slots, []);
  assert.equal(ignition.after.assembled, true);
  assert.equal(ignition.after.ignited, true);
  result.checks.push({ label: 'ignited', frame: ignition.after });
  await shot('05-ignition');
  result.native = await page.evaluate(() => window.starportAssemblyQA.native);
  assert.equal(result.native.interact, 8);
  assert.ok(result.native.move >= 4);
  assert.ok(result.native.look >= 1);
  assert.deepEqual(result.errors, []);
  result.status = 'passed';
} catch (error) {
  result.failure = error.stack;
  if (page) {
    result.last = await current().catch(() => undefined);
    await shot('failed').catch(() => {});
  }
  process.exitCode = 1;
} finally {
  await browser?.close();
  await server?.close();
  await writeFile(path.join(output, 'starport-assembly-result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
}
