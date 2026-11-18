import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, InstancedMesh, Vector3 } from 'three';
import { addDistrictHousing } from '../tools/voxel-tavern/town-blockout/district-layout.ts';
import { addForestDensity } from '../tools/voxel-tavern/town-blockout/forest-density.ts';
import { readWalkGeometry, type Box } from '../tools/voxel-tavern/town-blockout/landmark-kit.ts';
import { addScenery } from '../tools/voxel-tavern/town-blockout/scenery.ts';
import { addStreetscape } from '../tools/voxel-tavern/town-blockout/streetscape.ts';
import { bridgeAt, canEnter, createTerrainGrid, isWater } from '../tools/voxel-tavern/town-blockout/terrain.ts';
import { extensionRoadClearance, extensionStreetClearance } from '../tools/voxel-tavern/town-blockout/town-extension.ts';
import { createTownRailway } from '../tools/voxel-tavern/town-blockout/town-railway.ts';
import { createTownWater } from '../tools/voxel-tavern/town-blockout/town-water.ts';
import {
  buildTigerZodiacAnchor, tigerPineApproach, tigerPineLandings, tigerPineOrigin, tigerZodiacSite,
} from '../tools/voxel-tavern/town-blockout/town-zodiac-tiger-anchor.ts';

const grid = createTerrainGrid();
const tree = buildTigerZodiacAnchor(grid.heightAt);
const { colliders, floors } = readWalkGeometry(tree);
const radius = .27;
const bodyHeight = 1.8;
const epsilon = .025;
const maxStep = .43;
const gravity = 22;
const jumpHeight = 1.255;
const timestep = 1 / 120;
const [east, north] = tigerPineOrigin;

function overlaps(e: number, n: number, { min, max }: Box) {
  return Math.hypot(Math.max(min[0] - e, e - max[0], 0), Math.max(min[2] + n, -n - max[2], 0)) < radius;
}

function hits(e: number, n: number, feet: number) {
  return [...colliders, ...floors].some(box => overlaps(e, n, box) &&
    feet + epsilon < box.max[1] && feet + bodyHeight - epsilon > box.min[1]);
}

function support(e: number, n: number, limit: number) {
  return Math.max(grid.heightAt(e, n), ...floors.filter(box => box.max[1] <= limit && overlaps(e, n, box)).map(box => box.max[1]));
}

function traverse(from: { east: number; feet: number }, destination: number, jump: boolean) {
  const n = north - tigerPineLandings[0].z;
  let e = from.east;
  let ground = from.feet;
  let air: number | undefined = jump ? ground : undefined;
  let velocity = jump ? Math.sqrt(2 * gravity * jumpHeight) : 0;
  let highest = ground;
  for (let tick = 0; tick < 240; tick++) {
    const speed = air === undefined ? 7.5 : 7.5 * .8;
    const nextX = e + Math.sign(destination - e) * Math.min(Math.abs(destination - e), speed * timestep);
    const feet = air ?? ground;
    const limit = feet + (air === undefined ? maxStep : epsilon);
    const nextFloor = support(nextX, n, limit);
    if (nextFloor <= limit && !hits(nextX, n, air ?? nextFloor)) {
      e = nextX;
      if (air === undefined) {
        if (ground - nextFloor > maxStep) {
          air = ground;
          velocity = 0;
        } else ground = nextFloor;
      }
    }
    if (air !== undefined) {
      const next = air + velocity * timestep - .5 * gravity * timestep ** 2;
      velocity -= gravity * timestep;
      if (next > air && hits(e, n, next)) velocity = 0;
      else if (next <= air && next <= support(e, n, air + epsilon)) {
        ground = support(e, n, air + epsilon);
        air = undefined;
      } else air = next;
    }
    highest = Math.max(highest, air ?? ground);
    if (e === destination && air === undefined) return { east: e, feet: ground, highest };
  }
  throw new Error(`Could not settle at ${destination}; got ${e}, height ${air ?? ground}`);
}

