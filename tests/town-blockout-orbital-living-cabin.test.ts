import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, Raycaster, Vector3 } from 'three';
import { createOrbitalLivingCabin } from '../tools/voxel-tavern/town-blockout/orbital-living-cabin';

test('the local entrance and both berth rows have a continuous 0.27 m footprint round trip', t => {
  const cabin = createOrbitalLivingCabin();
  try {
    const { port, walkRoute, floorHeightAt, isWalkable, bunks, collisions } = cabin;
    assert.deepEqual(port, {
      frame: { x: 0, n: 0, ground: 0 }, approach: { x: 0, n: -.45, ground: 0 },
      arrival: { x: 0, n: .57, ground: 0, yaw: 0 },
    });
    assert.deepEqual(walkRoute[0], walkRoute.at(-1));
    assert.deepEqual(bunks.map(({ number, row, turnedBack }) => [number, row, turnedBack]), [
      [1, 'west', false], [2, 'west', true], [3, 'west', false],
      [4, 'east', false], [5, 'east', false], [6, 'east', false],
    ]);
    let samples = 0;
    let metres = 0;
    for (let segment = 1; segment < walkRoute.length; segment++) {
      const start = walkRoute[segment - 1]!;
      const finish = walkRoute[segment]!;
      const distance = Math.hypot(finish.x - start.x, finish.n - start.n);
      metres += distance;
      const count = Math.ceil(distance / .125);
      for (let index = 0; index <= count; index++) {
        const fraction = index / count;
        const x = start.x + (finish.x - start.x) * fraction;
        const n = start.n + (finish.n - start.n) * fraction;
        assert.equal(floorHeightAt(x, n), 0, `Unsupported floor X${x}/N${n}`);
        assert.ok(isWalkable(x, n), `Blocked body X${x}/N${n}`);
        samples++;
      }
    }
    assert.ok(samples > 200 && metres > 22);
    for (const { minX, maxX, minN, maxN } of collisions) {
      assert.equal(isWalkable((minX + maxX) / 2, (minN + maxN) / 2), false);
    }
    assert.ok(isWalkable(1.32, -.1));
    assert.ok(!isWalkable(1.51, -.1));
    assert.ok(!isWalkable(4.54, 4));
    assert.equal(floorHeightAt(6, 4), undefined);
    t.diagnostic(`${walkRoute.length} stops / ${samples} probes along ${metres.toFixed(3)} m, zero floor step or body hits`);
  } finally {
    cabin.dispose();
  }
});

test('the one anonymous cloth memento is visible from the third berth inspection point', t => {
  const cabin = createOrbitalLivingCabin();
  try {
    const { group, privateItem, isWalkable } = cabin;
    const { berth, point, view } = privateItem;
    assert.equal(berth, 3);
    assert.deepEqual(point, { x: -3.25, n: 8.02, ground: 1.20 });
    assert.ok(isWalkable(view.x, view.n));
    const alcove = group.getObjectByName('orbital-berth-3');
    assert.ok(alcove);
    const memento = alcove.children.find(child => child.type === 'Group');
    assert.ok(memento && memento.name === '');
    assert.ok(memento.children.length >= 18 && memento.children.every(child => child.type === 'Mesh' && child.name === ''));
    assert.equal(group.children.filter(child => child.type === 'Group' &&
      child.children.some(ornament => ornament.type === 'Group')).length, 1);
    group.updateMatrixWorld(true);
    const eye = new Vector3(view.x, 1.65, -view.n);
    const target = new Vector3(point.x, point.ground + .13, -point.n);
    const ray = new Raycaster(eye, target.sub(eye).normalize());
    const first = ray.intersectObject(group, true)[0];
    assert.ok(first?.object.parent === memento, 'The inspection sightline reaches the memento before furniture');
    assert.ok(!('interact' in cabin) && !('collect' in cabin) && !('inventory' in cabin));
    t.diagnostic(`Third-berth marker X${point.x}/N${point.n}/Y${point.ground}; unobstructed sightline ${first.distance.toFixed(3)} m`);
  } finally {
    cabin.dispose();
  }
});

test('host scaling transforms the anchor and clearance together and the group disposes independently', () => {
  const left = createOrbitalLivingCabin();
  const right = createOrbitalLivingCabin({ scale: 2 });
  const host = new Group();
  host.add(left.group, right.group);
  try {
    for (const { x, n } of left.walkRoute) assert.ok(right.isWalkable(x * 2, n * 2, .54));
    assert.equal(right.privateItem.point.ground, left.privateItem.point.ground * 2);
    assert.equal(right.port.arrival.n, left.port.arrival.n * 2);
    assert.equal(right.rooms.living.maxX, left.rooms.living.maxX * 2);
    assert.equal(left.isWalkable(NaN, 2), false);
    assert.equal(left.isWalkable(0, 2, -1), false);
    assert.throws(() => createOrbitalLivingCabin({ scale: 0 }), RangeError);
  } finally {
    left.dispose();
    assert.deepEqual(host.children, [right.group]);
    right.dispose();
    assert.equal(host.children.length, 0);
  }
});
