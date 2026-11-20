import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, type Mesh } from 'three';
import { createSkyCityApproach } from '../tools/voxel-tavern/town-blockout/sky-city-approach';
import { mountSkyCity, skyCityTier, type SkyCityFoot } from '../tools/voxel-tavern/town-blockout/sky-city';

test('valley has no island and the summit loads one low-detail mesh before the close flight view', () => {
  const layer = new Group();
  const city = mountSkyCity(layer);
  city.show(skyCityTier('ground', 0));
  assert.equal(layer.children.length, 0);
  city.show(skyCityTier('summit', 45));
  const silhouette = layer.children[0]!;
  const meshes: Mesh[] = [];
  silhouette.traverse(object => { if ((object as Mesh).isMesh) meshes.push(object as Mesh); });
  assert.equal(meshes.length, 1);
  assert.ok((meshes[0]!.geometry.index?.count ?? meshes[0]!.geometry.attributes.position!.count) / 3 < 2_000);
  city.update(11);
  assert.notEqual(silhouette.rotation.y, 0);
  city.show(skyCityTier('aircraft', 145));
  assert.equal(layer.children.length, 1);
  assert.notEqual(layer.children[0], silhouette);
  assert.equal(silhouette.parent, null);
  city.show('hidden');
  assert.equal(layer.children.length, 0);
  city.dispose();
});

test('an actual glide lands on the city and its floors lead into the dormitory and up to a locked gate', t => {
  const city = mountSkyCity(new Group());
  city.show('full');
  const model = city.footModel()!;
  const aircraft = createSkyCityApproach({ islandFloorAt: model.floorAt, islandBlocked: model.obstructs });
  assert.equal(aircraft.launch(), true);
  let state = aircraft.snapshot();
  for (let i = 0; i < 1_800 && state.stage === 'flight'; i++) state = aircraft.advance(1 / 60);
  assert.equal(state.stage, 'walking');
  assert.equal(state.flight?.recovery, null);
  const spawn = { x: state.feet.east, y: 0, z: -state.feet.north };
  const [gx, gy, gz] = model.gate;

  function travel(foot: SkyCityFoot, route: readonly (readonly [number, number, number])[]) {
    for (const [x, y, z] of route) {
      const start = foot;
      const steps = Math.max(1, Math.ceil(Math.hypot(x - start.x, z - start.z) / .055));
      for (let step = 1; step <= steps; step++) {
        const east = start.x + (x - start.x) * step / steps;
        const south = start.z + (z - start.z) * step / steps;
        const next = model.step(foot, east, south);
        assert.ok(next, `blocked at ${east},${south} en route to ${x},${y},${z}`);
        foot = next;
      }
      assert.ok(Math.abs(foot.y - y) <= .31);
    }
    return foot;
  }

  const dorm = travel(spawn, model.dormRoute);
  const outside = travel(dorm, [...model.dormRoute].reverse());
  const gateApproach = travel(outside, [[-13, 0, -18], [0, 0, -24], ...model.towerRoute]);
  assert.equal(gateApproach.y, gy);
  assert.ok(Math.hypot(gateApproach.x - gx, gateApproach.z - gz) < 3);
  assert.equal(model.step(gateApproach, gx, gz), undefined);
  assert.equal(model.step(spawn, 0, 0), undefined);
  assert.equal(model.step(spawn, 0, 68), undefined);
  t.diagnostic(JSON.stringify({ flightSeconds: state.flight?.elapsed, spawn, gateApproach }));
  city.dispose();
});
