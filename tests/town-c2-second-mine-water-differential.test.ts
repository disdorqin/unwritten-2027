import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, InstancedMesh, Mesh, MeshBasicMaterial } from 'three';
import {
  mountTownC2SecondMineWaterDifferential,
} from '../tools/voxel-tavern/town-blockout/town-c2-second-mine-water-differential.js';
import { mountRegisteredSecondMineDomain } from '../tools/voxel-tavern/town-blockout/town-c-second-mine-domain.js';
import { createUndergroundWaterState } from '../src/presence/underground-water-state.js';
import { townDayMs } from '../src/shared/town-night-window.js';
import {
  secondMineRegisteredFeet, secondMineToWorld,
} from '../src/shared/underground-second-mine-presence-domain.js';
import { secondMineAnchors, secondMineBed } from '../src/shared/underground-second-mine-layout.js';
import type { AcceptedUndergroundWaterSnapshot } from '../src/shared/town-c-water-snapshot-port.js';

function snapshot(level: 'low' | 'mid' | 'high', phase: 'rise' | 'level' | 'fall'): AcceptedUndergroundWaterSnapshot {
  return { nightOrdinal: 0, phase, baseLevel: level, pumpOffset: 0, level };
}

function renderCensus(parent: Group) {
  let meshes = 0, triangles = 0, lights = 0;
  parent.traverse(object => {
    if (object.type === 'DirectionalLight' || object.type === 'PointLight' || object.type === 'SpotLight') lights++;
    if (!(object instanceof Mesh)) return;
    meshes++;
    const vertices = object.geometry.index
      ? object.geometry.index.count
      : object.geometry.getAttribute('position')?.count ?? 0;
    triangles += vertices / 3 * (object instanceof InstancedMesh ? object.count : 1);
  });
  return { meshes, triangles, lights };
}

test('C2-07 beauty pass keeps seven meshes/1488 triangles while strengthening current, wet bed and grounded boat tones', () => {
  const parent = new Group();
  let accepted: AcceptedUndergroundWaterSnapshot | undefined = snapshot('high', 'level');
  const fx = mountTownC2SecondMineWaterDifferential({ parent, readAcceptedWater: () => accepted });
  const census = renderCensus(parent);
  assert.deepEqual(census, { meshes: 7, triangles: 1488, lights: 0 });
  const flow = fx.group.getObjectByName('town-c2-water/high-flow-streaks');
  assert.ok(flow instanceof InstancedMesh);
  assert.equal(flow.count, 18);
  assert.ok(flow.instanceColor);
  assert.ok(flow.material instanceof MeshBasicMaterial);
  assert.equal(flow.material.opacity, .4);
  fx.setNight(true);
  assert.equal(flow.material.opacity, .56, 'night brightens the same flow draw without adding a light');
  fx.setNight(false);
  assert.equal(flow.material.opacity, .4);

  accepted = snapshot('low', 'level');
  assert.equal(fx.sync().level, 'low');
  for (const [name, count] of [
    ['town-c2-water/low-wet-riverbed', 26],
    ['town-c2-water/low-riverbed-stones', 42],
    ['town-c2-water/grounded-ferry-hull', 32],
    ['town-c2-water/grounded-ferry-pole', 2],
  ] as const) {
    const detail = fx.group.getObjectByName(name);
    assert.ok(detail instanceof InstancedMesh);
    assert.equal(detail.count, count);
    assert.ok(detail.instanceColor, name + ' uses per-instance material tone variation');
  }
  assert.deepEqual(renderCensus(parent), census);
  accepted = snapshot('mid', 'level');
  fx.sync();
  assert.deepEqual(renderCensus(parent), census);
  fx.dispose();
});

