import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { Group, Mesh } from 'three';
import { createTownD2R30SledGateSupport } from '../tools/voxel-tavern/town-blockout/town-d2-r30-sled-gate-support';
import {
  summitSledGateCount, summitSledLineLengthM,
} from '../tools/voxel-tavern/town-blockout/town-summit-sled-line';

type Support = ReturnType<typeof createTownD2R30SledGateSupport>;

function cleanup(context: TestContext, support: Support) {
  context.after(() => support.dispose());
  return support;
}

test('D2-R03 sled gates keep the canonical 12-gate 6037.881 m course', context => {
  const support = cleanup(context, createTownD2R30SledGateSupport());
  assert.equal(support.group.userData.owner, 'D2-R03');
  assert.equal(support.group.userData.modifiesSledRules, false);
  assert.equal(support.group.userData.modifiesHeightAt, false);
  const reports = support.reports();
  assert.equal(reports.length, summitSledGateCount);
  assert.deepEqual(reports.map(report => report.gate), Array.from({ length: 12 }, (_, i) => i + 1));
  const stats = support.stats();
  assert.equal(stats.gates, summitSledGateCount);
  assert.equal(stats.courseMetres, summitSledLineLengthM);
  assert.equal(stats.grounded + stats.stands, 12);
  assert.ok(stats.stands >= 1, JSON.stringify(stats));
  assert.ok(stats.maxGap > 10, JSON.stringify(stats));
  assert.equal(reports.at(-1)!.height, 347);
  assert.ok(reports.at(0)!.height > 700);
  assert.ok(reports.every(report => report.status === 'grounded' || report.status === 'stand'));
});

test('D2-R03 floating sled gates receive solid stands down to R30 ground', context => {
  const support = cleanup(context, createTownD2R30SledGateSupport());
  for (const report of support.reports().filter(report => report.status === 'stand')) {
    const stand = support.group.children.find(child => child.name === `town-d2-r30-sled-stand-${report.gate}`) as Group | undefined;
    assert.ok(stand, `gate ${report.gate} must have a stand`);
    const pillar = stand!.children[0] as Mesh;
    pillar.geometry.computeBoundingBox();
    assert.ok(Math.abs(pillar.geometry.boundingBox!.min.y - report.ground) < 1e-4,
      `gate ${report.gate} stand base misses R30 ground`);
    assert.ok(Math.abs(pillar.geometry.boundingBox!.max.y - report.height) < 1e-4,
      `gate ${report.gate} stand top misses surveyed gate foot`);
  }
});

test('D2-R03 sled support honors custom terrain and disposes exactly once', context => {
  const parent = new Group();
  const support = createTownD2R30SledGateSupport({
    groundedBand: 500,
    heightAt: (east, north) => 400,
  });
  parent.add(support.group);
  assert.ok(support.reports().every(report => report.status === 'grounded'));
  assert.equal(support.stats().stands, 0);
  const resources = new Set<unknown>();
  support.group.traverse(object => {
    if (!(object instanceof Mesh)) return;
    resources.add(object.geometry);
    resources.add(object.material);
  });
  let disposals = 0;
  for (const resource of resources) {
    (resource as { addEventListener(type: 'dispose', cb: () => void): void })
      .addEventListener('dispose', () => { disposals++; });
  }
  support.dispose();
  support.dispose();
  assert.equal(parent.children.length, 0);
  assert.equal(disposals, resources.size);
  assert.equal(support.group.userData.disposed, true);
  assert.throws(() => createTownD2R30SledGateSupport({ groundedBand: -1 }), /Invalid/);
  context.after(() => {});
});
