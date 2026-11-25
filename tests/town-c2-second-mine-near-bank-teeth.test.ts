import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  Color, DataTexture, FrontSide, Group, InstancedMesh, Material, Matrix4, MeshLambertMaterial,
  NearestFilter, Quaternion, StaticDrawUsage, Vector3,
} from 'three';
import {
  buildTownC2SecondMineNearBankTeeth, c2SecondMineNearBankTeethBands,
  type C2SecondMineNearBankFeature,
} from '../tools/voxel-tavern/town-blockout/town-c2-second-mine-near-bank-teeth.js';
import { c2SecondMineBoxAllowed } from '../tools/voxel-tavern/town-blockout/town-c2-second-mine-contract.js';
import { secondMineRiver } from '../src/shared/underground-second-mine-layout.js';

const features: readonly C2SecondMineNearBankFeature[] = [
  'scarp', 'rock-tooth', 'stalagmite', 'stalactite',
  'collapse-rubble', 'rust-vein', 'industrial-brace',
];

function rectangleDistance(x: number, n: number,
  box: Readonly<{ x: number; n: number; w: number; d: number }>) {
  const dx = Math.max(box.x - box.w / 2 - x, 0, x - box.x - box.w / 2);
  const dn = Math.max(box.n - box.d / 2 - n, 0, n - box.n - box.d / 2);
  return Math.hypot(dx, dn);
}

test('C2 -140 near-bank teeth fill both reviewed bands at wall-dressing density', () => {
  const built = buildTownC2SecondMineNearBankTeeth();
  try {
    const { placements, stats } = built;
    assert.equal(stats.coordinateFrame, 'second-mine-local-east-north-up');
    assert.equal(stats.visualOnly, true);
    assert.equal(stats.instanced, true);
    assert.ok(stats.pieceCount > 1800, `only ${stats.pieceCount} pieces`);
    assert.ok(stats.bandCounts.west > 900 && stats.bandCounts.east > 900);
    assert.equal(stats.bandCounts.west + stats.bandCounts.east, stats.pieceCount);
    assert.equal(Object.values(stats.featureCounts).reduce((sum, count) => sum + count, 0), stats.pieceCount);
    assert.equal(Object.values(stats.materialCounts).reduce((sum, count) => sum + count, 0), stats.pieceCount);
    assert.equal(stats.scarpCourses, 18);
    assert.ok(stats.featureCounts.scarp > 1200);
    assert.ok(stats.featureCounts['rock-tooth'] > 80);
    assert.ok(stats.featureCounts.stalagmite > 70);
    assert.ok(stats.featureCounts.stalactite > 40);
    assert.ok(stats.featureCounts['collapse-rubble'] > 250);
    assert.ok(stats.featureCounts['rust-vein'] > 180);
    assert.ok(stats.featureCounts['industrial-brace'] > 120);
    for (const band of c2SecondMineNearBankTeethBands) {
      for (const feature of features) assert.ok(placements.some(piece =>
        piece.band === band.id && piece.kind === feature), `${band.id} lacks ${feature}`);
    }
    assert.ok(stats.bounds.minX >= -46 && stats.bounds.maxX <= 46);
    assert.ok(stats.bounds.minN >= 100 && stats.bounds.maxN <= 123);
    assert.ok(stats.bounds.minY >= -.7 && stats.bounds.maxY <= 13);
    assert.ok(Object.isFrozen(placements) && placements.every(Object.isFrozen));
  } finally {
    built.dispose();
  }
});

test('every visible cube and chip passes the shared placement guard without claiming collision or ore authority', () => {
  const built = buildTownC2SecondMineNearBankTeeth();
  try {
    for (const piece of built.placements) {
      const band = c2SecondMineNearBankTeethBands.find(candidate => candidate.id === piece.band)!;
      assert.ok(piece.x - piece.w / 2 >= band.x0 - 1e-9 && piece.x + piece.w / 2 <= band.x1 + 1e-9,
        `${piece.id} leaves its east band`);
      assert.ok(piece.n - piece.d / 2 >= band.n0 - 1e-9 && piece.n + piece.d / 2 <= band.n1 + 1e-9,
        `${piece.id} leaves its north band`);
      assert.equal(c2SecondMineBoxAllowed(piece), true, `${piece.id} fails the C2 contract`);
      assert.equal(c2SecondMineBoxAllowed(piece, 1), true, `${piece.id} lacks route clearance`);
      assert.ok(piece.n + piece.d / 2 < secondMineRiver.n0 - 1, `${piece.id} approaches the dark river`);
      assert.equal(piece.visualOnly, true);
    }
    assert.deepEqual(built.colliders, []);
    assert.equal(built.stats.colliderCount, 0);
    assert.equal(built.stats.orePointCount, 0);
    assert.equal('floor' in built, false);
    assert.equal('canStand' in built, false);
  } finally {
    built.dispose();
  }
});

