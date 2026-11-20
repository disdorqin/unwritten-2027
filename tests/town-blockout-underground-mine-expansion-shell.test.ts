import assert from 'node:assert/strict';
import test from 'node:test';
import { BufferAttribute, BufferGeometry, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { createUndergroundMineExpansionShell } from '../tools/voxel-tavern/town-blockout/underground-mine-expansion-shell.js';

const options = { seam: [3, -91, 45] as const, openingWidth: 4, openingHeight: 3.5, layerStartZ: 0 };
const playerRadius = .27;
const standingHeight = 1.8;

function surfacesFor(mesh: ReturnType<typeof createUndergroundMineExpansionShell>['mesh']) {
  return Object.fromEntries(Object.entries(mesh).map(([surface, positions]) => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    return [surface, new Mesh(geometry, new MeshBasicMaterial())];
  }));
}

function cast(surface: Mesh | Mesh[], at: Vector3, direction: Vector3) {
  return new Raycaster(at, direction).intersectObjects(Array.isArray(surface) ? surface : [surface], false)[0];
}

test('the expansion keeps the camp footprint seam and rail route continuously walkable', () => {
  const shell = createUndergroundMineExpansionShell(options);
  const [x, floor, seamZ] = options.seam;
  assert.deepEqual(shell.bounds, { minX: -97, maxX: 103, minZ: 45, maxZ: 140 });
  assert.deepEqual(shell.route[0], options.seam);
  assert.deepEqual(shell.route.at(-1), shell.gateApproach);
  for (let i = 1; i < shell.route.length; i++) {
    const from = shell.route[i - 1][2];
    const to = shell.route[i][2];
    assert.ok(from < to);
    const steps = Math.ceil((to - from) / .1);
    for (let step = 0; step <= steps; step++) {
      const z = from + (to - from) * step / steps;
      const passage = shell.queryPassage(x, z, playerRadius, standingHeight);
      assert.ok(passage, 'no walkable floor at z=' + z);
      assert.equal(passage.floor, floor);
      assert.equal(passage.waterDepth, 0);
      assert.equal(passage.requiresCrouch, false);
      assert.equal(passage.encounter, false);
      if (z > seamZ + 5) assert.ok(passage.clearance >= 6 && passage.clearance <= 9);
    }
  }
  assert.ok(shell.queryPassage(x, seamZ - .12, playerRadius, standingHeight));
  assert.ok(shell.queryPassage(x, seamZ - playerRadius, playerRadius, standingHeight));
  assert.equal(shell.queryPassage(x, seamZ - .3, playerRadius, standingHeight), undefined);
  assert.equal(shell.queryPassage(x + 1.9, seamZ - .12, playerRadius, standingHeight), undefined);
  assert.equal(shell.queryPassage(x, seamZ + .12, playerRadius, 3.51), undefined);
  assert.equal(shell.queryPassage(x, shell.bounds.maxZ - .1, playerRadius, standingHeight), undefined);
});

test('both mining faces are reached through the shared shell openings', () => {
  const shell = createUndergroundMineExpansionShell(options);
  const [x, floor] = options.seam;
  const rock = surfacesFor(shell.mesh).rock;
  for (const [direction, routeIndex, extent] of [[-1, 2, shell.bounds.minX], [1, 3, shell.bounds.maxX]]) {
    const z = shell.route[routeIndex][2];
    const steps = Math.ceil((Math.abs(extent - x) - .5) / .2);
    for (let step = 0; step <= steps; step++) {
      const east = x + (extent - .5 * direction - x) * step / steps;
      const passage = shell.queryPassage(east, z, playerRadius, standingHeight);
      assert.ok(passage, 'no walkable mining passage at x=' + east);
      assert.ok(passage.clearance >= 6 && passage.clearance <= 9);
    }
    const face = cast(rock, new Vector3(x, floor + 1.2, z), new Vector3(direction, 0, 0));
    assert.equal(face.point.x, extent);
    assert.equal(shell.queryPassage(extent, z, playerRadius, standingHeight), undefined);
  }
  assert.equal(shell.queryPassage(x + 15, shell.route[2][2], playerRadius, standingHeight), undefined);
  assert.equal(shell.queryPassage(x - 15, shell.route[3][2], playerRadius, standingHeight), undefined);
});

test('rock and rail provide continuous support, with a separate ankle-deep water surface', () => {
  const shell = createUndergroundMineExpansionShell(options);
  const [x, floor, seamZ] = options.seam;
  const { rock, rail, water } = surfacesFor(shell.mesh);
  const down = new Vector3(0, -1, 0);
  for (const [, , z] of shell.route) {
    assert.equal(cast(rock, new Vector3(x, floor + 2, z), down).point.y, floor);
    for (const offset of [-.5, .5]) {
      const support = cast([rock, rail], new Vector3(x + offset, floor + 2, z), down);
      assert.equal(support.object, rail);
      assert.equal(support.point.y, floor);
    }
  }

  const wetZ = shell.route[4][2] + 2;
  const wetX = x + 5.8;
  const passage = shell.queryPassage(wetX, wetZ, playerRadius, standingHeight);
  assert.ok(passage);
  assert.ok(Math.abs(passage.waterDepth - .12) < 1e-9);
  assert.ok(Math.abs(passage.floor - (floor - .12)) < 1e-9);
  assert.ok(Math.abs(cast(rock, new Vector3(wetX, floor + 2, wetZ), down).point.y - passage.floor) < 1e-5);
  assert.equal(cast(water, new Vector3(wetX, floor + 2, wetZ), down).point.y, floor);
  assert.equal(cast(water, new Vector3(x, floor + 2, wetZ), down), undefined);
  assert.equal(cast(rock, new Vector3(x, floor + 2, seamZ - .5), new Vector3(0, 0, 1)).point.z, 140);
});

test('impossible openings, casts outside the shell and nonfinite geometry are rejected', () => {
  assert.throws(() => createUndergroundMineExpansionShell({ ...options, openingWidth: 0 }), RangeError);
  assert.throws(() => createUndergroundMineExpansionShell({ ...options, seam: [0, -91, 120] }), RangeError);
  assert.throws(() => createUndergroundMineExpansionShell({ ...options, seam: [1e20, -91, 45] }), RangeError);
  const shell = createUndergroundMineExpansionShell(options);
  assert.equal(shell.queryPassage(NaN, 60, playerRadius, standingHeight), undefined);
  assert.equal(shell.queryPassage(3, 60, -1, standingHeight), undefined);
  assert.equal(shell.queryPassage(3, 60, playerRadius, 8), undefined);
  assert.equal(shell.queryPassage(3, 60, playerRadius, 0), undefined);
});