test('C2-07 uses effective level rather than phase and renders high/mid/low differential forms', () => {
  const parent = new Group();
  let accepted: AcceptedUndergroundWaterSnapshot | undefined = {
    nightOrdinal: 2, phase: 'fall', baseLevel: 'low', pumpOffset: 2, level: 'high',
  };
  const fx = mountTownC2SecondMineWaterDifferential({ parent, readAcceptedWater: () => accepted });
  assert.equal(fx.group.parent, parent);
  assert.equal(fx.sync().waterMode, 'raised');
  assert.equal(fx.stats().ferryRunning, false);
  assert.equal(fx.stats().groundedBoat, false);
  assert.equal(fx.stats().flowStreakCount, 18);
  assert.deepEqual(['high-flow', 'mid-ferry', 'low-dry-bed'].map(name =>
    fx.group.getObjectByName('town-c2-water/' + name)?.visible), [true, false, false]);

  accepted = { nightOrdinal: 0, phase: 'rise', baseLevel: 'high', pumpOffset: -1, level: 'mid' };
  assert.equal(fx.sync().waterMode, 'baseline');
  assert.equal(fx.stats().ferryRunning, true);
  assert.equal(fx.stats().groundedBoat, false);
  assert.deepEqual(['high-flow', 'mid-ferry', 'low-dry-bed'].map(name =>
    fx.group.getObjectByName('town-c2-water/' + name)?.visible), [false, true, false]);

  accepted = { nightOrdinal: 2, phase: 'fall', baseLevel: 'mid', pumpOffset: -1, level: 'low' };
  assert.equal(fx.sync().waterMode, 'hidden');
  assert.equal(fx.stats().ferryRunning, false);
  assert.equal(fx.stats().groundedBoat, true);
  assert.equal(fx.stats().riverbedPatchCount, 26);
  assert.equal(fx.stats().riverbedStoneCount, 42);
  assert.deepEqual(['high-flow', 'mid-ferry', 'low-dry-bed'].map(name =>
    fx.group.getObjectByName('town-c2-water/' + name)?.visible), [false, false, true]);
  assert.equal(fx.stats().realLightCount, 0);
  assert.equal(fx.stats().colliderCount, 0);
  const resources = new Set<{ dispose(): void }>();
  fx.group.traverse(object => {
    if (!(object instanceof Mesh)) return;
    resources.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      resources.add(material);
    }
  });
  let disposeCount = 0;
  for (const resource of resources) {
    const dispose = resource.dispose.bind(resource);
    resource.dispose = () => { disposeCount++; dispose(); };
  }
  fx.dispose();
  fx.dispose();
  assert.equal(disposeCount, resources.size);
  assert.equal(fx.group.parent, null);
  assert.equal(parent.children.length, 0);
});

test('C2-07 missing or malformed authority is explicitly unconfigured and never falls back to a fake phase', () => {
  const parent = new Group();
  let accepted: AcceptedUndergroundWaterSnapshot | undefined;
  const fx = mountTownC2SecondMineWaterDifferential({ parent, readAcceptedWater: () => accepted });
  assert.equal(fx.sync().configured, false);
  assert.equal(fx.sync().waterMode, 'unconfigured');
  assert.equal(fx.group.visible, false);
  accepted = { ...snapshot('high', 'rise'), phase: 'bad' } as unknown as AcceptedUndergroundWaterSnapshot;
  assert.equal(fx.sync().configured, false);
  assert.equal(fx.group.visible, false);
  fx.dispose();
});

test('C2-07 rides the registered second-mine frame without locking the all-water dry bypass', () => {
  const parent = new Group();
  let now = 0;
  const authority = createUndergroundWaterState({ dawnEpoch: 0, now: () => now });
  const host = mountRegisteredSecondMineDomain({ parent, readAcceptedWater: authority.tonight });
  assert.equal(host.kind, 'ready');
  if (host.kind !== 'ready') assert.fail();
  const fx = mountTownC2SecondMineWaterDifferential({ parent: host.group, readAcceptedWater: authority.tonight });
  try {
    for (const [night, level] of ['high', 'mid', 'low'].entries()) {
      now = night * townDayMs;
      assert.equal(host.sync(), true);
      assert.equal(fx.sync().level, level);
      const route = [secondMineAnchors.entry, ...secondMineAnchors.bypass, secondMineAnchors.exit];
      for (let index = 1; index < route.length; index++) {
        const a = route[index - 1]!, b = route[index]!;
        const steps = Math.ceil(Math.hypot(b.east - a.east, b.north - a.north) * 4);
        for (let step = 0; step <= steps; step++) {
          const t = step / steps;
          const p = secondMineToWorld({
            east: a.east + (b.east - a.east) * t,
            north: a.north + (b.north - a.north) * t,
            height: 0,
          });
          assert.equal(host.passageAt(p.east, p.north)?.floor, -140);
        }
      }
      for (let step = 0; step <= 40; step++) {
        const north = 132 + step / 4;
        const p = secondMineToWorld({ east: 0, north, height: 0 });
        const passage = host.passageAt(p.east, p.north);
        if (level === 'low') assert.equal(passage?.floor, -140 + secondMineBed(north));
        else assert.equal(passage, undefined);
      }
    }
    assert.equal(host.toWorld({ east: 0, height: 0, north: 2 })?.height, secondMineRegisteredFeet.entry.height);
  } finally {
    fx.dispose();
    host.dispose();
  }
  assert.equal(parent.children.length, 0);
});
