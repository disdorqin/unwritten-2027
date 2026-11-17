import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bridgeAt, createTerrainGrid, layout, riverX, waterHeight, worldBounds } from '../tools/voxel-tavern/town-blockout/terrain.ts';
import { createTownWater, shoreJumpDepth } from '../tools/voxel-tavern/town-blockout/town-water.ts';
import { createTownPhysicsClock, townPhysicsDelta } from '../tools/voxel-tavern/town-blockout/town-physics-clock.ts';

const grid = createTerrainGrid();
const water = createTownWater(grid);

test('river crossings transition through shallow water and swimming without an unwalkable bank step', () => {
  const crossings = [
    { north: 120, from: 266, to: 303 },
    { north: 170, from: 308, to: 273 },
    { north: 400, from: 212, to: 246 },
  ];
  for (const { north, from, to } of crossings) {
    const steps = Math.ceil(Math.abs(to - from) / .12);
    const transitions: string[] = [];
    let previous = grid.heightAt(from, north);
    for (let i = 0; i <= steps; i++) {
      const x = from + (to - from) * i / steps;
      const wet = water.at(x, north);
      const ground = wet?.ground ?? grid.heightAt(x, north);
      assert.ok(!bridgeAt(x, north), `test took a bridge at ${x}, ${north}`);
      assert.ok(Math.abs(ground - previous) <= .43, `bank step at ${x}, ${north}`);
      previous = ground;

      if (wet) {
        assert.ok(wet.ground >= grid.groundHeightAt(x, north));
        assert.ok(wet.ground < waterHeight);
        assert.equal(wet.mode, wet.depth < .6 ? 'wade' : 'swim');
        assert.equal(wet.speed, wet.mode === 'wade' ? .55 : .45);
        assert.equal(wet.ground, Math.max(grid.groundHeightAt(x, north), waterHeight - shoreJumpDepth));
      }
      const mode = wet?.mode ?? 'dry';
      if (transitions.at(-1) !== mode) transitions.push(mode);
    }
    assert.deepEqual(transitions, ['dry', 'wade', 'swim', 'wade', 'dry'], `river section ${north}`);
  }
});

test('bridge decks and the ice lake keep dry support despite nearby river water', () => {
  for (const bridge of layout.bridges) {
    const x = riverX(bridge.north);
    assert.equal(water.at(x, bridge.north), undefined);
    assert.equal(grid.heightAt(x, bridge.north), bridge.height);
    assert.ok(grid.groundHeightAt(x, bridge.north) < waterHeight);
  }
  const [iceX, iceNorth] = layout.lake.center;
  assert.equal(grid.surfaces[iceNorth * grid.gridWidth + iceX], 4);
  assert.equal(water.at(iceX, iceNorth), undefined);
  assert.equal(grid.heightAt(iceX, iceNorth), layout.lake.height);
  assert.equal(water.at(riverX(0), 0), undefined);
  assert.equal(water.at(riverX(worldBounds.depth), worldBounds.depth), undefined);
});

test('the 60 Hz town physics clock preserves fractional interpolation and drops excess steps', () => {
  const clock = createTownPhysicsClock();
  let physicsSteps = 0;
  const step = () => physicsSteps++;

  assert.equal(clock.advance(townPhysicsDelta / 2, step), .5);
  assert.equal(physicsSteps, 0);
  assert.equal(clock.advance(townPhysicsDelta / 2, step), 0);
  assert.equal(physicsSteps, 1);

  assert.ok(Math.abs(clock.advance(townPhysicsDelta * 10.25, step) - .25) < 1e-8);
  assert.equal(physicsSteps, 3);
  assert.equal(clock.advance(0, step).toFixed(2), '0.25');
  assert.equal(physicsSteps, 3);

  clock.reset();
  assert.equal(clock.advance(0, step), 0);
  assert.equal(physicsSteps, 3);
});
