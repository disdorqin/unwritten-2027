import assert from 'node:assert/strict';
import test from 'node:test';
import { Group, Mesh, Raycaster, Vector3 } from 'three';
import { isNorthRidgeNorthWall, sampleNorthRidge350 } from '../tools/voxel-tavern/town-blockout/north-ridge-350-terrain';
import {
  createNorthRidgeClimb, northRidgeClimbFaceAt, northRidgeClimbPitchAt, northRidgeClimbSpec,
  northRidgeClimbStandingAt, northRidgeIceTongues, northRidgeRockShelves, northRidgeWallPitchAt,
} from '../tools/voxel-tavern/town-blockout/north-ridge-climb';
import { mountNorthRidgeClimb } from '../tools/voxel-tavern/town-blockout/north-ridge-climb-scene';

const toDegrees = (radians: number) => radians * 180 / Math.PI;
const rounded = (value: number) => Number(value.toFixed(6));
const delta = 1 / 60;
const up = { up: 1, right: 0 };
const down = { up: -1, right: 0 };
const still = { up: 0, right: 0 };

test('P-14 registered north-wall faces remain native, with an experience-pitch traverse and twelve standing shelves', t => {
  const spec = northRidgeClimbSpec;
  let routeLow = Infinity, routeHigh = -Infinity, nativeLow = Infinity, nativeHigh = -Infinity;
  let minHullClearance = Infinity, checked = 0, length = 0;
  let previous = northRidgeClimbFaceAt(spec.firstHeight);
  for (let y = spec.firstHeight; y <= spec.lastHeight; y += .125) {
    const pitch = toDegrees(northRidgeClimbPitchAt(y));
    routeLow = Math.min(pitch, routeLow);
    routeHigh = Math.max(pitch, routeHigh);
    const point = northRidgeClimbFaceAt(y);
    length += Math.hypot(previous.east - point.east, previous.north - point.north, previous.y - y);
    previous = point;
    for (const lane of [-spec.routeLane, 0, spec.routeLane]) {
      const { east, north } = northRidgeClimbFaceAt(y, lane);
      const native = toDegrees(northRidgeWallPitchAt(east, north));
      assert.ok(isNorthRidgeNorthWall(east, north));
      assert.ok(Math.abs(sampleNorthRidge350(east, north) - y) < 1e-7);
      assert.ok(native >= 55);
      minHullClearance = Math.min(minHullClearance,
        y - sampleNorthRidge350(east, north + spec.gripStandOff - spec.bootRadius));
      nativeLow = Math.min(native, nativeLow);
      nativeHigh = Math.max(native, nativeHigh);
      checked++;
    }
  }
  assert.ok(routeLow >= 55 && routeHigh <= 60);
  assert.ok(minHullClearance >= .2);
  assert.equal(northRidgeRockShelves.length, 12);
  assert.ok(northRidgeRockShelves.slice(1).every((shelf, index) => shelf.face.y - northRidgeRockShelves[index]!.face.y === 15));
  for (const shelf of northRidgeRockShelves) {
    assert.equal(northRidgeClimbStandingAt(shelf.standing.east, shelf.standing.north, shelf.id), shelf.face.y);
    assert.equal(northRidgeClimbStandingAt(shelf.face.east, shelf.face.north + spec.gripStandOff, shelf.id), undefined);
    for (const pad of shelf.pads) {
      assert.ok(isNorthRidgeNorthWall(pad.east, pad.north));
      assert.ok(sampleNorthRidge350(pad.east, pad.north) < shelf.face.y);
    }
  }
  const iceRise = northRidgeIceTongues.reduce((sum, item) => sum + item.to - item.from, 0);
  assert.ok(iceRise / (spec.lastHeight - spec.firstHeight) <= .10);
  t.diagnostic(JSON.stringify({ routeDegrees: [rounded(routeLow), rounded(routeHigh)], naturalWallDegrees: [rounded(nativeLow), rounded(nativeHigh)],
    routeLength: rounded(length), facePoints: checked, minimumBootClear: rounded(minHullClearance), shelves: 12, shelfRise: 15,
    iceFraction: rounded(iceRise / (spec.lastHeight - spec.firstHeight)), first: northRidgeRockShelves[0]!.face, last: northRidgeRockShelves.at(-1)!.face }));
});

