import {
  Box3, BoxGeometry, DataTexture, Group, InstancedMesh, Matrix4, MeshStandardMaterial,
  NearestFilter, Object3D, PointLight, SRGBColorSpace, Vector3,
} from 'three';
import type { PumpHouseSnapshot } from '../../../src/presence/underground-pump-house.js';
import {
  readUndergroundWaterPresentation, type AcceptedWaterReader,
} from '../../../src/shared/town-c-water-snapshot-port.js';
import {
  mountUndergroundPumpHouseScene, type PumpHouseSceneSite,
} from './underground-pump-house-scene.js';

type Scene = ReturnType<typeof mountUndergroundPumpHouseScene>;
type ReadyScene = Extract<Scene, { kind: 'ready' }>;
type SceneHost = Parameters<typeof mountUndergroundPumpHouseScene>[0];
type ActionRole = Parameters<SceneHost['supportsActionFoot']>[0];
type Viewer = ReturnType<SceneHost['readViewer']>;
type Intent = Parameters<SceneHost['dispatch']>[0];

/**
 * C2-R01 worked placement in the second mine's local ENY frame. Its datum is
 * 5 m short of the river and its floor is 0.7 m above the low-water river bed;
 * yaw pi sends the scene's negative-Z gallery south, along the high bank.
 * This is deliberately a fixture ID, not C's registered world/domain anchor.
 */
export const c2PumpHouseFixtureDatum = Object.freeze({
  id: 'c2-r30/minus140/second-mine/near-bank/pump-house',
  layer: -140 as const,
  coordinateFrame: 'second-mine-local-east-height-north' as const,
  placementKind: 'visual/fixture datum' as const,
  worldAnchor: false as const,
  registration: 'requires-explicit-host-certification; not-a-C-world-anchor' as const,
  domainId: 'fixture:c2-r30:minus140:second-mine:near-bank:pump-house',
  east: -32,
  north: 123,
  height: 0,
  yaw: Math.PI,
  bank: Object.freeze({
    id: 'near-shore-high-bank',
    riverNorthMin: 128,
    setbackM: 5,
    floorAboveLowRiverBedM: .7,
  }),
});

export const c2PumpHouseFixtureSceneSite: PumpHouseSceneSite = Object.freeze({
  domainId: c2PumpHouseFixtureDatum.domainId,
  east: c2PumpHouseFixtureDatum.east,
  north: c2PumpHouseFixtureDatum.north,
  height: c2PumpHouseFixtureDatum.height,
  yaw: c2PumpHouseFixtureDatum.yaw,
});

/** Adapter-owned dressing only: three limestone, two brown, two rust, two fire tones. */
export const c2PumpHouseNineColorPalette = Object.freeze({
  limestoneLight: 0xd2c7ad,
  limestone: 0xb0a48c,
  limestoneDark: 0x776e60,
  brown: 0x6b5138,
  brownDark: 0x49382b,
  rust: 0xa45d3e,
  rustDark: 0x6e392b,
  fireOrange: 0xe08a3c,
  fireDark: 0x9b5429,
});

export type C2PumpHouseActionRole = ActionRole;
export type C2PumpHouseAdapterHost = Readonly<{
  /** A host-certified scene pose. Omission uses the explicitly local fixture pose. */
  site?: PumpHouseSceneSite;
  supportsSite?: SceneHost['supportsSite'];
  supportsActionFoot?: SceneHost['supportsActionFoot'];
  /** U-17 host snapshot. Missing or malformed data grants no interaction. */
  readPumpSnapshot?: () => PumpHouseSnapshot | undefined;
  /** Host-derived permissions, never inferred from the visual water height. */
  readPassageOpen?: (snapshot: PumpHouseSnapshot) => boolean;
  readFerryRunning?: (snapshot: PumpHouseSnapshot) => boolean | undefined;
  readLightBudget?: (snapshot: PumpHouseSnapshot) => number;
  readViewer?: () => Viewer;
  canSee?: SceneHost['canSee'];
  dispatch?: (intent: Intent) => void;
  onAcceptedSound?: SceneHost['onAcceptedSound'];
  /** Presentation only; the underground fixture defaults to its dark setting. */
  readNight?: () => boolean;
}>;

