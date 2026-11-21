import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createUndergroundMineLayout, undergroundMineDepth, undergroundMineGalleryHeight, undergroundMineGalleryWidth,
  type UndergroundMineSpec,
} from '../tools/voxel-tavern/town-blockout/underground-mine-layout.ts';

// Synthetic dimensions for exercising the geometry and collision API.
const fixture = (): UndergroundMineSpec => ({
  pool: { length: 4, width: 6, depth: 1.2 },
  shoreLength: 8,
  gallery: { length: 20, drop: 1, railGauge: 1, railWidth: .08 },
  collapse: { length: 3, width: 1.2, height: 1.3 },
  camp: { length: 10, side: 'right', extension: 5 },
  walker: { radius: .27, standingHeight: 1.8, crouchingHeight: 1.1, maxGrade: .2 },
});

test('the optional crystal gate sweeps the player footprint and keeps the local terminal wall', () => {
  const spec = fixture();
  const expanded = { ...spec.camp, openBackForExpansion: true };
  const standard = createUndergroundMineLayout({ ...spec, camp: expanded });
  const layout = createUndergroundMineLayout({ ...spec, camp: { ...expanded, crystalGate: true } });
  const gate = layout.expansion?.gate;
  assert.ok(gate);
  assert.equal(standard.expansion?.gate, undefined);
  assert.deepEqual(standard.anchors, layout.anchors);
  const [x, floor, z] = gate.position;
  assert.equal(floor, -91);
  assert.equal(gate.gapFor('closed'), 0);
  assert.equal(gate.gapFor('ajar'), .1);
  assert.equal(gate.gapFor('open'), gate.height);
  const { radius, standingHeight, crouchingHeight } = spec.walker;
  assert.ok(layout.queryPassage(x, z - .5, radius, standingHeight));
  assert.equal(layout.queryPassage(x, z - .2, radius, standingHeight), undefined);
  assert.equal(layout.queryPassage(x, z + .2, radius, crouchingHeight, 'ajar'), undefined);
  for (const offset of [-.5, -.2, 0, .2, .5]) {
    const foot = layout.queryPassage(x, z + offset, radius, standingHeight, 'open');
    assert.equal(foot?.floor, floor);
  }
  assert.equal(layout.queryPassage(x + gate.width / 2, z, radius, standingHeight, 'open'), undefined);
  assert.equal(layout.queryPassage(x, z, radius, gate.height + .01, 'open'), undefined);
  assert.equal(layout.queryPassage(x, layout.expansion!.bounds.maxZ, radius, standingHeight, 'open'), undefined);
});

test('mine meshes expose the locked level and dimensions, flush double rail and a separate water surface', () => {
  const layout = createUndergroundMineLayout(fixture());
  assert.equal(undergroundMineDepth, -90);
  assert.equal(undergroundMineGalleryWidth, 4);
  assert.equal(undergroundMineGalleryHeight, 3.5);
  assert.equal(layout.anchors.poolLanding[1], -90);
  assert.equal(layout.anchors.shoreExit[1], -90);
  for (const positions of Object.values(layout.mesh)) {
    assert.ok(positions instanceof Float32Array && positions.length > 0 && positions.length % 9 === 0);
    assert.ok(positions.every(Number.isFinite));
  }
  assert.equal(layout.mesh.water.length, 36);
  assert.ok(layout.mesh.water.filter((_, i) => i % 3 === 1).every(y => y === -90));
  assert.equal(layout.mesh.rail.length, 36);
  for (let i = 0; i < layout.mesh.rail.length; i += 3) {
    const [x, y, z] = layout.mesh.rail.slice(i, i + 3);
    const support = layout.queryPassage(x, z, 0, 1.1);
    assert.ok(support);
    assert.ok(Math.abs(y - support.floor) < 1e-5);
    assert.ok(Math.abs(Math.abs(x) - .5) <= .041);
  }
  assert.equal(layout.queryPassage(0, 18, 0, 1.8)?.clearance, 3.5);
  assert.ok(layout.queryPassage(2, 18, 0, 1.8));
  assert.equal(layout.queryPassage(2.001, 18, 0, 1.8), undefined);
});

test('the shaft envelope opens the pool roof above the first-fall anchor', () => {
  const spec = fixture();
  const width = 2, length = 2;
  const dry = createUndergroundMineLayout({ ...spec, pool: { ...spec.pool, shaftAperture: { width, length } } });
  const opening = dry.anchors.poolShaftOpening;
  assert.deepEqual(opening, { roofY: -86.5, minX: -1, maxX: 1, minZ: 1, maxZ: 3 });
  assert.ok(opening);
  assert.equal(dry.anchors.poolLanding[0], (opening.minX + opening.maxX) / 2);
  assert.equal(dry.anchors.poolLanding[2], (opening.minZ + opening.maxZ) / 2);

  let roofArea = 0;
  for (let offset = 0; offset < dry.mesh.rock.length; offset += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = dry.mesh.rock.subarray(offset, offset + 9);
    if (ay !== opening.roofY || by !== opening.roofY || cy !== opening.roofY ||
        Math.max(az, bz, cz) > spec.pool.length) continue;
    assert.ok(Math.max(ax, bx, cx) <= opening.minX || Math.min(ax, bx, cx) >= opening.maxX ||
      Math.max(az, bz, cz) <= opening.minZ || Math.min(az, bz, cz) >= opening.maxZ);
    roofArea += Math.abs((bx - ax) * (cz - az) - (bz - az) * (cx - ax)) / 2;
  }
  assert.equal(roofArea, spec.pool.width * spec.pool.length - width * length);
  assert.deepEqual(dry.mesh.water, createUndergroundMineLayout(spec).mesh.water);
});

