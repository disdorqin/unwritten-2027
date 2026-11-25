import assert from 'node:assert/strict';
import test from 'node:test';
import { mainSummitBounds } from '../tools/voxel-tavern/town-blockout/main-summit-block';
import {
  createTownD2R30Collision,
} from '../tools/voxel-tavern/town-blockout/town-d2-r30-collision';
import {
  sampleTownD2R30Height, townD2R30GridAxis,
} from '../tools/voxel-tavern/town-blockout/town-d2-r30-domain';

const closeTo = (actual: number, expected: number, epsilon = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);

test('D2-R30 collision caches grid axes and returns exact sampled vertices', () => {
  let calls = 0;
  const collision = createTownD2R30Collision({
    spacing: 100,
    heightAt: (east, north) => {
      calls++;
      return 11 + east * .013 - north * .021;
    },
  });
  try {
    const eastAxis = townD2R30GridAxis(mainSummitBounds.west, mainSummitBounds.east, 100);
    const northAxis = townD2R30GridAxis(mainSummitBounds.south, mainSummitBounds.north, 100);
    const expectedCalls = eastAxis.length * northAxis.length;
    assert.equal(calls, expectedCalls);
    for (const east of eastAxis) {
      for (const north of northAxis) {
        assert.equal(collision.surfaceAt(east, north), 11 + east * .013 - north * .021);
      }
    }
    collision.normalAt(17, 23);
    collision.slopeAt(-31, 47);
    collision.supportsFoot(0, 0, .27);
    assert.equal(calls, expectedCalls, 'queries must reuse cached vertex heights');
    assert.equal(collision.stats().heightSamples, expectedCalls);
  } finally {
    collision.dispose();
  }
});

test('D2-R30 collision interpolates the massif triangle orientation inside a cell', () => {
  const collision = createTownD2R30Collision({
    spacing: 100,
    heightAt: (east, north) => 10 + east * 2 + north * 3 + east * north * .01,
  });
  try {
    const west = mainSummitBounds.west, south = mainSummitBounds.south;
    const a = 10 + west * 2 + south * 3 + west * south * .01;
    const b = 10 + (west + 100) * 2 + south * 3 + (west + 100) * south * .01;
    const c = 10 + west * 2 + (south + 100) * 3 + west * (south + 100) * .01;
    const d = 10 + (west + 100) * 2 + (south + 100) * 3 + (west + 100) * (south + 100) * .01;
    closeTo(collision.surfaceAt(west + 50, south + 20)!, a + (b - a) * .5 + (c - a) * .2);
    closeTo(collision.surfaceAt(west + 50, south + 70)!, (1 - .7) * b + (.5 + .7 - 1) * d + (1 - .5) * c);
    closeTo(collision.surfaceAt(west + 50, south + 50)!, (b + c) / 2);
  } finally {
    collision.dispose();
  }
});

test('D2-R30 surface queries reject missing heights and every out-of-bounds side', () => {
  const collision = createTownD2R30Collision({
    spacing: 100,
    heightAt: (east, north) => east === 0 && north === 90 ? undefined : 20,
  });
  try {
    assert.equal(collision.surfaceAt(0, 90), undefined);
    assert.equal(collision.normalAt(0, 90), undefined);
    assert.equal(collision.slopeAt(0, 90), undefined);
    assert.equal(collision.supportsFoot(0, 90), false);
    const outside = [
      [mainSummitBounds.west - .01, 0], [mainSummitBounds.east + .01, 0],
      [0, mainSummitBounds.south - .01], [0, mainSummitBounds.north + .01], [NaN, 0],
    ];
    for (const [east, north] of outside) {
      assert.equal(collision.surfaceAt(east, north), undefined);
      assert.equal(collision.normalAt(east, north), undefined);
      assert.equal(collision.slopeAt(east, north), undefined);
      assert.equal(collision.supportsFoot(east, north), false);
    }
  } finally {
    collision.dispose();
  }
});

test('D2-R30 normals are unit vectors and slopes are radians from the triangle plane', () => {
  const collision = createTownD2R30Collision({ spacing: 100, heightAt: (east, north) => 2 * east + 3 * north });
  try {
    for (const [east, north] of [[-1_050, 10], [-1_050, 60], [50, 1_000]]) {
      const normal = collision.normalAt(east, north)!;
      closeTo(Math.hypot(...normal), 1);
      closeTo(normal[0], -2 / Math.sqrt(14));
      closeTo(normal[1], 1 / Math.sqrt(14));
      closeTo(normal[2], -3 / Math.sqrt(14));
      closeTo(collision.slopeAt(east, north)!, Math.atan(Math.sqrt(13)));
    }
  } finally {
    collision.dispose();
  }
});

