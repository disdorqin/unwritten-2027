import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, Points, Scene } from 'three';
import { addDistrictHousing } from '../tools/voxel-tavern/town-blockout/district-layout.ts';
import { addForestDensity } from '../tools/voxel-tavern/town-blockout/forest-density.ts';
import { readWalkGeometry } from '../tools/voxel-tavern/town-blockout/landmark-kit.ts';
import { buildTowerLandmark } from '../tools/voxel-tavern/town-blockout/landmark-tower.ts';
import { buildVillageLandmark } from '../tools/voxel-tavern/town-blockout/landmark-village.ts';
import { roadCorridorKeepClear } from '../tools/voxel-tavern/town-blockout/road-clearance.ts';
import { addScenery } from '../tools/voxel-tavern/town-blockout/scenery.ts';
import { addStreetscape } from '../tools/voxel-tavern/town-blockout/streetscape.ts';
import { bridgeAt, canEnter, createTerrainGrid, layout } from '../tools/voxel-tavern/town-blockout/terrain.ts';
import {
  campfirePartsPerSite, campfirePieces, createTownCampfires, findRegionalCampfires, fireWarmthRadius, maxCampfireSites,
} from '../tools/voxel-tavern/town-blockout/town-campfires.ts';
import { extensionRoadClearance, extensionStreetClearance } from '../tools/voxel-tavern/town-blockout/town-extension.ts';
import { createFrostTracker } from '../tools/voxel-tavern/town-blockout/town-frost.ts';
import { createTownRailway } from '../tools/voxel-tavern/town-blockout/town-railway.ts';
import { createTownWater } from '../tools/voxel-tavern/town-blockout/town-water.ts';

const expanded = [161, 152, 251, 212] as const;
const original = [191, 169, 251, 212] as const;
const centralIds = ['plaza-brazier-a', 'plaza-brazier-b', 'plaza-campfire'] as const;

function checkedGround() {
  const grid = createTerrainGrid();
  const railway = createTownRailway(grid);
  const water = createTownWater(grid);
  const scene = new Group();
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: () => ({ getContext: () => ({
      createRadialGradient: () => ({ addColorStop() {} }),
      fillRect() {}, strokeRect() {}, fillText() {}, drawImage() {},
    }) }) },
  });
  let scenery: ReturnType<typeof addScenery>;
  try { scenery = addScenery(scene, grid); }
  finally {
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
  const houses = addDistrictHousing(scene, grid, scenery.blocked, railway.keepClear);
  const streets = addStreetscape(scene, grid,
    (x, n, margin) => houses.keepClear(x, n, margin) || extensionRoadClearance(x, n, margin));
  const forest = addForestDensity(scene, grid,
    (x, n, margin) => houses.keepClear(x, n, margin) || streets.occupied(x, n, margin),
    (x, n, margin) => railway.keepClear(x, n, margin) || extensionRoadClearance(x, n, margin) ||
      extensionStreetClearance(x, n, margin));
  const boxes = layout.plots
    .filter(plot => plot.id === 'stage' || plot.id === 'clocktower')
    .flatMap(plot => {
      const group = plot.id === 'stage' ? buildVillageLandmark(plot) : buildTowerLandmark(plot);
      const [e, n, y] = plot.origin;
      group.position.set(e, y, -n);
      const { colliders, floors } = readWalkGeometry(group);
      return [...colliders, ...floors];
    });
  return (x: number, n: number, fixed?: number) => {
    const feet = fixed ?? grid.heightAt(x, n);
    if (!canEnter(x, n) || bridgeAt(x, n) || water.at(x, n) || railway.keepClear(x, n, .27) ||
        [scenery, houses, streets, forest].some(item => item.blocked(x, n))) return;
    const hit = boxes.some(({ min, max }) => feet + .025 < max[1] && feet + 1.775 > min[1] &&
      Math.hypot(Math.max(min[0] - x, x - max[0], 0), Math.max(min[2] + n, -n - max[2], 0)) < .27);
    return hit ? undefined : feet;
  };
}

