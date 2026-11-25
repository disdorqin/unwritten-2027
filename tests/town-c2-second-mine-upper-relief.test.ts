import assert from 'node:assert/strict';
import test from 'node:test';
import {
  Color, DataTexture, FrontSide, Group, InstancedMesh, Material, Matrix4, MeshLambertMaterial,
  NearestFilter, StaticDrawUsage, Vector3,
} from 'three';
import {
  buildSecondMineUpperRelief, createSecondMineUpperRelief,
  type SecondMineUpperReliefBox, type SecondMineUpperReliefZone,
} from '../tools/voxel-tavern/town-blockout/town-c2-second-mine-upper-relief.js';
import {
  c2SecondMineBoxAllowed, c2SecondMineZones,
} from '../tools/voxel-tavern/town-blockout/town-c2-second-mine-contract.js';
import { secondMineDrySites } from '../src/shared/underground-second-mine-dry-wings.js';
import { canStandSecondMine, secondMineFloor } from '../src/shared/underground-second-mine-layout.js';

function pointBoxDistance(box: SecondMineUpperReliefBox, east: number, north: number) {
  const dx = Math.max(box.x - box.w / 2 - east, 0, east - box.x - box.w / 2);
  const dn = Math.max(box.n - box.d / 2 - north, 0, north - box.n - box.d / 2);
  return Math.hypot(dx, dn);
}

function coverage(boxes: readonly SecondMineUpperReliefBox[], zone: SecondMineUpperReliefZone,
  face: SecondMineUpperReliefBox['face'], axis: 'x' | 'n', min: number, max: number) {
  const span = max - min;
  const occupied = new Set<number>();
  for (const box of boxes) {
    if (box.zone !== zone || box.face !== face || box.role !== 'wall') continue;
    const start = axis === 'n' ? box.n - box.d / 2 : box.x - box.w / 2;
    const end = axis === 'n' ? box.n + box.d / 2 : box.x + box.w / 2;
    for (let bin = Math.floor((start - min) / span * span);
      bin <= Math.floor((end - min) / span * span); bin++) occupied.add(bin);
  }
  return occupied.size / span;
}

function ceilingCoverage(boxes: readonly SecondMineUpperReliefBox[], zone: SecondMineUpperReliefZone) {
  const bounds = zone === 'upper-west' ? c2SecondMineZones.upperWest : c2SecondMineZones.upperEast;
  const occupied = new Set<string>();
  for (const box of boxes) {
    if (box.zone !== zone || box.role !== 'ceiling') continue;
    for (let x = Math.floor((box.x - box.w / 2 - bounds.x0) / 2);
      x <= Math.floor((box.x + box.w / 2 - bounds.x0) / 2); x++) {
      for (let n = Math.floor((box.n - box.d / 2 - bounds.n0) / 2);
        n <= Math.floor((box.n + box.d / 2 - bounds.n0) / 2); n++) occupied.add(`${x}/${n}`);
    }
  }
  const total = Math.ceil((bounds.x1 - bounds.x0) / 2) * Math.ceil((bounds.n1 - bounds.n0) / 2);
  return occupied.size / total;
}

test('upper relief is deterministic, contract-safe and uses all three existing mine material families', () => {
  const built = buildSecondMineUpperRelief();
  assert.deepEqual(buildSecondMineUpperRelief(), built);
  assert.ok(built.boxes.length > 900, `only ${built.boxes.length} relief voxels`);
  assert.ok(built.rejectedCandidates > 0, 'reserved candidates must actually be exercised');
  for (const box of built.boxes) {
    assert.equal(c2SecondMineBoxAllowed(box), true, JSON.stringify(box));
    assert.ok([box.x, box.n, box.y, box.w, box.d, box.h].every(Number.isFinite));
    assert.ok(box.w > 0 && box.d > 0 && box.h > 0);
  }
  const overlay = createSecondMineUpperRelief();
  const stats = overlay.stats();
  assert.deepEqual(Object.keys(stats.materialFamilyCounts).sort(), ['basalt', 'rock', 'rust']);
  for (const count of Object.values(stats.materialFamilyCounts)) assert.ok(count > 100);
  assert.equal(Object.values(stats.materialFamilyCounts).reduce((sum, count) => sum + count, 0), stats.voxelCount);
  assert.equal(Object.values(stats.roleCounts).reduce((sum, count) => sum + count, 0), stats.voxelCount);
  assert.equal(stats.drawCount, 3);
  assert.equal(stats.triangles, stats.voxelCount * 12);
  overlay.dispose();
});

