import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Scene } from 'three';
import { createLakeBellDelivery } from '../tools/voxel-tavern/town-blockout/lake-bell-delivery.ts';
import { isLakeSkateIce, lakeSkateGates, lakeSkateStation } from '../tools/voxel-tavern/town-blockout/lake-skate-course.ts';
import { createLakeSkatingActivity } from '../tools/voxel-tavern/town-blockout/lake-skating-activity.ts';
import { canEnter, createTerrainGrid } from '../tools/voxel-tavern/town-blockout/terrain.ts';

const gates = lakeSkateGates.slice(0, 5);
function beforeAndAfter(index: number, offset = 0) {
  const gate = gates[index];
  const previous = index === 0 ? lakeSkateStation : gates[index - 1];
  const span = Math.hypot(gate.x - previous.x, gate.n - previous.n);
  const east = (gate.x - previous.x) / span;
  const north = (gate.n - previous.n) / span;
  const point = (along: number) => ({ x: gate.x + east * along - north * offset, n: gate.n + north * along + east * offset });
  return [point(-.2), point(.2)];
}

test('bell route runs across the existing usable lake ice and accepts five forward crossings then the return', () => {
  const circuit = [lakeSkateStation, ...gates, lakeSkateStation];
  for (let index = 1; index < circuit.length; index++) {
    const from = circuit[index - 1], to = circuit[index];
    const count = Math.ceil(Math.hypot(from.x - to.x, from.n - to.n) * 4);
    for (let step = 0; step <= count; step++) {
      const x = from.x + (to.x - from.x) * step / count;
      const n = from.n + (to.n - from.n) * step / count;
      assert.ok(isLakeSkateIce(x, n) && canEnter(x, n), `Current ice corridor at ${x},${n}`);
    }
  }
  let now = 100;
  const challenge = createLakeBellDelivery(() => now);
  const sample = (p: { x: number; n: number }, grounded = true) => challenge.onPosition(p.x, p.n, .1, grounded);
  assert.equal(challenge.start(), true);
  assert.equal(challenge.start(), false);
  const mark = beforeAndAfter(0);
  sample(mark[1]);
  assert.equal(sample(mark[0]), undefined);
  assert.equal(sample(mark[1], false), undefined);
  assert.equal(sample(lakeSkateStation), undefined);
  for (let index = 0; index < gates.length; index++) {
    const [before, after] = beforeAndAfter(index);
    sample(before);
    assert.deepEqual(sample(after), { kind: 'gate', passed: index + 1 });
  }
  now = 7_400;
  assert.deepEqual(sample(lakeSkateStation), { kind: 'finish', ms: 7_300 });
  assert.equal(sample(lakeSkateStation), undefined);
  assert.equal(challenge.active(), false);
});

test('a bell gate post stalls skating briefly without dropping the held bell or awarding passage', () => {
  const challenge = createLakeBellDelivery(() => 0);
  const [before, after] = beforeAndAfter(0, 1.1);
  challenge.start();
  challenge.onPosition(before.x, before.n, .1, true);
  assert.deepEqual(challenge.onPosition(after.x, after.n, .1, true), { kind: 'post' });
  assert.equal(challenge.active(), true);
  assert.equal(challenge.stalled(), true);
  challenge.onPosition(after.x, after.n, .49, true);
  assert.equal(challenge.stalled(), true);
  challenge.onPosition(after.x, after.n, .02, true);
  assert.equal(challenge.stalled(), false);
  const [retryBefore, retryAfter] = beforeAndAfter(0);
  challenge.onPosition(retryBefore.x, retryBefore.n, .1, true);
  assert.deepEqual(challenge.onPosition(retryAfter.x, retryAfter.n, .1, true), { kind: 'gate', passed: 1 });
});

test('the existing lake-station interaction exposes the bell and launches the grounded skating mode', t => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  class Control {
    textContent = '';
    children: Control[] = [];
    click = () => {};
    append(...items: Control[]) { this.children.push(...items); }
    closest() { return undefined; }
    addEventListener(_type: string, fn: () => void) { this.click = fn; }
  }
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => new Control() } });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  });
  const scene = new Scene();
  const panel = new Control();
  const grid = createTerrainGrid();
  const game = createLakeSkatingActivity({
    scene, open: () => panel as unknown as HTMLElement,
    announce() {}, sit() {}, face() {},
  }, grid.heightAt);
  const [station] = game.spots;
  assert.deepEqual([station.x, station.n], [lakeSkateStation.x, lakeSkateStation.n]);
  station.run();
  const start = panel.children.find(child => child.textContent === '冰上夺宝 · 单人运送');
  assert.ok(start);
  start.click();
  assert.equal(game.enabled(), true);
  assert.equal(game.carryingTreasure(), true);
  assert.equal(scene.getObjectByName('Lake skating checkpoint')?.visible, true);
  assert.ok(scene.getObjectByName('Gold ice treasure bell'));
  game.stop();
  assert.equal(game.carryingTreasure(), false);
});
