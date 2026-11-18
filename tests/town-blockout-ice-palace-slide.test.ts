import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, Vector3 } from 'three';
import { icePalaceForecourt } from '../tools/voxel-tavern/town-blockout/ice-palace-forecourt.ts';
import {
  castleIceSlideDuration, castleIceSlideProfile, createCastleIceSlideActivity, mountCastleIceSlide,
  sampleCastleIceSlide,
} from '../tools/voxel-tavern/town-blockout/ice-palace-slide.ts';
import { buildIceCastle } from '../tools/voxel-tavern/town-blockout/landmark-ice-castle.ts';
import { readWalkGeometry, type Box } from '../tools/voxel-tavern/town-blockout/landmark-kit.ts';
import { canEnter, createTerrainGrid, isWater } from '../tools/voxel-tavern/town-blockout/terrain.ts';
import type { TownSeat } from '../tools/voxel-tavern/town-blockout/town-activity.ts';

function touches(x: number, n: number, { min, max }: Box) {
  return Math.hypot(Math.max(min[0] - x, x - max[0], 0), Math.max(min[2] + n, -n - max[2], 0)) < .27;
}

test('fixed ride accelerates along an ice grade no steeper than S1 and stops on the same level', () => {
  const first = sampleCastleIceSlide(0);
  const last = sampleCastleIceSlide(castleIceSlideDuration);
  assert.equal(first.speed, 0);
  assert.equal(last.speed, 0);
  assert.equal(last.y, .12);
  assert.equal(last.pitch, 0);
  assert.ok(last.z - first.z >= 9.7 - 1e-9);
  assert.ok(castleIceSlideDuration > 4 && castleIceSlideDuration < 5);
  for (let i = 1; i < castleIceSlideProfile.length; i++) {
    const [z0, y0] = castleIceSlideProfile[i - 1], [z1, y1] = castleIceSlideProfile[i];
    assert.ok((y0 - y1) / (z1 - z0) <= .2851);
  }
  let previous = first;
  let peak = 0;
  for (let i = 1; i <= 500; i++) {
    const pose = sampleCastleIceSlide(i * castleIceSlideDuration / 500);
    assert.ok(pose.z > previous.z, 'first seat sample is not repeated after the ride advances');
    assert.ok(pose.y <= previous.y + 1e-9);
    peak = Math.max(peak, pose.speed);
    previous = pose;
  }
  assert.ok(peak > 4 && peak < 4.11);
});

test('actual castle geometry has one slide mesh, a clear staircase, seated path, and level egress', () => {
  const castle = buildIceCastle();
  castle.position.set(484, 12, -72);
  const mesh = mountCastleIceSlide(castle);
  assert.equal(mountCastleIceSlide(castle), mesh);
  assert.equal(castle.children.filter(child => child.name === mesh.name).length, 1);
  assert.ok(mesh.count * 12 < 5_000);
  const { colliders, floors, ramps } = readWalkGeometry(castle);
  const grid = createTerrainGrid();
  const blockers = [...colliders, ...floors];
  const clear = (x: number, n: number, feet: number) => !blockers.some(box =>
    touches(x, n, box) && feet + .025 < box.max[1] && feet + 1.775 > box.min[1]);
  const canStand = (x: number, n: number, feet: number) => clear(x, n, feet) && canEnter(x, n) && !isWater(x, n);
  const slide = createCastleIceSlideActivity(castle, { sit() {}, announce() {} }, canStand);
  assert.equal(slide.spots.length, 1);
  const [start] = slide.spots;
  assert.ok(start.available?.());
  let feet = 12.12;
  const samples = 200;
  for (let i = 0; i <= samples; i++) {
    const n = 42.0 + (start.n - 42.0) * i / samples;
    const x = start.x;
    const support = Math.max(grid.heightAt(x, n), ...floors.filter(box => box.max[1] <= feet + .43 && touches(x, n, box))
      .map(box => box.max[1]));
    assert.ok(Math.abs(feet - support) <= .43 && canStand(x, n, support), `step blocked at ${x}/${n}/${support}`);
    feet = support;
  }
  assert.equal(feet, start.ground);
  for (let i = 0; i <= 500; i++) {
    const pose = sampleCastleIceSlide(i * castleIceSlideDuration / 500);
    const world = castle.localToWorld(new Vector3(pose.x, pose.y, pose.z));
    assert.ok(canStand(world.x, -world.z, world.y), `seated line blocked at ${world.toArray()}`);
    const supported = ramps.some(ramp => world.x >= ramp.min[0] && world.x <= ramp.max[0] &&
      world.z >= ramp.min[2] && world.z <= ramp.max[2] && world.y >= ramp.min[1] && world.y <= ramp.max[1]) ||
      floors.some(floor => Math.abs(floor.max[1] - world.y) < 1e-6 && touches(world.x, -world.z, floor));
    assert.ok(supported, `unsupported slide pose ${world.toArray()}`);
  }
  start.run();
  const completion = slide.step(castleIceSlideDuration, true);
  assert.equal(completion?.kind, 'land');
  if (completion?.kind !== 'land') return;
  const { landing } = completion;
  for (let i = 0; i <= 50; i++) assert.ok(canStand(landing.x + i * .045, landing.n, landing.ground));

  const slideOnly = new Group();
  slideOnly.position.copy(castle.position);
  mountCastleIceSlide(slideOnly);
  const newColliders = readWalkGeometry(slideOnly).colliders;
  const route = icePalaceForecourt.stationTrail;
  for (let i = 1; i < route.length; i++) {
    const [a, b] = [route[i - 1], route[i]];
    const x = b[0] - a[0], n = b[1] - a[1], distance = Math.hypot(x, n);
    const steps = Math.ceil(distance / .25);
    for (let j = 0; j <= steps; j++) for (let cross = -3; cross <= 3; cross += .5) {
      const east = a[0] + x * j / steps - n * cross / distance;
      const north = a[1] + n * j / steps + x * cross / distance;
      assert.ok(!newColliders.some(box => box.max[1] > 12.145 && touches(east, north, box)), `new slide blocks station corridor at ${east}/${north}`);
    }
  }
});

test('single launch ignores repeated input and releases safely on finish, cancel, or lost seat', () => {
  const castle = buildIceCastle();
  castle.position.set(484, 12, -72);
  const seats: TownSeat[] = [];
  let allowLanding = true;
  const slide = createCastleIceSlideActivity(castle, { sit(seat) { seats.push({ ...seat }); }, announce() {} },
    (_, n) => n > 45 || allowLanding);
  const [start] = slide.spots;
  assert.equal(slide.step(1, false), undefined);
  assert.equal(slide.cancel(), undefined);
  start.run();
  start.run();
  assert.equal(seats.length, 1);
  const first = slide.step(.1, true);
  assert.equal(first?.kind, 'riding');
  if (first?.kind !== 'riding') return;
  assert.ok(first.seat.n < seats[0].n);
  const earlyExit = slide.cancel();
  assert.ok(earlyExit && earlyExit.n > 50);
  assert.equal(slide.active(), false);

  start.run();
  assert.equal(slide.step(.1, false), undefined);
  assert.equal(slide.active(), false);

  start.run();
  allowLanding = false;
  assert.equal(slide.step(castleIceSlideDuration, true)?.kind, 'riding');
  assert.equal(slide.active(), true);
  allowLanding = true;
  assert.equal(slide.step(0, true)?.kind, 'land');
  assert.equal(slide.active(), false);
  start.run();
  slide.reset();
  assert.equal(slide.active(), false);
});
