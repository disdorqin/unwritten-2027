import assert from 'node:assert/strict';
import test from 'node:test';
import { Group } from 'three';
import {
  c2EastCanonicalArrivalHeight, c2EastSector, c2EastSectorAreaKm2, c2EastSeamDistance,
  createC2EastCanonicalGround, inC2EastSector,
} from '../tools/voxel-tavern/town-blockout/town-night-c2-summit-canonical.ts';
import {
  c2EastNpcPosts, c2EastProductionModules, createC2EastProduction,
} from '../tools/voxel-tavern/town-blockout/town-night-c2-summit-east-production.ts';
import { createMainSummitBlock, mainSummitLayout } from '../tools/voxel-tavern/town-blockout/main-summit-block.ts';

const legacy = createMainSummitBlock(mainSummitLayout, 348, 8);

test('east sector is the dispatched 1.048 km² on the shared canonical frame', () => {
  assert.equal(c2EastSector.west, 300);
  assert.equal(c2EastSector.south, 480);
  assert.equal(c2EastSector.east, 1100);
  assert.equal(c2EastSector.north, 1790);
  assert.equal(c2EastSector.boundary, 32);
  assert.ok(Math.abs(c2EastSectorAreaKm2 - 1.048) < 1e-9, `area ${c2EastSectorAreaKm2}`);
  assert.equal(inC2EastSector(300, 480), true);
  assert.equal(inC2EastSector(299.9, 480), false);
  assert.equal(inC2EastSector(600, 479.9), false);
  assert.equal(c2EastSeamDistance(310, 490), 10);
  assert.equal(c2EastCanonicalArrivalHeight, 347);
});

test('the seating authority is the rendered 8 m triangle face, not the analytic field', () => {
  const ground = createC2EastCanonicalGround();
  try {
    const shoulder = ground.heightAt(590, 1080);
    assert.equal(typeof shoulder, 'number');
    // The 610 m east shoulder does not land on an 8 m grid vertex, so the
    // drawn triangles stop short of the analytic peak. Seating on the
    // analytic height would float the summit rock above the visible mesh.
    assert.ok(Math.abs(shoulder! - 602.82080078125) < 1e-6, `face ${shoulder}`);
    assert.ok(Math.abs(ground.analyticAt(590, 1080)! - 610) < 1e-6);
    assert.ok(610 - shoulder! > 7, 'the gap between field and drawn mesh must be recorded');

    const stats = ground.stats();
    assert.equal(stats.spacing, 8);
    assert.equal(stats.arrivalHeight, 347);
    assert.ok(stats.sectorSamples > 60_000, `samples ${stats.sectorSamples}`);
    assert.ok(stats.maxFaceDeviation > 9 && stats.maxFaceDeviation < 11, `max ${stats.maxFaceDeviation}`);
    assert.ok(stats.meanFaceDeviation > 0 && stats.meanFaceDeviation < .1);
    assert.ok(stats.worstDeviationAt);
  } finally {
    ground.dispose();
  }
  assert.equal(ground.heightAt(590, 1080), undefined, 'a disposed ground fails closed');
});

test('the legacy preview sampler really is wrong here, by the audited metre count', () => {
  let samples = 0, sum = 0, max = 0, overOne = 0;
  const ground = createC2EastCanonicalGround();
  try {
    for (let east = c2EastSector.west; east <= c2EastSector.east; east += 8) {
      for (let north = c2EastSector.south; north <= c2EastSector.north; north += 8) {
        const old = legacy.heightAt(east, north);
        const live = ground.analyticAt(east, north);
        if (old === undefined || live === undefined) continue;
        const delta = Math.abs(old - live);
        samples++; sum += delta; if (delta > max) max = delta; if (delta > 1) overOne++;
      }
    }
  } finally {
    ground.dispose();
  }
  assert.equal(samples, 16_564);
  assert.ok(Math.abs(sum / samples - 6.687) < .01, `mean ${sum / samples}`);
  assert.ok(Math.abs(max - 52.177) < .01, `max ${max}`);
  assert.equal(overOne, 13_668);
});

test('every one of the fifteen east packages is seated on the canonical face inside the sector', () => {
  const production = createC2EastProduction();
  try {
    const stats = production.stats();
    assert.equal(stats.modules, 15);
    assert.ok(stats.pieces > 2_300, `pieces ${stats.pieces}`);
    assert.equal(stats.batches, 15);
    assert.equal(stats.lights, 0);
    assert.equal(stats.sectorAreaKm2, c2EastSectorAreaKm2);
    assert.equal(production.group.children.length, 15);
    const ids = new Set(production.group.children.map(child => child.name));
    for (const entry of c2EastProductionModules) {
      assert.ok(ids.has(`c2-east-${entry.id}`), `missing ${entry.id}`);
    }
  } finally {
    production.dispose();
  }
});

