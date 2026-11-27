import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DataTexture, Group, InstancedMesh, Mesh, MeshBasicMaterial, NearestFilter,
  PointLight, Texture,
} from 'three';
import {
  createTownC2R30Ferry, mountTownC2R30Ferry, townC2R30FerryPalette,
} from '../tools/voxel-tavern/town-blockout/town-c2-r30-ferry.js';
import {
  secondMineAnchors, secondMineBed, secondMineFloor, canStandSecondMine,
  type MineRiverState,
} from '../src/shared/underground-second-mine-layout.js';

function positionAt(ferry: ReturnType<typeof mountTownC2R30Ferry>) {
  return ferry.stats().position;
}

function visibleNotice(ferry: ReturnType<typeof mountTownC2R30Ferry>) {
  return ferry.group.getObjectByName('town-c2-r30-ferry/pier-notices')!.children.map(sign =>
    sign.children.filter(child => child.name === '停渡' || child.name === '搁浅')
      .filter(child => child.visible).map(child => child.name));
}

test('C2-R01 is an independent local-ENY Group using the registered piers and single-pole-ferry silhouette', () => {
  const parent = new Group();
  const ferry = createTownC2R30Ferry({ parent });
  assert.equal(ferry.group.parent, parent);
  assert.equal(ferry.group.position.length(), 0, 'host supplies the existing second-mine frame');
  assert.equal(ferry.group.userData.coordinateFrame, 'local-ENY');
  assert.equal(ferry.group.userData.visualOnly, true);
  assert.equal(ferry.group.userData.localOnly, true);
  assert.equal(ferry.group.userData.serverAuthority, false);
  assert.equal(ferry.group.userData.domainRegistered, undefined);
  assert.ok(ferry.group.getObjectByName('single-pole-ferry') instanceof Group);
  assert.ok(ferry.group.getObjectByName('single-pole-ferry/single-pole') instanceof Mesh);

  assert.equal(ferry.sync('low').notice, '搁浅');
  assert.deepEqual(visibleNotice(ferry), [['搁浅'], ['搁浅']]);
  const stats = ferry.sync('middle');
  assert.equal(stats.state, 'near-docked');
  assert.equal(stats.available, true);
  assert.deepEqual(stats.position, {
    east: secondMineAnchors.nearPier.east,
    north: secondMineAnchors.nearPier.north,
    height: -.18,
  });
  assert.deepEqual(visibleNotice(ferry), [[], []]);
  assert.equal(stats.visualOnly, true);
  assert.equal(stats.colliderCount, 0);
  assert.ok(stats.realLightCount <= 1);
  ferry.dispose();
  assert.equal(parent.children.length, 0);
});

test('C2-R01 middle water supports a complete local board/pole/travel/disembark round trip', () => {
  const ferry = mountTownC2R30Ferry();
  ferry.sync('middle');
  assert.equal(ferry.board(), true);
  assert.equal(ferry.stats().state, 'near-boarded');
  assert.equal(ferry.pole(), true);
  assert.equal(ferry.stats().state, 'near-ready');
  assert.equal(ferry.travel(), true);
  assert.equal(ferry.stats().state, 'traveling-to-far');
  assert.equal(ferry.update(3), true);
  assert.deepEqual(positionAt(ferry), { east: 0, north: 137, height: -.18 });
  assert.equal(ferry.stats().travelProgress, .5);
  assert.equal(ferry.disembark(), false, 'cannot leave a moving boat');
  assert.equal(ferry.update(3), true);
  assert.equal(ferry.stats().state, 'far-boarded');
  assert.deepEqual(positionAt(ferry), {
    east: secondMineAnchors.farPier.east,
    north: secondMineAnchors.farPier.north,
    height: -.18,
  });
  assert.equal(ferry.disembark(), true);
  assert.equal(ferry.stats().state, 'far-docked');

  assert.equal(ferry.board(), true);
  assert.equal(ferry.pole(), true);
  assert.equal(ferry.travel(), true);
  assert.equal(ferry.sync('middle').state, 'traveling-to-near', 'routine sync does not reset the trip');
  assert.equal(ferry.update(6), true);
  assert.equal(ferry.stats().state, 'near-boarded');
  assert.deepEqual(positionAt(ferry), {
    east: secondMineAnchors.nearPier.east,
    north: secondMineAnchors.nearPier.north,
    height: -.18,
  });
  assert.equal(ferry.disembark(), true);
  assert.equal(ferry.stats().state, 'near-docked');
  assert.equal(ferry.stats().travelProgress, 1);
  ferry.dispose();
});

