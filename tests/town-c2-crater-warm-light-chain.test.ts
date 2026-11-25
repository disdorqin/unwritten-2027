import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Group, InstancedMesh, MeshLambertMaterial, NearestFilter, NoColorSpace, PointLight, type EventDispatcher,
} from 'three';
import {
  createMeteorCrater, meteorCraterDepth, meteorCraterFixturePlan, meteorCraterFloorRadius,
} from '../tools/voxel-tavern/town-blockout/meteor-crater.js';
import { createTerrainGrid, worldBounds } from '../tools/voxel-tavern/town-blockout/terrain.js';
import { mountWestCraterRoad } from '../tools/voxel-tavern/town-blockout/town-za22-crater-road.js';
import {
  craterWarmLightColor, craterWarmLightPrefix, mountCraterWarmLightChain,
  surveyCraterWarmLightChain,
} from '../tools/voxel-tavern/town-blockout/town-c2-crater-warm-light-chain.js';

const terrain = createMeteorCrater(meteorCraterFixturePlan);
const anchor = { east: -120, north: 185, rimHeight: 14, yaw: .317 };
const road = {
  anchor,
  lip: (() => {
    const point = terrain.mainTrailPoint(0);
    const c = Math.cos(anchor.yaw), s = Math.sin(anchor.yaw);
    return {
      east: anchor.east + point.east * c + point.north * s,
      north: anchor.north + point.north * c - point.east * s,
      height: anchor.rimHeight,
    };
  })(),
  heightAt(east: number, north: number) {
    const dx = east - anchor.east, dn = north - anchor.north;
    const c = Math.cos(anchor.yaw), s = Math.sin(anchor.yaw);
    const localEast = dx * c - dn * s, localNorth = dx * s + dn * c;
    return anchor.rimHeight + (terrain.heightOffsetAt(localEast, localNorth) ?? 0);
  },
};

test('批95节点按门房、正门、十盏坑沿、两盏集结地、绞盘、井口顺序组成完整链', () => {
  const sites = surveyCraterWarmLightChain(road);
  const owner = new Group();
  const chain = mountCraterWarmLightChain(owner, sites);
  assert.deepEqual(chain.data.order, [
    'gatehouse', 'front-gate',
    'rim-01', 'rim-02', 'rim-03', 'rim-04', 'rim-05',
    'rim-06', 'rim-07', 'rim-08', 'rim-09', 'rim-10',
    'camp-1', 'camp-2', 'winch', 'wellhead',
  ]);
  assert.deepEqual(chain.data.roleCounts, {
    gatehouse: 1, 'front-gate': 1, rim: 10, camp: 2, winch: 1, wellhead: 1,
  });
  assert.equal(chain.data.lampCount, 16);
  assert.equal(chain.lights.length, 6);
  assert.equal(chain.data.realLightCount, 6);
  assert.equal(chain.data.pieceCount, 16 * 20);
  assert.equal(chain.data.triangleCount, 16 * 20 * 12);
  assert.ok(chain.data.materialFamilyCount >= 3);
  for (const site of sites) assert.equal(site.footHeight, road.heightAt(site.east, site.north), site.id);
  chain.dispose();
});

test('十盏坑沿灯相邻弧距为30m量级，坑底只有绞盘与井口两盏暖灯', () => {
  const chain = mountCraterWarmLightChain(new Group(), surveyCraterWarmLightChain(road));
  const rim = chain.data.nodes.filter(node => node.role === 'rim');
  assert.equal(rim.length, 10);
  for (let index = 1; index < rim.length; index++) {
    const spacing = Math.hypot(rim[index]!.east - rim[index - 1]!.east, rim[index]!.north - rim[index - 1]!.north);
    assert.ok(Math.abs(spacing - 30) <= 3, `rim spacing ${spacing}`);
  }
  assert.ok(Math.abs(chain.data.rimSpacingM - 30) <= 3);

  const floor = chain.data.nodes.filter(node => node.role === 'winch' || node.role === 'wellhead');
  assert.deepEqual(floor.map(node => node.role), ['winch', 'wellhead']);
  assert.equal(floor.length, 2);
  const c = Math.cos(anchor.yaw), s = Math.sin(anchor.yaw);
  for (const node of floor) {
    const dx = node.east - anchor.east, dn = node.north - anchor.north;
    assert.ok(Math.hypot(dx * c - dn * s, dx * s + dn * c) < meteorCraterFloorRadius);
    assert.equal(node.footHeight, anchor.rimHeight - meteorCraterDepth);
  }
  chain.dispose();
});

