import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const release = '75859a094757c5dcee8b874eef86ec37f4204907';
const output = resolve(process.env.JX8_OUTPUT ?? 'jx8-proof');
const origin = new URL(process.env.JX8_BROWSER_URL ?? 'http://127.0.0.1:4173/town-blockout.html?profile');
assert.ok(origin.hostname === '127.0.0.1' && origin.protocol === 'http:', 'Use an isolated loopback preview');
assert.equal(origin.pathname, '/town-blockout.html');
origin.searchParams.set('profile', '');
const planPath = process.env.JX8_INPUT_PLAN;
assert.ok(planPath, 'JX8_INPUT_PLAN must name the surveyed native input plan');
const plans = JSON.parse(await readFile(planPath, 'utf8'));
const bands = [
  { name: 'under-8', range: [0, 7], cleared: [] },
  { name: '8-to-15', range: [8, 14], cleared: [3] },
  { name: '15-to-22', range: [15, 22], cleared: [2, 3] },
  { name: 'over-22', range: [23, 46], cleared: [0, 1, 2, 3] },
];
const bandNames = plans.map(plan => plan.band);
assert.ok(bandNames.length > 0 && new Set(bandNames).size === bandNames.length &&
  bandNames.every(name => bands.some(band => band.name === name)), 'Supply surveyed native routes for distinct speed bands');
assert.deepEqual(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), release);
execFileSync('git', ['diff', '--quiet', release, '--', 'src', 'tools/voxel-tavern', 'public', 'vite.config.ts']);

const require = createRequire(join(process.cwd(), 'package.json'));
const { chromium } = require('@playwright/test');
const source = pathToFileURL(join(process.cwd(), 'src/presence/snowfight-events.ts')).href;
const protocol = await import(source);
const { decodeSnowfightClientEvent, decodeSnowfightRelay } = protocol.default ?? protocol;

function observeSocket(page, events) {
  page.on('websocket', socket => {
    for (const kind of ['framereceived', 'framesent']) {
      socket.on(kind, ({ payload }) => {
        if (!Buffer.isBuffer(payload) || payload[0] !== 0xff) return;
        const picked = kind === 'framesent' ? [decodeSnowfightClientEvent(payload)] : decodeSnowfightRelay(payload);
        for (const event of picked ?? []) if (event) events.push(event);
      });
    }
  });
}

async function nativeInput(page, step) {
  switch (step.type) {
    case 'destination':
      await page.locator('#jump').selectOption({ label: step.label });
      return;
    case 'press':
      await page.keyboard.press(step.key);
      return;
    case 'hold':
      await page.keyboard.down(step.key);
      try { await page.waitForTimeout(step.ms); }
      finally { await page.keyboard.up(step.key); }
      return;
    case 'click':
      await page.locator(step.selector).click();
      return;
    case 'drag':
      await page.mouse.move(step.x, step.y);
      await page.mouse.down();
      try { await page.mouse.move(step.x + step.dx, step.y + step.dy, { steps: 12 }); }
      finally { await page.mouse.up(); }
      return;
    case 'mouse-hold':
      await page.mouse.move(step.x, step.y);
      await page.mouse.down();
      try { await page.waitForTimeout(step.ms); }
      finally { await page.mouse.up(); }
      return;
    default:
      throw new Error(`Unsupported native operator ${step.type}`);
  }
}

async function runCommands(pages, commands) {
  for (const command of commands) {
    assert.ok(command.client === 'a' || command.client === 'b', 'Unknown player');
    await nativeInput(pages[command.client], command);
  }
}

function wallLayers(events, gx, gy) {
  const layers = new Set();
  for (const event of events) {
    if (event.kind === 'wall-set' && event.gx === gx && event.gy === gy) layers.add(event.layer);
    if (event.kind === 'wall-clear') {
      for (const block of event.blocks) if (block.gx === gx && block.gy === gy) layers.delete(block.layer);
    }
  }
  return [...layers].sort((a, b) => a - b);
}

async function readHud(page) {
  return page.evaluate(() => ({
    position: document.querySelector('#position')?.textContent,
    speed: document.querySelector('#sled-status')?.textContent,
    material: document.querySelector('#snowfight-material')?.textContent,
    ammo: document.querySelector('#snowball-score')?.textContent,
    online: document.querySelector('#town-presence-status')?.textContent,
    teamMatch: !document.querySelector('#snowfight-panel')?.hidden,
  }));
}

function wallSide(position, { gx, gy, axis, sign }) {
  const point = /东 ([\d.]+) m · 北 ([\d.]+) m/.exec(position ?? '');
  assert.ok(point, position);
  assert.ok(axis === 'east' || axis === 'north');
  assert.ok(sign === -1 || sign === 1);
  const centre = ((axis === 'east' ? gx : gy) + .5) * .5;
  return sign * (Number(point[axis === 'east' ? 1 : 2]) - centre);
}