test('C2-R01 rejects high/low service and malformed levels without retaining passenger state', () => {
  const ferry = mountTownC2R30Ferry();
  ferry.sync('middle');
  ferry.board();
  ferry.pole();
  ferry.travel();
  ferry.update(2);

  const high = ferry.sync('high');
  assert.equal(high.state, 'stopped');
  assert.equal(high.available, false);
  assert.equal(high.notice, '停渡');
  assert.deepEqual(visibleNotice(ferry), [['停渡'], ['停渡']]);
  assert.equal(ferry.board(), false);
  assert.equal(ferry.pole(), false);
  assert.equal(ferry.travel(), false);
  assert.equal(ferry.disembark(), false);
  assert.equal(ferry.update(6), false);

  const low = ferry.sync('low');
  assert.equal(low.state, 'grounded');
  assert.equal(low.notice, '搁浅');
  assert.equal(low.position.north, 137);
  assert.equal(low.position.height, -.52 + secondMineBed(137));
  assert.deepEqual(visibleNotice(ferry), [['搁浅'], ['搁浅']]);
  assert.equal(ferry.board(), false);
  assert.equal(ferry.sync('middle').state, 'near-docked', 'reopening starts a fresh local trip');

  ferry.sync('middle');
  const malformed = ferry.sync('server-authoritative' as MineRiverState);
  assert.equal(malformed.available, false);
  assert.equal(malformed.state, 'stopped');
  assert.equal(malformed.notice, '停渡');
  assert.equal(ferry.board(), false, 'malformed data fails closed');
  ferry.dispose();
});

test('C2-R01 rejects out-of-order and non-local inputs; state changes grant no host capability', () => {
  const ferry = mountTownC2R30Ferry();
  ferry.sync('middle');
  assert.equal(ferry.pole(), false);
  assert.equal(ferry.travel(), false);
  assert.equal(ferry.disembark(), false);
  assert.equal(ferry.board(), true);
  assert.equal(ferry.board(), false);
  assert.equal(ferry.travel(), false, 'travel requires a local pole action');
  assert.equal(ferry.disembark(), true);
  assert.equal(ferry.pole(), false);

  for (const input of [null, true, 1, 'local', {}, { source: 'remote' }, { authority: 'server' }]) {
    assert.equal(ferry.board(input), false);
    assert.equal(ferry.pole(input), false);
    assert.equal(ferry.travel(input), false);
    assert.equal(ferry.disembark(input), false);
  }
  assert.equal(ferry.stats().state, 'near-docked');
  assert.equal('passageAt' in ferry, false);
  assert.equal('canStand' in ferry, false);
  assert.equal('floor' in ferry, false);
  assert.equal('send' in ferry, false);
  assert.equal('register' in ferry, false);
  assert.equal(ferry.update(NaN), false);
  assert.equal(ferry.update(-1), false);
  assert.equal(ferry.update(Infinity), false);
  ferry.dispose();
});

