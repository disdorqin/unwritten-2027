import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { createUndergroundMineEncounter } from '../src/presence/underground-mine-encounter.ts';
import { createUndergroundSurvival } from '../src/presence/underground-survival.ts';

assert.ok(process.argv[2], 'Use: node --import tsx tools/verify-underground-combat.mjs <evidence-dir>');
const output = resolve(process.argv[2]);
const repo = fileURLToPath(new URL('../', import.meta.url));
const scratch = await mkdtemp(resolve(tmpdir(), 'combat-review-'));
await mkdir(output, { recursive: true });
const layer = 'review-mine';
const room = 'review-mine-room';
const playerId = 'review-miner';
const feet = { layer, east: .59, north: .58, height: -90 };
const sites = {
  clump: { room, at: { east: -.58, north: 1.1 }, height: -89.72 },
  skeleton: { room, at: { east: .60, north: .63 }, height: -89.45 },
};
let tick = -1;
let accepted;
const survival = createUndergroundSurvival({
  maxHealth: 100, reconnectFromZeroHealth: 20, fires: [],
  defaultWakePoint: { ...feet, layer: 'review-town', height: 0 },
  readBoundBed: () => undefined, readEntryMode: () => 'survival',
  readAcceptedFoot: id => id === playerId ? { playerId: id, point: feet, standingStill: true } : undefined,
  areTeammates: () => false, canReach: () => false, now: () => Math.max(0, tick) * 100,
  readTripOre: () => [], chooseHalf: () => [], save: () => undefined,
});
assert.equal(survival.syncDepthMode(playerId), true);
const encounter = createUndergroundMineEncounter({
  spawns: [
    { ...sites.clump, id: 'clump', species: 'snow-clump', habitat: 'shallow-snow' },
    { ...sites.skeleton, id: 'skeleton', species: 'skeleton-miner', habitat: 'workface' },
  ],
  host: {
    hasSpawnSite: (section, atRoom) => section === 'mine' && atRoom === room,
    moveAllowed: () => true, seesPlayer: () => true, hearsMining: () => true, insideCampfire: () => false,
  },
  survival, maxHealth: 100, damageByBand: { light: 8, medium: 16 },
  readAcceptedEncounter: id => id === playerId ? accepted : undefined,
});
const requests = [];
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><link rel="icon" href="data:,">
<style>body{margin:0;background:#34312f}canvas{display:block}</style><main></main>
<script type="module" src="/tools/fixtures/underground-combat-review.ts"></script>`;

function advance(action, contact) {
  accepted = { section: 'mine', player: { room, at: feet, action }, contact };
  return encounter.advance({ playerId, tick: ++tick, sequence: tick + 1 });
}

function hit(target, tool) {
  if (!Object.hasOwn(sites, target) || (tool !== 'pickaxe' && tool !== 'snowball')) {
    throw new Error('Unknown admitted contact');
  }
  const previous = encounter.snapshot().find(actor => actor.id === target);
  const result = advance('quiet', { target, tool });
  assert.notEqual(result.hit, 'ignored');
  const actor = encounter.snapshot().find(actor => actor.id === target);
  const hitsLost = previous.remainingHits - actor.remainingHits;
  const site = sites[target];
  return {
    cue: {
      layer, sequence: tick + 1, kind: 'creature-hit', outcome: result.hit, targetId: target, tool,
      at: { layer, ...site.at, height: site.height },
      ...(result.hit === 'wrong-tool' ? {} : { hitsLost }),
    },
    from: { layer, east: feet.east, north: feet.north },
  };
}

function incomingHurt() {
  const healthBefore = survival.status(playerId).health;
  const results = [advance('mine')];
  for (let remaining = 4; remaining > 0; remaining--) results.push(advance('quiet'));
  const result = results.at(-1);
  assert.equal(results.filter(item => item.damage > 0).length, 1);
  assert.equal(result.damage, 16);
  assert.equal(survival.status(playerId).health, healthBefore - result.damage);
  const sources = encounter.snapshot().filter(actor => actor.phase !== 'defeated' && actor.room === room);
  assert.deepEqual(sources.map(actor => actor.id), ['skeleton']);
  return {
    cue: { layer, sequence: tick + 1, kind: 'player-hurt', damage: result.damage, weight: result.damageBand },
    from: { layer, ...sources[0].at },
  };
}

const server = await createServer({
  configFile: false, root: repo, publicDir: false, cacheDir: resolve(scratch, 'vite'),
  optimizeDeps: { noDiscovery: true, include: [] },
  resolve: { dedupe: ['three'] },
  plugins: [{ name: 'combat-review', configureServer(vite) {
    vite.middlewares.use('/u14-review', (_req, res) => {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(html);
    });
    vite.middlewares.use('/u14-api', (req, res) => {
      void (async () => {
        res.setHeader('Content-Type', 'application/json');
        let body = '';
        for await (const chunk of req) body += chunk;
        const parameters = JSON.parse(body);
        if (req.method !== 'POST' || (req.url !== '/hit' && req.url !== '/threat')) {
          res.writeHead(400).end('{}');
          return;
        }
        const impact = req.url === '/hit' ? hit(parameters.target, parameters.tool) : incomingHurt();
        requests.push({ ...impact, health: survival.status(playerId).health });
        res.end(JSON.stringify(impact));
      })().catch(error => { console.error(error); res.writeHead(500).end('{}'); });
    });
  } }],
  server: { host: '127.0.0.1', port: 0, hmr: false },
});

let browser;
const errors = [];
const distanceBetween = (from, to) => Math.hypot(to.east - from.east, to.north - from.north);
function verifyFreeImpact(report, subject, weight, distance, from) {
  assert.equal(report.subject, subject);
  assert.equal(report.weight, weight);
  assert.deepEqual(report.from, from);
  assert.equal(report.blocked, false);
  assert.ok(Math.abs(report.distance - distance) < 1e-9);
  assert.ok(Math.abs(distanceBetween(report.before, report.after) - distance) < 1e-9);
  assert.ok(Math.abs(distanceBetween(from, report.after) - distanceBetween(from, report.before) - distance) < 1e-9);
}
try {
  await server.listen();
  const address = server.httpServer?.address();
  assert.ok(address && typeof address === 'object');
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 720, height: 480 } });
  page.setDefaultTimeout(12_000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => errors.push(request.url()));
  page.on('response', response => { if (response.status() >= 400) errors.push(response.url()); });
  await page.goto(`http://127.0.0.1:${address.port}/u14-review`);
  await page.waitForFunction(() => window.undergroundCombatProbe?.inspect().drawCalls > 0);
  const inspect = () => page.evaluate(() => window.undergroundCombatProbe.inspect());
  const advancePresentation = ms => page.evaluate(ms => window.undergroundCombatProbe.advance(ms), ms);
  const click = async count => {
    await page.mouse.click(360, 240);
    await page.waitForFunction(n => window.undergroundCombatProbe.inspect().sent === n, count);
    return inspect();
  };

  assert.equal((await inspect()).aimed, 'clump');
  const wrong = await click(1);
  assert.equal(wrong.receipts.at(-1).outcome, 'wrong-tool');
  assert.deepEqual(wrong.effects, []);
  assert.deepEqual(wrong.numbers, []);
  assert.deepEqual(wrong.impacts, []);
  assert.equal(wrong.debrisCount, 0);
  assert.equal(wrong.audioPeak, 0);
  await page.keyboard.press('Digit2');
  await click(2);
  await page.waitForFunction(() => window.undergroundCombatProbe.inspect().audioPeak > .002);
  const ice = await inspect();
  assert.equal(ice.receipts.at(-1).outcome, 'defeated');
  assert.deepEqual(ice.effects.at(-1), {
    id: 'clump', family: 'ice', holdMs: 40, flashMs: 110, stagger: 'small', extraStaggerMs: 80,
  });
  assert.deepEqual(ice.held.map(([id]) => id), ['clump']);
  assert.equal(ice.numbers[0].text, '1');
  assert.match(ice.numbers[0].transform, /translate\(.+px, .+px\)/);
  assert.equal(ice.colors[0], 'ffffff');
  assert.equal(ice.debrisCount, 6);
  assert.ok(ice.firstDebris);
  assert.equal(ice.impacts.length, 1);
  verifyFreeImpact(ice.impacts[0], 'clump', 'light', .22, requests[1].from);
  await page.screenshot({ path: resolve(output, 'ice-hit.png') });
  await advancePresentation(39);
  assert.equal((await inspect()).held.length, 1);
  await advancePresentation(1);
  const thawed = await inspect();
  assert.deepEqual(thawed.held, []);
  assert.notEqual(thawed.targetTurns[0], ice.targetTurns[0]);
  assert.equal(thawed.targetTurns[1], ice.targetTurns[1]);
  assert.notDeepEqual(thawed.firstDebris, ice.firstDebris);
  await advancePresentation(70);
  const afterFlash = await inspect();
  assert.notEqual(afterFlash.colors[0], 'ffffff');
  assert.equal(afterFlash.targetTurns[0], thawed.targetTurns[0]);
  assert.equal(afterFlash.debrisCount, 6);
  await advancePresentation(10);
  assert.equal((await inspect()).targetTurns[0], ice.targetTurns[0]);
  await advancePresentation(120);
  assert.equal((await inspect()).debrisCount, 0);
  await advancePresentation(400);
  assert.deepEqual((await inspect()).numbers, []);
  assert.equal(await page.evaluate(() => window.undergroundCombatProbe.replay()), false);
  assert.equal((await inspect()).impacts.length, 1);

  await page.waitForTimeout(220);
  await page.evaluate(() => {
    window.undergroundCombatProbe.resetAudioPeak();
    window.undergroundCombatProbe.aim('skeleton');
  });
  await page.keyboard.press('Digit1');
  assert.equal((await inspect()).aimed, 'skeleton');
  await click(3);
  await page.waitForFunction(() => window.undergroundCombatProbe.inspect().audioPeak > .002);
  const metal = await inspect();
  assert.equal(metal.receipts.at(-1).outcome, 'damaged');
  assert.deepEqual(metal.effects.at(-1), {
    id: 'skeleton', family: 'metal', holdMs: 40, flashMs: 110, stagger: 'medium', extraStaggerMs: 0,
  });
  assert.equal(metal.colors[1], 'ffffff');
  assert.equal(metal.numbers[0].text, '1');
  assert.equal(metal.debrisCount, 5);
  assert.equal(metal.impacts.length, 2);
  verifyFreeImpact(metal.impacts[1], 'skeleton', 'medium', .46, requests[2].from);
  await page.screenshot({ path: resolve(output, 'metal-hit.png') });

  await page.keyboard.press('w');
  await page.waitForFunction(() => window.undergroundCombatProbe.inspect().sent === 4);
  await advancePresentation(40);
  const hurt = await inspect();
  assert.deepEqual(hurt.held, []);
  assert.equal(hurt.targetTurns[1], metal.targetTurns[1]);
  assert.notDeepEqual(hurt.firstDebris, metal.firstDebris);
  assert.equal(hurt.receipts.at(-1).damage, 16);
  assert.equal(requests.at(-1).health, 84);
  assert.ok(hurt.rim > 0 && Math.hypot(...hurt.shake) > 0);
  assert.match(hurt.transform, /^translate\(/);
  assert.equal(hurt.overlayPointerEvents, 'none');
  assert.deepEqual(hurt.view, metal.view);
  assert.equal(hurt.impacts.length, 3);
  verifyFreeImpact(hurt.impacts[2], 'player', 'medium', .46, requests[3].from);
  assert.deepEqual(hurt.foot, hurt.impacts[2].after);
  await page.screenshot({ path: resolve(output, 'player-hurt.png') });
  await page.keyboard.press('w');
  await page.keyboard.press('ArrowLeft');
  const steered = await inspect();
  assert.ok(steered.footZ < hurt.footZ);
  assert.notDeepEqual(steered.view, hurt.view);
  assert.ok(steered.rim > 0);
  assert.ok(steered.events.every(event => event.trusted));

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => window.undergroundCombatProbe.inspect().transform === '');
  const reduced = await inspect();
  assert.deepEqual(reduced.shake, [0, 0]);
  assert.ok(reduced.rim > 0);
  await page.evaluate(() => window.undergroundCombatProbe.setLayer('review-crystal'));
  assert.equal(await page.evaluate(() => window.undergroundCombatProbe.replayInOtherLayer()), false);
  const cleared = await inspect();
  assert.equal(cleared.rim, 0);
  assert.deepEqual(cleared.numbers, []);
  assert.deepEqual(cleared.held, []);
  assert.equal(cleared.debrisCount, 0);
  assert.equal(cleared.firstDebris, null);
  await page.evaluate(() => window.undergroundCombatProbe.setLayer('review-mine'));
  assert.equal(await page.evaluate(() => window.undergroundCombatProbe.replay()), false);
  assert.equal((await inspect()).impacts.length, 3);
  const heavy = await page.evaluate(() => window.undergroundCombatProbe.heavyAgainstWall());
  assert.equal(heavy.report.weight, 'heavy');
  assert.equal(heavy.report.blocked, true);
  assert.ok(heavy.report.distance > 0 && heavy.report.distance < .86);
  assert.ok(Math.abs(heavy.report.distance - distanceBetween(heavy.report.before, heavy.report.after)) < 1e-9);
  assert.equal(heavy.report.before.north, heavy.report.after.north);
  assert.ok(heavy.report.after.east + heavy.bodyRadius <= heavy.wallInnerEast);
  assert.ok(heavy.wallInnerEast - heavy.bodyRadius - heavy.report.after.east < .05);
  await page.screenshot({ path: resolve(output, 'heavy-wall.png') });
  assert.deepEqual(errors, []);

  await writeFile(resolve(output, 'combat-review.json'), JSON.stringify({
    scope: 'Original encounter and survival authority. Local room collision, presentation clock and WebGL actors are fixtures. The heavy wall impact is staged separately.',
    browser: browser.version(), requests, wrong, ice, thawed, afterFlash, metal, hurt, steered, reduced, cleared, heavy, errors,
  }, null, 2) + '\n');
  console.log('U-14: Chromium confirmed distinct debris, common 40 ms holds, ice-only recoil, uninterrupted steering and wall-clipped knockback.');
} catch (error) {
  await writeFile(resolve(output, 'failure.json'), JSON.stringify({
    error: String(error), requests, errors, health: survival.status(playerId).health,
  }, null, 2) + '\n');
  throw error;
} finally {
  try { await browser?.close(); } finally {
    await server.close();
    await rm(scratch, { recursive: true, force: true });
  }
}
