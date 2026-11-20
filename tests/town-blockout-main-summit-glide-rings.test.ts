import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSnowWingFlight } from '../src/shared/snow-wing';
import { createMainSummitBlock, mainSummitBounds, mainSummitLayout } from '../tools/voxel-tavern/town-blockout/main-summit-block';
import {
  createSummitGlideRingProgress, surveySummitGlideRings, type SummitGlideRing,
} from '../tools/voxel-tavern/town-blockout/main-summit-glide-rings';

type Point = Pick<SummitGlideRing, 'east' | 'north' | 'height'>;

const travelTargets = [60, 120, 190];
const bodyCenterHeight = 1.5;

function close(actual: number, expected: number, tolerance = 1e-7) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected} by more than ${tolerance}`);
}

function offset(ring: SummitGlideRing, forward: number, lateral = 0, lift = 0): Point {
  const east = Math.sin(ring.heading);
  const north = Math.cos(ring.heading);
  return { east: ring.east + east * forward + north * lateral,
    north: ring.north + north * forward - east * lateral, height: ring.height + lift };
}

test('ZD-01 surveys three clear rings on the existing P-1 neutral F-1 trajectory', context => {
  const terrain = createMainSummitBlock(mainSummitLayout, 347, 50);
  context.after(terrain.dispose);
  const launch = { east: 62.5, north: 975, height: 800, heading: Math.PI, speed: 7.5,
    drop: 800 - terrain.heightAt(62.5, 935)!, pathClear: true, claimed: true };
  const rings = surveySummitGlideRings(launch, terrain.heightAt);
  assert.deepEqual(rings.map(ring => ring.id), ['ring-1', 'ring-2', 'ring-3']);
  assert.deepEqual(surveySummitGlideRings({ ...launch, claimed: false }, terrain.heightAt), []);

  for (const [index, ring] of rings.entries()) {
    close(ring.east, launch.east);
    close(ring.north, launch.north - travelTargets[index]!);
    close(ring.heading, launch.heading);
    assert.equal(ring.radius, 6);
    assert.ok(ring.height > 560 && ring.height < launch.height);
    for (let lateral = -ring.radius; lateral <= ring.radius; lateral += .5) {
      const point = offset(ring, 0, lateral, -ring.radius);
      assert.ok(point.east > mainSummitBounds.west && point.east < mainSummitBounds.east);
      assert.ok(point.north > mainSummitBounds.south && point.north < mainSummitBounds.north);
      const ground = terrain.heightAt(point.east, point.north);
      assert.ok(ground !== undefined && point.height - ground > 5, `P-1 terrain clears ${ring.id}`);
    }
  }

  const flight = createSnowWingFlight(terrain.heightAt);
  assert.ok(flight.launch(launch));
  const progress = createSummitGlideRingProgress(rings);
  let previous = flight.snapshot()!;
  let next = 0;
  for (let frame = 0; frame < 1_200 && next < rings.length; frame++) {
    const current = flight.advance(1 / 60)!;
    assert.notEqual(current.phase, 'landed');
    progress.advance({ ...previous, height: previous.height + bodyCenterHeight },
      { ...current, height: current.height + bodyCenterHeight });

    const metres = travelTargets[next]!;
    if (current.horizontalMetres >= metres) {
      assert.deepEqual(progress.snapshot(), rings.slice(0, next + 1).map(ring => ring.id));
      const fraction = (metres - previous.horizontalMetres) / (current.horizontalMetres - previous.horizontalMetres);
      close(rings[next]!.height, previous.height + (current.height - previous.height) * fraction + bodyCenterHeight, .02);
      close(current.speed, 15);
      next++;
    }
    previous = current;
  }
  assert.deepEqual(progress.snapshot(), rings.map(ring => ring.id));
  close((travelTargets[2]! - travelTargets[1]!) / (rings[1]!.height - rings[2]!.height), 6);
});

test('ZD-01 credits an ordered forward passage through the circular opening only once', () => {
  const first = { id: 'ring-1', east: 1, north: 2, height: 400, heading: Math.PI / 3, radius: 6 };
  const second = { ...first, ...offset(first, 20), id: 'ring-2' };
  const progress = createSummitGlideRingProgress([first, second]);
  progress.advance(offset(second, -4), offset(second, 4));
  progress.advance(offset(first, 4), offset(first, -4));
  progress.advance(offset(first, -4, 7), offset(first, 4, 7));
  progress.advance(offset(first, -4, 4.5, 4.5), offset(first, 4, 4.5, 4.5));
  assert.deepEqual(progress.snapshot(), []);

  progress.advance(offset(first, -4, -8, 2), offset(first, 4, 8, 2));
  assert.deepEqual(progress.snapshot(), [first.id], 'The plane intersection is inside even with both endpoints outside');
  progress.advance(offset(first, -4), offset(first, 4));
  assert.deepEqual(progress.snapshot(), [first.id], 'A repeated first-ring passage does not credit the second ring');
  progress.advance(offset(second, -4), offset(second, 4));
  progress.advance(offset(second, -4), offset(second, 4));
  assert.deepEqual(progress.snapshot(), [first.id, second.id]);
});

test('ZD-01 crossing a plane on a frame boundary gives the same progress as a single segment', () => {
  const rings = [0, 20, 40].map((north, index) =>
    ({ id: `ring-${index + 1}`, east: 0, north, height: 500, heading: 0, radius: 6 }));
  const point = (north: number) => ({ east: 0, north, height: 500 });
  const single = createSummitGlideRingProgress(rings);
  single.advance(point(-5), point(45));

  const split = createSummitGlideRingProgress(rings);
  for (let north = -5; north < 45; north += 5) split.advance(point(north), point(north + 5));
  assert.deepEqual(single.snapshot(), rings.map(ring => ring.id));
  assert.deepEqual(split.snapshot(), single.snapshot());
});