test('P-14 native ascent and retreat can traverse all ledges, pause on ice and alternate each hand', t => {
  const action = createNorthRidgeClimb();
  function walk(input: typeof up, finish: number) {
    assert.equal(action.grip(action.state().yaw), true);
    const warnings = new Set<number>();
    const visited = new Set<number>();
    let ticks = 0, maxSpeed = 0;
    while (action.state().mode !== 'standing' && ticks++ < 12_000) {
      const before = action.state();
      if (before.iceWarning) {
        warnings.add(northRidgeIceTongues.findIndex(seam => before.position.y >= seam.from && before.position.y <= seam.to));
        for (let i = 0; i < 120; i++) action.step(still, delta);
        const settled = action.state();
        assert.equal(settled.iceSettled, true);
        assert.deepEqual(settled.position, before.position);
        assert.equal(settled.gripHands.moving, false);
      }
      action.step(input, delta);
      const after = action.state();
      visited.add(after.shelf);
      if (after.mode !== 'standing') maxSpeed = Math.max(maxSpeed, Math.hypot(after.position.east - before.position.east,
        after.position.north - before.position.north, after.position.y - before.position.y) / delta);
    }
    const end = action.state();
    assert.equal(end.mode, 'standing');
    assert.equal(end.shelf, finish);
    assert.equal(end.damageTaken, 0);
    assert.equal(end.slips, 0);
    assert.equal(warnings.size, 2);
    assert.equal(visited.size, 12);
    assert.ok(maxSpeed <= 1.401 && maxSpeed > 1.39);
    return { end: end.position, moveTicks: ticks, handSwaps: end.handSwaps, achievedMax: rounded(maxSpeed) };
  }
  const ascent = walk(up, 11);
  const descent = walk(down, 0);
  assert.ok(ascent.handSwaps > 400 && descent.handSwaps > ascent.handSwaps);
  t.diagnostic(JSON.stringify({ ascent, descent }));
});

test('P-14 grip, ledge-only release, fall recovery and flight/sled exclusion hold on both action boundaries', t => {
  const climb = createNorthRidgeClimb();
  assert.equal(climb.grip(climb.state().yaw + Math.PI), false);
  for (const action of ['sled', 'flight'] as const) {
    assert.equal(climb.startOther(action), true);
    assert.equal(climb.grip(climb.state().yaw), false);
    assert.equal(climb.endOther(), true);
  }
  assert.equal(climb.grip(climb.state().yaw), true);
  for (let i = 0; i < 40; i++) climb.step({ up: 0, right: 1 }, delta);
  assert.ok(climb.state().position.east > northRidgeRockShelves[0]!.face.east + .5);
  climb.step(still, delta);
  assert.equal(climb.state().gripHands.moving, false);
  for (let i = 0; i < 50; i++) climb.step(up, delta);
  assert.equal(climb.release(), false);
  assert.equal(climb.startOther('sled'), false);
  assert.equal(climb.startOther('flight'), false);
  for (let i = 0; i < 2000 && climb.state().mode === 'climbing'; i++) climb.step(up, delta);
  const dropped = climb.state();
  assert.equal(dropped.mode, 'slipping');
  assert.equal(dropped.shelf, 2);
  assert.equal(climb.grip(dropped.yaw), false);
  assert.equal(climb.startOther('flight'), false);
  for (let i = 0; i < 120 && climb.state().mode === 'slipping'; i++) climb.step(up, delta);
  assert.equal(climb.state().mode, 'standing');
  assert.deepEqual(climb.state().position, northRidgeRockShelves[2]!.standing);
  assert.equal(climb.state().damageTaken, 0);
  assert.equal(climb.state().recoveries, 1);
  climb.setStormClosed(true);
  assert.equal(climb.grip(climb.state().yaw), false);
  climb.setStormClosed(false);
  assert.equal(climb.grip(climb.state().yaw), true);
  assert.equal(climb.release(), true);
  t.diagnostic(JSON.stringify({ dropped: dropped.position, recovered: climb.state().position, shelf: 2, damage: 0 }));
});

test('P-14 carved rock supports the actual scene capsule and all ledge tops are flush with standing data', t => {
  const stage = new Group();
  const wall = mountNorthRidgeClimb(stage);
  stage.updateMatrixWorld(true);
  const face = wall.group.getObjectByName('native-north-ridge-face') as Mesh;
  assert.ok(face.isMesh);
  let maximumWallGeometryError = 0;
  for (const shelf of northRidgeRockShelves) {
    for (const [side, pad] of shelf.pads.entries()) {
      const mesh = wall.group.getObjectByName(`rock-shelf-${shelf.id}-${side}`) as Mesh;
      const ray = new Raycaster(new Vector3(pad.east, shelf.face.y + .5, -pad.north), new Vector3(0, -1, 0), 0, 1);
      assert.ok(Math.abs(ray.intersectObject(mesh)[0]!.point.y - shelf.face.y) < 1e-9);
    }
  }
  for (let y = 68; y <= 233; y += 2.5) {
    const { east, north } = northRidgeClimbFaceAt(y);
    const ray = new Raycaster(new Vector3(east, y + 1, -north), new Vector3(0, -1, 0), 0, 2);
    const rendered = ray.intersectObject(face)[0]!.point.y;
    maximumWallGeometryError = Math.max(maximumWallGeometryError, Math.abs(y - rendered));
  }
  assert.ok(maximumWallGeometryError < .02);
  assert.ok(wall.group.getObjectByName('north-wall-finishing-flag'));
  assert.equal(wall.group.children.filter(node => /^ice-tongue-/.test(node.name)).length, 2);
  wall.dispose();
  wall.dispose();
  assert.equal(stage.children.length, 0);
  t.diagnostic(JSON.stringify({ meshError: maximumWallGeometryError, ledgeTops: 24, triangles: face.geometry.index!.count / 3 }));
});
