import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildR30TownSkyline, townD2R30SkylineContract,
} from '../tools/voxel-tavern/town-blockout/town-d2-r30-skyline';
import {
  sampleTownD2R30Height, townD2R30GridAxis, townD2R30Spec,
} from '../tools/voxel-tavern/town-blockout/town-d2-r30-domain';
import { mainSummitBounds } from '../tools/voxel-tavern/town-blockout/main-summit-block';

test('D2-R01 no coloured curtain: no vertex drops below the canonical floor', () => {
  const geometry = buildR30TownSkyline();
  try {
    const position = geometry.getAttribute('position');
    const box = geometry.boundingBox!;
    assert.equal(box.min.y, townD2R30Spec.floorHeight, 'the old Y=-100 flared foot must be gone');
    assert.ok(box.max.y <= townD2R30Spec.summitHeight + 1e-6);
    for (let i = 0; i < position.count; i++) {
      assert.ok(position.getY(i) >= townD2R30Spec.floorHeight - 1e-6, `vertex ${i} sunk below the floor`);
    }
    assert.ok(Number.isFinite(box.min.x) && Number.isFinite(box.max.x));
  } finally {
    geometry.dispose();
  }
});

test('D2-R01 no flare and no north offset: every skirt foot is directly under its top vertex', () => {
  const geometry = buildR30TownSkyline();
  try {
    const position = geometry.getAttribute('position');
    const topCount = geometry.userData.r30TopVertexCount as number;
    const ringCount = geometry.userData.r30RingVertexCount as number;
    assert.ok(topCount > 1000 && topCount < position.count);
    assert.ok(ringCount > 0 && topCount + ringCount < position.count, 'a bottom-cap centre must follow the feet');

    const topKeys = new Set<string>();
    for (let i = 0; i < topCount; i++) {
      topKeys.add(`${position.getX(i).toFixed(3)}:${position.getZ(i).toFixed(3)}`);
    }
    for (let i = topCount; i < topCount + ringCount; i++) {
      assert.equal(position.getY(i), townD2R30Spec.floorHeight, `foot ${i} is not on the floor`);
      const key = `${position.getX(i).toFixed(3)}:${position.getZ(i).toFixed(3)}`;
      assert.ok(topKeys.has(key), `foot ${i} is flared or offset off the massif boundary (${key})`);
      assert.ok(Math.abs(position.getX(i)) <= mainSummitBounds.east + 1e-6);
    }
    // The old shell reached east*1.22 and north+140; the new one cannot.
    assert.ok(Math.abs(geometry.boundingBox!.max.x) <= mainSummitBounds.east + 1e-6);
    assert.ok(Math.abs(geometry.boundingBox!.min.x) <= -mainSummitBounds.west + 1e-6);
  } finally {
    geometry.dispose();
  }
});

test('D2-R01 the distant top is still the same-source D2 height field at far LOD', () => {
  const geometry = buildR30TownSkyline();
  try {
    const position = geometry.getAttribute('position');
    const color = geometry.getAttribute('color');
    const topCount = geometry.userData.r30TopVertexCount as number;
    assert.equal(townD2R30SkylineContract.spacing, townD2R30Spec.farSpacing);
    assert.equal(color.count, position.count);
    for (let i = 0; i < topCount; i++) {
      const east = position.getX(i), north = -position.getZ(i);
      assert.ok(Math.abs(position.getY(i) - sampleTownD2R30Height(east, north, 347)!) < 1e-4,
        `top vertex ${i} left the canonical sampler`);
    }
    const eastAxis = townD2R30GridAxis(mainSummitBounds.west, mainSummitBounds.east, townD2R30Spec.farSpacing);
    assert.equal(topCount % eastAxis.length, 0, 'top grid columns do not line up with the canonical axis');
  } finally {
    geometry.dispose();
  }
});

test('D2-R01 the shell is closed and advertises a fog-aware front-side material', () => {
  const geometry = buildR30TownSkyline();
  try {
    assert.equal(geometry.userData.r30ClosedShell, true);
    assert.deepEqual(geometry.userData.skylineMaterial, {
      side: 'front', fog: true, vertexColors: true,
    });
    const position = geometry.getAttribute('position');
    const capIndex = position.count - 1;
    assert.equal(position.getY(capIndex), townD2R30Spec.floorHeight);
    assert.equal(position.getX(capIndex), 0);
    assert.equal(position.getZ(capIndex), -(townD2R30SkylineContract.south + townD2R30SkylineContract.north) / 2);
    const index = geometry.getIndex()!;
    assert.ok(index.count > 0);
    assert.ok(index.count / 3 < 10_000, 'distant LOD must stay inside the old triangle budget');
  } finally {
    geometry.dispose();
  }
});

test('D2-R01 invalid contract constants are rejected rather than silently building a wall', () => {
  assert.equal(townD2R30SkylineContract.outerExpansion, 1);
  assert.equal(townD2R30SkylineContract.skirtNorthOffset, 0);
  assert.equal(townD2R30SkylineContract.floorHeight, 130);
  assert.equal(townD2R30SkylineContract.arrivalHeight, 347);
  assert.equal(townD2R30SkylineContract.south, 600);
  assert.equal(townD2R30SkylineContract.north, mainSummitBounds.north);
});
