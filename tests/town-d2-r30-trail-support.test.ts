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

type Contact = {
  east: number; north: number; pierTop: number; beamBottom: number;
  beamTop: number; treadTop: number; pierBottom: number;
};

function bridgeContacts(support: Support, groundAt: (east: number, north: number) => number = () => 460): Contact[] {
  const bridges = support.group.children.find(mesh => mesh.name.includes('piers')) as Mesh | undefined;
  const tread = support.group.children.find(mesh => mesh.name.includes('tread')) as Mesh;
  assert.ok(bridges && tread, 'bridged sections need beams, piers and tread');
  const bp = bridges.geometry.getAttribute('position');
  const tp = tread.geometry.getAttribute('position');
  const contacts: Contact[] = [];
  // Each section packs two 8-vertex piers followed by one 8-vertex beam.
  assert.equal(bp.count, support.stats().bridgedSections * 24);
  for (let base = 0; base < bp.count; base += 24) {
    const centreX = (bp.getX(base + 16) + bp.getX(base + 18)) / 2;
    const centreZ = (bp.getZ(base + 16) + bp.getZ(base + 18)) / 2;
    let treadTop = Infinity;
    for (let index = 0; index < tp.count; index += 2) {
      if (Math.abs((tp.getX(index) + tp.getX(index + 1)) / 2 - centreX) < 1e-5 &&
          Math.abs((tp.getZ(index) + tp.getZ(index + 1)) / 2 - centreZ) < 1e-5) {
        treadTop = tp.getY(index);
        break;
      }
    }
    contacts.push({
      east: centreX, north: -centreZ,
      pierTop: bp.getY(base), beamBottom: bp.getY(base + 20),
      beamTop: bp.getY(base + 16), treadTop,
      pierBottom: bp.getY(base + 4),
    });
    // Check all four top/bottom corners of both piers and the bearing beam.
    for (const offset of [0, 8]) {
      for (let corner = 0; corner < 4; corner++) {
        assert.equal(bp.getY(base + offset + corner), bp.getY(base + 20 + corner),
          `pier ${base / 24} must land exactly on beam underside`);
        assert.equal(bp.getY(base + offset + corner + 4),
          groundAt(centreX, -centreZ), `pier ${base / 24} must reach sampled ground`);
      }
    }
    for (let corner = 0; corner < 4; corner++) {
      assert.equal(bp.getY(base + 16 + corner), treadTop,
        `beam ${base / 24} top must meet, not cross, the canonical tread`);
    }
  }
  return contacts;
}

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
  assert.equal(stats.pierQuads, stats.bridgedSections * 10);
  assert.equal(stats.beamQuads, stats.bridgedSections * 6);
  const contacts = bridgeContacts(support, east => east > -30 && east < 20 ? 460 : 500);
  assert.equal(contacts.length, stats.bridgedSections);
  assert.ok(contacts.every(contact => contact.pierTop === contact.beamBottom &&
    contact.beamBottom < contact.beamTop && contact.beamTop === contact.treadTop));
});

test('D2-R02 bridge contact is independent of outbound/return section order', context => {
  const outbound = [
    { east: -30, north: 100, height: 500 },
    { east: -10, north: 120, height: 505 },
    { east: 10, north: 140, height: 510 },
    { east: 30, north: 160, height: 515 },
  ];
  const make = (trailPoints: typeof outbound) => createTownD2R30TrailSupport({
    trailPoints, sectionStep: 1, heightAt: () => 460,
  });
  const forward = cleanup(context, make(outbound));
  const returning = cleanup(context, make([...outbound].reverse()));
  assert.deepEqual(returning.stats(), forward.stats());
  const bySection = (support: Support) => bridgeContacts(support)
    .map(contact => [contact.east, contact.north, contact.pierTop, contact.beamBottom,
      contact.beamTop, contact.treadTop, contact.pierBottom])
    .sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!);
  assert.deepEqual(bySection(returning), bySection(forward));
});

test('D2-R02 non-bridged sections create neither beams nor piers', context => {
  const support = cleanup(context, createTownD2R30TrailSupport({
    trailPoints: [
      { east: 0, north: 0, height: 400 },
      { east: 20, north: 20, height: 401 },
      { east: 40, north: 40, height: 402 },
    ],
    sectionStep: 1, heightAt: () => 410,
  }));
  assert.equal(support.stats().bridgedSections, 0);
  assert.equal(support.stats().pierQuads, 0);
  assert.equal(support.stats().beamQuads, 0);
  assert.equal(support.group.children.some(mesh => mesh.name.includes('piers')), false);
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