export type C2PumpHouseAdapterStats = Readonly<{
  layer: -140;
  mountKind: ReadyScene['kind'] | Exclude<Scene['kind'], 'ready'>;
  datum: typeof c2PumpHouseFixtureDatum;
  site: PumpHouseSceneSite;
  siteCertified: boolean;
  waterLevel: 'low' | 'mid' | 'high' | undefined;
  waterPhase: 'rise' | 'level' | 'fall' | undefined;
  waterConfigured: boolean;
  snapshot: PumpHouseSnapshot | undefined;
  passageOpen: boolean;
  ferryRunning: boolean | undefined;
  night: boolean;
  runtimeAuthorized: boolean;
  permissionVisible: boolean;
  actionFootCount: number;
  realLightCount: number;
  visibleLightCount: number;
  colliderCount: number;
  visualOnlyPieceCount: number;
  modelPieceCount: number;
  pixelTextureCount: number;
  textureSize: 16;
  textureFilter: 'nearest';
  disposed: boolean;
}>;

const roleOrder: readonly C2PumpHouseActionRole[] = Object.freeze([
  'journal', 'pump', 'open-cover', 'strike-blockage', 'reset-lever', 'cross', 'ore',
]);
const stages: readonly PumpHouseSnapshot['stage'][] = Object.freeze([
  'running', 'jammed', 'cover-open', 'blockage-cleared',
]);

function validSnapshot(value: PumpHouseSnapshot | undefined): value is PumpHouseSnapshot {
  if (!value || !Number.isSafeInteger(value.revision) || value.revision < 0 ||
      !Number.isFinite(value.lastAtMs) || value.lastAtMs < 0 ||
      !Number.isFinite(value.water) || value.water < 0 || value.water > 1 ||
      !Number.isFinite(value.pumpedMs) || value.pumpedMs < 0 ||
      !stages.includes(value.stage) ||
      !Number.isSafeInteger(value.repairHits) || value.repairHits < 0 ||
      !Number.isSafeInteger(value.repairedJams) || value.repairedJams < 0 ||
      !Array.isArray(value.journalReaders) ||
      new Set(value.journalReaders).size !== value.journalReaders.length ||
      !value.journalReaders.every(id => typeof id === 'string' && !!id.trim()) ||
      (value.operator !== undefined && (typeof value.operator !== 'string' || !value.operator.trim())) ||
      (value.lastPumpAtMs !== undefined && (!Number.isFinite(value.lastPumpAtMs) ||
        value.lastPumpAtMs < 0 || value.lastPumpAtMs > value.lastAtMs))) return false;
  return true;
}

type DressFamily = 'limestone' | 'brown' | 'rust' | 'fire';
type DressTone = 'limestone' | 'limestoneDark' | 'brown' | 'brownDark' |
  'rust' | 'rustDark' | 'fireOrange' | 'fireDark';
type DressBox = Readonly<{
  family: DressTone; x: number; y: number; z: number;
  w: number; h: number; d: number;
}>;

function dressBoxes(): readonly DressBox[] {
  const boxes: DressBox[] = [];
  // A thin, non-colliding apron reads as bank masonry without replacing the
  // pump scene's own floor, walls, footing or collision contract.
  for (let index = 0; index < 13; index++) boxes.push({
    family: index % 4 === 0 ? 'limestoneDark' : 'limestone',
    x: -6.3 + index * 1.05, y: -.24, z: .82, w: 1.02, h: .22, d: 1.24,
  });
  for (const side of [-1, 1]) for (let index = 0; index < 8; index++) boxes.push({
    family: index % 3 === 0 ? 'brown' : 'limestone',
    x: side * 6.55, y: -.24, z: -1.8 - index * 2.8, w: .45, h: .22, d: 2.68,
  });
  for (let index = 0; index < 8; index++) boxes.push({
    family: index % 3 === 0 ? 'rust' : 'brownDark',
    x: -6.95, y: .12, z: -.9 - index * 1.15, w: .12, h: .12, d: .82,
  });
  for (let index = 0; index < 3; index++) boxes.push({
    family: index === 1 ? 'fireDark' : 'fireOrange',
    x: 0, y: .018, z: 1.64 + index * .55, w: .44, h: .025, d: .18,
  });
  return Object.freeze(boxes);
}