test('both upper work areas have dense walls, stepped ceilings, rubble and paired rock teeth', () => {
  const { boxes } = buildSecondMineUpperRelief();
  for (const [zone, bounds, ceiling] of [
    ['upper-west', c2SecondMineZones.upperWest, 6.3],
    ['upper-east', c2SecondMineZones.upperEast, 7],
  ] as const) {
    assert.ok(coverage(boxes, zone, 'outer', 'n', bounds.n0, bounds.n1) >= .98,
      `${zone} outer wall ${coverage(boxes, zone, 'outer', 'n', bounds.n0, bounds.n1)}`);
    assert.ok(coverage(boxes, zone, 'end', 'x', bounds.x0, bounds.x1) >= .94,
      `${zone} end walls ${coverage(boxes, zone, 'end', 'x', bounds.x0, bounds.x1)}`);
    assert.ok(coverage(boxes, zone, 'door', 'n', bounds.n0, bounds.n1) >= .98,
      `${zone} upper door return ${coverage(boxes, zone, 'door', 'n', bounds.n0, bounds.n1)}`);
    assert.ok(ceilingCoverage(boxes, zone) > .86, `${zone} ceiling coverage ${ceilingCoverage(boxes, zone)}`);

    const outer = boxes.filter(box => box.zone === zone && box.face === 'outer');
    for (let north = bounds.n0; north < bounds.n1; north++) {
      const heights = new Set<number>();
      for (const box of outer) {
        if (box.n - box.d / 2 >= north + 1 || box.n + box.d / 2 <= north) continue;
        for (let y = Math.floor(box.y - box.h / 2); y < Math.ceil(box.y + box.h / 2); y++) heights.add(y);
      }
      assert.ok(heights.size >= Math.floor(ceiling), `${zone} vertical wall gap at N${north}: ${[...heights]}`);
    }
    for (const role of ['ceiling', 'rubble', 'stalagmite', 'stalactite'] as const) {
      assert.ok(boxes.filter(box => box.zone === zone && box.role === role).length > 40, `${zone} ${role}`);
    }
  }
  const overlay = createSecondMineUpperRelief();
  assert.ok(overlay.stats().wallFacadeAreaM2['upper-west'] > 450);
  assert.ok(overlay.stats().wallFacadeAreaM2['upper-east'] > 600);
  overlay.dispose();
});

test('all relief stays in its surveyed wing and preserves doors, routes and workface centres', () => {
  const { boxes } = buildSecondMineUpperRelief();
  for (const box of boxes) {
    const bounds = box.zone === 'upper-west' ? c2SecondMineZones.upperWest : c2SecondMineZones.upperEast;
    assert.ok(box.x - box.w / 2 >= bounds.x0 && box.x + box.w / 2 <= bounds.x1, JSON.stringify(box));
    assert.ok(box.n - box.d / 2 >= bounds.n0 && box.n + box.d / 2 <= bounds.n1, JSON.stringify(box));
    assert.ok(pointBoxDistance(box, secondMineDrySites.workfaceWest.east, secondMineDrySites.workfaceWest.north) >= 1.95 - 1e-9);
    assert.ok(pointBoxDistance(box, secondMineDrySites.workfaceEast.east, secondMineDrySites.workfaceEast.north) >= 1.95 - 1e-9);
  }
  for (const [doorX, n0, n1] of [[-4, 38, 56], [4, 68, 90]] as const) {
    assert.ok(!boxes.some(box => box.y - box.h / 2 < 3.2 && Math.abs(box.x - doorX) - box.w / 2 < .72 &&
      box.n + box.d / 2 > n0 - .45 && box.n - box.d / 2 < n1 + .45), `low door ${doorX}`);
  }
  for (const [east, north] of [[-4, 47], [4, 79], [-24, 48], [29, 82]] as const) {
    assert.equal(canStandSecondMine(east, north, 'middle'), true, `${east}/${north} standing support`);
    assert.equal(secondMineFloor(east, north, 'middle'), 0);
  }
  const overlay = createSecondMineUpperRelief();
  assert.equal(overlay.stats().colliders, 0);
  assert.equal(overlay.stats().floorChanges, 0);
  assert.equal(overlay.stats().rewards, 0);
  assert.equal(overlay.group.position.x, 0);
  assert.equal(overlay.group.position.y, 0);
  assert.equal(overlay.group.position.z, 0);
  overlay.dispose();
});

test('door clearance uses the box bottom and still permits high boxes', () => {
  const doorBox = { x: 4.8, n: 79, w: 1, h: 2, d: 1 } as const;
  assert.equal(c2SecondMineBoxAllowed({ ...doorBox, y: 3.1 }), false,
    'a centre below 3.2 with a bottom at 2.1 must be rejected');
  assert.equal(c2SecondMineBoxAllowed({ ...doorBox, y: 3.3 }), false,
    'a centre above 3.2 with a bottom at 2.3 must also be rejected');
  assert.equal(c2SecondMineBoxAllowed({ ...doorBox, y: 4.3 }), true,
    'a box with its bottom at 3.3 must remain allowed');
});

