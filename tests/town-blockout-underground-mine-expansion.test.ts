import assert from 'node:assert/strict';
import test from 'node:test';
import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { createUndergroundCampRemains } from '../tools/voxel-tavern/town-blockout/underground-camp-remains.ts';
import { createUndergroundMineLayout } from '../tools/voxel-tavern/town-blockout/underground-mine-layout.ts';

const walker = { radius: .27, standingHeight: 1.8, crouchingHeight: 1.1, maxGrade: .2 };
const camp = { length: 10, side: 'right' as const, extension: 5 };
const spec = {
  pool: { length: 4, width: 6, depth: 1.2, shaftAperture: { width: 2, length: 2 } },
  shoreLength: 8,
  gallery: { length: 20, drop: 1, railGauge: 1, railWidth: .08 },
  collapse: { length: 3, width: 1.2, height: 1.3 },
  camp,
  walker,
};
const query = (mine: ReturnType<typeof createUndergroundMineLayout>, x: number, z: number) =>
  mine.queryPassage(x, z, walker.radius, walker.standingHeight);

test('U-15 connects the furnished camp to the expansion without altering original anchors and lessons', () => {
  const original = createUndergroundMineLayout(spec);
  const mine = createUndergroundMineLayout({ ...spec, camp: { ...camp, openBackForExpansion: true } });
  assert.equal(original.expansion, undefined);
  assert.deepEqual(mine.anchors.poolLanding, original.anchors.poolLanding);
  assert.deepEqual(mine.anchors.poolShaftOpening, original.anchors.poolShaftOpening);
  assert.deepEqual(mine.anchors.campRecovery, original.anchors.campRecovery);
  assert.deepEqual(mine.route, original.route);
  assert.deepEqual(mine.crouchInterval, original.crouchInterval);
  assert.deepEqual(mine.anchors.campBackOpening, { seam: [0, -91, 45], openingWidth: 4, openingHeight: 3.5 });
  assert.equal(query(original, 0, 45), undefined);
  assert.equal(query(mine, 2, 45), undefined);
  assert.equal(mine.queryPassage(0, 45, walker.radius, 3.6), undefined);
  const furnished = createUndergroundCampRemains({ mine, camp, walker });
  try {
    for (let step = -12; step <= 12; step++) {
      const z = 45 + step / 10;
      const base = query(mine, 0, z);
      const passage = base?.zone === 'camp' ? furnished.queryPassage(0, z, walker.radius, walker.standingHeight) : base;
      assert.equal(passage?.floor, -91, `blocked or stepped at z=${z}`);
      assert.ok(passage.clearance >= walker.standingHeight);
    }
  } finally {
    furnished.dispose();
  }
});

test('U-15 opens the central rock cap and keeps its shoulder physically closed', () => {
  const closed = createUndergroundMineLayout(spec);
  const opened = createUndergroundMineLayout({ ...spec, camp: { ...camp, openBackForExpansion: true } });
  function hitsRockAtCampCap(mine: ReturnType<typeof createUndergroundMineLayout>, x: number) {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(mine.mesh.rock, 3));
    const material = new MeshBasicMaterial({ side: DoubleSide });
    try {
      const ray = new Raycaster(new Vector3(x, -89.4, 44.6), new Vector3(0, 0, 1), 0, .8);
      return ray.intersectObject(new Mesh(geometry, material)).some(hit => Math.abs(hit.point.z - 45) < 1e-6);
    } finally {
      geometry.dispose();
      material.dispose();
    }
  }
  assert.equal(hitsRockAtCampCap(closed, 0), true);
  assert.equal(hitsRockAtCampCap(opened, 0), false);
  assert.equal(hitsRockAtCampCap(opened, 3), true);
});
