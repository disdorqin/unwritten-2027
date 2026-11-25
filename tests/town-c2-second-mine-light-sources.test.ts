import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  Color, FrontSide, Group, InstancedMesh, MeshLambertMaterial, NearestFilter, PointLight,
  StaticDrawUsage, type EventDispatcher,
} from 'three';
import { secondMineAnchors } from '../src/shared/underground-second-mine-layout.js';
import { secondMineDrySites } from '../src/shared/underground-second-mine-dry-wings.js';
import { c2SecondMineBoxAllowed } from '../tools/voxel-tavern/town-blockout/town-c2-second-mine-contract.js';
import {
  build, buildC2SecondMineLightSources, c2SecondMineLampColors, c2SecondMineLightBudget,
  c2SecondMineLightPrefix, dispose, setNight, stats,
} from '../tools/voxel-tavern/town-blockout/town-c2-second-mine-light-sources.js';

function pointBoxDistance(east: number, north: number,
  piece: ReturnType<typeof buildC2SecondMineLightSources>['pieces'][number]) {
  return Math.hypot(Math.max(piece.x - piece.w / 2 - east, 0, east - piece.x - piece.w / 2),
    Math.max(piece.n - piece.d / 2 - north, 0, north - piece.n - piece.d / 2));
}

function textureTones(texture: NonNullable<MeshLambertMaterial['map']>) {
  const data = (texture.image as { data: Uint8Array }).data;
  return Array.from({ length: texture.image.width * texture.image.height }, (_, index) => {
    const offset = index * 4;
    return `${data[offset]}/${data[offset + 1]}/${data[offset + 2]}`;
  });
}

test('C2 light sources provide ten visible dock, bypass and workface fixtures but only three real lights', () => {
  assert.equal(build, buildC2SecondMineLightSources);
  const scene = build();
  const sceneStats = scene.stats();
  assert.equal(stats(scene), sceneStats);
  assert.equal(scene.group.position.toArray().every(value => value === 0), true);
  assert.equal(sceneStats.coordinateFrame, 'local-eny');
  assert.equal(sceneStats.fixtureCount, 10);
  assert.equal(scene.emitters.length, 10);
  assert.deepEqual(sceneStats.roleCounts, { dock: 4, bypass: 3, workface: 3 });
  assert.equal(scene.lights.length, c2SecondMineLightBudget.pointLights);
  assert.equal(scene.lights.length, c2SecondMineLightBudget.maxPointLights);
  assert.ok(scene.lights.length <= 3, 'the two existing campfires remain the dominant warm sources');
  assert.equal(sceneStats.pieceCount, 128);
  assert.equal(sceneStats.triangleCount, 128 * 12);
  assert.ok(sceneStats.pieceCount >= 120 && sceneStats.pieceCount <= 140);
  assert.equal(scene.emitters.filter(emitter => emitter.realLight).length, 3);
  assert.deepEqual(scene.emitters.filter(emitter => emitter.realLight).map(emitter => emitter.id), [
    'near-dock-west', 'bypass-middle', 'east-workface',
  ]);
  assert.equal(sceneStats.campfireCount, 0);
  assert.equal(sceneStats.healingFlameCount, 0);
  assert.equal(sceneStats.floorChangeCount, 0);
  assert.equal(sceneStats.collisionCount, 0);
  assert.equal(sceneStats.authorityChangeCount, 0);
  dispose(scene);
  dispose(scene);
});

test('all lamp entities pass the C2 guard without touching routes, wing doors, camp or workface centres', () => {
  const scene = buildC2SecondMineLightSources();
  const reserved = [secondMineAnchors.supportCamp, secondMineAnchors.riverCamp,
    secondMineDrySites.workfaceWest, secondMineDrySites.workfaceEast];
  for (const piece of scene.pieces) {
    assert.equal(c2SecondMineBoxAllowed(piece), true, piece.id);
    assert.ok(piece.y - piece.h / 2 >= 0, `${piece.id} must not replace floor geometry`);
    for (const centre of reserved) {
      assert.ok(pointBoxDistance(centre.east, centre.north, piece) >= 1.95, piece.id);
    }
  }
  for (const [east, north] of [[0, 126], [0, 148], [0, 112], [51.5, 137], [51.5, 159], [0, 190]] as const) {
    assert.ok(scene.pieces.every(piece => pointBoxDistance(east, north, piece) >= .72), `${east}/${north}`);
  }
  for (const [east, north] of [[-4, 47], [4, 79], [-48, 171], [48, 174]] as const) {
    assert.ok(scene.pieces.every(piece => pointBoxDistance(east, north, piece) >= .72));
  }
  scene.dispose();
});

