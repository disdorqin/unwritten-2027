import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { createUndergroundMining } from '../src/presence/underground-mining.ts';
import { createUndergroundOreDistribution } from './voxel-tavern/town-blockout/underground-ore-distribution.ts';

assert.ok(process.argv[2], 'Use: node --import tsx tools/verify-underground-mining.mjs <evidence-dir>');
const output = resolve(process.argv[2]);
const repo = fileURLToPath(new URL('../', import.meta.url));
const scratch = await mkdtemp(resolve(tmpdir(), 'mining-review-'));
await mkdir(output, { recursive: true });

const layer = 'test-mine';
const oreId = 'candidate-wall-vein';
const profileId = 'mining-review-visitor';
const coreAt = { layer, east: 0, north: -1.55, height: -90 };
const { layers } = createUndergroundOreDistribution({
  anchors: [{
    id: 'candidate-rock-face', depth: -90, region: 'test-corridor', evidence: 'Isolated review geometry only',
    contains: ([east, north, height]) => east === 0 && north === -1 && height === -89.3,
  }],
  points: [{
    id: oreId, anchorId: 'candidate-rock-face', depth: -90, position: [0, -1, -89.3],
    amount: 2, mineral: 'ordinary-ore', grade: 'deposit',
  }],
});
const marker = layers[0].markers[0];
let accepted;
let sequence = 0;
let backpack = 0;
let held = 'pickaxe';
let activeLayer = layer;
const rewards = [];
const requests = [];

