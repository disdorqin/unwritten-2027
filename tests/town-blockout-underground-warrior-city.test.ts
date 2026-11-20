import assert from 'node:assert/strict';
import test from 'node:test';
import { createUndergroundWarriorCity, warriorCityDatum, warriorCityStreet } from '../tools/voxel-tavern/town-blockout/underground-warrior-city.js';

type City = ReturnType<typeof createUndergroundWarriorCity>;
type Position = { east: number; north: number };

function survey(city: City, route: readonly Position[], increment = .08) {
  let samples = 0, maxStep = 0, previous: number | undefined;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1]!, b = route[i]!;
    const count = Math.ceil(Math.hypot(b.east - a.east, b.north - a.north) / increment);
    for (let k = 0; k <= count; k++) {
      const east = a.east + (b.east - a.east) * k / count;
      const north = a.north + (b.north - a.north) * k / count;
      const height = city.floorHeightAt(east, north);
      assert.notEqual(height, undefined, `Missing floor at E${east}/N${north}`);
      assert.ok(city.isWalkable(east, north), `Obstructed at E${east}/N${north}/Y${height}`);
      if (previous !== undefined) maxStep = Math.max(maxStep, Math.abs(previous - height!));
      previous = height;
      samples++;
    }
  }
  return { samples, maxStep, lastHeight: previous };
}

test('the −165 m street is continuous for 180 m in five phases with three lanes through both arches', t => {
  const city = createUndergroundWarriorCity();
  try {
    assert.deepEqual(warriorCityStreet.map(s => s.end - s.start), [25, 55, 40, 40, 20]);
    assert.ok(warriorCityStreet.every((s, index) => s.start === (warriorCityStreet[index - 1]?.end ?? 0)));
    const samples = [-2, 0, 2].map(north => survey(city, [{ east: .3, north }, { east: 179.7, north }]));
    assert.ok(samples.every(s => s.maxStep === 0 && s.lastHeight === warriorCityDatum));
    assert.equal(city.floorHeightAt(1.999, 5.78), undefined);
    assert.equal(city.floorHeightAt(23.999, -5.3), undefined);
    assert.equal(city.isWalkable(41.5, 4.7), false);
    t.diagnostic(`${samples.reduce((sum, s) => sum + s.samples, 0)} street probes, zero steps`);
  } finally { city.dispose(); }
});

test('twelve registered façades have four single-entry houses and three different closed-door treatments', t => {
  const city = createUndergroundWarriorCity();
  try {
    assert.equal(city.houses.length, 12);
    assert.equal(city.houses.filter(h => h.seal === 'open').length, 4);
    assert.equal(new Set(city.houses.map(h => h.seal)).size, 4);
    assert.equal(new Set(city.houses.map(h => h.roof)).size, 4);
    let samples = 0;
    for (const house of city.houses) {
      if (house.seal !== 'open') {
        assert.equal(city.isWalkable(house.door.east, house.door.north), false, house.id);
        continue;
      }
      samples += survey(city, [house.entrance, house.inside, house.entrance]).samples;
      for (const side of [house.extent.west + .2, house.extent.east - .2]) {
        assert.equal(city.isWalkable(side, house.inside.north), false, house.id);
      }
      const back = house.door.north > 0 ? house.extent.north : house.extent.south;
      assert.equal(city.isWalkable(house.door.east, back), false, house.id);
    }
    t.diagnostic(`${samples} open-door probes with one exit per interior`);
  } finally { city.dispose(); }
});

test('market loop and two wall-top lanes are supported, with ordinary stair steps and physical end rubble', t => {
  const city = createUndergroundWarriorCity();
  try {
    const market = survey(city, city.arcadeRoute);
    const wall = survey(city, city.wallRoute);
    assert.equal(market.maxStep, 0);
    assert.ok(wall.maxStep > 0 && wall.maxStep <= .31);
    assert.equal(wall.lastHeight, -158.7);
    const lanes = [27.65, 28.55].map(north => survey(city, [{ east: 94, north }, { east: 175.8, north }]));
    assert.ok(lanes.every(lane => lane.lastHeight === -158.7 && lane.maxStep === 0));
    for (const end of [90, 178]) {
      for (const north of [26.01, 27, 28.3, 29, 30.59]) assert.equal(city.isWalkable(end, north), false);
    }
    assert.equal(city.isWalkable(151.5, 29.63), false);
    t.diagnostic(`${market.samples} arcade and ${wall.samples + lanes.reduce((sum, lane) => sum + lane.samples, 0)} wall probes, highest step ${wall.maxStep.toFixed(2)} m`);
  } finally { city.dispose(); }
  assert.equal(city.group.children.length, 0);
});
