import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Vector3 } from 'three';
import { createIcePalaceSnowballRules } from '../tools/voxel-tavern/town-blockout/ice-palace-snowball.ts';
import { icePalaceSite } from '../tools/voxel-tavern/town-blockout/ice-palace-site.ts';
import { readWalkGeometry } from '../tools/voxel-tavern/town-blockout/landmark-kit.ts';
import { buildIceCastle, iceThrone } from '../tools/voxel-tavern/town-blockout/landmark-ice-castle.ts';
import { createSnowballSweep } from '../tools/voxel-tavern/town-blockout/town-snowball-world.ts';

const castle = buildIceCastle();
const [east, north, elevation] = icePalaceSite.buildingOrigin;
castle.position.set(east, elevation, -north);
const rules = createIcePalaceSnowballRules(castle);
const colliders = readWalkGeometry(castle);
const inWorld = (x: number, y: number, z: number) => castle.localToWorld(new Vector3(x, y, z));
const at = (point: Vector3) => ({ x: point.x, n: -point.z, ground: point.y });

function sweepTo(from: Vector3, target: Vector3, originalGeometry = false) {
  const sweep = createSnowballSweep({
    geometryAt: () => originalGeometry ? colliders : rules.projectileGeometry(colliders),
    surfaceHeight: () => elevation, occupiedAt: () => false,
    targets: [{ id: 'local', label: '目标', x: target.x, y: target.y, z: target.z, radius: .27, height: 1.78, onHit() {} }],
  });
  return sweep(from, new Vector3(target.x, from.y, target.z), .1, 'p:1');
}

for (const [name, source, target] of [
  ['throne annex', [22, 1.15, -6.7], [23, .15, -6.7]],
  ['gallery', [2.4, 1.2, -12.4], [6.2, .12, -12.4]],
  ['stair chamber', [5.1, 1.18, -10.7], [7, .12, -10.7]],
  ['timed vault', [13, 1.2, -6.35], [15.6, .15, -6.35]],
] as const) {
  test(`a clear line in the actual ${name} is eligible and hits the avatar capsule`, () => {
    const from = inWorld(source[0], source[1], source[2]);
    const to = inWorld(target[0], target[1], target[2]);
    assert.equal(rules.canRelay(from), true);
    assert.equal(rules.canConfirm(from, at(to)), true);
    assert.equal(sweepTo(from, to)?.targetId, 'local');
  });
}

test('a roof or another palace room does not inherit the indoor exception', () => {
  const gallery = inWorld(3, 1.2, -12.4);
  const galleryRoof = inWorld(3, 4, -12.4);
  const stair = inWorld(6, .12, -10.65);
  const tavern = new Vector3(217, 21, -161);
  assert.equal(rules.canConfirm(galleryRoof, at(gallery)), false);
  assert.equal(rules.canConfirm(gallery, at(stair)), false);
  assert.equal(rules.canConfirm(gallery, at(tavern)), false);
  assert.equal(rules.canRelay(tavern), false);
});

test('the palace hall exception requires an actual throne seat and keeps the target hittable', () => {
  const position = inWorld(...iceThrone.seat);
  const seat = { x: position.x, n: -position.z, eyeY: position.y };
  const target = inWorld(iceThrone.seat[0], iceThrone.seat[1] - 1.65, iceThrone.seat[2]);
  const origin = inWorld(17.5, 1.25, -4.92);
  assert.equal(rules.canConfirm(origin, at(target), seat), true);
  assert.equal(rules.canConfirm(origin, at(target)), false);
  assert.equal(rules.canConfirm(origin, at(target), { ...seat, n: seat.n + .5 }), false);
  assert.equal(rules.canConfirm(origin, at(inWorld(17, .57, -5.1)), seat), false);
  assert.equal(sweepTo(origin, target, true)?.kind, 'world');
  assert.equal(sweepTo(origin, target)?.targetId, 'local');
  const back = inWorld(20.8, 1.25, -4.92);
  assert.equal(sweepTo(back, target)?.kind, 'world');
});

test('the palace exception does not override actual masonry collision', () => {
  const target = inWorld(22.57, .15, -6.7);
  const outside = inWorld(22.57, 1.15, -9);
  assert.equal(rules.canConfirm(outside, at(target)), false);
  assert.equal(sweepTo(outside, target)?.kind, 'world');
});
