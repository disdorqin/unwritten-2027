import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Scene, Vector3 } from 'three';
import type { Box } from '../tools/voxel-tavern/town-blockout/landmark-kit.ts';
import {
  createPlazaSnowSupply, plazaSnowSupplyRefillMs, plazaSnowSupplySites, type PlazaSnowSupplySite,
} from '../tools/voxel-tavern/town-blockout/plaza-snow-supply.ts';
import { createTerrainGrid } from '../tools/voxel-tavern/town-blockout/terrain.ts';
import { createTownSnowCover } from '../tools/voxel-tavern/town-blockout/town-snow-cover.ts';
import { createTownSnowballFight } from '../tools/voxel-tavern/town-blockout/town-snowball.ts';
import { createSnowballSweep } from '../tools/voxel-tavern/town-blockout/town-snowball-world.ts';

const grid = createTerrainGrid();
const sceneSweep = (colliders: Box[] = []) => {
  const cells = { colliders, floors: [] };
  return createSnowballSweep({ geometryAt: () => cells, surfaceHeight: grid.heightAt, occupiedAt: () => false, targets: [] });
};

function createAmmo() {
  const sweep = sceneSweep();
  return createTownSnowballFight({
    scene: new Scene(),
    sweep: (from, to, radius, thrower) => sweep(from, to, radius, thrower),
  });
}

function gatherRay({ east, north }: PlazaSnowSupplySite) {
  const base = grid.heightAt(east, north);
  const from = new Vector3(east - 1.35, base + 1.62, -north);
  const direction = new Vector3(east, base + .28, -north).sub(from).normalize();
  return { from, to: direction.multiplyScalar(2.44).add(from) };
}

test('P23 ray target is mapped to the three authored coordinates and respects nearer world hits', () => {
  assert.deepEqual(plazaSnowSupplySites.map(({ east, north }) => [east, north]), [[216, 196], [233, 206], [233, 160]]);
  const supply = createPlazaSnowSupply(() => 0);
  const sweep = sceneSweep();
  for (const site of plazaSnowSupplySites) {
    const { from, to } = gatherRay(site);
    assert.equal(supply.aimed(from, to, grid.heightAt, sweep(from, to, 0, 'local')), site);
    const missFrom = from.clone().add(new Vector3(0, 0, 1));
    const missTo = to.clone().add(new Vector3(0, 0, 1));
    assert.equal(supply.aimed(missFrom, missTo, grid.heightAt, sweep(missFrom, missTo, 0, 'local')), undefined);
  }

  const site = plazaSnowSupplySites[0];
  const base = grid.heightAt(site.east, site.north);
  const { from, to } = gatherRay(site);
  const sweepBlocked = sceneSweep([{
    min: [site.east - 1.05, base, -site.north - .5],
    max: [site.east - .9, base + 2, -site.north + .5],
  }]);
  const wall = sweepBlocked(from, to, 0, 'local');
  assert.equal(wall?.kind, 'world');
  assert.equal(supply.aimed(from, to, grid.heightAt, wall), undefined);
});

test('ambient and authored snow both award one per shovel up to fifty', () => {
  const cover = createTownSnowCover(grid);
  cover.setIntensity(4);
  const supply = createPlazaSnowSupply(() => 0);
  const sweep = sceneSweep();

  for (const [index, ambient] of [3, 4, 5].entries()) {
    assert.equal(cover.depth().servings, ambient);
    const ordinary = createAmmo();
    assert.ok(supply.gather(ordinary, cover.depth().servings));
    assert.equal(ordinary.getState().ammo, 1);
    for (const site of plazaSnowSupplySites) {
      const { from, to } = gatherRay(site);
      const target = supply.aimed(from, to, grid.heightAt, sweep(from, to, 0, 'local'));
      assert.equal(target, site);
      const game = createAmmo();
      assert.ok(supply.gather(game, cover.depth().servings, target));
      assert.equal(game.getState().ammo, 1);
      for (let i = 1; i < 49; i++) assert.ok(game.gather());
      assert.ok(supply.gather(game, cover.depth().servings, target));
      assert.equal(game.getState().ammo, 50);
      assert.equal(supply.gather(game, cover.depth().servings, target), false);
    }
    if (index < 2) cover.update(22, true);
  }
});

test('a successful dig shrinks only its local pile and restores height in sixty seconds after the last dig', () => {
  let now = 0;
  const supply = createPlazaSnowSupply(() => now);
  const [west, north] = plazaSnowSupplySites;
  const game = createAmmo();
  assert.equal(supply.heightScale(west), 1);
  assert.ok(supply.gather(game, 3, west));
  assert.equal(supply.heightScale(west), .65);
  assert.equal(supply.heightScale(north), 1);
  now += 1000;
  assert.ok(supply.gather(game, 3, west));
  assert.equal(supply.heightScale(west), .65);
  for (let i = 2; i < 50; i++) assert.ok(game.gather());
  now += 30_000;
  assert.equal(supply.gather(game, 3, west), false);
  assert.ok(Math.abs(supply.heightScale(west) - .825) < 1e-9);
  now = 1000 + plazaSnowSupplyRefillMs - 1;
  assert.ok(supply.heightScale(west) < 1);
  now++;
  assert.equal(supply.heightScale(west), 1);
});