test('three instanced batches keep 16px Nearest pixel maps and the local north-to-negative-z convention', () => {
  const overlay = createSecondMineUpperRelief();
  const owner = new Group();
  owner.add(overlay.group);
  assert.equal(overlay.meshes.length, 3);
  assert.equal(new Set(overlay.meshes.map(mesh => mesh.geometry)).size, 1, 'shared box geometry');
  const matrix = new Matrix4();
  const position = new Vector3();
  for (const mesh of overlay.meshes) {
    assert.ok(mesh instanceof InstancedMesh);
    assert.ok(mesh.count > 100);
    assert.equal(mesh.castShadow, true);
    assert.equal(mesh.instanceMatrix.usage, StaticDrawUsage);
    assert.ok(mesh.instanceColor);
    const material = mesh.material;
    assert.ok(material instanceof Material);
    assert.ok(material instanceof MeshLambertMaterial);
    assert.equal(material.side, FrontSide);
    assert.equal(material.flatShading, true);
    assert.ok(material.map);
    assert.equal(material.map.image.width, 16);
    assert.equal(material.map.image.height, 16);
    assert.equal(material.map.magFilter, NearestFilter);
    assert.equal(material.map.minFilter, NearestFilter);
    const family = material.userData.materialFamily as string;
    const expected = overlay.boxes.find(box => box.family === family)!;
    mesh.getMatrixAt(0, matrix);
    position.setFromMatrixPosition(matrix);
    assert.ok(Math.abs(position.x - expected.x) < 1e-5, `${family} x ${position.x}/${expected.x}`);
    assert.ok(Math.abs(position.y - expected.y) < 1e-5, `${family} y ${position.y}/${expected.y}`);
    assert.ok(Math.abs(position.z + expected.n) < 1e-5,
      `${family} z ${position.z}/${-expected.n}; expected box ${JSON.stringify(expected)}`);
  }
  const rust = overlay.meshes.find(mesh =>
    mesh.material instanceof MeshLambertMaterial && mesh.material.userData.materialFamily === 'rust')!
    .material as MeshLambertMaterial;
  overlay.setNight(false);
  overlay.setNight(true);
  overlay.setNight(true);
  assert.ok(rust.emissiveIntensity > 0);
  overlay.setNight(false);
  overlay.setNight(false);
  assert.equal(rust.emissiveIntensity, 0);
  overlay.dispose();
});

test('pixel facets, spatial instance tints and masked rust emission add visual hierarchy without batches', () => {
  const overlay = createSecondMineUpperRelief();
  try {
    assert.equal(overlay.stats().drawCount, 3);
    assert.equal(overlay.stats().triangles, overlay.stats().voxelCount * 12);
    for (const mesh of overlay.meshes) {
      const material = mesh.material as MeshLambertMaterial;
      const texture = material.map;
      assert.ok(texture instanceof DataTexture);
      const pixels = texture.image.data as Uint8Array;
      const colors = new Set<string>();
      let minLuminance = 255, maxLuminance = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        colors.add(`${pixels[index]}/${pixels[index + 1]}/${pixels[index + 2]}`);
        const luminance = pixels[index]! * .2126 + pixels[index + 1]! * .7152 + pixels[index + 2]! * .0722;
        minLuminance = Math.min(minLuminance, luminance);
        maxLuminance = Math.max(maxLuminance, luminance);
      }
      assert.ok(colors.size >= 4, `${mesh.name} needs base, facet, seam and chip tones`);
      assert.ok(maxLuminance - minLuminance > 45, `${mesh.name} lacks pixel contrast`);

      const tint = new Color();
      const shades = new Set<string>();
      let minShade = Infinity, maxShade = -Infinity, warmOrCool = false;
      for (let index = 0; index < mesh.count; index++) {
        mesh.getColorAt(index, tint);
        shades.add(tint.g.toFixed(4));
        minShade = Math.min(minShade, tint.g);
        maxShade = Math.max(maxShade, tint.g);
        if (Math.abs(tint.r - tint.b) > .01) warmOrCool = true;
      }
      assert.ok(shades.size > 12, `${mesh.name} instance colour is too uniform`);
      assert.ok(maxShade - minShade > .12, `${mesh.name} lacks instance value separation`);
      if (material.userData.materialFamily === 'rust' || material.userData.materialFamily === 'basalt') {
        assert.equal(warmOrCool, true, `${mesh.name} lacks material-specific tint`);
      }
      if (material.userData.materialFamily === 'rust') {
        assert.equal(material.emissiveMap, texture, 'ore pixels must also mask the existing glow');
      } else {
        assert.equal(material.emissiveMap, null);
      }
    }
  } finally {
    overlay.dispose();
  }
});

test('dispose is idempotent, detaches from the host and releases only overlay-owned resources', () => {
  const overlay = createSecondMineUpperRelief();
  const owner = new Group();
  owner.add(overlay.group);
  let geometryDisposals = 0;
  let materialDisposals = 0;
  let textureDisposals = 0;
  overlay.meshes[0]!.geometry.addEventListener('dispose', () => { geometryDisposals++; });
  for (const mesh of overlay.meshes) {
    const material = mesh.material as MeshLambertMaterial;
    material.addEventListener('dispose', () => { materialDisposals++; });
    material.map!.addEventListener('dispose', () => { textureDisposals++; });
  }
  const count = overlay.stats().voxelCount;
  overlay.dispose();
  overlay.dispose();
  overlay.setNight(true);
  assert.equal(overlay.group.parent, null);
  assert.equal(overlay.group.children.length, 0);
  assert.equal(geometryDisposals, 1);
  assert.equal(materialDisposals, 3);
  assert.equal(textureDisposals, 3);
  assert.equal(overlay.stats().disposed, true);
  assert.equal(overlay.stats().voxelCount, count);
});
