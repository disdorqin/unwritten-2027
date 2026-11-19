import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Color, Group, InstancedMesh, Matrix4, MeshBasicMaterial } from 'three';
import { buildCultureLandmark } from '../tools/voxel-tavern/town-blockout/landmark-culture.ts';
import { readWalkGeometry } from '../tools/voxel-tavern/town-blockout/landmark-kit.ts';
import {
  createLongHallRelay, longHallRelayCelebrationMs, longHallRelayCueMs, longHallRelayLamps,
  longHallRelayStart, longHallRelayStorageKey, longHallRelayTimeMs,
} from '../tools/voxel-tavern/town-blockout/long-hall-relay.ts';
import { layout } from '../tools/voxel-tavern/town-blockout/terrain.ts';

test('the six-lamp shuffle previews each lamp, rejects wrong order, and saves an on-time solo finish', () => {
  const group = new Group();
  const frames: { modes: string[]; hallLit: boolean }[] = [];
  group.userData.longHallRelayLights = (modes: string[], hallLit: boolean) => frames.push({ modes: [...modes], hallLit });
  let time = 0;
  let awards = 0;
  const entries = new Map<string, string>();
  const messages: string[] = [];
  const statuses: string[] = [];
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
  };
  const relay = createLongHallRelay(group, { announce: text => messages.push(text) }, {
    now: () => time, random: () => 0, storage, award: () => { awards++; }, status: text => statuses.push(text),
  });
  const [start, ...lamps] = relay.spots;
  assert.equal(lamps.length, 6);
  assert.ok(lamps.every(spot => spot.available?.() === false));
  start.run();
  assert.match(statuses.at(-1)!, /入口右灯/);
  assert.equal(lamps[1].label, '点亮入口右灯');
  const previewOrder: number[] = [];
  for (let index = 0; index < lamps.length; index++) {
    time = longHallRelayCueMs * index;
    relay.update();
    const last = frames.at(-1)!;
    assert.equal(last.modes.filter(mode => mode === 'cue').length, 1);
    previewOrder.push(last.modes.indexOf('cue'));
  }
  assert.deepEqual(previewOrder, [1, 2, 3, 4, 5, 0]);

  time = lamps.length * longHallRelayCueMs;
  relay.update();
  assert.match(statuses.at(-1)!, /剩余 30 秒/);
  lamps[0].run();
  assert.equal(relay.state().phase, 'idle');
  assert.equal(awards, 0);
  assert.match(messages.at(-1)!, /次序有误/);
  assert.ok(frames.at(-1)!.modes.every(mode => mode === 'idle'));

  start.run();
  time += lamps.length * longHallRelayCueMs;
  relay.update();
  time += longHallRelayTimeMs;
  relay.update();
  assert.equal(relay.state().phase, 'idle');
  assert.match(messages.at(-1)!, /时间到了/);

  start.run();
  time += lamps.length * longHallRelayCueMs;
  relay.update();
  for (const index of previewOrder) {
    assert.equal(lamps[index].available?.(), true);
    time += 800;
    lamps[index].run();
  }
  assert.equal(awards, 1);
  assert.equal(relay.state().bestMs, 4800);
  assert.equal(entries.get(longHallRelayStorageKey), '[4800]');
  assert.equal(start.available?.(), false);
  assert.deepEqual(frames.at(-1), { modes: Array(6).fill('full'), hallLit: true });

  time += longHallRelayCelebrationMs - 1;
  relay.update();
  assert.equal(frames.at(-1)!.hallLit, true);
  time++;
  relay.update();
  assert.equal(frames.at(-1)!.hallLit, false);
  assert.equal(start.available?.(), true);
  assert.equal(statuses.at(-1), '');
  const reloaded = createLongHallRelay(group, { announce() {} }, { storage });
  assert.equal(reloaded.state().bestMs, 4800);
});

test('seven relay stands have clear walking lines and reuse the existing hall light batch', () => {
  const plot = layout.plots.find(({ id }) => id === 'long-hall')!;
  const group = buildCultureLandmark(plot);
  group.position.set(plot.origin[0], plot.origin[2], -plot.origin[1]);
  const { colliders, floors } = readWalkGeometry(group);
  const activity = createLongHallRelay(group, { announce() {} }, { now: () => 0, random: () => 0 });
  const { x, n, ground } = activity.spots[0];
  assert.equal(x, 378);
  assert.equal(n, 311.35);
  assert.equal(ground, 36.1);

  const radius = .27;
  for (const a of activity.spots) for (const b of activity.spots) {
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.n - a.n) / .2));
    for (let i = 0; i <= steps; i++) {
      const x = a.x + (b.x - a.x) * i / steps;
      const z = -(a.n + (b.n - a.n) * i / steps);
      const y = a.ground;
      assert.ok(floors.some(({ min, max }) => min[0] <= x && max[0] >= x && min[2] <= z && max[2] >= z &&
        Math.abs(max[1] - y) < .001), 'the built floor supports every relay route');
      assert.ok(!colliders.some(({ min, max }) => y + .025 < max[1] && y + 1.775 > min[1] &&
        Math.hypot(Math.max(min[0] - x, x - max[0], 0), Math.max(min[2] - z, z - max[2], 0)) < radius),
      'no wall, column or furniture intersects the player path');
    }
  }

  const topBatches = group.children.filter(child => child instanceof InstancedMesh);
  assert.equal(topBatches.length, 2);
  const light = topBatches.find(mesh => mesh.material instanceof MeshBasicMaterial)!;
  assert.ok(light);
  const fixtureSlots = longHallRelayLamps.map(({ fixture: [x, y, z] }) => {
    const matrix = new Matrix4();
    for (let i = 0; i < light.count; i++) {
      light.getMatrixAt(i, matrix);
      const [px, py, pz] = matrix.elements.slice(12, 15);
      if (Math.hypot(x - px, y - py, z - pz) < 1e-5) return i;
    }
    throw new Error('a relay lamp core is missing from the shared batch');
  });
  const idle = new Color();
  light.getColorAt(fixtureSlots[1], idle);
  activity.spots[0].run();
  const lit = new Color();
  light.getColorAt(fixtureSlots[1], lit);
  assert.ok(lit.r > idle.r);
  assert.deepEqual(longHallRelayStart, [0, 1.1, 4.65]);
  assert.equal(group.getObjectsByProperty('isLight', true).length, 0);
});