test('lamp wear keeps ten warm cores in one amber batch with role-specific warmth and texture emission', () => {
  const scene = buildC2SecondMineLightSources();
  try {
    for (const mesh of scene.meshes) {
      assert.ok(mesh.instanceColor);
      assert.equal(mesh.instanceColor.count, mesh.count);
      assert.equal(mesh.instanceColor.usage, StaticDrawUsage);
      const material = mesh.material as MeshLambertMaterial;
      assert.equal(material.flatShading, true);
      assert.ok(new Set(textureTones(material.map!)).size >= 5);
    }
    const amber = scene.meshes.map(mesh => mesh.material as MeshLambertMaterial)
      .find(material => material.userData.materialFamily === 'amber')!;
    assert.equal(amber.emissiveMap, amber.map, 'reuse the warm gradient instead of adding a texture or batch');
    assert.ok(amber.emissive.r > amber.emissive.g && amber.emissive.g > amber.emissive.b);
    const amberMesh = scene.meshes.find(mesh => mesh.material === amber)!;
    const cores = scene.pieces.filter(piece => piece.family === 'amber');
    assert.equal(cores.length, 10);
    const ratios = { dock: [] as number[], bypass: [] as number[], workface: [] as number[] };
    const color = new Color();
    for (const [index, core] of cores.entries()) {
      color.fromBufferAttribute(amberMesh.instanceColor!, index);
      assert.ok(color.r > color.g && color.g > color.b, `${core.fixtureId} keeps a warm core`);
      ratios[core.role].push(color.b / color.r);
    }
    assert.ok(ratios.dock.every(value => value > .83));
    assert.ok(ratios.bypass.every(value => value > .70 && value < .81));
    assert.ok(ratios.workface.every(value => value < .70));
    assert.equal(scene.stats().drawCount, 5);
    assert.equal(scene.stats().pointLightCount, 3);
    assert.equal(scene.stats().triangleCount, 128 * 12);
  } finally {
    scene.dispose();
  }
});

test('fixtures use warm 2200–2700K lamp colours, local ENY positions and a strict physical-light budget', () => {
  const scene = buildC2SecondMineLightSources();
  assert.deepEqual(c2SecondMineLampColors, {
    dock: { hex: 0xffc078, kelvin: 2700 },
    bypass: { hex: 0xffb277, kelvin: 2500 },
    workface: { hex: 0xe5a05a, kelvin: 2200 },
  });
  assert.deepEqual(stats(scene).colorTemperatureRange, [2200, 2700]);
  for (const emitter of scene.emitters) {
    assert.ok(emitter.kelvin >= 2200 && emitter.kelvin <= 2700);
    assert.equal(emitter.color, c2SecondMineLampColors[emitter.role].hex);
    const color = new Color(emitter.color);
    assert.ok(color.r > color.g && color.g > color.b, `${emitter.id} must be warm, not cold healing light`);
    assert.ok(Math.abs(emitter.height - 2.1) < .1);
  }
  for (const light of scene.lights) {
    assert.ok(light instanceof PointLight);
    assert.ok(light.name.startsWith(c2SecondMineLightPrefix));
    const emitter = scene.emitters.find(item => `${c2SecondMineLightPrefix}${item.id}/source` === light.name)!;
    assert.deepEqual(light.position.toArray(), [emitter.east, emitter.height, -emitter.north]);
    assert.equal(light.color.getHex(), emitter.color);
    assert.equal(light.intensity, c2SecondMineLightBudget.intensity);
    assert.equal(light.distance, c2SecondMineLightBudget.distance);
    assert.equal(light.decay, 2);
    assert.equal(light.castShadow, false);
  }
  assert.equal(scene.isNightLit, false);
  assert.equal(scene.lights.filter(light => light.visible).length, 0);
  const amber = scene.meshes.map(mesh => mesh.material as MeshLambertMaterial)
    .find(material => material.userData.materialFamily === 'amber')!;
  assert.equal(amber.emissiveIntensity, .12);
  setNight(scene, true);
  assert.equal(scene.isNightLit, true);
  assert.equal(scene.lights.filter(light => light.visible).length, 3);
  assert.equal(amber.emissiveIntensity, 1.45);
  setNight(scene, false);
  assert.equal(scene.lights.filter(light => light.visible).length, 0);
  assert.equal(amber.emissiveIntensity, .12);
  scene.dispose();
});

