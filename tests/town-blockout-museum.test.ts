import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addDistrictHousing } from '../tools/voxel-tavern/town-blockout/district-layout.ts';
import { addForestDensity } from '../tools/voxel-tavern/town-blockout/forest-density.ts';
import { readWalkGeometry, type Box } from '../tools/voxel-tavern/town-blockout/landmark-kit.ts';
import { buildMuseumLandmark } from '../tools/voxel-tavern/town-blockout/landmark-museum.ts';
import { museumDetailAxis, museumDetailStep, museumHorizontalScale } from '../tools/voxel-tavern/town-blockout/museum-scale.ts';
import { networkStops } from '../tools/voxel-tavern/town-blockout/museum-network.ts';
import { terraceStop } from '../tools/voxel-tavern/town-blockout/museum-terrace.ts';
import { monthStops } from '../tools/voxel-tavern/town-blockout/museum-timeline.ts';
import { addStreetscape } from '../tools/voxel-tavern/town-blockout/streetscape.ts';
import { canEnter, createTerrainGrid, layout } from '../tools/voxel-tavern/town-blockout/terrain.ts';

type Waypoint = readonly [number, number];
type WalkPosition = { x: number; z: number; ground: number };

const plot = layout.plots.find(({ id }) => id === 'memorial')!;
const [originX, originNorth, originY] = plot.origin;
const worldOffset = [originX, originY, -originNorth];
const terrain = createTerrainGrid();
const museum = buildMuseumLandmark();
museum.position.set(originX, originY, -originNorth);
const { colliders, floors, ramps } = readWalkGeometry(museum);
const district = addDistrictHousing(museum, terrain, () => false);
const street = addStreetscape(museum, terrain, district.keepClear);
const forest = addForestDensity(museum, terrain, (x, n, radius) =>
  district.keepClear(x, n, radius) || street.occupied(x, n, radius));

function townPoint([x, z]: Waypoint) {
  return { x: originX + x * museumHorizontalScale, north: originNorth - z * museumHorizontalScale };
}

const entrance: Waypoint = [(plot.connect[0] - originX) / museumHorizontalScale, (originNorth - plot.connect[1]) / museumHorizontalScale];
const doorway: Waypoint = [(plot.door[0] - originX) / museumHorizontalScale, (originNorth - plot.door[1]) / museumHorizontalScale];
const byDoor: Waypoint[] = [entrance, doorway, [0, 10.1]];
const stairApproach: Waypoint[] = [...byDoor, [0, 10.2], [16.98, 10.2], [16.98, 8.45]];
const upperApproach: Waypoint[] = [...stairApproach, [16.98, -10.15], [13.05, -10.15]];
const upperCrossing: Waypoint[] = [...upperApproach, [13.50, -4.0], [-12.90, -4.0]];
const upperStationApproaches: Record<typeof networkStops[number]['id'], Waypoint[]> = {
  collection: [[13.55, -10.15], [13.55, 3.7]],
  terminal: [[13.5, -3.8], [-10.4, -3.8]],
  screening: [[0, -10.15]],
};

