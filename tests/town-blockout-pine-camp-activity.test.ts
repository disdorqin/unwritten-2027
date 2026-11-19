import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPineCampActivity, createPineCampProgress, pineCampActivityAnchors } from '../tools/voxel-tavern/town-blockout/town-pine-camp-activity';

function oldStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); },
  };
}

function fixture(storage = oldStorage()) {
  const formations: unknown[][] = [];
  const trails: boolean[] = [];
  let rewards = 0;
  let formed = 0;
  const progress = createPineCampProgress({
    storage,
    setFormation(...args) { formations.push(args); },
    setTreasureTrailVisible(visible) { trails.push(visible); },
    onTreasureFound() { rewards++; },
    onSnowmanFormed() { formed++; },
  });
  return { progress, formations, trails, rewards: () => rewards, formed: () => formed, storage };
}

test('walked snow grows at the approved rate and a three-layer snowman keeps its name and materials', () => {
  const { progress, storage, formed, formations } = fixture();
  const walk = (x: number, n: number, snow: 'shallow' | 'deep' | 'other' = 'shallow') =>
    progress.roll({ x, n, snow });

  progress.take('carrot');
  progress.take('branches');
  assert.equal(progress.start(3), true);
  walk(405, 153);
  walk(415, 153);
  assert.equal(progress.state().rolling?.radius, .15);

  walk(425, 153, 'other');
  walk(425, 174, 'shallow');
  assert.equal(progress.state().rolling?.radius, .15);

  walk(405, 174, 'deep');
  assert.ok(Math.abs(progress.state().rolling!.radius - .6) < 1e-12);
  progress.roll();
  walk(405, 153);
  assert.ok(Math.abs(progress.state().rolling!.radius - .6) < 1e-12);
  walk(403, 153);
  walk(425, 153);
  assert.ok(Math.abs(progress.state().rolling!.radius - .6) < 1e-12);

  const route = [[425, 174], [405, 174], [405, 153], [425, 153]] as const;
  for (const [x, n] of [...route, ...route, ...route]) walk(x, n);
  assert.equal(progress.state().snowman?.layers, 3);
  assert.equal(formed(), 1);
  assert.deepEqual(progress.state().snowman?.decorations, { carrot: true, branches: true });
  assert.equal(progress.name('123456789'), 'invalid');
  assert.equal(progress.name('  松林雪偶  '), 'saved');
  assert.deepEqual(formations.at(-1), [3, '松林雪偶', { carrot: true, branches: true }]);
  assert.equal(progress.start(2), false);

  const restored = fixture(storage);
  assert.deepEqual(restored.progress.state().snowman, progress.state().snowman);
  assert.equal(restored.formed(), 0);
});

test('two-layer rolling supports local continuation and browser storage failure is surfaced', () => {
  const storage = { getItem: () => '{broken', setItem: () => { throw new Error('quota'); } };
  const { progress, formed } = fixture(storage);
  assert.equal(progress.start(2), true);
  const route = [[405, 153], [425, 153], [425, 174], [405, 174]] as const;
  for (const [x, n] of [...route, ...route, ...route])
    progress.roll({ x, n, snow: 'deep' });
  assert.equal(formed(), 1);
  assert.equal(progress.state().snowman?.layers, 2);
  assert.equal(progress.name('雪偶'), 'session');
  assert.equal(progress.state().snowman?.name, '雪偶');
});

test('the four exact anchors gate treasure progress and emit the end-point callback once', () => {
  const { progress, trails, rewards, storage } = fixture();
  assert.deepEqual(pineCampActivityAnchors.clueSites.map(step => step.at),
    [[399, 189], [415, 227], [426, 172], [430, 320]]);
  assert.equal(progress.visit(3), false);
  assert.equal(progress.visit(0), true);
  assert.equal(progress.visit(0), false);
  assert.equal(progress.visit(2), false);
  assert.equal(progress.visit(1), true);
  assert.deepEqual(trails, [false, false, false]);
  assert.equal(progress.visit(2), true);
  assert.equal(trails.at(-1), true);
  assert.equal(progress.visit(3), true);
  assert.equal(progress.visit(3), false);
  assert.equal(rewards(), 1);
  assert.equal(progress.state().clues, 4);
  const restored = fixture(storage);
  assert.equal(restored.progress.state().clues, 4);
  assert.equal(restored.rewards(), 0);
  assert.equal(restored.trails.at(-1), true);
});

test('viewer activity keeps exact anchors, checks reachable footings and gates the mountain endpoint', () => {
  const storage = oldStorage();
  storage.setItem('unwritten:pine-camp.v1', JSON.stringify({ clues: 3 }));
  let endpointReady = false;
  let rollChecks = 0;
  const activity = createPineCampActivity({
    open() { throw new Error('the readiness probe must not open a panel'); },
    announce() {},
  }, {
    storage,
    heightAt: () => 12,
    canStand(x, n) {
      return x === 399.775 && n === 189 || x === 430 && n === 320;
    },
    rollingAt() { rollChecks++; return undefined; },
    treasureEndpointReady: () => endpointReady,
    setFormation() {},
    setTreasureTrailVisible() {},
  });
  const [gate, , materials, end] = activity.spots;
  assert.deepEqual([gate.x, gate.n, gate.ground], [399, 189, 12]);
  assert.equal(gate.available?.(), true, 'a clear footing inside the interaction radius is enough');
  assert.equal(materials.available?.(), false, 'no safe footing means no active prop');
  assert.deepEqual([end.x, end.n], [430, 320]);
  assert.equal(end.available?.(), false, 'unsafe mountain phase cannot claim the treasure endpoint');
  endpointReady = true;
  assert.equal(end.available?.(), true);
  activity.update?.(.016);
  assert.equal(rollChecks, 0, 'idle activity leaves the terrain probe alone');
});