test('ferry, bypass, pier and door reservations stay clear of all wall-art footprints', () => {
  const built = buildTownC2SecondMineNearBankTeeth();
  try {
    const reserved = [
      { name: 'gallery-to-bypass route', x: 0, n: 112 },
      { name: 'bypass south bend', x: 51.5, n: 112.8 },
      { name: 'dry bypass', x: 51.5, n: 137 },
      { name: 'bypass north bend', x: 51.5, n: 159 },
      { name: 'near ferry pier', x: 0, n: 126 },
      { name: 'far ferry pier', x: 0, n: 148 },
      { name: 'west wing door', x: -48, n: 171 },
      { name: 'east wing door', x: 48, n: 174 },
    ];
    for (const point of reserved) for (const piece of built.placements) {
      assert.ok(rectangleDistance(point.x, point.n, piece) >= 1,
        `${piece.id} enters ${point.name}`);
    }
  } finally {
    built.dispose();
  }
});

test('four cold industrial material families use 16px nearest-filtered unit-cube instances in local ENY', () => {
  const built = buildTownC2SecondMineNearBankTeeth();
  try {
    assert.equal(built.stats.materialFamilies, 4);
    assert.ok(built.stats.materialFamilies >= 3);
    assert.equal(built.meshes.length, 4);
    assert.equal(built.group.position.length(), 0);
    assert.equal(built.group.rotation.x, 0);
    assert.equal(built.group.rotation.y, 0);
    assert.equal(built.group.rotation.z, 0);
    assert.equal(built.group.children.length, built.meshes.length);
    assert.equal(built.meshes.reduce((sum, mesh) => sum + mesh.count, 0), built.stats.pieceCount);

    for (const mesh of built.meshes) {
      assert.ok(mesh instanceof InstancedMesh);
      assert.equal(mesh.geometry, built.geometry);
      assert.equal(mesh.geometry.type, 'BoxGeometry');
      assert.equal(mesh.instanceMatrix.usage, StaticDrawUsage);
      assert.ok(mesh.material instanceof Material);
      assert.ok(mesh.material instanceof MeshLambertMaterial);
      assert.equal(mesh.material.side, FrontSide);
      assert.equal(mesh.material.flatShading, true);
      assert.equal(mesh.material.color.getHex(), 0xffffff);
      assert.equal(mesh.material.emissive.getHex(), 0x000000);
      assert.equal(mesh.material.map?.image.width, 16);
      assert.equal(mesh.material.map?.image.height, 16);
      assert.equal(mesh.material.map?.minFilter, NearestFilter);
      assert.equal(mesh.material.map?.magFilter, NearestFilter);
      assert.equal(mesh.material.map?.generateMipmaps, false);
      assert.equal(mesh.userData.visualOnly, true);

      const family = mesh.userData.materialFamily as keyof typeof built.stats.materialCounts;
      const pieces = built.placements.filter(piece => piece.family === family);
      assert.equal(mesh.count, pieces.length);
      assert.equal(mesh.count, built.stats.materialCounts[family]);
      const matrix = new Matrix4(), position = new Vector3(), scale = new Vector3();
      const rotation = new Quaternion();
      pieces.forEach((piece, index) => {
        mesh.getMatrixAt(index, matrix);
        matrix.decompose(position, rotation, scale);
        assert.ok(Math.abs(position.x - piece.x) < 1e-5,
          `${piece.id} local east: matrix=${position.x}, placement=${piece.x}`);
        assert.ok(Math.abs(position.y - piece.y) < 1e-5,
          `${piece.id} local height: matrix=${position.y}, placement=${piece.y}`);
        assert.ok(Math.abs(position.z + piece.n) < 1e-5,
          `${piece.id} local north-to-Z: matrix=${position.z}, placement=${-piece.n}`);
        assert.ok(Math.abs(scale.x - piece.w) < 1e-5 && Math.abs(scale.y - piece.h) < 1e-5 &&
          Math.abs(scale.z - piece.d) < 1e-5, `${piece.id} dimensions`);
        assert.ok(Math.abs(rotation.x) < 1e-7 && Math.abs(rotation.y) < 1e-7 &&
          Math.abs(rotation.z) < 1e-7 && Math.abs(rotation.w - 1) < 1e-7,
          `${piece.id} must retain its contract AABB`);
      });
    }
    const iron = built.materials[built.materials.findIndex(material => material.name.endsWith('-iron'))]!;
    const basalt = built.materials[built.materials.findIndex(material => material.name.endsWith('-basalt'))]!;
    assert.ok(iron.name.endsWith('-iron'));
    assert.ok(basalt.name.endsWith('-basalt'));
    assert.notEqual(iron.map, basalt.map);
    for (const count of Object.values(built.stats.materialCounts)) assert.ok(count > 100);
  } finally {
    built.dispose();
  }
});

