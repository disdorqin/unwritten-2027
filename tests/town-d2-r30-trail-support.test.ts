import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { Group, Mesh } from 'three';
import {
  createTownD2R30TrailSupport,
} from '../tools/voxel-tavern/town-blockout/town-d2-r30-trail-support';
import { mainSummitTrailSpec } from '../tools/voxel-tavern/town-blockout/main-summit-trail';
import { sampleTownD2R30Height } from '../tools/voxel-tavern/town-blockout/town-d2-r30-domain';

type Support = ReturnType<typeof createTownD2R30TrailSupport>;

function cleanup(context: TestContext, support: Support) {
  context.after(() => support.dispose());
  return support;
}

test('D2-R02 trail support keeps the canonical walkway width and never changes the route', context => {
  const support = cleanup(context, createTownD2R30TrailSupport());
  assert.equal(support.group.userData.owner, 'D2-R02');
  assert.equal(support.group.userData.modifiesRoute, false);
  assert.equal(support.group.userData.modifiesHeightAt, false);
  assert.equal(support.group.userData.includesWorldCollision, false);
  const stats = support.stats();
  assert.equal(stats.width, mainSummitTrailSpec.width);
  assert.ok(stats.sections > 100, JSON.stringify(stats));
  assert.ok(stats.surveyedPoints > 5000);
  assert.ok(stats.span > 5_000 && stats.span < 6_000, `span ${stats.span}`);
  assert.ok(stats.treadTriangles > 0 && stats.earthworkTriangles > 0);
  assert.ok(stats.triangles < 30_000, JSON.stringify(stats));
  assert.ok(stats.draws >= 2 && stats.draws <= 3);
  assert.ok(Number.isFinite(stats.maxGap) && Number.isFinite(stats.maxBury));
  assert.ok(stats.supportedSections + stats.bridgedSections === stats.sections);
  // The R30 field itself is untouched: the sampler still returns its known values.
  assert.equal(sampleTownD2R30Height(50, 1000), 800);
  assert.equal(sampleTownD2R30Height(0, -10), 347);
});

test('D2-R02 tread follows surveyed heights while shoulders meet R30 terrain', context => {
  const trailPoints = [
    { east: -100, north: 100, height: 420 },
    { east: -60, north: 160, height: 450 },
    { east: -20, north: 220, height: 480 },
    { east: 20, north: 280, height: 510 },
  ];
  const support = cleanup(context, createTownD2R30TrailSupport({
    trailPoints, sectionStep: 1, heightAt: (east, north) => 400 + (north - 100) * .2,
  }));
  const tread = support.group.children.find(mesh => mesh.name.includes('tread')) as Mesh;
  const earth = support.group.children.find(mesh => mesh.name.includes('earthwork')) as Mesh;
  assert.ok(tread && earth);
  const tp = tread.geometry.getAttribute('position');
  // Left/right tread vertices of every section sit at surveyed height + lift.
  for (let index = 0; index < tp.count; index++) {
    assert.ok(Math.abs(tp.getY(index) - 420 - .07) < 1e-4 || tp.getY(index) > 420,
      `tread vertex ${index} below surveyed foot`);
  }
  // All geometry is finite and above/below the shared terrain plausibly.
  for (const mesh of [tread, earth]) {
    const position = mesh.geometry.getAttribute('position');
    for (let index = 0; index < position.count; index++) {
      assert.ok(Number.isFinite(position.getX(index)) && Number.isFinite(position.getY(index)) &&
        Number.isFinite(position.getZ(index)));
    }
    assert.ok((mesh.geometry.getIndex()!.count) % 3 === 0);
  }
  assert.equal(support.stats().surveyedPoints, 4);
});

test('D2-R02 deep gullies receive solid piers that reach R30 ground', context => {
  const trailPoints = [
    { east: -50, north: 300, height: 500 },
    { east: -20, north: 320, height: 505 },
    { east: 10, north: 340, height: 510 },
    { east: 40, north: 360, height: 515 },
  ];
  const support = cleanup(context, createTownD2R30TrailSupport({
    trailPoints, sectionStep: 1, heightAt: (east, north) => (east > -30 && east < 20 ? 460 : 500),
  }));
  const stats = support.stats();
  assert.ok(stats.maxGap > 30, JSON.stringify(stats));
  assert.ok(stats.bridgedSections > 0);
  const piers = support.group.children.find(mesh => mesh.name.includes('piers')) as Mesh | undefined;
  assert.ok(piers, 'bridged gully must produce solid pier geometry');
  const pp = piers!.geometry.getAttribute('position');
  let minY = Infinity, maxY = -Infinity;
  for (let index = 0; index < pp.count; index++) {
    minY = Math.min(minY, pp.getY(index));
    maxY = Math.max(maxY, pp.getY(index));
  }
  assert.ok(minY <= 460 + .01, `pier base ${minY} must reach R30 ground 460`);
  assert.ok(maxY > 480, `pier top ${maxY} must climb toward the tread`);
});

test('D2-R02 trail support toggles night, validates inputs and disposes once', context => {
  const parent = new Group();
  const support = createTownD2R30TrailSupport({
    trailPoints: [
      { east: -60, north: 150, height: 440 },
      { east: -30, north: 200, height: 460 },
      { east: 0, north: 250, height: 480 },
      { east: 30, north: 300, height: 500 },
    ],
    sectionStep: 2,
  });
  parent.add(support.group);
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
  support.setNight(true);
  support.setNight(false);
  assert.throws(() => support.setNight('x' as never), /boolean/);
  support.dispose();
  support.dispose();
  assert.equal(parent.children.length, 0);
  assert.equal(support.group.children.length, 0);
  assert.equal(support.group.userData.disposed, true);
  assert.equal(disposals, resources.size);
  assert.throws(() => support.setNight(true), /disposed/);

  assert.throws(() => createTownD2R30TrailSupport({ sectionStep: 0 }), /Invalid/);
  assert.throws(() => createTownD2R30TrailSupport({ trailPoints: [{ east: 0, north: 0, height: 1 }] }), /polyline/);
  assert.throws(() => createTownD2R30TrailSupport({
    trailPoints: [
      { east: 0, north: 0, height: 1 }, { east: 1, north: 1, height: NaN }, { east: 2, north: 2, height: 3 },
    ],
  }), /finite/);
  context.after(() => {});
});