test('实体灯具备六族16px像素材质、完整五金与真实#e08a3c夜灯', () => {
  const owner = new Group();
  const chain = mountCraterWarmLightChain(owner, surveyCraterWarmLightChain(road));
  assert.equal(chain.meshes.length, 6);
  assert.equal(chain.data.drawCount, 6);
  assert.equal(owner.children[0], chain.group);
  const suffixes = ['foot', 'plinth', 'shaft', 'lamp-base', 'light-core', 'roof', 'top-cap', 'snow-cap'];
  for (const node of chain.data.nodes) {
    for (const suffix of suffixes) assert.ok(chain.data.pieceIds.includes(`${node.id}/${suffix}`), `${node.id}/${suffix}`);
    const light = chain.lights.find(item => item.name === `${craterWarmLightPrefix}${node.id}/source`);
    if (chain.data.realLightIds.includes(node.id)) {
      assert.ok(light instanceof PointLight, node.id);
      assert.equal(light.color.getHex(), craterWarmLightColor);
      assert.deepEqual(light.position.toArray(), [node.east, node.bulbHeight, -node.north]);
    } else {
      assert.equal(light, undefined, node.id + ' keeps emissive-only presentation');
    }
  }
  for (const mesh of chain.meshes) assert.ok(mesh instanceof InstancedMesh);
  const materials = new Map(chain.meshes.map(mesh => [
    (mesh.material as MeshLambertMaterial).userData.materialFamily, mesh.material as MeshLambertMaterial,
  ]));
  assert.deepEqual([...materials.keys()], ['stone', 'timber', 'worn-iron', 'brass', 'amber', 'frost']);
  for (const material of materials.values()) {
    assert.ok(material.map);
    assert.equal(material.map.image.width, 16);
    assert.equal(material.map.image.height, 16);
    assert.equal(material.map.minFilter, NearestFilter);
    assert.equal(material.map.magFilter, NearestFilter);
    assert.equal(material.map.generateMipmaps, false);
  }
  const timber = materials.get('timber')!.map!.image.data as Uint8Array;
  const iron = materials.get('worn-iron')!.map!.image.data as Uint8Array;
  const brass = materials.get('brass')!.map!.image.data as Uint8Array;
  const pixel = (data: Uint8Array, x: number, y: number) => [...data.slice((y * 16 + x) * 4, (y * 16 + x) * 4 + 3)];
  assert.deepEqual(pixel(timber, 2, 2), pixel(timber, 2, 3), 'timber fibres continue vertically');
  assert.notDeepEqual(pixel(timber, 2, 2), pixel(timber, 3, 2), 'adjacent timber fibres differ');
  assert.notDeepEqual([...timber], [...iron], 'forged iron does not reuse the timber grain');
  assert.notDeepEqual([...iron], [...brass], 'worn iron and brass keep distinct wear');
  const ironColors = new Set<string>();
  for (let index = 0; index < iron.length; index += 4) ironColors.add(`${iron[index]},${iron[index + 1]},${iron[index + 2]}`);
  assert.ok(ironColors.size >= 4, 'iron keeps pit, base, edge and scratch tones');

  const amber = materials.get('amber')!;
  assert.equal(amber.color.getHex(), 0xffffff, 'diffuse tint does not shift the authored amber texels');
  assert.equal(amber.emissive.getHex(), craterWarmLightColor);
  assert.equal(amber.emissiveIntensity, .04);
  assert.ok(amber.emissiveMap);
  assert.equal(amber.emissiveMap.image.width, 16);
  assert.equal(amber.emissiveMap.image.height, 16);
  assert.equal(amber.emissiveMap.minFilter, NearestFilter);
  assert.equal(amber.emissiveMap.magFilter, NearestFilter);
  assert.equal(amber.emissiveMap.generateMipmaps, false);
  assert.equal(amber.emissiveMap.colorSpace, NoColorSpace);
  const glow = amber.emissiveMap.image.data as Uint8Array;
  const luminance = (x: number, y: number) => glow[(y * 16 + x) * 4]!;
  assert.ok(luminance(7, 7) > luminance(4, 7));
  assert.ok(luminance(4, 7) > luminance(3, 7));
  assert.ok(luminance(3, 7) > luminance(0, 0), 'shade rim, pane and core form distinct night layers');
  assert.ok(pixel(amber.map!.image.data as Uint8Array, 7, 7).every((value, index) => value === [0xff, 0xdf, 0xa1][index]));

  assert.equal(chain.isNightLit, false);
  assert.equal(chain.lights.filter(light => light.visible).length, 0);
  chain.setNight(true);
  assert.equal(chain.isNightLit, true);
  assert.equal(chain.lights.filter(light => light.visible).length, 6);
  assert.equal(amber.emissiveIntensity, 1.65);
  chain.setNight(false);
  assert.equal(chain.lights.filter(light => light.visible).length, 0);
  assert.equal(amber.emissiveIntensity, .04);
  chain.dispose();
});

