import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DataTexture, FrontSide, Group, InstancedMesh, Light, Material, MeshLambertMaterial,
  NearestFilter, StaticDrawUsage,
} from 'three';
import {
  canStandSecondMine, secondMineAnchors, secondMineRiver,
} from '../src/shared/underground-second-mine-layout.js';
import { secondMineDrySites } from '../src/shared/underground-second-mine-dry-wings.js';
import { c2SecondMineBoxAllowed } from '../tools/voxel-tavern/town-blockout/town-c2-second-mine-contract.js';
import {
  buildTownC2R30Enclosure, c2R30EnclosureBoxAllowed, c2R30EnclosurePalette,
  c2R30EnclosureRooms, c2R30EnclosureWalls, c2R30EnclosureWestRailSegments,
  type C2R30EnclosureFamily, type C2R30EnclosurePart,
} from '../tools/voxel-tavern/town-blockout/town-c2-r30-enclosure.js';

const box = (x: number, n: number, w = 1, d = 1, h = 1, y = 0) =>
  ({ x, y, n, w, h, d });

function containsXZ(part: C2R30EnclosurePart, x: number, n: number) {
  const epsilon = 1e-7;
  return x >= part.x - part.w / 2 - epsilon && x <= part.x + part.w / 2 + epsilon &&
    n >= part.n - part.d / 2 - epsilon && n <= part.n + part.d / 2 + epsilon;
}

function containsHeight(part: C2R30EnclosurePart, y: number) {
  return y >= part.y - part.h / 2 - 1e-7 && y <= part.y + part.h / 2 + 1e-7;
}

function sampleSegment(a: readonly [number, number], b: readonly [number, number],
  visit: (x: number, n: number) => void) {
  const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / .25));
  for (let index = 0; index <= steps; index++) {
    const t = index / steps;
    visit(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
  }
}

function routePoints() {
  const route: readonly (readonly [number, number])[] = [
    [secondMineAnchors.entry.east, secondMineAnchors.entry.north],
    [0, 112],
    ...secondMineAnchors.bypass.map(point => [point.east, point.north] as const),
    [secondMineAnchors.exit.east, secondMineAnchors.exit.north],
  ];
  // Dry-land points must stay standable at every water level: the bypass and
  // both pier banks are the all-weather walking network.
  const standing: [number, number][] = [];
  for (let index = 1; index < route.length; index++) {
    sampleSegment(route[index - 1]!, route[index]!, (x, n) => standing.push([x, n]));
  }
  for (const pier of [secondMineAnchors.nearPier, secondMineAnchors.farPier]) {
    standing.push([pier.east, pier.north]);
  }
  for (const centre of [secondMineDrySites.workfaceWest, secondMineDrySites.workfaceEast,
    secondMineDrySites.collapse, secondMineDrySites.barracks]) {
    standing.push([centre.east, centre.north]);
  }
  // The crossing itself is a ferry path, not a walking path: at middle/high
  // water the river surface is no support. Sample it only to prove no
  // player-height collider was dropped into the ferry lane.
  const crossing: [number, number][] = [];
  sampleSegment([secondMineAnchors.nearPier.east, secondMineAnchors.nearPier.north],
    [secondMineAnchors.farPier.east, secondMineAnchors.farPier.north],
    (x, n) => crossing.push([x, n]));
  return { standing, crossing, all: [...standing, ...crossing] };
}

