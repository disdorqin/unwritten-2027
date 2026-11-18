import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bridgeAt, createTerrainGrid, layout, riverX } from '../tools/voxel-tavern/town-blockout/terrain.ts';
import { snowIntensityAt } from '../tools/voxel-tavern/town-blockout/town-ceremony.ts';
import { approachTownSnowScale, createTownSnowCover } from '../tools/voxel-tavern/town-blockout/town-snow-cover.ts';

const grid = createTerrainGrid();
const wild = [8, 31, grid.heightAt(8, 31)] as const;
const courtyard = [159, 230, grid.heightAt(159, 230)] as const;

test('plowed town terrain, approach routes and district paving stay full speed in a storm', () => {
  const snow = createTownSnowCover(grid);
  snow.setIntensity(4);
  snow.update(55, true);
  const pavement = [
    layout.plaza.spawn, [445, 136], [111, 433], ...layout.bridges.map(({ east, north }) => [east + .25, north]),
  ];
  for (const [x, north] of pavement) {
    assert.equal(snow.movementScale(x, north, grid.heightAt(x, north)), 1, `cleared terrain at ${x},${north}`);
  }
  assert.equal(snow.movementScale(...wild, () => true), 1);
  assert.equal(snow.depthAt(...wild, () => true), 0);
  assert.equal(snow.depthAt(...wild), 1);
});

test('ceremony storm accumulation gives ordinary, packed and deep movement targets', () => {
  const snow = createTownSnowCover(grid);
  snow.setIntensity(snowIntensityAt(new Date(2026, 11, 31, 19).getTime()));
  snow.update(55, true);
  assert.equal(snow.amount(), 0);
  assert.equal(snow.movementScale(...wild), 1);
  assert.equal(snow.depth().servings, 3);

  snow.setIntensity(2.5);
  snow.update(55 * .8, true);
  assert.equal(snow.amount(), .4);
  assert.equal(snow.movementScale(...wild), .85);
  assert.equal(snow.movementScale(...wild, undefined, true), .8);
  assert.equal(snow.movementScale(...courtyard), 1);
  assert.equal(snow.depth().servings, 4);

  snow.setIntensity(snowIntensityAt(new Date(2026, 11, 31, 23, 30).getTime()));
  snow.update(55, true);
  assert.equal(snow.amount(), 1);
  assert.equal(snow.movementScale(...wild), .62);
  assert.ok(Math.abs(11.3 * snow.movementScale(...wild, undefined, true) - 8.25) < 1e-10);
  assert.equal(snow.movementScale(...courtyard), .85);
  assert.equal(snow.depthAt(...courtyard), .5);
  assert.equal(snow.depth().servings, 5);

  snow.update(0, false);
  assert.equal(snow.movementScale(...wild), 1);
  snow.setIntensity(1);
  snow.update(150, true);
  assert.equal(snow.amount(), 0);
  assert.equal(snow.movementScale(...wild), 1);
});

test('snow transition reaches .62 within .3 seconds without a >15% frame jump', () => {
  let speed = 1;
  for (let frame = 0; frame < 18; frame++) {
    const next = approachTownSnowScale(speed, .62, 1 / 60);
    assert.ok(next <= speed && Math.abs(next - speed) / speed < .15);
    speed = next;
  }
  assert.equal(speed, .62);
  for (let frame = 0; frame < 18; frame++) speed = approachTownSnowScale(speed, 1, 1 / 60);
  assert.equal(speed, 1);
});

test('shelter, platforms above natural ground, bridge decks, water and ice do not get deep-snow drag', () => {
  const snow = createTownSnowCover(grid);
  snow.setIntensity(4);
  snow.update(55, true);
  assert.equal(snow.movementScale(...wild), .62);
  assert.equal(snow.movementScale(wild[0], wild[1], wild[2] + .25), 1);
  assert.equal(snow.movementScale(...wild, () => true), 1);

  const waterNorth = 120;
  const river = riverX(waterNorth);
  assert.equal(bridgeAt(river, waterNorth), undefined);
  assert.equal(snow.movementScale(river, waterNorth, grid.heightAt(river, waterNorth)), 1);
  const [iceX, iceNorth] = layout.lake.center;
  assert.equal(snow.movementScale(iceX, iceNorth, grid.heightAt(iceX, iceNorth)), 1);
});