test('setNight同值早退，不重复点亮或改写发光材质', () => {
  const chain = mountCraterWarmLightChain(new Group(), surveyCraterWarmLightChain(road));
  const amber = chain.meshes.find(mesh =>
    (mesh.material as MeshLambertMaterial).userData.materialFamily === 'amber')!.material as MeshLambertMaterial;
  let lightWrites = 0;
  let materialWrites = 0;
  for (const light of chain.lights) {
    let visible = light.visible;
    Object.defineProperty(light, 'visible', {
      configurable: true,
      get: () => visible,
      set: (value: boolean) => { lightWrites++; visible = value; },
    });
  }
  let intensity = amber.emissiveIntensity;
  Object.defineProperty(amber, 'emissiveIntensity', {
    configurable: true,
    get: () => intensity,
    set: (value: number) => { materialWrites++; intensity = value; },
  });
  chain.setNight(false);
  assert.deepEqual([lightWrites, materialWrites], [0, 0]);
  chain.setNight(true);
  assert.deepEqual([lightWrites, materialWrites], [6, 1]);
  chain.setNight(true);
  assert.deepEqual([lightWrites, materialWrites], [6, 1]);
  chain.setNight(false);
  assert.deepEqual([lightWrites, materialWrites], [12, 2]);
  chain.setNight(false);
  assert.deepEqual([lightWrites, materialWrites], [12, 2]);
  chain.dispose();
});

test('survey and mount are wired through the real ZA-22 return object without touching the legacy six lamps', () => {
  const terrain = createTerrainGrid();
  const road = mountWestCraterRoad(worldBounds.depth, north => terrain.groundHeightAt(0, north));
  const sites = surveyCraterWarmLightChain(road);
  assert.equal(sites.length, 16);
  assert.equal(road.warmLightChain.data.lampCount, 16);
  assert.equal(road.warmLightChain.group.parent, road.group);
  for (const site of sites) assert.equal(site.footHeight, road.heightAt(site.east, site.north), site.id);
  assert.equal(road.group.getObjectsByProperty('name', 'town-c2-crater-warm-light-chain').length, 1);
  const colliders = road.group.userData.colliders;
  const floors = road.group.userData.floors;
  const ramps = road.group.userData.ramps;
  const hostKeys = Object.keys(road.group.userData).sort();
  const legacyLights = road.group.getObjectByName('c2-physical-worklights-authority-free');
  assert.ok(legacyLights);
  assert.equal(legacyLights.children.filter(child => child instanceof PointLight).length, 6);
  const legacyPointLights = legacyLights.children.filter((child): child is PointLight => child instanceof PointLight);
  const legacySnapshot = legacyPointLights.map(light => ({
    name: light.name, visible: light.visible, intensity: light.intensity,
    color: light.color.getHex(), position: light.position.toArray(),
  }));
  road.warmLightChain.setNight(true);
  road.warmLightChain.setNight(false);
  assert.equal(road.group.userData.colliders, colliders);
  assert.equal(road.group.userData.floors, floors);
  assert.equal(road.group.userData.ramps, ramps);
  assert.deepEqual(Object.keys(road.group.userData).sort(), hostKeys);
  assert.deepEqual(legacyLights.children.filter((child): child is PointLight => child instanceof PointLight).map(light => ({
    name: light.name, visible: light.visible, intensity: light.intensity,
    color: light.color.getHex(), position: light.position.toArray(),
  })), legacySnapshot);
});

test('换挂不读取或改写宿主已有六灯，dispose仅释放本链资源且可重复调用', () => {
  const owner = new Group();
  const hostLights = Array.from({ length: 6 }, (_, index) => {
    const light = new PointLight(0x8899aa, 2, 4, 2);
    light.name = `host-existing-light-${index}`;
    light.visible = false;
    owner.add(light);
    return light;
  });
  const chain = mountCraterWarmLightChain(owner, surveyCraterWarmLightChain(road));
  chain.setNight(true);
  assert.ok(hostLights.every(light => !light.visible && light.intensity === 2 && light.color.getHex() === 0x8899aa));
  assert.equal(chain.group.children.filter(child => child instanceof PointLight).length, 6);
  assert.ok(chain.lights.every(light => light.name.startsWith(craterWarmLightPrefix)));

  const resources = new Set<EventDispatcher>();
  for (const mesh of chain.meshes) {
    resources.add(mesh);
    resources.add(mesh.geometry);
    resources.add(mesh.material as MeshLambertMaterial);
    const material = mesh.material as MeshLambertMaterial;
    resources.add(material.map!);
    if (material.emissiveMap) resources.add(material.emissiveMap);
  }
  const disposed = new Map<EventDispatcher, number>();
  for (const resource of resources) {
    (resource as unknown as { addEventListener(type: 'dispose', listener: () => void): void })
      .addEventListener('dispose', () => {
        disposed.set(resource, (disposed.get(resource) ?? 0) + 1);
      });
  }
  chain.dispose();
  chain.dispose();
  assert.equal(chain.group.parent, null);
  assert.deepEqual(owner.children, hostLights);
  for (const resource of resources) assert.equal(disposed.get(resource), 1);
  chain.setNight(false);
  assert.ok(hostLights.every(light => !light.visible && light.intensity === 2));
});