test('C2 R30 closes every surveyed roof and wall run without changing the room envelope', () => {
  const scene = buildTownC2R30Enclosure();
  try {
    assert.equal(scene.group.position.length(), 0);
    assert.equal(scene.group.rotation.y, 0);
    assert.equal(scene.group.userData.coordinateFrame, 'second-mine-local-east-up-north');
    assert.equal(scene.stats().roomCount, c2R30EnclosureRooms.length);

    for (const room of c2R30EnclosureRooms) {
      for (let x = room.x0 + .35; x < room.x1; x += 1.7) {
        for (let n = room.n0 + .35; n < room.n1; n += 1.7) {
          const roof = scene.boxes.find(part => part.role === 'ceiling' &&
            containsXZ(part, x, n) && part.y - part.h / 2 <= room.ceiling + 1e-7);
          assert.ok(roof, `${room.id} roof leak at ${x}/${n}`);
        }
      }
      if (room.floor) {
        for (let x = room.x0 + .35; x < room.x1; x += 1.7) {
          for (let n = room.n0 + .35; n < room.n1; n += 1.7) {
            const floor = scene.boxes.find(part => part.role === 'floor' &&
              containsXZ(part, x, n) && Math.abs(part.y + part.h / 2 + .02) < 1e-7);
            assert.ok(floor, `${room.id} floor seam at ${x}/${n}`);
          }
        }
      }
    }

    for (const wall of c2R30EnclosureWalls) {
      for (let cursor = wall.start + .1; cursor < wall.end; cursor += .5) {
        const x = wall.axis === 'x' ? wall.fixed : cursor;
        const n = wall.axis === 'x' ? cursor : wall.fixed;
        for (const y of [.6, Math.min(2.6, wall.ceiling - .2)]) {
          assert.ok(scene.boxes.some(part => part.role === 'wall' &&
            containsXZ(part, x, n) && containsHeight(part, y)),
            `${wall.id} wall leak at ${x}/${n}/${y}`);
        }
      }
    }
    assert.equal(scene.boxes.some(part => part.role === 'floor' &&
      overlapsRiver(part)), false, 'enclosure floor entered the river');
  } finally {
    scene.dispose();
  }
});

function overlapsRiver(part: C2R30EnclosurePart) {
  return part.x + part.w / 2 > secondMineRiver.x0 &&
    part.x - part.w / 2 < secondMineRiver.x1 &&
    part.n + part.d / 2 > secondMineRiver.n0 &&
    part.n - part.d / 2 < secondMineRiver.n1;
}

test('C2 R30 uses one frozen visible/collider source and every part passes the strengthened guard', () => {
  const scene = buildTownC2R30Enclosure();
  try {
    assert.equal(scene.colliders, scene.boxes);
    assert.equal(scene.group.userData.colliders, scene.colliders);
    assert.equal(scene.stats().pieceCount, scene.boxes.length);
    assert.equal(scene.stats().colliderCount, scene.boxes.length);
    for (const part of scene.boxes) {
      assert.equal(c2R30EnclosureBoxAllowed(part), true, `${part.id} failed strict guard`);
      assert.equal(Object.isFrozen(part), true);
      const bottom = part.y - part.h / 2, top = part.y + part.h / 2;
      if (bottom >= 3.35 - 1e-9 || top <= -.02 + 1e-9) continue;
      assert.equal(c2SecondMineBoxAllowed(part, .45), true,
        `${part.id} low solid bypassed shared guard`);
    }

    const meshes: InstancedMesh[] = [];
    scene.group.traverse(object => { if (object instanceof InstancedMesh) meshes.push(object); });
    assert.equal(meshes.length, 1);
    assert.equal(meshes[0]!.count, scene.boxes.length);
    const matrix = meshes[0]!.instanceMatrix.array;
    for (const [index, part] of scene.boxes.entries()) {
      const offset = index * 16;
      assert.ok(Math.abs(matrix[offset]! - part.w) < 2e-5);
      assert.ok(Math.abs(matrix[offset + 5]! - part.h) < 2e-5);
      assert.ok(Math.abs(matrix[offset + 10]! - part.d) < 2e-5);
      assert.ok(Math.abs(matrix[offset + 12]! - part.x) < 2e-5);
      assert.ok(Math.abs(matrix[offset + 13]! - part.y) < 2e-5);
      assert.ok(Math.abs(matrix[offset + 14]! + part.n) < 2e-5);
    }
    scene.group.traverse(object => assert.equal(object.matrixAutoUpdate, false));
  } finally {
    scene.dispose();
  }
});

