import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [townPath] = process.argv.slice(2);
assert.ok(townPath, 'Usage: node --import tsx tools/measure-jx1-door-thresholds.mjs TOWN_CHECKOUT');

const town = resolve(townPath);
const requireFromTown = createRequire(resolve(town, 'package.json'));
const { Group } = requireFromTown('three');
const moduleAt = name => import(pathToFileURL(resolve(town, 'tools/voxel-tavern/town-blockout', name + '.ts')).href);
const [{ createTerrainGrid }, { createTownRailway }, { buildPineCamp }, { addScenery }, { addDistrictHousing }] =
  await Promise.all(['terrain', 'town-railway', 'town-pine-camp', 'scenery', 'district-layout'].map(moduleAt));

// Geometry generation reads a canvas for signs and textures. This audit only needs its layout and collision outputs.
const gradient = { addColorStop() {} };
globalThis.document = { createElement: () => ({ getContext: () => ({
  createRadialGradient: () => gradient,
  createLinearGradient: () => gradient,
  fillRect() {},
  strokeRect() {},
  fillText() {},
  drawImage() {},
}) }) };

const scene = new Group();
const grid = createTerrainGrid();
const pine = buildPineCamp(grid);
const railway = createTownRailway(grid, () => 0);
const scenery = addScenery(scene, grid, pine.keepClear);
const district = addDistrictHousing(scene, grid, scenery.blocked, railway.keepClear);
const bodyRadius = 0.27;
const stepHeight = 0.43;
const scanStep = 0.025;
const standToFootprintFront = 1.42;
const clean = value => Number(value.toFixed(6));
const cleanPoint = values => values.map(clean);

const houses = district.housePortals.flatMap((door, index) => {
  if (door.zone !== 'market') return [];
  const { x, n, w, d, angle } = district.sites[index];
  const [footprintW, footprintD] = Math.abs(Math.sin(angle)) > 0.5 ? [d, w] : [w, d];
  const padHeights = [-1, 0, 1].flatMap(i => [-1, 0, 1].map(j =>
    grid.heightAt(x + i * (footprintW / 2 + 1), n + j * (footprintD / 2 + 1))));
  const foundation = Math.max(...padHeights) + 0.14;
  const outwardE = Math.sin(door.exitYaw);
  const outwardN = Math.cos(door.exitYaw);

  function point(inward, lateral = 0) {
    return [door.x - inward * outwardE + lateral * outwardN, door.n - inward * outwardN - lateral * outwardE];
  }

  const front = point(standToFootprintFront);
  const lanes = [-bodyRadius, 0, bodyRadius].map(lateral => {
    assert.equal(district.blocked(...point(0, lateral)), false, `${door.id} must preserve its outdoor stance`);
    let firstBlocked;
    for (let sample = 1; sample <= Math.round(2 / scanStep); sample++) {
      const inward = sample * scanStep;
      if (district.blocked(...point(inward, lateral))) {
        firstBlocked = inward;
        break;
      }
    }
    assert.notEqual(firstBlocked, undefined, `${door.id} full-footprint wall baseline`);
    assert.ok(district.blocked(...point(standToFootprintFront, lateral)), `${door.id} nominal front`);
    return {
      lateral,
      firstBlockedFromStance: clean(firstBlocked),
      lastOpenTerrain: clean(grid.heightAt(...point(firstBlocked - scanStep, lateral))),
      nominalFrontTerrain: clean(grid.heightAt(...point(standToFootprintFront, lateral))),
    };
  });

  assert.equal(door.ground, grid.heightAt(door.x, door.n));
  return [{
    id: door.id,
    stance: cleanPoint([door.x, door.n, door.ground]),
    exitYaw: clean(door.exitYaw),
    nominalFront: cleanPoint(front),
    foundation: clean(foundation),
    padHeightRange: cleanPoint([Math.min(...padHeights), Math.max(...padHeights)]),
    foundationMinusStance: clean(foundation - door.ground),
    foundationMinusFrontTerrain: clean(foundation - grid.heightAt(...front)),
    lanes,
  }];
});

assert.equal(district.count, 52);
assert.equal(houses.length, 17);
const rises = houses.map(house => house.foundationMinusStance);
const frontRises = houses.map(house => house.foundationMinusFrontTerrain);
console.log(JSON.stringify({
  method: 'Production district.blocked and raw TerrainGrid at the nominal footprint line; no doorway opened.',
  stepHeight,
  scanStep,
  stanceToFoundationRange: [Math.min(...rises), Math.max(...rises)],
  frontTerrainToFoundationRange: [Math.min(...frontRises), Math.max(...frontRises)],
  housesAboveOneStepAtStance: houses.filter(house => house.foundationMinusStance > stepHeight).map(house => house.id),
  housesAboveOneStepAtFront: houses.filter(house => house.foundationMinusFrontTerrain > stepHeight).map(house => house.id),
  houses,
}, null, 2));
