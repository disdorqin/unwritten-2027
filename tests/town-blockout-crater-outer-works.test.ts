import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Light, Mesh } from 'three';
import { createTerrainGrid, worldBounds } from '../tools/voxel-tavern/town-blockout/terrain';
import { mountWestCraterRoad } from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import { buildCraterOuterWorks, craterBeltTrackCorridor } from '../tools/voxel-tavern/town-blockout/town-crater-outer-works';

const terrain = createTerrainGrid();
const road = mountWestCraterRoad(worldBounds.depth, north => terrain.groundHeightAt(0, north));
const { sites, fencePosts } = buildCraterOuterWorks(road);
const byId = new Map(sites.map(s => [s.id, s]));
const anchor = road.anchor;

test('crater outer works: industrial belt, ruins and isolation sites all land', () => {
  for (const id of [
    'smelter-plant', 'instrument-plant', 'ore-yard', 'ruined-shed',
    'wall-south-end', 'wall-gate', 'wall-north-end', 'gatehouse',
    'north-tower', 'west-tower', 'gate-tower', 'fence-station-crossing',
    'pipe-section-1', 'pipe-section-2', 'pipe-section-3',
    'outer-cluster-1', 'outer-cluster-8', 'approach-cluster-118', 'approach-cluster-208',
  ]) assert.ok(byId.has(id), `missing site ${id}`);
  for (let i = 1; i <= 6; i++) assert.ok(byId.has(`foundation-stub-${i}`), `missing stub ${i}`);
});

test('crater outer works: wall runs at least 300 m with its gate on the approach line', () => {
  const south = byId.get('wall-south-end')!;
  const north = byId.get('wall-north-end')!;
  const gate = byId.get('wall-gate')!;
  assert.ok(Math.abs(north.north - south.north) >= 300, `wall span ${north.north - south.north}`);
  assert.ok(Math.abs(gate.north - 159) < 1, 'gate sits on the crater approach line');
  const gatehouse = byId.get('gatehouse')!;
  assert.ok(gatehouse.east > gate.east, 'gatehouse stands on the town side of the wall');
});

test('crater outer works: towers meet the scaled heights and the north tower tops the set', () => {
  for (const id of ['north-tower', 'west-tower', 'gate-tower']) {
    assert.ok((byId.get(id)!.topHeight ?? 0) >= 12, `${id} below the 12 m floor`);
  }
  assert.ok(byId.get('north-tower')!.topHeight! > byId.get('west-tower')!.topHeight!);
});

test('crater outer works: fence ring is continuous except its designed openings', () => {
  assert.ok(fencePosts.length >= 150, `only ${fencePosts.length} fence posts`);
  const bearings = new Set(fencePosts.map(p => p.bearing));
  for (const probe of [0, 60, 130, 200, 260, 330]) {
    assert.ok([...bearings].some(b => Math.abs(b - probe) <= 3), `no fence near bearing ${probe}`);
  }
  for (const p of fencePosts) {
    assert.ok(!(p.bearing > 102 && p.bearing < 109), `post inside the station crossing gap at ${p.bearing}`);
    assert.ok(!(p.bearing >= 146 && p.bearing < 184), `post duplicates the built gate segment at ${p.bearing}`);
    assert.ok(!((p.bearing >= 19 && p.bearing <= 23) || (p.bearing >= 284 && p.bearing <= 288)),
      `post inside a collapsed gap at ${p.bearing}`);
  }
});

test('crater outer works: the reserved narrow-gauge corridor stays clear of the belt', () => {
  const corridor = craterBeltTrackCorridor.map(([b, r]) => {
    const rad = b * Math.PI / 180;
    return { east: anchor.east + r * Math.sin(rad), north: anchor.north + r * Math.cos(rad) };
  });
  const distToCorridor = (east: number, north: number) => {
    let best = Infinity;
    for (let i = 0; i < corridor.length - 1; i++) {
      const a = corridor[i], c = corridor[i + 1];
      const vx = c.east - a.east, vz = c.north - a.north;
      const t = Math.max(0, Math.min(1, ((east - a.east) * vx + (north - a.north) * vz) / (vx * vx + vz * vz)));
      best = Math.min(best, Math.hypot(east - (a.east + vx * t), north - (a.north + vz * t)));
    }
    return best;
  };
  const instrument = byId.get('instrument-plant')!;
  assert.ok(distToCorridor(instrument.east, instrument.north) >= 6, 'instrument plant crowds the track corridor');
  const yardSite = byId.get('ore-yard')!;
  assert.ok(distToCorridor(yardSite.east, yardSite.north) >= 4, 'ore yard crowds the track corridor');
  const smelter = byId.get('smelter-plant')!;
  assert.ok(distToCorridor(smelter.east, smelter.north) <= 9, 'track corridor must reach the smelter door');
});

test('crater outer works: ledger stays inside the approved mainline-2 budget', () => {
  const { group } = buildCraterOuterWorks(road);
  let draws = 0, triangles = 0, lights = 0;
  group.traverse(node => {
    if ((node as Light).isLight) lights++;
    if ((node as Mesh).isMesh) {
      const mesh = node as Mesh & { count?: number };
      draws++;
      triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) * (mesh.count ?? 1) / 3;
    }
  });
  assert.ok(draws <= 30, `draws ${draws}`);
  assert.ok(triangles <= 110000, `triangles ${triangles}`);
  assert.equal(lights, 1, 'only the active north tower burns a real light');
});