const evidence = { release, route: origin.href, cases: [], errors: [],
  bandsNotRun: bands.filter(band => !bandNames.includes(band.name)).map(band => band.name) };
await mkdir(output, { recursive: true });
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  evidence.browser = browser.version();
  const contexts = await Promise.all(['a', 'b'].map(() => browser.newContext({ viewport: { width: 900, height: 600 } })));
  const [a, b] = await Promise.all(contexts.map(context => context.newPage()));
  const pages = { a, b };
  const events = { a: [], b: [] };
  await Promise.all(Object.entries(pages).map(async ([id, page]) => {
    observeSocket(page, events[id]);
    page.on('pageerror', error => evidence.errors.push(String(error)));
    if (id === 'a') await page.addInitScript(() => {
      const samples = [];
      Object.defineProperty(window, '__jx8HudFrames', { value: samples });
      document.addEventListener('town-frame-profile', () => {
        const position = document.querySelector('#position')?.textContent;
        const speed = document.querySelector('#sled-status')?.textContent;
        const kmh = Number(/^雪橇 (\d+) km\/h/.exec(speed ?? '')?.[1]);
        if (position && Number.isFinite(kmh)) samples.push({ position, kmh, at: performance.now() });
        if (samples.length > 4000) samples.shift();
      }, true);
    });
    const response = await page.goto(origin.href, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    assert.ok(response?.ok(), 'The release viewer did not open');
    await page.locator('#scene canvas').waitFor({ state: 'visible', timeout: 60_000 });
    await page.locator('#quality-tier').selectOption('smooth');
  }));

  for (const plan of plans) {
    const band = bands.find(candidate => candidate.name === plan.band);
    const { gx, gy } = plan;
    assert.ok(Number.isInteger(gx) && Number.isInteger(gy), 'Use a surveyed metre-grid wall cell');
    const record = { band: plan.band, cell: [gx, gy], passed: false };
    evidence.cases.push(record);
    await runCommands(pages, plan.setup);
    for (const side of ['a', 'b']) assert.deepEqual(wallLayers(events[side], gx, gy), [0, 1, 2, 3], side);
    record.before = await readHud(a);
    assert.equal(record.before.teamMatch, false, 'This is the free mode proof');
    assert.ok(wallSide(record.before.position, plan) < 0, 'The sled must begin before the wall');
    const offsets = { a: events.a.length, b: events.b.length };
    await a.evaluate(() => { window.__jx8HudFrames.length = 0; });
    await runCommands(pages, plan.run);
    record.after = await readHud(a);
    record.wallSide = wallSide(record.after.position, plan);
    record.impact = {};
    for (const side of ['a', 'b']) {
      const received = events[side].slice(offsets[side]);
      const cleared = [...new Set(received.flatMap(event => event.kind === 'wall-clear'
        ? event.blocks.filter(block => block.gx === gx && block.gy === gy).map(block => block.layer) : []))].sort((x, y) => x - y);
      record.impact[side] = { cleared, remaining: wallLayers(events[side], gx, gy) };
      assert.deepEqual(cleared, band.cleared, side);
      assert.deepEqual(record.impact[side].remaining, [0, 1, 2, 3].filter(layer => !band.cleared.includes(layer)), side);
    }
    const reports = events.a.slice(offsets.a).filter(event => event.kind === 'sled-smash' && event.gx === gx && event.gy === gy);
    if (band.cleared.length) {
      assert.ok(reports.length && reports[0].speed >= band.range[0] && reports[0].speed <= band.range[1]);
      record.speedByte = reports[0].speed;
    } else {
      assert.equal(reports.length, 0);
      assert.ok(record.wallSide <= 0 && record.wallSide >= -.8, 'A slow run must actually reach the near wall face');
      assert.match(record.after.speed ?? '', /^雪橇 /);
      const frames = await a.evaluate(() => [...window.__jx8HudFrames]);
      record.nearFaceFrames = frames.filter(frame => {
        const side = wallSide(frame.position, plan);
        return side <= 0 && side >= -.8;
      });
      assert.ok(record.nearFaceFrames.some(frame => frame.kmh > 0));
      assert.ok(record.nearFaceFrames.every(frame => (frame.kmh + .5) / 3.6 < 8),
        'Rounded spectator HUD must prove the upper speed bound even with rounding error');
    }
    if (band.name === 'over-22') assert.ok(record.wallSide > .25, 'Complete clearance must let the sled reach the far side');
    await Promise.all(Object.entries(pages).map(([id, page]) => page.screenshot({
      path: join(output, `${plan.band}-${id}.png`), timeout: 8_000,
    })));
    record.passed = true;
  }
  assert.deepEqual(evidence.errors, []);
} catch (error) {
  evidence.failure = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await writeFile(join(output, 'jx8-native.json'), JSON.stringify(evidence, null, 2) + '\n');
}