function walk(route: Waypoint[]) {
  const [startX, startZ] = route[0];
  const start = townPoint(route[0]);
  let current: WalkPosition = { x: startX, z: startZ, ground: terrain.heightAt(start.x, start.north) };
  for (const [targetX, targetZ] of route.slice(1)) {
    const base = current;
    const steps = Math.ceil(Math.hypot(targetX - base.x, targetZ - base.z) / .15);
    for (let i = 1; i <= steps; i++) {
      const x = base.x + i / steps * (targetX - base.x);
      const z = base.z + i / steps * (targetZ - base.z);
      const world = townPoint([x, z]);
      const worldZ = -world.north;
      const at = `museum local (${x.toFixed(2)}, ${z.toFixed(2)})`;
      assert.ok(canEnter(world.x, world.north), `terrain blocked at ${at}`);
      assert.ok(!district.blocked(world.x, world.north) && !street.blocked(world.x, world.north)
        && !forest.blocked(world.x, world.north), `outside scenery blocked at ${at}`);

      // Match the viewer’s walking envelope and selection of reachable floor surfaces.
      const contains = ({ min, max }: Box) => world.x >= min[0] && world.x <= max[0]
        && worldZ >= min[2] && worldZ <= max[2];
      let height = terrain.heightAt(world.x, world.north);
      for (const floor of floors) {
        if (contains(floor) && floor.max[1] <= current.ground + .43) height = Math.max(height, floor.max[1]);
      }
      for (const ramp of ramps) {
        if (!contains(ramp)) continue;
        const axis = ramp.axis === 'x' ? 0 : 2;
        const fraction = ((axis === 0 ? world.x : worldZ) - ramp.min[axis]) / (ramp.max[axis] - ramp.min[axis]);
        const top = ramp.min[1] + (ramp.max[1] - ramp.min[1]) * (ramp.ascending > 0 ? fraction : 1 - fraction);
        if (top <= current.ground + .43) height = Math.max(height, top);
      }
      assert.ok(Math.abs(height - current.ground) <= .43, `floor discontinuity at ${at} (${current.ground} → ${height})`);
      const blocking = colliders.find(({ min, max }) => world.x + .27 >= min[0] && world.x - .27 <= max[0]
        && worldZ + .27 >= min[2] && worldZ - .27 <= max[2] && height + .14 < max[1] && height + 1.8 > min[1]);
      if (blocking) {
        const local = [blocking.min, blocking.max].map(bound => bound.map((v, i) => +(v - worldOffset[i]).toFixed(3)));
        assert.fail(`museum collider blocked at ${at}, y=${(height - originY).toFixed(2)} by local ${JSON.stringify(local)}`);
      }
      current = { x, z, ground: height };
    }
  }
  return current.ground - originY;
}

test('museum is wider while fine exhibit geometry stays on the 1/64 metre world grid', () => {
  assert.deepEqual(museum.scale.toArray(), [museumHorizontalScale, 1, museumHorizontalScale]);
  assert.deepEqual(plot.footprint, [63, 42.75]);
  for (const scale of [1, museumHorizontalScale]) {
    const { center, size } = museumDetailAxis(.247, .005, scale);
    assert.ok(Math.abs(size * scale - museumDetailStep) < 1e-10);
    for (const edge of [center - size / 2, center + size / 2]) {
      const ticks = edge * scale / museumDetailStep;
      assert.ok(Math.abs(ticks - Math.round(ticks)) < 1e-10);
    }
  }
});

test('museum entrance and both rows of month exhibits are walkable', () => {
  assert.equal(monthStops.length, 12);
  assert.deepEqual(monthStops.map(({ month }) => month), Array.from({ length: 12 }, (_, i) => i + 1));
  const yearlyRoute: Waypoint[] = [
    ...byDoor, [-10.18, 10.1],
    ...monthStops.slice(0, 6).map(({ x, z }) => [x, z] as const),
    [-10.18, -11.7], [10.18, -11.7],
    ...monthStops.slice(6).map(({ x, z }) => [x, z] as const),
  ];
  assert.ok(Math.abs(walk(yearlyRoute) - .28) < .001);
});

test('museum east staircase reaches the upper gallery and its three stations', () => {
  for (const { id, x, z } of networkStops) {
    assert.ok(Math.abs(walk([...upperApproach, ...upperStationApproaches[id], [x, z]]) - 5.65) < .001, id);
  }
});

test('museum west terrace connects to the gallery and descends to the courtyard', () => {
  const terraceRoute: Waypoint[] = [
    ...upperCrossing, [-24.0, -4.0], [-24.0, 4.35], [terraceStop.x, terraceStop.z],
  ];
  assert.ok(Math.abs(walk(terraceRoute) - 5.65) < .001);
  const returned = walk([...terraceRoute, [-24.0, 4.35], [-24.0, 10.16], [-24.0, 18.62], [-24, 18.92]]);
  assert.ok(Math.abs(returned) < .25, `court level: ${returned}`);
});
