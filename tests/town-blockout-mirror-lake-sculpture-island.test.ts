import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, InstancedMesh } from 'three';
import { readWalkGeometry, type Box } from '../tools/voxel-tavern/town-blockout/landmark-kit.ts';
import { createMirrorLakeSculptureIsland } from '../tools/voxel-tavern/town-blockout/mirror-lake-sculpture-island.ts';

const playerRadius = .27;
const iceY = 10;
const nearBox = (east: number, north: number, { min, max }: Box) => Math.hypot(
  Math.max(min[0] - east, east - max[0], 0), Math.max(min[2] + north, -north - max[2], 0),
) < playerRadius;

test('the ice island clears the six registered fishing circles and waits for strict ice under its whole footprint', t => {
  const surveyed: [number, number][] = [];
  const island = createMirrorLakeSculptureIsland((east, north) => {
    surveyed.push([east, north]);
    return (Math.hypot((east - 50) / 27, (north - 185) / 55) - 1) * 55 < -.5 ? iceY : undefined;
  });
  assert.ok(island);
  assert.ok(surveyed.length > 600);
  const circles = [[73.65, 185], [70.70, 209.65], [70.70, 160.35], [58, 231], [58, 139], [26.35, 185]];
  const solids = [...readWalkGeometry(island.group).floors, ...readWalkGeometry(island.group).colliders];
  let clearance = Infinity;
  for (const [east, north] of circles) for (const { min, max } of solids) {
    clearance = Math.min(clearance, Math.hypot(
      Math.max(min[0] - east, east - max[0], 0), Math.max(min[2] + north, -north - max[2], 0),
    ) - 3);
  }
  assert.ok(clearance > 10);
  assert.equal(createMirrorLakeSculptureIsland(() => undefined), undefined);
  assert.equal(createMirrorLakeSculptureIsland(() => 11), undefined);
  assert.equal(createMirrorLakeSculptureIsland((east, north) => east < 49 && north < 201 ? undefined : iceY), undefined);
  t.diagnostic(JSON.stringify({ iceSamples: surveyed.length, clearanceToFishingCircle: clearance }));
  island.dispose();
});

test('the three visible steps lead to a clear tiger footpoint and allow a northward walk around the displays', t => {
  const island = createMirrorLakeSculptureIsland(() => iceY);
  assert.ok(island);
  const { floors, colliders } = readWalkGeometry(island.group);
  const { east, north, height } = island.tigerStoneFootpoint;
  assert.deepEqual({ east, north, height }, { east: 47.5, north: 203.1, height: 11.2 });
  assert.equal(island.onWalkingSurface(50, 195, iceY), false);
  assert.equal(island.onWalkingSurface(50, 198.6, 10.4), true);
  assert.equal(island.onWalkingSurface(east, north, height), true);
  assert.equal(island.onWalkingSurface(east, north, iceY), false);
  const route = [[50, 195], [50, 202.1], [east, north], [47.7, 204.6], [50, 204.9],
    [51.8, 205.1], [51.9, 210.9], [50, 212.4]];
  const seen = new Set<number>();
  let samples = 0;
  function walk(points: number[][], initialFeet: number) {
    let feet = initialFeet;
    for (const [i, [e, n]] of points.slice(1).entries()) {
      const [fromE, fromN] = points[i];
      const steps = Math.ceil(Math.hypot(e - fromE, n - fromN) / .08);
      for (let step = 1; step <= steps; step++) {
        const x = fromE + (e - fromE) * step / steps, z = fromN + (n - fromN) * step / steps;
        const ground = Math.max(iceY, ...floors.filter(floor =>
          floor.max[1] <= feet + .43 && nearBox(x, z, floor)).map(floor => floor.max[1]));
        assert.ok(Math.abs(ground - feet) <= .43, `step at ${x}, ${z}`);
        assert.equal([...floors, ...colliders].some(box =>
          ground + .025 < box.max[1] && ground + 1.8 - .025 > box.min[1] && nearBox(x, z, box)),
        false, `collision at ${x}, ${z}, ${ground}`);
        feet = ground;
        samples++;
        seen.add(ground);
      }
      if (e === east && n === north) assert.equal(feet, height);
    }
    return feet;
  }
  assert.equal(walk(route, iceY), height);
  assert.equal(walk([...route].reverse(), height), iceY);
  assert.deepEqual([...seen].sort((a, b) => a - b), [10, 10.4, 10.8, 11.2]);
  t.diagnostic(JSON.stringify({ samples, supportHeights: [...seen] }));
  island.dispose();
  assert.equal(island.onWalkingSurface(east, north, height), false);
});

test('the island is one drawable batch and frees its own geometry and support on exit', () => {
  const island = createMirrorLakeSculptureIsland(() => iceY);
  assert.ok(island);
  const world = new Group();
  world.add(island.group);
  assert.equal(island.group.children.length, 1);
  const [mesh] = island.group.children;
  assert.ok(mesh instanceof InstancedMesh);
  assert.ok(mesh.count > 200);
  assert.ok(readWalkGeometry(island.group).floors.length > 0);
  const disposed = new Set<string>();
  mesh.addEventListener('dispose', () => disposed.add('mesh'));
  mesh.geometry.addEventListener('dispose', () => disposed.add('geometry'));
  assert.ok(!Array.isArray(mesh.material));
  mesh.material.addEventListener('dispose', () => disposed.add('material'));
  island.dispose();
  island.dispose();
  assert.equal(world.children.length, 0);
  assert.equal(island.group.children.length, 0);
  assert.deepEqual(readWalkGeometry(island.group), { floors: [], colliders: [], ramps: [] });
  assert.equal(disposed.size, 3);
});
