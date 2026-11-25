import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FrontSide, Group, InstancedMesh, MeshLambertMaterial, NearestFilter, PointLight,
  StaticDrawUsage, type EventDispatcher,
} from 'three';
import { secondMineAnchors } from '../src/shared/underground-second-mine-layout.js';
import { secondMineDrySites } from '../src/shared/underground-second-mine-dry-wings.js';
import { c2SecondMineBoxAllowed } from '../tools/voxel-tavern/town-blockout/town-c2-second-mine-contract.js';
import {
  build, buildC2SecondMineCampLife, c2SecondMineCampLifePrefix, dispose, stats,
} from '../tools/voxel-tavern/town-blockout/town-c2-second-mine-camp-life.js';

function pointBoxDistance(east: number, north: number, piece: ReturnType<typeof buildC2SecondMineCampLife>['pieces'][number]) {
  return Math.hypot(Math.max(piece.x - piece.w / 2 - east, 0, east - piece.x - piece.w / 2),
    Math.max(piece.n - piece.d / 2 - north, 0, north - piece.n - piece.d / 2));
}

test('C2 camp life adds a dense, non-interactive set of nine daily-use prop types in four surveyed areas', () => {
  assert.equal(build, buildC2SecondMineCampLife);
  const scene = build();
  const sceneStats = scene.stats();
  assert.equal(stats(scene), sceneStats);
  assert.equal(scene.group.position.toArray().every(value => value === 0), true);
  assert.equal(sceneStats.coordinateFrame, 'local-eny');
  assert.ok(sceneStats.pieceCount >= 240 && sceneStats.pieceCount <= 300);
  assert.ok(sceneStats.objectCount >= 65 && sceneStats.objectCount <= 75);
  assert.deepEqual(Object.keys(sceneStats.objectCounts).sort(), [
    'blanket', 'boots', 'bowl', 'chisel', 'crate', 'jug', 'pick', 'scrap-rail', 'slag',
  ]);
  for (const prop of Object.keys(sceneStats.objectCounts) as Array<keyof typeof sceneStats.objectCounts>) {
    assert.ok(sceneStats.objectCounts[prop] >= 4, prop);
  }
  assert.deepEqual(Object.keys(sceneStats.areaCounts).sort(), ['east-workface', 'entry', 'river-camp', 'west-workface']);
  for (const area of Object.keys(sceneStats.areaCounts) as Array<keyof typeof sceneStats.areaCounts>) {
    assert.ok(sceneStats.areaCounts[area] >= 14, area);
  }
  assert.ok(scene.pieces.some(piece => piece.id.includes('/pick-') && piece.id.includes('/head-')));
  assert.ok(scene.pieces.some(piece => piece.id.includes('/chisel-') && piece.id.includes('/tip-')));
  assert.ok(scene.pieces.some(piece => piece.id.includes('/scrap-rail-') && piece.id.includes('/bent-plate-')));
  assert.ok(scene.pieces.some(piece => piece.id.includes('/crate-') && piece.id.includes('/corner-')));
  assert.equal(sceneStats.floorChangeCount, 0);
  assert.equal(sceneStats.collisionCount, 0);
  assert.equal(sceneStats.authorityChangeCount, 0);
  assert.equal(sceneStats.inventoryCount, 0);
  assert.equal(sceneStats.textCount, 0);
  assert.equal('pickup' in scene, false);
  assert.equal('inventory' in scene, false);
  assert.equal(scene.group.children.some(child => child instanceof PointLight), false);
  dispose(scene);
  dispose(scene);
});

test('every camp-life entity passes the C2 box guard and preserves routes, wing doors, fires and workface centres', () => {
  const scene = buildC2SecondMineCampLife();
  const reserved = [secondMineAnchors.supportCamp, secondMineAnchors.riverCamp,
    secondMineDrySites.workfaceWest, secondMineDrySites.workfaceEast];
  for (const piece of scene.pieces) {
    assert.equal(c2SecondMineBoxAllowed(piece), true, piece.id);
    assert.ok(piece.y - piece.h / 2 >= 0, `${piece.id} must not replace floor geometry`);
    for (const centre of reserved) {
      assert.ok(pointBoxDistance(centre.east, centre.north, piece) >= 1.95,
        `${piece.id} encroaches on ${centre.east}/${centre.north}`);
    }
  }
  for (const [east, north] of [[0, 20], [0, 112], [51.5, 137], [51.5, 159], [0, 190]] as const) {
    assert.ok(scene.pieces.every(piece => pointBoxDistance(east, north, piece) >= .72));
  }
  for (const [east, north] of [[-4, 47], [4, 79], [-48, 171], [48, 174]] as const) {
    assert.ok(scene.pieces.every(piece => pointBoxDistance(east, north, piece) >= .72));
  }
  scene.dispose();
});

test('camp-life uses six instanced 16px Nearest material families and disposes shared resources exactly once', () => {
  const owner = new Group();
  const retained = new Group();
  retained.name = 'host-retained';
  owner.add(retained);
  const scene = buildC2SecondMineCampLife(owner);
  assert.equal(owner.children[1], scene.group);
  assert.equal(scene.meshes.length, 6);
  assert.equal(scene.stats().drawCount, 6);
  assert.equal(scene.stats().triangleCount, scene.pieces.length * 12);
  for (const mesh of scene.meshes) {
    assert.ok(mesh instanceof InstancedMesh);
    assert.ok(mesh.name.startsWith(c2SecondMineCampLifePrefix));
    const material = mesh.material as MeshLambertMaterial;
    assert.ok(material instanceof MeshLambertMaterial);
    assert.equal(material.side, FrontSide);
    assert.equal(mesh.instanceMatrix.usage, StaticDrawUsage);
    assert.ok(material.map);
    assert.equal(material.map.image.width, 16);
    assert.equal(material.map.image.height, 16);
    assert.equal(material.map.minFilter, NearestFilter);
    assert.equal(material.map.magFilter, NearestFilter);
    assert.equal(material.map.generateMipmaps, false);
    assert.equal(material.emissiveIntensity, 1, 'no cold healing flame or added camp light');
  }

  const resources = new Set<EventDispatcher>();
  for (const mesh of scene.meshes) {
    const material = mesh.material as MeshLambertMaterial;
    resources.add(mesh);
    resources.add(mesh.geometry);
    resources.add(material);
    resources.add(material.map!);
  }
  const disposed = new Map<EventDispatcher, number>();
  for (const resource of resources) {
    (resource as unknown as { addEventListener(type: 'dispose', listener: () => void): void })
      .addEventListener('dispose', () => {
        disposed.set(resource, (disposed.get(resource) ?? 0) + 1);
      });
  }
  const stats = scene.stats();
  scene.dispose();
  scene.dispose();
  assert.equal(scene.group.parent, null);
  assert.equal(scene.group.children.length, 0);
  assert.deepEqual(owner.children, [retained]);
  assert.equal(scene.stats(), stats);
  for (const resource of resources) assert.equal(disposed.get(resource), 1);
});