test('the pine, climb and campfire approach stay outside production obstacles and reserved clearances', () => {
  const world = new Group();
  const railway = createTownRailway(grid);
  const water = createTownWater(grid);
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: () => ({ getContext: () => ({
      createRadialGradient: () => ({ addColorStop() {} }),
      fillRect() {}, strokeRect() {}, fillText() {}, drawImage() {},
    }) }) },
  });
  let scenery: ReturnType<typeof addScenery>;
  try { scenery = addScenery(world, grid); }
  finally {
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
  const houses = addDistrictHousing(world, grid, scenery.blocked, railway.keepClear);
  const streets = addStreetscape(world, grid,
    (e, n, margin) => houses.keepClear(e, n, margin) || extensionRoadClearance(e, n, margin));
  const forest = addForestDensity(world, grid,
    (e, n, margin) => houses.keepClear(e, n, margin) || streets.occupied(e, n, margin),
    (e, n, margin) => railway.keepClear(e, n, margin) || extensionRoadClearance(e, n, margin) || extensionStreetClearance(e, n, margin));
  const clear = (e: number, n: number) => {
    assert.ok(canEnter(e, n) && !isWater(e, n) && !water.at(e, n) && !bridgeAt(e, n), `wet tile at ${e},${n}`);
    assert.ok(!railway.keepClear(e, n, radius) && !extensionRoadClearance(e, n, radius) &&
      !extensionStreetClearance(e, n, radius), `reserved tile at ${e},${n}`);
    assert.ok(![scenery, houses, streets, forest].some(area => area.blocked(e, n)), `blocked tile at ${e},${n}`);
  };
  const fire = [122.48, 407.65] as const;
  assert.ok(Math.hypot(east - fire[0], north - fire[1]) < 8);
  for (const [i, start] of tigerPineApproach.slice(0, -1).entries()) {
    const end = tigerPineApproach[i + 1];
    const count = Math.ceil(Math.hypot(end[0] - start[0], end[1] - start[1]) / .25);
    let previousHeight = grid.heightAt(start[0], start[1]);
    for (let j = 0; j <= count; j++) {
      const e = start[0] + (end[0] - start[0]) * j / count;
      const n = start[1] + (end[1] - start[1]) * j / count;
      clear(e, n);
      assert.ok(Math.hypot(e - fire[0], n - fire[1]) > 1.27);
      const height = grid.heightAt(e, n);
      assert.ok(Math.abs(height - previousHeight) <= maxStep);
      previousHeight = height;
    }
  }
  // The complete old pine footprint plus both sides of the climb stays clear.
  for (let e = east - 4.25; e <= east + 2; e += .25)
    for (let n = north - 2.25; n <= north + 1.85; n += .25) clear(e, n);
});

test('three jumps reach the branch and all reverse drops retain a safe standing surface', () => {
  const [startEast, walkNorth] = tigerPineApproach.at(-1)!;
  const start = { east: startEast, feet: grid.heightAt(startEast, walkNorth) };
  const expected = tigerPineLandings.map(({ x, top }) => ({ east: east + x, feet: tree.position.y + top }));
  const route = [start, ...expected];
  assert.equal(floors.length, 3);
  for (const [i, launch] of route.slice(0, -1).entries()) {
    const target = route[i + 1];
    assert.ok(target.feet - launch.feet > maxStep && target.feet - launch.feet < jumpHeight - .35);
    const arrival = traverse(launch, target.east, true);
    assert.equal(arrival.feet, target.feet);
    assert.ok(arrival.highest - target.feet > .35);
    assert.ok(!hits(arrival.east, walkNorth, arrival.feet));
  }
  for (let i = route.length - 1; i > 0; i--) {
    const launch = route[i];
    const next = route[i - 1];
    const dropped = traverse(launch, next.east, false);
    assert.ok(Math.abs(dropped.feet - next.feet) < 1e-8);
    assert.ok(launch.feet - dropped.feet < .85);
    assert.ok(!hits(dropped.east, walkNorth, dropped.feet));
  }
});

test('the atlas pickup stands inside the top collision floor and geometry uses one render batch', () => {
  const stand = tree.localToWorld(new Vector3(...tigerZodiacSite.stand));
  const charm = tree.localToWorld(new Vector3(...tigerZodiacSite.object));
  assert.equal(tigerZodiacSite.id, 'tiger');
  assert.ok(charm.x > stand.x && charm.y >= stand.y);
  for (let angle = 0; angle < 16; angle++) {
    const r = 2 * Math.PI * angle / 16;
    const [e, n] = [stand.x + Math.cos(r) * tigerZodiacSite.range, -stand.z + Math.sin(r) * tigerZodiacSite.range];
    assert.equal(support(e, n, stand.y + epsilon), stand.y);
    assert.ok(!hits(e, n, stand.y));
  }
  assert.equal(tree.children.length, 1);
  const mesh = tree.children[0];
  assert.ok(mesh instanceof InstancedMesh);
  assert.ok(mesh.count * mesh.geometry.index!.count / 3 < 900);
});
