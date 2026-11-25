import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  Color, DataTexture, FrontSide, Group, InstancedMesh, Light, Material, MeshLambertMaterial,
  NearestFilter, StaticDrawUsage,
} from 'three';
import { canStandSecondMine } from '../src/shared/underground-second-mine-layout.js';
import { c2SecondMineBoxAllowed } from '../tools/voxel-tavern/town-blockout/town-c2-second-mine-contract.js';
import {
  buildTownC2SecondMineBypassWall,
  type C2SecondMineBypassWallFamily,
} from '../tools/voxel-tavern/town-blockout/town-c2-second-mine-bypass-wall.js';

const families: readonly C2SecondMineBypassWallFamily[] = [
  'rock', 'basalt', 'rust', 'wood', 'iron', 'gravel',
];

test('C2 bypass dressing covers both surveyed walls and every part passes the shared guard', () => {
  const scene = buildTownC2SecondMineBypassWall();
  try {
    assert.equal(scene.group.position.length(), 0);
    assert.equal(scene.group.rotation.y, 0);
    assert.equal(scene.group.userData.visualOnly, true);
    for (const side of ['west', 'east'] as const) {
      const wall = scene.boxes.filter(part => part.side === side);
      assert.ok(wall.length > 400, side + ' wall is too sparse');
      assert.ok(wall.some(part => part.feature === 'layer-slab'));
      assert.ok(wall.some(part => part.feature === 'rust-seep'));
      assert.ok(wall.some(part => part.feature === 'wood-remnant'));
      assert.ok(wall.some(part => part.feature === 'iron-nail'));
      assert.ok(wall.some(part => part.feature === 'tool-outline'));
      assert.ok(wall.some(part => part.feature === 'wall-foot-fragment'));
      for (const part of wall) {
        assert.equal(c2SecondMineBoxAllowed(part), true,
          `${side}/${part.feature} rejected at ${part.x}/${part.n}`);
        assert.ok(part.n - part.d / 2 >= 114 - 1e-9 &&
          part.n + part.d / 2 <= 157 + 1e-9, 'north range escaped N114-157');
        assert.ok(side === 'west' ? part.x >= 48 && part.x < 50 :
          part.x > 53 && part.x <= 55, 'east range escaped the wall band');
      }
    }
    const stats = scene.stats();
    assert.equal(stats.pieces, scene.boxes.length);
    assert.equal(Object.values(stats.materialPieceCounts).reduce((a, b) => a + b, 0),
      stats.pieces);
    assert.ok(stats.bounds.minEast >= 48 && stats.bounds.maxEast <= 55);
    assert.ok(stats.bounds.minNorth >= 114 && stats.bounds.maxNorth <= 157);
    assert.ok(stats.bounds.maxNorth - stats.bounds.minNorth > 42.9);
    assert.ok(Math.abs(stats.bounds.minHeight - .005) < 1e-9);
    assert.ok(Math.abs(stats.bounds.maxHeight - 6.3) < 1e-9);
  } finally {
    scene.dispose();
  }
});

test('C2 bypass centre stays clear at every water level without adding collision or door/rail authority', () => {
  const scene = buildTownC2SecondMineBypassWall();
  try {
    for (const part of scene.boxes) {
      if (part.n + part.d / 2 < 114 || part.n - part.d / 2 > 157) continue;
      const gap = part.x < 51.5
        ? 51.5 - part.x - part.w / 2
        : part.x - part.w / 2 - 51.5;
      assert.ok(gap >= .72, `${part.feature} enters the protected route by ${gap}`);
    }
    assert.ok(scene.stats().routeCenterClearanceM > 2.3);
    for (const state of ['high', 'middle', 'low'] as const) {
      for (let n = 114; n <= 157; n += .25) {
        assert.equal(canStandSecondMine(51.5, n, state, .27), true,
          `${state} route blocked at N${n}`);
      }
    }
    assert.equal(scene.stats().colliders, 0);
    assert.equal(scene.stats().railings, 0);
    assert.equal(scene.stats().wingDoors, 0);
    assert.equal('canStand' in scene, false);
    assert.equal('floor' in scene, false);
    assert.ok(scene.boxes.every(part => part.feature !== 'tool-outline' || part.y > 2));
  } finally {
    scene.dispose();
  }
});

