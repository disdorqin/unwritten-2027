import { Group } from 'three';
import { createStaticFootIndex, type StaticBox } from './town-c-static-foot-index.js';
import { createWarriorCityCandidate } from './underground-warrior-city-candidate.js';
import { mountUndergroundPalaceDressing } from './underground-palace-dressing.js';
import { createTownC2R30PalaceShell } from './town-c2-r30-palace-shell.js';
import { mountTownC2R30Tavern } from './town-c2-r30-tavern.js';
import { mountTownC2R30Domestic } from './town-c2-r30-warrior-domestic.js';
import { mountTownC2R30RoosterStarStone } from './town-c2-r30-rooster-star-stone.js';
import { mountTownC2R30CityVault } from './town-c2-r30-city-vault.js';
import { mountTownC2R30ForgeExterior } from './town-c2-r30-forge-exterior.js';
import { mountTownC2R30RemnantRing } from './town-c2-r30-remnant-ring.js';
import { mountTownC2R30VaultApproach } from './town-c2-r30-vault-approach.js';
import { resolveSeam, type C2DeepLayer, type C2CertifiedLayerFrame } from './town-c2-r30-layer-seams.js';
import type { C2R30DeepMouth } from './town-c2-r30-deep-mouths.js';

export type C2R30BridgePoint = Readonly<{ east: number; north: number; height: number }>;
export type C2R30BridgeRoom = Readonly<{
  origin: C2R30BridgePoint;
  bounds: Readonly<{ width: number; depth: number; height: number }>;
}>;
export type C2R30BridgeLink = Readonly<{
  id: string;
  from: C2DeepLayer;
  to: C2DeepLayer;
  start: C2R30BridgePoint;
  end: C2R30BridgePoint;
  length: number;
  width: number;
  clearance: number;
}>;
export type C2R30BridgePassage = Readonly<{ floor: number; clearance: number }>;
export type C2R30BridgeScene = Readonly<{
  group: Group;
  passageLocal(east: number, north: number, radius?: number, height?: number): C2R30BridgePassage | undefined;
  acceptsMouth(mouth: C2R30DeepMouth): boolean;
  dispose(): void;
}>;
export type C2R30SecondMinePort = Readonly<{ acceptsMouth(mouth: C2R30DeepMouth): boolean }>;
export type C2R30DeepBridge = Readonly<{
  acceptsLayer(layer: 'minus165' | 'minus190', frame: C2CertifiedLayerFrame, room: C2R30BridgeRoom): boolean;
  mountLayer(layer: 'minus165' | 'minus190', frame: C2CertifiedLayerFrame): C2R30BridgeScene | undefined;
  acceptsSecondMineMouth(mouth: C2R30DeepMouth): boolean;
  acceptsLink(link: C2R30BridgeLink, room: C2R30BridgeRoom): boolean;
  stats(): Readonly<{ mountedLayers: readonly string[]; colliderCount: number; disposed: boolean }>;
  dispose(): void;
}>;

const DOMAIN_IDS = Object.freeze({ minus165: 'underground/warrior-city', minus190: 'underground/palace' });
const EPSILON = 1e-9;

function finitePoint(point: C2R30BridgePoint | undefined) {
  return !!point && [point.east, point.north, point.height].every(Number.isFinite);
}

function roomContains(room: C2R30BridgeRoom | undefined, point: C2R30BridgePoint) {
  if (!room || !finitePoint(point) || !finitePoint(room.origin) ||
      ![room.bounds.width, room.bounds.depth, room.bounds.height].every(Number.isFinite) ||
      room.bounds.width <= 0 || room.bounds.depth <= 0 || room.bounds.height <= 0) return false;
  return point.east >= room.origin.east && point.east <= room.origin.east + room.bounds.width &&
    point.north >= room.origin.north && point.north <= room.origin.north + room.bounds.depth &&
    point.height >= room.origin.height && point.height <= room.origin.height + room.bounds.height;
}

function validFrame(layer: 'minus165' | 'minus190', frame: C2CertifiedLayerFrame | undefined) {
  return !!frame && resolveSeam(layer, frame).resolved;
}

function offsetColliders(colliders: readonly StaticBox[], height: number): readonly StaticBox[] {
  return colliders.map(box => ({
    min: [box.min[0], box.min[1] + height, box.min[2]],
    max: [box.max[0], box.max[1] + height, box.max[2]],
  }));
}