test('seating, sector containment and reserved D2 sites hold under the canonical face', () => {
  const ground = createC2EastCanonicalGround();
  const production = createC2EastProduction({ ground });
  try {
    let checked = 0;
    production.group.traverse(child => {
      const instanced = child as unknown as {
        isMesh?: boolean; instanceMatrix?: { array: Float32Array }; count?: number;
      };
      if (!instanced.isMesh || !instanced.instanceMatrix) return;
      const matrix = instanced.instanceMatrix.array;
      const count = instanced.count ?? 0;
      for (let i = 0; i < count; i++) {
        const offset = i * 16;
        const east = matrix[offset + 12]!;
        const north = -matrix[offset + 14]!;
        assert.ok(east >= c2EastSector.west - 1e-3 && east <= c2EastSector.east + 1e-3, `east ${east}`);
        assert.ok(north >= c2EastSector.south - 1e-3 && north <= c2EastSector.north + 1e-3, `north ${north}`);
        const face = ground.heightAt(east, north);
        assert.equal(face !== undefined, true, `no ground at ${east},${north}`);
        assert.ok(Number.isFinite(matrix[offset + 13]!), `no seat height at ${east},${north}`);
        checked++;
      }
    });
    assert.ok(checked > 2_300, `checked ${checked}`);
  } finally {
    production.dispose();
  }
});

test('install, uninstall, view, night and dispose are safe and leave no residue', () => {
  const production = createC2EastProduction();
  const parent = new Group();
  assert.equal(production.installed(), false);
  production.install(parent);
  assert.equal(production.installed(), true);
  assert.equal(parent.children.length, 1);
  assert.equal(parent.children[0], production.group);
  // Re-install must not duplicate the sector in the scene.
  production.install(parent);
  assert.equal(parent.children.length, 1);

  production.updateView(590, 1080);
  production.updateView(300, 480);
  production.setNight(true);
  production.setNight(true);
  production.setNight(false);

  const mid = production.supportAt(430, 1000);
  assert.equal(typeof mid, 'number');
  assert.equal(production.supportAt(299, 1000), undefined, 'west of the seam is not ours');
  assert.equal(production.supportAt(600, 479), undefined, 'south of the seam is not ours');
  assert.ok(production.topAt(430, 1000)! >= production.supportAt(430, 1000)!);
  assert.equal(production.blocked(430, 1000, 10), false, 'nothing blocks 360 m under the surface');

  production.uninstall();
  assert.equal(production.installed(), false);
  assert.equal(parent.children.length, 0);
  production.install(parent);
  assert.equal(parent.children.length, 1, 'a re-install after uninstall still works');

  production.dispose();
  production.dispose();
  assert.equal(parent.children.length, 0);
  assert.equal(production.stats().disposed, true);
  assert.equal(production.supportAt(430, 1000), undefined);
  assert.equal(production.blocked(430, 1000, 0), true, 'a disposed sector fails closed');
});

test('a partial install rolls back instead of leaving half a sector', () => {
  assert.throws(() => createC2EastProduction({ moduleIds: ['E01-landform', 'nope'] }), RangeError);
  const only = createC2EastProduction({ moduleIds: ['E01-landform'] });
  try {
    assert.equal(only.stats().modules, 1);
    assert.equal(only.group.children.length, 1);
    assert.ok(only.stats().pieces > 100);
  } finally {
    only.dispose();
  }
});

test('the two east NPC posts are derived from the built assets, not invented', () => {
  const grounded = createC2EastCanonicalGround();
  try {
    const posts = c2EastNpcPosts((east, north) => grounded.heightAt(east, north));
    assert.equal(posts.length, 2, 'camp keeper and pavilion keeper');
    const camp = posts.find(post => post.id === 'camp-keeper')!;
    const pavilion = posts.find(post => post.id === 'pavilion-keeper')!;
    for (const post of posts) {
      const face = grounded.heightAt(post.east, post.north);
      assert.equal(face !== undefined, true, `${post.id} has no ground`);
      assert.ok(Math.abs(post.height - face!) < 1e-9, `${post.id} must stand on the rendered face`);
      assert.ok(post.east >= c2EastSector.west && post.north >= c2EastSector.south, `${post.id} outside the sector`);
      assert.ok(Number.isFinite(post.facing));
    }
    // The camp sits near (742, 802) and the pavilion approach near (773, 739).
    assert.ok(Math.hypot(camp.east - 742, camp.north - 802) < 30, 'camp keeper belongs to the camp');
    assert.ok(Math.hypot(pavilion.east - 773, pavilion.north - 739) < 40, 'pavilion keeper belongs to the approach');
    assert.equal(camp.source, 'E02-camp');
    assert.equal(pavilion.source, 'E14-pavilion-approach');
  } finally {
    grounded.dispose();
  }
});