test('same-value night updates return before rewriting lights or amber emission', () => {
  const scene = buildC2SecondMineLightSources();
  try {
    const light = scene.lights[0]!;
    const amber = scene.meshes.map(mesh => mesh.material as MeshLambertMaterial)
      .find(material => material.userData.materialFamily === 'amber')!;
    let lightVisible = light.visible;
    let lightWrites = 0;
    Object.defineProperty(light, 'visible', {
      configurable: true,
      get: () => lightVisible,
      set: (value: boolean) => { lightWrites++; lightVisible = value; },
    });
    let emission = amber.emissiveIntensity;
    let emissionWrites = 0;
    Object.defineProperty(amber, 'emissiveIntensity', {
      configurable: true,
      get: () => emission,
      set: (value: number) => { emissionWrites++; emission = value; },
    });
    assert.equal(scene.setNight(false), scene.data);
    assert.equal(lightWrites, 0);
    assert.equal(emissionWrites, 0);
    scene.setNight(true);
    assert.equal(lightWrites, 1);
    assert.equal(emissionWrites, 1);
    scene.setNight(true);
    assert.equal(lightWrites, 1);
    assert.equal(emissionWrites, 1);
    scene.setNight(false);
    assert.equal(lightWrites, 2);
    assert.equal(emissionWrites, 2);
    scene.setNight(false);
    assert.equal(lightWrites, 2);
    assert.equal(emissionWrites, 2);
  } finally {
    scene.dispose();
  }
});

test('five 16px Nearest material batches render the fixtures and dispose without altering host campfires', () => {
  const owner = new Group();
  const campfires = Array.from({ length: 2 }, (_, index) => {
    const light = new PointLight(0xffb277, 24, 16, 2);
    light.name = `existing-campfire-${index}`;
    light.position.set(index ? -12 : -3.5, 1.4, index ? -150 : -10);
    owner.add(light);
    return light;
  });
  const scene = buildC2SecondMineLightSources(owner);
  assert.equal(owner.children[2], scene.group);
  assert.equal(scene.meshes.length, 5);
  assert.equal(scene.stats().materialFamilyCount, 5);
  for (const mesh of scene.meshes) {
    assert.ok(mesh instanceof InstancedMesh);
    assert.ok(mesh.name.startsWith(c2SecondMineLightPrefix));
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
  }
  scene.setNight(true);
  assert.ok(campfires.every(light => light.visible && light.intensity === 24 && light.color.getHex() === 0xffb277));

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
  const lightDisposals = new Map<PointLight, number>();
  for (const light of scene.lights) {
    const disposeLight = light.dispose.bind(light);
    light.dispose = () => {
      lightDisposals.set(light, (lightDisposals.get(light) ?? 0) + 1);
      disposeLight();
    };
  }
  const stats = scene.stats();
  scene.dispose();
  scene.dispose();
  scene.setNight(true);
  assert.equal(scene.group.parent, null);
  assert.equal(scene.group.children.length, 0);
  assert.deepEqual(owner.children, campfires);
  assert.equal(scene.stats(), stats);
  for (const resource of resources) assert.equal(disposed.get(resource), 1);
  for (const light of scene.lights) assert.equal(lightDisposals.get(light), 1);
  assert.ok(campfires.every(light => light.visible && light.intensity === 24 && light.distance === 16));
});