function passageWithExtras(
  base: (east: number, north: number, radius?: number, height?: number) => C2R30BridgePassage | undefined,
  index: ReturnType<typeof createStaticFootIndex<StaticBox>>,
  east: number,
  north: number,
  radius: number,
  height: number,
) {
  const passage = base(east, north, radius, height);
  if (!passage || ![passage.floor, passage.clearance].every(Number.isFinite) ||
      index.blocks(east, north, passage.floor, radius, height)) return;
  let clearance = passage.clearance;
  for (const box of index.candidates(east, north, radius)) {
    if (box.min[1] <= passage.floor + EPSILON) continue;
    const dx = Math.max(0, box.min[0] - east, east - box.max[0]);
    const dz = Math.max(0, box.min[2] + north, -north - box.max[2]);
    if (Math.hypot(dx, dz) < radius) clearance = Math.min(clearance, box.min[1] - passage.floor);
  }
  return clearance + EPSILON >= height ? { floor: passage.floor, clearance } : undefined;
}

function mouthProbe(mouth: C2R30DeepMouth) {
  return mouth.axis === 'north'
    ? { east: mouth.centre, north: mouth.at + .5 }
    : { east: mouth.at === 0 ? .5 : mouth.at - .5, north: mouth.centre };
}

/** Structural C-R04 bridge. C/A remain the only world, room and movement authorities. */
export function createTownC2R30DeepBridge(options: Readonly<{
  secondMine?: C2R30SecondMinePort;
  readNight?: () => boolean;
  readLightBudget?: () => number;
}> = {}): C2R30DeepBridge {
  const scenes = new Map<'minus165' | 'minus190', C2R30BridgeScene>();
  const colliderCounts = new Map<'minus165' | 'minus190', number>();
  let disposed = false;

  function acceptsLayer(layer: 'minus165' | 'minus190', frame: C2CertifiedLayerFrame, room: C2R30BridgeRoom) {
    if (disposed || !validFrame(layer, frame)) return false;
    const resolved = resolveSeam(layer, frame);
    return resolved.resolved && roomContains(room, resolved.worldEntry) && roomContains(room, resolved.worldExit);
  }

  function mountCity(frame: C2CertifiedLayerFrame): C2R30BridgeScene {
    let sceneDisposed = false;
    const city = createWarriorCityCandidate();
    const root = city.group;
    const site = { domainId: DOMAIN_IDS.minus165, east: 0, north: 0, height: 0, yaw: 0 };
    const supportsSite = () => true;
    const tavern = mountTownC2R30Tavern({ parent: root, site, supportsSite,
      readNight: options.readNight, readLightBudget: options.readLightBudget });
    const domestic = mountTownC2R30Domestic({ parent: root, site, supportsSite });
    const rooster = mountTownC2R30RoosterStarStone({ parent: root, site, supportsSite });
    const vault = mountTownC2R30CityVault({ parent: root, site, supportsSite });
    const forge = mountTownC2R30ForgeExterior({ parent: root, site, supportsSite });
    const art = [tavern, domestic, rooster, vault, forge];
    const shellBoxes: readonly StaticBox[] = city.shell.solids.map(piece => ({
      min: [piece.e - piece.w / 2, piece.y - piece.h / 2, -piece.n - piece.d / 2],
      max: [piece.e + piece.w / 2, piece.y + piece.h / 2, -piece.n + piece.d / 2],
    }));
    const colliders: readonly StaticBox[] = [...shellBoxes, ...city.colliders, ...art.flatMap(scene => scene.colliders)];
    const index = createStaticFootIndex(colliders);
    colliderCounts.set('minus165', colliders.length);
    root.userData.owner = 'C2-R02/R04/R05/R06/R09';
    root.userData.domainId = DOMAIN_IDS.minus165;
    root.userData.certifiedFrame = frame;
    return {
      group: root,
      passageLocal(east, north, radius = .27, height = 1.8) {
        if (sceneDisposed || ![east, north, radius, height].every(Number.isFinite) || radius < 0 || height <= 0) return;
        return passageWithExtras(city.shell.passageLocal.bind(city.shell), index, east, north, radius, height);
      },
      acceptsMouth(mouth) {
        if (sceneDisposed || !city.shell.acceptsMouth(mouth)) return false;
        const probe = mouthProbe(mouth);
        const passage = passageWithExtras(city.shell.passageLocal.bind(city.shell), index,
          probe.east, probe.north, .27, mouth.height);
        return !!passage && passage.floor === 0 && passage.clearance + EPSILON >= mouth.height;
      },
      dispose() {
        if (sceneDisposed) return;
        sceneDisposed = true;
        for (const scene of art) scene.dispose();
        city.dispose();
        root.userData.disposed = true;
      },
    };
  }

  function mountPalace(frame: C2CertifiedLayerFrame): C2R30BridgeScene {
    let sceneDisposed = false;
    const shell = createTownC2R30PalaceShell();
    const root = shell.group;
    const site = { domainId: DOMAIN_IDS.minus190, east: 0, north: 0, height: 0, yaw: 0 };
    const supportsSite = () => true;
    const dressing = mountUndergroundPalaceDressing(root, false);
    const ring = mountTownC2R30RemnantRing({ parent: root,
      site: { ...site, height: -2.4 }, supportsSite });
    const approach = mountTownC2R30VaultApproach({ parent: root,
      site: { ...site, height: -2.4 }, supportsSite });
    const colliders: readonly StaticBox[] = [
      ...offsetColliders(ring.colliders, -2.4), ...offsetColliders(approach.colliders, -2.4),
    ];
    const index = createStaticFootIndex(colliders);
    colliderCounts.set('minus190', colliders.length);
    root.userData.owner = 'C2-R03/R04/R08';
    root.userData.domainId = DOMAIN_IDS.minus190;
    root.userData.certifiedFrame = frame;
    return {
      group: root,
      passageLocal(east, north, radius = .27, height = 1.8) {
        if (sceneDisposed || ![east, north, radius, height].every(Number.isFinite) || radius < 0 || height <= 0) return;
        return passageWithExtras(shell.passageLocal.bind(shell), index, east, north, radius, height);
      },
      acceptsMouth(mouth) {
        if (sceneDisposed || !shell.acceptsMouth(mouth)) return false;
        const probe = mouthProbe(mouth);
        const passage = passageWithExtras(shell.passageLocal.bind(shell), index,
          probe.east, probe.north, .27, mouth.height);
        return !!passage && passage.floor === 0 && passage.clearance + EPSILON >= mouth.height;
      },
      dispose() {
        if (sceneDisposed) return;
        sceneDisposed = true;
        approach.dispose();
        ring.dispose();
        dressing.dispose();
        shell.dispose();
        root.userData.disposed = true;
      },
    };
  }

  function mountLayer(layer: 'minus165' | 'minus190', frame: C2CertifiedLayerFrame) {
    if (disposed || !validFrame(layer, frame)) return;
    const existing = scenes.get(layer);
    if (existing) return existing;
    const scene = layer === 'minus165' ? mountCity(frame) : mountPalace(frame);
    scenes.set(layer, scene);
    return scene;
  }

  function acceptsLink(link: C2R30BridgeLink, room: C2R30BridgeRoom) {
    if (disposed || !link || !['minus140-to-minus165', 'minus165-to-minus190'].includes(link.id) ||
        !finitePoint(link.start) || !finitePoint(link.end) || !Number.isFinite(link.length) || link.length <= 0 ||
        !Number.isFinite(link.width) || link.width <= 0 || !Number.isFinite(link.clearance) || link.clearance <= 0 ||
        !roomContains(room, link.start) || !roomContains(room, link.end)) return false;
    return link.id === 'minus140-to-minus165'
      ? link.from === 'minus140' && link.to === 'minus165'
      : link.from === 'minus165' && link.to === 'minus190';
  }

  return Object.freeze({
    acceptsLayer, mountLayer,
    acceptsSecondMineMouth(mouth) {
      return !disposed && options.secondMine?.acceptsMouth(mouth) === true;
    },
    acceptsLink,
    stats() {
      return Object.freeze({
        mountedLayers: Object.freeze([...scenes.keys()]),
        colliderCount: [...colliderCounts.values()].reduce((sum, count) => sum + count, 0),
        disposed,
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const scene of scenes.values()) scene.dispose();
      scenes.clear();
      colliderCounts.clear();
    },
  });
}
