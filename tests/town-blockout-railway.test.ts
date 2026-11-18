import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTerrainGrid, isWater } from '../tools/voxel-tavern/town-blockout/terrain.ts';
import { createTownRailway } from '../tools/voxel-tavern/town-blockout/town-railway.ts';
import { createRailTimetable } from '../tools/voxel-tavern/town-blockout/town-rail-timetable.ts';
import { extensionRoads } from '../tools/voxel-tavern/town-blockout/town-extension.ts';
import type { Box } from '../tools/voxel-tavern/town-blockout/landmark-kit.ts';

const grid = createTerrainGrid();
const epoch = Date.UTC(2026, 0, 1);

function roadHeadroom(id: 'station-approach' | 'hot-spring-approach' | 'north-forest-approach', colliders: Box[]) {
  const road = extensionRoads.find(road => road.id === id)!;
  let minimum = Infinity;
  for (const [i, [ax, an]] of road.points.slice(0, -1).entries()) {
    const [bx, bn] = road.points[i + 1];
    const dx = bx - ax;
    const dn = bn - an;
    const distance = Math.hypot(dx, dn);
    const steps = Math.ceil(distance / .15);
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      for (let lane = -road.width / 2 + .28; lane <= road.width / 2 - .28; lane += .30) {
        const x = ax + dx * t - dn / distance * lane;
        const north = an + dn * t + dx / distance * lane;
        const feet = grid.heightAt(x, north);
        for (const { min, max } of colliders) {
          const xDistance = Math.max(min[0] - x, x - max[0], 0);
          const zDistance = Math.max(min[2] + north, -north - max[2], 0);
          if (max[1] > feet + .025 && xDistance ** 2 + zDistance ** 2 < .27 ** 2) {
            minimum = Math.min(minimum, min[1] - feet);
          }
        }
      }
    }
  }
  return minimum;
}

