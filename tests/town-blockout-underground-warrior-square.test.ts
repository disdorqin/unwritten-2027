import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Box3, Raycaster, Vector3, type BoxGeometry, type InstancedMesh, type MeshLambertMaterial } from 'three';
import type { Box } from '../tools/voxel-tavern/town-blockout/landmark-kit';
import { createWarriorSquare, warriorSquarePlan } from '../tools/voxel-tavern/town-blockout/underground-warrior-square';

function isClear(east: number, north: number, colliders: readonly Box[], radius = .27) {
  const feet = warriorSquarePlan.statue.height;
  return !colliders.some(({ min, max }) => feet + .025 < max[1]! && feet + 1.775 > min[1]! &&
    Math.hypot(Math.max(min[0]! - east, east - max[0]!, 0), Math.max(min[2]! + north, -north - max[2]!, 0)) < radius);
}

test('the east-fallen statue and its low cold-flame groove stay outside the main street', t => {
  const square = createWarriorSquare();
  t.after(() => square.dispose());
  assert.ok(square.colliders.every(({ min }) => -min[2]! < -5.77));
  assert.equal(isClear(square.fireSlot.east, square.fireSlot.north, square.colliders), false);
  assert.ok(isClear(square.fireReserve.east, square.fireReserve.north, square.colliders));
  assert.ok(square.colliders.some(({ min, max }) => min[0]! > 105 && min[1]! < -164.97 && max[1]! > -164.95),
    'the eastern sword tip meets the paving');

  assert.equal(square.fireTone, 'cold');
  assert.deepEqual(square.fireReserve, warriorSquarePlan.fireReserve);
  const flame = square.group.children.filter(child => /warrior-statue-blue/.test(child.name));
  assert.equal(flame.length, 2);
  for (const child of flame) {
    assert.ok('isInstancedMesh' in child);
    const mesh = child as InstancedMesh<BoxGeometry, MeshLambertMaterial>;
    assert.ok(mesh.count > 12 && mesh.material.emissive.b > mesh.material.emissive.r);
  }
  const stone = square.group.getObjectByName('warrior-statue-shadow');
  assert.ok(stone && 'isInstancedMesh' in stone);
  assert.equal((stone as InstancedMesh<BoxGeometry, MeshLambertMaterial>).material.emissive.getHex(), 0);
});

test('the cook’s soup rests on the cold-flame lip beside the existing recovery stand', t => {
  const square = createWarriorSquare();
  t.after(square.dispose);
  const soup = square.group.getObjectByName('warrior-cook-soup') as InstancedMesh | undefined;
  assert.ok(soup?.isInstancedMesh);
  assert.ok(soup.instanceColor);
  square.group.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(soup);
  const { east, north, height } = square.fireReserve;
  const position = soup.getWorldPosition(new Vector3());
  assert.ok(position.distanceTo(new Vector3(east, height, -north)) < .75);
  assert.ok(square.colliders.some(({ min, max }) =>
    min[0]! < position.x && position.x < max[0]! &&
    min[2]! < position.z && position.z < max[2]! &&
    Math.abs(max[1]! - bounds.min.y) < 1e-6));
  const down = new Raycaster(new Vector3(position.x, bounds.max.y + 1, position.z), new Vector3(0, -1, 0));
  assert.deepEqual(down.intersectObject(soup), []);
});

test('the recovery stand and the rooster approach both stay clear of the statue', t => {
  const square = createWarriorSquare();
  t.after(() => square.dispose());
  // The shared B stone socket is .62 m by .56 m, including its stone lip.
  const rooster = { east: 98, north: -6.25, radius: Math.hypot(.31, .28) };
  const paths = [
    [[96.9, 0], [96.9, -6.7]],
    [[98, 0], [98, -5.1]],
    [[91, -7.4], [91, -14.7], [109, -14.7], [109, -7.4]],
  ] as const;
  for (const path of paths) {
    for (let leg = 1; leg < path.length; leg++) {
      const [east, north] = path[leg - 1]!;
      const [endEast, endNorth] = path[leg]!;
      const steps = Math.ceil(Math.hypot(endEast - east, endNorth - north) / .05);
      for (let i = 0; i <= steps; i++) {
        const sampleEast = east + (endEast - east) * i / steps;
        const sampleNorth = north + (endNorth - north) * i / steps;
        assert.ok(isClear(sampleEast, sampleNorth, square.colliders), `blocked at ${sampleEast} / ${sampleNorth}`);
        assert.ok(Math.hypot(sampleEast - rooster.east, sampleNorth - rooster.north) > .27 + rooster.radius);
      }
    }
  }
  assert.ok(isClear(rooster.east, rooster.north, square.colliders, rooster.radius));
});
