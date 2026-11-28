import assert from 'node:assert/strict';
import test from 'node:test';
import { createC2EastCanonicalGround, c2EastSector } from '../tools/voxel-tavern/town-blockout/town-night-c2-summit-canonical';
import {
  c2EastSledOpenRuns, c2EastSledSpec, mountC2EastSledNetwork, planC2EastSledNetwork,
} from '../tools/voxel-tavern/town-blockout/town-night-c2-summit-east-sled-network';

/**
 * C32-P1: the east-sector sled network.
 *
 * 6037.881 m is the *nominal* course length - the survey baseline says so
 * explicitly and no placed route exists. This measures what C2 actually
 * builds: two descents off the 610 m shoulder, cut into the three designed
 * stages by the 380-560 m cloud band, merging at the 380 m contour with the
 * shared lane built once, and every unpermitted run closed in a blizzard.
 */

const ground = createC2EastCanonicalGround();
const plan = planC2EastSledNetwork((e, n) => ground.heightAt(e, n));

test('the network is two measured runs, not the nominal 6 km figure', () => {
  assert.equal(plan.runs.length, 2);
  const [main, branch] = plan.runs;
  assert.ok(Math.abs(main!.metres - 662) < 1, `main ${main!.metres}`);
  assert.ok(Math.abs(branch!.metres - 784) < 1, `branch ${branch!.metres}`);
  assert.ok(Math.abs(plan.metres - 1445) < 2, `network ${plan.metres}`);
  assert.ok(plan.metres < 2_000, 'the east share must not be reported as the 6 km whole');
});

test('the three cloud stages are cut by altitude and each has real metres', () => {
  for (const stage of ['above-cloud', 'through-cloud', 'below-cloud'] as const) {
    assert.ok(plan.stages[stage] > 0, `${stage} is empty`);
  }
  assert.ok(Math.abs(plan.stages['above-cloud'] - 56) < 2, `above ${plan.stages['above-cloud']}`);
  assert.ok(Math.abs(plan.stages['through-cloud'] - 1210) < 3, `through ${plan.stages['through-cloud']}`);
  assert.ok(Math.abs(plan.stages['below-cloud'] - 575) < 3, `below ${plan.stages['below-cloud']}`);
  for (const stage of Object.keys(plan.stages) as (keyof typeof plan.stages)[]) {
    const sum = plan.runs.reduce((total, run) => total + run.stages[stage].metres, 0);
    assert.ok(Math.abs(sum - plan.stages[stage]) < 1e-6, `${stage} must be the sum of its runs`);
  }
});

test('穿云 has no junction: the merge happens below the cloud band in 云下', () => {
  assert.equal(plan.merges.length, 1, 'exactly one real merge');
  const merge = plan.merges[0]!;
  assert.ok(merge.height < c2EastSledSpec.cloudBand[0],
    `merge at ${merge.height} m must be below the 380 m cloud base`);
  assert.equal(merge.run, 'east-branch');
  assert.equal(merge.into, 'east-main');
  // No branch station inside the cloud band is within merge tolerance of the main.
  const branch = plan.runs.find(run => run.id === 'east-branch')!;
  const main = plan.runs.find(run => run.id === 'east-main')!;
  for (const point of branch.points) {
    if (point.height < c2EastSledSpec.cloudBand[0] || point.height > c2EastSledSpec.cloudBand[1]) continue;
    for (const other of main.points) {
      if (other.height < c2EastSledSpec.cloudBand[0] || other.height > c2EastSledSpec.cloudBand[1]) continue;
      assert.ok(Math.hypot(point.east - other.east, point.north - other.north) > c2EastSledSpec.mergeTolerance,
        `the runs must stay separate inside the cloud band (${point.east},${point.north})`);
    }
  }
});

test('the merged lane is built once, not twice', () => {
  assert.ok(plan.sharedMetres > 100, `shared ${plan.sharedMetres}`);
  assert.ok(Math.abs(plan.sharedMetres - 150) < 2);
  // A shared station must not contribute duplicate floor pieces.
  // Both runs legitimately share the summit start platform; what must not
  // repeat is the merged lane below the cloud band.
  const floors = plan.pieces.filter(piece => piece.family === 'floor' && piece.y < c2EastSledSpec.cloudBand[0]);
  const seen = new Map<string, number>();
  for (const floor of floors) {
    const key = `${Math.round(floor.east * 10)}:${Math.round(floor.north * 10)}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const duplicated = [...seen.values()].filter(count => count > 1).length;
  assert.equal(duplicated, 0, 'no lane is laid twice after the merge');
});

test('every piece is inside the east sector, off the seam, and seated on the ground', () => {
  assert.ok(plan.pieces.length > 4_000, `pieces ${plan.pieces.length}`);
  for (const piece of plan.pieces) {
    assert.ok(piece.east >= c2EastSector.west && piece.north >= c2EastSector.south,
      `outside sector ${piece.east},${piece.north}`);
    assert.ok(piece.east - c2EastSector.west >= c2EastSector.boundary - 1e-9, `seam ${piece.east}`);
    assert.ok(piece.north - c2EastSector.south >= c2EastSector.boundary - 1e-9, `seam ${piece.north}`);
    if (piece.family === 'floor') {
      const face = ground.heightAt(piece.east, piece.north);
      assert.equal(face !== undefined, true);
      assert.ok(Math.abs(piece.y - face!) < 1e-9, 'the lane floor sits on the rendered face');
    }
  }
});

test('a blizzard closes every run that is not explicitly permitted', () => {
  const clear = c2EastSledOpenRuns(plan, false);
  assert.ok(clear.every(run => run.open), 'everything runs in clear weather');
  const storm = c2EastSledOpenRuns(plan, true);
  const byId = new Map(storm.map(run => [run.id, run.open]));
  assert.equal(byId.get('east-main'), true, 'the main line stays permitted');
  assert.equal(byId.get('east-branch'), false, 'the branch closes');
});

test('the mounted batch, gates and stats agree with the plan', () => {
  const asset = mountC2EastSledNetwork((e, n) => ground.heightAt(e, n));
  try {
    assert.equal(asset.mesh.count, asset.plan.pieces.length);
    const stats = asset.stats();
    assert.equal(stats.batches, 1);
    assert.equal(stats.lights, 0);
    assert.equal(stats.merges, 1);
    assert.ok(stats.gates > 8, `gates ${stats.gates}`);
    assert.ok(asset.colliders.length > 0, 'gate posts are solid');
    const gate = asset.plan.pieces.find(piece => piece.family === 'gate')!;
    assert.equal(asset.blocked(gate.east, gate.north, gate.y + .5), true);
    assert.equal(asset.blocked(0, 0, 0), false);
    assert.equal(asset.openRuns(true).find(run => run.id === 'east-branch')!.open, false);
  } finally {
    asset.dispose();
    ground.dispose();
  }
});
