import assert from 'node:assert/strict';
import test from 'node:test';
import { Group } from 'three';
import { createTerrainGrid, worldBounds } from '../tools/voxel-tavern/town-blockout/terrain';
import { createTownRailway } from '../tools/voxel-tavern/town-blockout/town-railway';
import { mountWestCraterRoad } from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import { buildCraterRailExtension } from '../tools/voxel-tavern/town-blockout/town-crater-rail-extension';
import { mountProductionRidge } from '../tools/voxel-tavern/town-blockout/town-d-r30-production-ridge';
import { buildMiddleEastRoadbed } from '../tools/voxel-tavern/town-blockout/town-d-r30-upper-roadbed';
import { rearConnectorControls } from '../tools/voxel-tavern/town-blockout/town-d-r30-rear-connector';

/**
 * C32-2: the front-ridge link between the 87.5 m east service shelf and the
 * 140 m middle station bench.
 *
 * These cases encode *measurements*, not opinions. The 36 m / 69.79 m link
 * that the road survey reports is not a missing metre of asphalt: the shelf
 * the service road ends on is a narrow ledge between a 209% wall (south) and
 * the valley drop-off (west), and no alignment inside the current front-ridge
 * raster can climb from it at <=12% without increasing the per-vertex
 * earthwork budget far beyond a road cut. The 567.255 m authored candidate
 * only works because it reshapes up to 49.476 m of terrain, which is a
 * landform engineering intervention rather than a graded road.
 *
 * If a later order authorises that reshape, or a viaduct/ramp structure, or a
 * route outside this raster, these expectations are meant to be updated with
 * the new measured numbers - not deleted.
 */

const grid = createTerrainGrid();
const railway = createTownRailway(grid, () => 0);
const branch = buildCraterRailExtension(grid,
  mountWestCraterRoad(worldBounds.depth, north => grid.groundHeightAt(0, north)), railway.route.points);
const ridge = mountProductionRidge(new Group(), grid,
  { loop: railway.route.points, branch: branch.samples });
const allowed = (east: number, north: number) => ridge.ownership.distance(east, north) > 0;
const heightAt = (east: number, north: number) => ridge.field.heightAt(east, north)!;

test('the east service shelf is a ledge between a 209% wall and the valley drop', () => {
  const toeRise = (heightAt(340, 730) - heightAt(340, 752)) / 22;
  assert.ok(toeRise > 2, `toe rise ${toeRise} m/m should be a wall, not a slope`);
  assert.ok(heightAt(340, 740) > 110, 'the wall reaches >110 m one station south');
  assert.ok(heightAt(255, 750) < 20, 'west of the traverse the ground falls into the valley');
  // The shelf itself is walkable, which is exactly why the service road
  // finishes there and why nothing can climb off it legally.
  assert.ok(heightAt(294, 752) - heightAt(370, 752) < 10, 'the shelf is nearly level east-west');
});

test('a graded road cannot climb off the shelf at any realistic earthwork budget', () => {
  const results = [8, 12, 16, 20].map(cap => buildMiddleEastRoadbed(ridge.field, allowed,
    rearConnectorControls, { startHeight: 87.5, endHeight: 140 }, { earthwork: cap }));
  for (const [index, result] of results.entries()) {
    const cap = [8, 12, 16, 20][index]!;
    assert.equal(result.ok, false, `a ${cap} m cap must not certify this alignment`);
    assert.ok(result.east! >= 280 && result.east! <= 320, `cap ${cap} failed at ${result.east}/${result.north}`);
    assert.ok(result.north! >= 730 && result.north! <= 760, `cap ${cap} failed at ${result.east}/${result.north}`);
    // The obstruction is a near miss, which is why the authored candidate
    // "works" only once the whole flank is reshaped.
    assert.ok(result.lower! - result.upper! < 5, `cap ${cap} deficit ${result.lower! - result.upper!}`);
    assert.ok(Math.abs(result.route.at(-1)!.cum - 567.3) < 2, 'the authored alignment is unchanged');
  }
});

test('the roadbed refuses a nonsensical earthwork budget instead of silently using 8 m', () => {
  assert.throws(() => buildMiddleEastRoadbed(ridge.field, allowed, rearConnectorControls, undefined,
    { earthwork: 0 }), RangeError);
  assert.throws(() => buildMiddleEastRoadbed(ridge.field, allowed, rearConnectorControls, undefined,
    { earthwork: Number.NaN }), RangeError);
});

test('the existing three segments stay certified and independent of the new parameter', () => {
  assert.equal(ridge.roads.length, 3);
  assert.equal(ridge.transportReady, false, 'the front cable stays closed until B installer certifies');
});