test('C2-R01 never turns the river into walking support or changes the all-water dry bypass', () => {
  const ferry = mountTownC2R30Ferry();
  const route = [secondMineAnchors.entry, ...secondMineAnchors.bypass, secondMineAnchors.exit];
  const bypassSamples = route.flatMap((point, index) => {
    if (index === 0) return [point];
    const previous = route[index - 1]!;
    return Array.from({ length: 21 }, (_, step) => ({
      east: previous.east + (point.east - previous.east) * step / 20,
      north: previous.north + (point.north - previous.north) * step / 20,
    }));
  });
  for (const level of ['high', 'middle', 'low'] as const) {
    ferry.sync(level);
    for (const point of bypassSamples) {
      assert.equal(secondMineFloor(point.east, point.north, level), 0);
      assert.equal(canStandSecondMine(point.east, point.north, level), true);
    }
    for (let north = 129; north <= 145; north++) {
      assert.equal(secondMineFloor(0, north, level), level === 'low' ? secondMineBed(north) : undefined);
      assert.equal(canStandSecondMine(0, north, level), level === 'low');
    }
    if (level === 'middle') {
      ferry.board(); ferry.pole(); ferry.travel(); ferry.update(3);
      assert.equal(secondMineFloor(0, 137, level), undefined, 'visual ferry position is not a floor');
      assert.equal(canStandSecondMine(0, 137, level), false);
    }
  }
  ferry.dispose();
});

test('C2-R01 boat and pole use exactly the nine-colour 16px Nearest palette and at most one real light', () => {
  const ferry = mountTownC2R30Ferry();
  const maps = new Set<DataTexture>();
  ferry.group.traverse(object => {
    if (!(object instanceof Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material.map instanceof DataTexture) maps.add(material.map);
    }
  });
  assert.equal(maps.size, 5);
  const palette = new Set<number>(townC2R30FerryPalette);
  const used = new Set<number>();
  for (const map of maps) {
    assert.equal(map.image.width, 16);
    assert.equal(map.image.height, 16);
    assert.equal(map.minFilter, NearestFilter);
    assert.equal(map.magFilter, NearestFilter);
    assert.equal(map.generateMipmaps, false);
    const pixels = map.image.data as Uint8Array;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] === 0) continue;
      const color = (pixels[index]! << 16) | (pixels[index + 1]! << 8) | pixels[index + 2]!;
      assert.ok(palette.has(color), `unexpected palette colour ${color.toString(16)}`);
      used.add(color);
    }
  }
  assert.deepEqual([...used].sort((a, b) => a - b), [...palette].sort((a, b) => a - b));
  let lights = 0;
  ferry.group.traverse(object => { if (object instanceof PointLight) lights++; });
  assert.equal(lights, 1);
  assert.equal(ferry.stats().realLightCount, 1);
  assert.equal(ferry.stats().colliderCount, 0);
  ferry.dispose();
});

test('C2-R01 dispose is idempotent and releases every owned GPU resource exactly once', () => {
  const parent = new Group();
  const ferry = mountTownC2R30Ferry({ parent });
  ferry.sync('middle');
  ferry.board();
  const resources = new Set<{ dispose(): void }>();
  ferry.group.traverse(object => {
    if (!(object instanceof Mesh)) return;
    resources.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      resources.add(material);
      if (material instanceof MeshBasicMaterial && material.map instanceof Texture) resources.add(material.map);
      if ('map' in material && material.map instanceof Texture) resources.add(material.map);
    }
    if (object instanceof InstancedMesh) resources.add(object);
  });
  const lamp = ferry.group.getObjectByName('single-pole-ferry/only-real-light');
  assert.ok(lamp instanceof PointLight);
  resources.add(lamp);
  const counts = new Map<{ dispose(): void }, number>();
  for (const resource of resources) {
    counts.set(resource, 0);
    const dispose = resource.dispose.bind(resource);
    resource.dispose = () => { counts.set(resource, counts.get(resource)! + 1); dispose(); };
  }
  ferry.dispose();
  ferry.dispose();
  for (const [resource, count] of counts) {
    const label = ('name' in resource && resource.name) || ('type' in resource && resource.type) || 'resource';
    assert.equal(count, 1, String(label));
  }
  assert.equal(ferry.group.parent, null);
  assert.equal(ferry.group.children.length, 0);
  assert.equal(parent.children.length, 0);
  assert.equal(ferry.stats().disposed, true);
  assert.equal(ferry.stats().visualOnly, true);
  assert.equal(ferry.sync('middle').disposed, true);
  assert.equal(ferry.board(), false);
  assert.equal(ferry.pole(), false);
  assert.equal(ferry.travel(), false);
  assert.equal(ferry.disembark(), false);
  assert.equal(ferry.update(6), false);
});