test('C2 bypass uses six pixel material families with 16px nearest textures', () => {
  const scene = buildTownC2SecondMineBypassWall();
  try {
    const meshes: InstancedMesh[] = [];
    scene.group.traverse(object => {
      if (object instanceof InstancedMesh) meshes.push(object);
    });
    assert.equal(meshes.length, 6);
    assert.equal(scene.stats().materialFamilies, 6);
    assert.equal(scene.stats().textureSize, 16);
    assert.equal(scene.stats().textureFilter, 'nearest');
    for (const family of families) {
      assert.ok(scene.stats().materialPieceCounts[family] > 0, family + ' is unused');
      const mesh = meshes.find(candidate => candidate.name.endsWith('/' + family));
      assert.ok(mesh instanceof InstancedMesh);
      assert.equal(mesh.count, scene.stats().materialPieceCounts[family]);
      assert.equal(mesh.instanceMatrix.usage, StaticDrawUsage);
      assert.ok(mesh.material instanceof Material);
      assert.ok(mesh.material instanceof MeshLambertMaterial);
      assert.equal(mesh.material.side, FrontSide);
      assert.equal(mesh.material.flatShading, true);
      assert.equal(mesh.material.color.getHex(), 0xffffff);
      assert.equal(mesh.material.polygonOffset, true);
      const texture = mesh.material.map;
      assert.ok(texture instanceof DataTexture);
      const image = texture.image as { width: number; height: number };
      assert.equal(image.width, 16);
      assert.equal(image.height, 16);
      assert.equal(texture.minFilter, NearestFilter);
      assert.equal(texture.magFilter, NearestFilter);
      assert.equal(texture.generateMipmaps, false);
    }
  } finally {
    scene.dispose();
  }
});

test('stratified pixels and per-slab tints enrich the bypass without changing its triangle budget', () => {
  const scene = buildTownC2SecondMineBypassWall();
  try {
    const meshes: InstancedMesh[] = [];
    scene.group.traverse(object => { if (object instanceof InstancedMesh) meshes.push(object); });
    const tint = new Color();
    for (const mesh of meshes) {
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
      assert.ok(colors.size >= 4, `${mesh.name} needs layered material tones`);
      assert.ok(maxLuminance - minLuminance > 45, `${mesh.name} lacks pixel contrast`);
      assert.equal(material.emissive.getHex(), 0x000000);

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
      assert.ok(shades.size > Math.min(8, mesh.count - 1),
        `${mesh.name} instance colour is too uniform`);
      assert.ok(maxShade - minShade > .12, `${mesh.name} lacks course/fragment value separation`);
      if (mesh.name.endsWith('/rust') || mesh.name.endsWith('/wood') ||
        mesh.name.endsWith('/iron') || mesh.name.endsWith('/basalt')) {
        assert.equal(materialTint, true, `${mesh.name} lacks material-specific tint`);
      }
    }
    assert.equal(meshes.reduce((sum, mesh) => sum + mesh.count * 12, 0),
      scene.boxes.length * 12, 'wall dressing must keep its original triangle budget');
    let lights = 0;
    scene.group.traverse(object => { if (object instanceof Light) lights++; });
    assert.equal(lights, 0);
  } finally {
    scene.dispose();
  }
});

test('C2 bypass dispose is idempotent and releases only its own GPU resources', () => {
  const host = new Group();
  const scene = buildTownC2SecondMineBypassWall();
  host.add(scene.group);
  const geometries = new Set(scene.group.children.map(child =>
    (child as InstancedMesh).geometry));
  const materials = new Set(scene.group.children.map(child =>
    (child as InstancedMesh).material as MeshLambertMaterial));
  const textures = new Set([...materials].map(material => material.map as DataTexture));
  const geometryDisposals = new Map<object, number>();
  const materialDisposals = new Map<object, number>();
  const textureDisposals = new Map<object, number>();
  for (const geometry of geometries) geometry.addEventListener('dispose', () => {
    geometryDisposals.set(geometry, (geometryDisposals.get(geometry) ?? 0) + 1);
  });
  for (const material of materials) material.addEventListener('dispose', () => {
    materialDisposals.set(material, (materialDisposals.get(material) ?? 0) + 1);
  });
  for (const texture of textures) texture.addEventListener('dispose', () => {
    textureDisposals.set(texture, (textureDisposals.get(texture) ?? 0) + 1);
  });

  scene.dispose();
  scene.dispose();
  assert.equal(scene.group.parent, null);
  assert.equal(host.children.length, 0);
  assert.equal(scene.group.children.length, 0);
  assert.equal(scene.stats().disposed, true);
  assert.equal(scene.stats().visiblePieces, 0);
  assert.ok([...geometryDisposals.values()].every(count => count === 1));
  assert.ok([...materialDisposals.values()].every(count => count === 1));
  assert.ok([...textureDisposals.values()].every(count => count === 1));
  assert.equal(geometryDisposals.size, 1);
  assert.equal(materialDisposals.size, 6);
  assert.equal(textureDisposals.size, 6);
});
