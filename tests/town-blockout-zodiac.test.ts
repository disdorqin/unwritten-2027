import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Raycaster, Vector3 } from 'three';
import { createTerrainGrid, isWater, layout } from '../tools/voxel-tavern/town-blockout/terrain';
import { buildLakesideLandmark } from '../tools/voxel-tavern/town-blockout/landmark-lakeside';
import { readWalkGeometry } from '../tools/voxel-tavern/town-blockout/landmark-kit';
import { createTownWater } from '../tools/voxel-tavern/town-blockout/town-water';
import { createTownRailway } from '../tools/voxel-tavern/town-blockout/town-railway';
import { createRailHorseCharm } from '../tools/voxel-tavern/town-blockout/town-zodiac-rail';
import { createZodiacProgress, lighthouseSnakeSite, sealedGoldenGoatClue, zodiacStorageKey } from '../tools/voxel-tavern/town-blockout/town-zodiac';

test('the central bridge provides no dry underdeck route and the Snake fallback has dry lighthouse access', () => {
  const grid = createTerrainGrid();
  const water = createTownWater(grid);
  for (const north of [187.75, 192, 196.25]) {
    const cut = Array.from({ length: 121 }, (_, i) => {
      const x = 276 + i / 4;
      return { bed: grid.groundHeightAt(x, north), surface: grid.heightAt(x, north), water: water.at(x, north) };
    });
    assert.ok(Math.abs(Math.min(...cut.map(sample => sample.bed)) - 3.4) < .001);
    if (north === 192) {
      assert.equal(cut[64].surface, 12);
      assert.equal(cut[64].water, undefined);
    } else {
      assert.equal(cut.filter(sample => sample.water?.mode === 'swim').length, 61);
      assert.equal(cut.some(sample => sample.water?.mode === 'wade'), false);
      assert.ok(cut.some(({ water: swim }, i) => swim && [cut[i - 1], cut[i + 1]].some(
        neighbor => neighbor && !neighbor.water && Math.abs(swim.ground - neighbor.surface) > 1.255)));
    }
  }
  const plot = layout.plots.find(({ id }) => id === 'lighthouse')!;
  const lighthouse = buildLakesideLandmark(plot);
  lighthouse.position.set(plot.origin[0], plot.origin[2], -plot.origin[1]);
  const { colliders } = readWalkGeometry(lighthouse);
  const [east, height, z] = lighthouse.localToWorld(new Vector3(...lighthouseSnakeSite.stand)).toArray();
  assert.equal(grid.heightAt(east, -z), height);
  const waypoints = [[408, 84.35], [401.9, 84.35], [401.9, -z], [east, -z]];
  for (let leg = 1; leg < waypoints.length; leg++) {
    const [ax, an] = waypoints[leg - 1], [bx, bn] = waypoints[leg];
    const count = Math.ceil(Math.hypot(bx - ax, bn - an) / .25);
    let last = grid.heightAt(ax, an);
    for (let index = 0; index <= count; index++) {
      const x = ax + (bx - ax) * index / count, north = an + (bn - an) * index / count;
      const feet = grid.heightAt(x, north);
      assert.ok(!isWater(x, north) && !water.at(x, north));
      assert.ok(Math.abs(last - feet) <= .43);
      assert.ok(!colliders.some(({ min, max }) => x + .27 > min[0] && x - .27 < max[0] &&
        -north + .27 > min[2] && -north - .27 < max[2] && feet + 1.8 > min[1] && feet + .025 < max[1]));
      last = feet;
    }
  }
});

test('the first zodiac pickup is personal, persistent and not repeatable', () => {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  const one = createZodiacProgress(['mouse'], storage);
  const another = createZodiacProgress(['mouse']);
  assert.equal(one.rows().length, 12);
  assert.equal(one.rows()[0].clue, '夜半信堆沙沙响，小影蹲在邮袋旁。');
  assert.equal(one.rows()[1].clue, '尚未现身');
  assert.equal(one.rows()[7].clue, sealedGoldenGoatClue);
  assert.equal(one.collect('ox'), false);
  assert.equal(one.collect('mouse', new Date(2026, 10, 18)), true);
  assert.equal(one.collect('mouse'), false);
  assert.equal(another.count(), 0);
  assert.equal(createZodiacProgress(['mouse'], storage).rows()[0].date, '2026-11-18');
  assert.equal(data.has(zodiacStorageKey), true);
});

test('even an old save with the other eleven charms stays sealed while the palace is unavailable', () => {
  const ids = ['mouse', 'ox', 'tiger', 'rabbit', 'dragon', 'snake', 'horse', 'monkey', 'rooster', 'dog', 'pig'];
  const storage = { getItem: () => JSON.stringify({ collected: Object.fromEntries(ids.map(id => [id, '2026-11-18'])) }),
    setItem: () => { throw new Error('storage is read only'); } };
  const later = createZodiacProgress(['mouse'], storage);
  assert.equal(later.count(), 11);
  assert.equal(later.rows()[7].sealed, true);
  assert.equal(later.collect('goat'), false);
});

test('the Horse is attached to the moving coach and can be picked at a stop or underway', () => {
  for (const underway of [false, true]) {
    let now = Date.UTC(2026, 0, 1);
    const railway = createTownRailway(createTerrainGrid(), () => now);
    const zodiac = createZodiacProgress(['horse']);
    let celebrations = 0;
    const horse = createRailHorseCharm(railway, zodiac, () => celebrations++);
    const anchor = railway.coachCharmAnchor;
    const start = anchor.getWorldPosition(new Vector3());
    const camera = new PerspectiveCamera();
    const coach = anchor.parent!;
    const target = new Vector3();
    function lookUnderBench(side = -.5, row = 1.55) {
      camera.position.copy(coach.localToWorld(new Vector3(side, 2.46, row)));
      camera.lookAt(anchor.getWorldPosition(target));
    }

    lookUnderBench();
    assert.equal(horse.visibleTo(camera), false);
    horse.action.run();
    assert.equal(zodiac.count(), 0);
    assert.ok(railway.board(railway.stops[0].id));
    if (underway) {
      now += (railway.dwellSeconds + 8) * 1_000;
      railway.update(.1);
      assert.ok(anchor.getWorldPosition(new Vector3()).distanceTo(start) > 10);
    }
    assert.equal(railway.atPlatform, !underway);
    coach.updateWorldMatrix(true, true);
    for (const side of [-.5, .5]) for (let row = 0; row < 6; row++) {
      lookUnderBench(side, (row - 2.5) * .62);
      const ray = new Raycaster(camera.position, target.clone().sub(camera.position).normalize());
      assert.equal(ray.intersectObject(coach)[0]?.object, anchor.children[0], `seat ${side}/${row} has a clear view`);
      assert.equal(horse.visibleTo(camera), true);
    }
    camera.lookAt(camera.position.clone().add(new Vector3(0, 1, 0)));
    assert.equal(horse.visibleTo(camera), false);
    lookUnderBench();
    horse.action.run();
    assert.equal(zodiac.rows().find(row => row.id === 'horse')?.location, '环镇列车 · 车厢');
    assert.equal(horse.visibleTo(camera), false);
    horse.action.run();
    assert.equal(celebrations, 1);
    assert.equal(anchor.children[0].visible, false);
  }
});