test('an invalid shaft envelope is rejected before geometry is generated', () => {
  const spec = fixture();
  for (const shaftAperture of [{ width: .5, length: 2 }, { width: 2, length: spec.pool.length },
    { width: NaN, length: 2 }]) {
    assert.throws(() => createUndergroundMineLayout({ ...spec, pool: { ...spec.pool, shaftAperture } }),
      /shaft aperture/);
  }
  assert.equal(createUndergroundMineLayout(spec).anchors.poolShaftOpening, undefined);
});

test('a continuous solo route leads through the stone shore and crouch slot to the safe campfire', () => {
  const spec = fixture();
  const { pool, gallery, walker, shoreLength } = spec;
  const layout = createUndergroundMineLayout(spec);
  const { queryPassage } = layout;
  const galleryEnd = pool.length + shoreLength + gallery.length;
  assert.deepEqual(layout.crouchInterval,
    [galleryEnd - walker.radius, galleryEnd + spec.collapse.length + walker.radius]);
  assert.equal(queryPassage(0, galleryEnd - walker.radius / 2, walker.radius, walker.standingHeight), undefined);
  assert.equal(queryPassage(0, galleryEnd + 1, walker.radius, walker.standingHeight), undefined);
  assert.equal(queryPassage(0, galleryEnd + 1, walker.radius, walker.crouchingHeight)?.requiresCrouch, true);
  assert.equal(queryPassage(.4, galleryEnd + 1, walker.radius, walker.crouchingHeight), undefined);
  assert.equal(queryPassage(0, 0, walker.radius, walker.crouchingHeight), undefined);
  assert.ok(queryPassage(0, 2, walker.radius, walker.standingHeight)!.waterDepth > 0);
  assert.equal(queryPassage(0, 12, walker.radius, walker.standingHeight)?.waterDepth, 0);
  const recovery = layout.anchors.campRecovery;
  assert.equal(recovery.kind, 'campfire');
  assert.equal(recovery.scope, 'underground-mine-first-layer');
  assert.deepEqual(layout.route.at(-1)?.to, recovery.position);
  const safe = queryPassage(recovery.position[0], recovery.position[2], walker.radius, walker.standingHeight);
  assert.equal(safe?.zone, 'camp');
  assert.equal(safe?.floor, recovery.position[1]);
  for (const part of layout.route) {
    assert.equal(part.requiresJump, false);
    assert.equal(part.encounter, false);
    for (let step = 0; step <= 32; step++) {
      const t = step / 32;
      const x = part.from[0] + t * (part.to[0] - part.from[0]);
      const z = part.from[2] + t * (part.to[2] - part.from[2]);
      const y = part.from[1] + t * (part.to[1] - part.from[1]);
      const sample = queryPassage(x, z, walker.radius, walker.crouchingHeight);
      assert.ok(sample, `${part.zone} has a clear continuous path at ${x}, ${z}`);
      assert.ok(Math.abs(sample.floor - y) < 1e-8);
      assert.equal(sample.encounter, false);
    }
  }
});

test('the crouching footprint clears the slope and collapse join', () => {
  const spec = fixture();
  const radius = spec.walker.radius;
  const crouch = spec.walker.crouchingHeight;
  const minimumHeight = crouch + 2 * radius * spec.gallery.drop / spec.gallery.length;
  const entry = spec.pool.length + spec.shoreLength + spec.gallery.length - radius;

  for (const length of [.01, spec.collapse.length]) {
    const collapse = { ...spec.collapse, length };
    assert.throws(() => createUndergroundMineLayout({
      ...spec, collapse: { ...collapse, height: 1.12 },
    }), /cannot fit/);
    const layout = createUndergroundMineLayout({
      ...spec, collapse: { ...collapse, height: minimumHeight },
    });
    for (const z of [entry, entry + length / 2, entry + length]) {
      assert.equal(layout.queryPassage(0, z, radius, crouch)?.requiresCrouch, true);
      assert.equal(layout.queryPassage(0, z, radius, spec.walker.standingHeight), undefined);
    }
  }

  const gallery = { ...spec.gallery, length: .2, drop: .03 };
  const layout = createUndergroundMineLayout({
    ...spec, gallery, collapse: { ...spec.collapse, length: .01, height: 1.14 },
  });
  const shortGalleryEntry = spec.pool.length + spec.shoreLength + gallery.length - radius;
  assert.ok(layout.queryPassage(0, shortGalleryEntry, radius, crouch));
});

test('unwalkable dimensions and an unassigned camp side are rejected instead of filled with defaults', () => {
  const valid = fixture();
  assert.throws(() => createUndergroundMineLayout({ ...valid, shoreLength: 1 }), RangeError);
  assert.throws(() => createUndergroundMineLayout({ ...valid, collapse: { ...valid.collapse, width: .4 } }), RangeError);
  assert.throws(() => createUndergroundMineLayout({ ...valid, collapse: { ...valid.collapse, height: 2 } }), RangeError);
  assert.throws(() => createUndergroundMineLayout({ ...valid, pool: { ...valid.pool, depth: NaN } }), RangeError);
  assert.throws(() => createUndergroundMineLayout({
    ...valid, camp: { ...valid.camp, side: 'front' as unknown as UndergroundMineSpec['camp']['side'] },
  }), RangeError);
  const left = createUndergroundMineLayout({ ...valid, camp: { ...valid.camp, side: 'left' } });
  const right = createUndergroundMineLayout(valid);
  assert.equal(left.anchors.campRecovery.position[0], -right.anchors.campRecovery.position[0]);
});