test('coursed pixels and per-piece tints separate stone, gravel, iron and mineral warmth without new geometry', () => {
  const built = buildTownC2SecondMineNearBankTeeth();
  try {
    const tint = new Color();
    for (const mesh of built.meshes) {
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
      assert.ok(colors.size >= 4, `${mesh.name} needs multiple material tones`);
      assert.ok(maxLuminance - minLuminance > 45, `${mesh.name} lacks pixel contrast`);
      assert.equal(material.emissive.getHex(), 0x000000, 'mineral warmth must not become a real light');

      const shades = new Set<string>();
      let minShade = Infinity, maxShade = -Infinity, materialTint = false;
      for (let index = 0; index < mesh.count; index++) {
        assert.ok(mesh.instanceColor);
        mesh.getColorAt(index, tint);
        shades.add(tint.g.toFixed(4));
        minShade = Math.min(minShade, tint.g);
        maxShade = Math.max(maxShade, tint.g);
        if (Math.abs(tint.r - tint.b) > .01) materialTint = true;
      }
      assert.ok(shades.size > 8, `${mesh.name} instance colour is too uniform`);
      assert.ok(maxShade - minShade > .12, `${mesh.name} lacks per-piece value variation`);
      if (mesh.userData.materialFamily === 'rust' || mesh.userData.materialFamily === 'iron') {
        assert.equal(materialTint, true, `${mesh.name} lacks warm/cool mineral separation`);
      }
    }
    assert.equal(built.meshes.reduce((sum, mesh) => sum + mesh.count * 12, 0),
      built.stats.pieceCount * 12, 'visual refinement must not add triangles');
  } finally {
    built.dispose();
  }
});

test('placement is deterministic and dispose idempotently releases every owned GPU resource', () => {
  const first = buildTownC2SecondMineNearBankTeeth();
  const second = buildTownC2SecondMineNearBankTeeth();
  try {
    assert.deepEqual(first.placements, second.placements);
    assert.deepEqual(first.stats, second.stats);
    const host = new Group();
    host.add(first.group);
    let geometryDisposals = 0, materialDisposals = 0, textureDisposals = 0, meshDisposals = 0;
    first.geometry.addEventListener('dispose', () => geometryDisposals++);
    first.materials.forEach(material => material.addEventListener('dispose', () => materialDisposals++));
    first.textures.forEach(texture => texture.addEventListener('dispose', () => textureDisposals++));
    first.meshes.forEach(mesh => mesh.addEventListener('dispose', () => meshDisposals++));
    first.dispose();
    first.dispose();
    assert.equal(first.group.parent, null);
    assert.equal(first.group.children.length, 0);
    assert.equal(host.children.length, 0);
    assert.equal(geometryDisposals, 1);
    assert.equal(materialDisposals, first.materials.length);
    assert.equal(textureDisposals, first.textures.length);
    assert.equal(meshDisposals, first.meshes.length);
    assert.equal(second.group.parent, null);
    assert.ok(second.stats.pieceCount > 1800, 'dispose must not destroy the immutable survey');
  } finally {
    first.dispose();
    second.dispose();
  }
});