test('D2-R30 foot support applies the 55 degree gate to the centre and circumference', () => {
  const walkable = createTownD2R30Collision({
    spacing: 16,
    heightAt: (east) => east * Math.tan(54.9 * Math.PI / 180),
  });
  const steep = createTownD2R30Collision({
    spacing: 16,
    heightAt: (east) => east * Math.tan(55.1 * Math.PI / 180),
  });
  try {
    assert.equal(walkable.supportsFoot(0, 0, .27), true);
    assert.equal(steep.supportsFoot(0, 0, .27), false);
    assert.equal(walkable.supportsFoot(mainSummitBounds.east - .1, 0, .27), false,
      'a footprint crossing the domain boundary is unsupported');
  } finally {
    walkable.dispose();
    steep.dispose();
  }
});

test('D2-R30 raycast steps and bisects to the summit and arrival ground', () => {
  const collision = createTownD2R30Collision();
  try {
    const summit = collision.raycast(
      { east: 50, north: 1_000, height: 900 }, { east: 0, north: 0, height: -2 }, 150);
    assert.ok(summit);
    assert.deepEqual(summit.point, { east: 50, north: 1_000, height: 800 });
    closeTo(summit.distance, 100);
    closeTo(summit.distanceTravelled, 100);

    const ground = collision.raycast(
      { east: 0, north: 10, height: 400 }, { east: 0, north: 0, height: -1 }, 100);
    assert.ok(ground);
    closeTo(ground.point.height, 347);
    closeTo(ground.distance, 53);
    assert.equal(collision.raycast(
      { east: 50, north: 1_000, height: 900 }, { east: 0, north: 0, height: -1 }, 99), undefined);
    const alreadyGrounded = collision.raycast(
      { east: 50, north: 1_000, height: 800 }, { east: 0, north: 0, height: -1 }, 10);
    assert.equal(alreadyGrounded?.distance, 0);
  } finally {
    collision.dispose();
  }
});

test('D2-R30 sweep checks continuous footing and blocks a boundary crossing', () => {
  const collision = createTownD2R30Collision({ spacing: 100, heightAt: () => 347 });
  try {
    assert.deepEqual(collision.sweep(
      { east: -20, north: 0, height: 347 }, { east: 20, north: 20, height: 347 }, .27, 1.8,
    ), { safe: true, height: 347 });
    const blocked = collision.sweep(
      { east: -20, north: 0, height: 347 }, { east: 1_120, north: 0, height: 347 }, .27, 1.8,
    );
    assert.equal(blocked.safe, false);
    if (!blocked.safe) {
      assert.ok(blocked.blockedAt.east >= mainSummitBounds.east);
      closeTo(blocked.blockedAt.north, 0);
    }
  } finally {
    collision.dispose();
  }
});

test('D2-R30 stats describe the cached grid and dispose is idempotent', () => {
  const collision = createTownD2R30Collision();
  try {
    assert.deepEqual(collision.stats(), {
      spacing: 16,
      eastVertices: Math.ceil(2_200 / 16) + 1,
      northVertices: Math.ceil(1_800 / 16) + 1,
      vertexCount: (Math.ceil(2_200 / 16) + 1) * (Math.ceil(1_800 / 16) + 1),
      triangleCount: Math.ceil(2_200 / 16) * Math.ceil(1_800 / 16) * 2,
      heightSamples: (Math.ceil(2_200 / 16) + 1) * (Math.ceil(1_800 / 16) + 1),
      disposed: false,
    });
    assert.equal(collision.surfaceAt(50, 1_000), sampleTownD2R30Height(50, 1_000));
  } finally {
    collision.dispose();
  }
  collision.dispose();
  assert.equal(collision.stats().disposed, true);
  assert.equal(collision.surfaceAt(50, 1_000), undefined);
  assert.equal(collision.normalAt(50, 1_000), undefined);
  assert.equal(collision.slopeAt(50, 1_000), undefined);
  assert.equal(collision.supportsFoot(50, 1_000), false);
  assert.equal(collision.raycast(
    { east: 50, north: 1_000, height: 900 }, { east: 0, north: 0, height: -1 }, 100,
  ), undefined);
  assert.equal(collision.sweep({ east: 0, north: 0 }, { east: 1, north: 0 }, .27, 1.8).safe, false);
});

test('D2-R30 collision rejects invalid construction and sweep parameters', () => {
  assert.throws(() => createTownD2R30Collision({ spacing: 0 }), RangeError);
  assert.throws(() => createTownD2R30Collision({ spacing: NaN }), RangeError);
  assert.throws(() => createTownD2R30Collision({ arrivalHeight: Infinity }), RangeError);
  const collision = createTownD2R30Collision({ spacing: 100, heightAt: () => 347 });
  try {
    assert.equal(collision.sweep({ east: 0, north: 0 }, { east: 1, north: 0 }, -1, 1.8).safe, false);
    assert.equal(collision.sweep({ east: 0, north: 0 }, { east: 1, north: 0 }, .27, NaN).safe, false);
    assert.equal(collision.raycast(
      { east: 0, north: 0, height: 400 }, { east: 0, north: 0, height: 0 }, 100,
    ), undefined);
  } finally {
    collision.dispose();
  }
});