test('tour railway encircles the original town, makes both river crossings and clears the snow', () => {
  const train = createTownRailway(grid, () => epoch);
  const { route } = train;
  const xs = route.points.map(point => point.x);
  const norths = route.points.map(point => -point.z);
  assert.ok(Math.min(...xs) < 45 && Math.max(...xs) > 580);
  assert.ok(Math.min(...norths) < 30 && Math.max(...norths) > 445);
  assert.ok(route.length > 1600);
  const overWater = route.points.map(point => isWater(point.x, -point.z));
  assert.equal(overWater.filter((water, i) => water && !overWater[i - 1]).length, 2);
  assert.deepEqual(train.boarding, { x: 473.5, n: 224, ground: 19.18 });
  assert.equal(grid.heightAt(train.boarding.x, train.boarding.n), 19);
  assert.ok(train.keepClear(478, 224));
  assert.ok(!train.keepClear(train.boarding.x, train.boarding.n));
  for (const [i, a] of route.points.entries()) {
    const b = route.points[(i + 1) % route.points.length];
    const station = route.stops.find(stop => {
      const length = Math.abs(i * route.step - stop.distance);
      return Math.min(length, route.length - length) < stop.halfLength + 4;
    });
    assert.ok(Math.abs(b.y - a.y) / route.step < .23, `steep track at segment ${i}`);
    assert.ok(a.y >= grid.heightAt(a.x, -a.z) + .60, `track clips terrain at segment ${i}`);
    if (!station) {
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

test('raised railway leaves walking headroom and supports both banks of the bath road', () => {
  const train = createTownRailway(grid, () => epoch);
  const railSolids = train.group.userData.colliders as Box[];
  const stationRoadClearance = roadHeadroom('station-approach', railSolids);
  const bathRoadClearance = roadHeadroom('hot-spring-approach', railSolids);
  const forestRoadClearance = roadHeadroom('north-forest-approach', railSolids);
  assert.ok(forestRoadClearance >= 1.95, `north forest approach headroom ${forestRoadClearance}`);
  assert.ok(stationRoadClearance >= 1.95 && stationRoadClearance < 3, `station road headroom ${stationRoadClearance}`);
  assert.ok(bathRoadClearance >= 5 && bathRoadClearance < 7, `bath road headroom ${bathRoadClearance}`);

  const { points, step } = train.route;
  const bathCrossing = points.reduce((nearest, point, i) => {
    const current = points[nearest];
    return Math.hypot(point.x - 499, point.z + 147.5) < Math.hypot(current.x - 499, current.z + 147.5)
      ? i : nearest;
  }, 0);
  const before = train.supportIndices.filter(i => i < bathCrossing).at(-1);
  const after = train.supportIndices.find(i => i >= bathCrossing);
  assert.ok(before !== undefined && after !== undefined);
  assert.ok((after - before) * step <= 12.5, 'pier pairs must shorten the 27.2 m crossing');
});

test('a carriage blocks its physical body but leaves the boarding pad open', () => {
  let time = epoch;
  const train = createTownRailway(grid, () => time);
  const { x, n, ground } = train.boarding;
  assert.ok(train.vehicleBlocks(478, 224, ground, 1.8, .27));
  assert.ok(!train.vehicleBlocks(x, n, ground, 1.8, .27));
  assert.ok(!train.vehicleBlocks(478, 224, ground + 4.5, 1.8, .27));
  assert.ok(train.board('coaster-station'));
  time += 30_000;
  train.update(1 / 60);
  assert.ok(!train.vehicleBlocks(478, 224, ground, 1.8, .27), 'carriage has moved away from the station');
  const { x: east, y, z } = train.view.position;
  assert.ok(train.vehicleBlocks(east, -z, y - 2.1, 1.8, .27), 'collision follows the carriage');
});

test('all six platforms board and receive riders only while stopped', () => {
  let time = epoch;
  const train = createTownRailway(grid, () => time);
  const schedule = createRailTimetable(train.stops, train.route.length);
  const floors = train.group.userData.floors as Box[];
  assert.ok(floors.length > 5);
  assert.deepEqual(train.stops.map(stop => stop.label), ['未写镇站', '火车站前站', '森林木屋站', '湖南岸站', '城堡南站', '温泉站']);
  assert.ok(train.cycleSeconds >= 270 && train.cycleSeconds <= 290);
  assert.equal(train.dwellSeconds, 12);
  assert.ok(train.atPlatform && !train.riding);
  for (const { from, to, offset } of schedule.legs) {
    time = epoch + Math.ceil(offset * 1000) + 100;
    train.update(1 / 60);
    assert.equal(train.currentStop?.id, from.id);
    assert.equal(train.nextStop.id, to.id);
    assert.equal(train.canBoard(from.x, from.n, from.ground)?.id, from.id);
    assert.ok(!train.vehicleBlocks(from.x, from.n, from.ground, 1.8, .27));
    assert.equal(train.timetable(from.id).seconds, 0);
    assert.ok(train.timetable(from.id).departureSeconds! > 11);
    assert.equal(train.board(to.id), false);
    assert.ok(train.board(from.id));
    const parked = train.view.position.clone();
    assert.ok(Math.hypot(parked.x - from.east, parked.z + from.north) < 1);
    assert.ok(Math.abs(parked.y - from.railY - 2.46) < .01);
    time = epoch + Math.ceil(offset * 1000) + 15_000;
    train.update(1 / 60);
    assert.equal(train.currentStop, undefined);
    assert.equal(train.disembark(), undefined);
    assert.equal(train.canBoard(from.x, from.n, from.ground), undefined);
    const arrival = train.timetable(to.id).seconds;
    time += Math.ceil(arrival * 1000) + 100;
    train.update(1 / 60);
    assert.equal(train.disembark()?.id, to.id);
    assert.ok(!train.riding);
  }
  assert.equal(train.currentStop?.id, train.stops[0].id);
});

test('absolute train time is shared by newcomers, riders and spectators', () => {
  let time = epoch;
  const rider = createTownRailway(grid, () => time);
  const spectator = createTownRailway(grid, () => time);
  const last = rider.view.getWorldDirection(rider.view.position.clone());
  const current = last.clone();
  assert.ok(rider.board('coaster-station'));
  const step = 1 / 60;
  for (let frames = 0; frames < 3000; frames++) {
    time = epoch + frames * step * 1000;
    rider.update(step);
    rider.view.getWorldDirection(current);
    assert.ok(last.angleTo(current) < Math.PI / 360, 'camera must turn at less than 30° per second');
    assert.ok(Math.abs(current.y) < .001, 'camera horizon must stay level');
    last.copy(current);
  }
  // One viewer experienced every frame while the other caught up in one tick.
  spectator.update(.01);
  assert.equal(spectator.currentStop?.id, rider.currentStop?.id);
  assert.ok(spectator.view.position.distanceTo(rider.view.position) < .001);
  assert.ok(!spectator.riding);
  const newcomer = createTownRailway(grid, () => time);
  assert.ok(newcomer.view.position.distanceTo(rider.view.position) < .001);
  rider.cancelRide();
  assert.ok(!rider.riding);
  assert.ok(spectator.view.position.distanceTo(rider.view.position) < .001);
});