const mining = createUndergroundMining({
  ore: [{ marker, layer, coreAt, surface: 'rock', strikes: 3 }], openings: [],
  reach: 2.4, regrowMs: 600_000, now: Date.now, strikeDelayMs: () => 150,
  accept: (id, requested) => id === profileId && accepted?.sequence === requested ? accepted : undefined,
  commit(id, next, reward) {
    assert.equal(id, profileId);
    if (reward) {
      rewards.push({ ...reward });
      backpack += reward.amount;
    }
    return true;
  },
});
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><link rel="icon" href="data:,">
<style>body{margin:0;background:#292627;color:#eee;font:28px system-ui;pointer-events:auto} output{position:absolute;left:350px;top:220px;pointer-events:none;font-weight:300}</style>
<main><output aria-hidden="true">+</output></main><script type="module" src="/tools/fixtures/underground-mining-review.ts"></script>`;

const server = await createServer({
  configFile: false, root: repo, cacheDir: resolve(scratch, 'vite'), publicDir: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  resolve: { alias: [{ find: /^three$/, replacement: resolve(repo, 'node_modules/three/build/three.module.js') }] },
  plugins: [{ name: 'mining-review', configureServer(vite) {
    vite.middlewares.use('/u8-review', (_req, res) => {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(html);
    });
    vite.middlewares.use('/u8-api', (req, res) => {
      void (async () => {
        res.setHeader('Content-Type', 'application/json');
        if (req.url === '/snapshot') return res.end(JSON.stringify({ snapshot: mining.readLayer(layer), backpack }));
        let text = '';
        for await (const chunk of req) text += chunk;
        const body = JSON.parse(text);
        if (req.url === '/setup') {
          if (body.held === 'pickaxe' || body.held === 'other') held = body.held;
          if (body.layer === layer || body.layer === 'test-crystal') activeLayer = body.layer;
          return res.end('{}');
        }
        if (req.url !== '/action' || (body.action !== 'strike' && body.action !== 'pickup') ||
            typeof body.targetId !== 'string') return res.writeHead(400).end('{}');
        const isTarget = body.action === 'strike' ? body.targetId === oreId
          : mining.readLayer(layer).cores.some(core => core.id === body.targetId);
        accepted = {
          sequence: ++sequence, action: body.action, targetId: body.targetId,
          feet: { layer: activeLayer, east: 0, north: -2.30, height: -90 }, active: isTarget, held,
        };
        const receipt = mining.apply(profileId, sequence);
        requests.push({ held, layer: activeLayer, action: body.action, accepted: Boolean(receipt) });
        return res.end(JSON.stringify({ receipt, backpack }));
      })().catch(error => { console.error(error); res.writeHead(500).end('{}'); });
    });
  } }],
  server: { host: '127.0.0.1', port: 0, hmr: false },
});
let browser;
const errors = [];
try {
  await server.listen();
  const address = server.httpServer?.address();
  assert.ok(address && typeof address === 'object');
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 720, height: 480 } });
  page.setDefaultTimeout(12_000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(response.url()); });
  await page.goto(`http://127.0.0.1:${address.port}/u8-review`);
  await page.waitForFunction(() => window.undergroundMiningProbe?.inspect().drawings > 0);
  const inspect = () => page.evaluate(() => window.undergroundMiningProbe.inspect());
  const configure = state => page.evaluate(state => window.undergroundMiningProbe.authority(state), state);
  const hit = async sent => {
    await page.mouse.click(360, 240);
    await page.waitForFunction(sent => {
      const probe = window.undergroundMiningProbe;
      return probe.inspect().sent === sent && probe.settled();
    }, sent);
    return inspect();
  };

  const first = await inspect();
  assert.equal(first.ray, oreId);
  assert.equal(first.hits, 0);
  assert.equal(first.cluster, true);
  await page.screenshot({ path: resolve(output, 'vein.png') });
  await configure({ held: 'other' });
  assert.equal((await hit(1)).hits, 0);
  await configure({ held: 'pickaxe', layer: 'test-crystal' });
  assert.equal((await hit(2)).hits, 0);
  assert.deepEqual(requests.slice(0, 2).map(request => request.accepted), [false, false]);
  await configure({ layer });
  await page.evaluate(() => window.undergroundMiningProbe.localTool(false));
  await page.mouse.click(360, 240);
  assert.equal((await inspect()).sent, 2);
  assert.equal(requests.length, 2);
  await page.evaluate(() => window.undergroundMiningProbe.localTool(true));

  const strikes = [];
  for (let count = 1; count <= 3; count++) {
    const state = await hit(2 + count);
    assert.equal(state.hits, count);
    assert.equal(state.received, count);
    assert.equal(state.sounds, count);
    assert.equal(state.backpack, count);
    assert.equal(state.cluster, count < 3);
    assert.equal(state.cracks, count < 3);
    assert.equal(state.scar, count === 3);
    assert.equal(state.cores.length, count === 3 ? 1 : 0);
    if (count === 1) await page.screenshot({ path: resolve(output, 'cracked.png') });
    if (count === 3) await page.screenshot({ path: resolve(output, 'scar-and-core.png') });
    strikes.push(state);
    await page.waitForTimeout(160);
  }
  await page.evaluate(() => window.undergroundMiningProbe.look('core'));
  assert.equal((await inspect()).ray, strikes.at(-1).cores[0]);
  await page.keyboard.press('e');
  await page.waitForFunction(() => window.undergroundMiningProbe.inspect().cores.length === 0);
  const pickup = await inspect();
  assert.equal(pickup.backpack, 5);
  assert.equal(pickup.trustedPicks, 1);
  await page.keyboard.press('e');
  assert.equal((await inspect()).sent, 6);
  assert.equal((await inspect()).backpack, 5);
  assert.deepEqual(rewards.map(reward => [reward.kind, reward.amount]), [
    ['fragment', 1], ['fragment', 1], ['fragment', 1], ['core', 2],
  ]);
  await page.evaluate(() => window.undergroundMiningProbe.layer('test-crystal'));
  const changedLayer = await inspect();
  assert.equal(changedLayer.scar, false);
  assert.equal(changedLayer.cluster, false);
  assert.deepEqual(changedLayer.cores, []);
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'mining-review.json'), JSON.stringify({
    browser: browser.version(), marker, first, strikes, pickup, changedLayer, rewards, requests, errors,
  }, null, 2) + '\n');
  console.log('U-8: actual Chromium left-click x3 and E, authority rejections, one core, and a real rock scar.');
} catch (error) {
  await writeFile(resolve(output, 'failure.json'), JSON.stringify({
    error: String(error), requests, errors, rewards, state: mining.snapshot(),
  }, null, 2) + '\n');
  throw error;
} finally {
  try { await browser?.close(); } finally {
    await server.close();
    await rm(scratch, { force: true, recursive: true });
  }
}