test('C2 R30 guard rejects river, route, bypass-core, door and anchor intrusion', () => {
  assert.equal(c2R30EnclosureBoxAllowed(box(0, 137, 2, 2, 2, 1)), false, 'river volume');
  assert.equal(c2R30EnclosureBoxAllowed(box(0, 137, 2, 2, .6, 11.5)), true, 'high river roof');
  assert.equal(c2R30EnclosureBoxAllowed(box(0, 50, 1, 1, 2, 1)), false, 'main route');
  assert.equal(c2R30EnclosureBoxAllowed(box(51.5, 137, 1, 1, 2, 1)), false, 'bypass route');
  assert.equal(c2R30EnclosureBoxAllowed(box(50, 137, .4, 1, .8, .4)), false, 'bypass core');
  assert.equal(c2R30EnclosureBoxAllowed(box(-4, 47, 1, 1, 2, 1)), false, 'wing door');
  assert.equal(c2R30EnclosureBoxAllowed(box(-24, 48, 1, 1, 2, 1)), false, 'workface anchor');
  assert.equal(c2R30EnclosureBoxAllowed(box(-12, 150, 1, 1, 2, 1)), false, 'camp anchor');
  assert.equal(c2R30EnclosureBoxAllowed(box(0, 50, 1, 1, .3, -.17)), true, 'flush floor is not a step');
  assert.equal(c2R30EnclosureBoxAllowed(box(0, 137, 1, 1, .3, -.17)), false, 'false riverbed');
  assert.equal(c2R30EnclosureBoxAllowed(box(0, 50, 1, 1, .3, -.1)), false, 'raised route floor');
});

test('C2 R30 route and ferry samples stay standable and outside player-height colliders in all water states', () => {
  const scene = buildTownC2R30Enclosure();
  try {
    const { standing, all } = routePoints();
    assert.ok(standing.length > 400 && all.length > 500);
    for (const state of ['high', 'middle', 'low'] as const) {
      for (const [x, n] of standing) {
        assert.equal(canStandSecondMine(x, n, state, .27), true,
          `${state} lost dry-land support at ${x}/${n}`);
      }
      for (const [x, n] of all) {
        for (const collider of scene.colliders) {
          if (collider.y + collider.h / 2 <= 0 || collider.y - collider.h / 2 >= 1.8) continue;
          const dx = Math.max(collider.x - collider.w / 2 - x, 0, x - collider.x - collider.w / 2);
          const dn = Math.max(collider.n - collider.d / 2 - n, 0, n - collider.n - collider.d / 2);
          assert.ok(Math.hypot(dx, dn) >= .27 - 1e-7,
            `${state} collider ${collider.id} blocks ${x}/${n}`);
        }
      }
    }
    assert.equal('canStand' in scene, false);
    assert.equal('floor' in scene, false);
    assert.equal(scene.stats().floorChanges, 0);
    assert.equal(scene.stats().rewards, 0);
  } finally {
    scene.dispose();
  }
});

test('C2 R30 west bypass railing has a post in every bay and leaves both crossings open', () => {
  const scene = buildTownC2R30Enclosure();
  try {
    assert.equal(c2R30EnclosureWestRailSegments.length, 2);
    for (const segment of c2R30EnclosureWestRailSegments) {
      const posts = scene.boxes.filter(part => part.segment === segment.id && part.role === 'post' &&
        Math.abs(part.x - segment.x) < 1e-7 && Math.abs(part.w - .24) < 1e-7)
        .sort((a, b) => a.n - b.n);
      const rails = scene.boxes.filter(part => part.segment === segment.id && part.role === 'rail');
      assert.ok(posts.length >= 4, `${segment.id} lacks posts`);
      assert.ok(rails.length >= (posts.length - 1) * 2, `${segment.id} lacks two rails per bay`);
      assert.ok(Math.abs(posts[0]!.n - segment.n0) < 1e-7);
      assert.ok(Math.abs(posts.at(-1)!.n - segment.n1) < 1e-7);
      for (let index = 1; index < posts.length; index++) {
        const gap = posts[index]!.n - posts[index - 1]!.n;
        assert.ok(gap <= segment.postSpacing + 1e-7, `${segment.id} post gap ${gap}`);
        assert.ok(rails.some(rail => rail.n - rail.d / 2 <= posts[index - 1]!.n + 1e-7 &&
          rail.n + rail.d / 2 >= posts[index]!.n - 1e-7), `${segment.id} has an unrailed bay`);
      }
    }
    assert.equal(scene.boxes.some(part => part.role === 'post' &&
      part.n > 112 && part.n < 114.4), false, 'north crossing was fenced');
    assert.equal(scene.boxes.some(part => part.role === 'post' &&
      part.n > 157.6 && part.n < 164), false, 'south crossing was fenced');
  } finally {
    scene.dispose();
  }
});