function pixelTexture(family: DressFamily) {
  const tones = {
    limestone: [c2PumpHouseNineColorPalette.limestoneLight,
      c2PumpHouseNineColorPalette.limestone, c2PumpHouseNineColorPalette.limestoneDark],
    brown: [c2PumpHouseNineColorPalette.brown, c2PumpHouseNineColorPalette.brownDark],
    rust: [c2PumpHouseNineColorPalette.rust, c2PumpHouseNineColorPalette.rustDark],
    fire: [c2PumpHouseNineColorPalette.fireOrange, c2PumpHouseNineColorPalette.fireDark],
  }[family];
  const pixels = new Uint8Array(16 * 16 * 4);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const grain = (x * 17 + y * 23 + x * y * 3) % 37;
    const joint = family === 'limestone' ? y % 5 === 0 || (x + Math.floor(y / 5) * 3) % 11 === 0 :
      family === 'brown' ? (x + Math.floor(y / 4) * 2) % 7 === 0 :
        family === 'rust' ? (x * 3 + y * 5) % 13 === 0 : false;
    const tone = joint ? tones[tones.length - 1]! :
      grain < 5 ? tones[0]! : tones[Math.min(1, tones.length - 1)]!;
    pixels.set([tone >>> 16, tone >>> 8 & 255, tone & 255, 255], (y * 16 + x) * 4);
  }
  const texture = new DataTexture(pixels, 16, 16);
  texture.name = `town-c2-r30-pump-house-adapter/${family}-16px`;
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function makeDressing(site: PumpHouseSceneSite) {
  const root = new Group();
  root.name = 'town-c2-r30-pump-house-adapter/bank-dressing';
  root.userData.visualOnly = true;
  root.userData.colliderCount = 0;
  root.position.set(site.east, site.height, -site.north);
  root.rotation.y = site.yaw;
  const boxes = dressBoxes();
  const families: readonly DressFamily[] = ['limestone', 'brown', 'rust', 'fire'];
  const geometry = new BoxGeometry();
  const matrix = new Matrix4();
  const position = new Object3D();
  const textures = families.map(pixelTexture);
  const materials = families.map((family, index) => new MeshStandardMaterial({
    name: `town-c2-r30-pump-house-adapter/${family}`,
    map: textures[index], roughness: family === 'rust' ? .82 : .98,
    metalness: family === 'rust' ? .17 : 0, flatShading: true,
    ...(family === 'fire' ? {
      emissive: c2PumpHouseNineColorPalette.fireOrange, emissiveIntensity: .45,
    } : {}),
  }));
  const meshes = families.map((family, familyIndex) => {
    const members = boxes.filter(box => box.family === family || box.family.startsWith(family));
    const mesh = new InstancedMesh(geometry, materials[familyIndex]!, members.length);
    mesh.name = `town-c2-r30-pump-house-adapter/${family}`;
    mesh.userData.visualOnly = true;
    members.forEach((box, index) => {
      position.position.set(box.x, box.y, box.z);
      position.rotation.set(0, 0, 0);
      position.scale.set(box.w, box.h, box.d);
      position.updateMatrix();
      matrix.copy(position.matrix);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    root.add(mesh);
    return mesh;
  });
  return { root, boxes, families, geometry, textures, materials, meshes,
    fireMaterial: materials[3]! };
}

function effectivelyVisible(object: Object3D) {
  for (let current: Object3D | null = object; current; current = current.parent) {
    if (!current.visible) return false;
  }
  return true;
}

/**
 * Mounts the existing U-17 pump model at an explicitly certified C2 fixture.
 * The adapter owns no water, ferry, repair, movement or world-anchor authority.
 */
export function mountTownC2PumpHouseAdapter(options: Readonly<{
  parent: Group;
  readAcceptedWater: AcceptedWaterReader;
  host?: C2PumpHouseAdapterHost;
}>) {
  const host = options.host ?? {};
  const site = host.site ?? c2PumpHouseFixtureSceneSite;
  const root = new Group();
  root.name = 'town-c2-r30-pump-house-adapter';
  root.userData.datum = c2PumpHouseFixtureDatum;
  root.userData.visualOnly = true;
  root.userData.worldAnchor = false;
  root.visible = false;
  options.parent.add(root);

  const dressing = makeDressing(site);
  root.add(dressing.root);
  let authorizedSnapshot: PumpHouseSnapshot | undefined;
  const sceneHost: SceneHost = {
    parent: root,
    site,
    supportsSite: candidate => host.supportsSite?.(candidate) === true,
    supportsActionFoot: (role, point) => host.supportsActionFoot?.(role, point) === true,
    readSnapshot: () => authorizedSnapshot,
    readPassageOpen: () => !!authorizedSnapshot && host.readPassageOpen?.(authorizedSnapshot) === true,
    readLightBudget: () => {
      if (!authorizedSnapshot || !night) return 0;
      const budget = host.readLightBudget?.(authorizedSnapshot) ?? 0;
      return Number.isFinite(budget) ? Math.max(0, Math.floor(budget)) : 0;
    },
    readViewer: () => host.readViewer?.(),
    canSee: (role, point) => host.canSee?.(role, point) === true,
    dispatch: intent => host.dispatch?.(intent),
    onAcceptedSound: host.onAcceptedSound,
  };
  const mounted = mountUndergroundPumpHouseScene(sceneHost);
  const colliders = mounted.kind === 'ready' ? mounted.colliders.map(solid => {
    const box = new Box3(new Vector3(...solid.min), new Vector3(...solid.max));
    const matrix = new Matrix4().makeRotationY(site.yaw);
    matrix.setPosition(site.east, site.height, -site.north);
    box.applyMatrix4(matrix);
    return Object.freeze({
      name: solid.name,
      min: Object.freeze([box.min.x, box.min.y, box.min.z] as const),
      max: Object.freeze([box.max.x, box.max.y, box.max.z] as const),
    });
  }) : [];
  root.visible = mounted.kind === 'ready';
  let disposed = false;
  let waterLevel: 'low' | 'mid' | 'high' | undefined;
  let waterPhase: 'rise' | 'level' | 'fall' | undefined;
  let passageOpen = false;
  let ferryRunning: boolean | undefined;
  let night = true;

  function stats(): C2PumpHouseAdapterStats {
    const ready = mounted.kind === 'ready' ? mounted : undefined;
    const lights: PointLight[] = [];
    if (!disposed && ready) root.traverse(object => {
      if (object instanceof PointLight) lights.push(object);
    });
    const snapshot = !disposed && waterLevel !== undefined && authorizedSnapshot
      ? structuredClone(authorizedSnapshot) : undefined;
    return Object.freeze({
      layer: -140,
      mountKind: mounted.kind,
      datum: c2PumpHouseFixtureDatum,
      site: Object.freeze({ ...site }),
      siteCertified: mounted.kind === 'ready',
      waterLevel,
      waterPhase,
      waterConfigured: !disposed && waterLevel !== undefined,
      snapshot,
      passageOpen: !disposed && passageOpen,
      ferryRunning: disposed ? undefined : ferryRunning,
      night,
      runtimeAuthorized: !!snapshot,
      permissionVisible: !disposed && ready?.prompt() !== undefined,
      actionFootCount: !disposed && ready ? roleOrder.length : 0,
      realLightCount: lights.length,
      visibleLightCount: lights.filter(effectivelyVisible).length,
      colliderCount: !disposed && ready ? ready.colliders.length : 0,
      visualOnlyPieceCount: disposed ? 0 : dressing.boxes.length,
      modelPieceCount: !disposed && ready ? ready.voxels : 0,
      pixelTextureCount: disposed ? 0 : dressing.textures.length,
      textureSize: 16,
      textureFilter: 'nearest',
      disposed,
    });
  }

  function sync(): C2PumpHouseAdapterStats {
    if (disposed) return stats();
    const accepted = readUndergroundWaterPresentation(options.readAcceptedWater);
    const candidate = accepted ? host.readPumpSnapshot?.() : undefined;
    authorizedSnapshot = validSnapshot(candidate) ? structuredClone(candidate) : undefined;
    waterLevel = accepted?.level;
    waterPhase = accepted?.phase;
    passageOpen = !!authorizedSnapshot && host.readPassageOpen?.(authorizedSnapshot) === true;
    const ferry = authorizedSnapshot ? host.readFerryRunning?.(authorizedSnapshot) : undefined;
    ferryRunning = typeof ferry === 'boolean' ? ferry : undefined;
    night = host.readNight?.() !== false;
    dressing.fireMaterial.emissiveIntensity = night ? .45 : .12;
    if (mounted.kind === 'ready') mounted.sync(authorizedSnapshot);
    return stats();
  }

  sync();
  return Object.freeze({
    group: root,
    colliders,
    sync,
    stats,
    prompt() { return !disposed && mounted.kind === 'ready' ? mounted.prompt() : undefined; },
    press(role: C2PumpHouseActionRole, hold = false) {
      return !disposed && !!host.dispatch && mounted.kind === 'ready' && mounted.press(role, hold);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      authorizedSnapshot = undefined;
      waterLevel = waterPhase = undefined;
      passageOpen = false;
      ferryRunning = undefined;
      if (mounted.kind === 'ready') mounted.dispose();
      root.removeFromParent();
      for (const mesh of dressing.meshes) mesh.dispose();
      dressing.geometry.dispose();
      for (const material of dressing.materials) material.dispose();
      for (const texture of dressing.textures) texture.dispose();
      root.clear();
    },
  });
}
