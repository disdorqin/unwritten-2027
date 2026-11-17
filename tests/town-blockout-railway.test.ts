import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTerrainGrid, isWater } from '../tools/voxel-tavern/town-blockout/terrain.ts';
import { createTownRailway } from '../tools/voxel-tavern/town-blockout/town-railway.ts';

const grid = createTerrainGrid();

test('tour railway encircles the original town, makes both river crossings and clears the snow', () => {
  const train = createTownRailway(grid);
  const { route } = train;
  const xs = route.points.map(point => point.x);
  const norths = route.points.map(point => -point.z);
  assert.ok(Math.min(...xs) < 45 && Math.max(...xs) > 580);
  assert.ok(Math.min(...norths) < 30 && Math.max(...norths) > 445);
  assert.ok(route.length > 1600);
  const overWater = route.points.map(point => isWater(point.x, -point.z));
  assert.equal(overWater.filter((water, i) => water && !overWater[i - 1]).length, 2);
  assert.deepEqual(train.boarding, { x: 473.5, n: 224, ground: 19 });
  assert.equal(grid.heightAt(train.boarding.x, train.boarding.n), train.boarding.ground);
  assert.ok(train.keepClear(478, 224));
  assert.ok(!train.keepClear(train.boarding.x, train.boarding.n));
  for (const [i, a] of route.points.entries()) {
    const b = route.points[(i + 1) % route.points.length];
    const fromPlatform = Math.min(i, route.points.length - i) * route.step;
    assert.ok(Math.abs(b.y - a.y) / route.step < .23, `steep track at segment ${i}`);
    assert.ok(a.y >= grid.heightAt(a.x, -a.z) + .60, `track clips terrain at segment ${i}`);
    if (fromPlatform <= 23) {
      assert.ok(Math.abs(a.x - 478) < .001 && a.y === 19.68, 'straight level platform track');
    } else if (fromPlatform > 28) {
      const p = a.clone().lerp(b, .5);
      const { x: dx, z: dz } = b.clone().sub(a);
      const length = Math.hypot(dx, dz);
      for (const side of [-1.45, 1.45]) {
        assert.ok(p.y >= grid.heightAt(p.x - dz * side / length, -p.z - dx * side / length) + .7,
          `track bed clips terrain at segment ${i}`);
      }
    }
  }
});

test('tour train returns to the same platform pose and supports repeat boardings', () => {
  const train = createTownRailway(grid);
  const parked = train.view.position.clone();
  const heading = train.view.getWorldDirection(parked.clone());
  const current = heading.clone();
  const last = heading.clone();
  assert.ok(train.atPlatform && !train.riding);
  train.board();
  assert.ok(train.riding && !train.atPlatform);
  const step = 1 / 60;
  let frames = 0;
  while (!train.atPlatform && frames < 9000) {
    train.update(step);
    train.view.getWorldDirection(current);
    assert.ok(last.angleTo(current) < Math.PI / 360, 'camera must turn at less than 30° per second');
    assert.ok(Math.abs(current.y) < .001, 'camera horizon must stay level');
    last.copy(current);
    frames++;
  }
  assert.ok(train.atPlatform && train.riding && frames * step > 100);
  assert.ok(train.view.position.distanceTo(parked) < .001);
  assert.ok(last.angleTo(heading) < .001);
  train.disembark();
  assert.ok(train.atPlatform && !train.riding);
  train.board();
  train.update(.1);
  assert.ok(train.view.position.distanceTo(parked) > 0);
});