test('C2 R30 uses the nine-colour palette, 32px nearest Lambert pixels and at most eight draws', () => {
  const scene = buildTownC2R30Enclosure();
  try {
    const stats = scene.stats();
    assert.equal(Object.keys(c2R30EnclosurePalette).length, 9);
    assert.equal(stats.paletteColorCount, 9);
    assert.equal(stats.textureSize, 32);
    assert.equal(stats.textureFilter, 'nearest');
    assert.equal(stats.shading, 'lambert');
    assert.equal(stats.staticMatrices, true);
    assert.ok(stats.drawCount <= 8);
    for (const family of Object.keys(c2R30EnclosurePalette) as C2R30EnclosureFamily[]) {
      assert.ok(stats.paletteCounts[family] > 0, `${family} is absent from the nine-colour palette`);
    }
    let lights = 0;
    const meshes: InstancedMesh[] = [];
    scene.group.traverse(object => {
      if (object instanceof Light) lights++;
      if (object instanceof InstancedMesh) meshes.push(object);
    });
    assert.equal(lights, 0);
    assert.equal(meshes.length, stats.drawCount);
    for (const mesh of meshes) {
      assert.equal(mesh.instanceMatrix.usage, StaticDrawUsage);
      assert.ok(mesh.material instanceof Material);
      assert.ok(mesh.material instanceof MeshLambertMaterial);
      assert.equal(mesh.material.side, FrontSide);
      assert.equal(mesh.material.flatShading, true);
      assert.equal(mesh.material.color.getHex(), 0xffffff);
      const texture = mesh.material.map;
      assert.ok(texture instanceof DataTexture);
      assert.equal(texture.image.width, 32);
      assert.equal(texture.image.height, 32);
      assert.equal(texture.minFilter, NearestFilter);
      assert.equal(texture.magFilter, NearestFilter);
      assert.equal(texture.generateMipmaps, false);
      const pixels = texture.image.data as Uint8Array;
      const tones = new Set<number>();
      for (let index = 0; index < pixels.length; index += 4) tones.add(pixels[index]!);
      assert.deepEqual([...tones].sort((a, b) => a - b), [42, 58, 74, 90, 106, 122, 138, 154, 170]);
      assert.ok(mesh.instanceColor);
    }
  } finally {
    scene.dispose();
  }
});

test('C2 R30 dispose is idempotent and releases only its owned GPU resources', () => {
  const host = new Group();
  const scene = buildTownC2R30Enclosure();
  host.add(scene.group);
  const mesh = scene.group.children[0] as InstancedMesh;
  const geometry = mesh.geometry, material = mesh.material as MeshLambertMaterial;
  const texture = material.map as DataTexture;
  const disposals = { geometry: 0, material: 0, texture: 0, mesh: 0 };
  geometry.addEventListener('dispose', () => disposals.geometry++);
  material.addEventListener('dispose', () => disposals.material++);
  texture.addEventListener('dispose', () => disposals.texture++);
  mesh.addEventListener('dispose', () => disposals.mesh++);
  scene.dispose();
  scene.dispose();
  assert.equal(scene.group.parent, null);
  assert.equal(host.children.length, 0);
  assert.equal(scene.group.children.length, 0);
  assert.equal(scene.stats().disposed, true);
  assert.equal(scene.stats().visiblePieceCount, 0);
  assert.equal(scene.stats().drawCount, 0);
  assert.deepEqual(disposals, { geometry: 1, material: 1, texture: 1, mesh: 1 });
});