test('expanded plaza opts into three fixed fires while the original B5 placements stay unchanged', () => {
  const ground = (_x: number, _n: number, fixed?: number) => fixed ?? 12;
  const baseline = findRegionalCampfires(ground);
  assert.equal(baseline.length, 5);
  assert.deepEqual(findRegionalCampfires(ground, original), baseline);

  const all = findRegionalCampfires(ground, expanded);
  assert.equal(all.length, maxCampfireSites);
  assert.deepEqual(all.slice(0, baseline.length), baseline);
  assert.deepEqual(all.slice(5).map(({ id, x, n }) => [id, x, n]), [
    ['plaza-brazier-a', 238, 205], ['plaza-brazier-b', 240, 173], ['plaza-campfire', 178, 162],
  ]);
  const rejectsNorthFire = (x: number, n: number, fixed?: number) => x === 238 && n === 205 ? undefined : ground(x, n, fixed);
  const present = findRegionalCampfires(rejectsNorthFire, expanded);
  assert.deepEqual(present.slice(0, 5), baseline);
  assert.ok(!present.some(({ id }) => id === 'plaza-brazier-a'));
  assert.equal(present.length, 7);
});

test('central fire cores, seated approaches and the southwest wood pile fit the expanded plaza', () => {
  const canStand = checkedGround();
  const sites = findRegionalCampfires(canStand, expanded).filter(site => centralIds.some(id => id === site.id));
  assert.deepEqual(sites.map(site => [site.x, site.n, site.ground, site.seats.length]), [
    [238, 205, 12, 3], [240, 173, 12, 3], [178, 162, 12, 4],
  ]);
  const scene = new Scene();
  const entered: number[] = [];
  const outdoor = createTownCampfires(scene, { sit: seat => entered.push(seat.eyeY) }, sites);
  for (const site of sites) {
    assert.ok(outdoor.blocked?.(site.x, site.n, site.ground));
    assert.ok(!roadCorridorKeepClear(site.x, site.n, site.style === 'stone' ? 1 : .81));
    for (const seat of site.seats) {
      assert.ok(!roadCorridorKeepClear(seat.x, seat.n, .61));
      assert.ok(outdoor.blocked?.(seat.x, seat.n, seat.ground));
      assert.equal(canStand(seat.approach.x, seat.approach.n), seat.approach.ground);
      assert.equal(outdoor.blocked?.(seat.approach.x, seat.approach.n, seat.approach.ground), false);
      assert.ok(outdoor.warmAt(seat.approach.x, seat.approach.n, seat.approach.ground));
      assert.ok(seat.approach.x < 219 || seat.approach.x > 229);
    }
  }
  assert.deepEqual(sites[2].woodPile, { x: 176.5, n: 160.65, ground: 12 });
  assert.equal(outdoor.blocked?.(176.5, 160.65, 12), true);
  for (const spot of outdoor.spots) spot.run();
  assert.equal(entered.length, 10);
  assert.ok(entered.every(y => Math.abs(y - 13.475) < 1e-8));
  assert.equal(scene.children.filter(child => child instanceof Points).length, 1);
  assert.ok(campfirePieces(sites).length <= campfirePartsPerSite * 3);
  assert.ok(campfirePieces(sites.slice(0, 2)).length * 12 <= 1500);
});

test('each plaza fire uses the original three-metre B5 exposure warmth and one shared flame pool', () => {
  const fires = findRegionalCampfires((_, __, height) => height ?? 12, expanded);
  const scene = new Scene();
  const all = createTownCampfires(scene, { sit() {} }, fires);
  for (const site of fires.slice(-3)) {
    assert.ok(all.warmAt(site.x + fireWarmthRadius, site.n, site.ground));
    assert.equal(all.warmAt(site.x + fireWarmthRadius + .01, site.n, site.ground), false);
    const tracker = createFrostTracker();
    tracker.setExposure(4, 0, 'dark-snow', false);
    tracker.update(300);
    assert.equal(tracker.exposure(), 3);
    tracker.setWarmth('fire-source', all.warmAt(site.x, site.n - 2.9, site.ground));
    tracker.update(5);
    assert.equal(tracker.exposure(), 2);
  }
  const flame = scene.children[0];
  assert.ok(flame instanceof Points);
  all.updateFlames(.1, 238, 205, false);
  assert.equal(scene.children.length, 1);
  assert.ok(flame.geometry.drawRange.count > fires.length && flame.geometry.drawRange.count <= maxCampfireSites * 49);
});
