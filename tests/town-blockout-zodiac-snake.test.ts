import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildLakesideLandmark } from '../tools/voxel-tavern/town-blockout/landmark-lakeside';
import { readWalkGeometry } from '../tools/voxel-tavern/town-blockout/landmark-kit';
import { createTerrainGrid, isWater, layout } from '../tools/voxel-tavern/town-blockout/terrain';
import { nearestTownActivity } from '../tools/voxel-tavern/town-blockout/town-activity';
import { createTownWater } from '../tools/voxel-tavern/town-blockout/town-water';
import { createZodiacProgress, lighthouseSnakeClue } from '../tools/voxel-tavern/town-blockout/town-zodiac';
import { createLighthouseSnakeCharm } from '../tools/voxel-tavern/town-blockout/town-zodiac-snake';

test('walk the dry lighthouse path, pick up the Snake once and keep a personal stamp', () => {
  const grid = createTerrainGrid();
  const water = createTownWater(grid);
  const plot = layout.plots.find(({ id }) => id === 'lighthouse')!;
  const lighthouse = buildLakesideLandmark(plot);
  lighthouse.position.set(plot.origin[0], plot.origin[2], -plot.origin[1]);
  const { colliders } = readWalkGeometry(lighthouse);
  const save = new Map<string, string>();
  const storage = { getItem: (key: string) => save.get(key) ?? null, setItem: (key: string, value: string) => { save.set(key, value); } };
  const zodiac = createZodiacProgress(['mouse', 'snake', 'horse', 'rooster'], storage);
  let celebrations = 0;
  const activity = createLighthouseSnakeCharm(lighthouse, zodiac, () => { celebrations++; });
  assert.deepEqual([activity.x, activity.n, activity.ground], [402.05, 78, 12]);
  assert.equal(zodiac.rows().find(row => row.id === 'snake')?.clue, lighthouseSnakeClue);
  assert.equal(zodiac.rows().find(row => row.id === 'ox')?.clue, '尚未现身');

  const waypoints = [[408, 84.35], [401.9, 84.35], [401.9, 78], [402.05, 78]];
  for (let index = 1; index < waypoints.length; index++) {
    const [a, b] = waypoints[index - 1];
    const [c, d] = waypoints[index];
    const count = Math.ceil(Math.hypot(c - a, d - b) / .25);
    let previous = grid.heightAt(a, b);
    for (let step = 0; step <= count; step++) {
      const east = a + (c - a) * step / count, north = b + (d - b) * step / count;
      const ground = grid.heightAt(east, north);
      assert.ok(!isWater(east, north) && !water.at(east, north));
      assert.ok(Math.abs(previous - ground) <= .43);
      assert.equal(colliders.some(({ min, max }) => east + .27 > min[0] && east - .27 < max[0] &&
        -north + .27 > min[2] && -north - .27 < max[2] && ground + 1.8 > min[1] && ground + .025 < max[1]), false);
      previous = ground;
    }
  }
  assert.equal(nearestTownActivity([activity], 402.05, 78, 12), activity);
  activity.run();
  assert.equal(nearestTownActivity([activity], 402.05, 78, 12), undefined);
  activity.run();
  assert.equal(celebrations, 1);
  assert.equal(lighthouse.getObjectByName('生肖寻宝 · 蛇挂牌')?.visible, false);
  assert.equal(createZodiacProgress(['snake'], storage).rows().find(row => row.id === 'snake')?.location, '灯塔 · 西塔基');
  assert.equal(createZodiacProgress(['snake']).count(), 0);
});
