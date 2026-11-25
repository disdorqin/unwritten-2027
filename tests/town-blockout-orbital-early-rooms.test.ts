import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, Mesh, Scene, Vector3 } from 'three';
import { createOrbitalEarlyRooms } from '../tools/voxel-tavern/town-blockout/orbital-early-rooms';

test('the two arrivals and door approaches are distinct, walkable and face into the airlock', () => {
  const { group, ports, isWalkable } = createOrbitalEarlyRooms();
  const scene = new Scene();
  scene.add(group);
  assert.equal(group.parent, scene);
  assert.equal(group.name, 'orbital-early-rooms');
  assert.ok(group.getObjectByName('orbital-airlock') instanceof Group);
  assert.ok(group.getObjectByName('orbital-cockpit') instanceof Group);
  for (const { frame, approach, arrival } of Object.values(ports)) {
    assert.equal(arrival.ground, 0);
    assert.ok(isWalkable(approach.x, approach.n));
    assert.ok(isWalkable(arrival.x, arrival.n));
    assert.ok(!isWalkable(frame.x, frame.n));
    assert.ok(Math.sign(Math.sin(arrival.yaw)) === -Math.sign(arrival.x));
    assert.equal(Math.sign(frame.x), Math.sign(arrival.x));
  }
  assert.notEqual(ports.starport.arrival.x, ports.coreVault.arrival.x);
});

test('the two destinations use town-chronicle rings and the status wall has just two green systems', () => {
  const { group } = createOrbitalEarlyRooms();
  for (const name of ['orbital-starport-frame', 'orbital-core-vault-frame']) {
    const frame = group.getObjectByName(name);
    assert.ok(frame);
    assert.ok(frame.children.some(child => child.name === 'town-chronicle-ring'));
    assert.ok(frame.getObjectByName('closed-door-surface') instanceof Mesh);
  }
  const names: string[] = [];
  group.traverse(object => { if (object.name.startsWith('status-')) names.push(object.name); });
  assert.equal(names.filter(name => name === 'status-red').length, 16);
  assert.equal(names.filter(name => name === 'status-teleport').length, 1);
  assert.equal(names.filter(name => name === 'status-life-support').length, 1);
  assert.ok(group.getObjectByName('old-dust-print'));
});

test('a continuous open route crosses the ramp to the two walkable hand positions', () => {
  const { floorHeightAt, isWalkable, cockpit } = createOrbitalEarlyRooms();
  assert.equal(floorHeightAt(0, 3.2), 0);
  assert.equal(floorHeightAt(0, 4.8), .32);
  assert.ok(Math.abs(floorHeightAt(0, 4)! - .16) < 1e-10);
  for (const { x, n } of [cockpit.leftHand, cockpit.rightHand]) {
    for (let eighths = -9; eighths <= Math.floor(n * 8); eighths++) {
      assert.ok(isWalkable(x, eighths / 8), `blocked along route x=${x} n=${eighths / 8}`);
    }
    assert.ok(isWalkable(x, n));
    assert.equal(floorHeightAt(x, n), .32);
  }
  assert.notEqual(cockpit.leftHand.x, cockpit.rightHand.x);
});

test('the walking footprint rejects walls, corners, console and captain furniture', () => {
  const { isWalkable, collisions, floorHeightAt } = createOrbitalEarlyRooms();
  assert.equal(floorHeightAt(3, 4), undefined);
  assert.ok(!isWalkable(1.5, 4, .27));
  assert.ok(isWalkable(1.5, 4, .15));
  assert.ok(!isWalkable(5.25, 0));
  assert.ok(!isWalkable(5.1, -.35));
  assert.ok(isWalkable(5.1, 1.4));
  assert.ok(!isWalkable(0, 11.7, 0));
  assert.ok(!isWalkable(0, 0, Number.NaN));
  assert.ok(!isWalkable(0, 0, -.1));
  assert.ok(!isWalkable(Infinity, 0));
  assert.deepEqual(new Set(collisions.map(obstacle => obstacle.kind)),
    new Set(['door-frame', 'console', 'captain-chair', 'captain-table', 'status-panel']));
  for (const { minX, maxX, minN, maxN } of collisions) {
    assert.ok(!isWalkable((minX + maxX) / 2, (minN + maxN) / 2, 0));
  }
});

test('the two hand hooks surround a blank, half-page log with its own indicator', () => {
  const { group, cockpit, isWalkable } = createOrbitalEarlyRooms();
  assert.equal(cockpit.log.text, '');
  assert.equal(cockpit.log.lastPageFill, .5);
  assert.ok(!isWalkable(cockpit.log.x, cockpit.log.n, 0));
  assert.ok(group.getObjectByName('blank-log-bay')?.getObjectByName('log-page-lamp'));
  assert.ok(group.getObjectByName('upturned-cup'));
});

test('interior size scales the floor, markers, rendered log and collision bounds together', () => {
  const base = createOrbitalEarlyRooms();
  const large = createOrbitalEarlyRooms({ scale: 2 });
  assert.equal(large.rooms.passage.maxX, base.rooms.passage.maxX * 2);
  assert.equal(large.cockpit.log.ground, base.cockpit.log.ground * 2);
  assert.equal(large.ports.starport.arrival.x, base.ports.starport.arrival.x * 2);
  const log = large.group.getObjectByName('blank-log-bay');
  assert.ok(log);
  const world = log.getWorldPosition(new Vector3());
  assert.equal(world.z, -large.cockpit.log.n);
  assert.equal(world.y, large.cockpit.log.ground);
  for (const [x, n, radius] of [[.76, 8.63, .27], [4.75, 0, .75], [0, 4, 1]] as const) {
    assert.equal(large.isWalkable(x * 2, n * 2, radius * 2), base.isWalkable(x, n, radius));
  }
  assert.throws(() => createOrbitalEarlyRooms({ scale: 0 }), RangeError);
});

test('window motion is driven by an explicit local clock and leaves the walking surface stable', () => {
  const { group, setWindowMotion, floorHeightAt } = createOrbitalEarlyRooms();
  const horizon = group.getObjectByName('cockpit-planet-horizon');
  const fragment = group.getObjectByName('cockpit-window-fragment');
  assert.ok(horizon && fragment);
  const before = horizon.position.x;
  assert.equal(fragment.visible, false);
  setWindowMotion(26);
  assert.notEqual(horizon.position.x, before);
  assert.equal(fragment.visible, true);
  assert.equal(floorHeightAt(0, 10), .32);
  setWindowMotion(27.5);
  assert.equal(fragment.visible, false);
  const last = horizon.position.x;
  setWindowMotion(-1);
  assert.equal(horizon.position.x, last);
});
