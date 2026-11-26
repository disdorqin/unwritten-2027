import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { Group, Mesh } from 'three';
import {
  createTownD2R30FacilityFoundations, townD2R30FacilityAnchors,
} from '../tools/voxel-tavern/town-blockout/town-d2-r30-facility-foundations';
import { sampleTownD2R30Height } from '../tools/voxel-tavern/town-blockout/town-d2-r30-domain';

type Foundations = ReturnType<typeof createTownD2R30FacilityFoundations>;

function cleanup(context: TestContext, f: Foundations) {
  context.after(() => f.dispose());
  return f;
}

test('D2-R03 summit facilities report grounded and pedestal cases on R30', context => {
  const foundations = cleanup(context, createTownD2R30FacilityFoundations());
  assert.equal(foundations.group.userData.owner, 'D2-R03');
  assert.equal(foundations.group.userData.modifiesFacilityHeight, false);
  assert.equal(foundations.group.userData.modifiesHeightAt, false);
  const reports = foundations.reports();
  assert.equal(reports.length, townD2R30FacilityAnchors.length);
  const byId = new Map(reports.map(report => [report.id, report]));

  // Anchors that share the R30 summit plateau stay exactly grounded.
  for (const id of ['summit-hut', 'm7-stone-circle', 'glide-launch']) {
    const report = byId.get(id)!;
    assert.equal(report.status, 'grounded', `${id} ${JSON.stringify(report)}`);
    assert.ok(Math.abs(report.delta) < 1e-6);
    assert.equal(report.height, 800);
  }
  // The upper cloud pavilion's P-1 surveyed floor floats ~47 m above R30;
  // it must be flagged and receive a real pedestal, never a floating deck.
  const upper = byId.get('pavilion-upper-cloud')!;
  assert.equal(upper.status, 'pedestal');
  assert.ok(upper.delta > 40, JSON.stringify(upper));
  const lower = byId.get('pavilion-lower-cloud')!;
  assert.equal(lower.status, 'grounded');

  const stats = foundations.stats();
  assert.ok(stats.pedestals >= 1, JSON.stringify(stats));
  assert.ok(stats.grounded >= 4);
  assert.ok(stats.maxDelta > 40);
  assert.ok(stats.draws > 0 && stats.triangles > 0);
  assert.ok(Math.abs(sampleTownD2R30Height(62.5, 1011)! - 800) < 1e-6);
});

test('D2-R03 pedestal geometry reaches R30 ground and tops at the surveyed floor', context => {
  const foundations = cleanup(context, createTownD2R30FacilityFoundations());
  const tower = foundations.group.children.find(child => child.name.includes('upper-cloud')) as Group | undefined;
  assert.ok(tower, 'floating upper pavilion must have a foundation group');
  const pillar = tower!.children[0] as Mesh;
  pillar.geometry.computeBoundingBox();
  const report = foundations.reports().find(report => report.id === 'pavilion-upper-cloud')!;
  assert.ok(Math.abs(pillar.geometry.boundingBox!.min.y - report.ground) < 1e-4,
    `pillar base ${pillar.geometry.boundingBox!.min.y} != R30 ground ${report.ground}`);
  assert.ok(Math.abs(pillar.geometry.boundingBox!.max.y - report.height) < 1e-4,
    `pillar top ${pillar.geometry.boundingBox!.max.y} != surveyed floor ${report.height}`);
});

test('D2-R03 custom anchors, cut cases, validation and idempotent disposal', context => {
  const parent = new Group();
  const foundations = createTownD2R30FacilityFoundations({
    heightAt: (east, north) => (east > 0 ? 500 : 400),
    anchors: [
      { id: 'on-ground', east: -10, north: 0, height: 400, radius: 2 },
      { id: 'above', east: 10, north: 0, height: 560, radius: 2 },
      { id: 'below', east: 20, north: 0, height: 470, radius: 2 },
    ],
  });
  parent.add(foundations.group);
  const reports = foundations.reports();
  assert.deepEqual(reports.map(report => report.status), ['grounded', 'pedestal', 'cut']);
  const resources = new Set<unknown>();
  foundations.group.traverse(object => {
    if (!(object instanceof Mesh)) return;
    resources.add(object.geometry);
    resources.add(object.material);
  });
  let disposals = 0;
  for (const resource of resources) {
    (resource as { addEventListener(type: 'dispose', cb: () => void): void })
      .addEventListener('dispose', () => { disposals++; });
  }
  foundations.dispose();
  foundations.dispose();
  assert.equal(parent.children.length, 0);
  assert.equal(disposals, resources.size);
  assert.equal(foundations.group.userData.disposed, true);

  assert.throws(() => createTownD2R30FacilityFoundations({ arrivalHeight: NaN }), /Invalid/);
  assert.throws(() => createTownD2R30FacilityFoundations({
    anchors: [{ id: 'bad', east: 0, north: 0, height: 400, radius: 0 }],
  }), /finite/);
  assert.throws(() => createTownD2R30FacilityFoundations({
    anchors: [{ id: 'no-ground', east: 0, north: 0, height: 400, radius: 2 }],
    heightAt: () => undefined,
  }), /no R30 ground/);
  context.after(() => {});
});
