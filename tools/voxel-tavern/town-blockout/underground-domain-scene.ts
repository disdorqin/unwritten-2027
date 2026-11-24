import {
  BufferAttribute, BufferGeometry, DoubleSide, Group, Mesh, MeshStandardMaterial, Vector3,
} from 'three';
import type { resolveUndergroundShaftRegistration } from '../../../src/presence/underground-shaft-registration.js';
import type { UndergroundMineGateStage } from '../../../src/presence/underground-mine-gate.js';
import type { UndergroundMiningTargetView } from '../../../src/shared/underground-mining.js';
import type { createUndergroundMineLayout, UndergroundMineSpec } from './underground-mine-layout.js';
import { createUndergroundCampRemains } from './underground-camp-remains.js';
import { mountUndergroundCampLighting } from './underground-camp-lighting.js';
import { createUndergroundCrystalGate } from './underground-crystal-gate.js';
import { mountUndergroundCampScene } from './underground-camp-scene.js';
import { createUndergroundOreVein } from './underground-ore-vein.js';
import { createUndergroundRecoveryFirePresentation, type UndergroundRecoveryFireSite } from './underground-recovery-fires.js';
import { mountUndergroundPumpHouseScene } from './underground-pump-house-scene.js';
import { mountUndergroundExpeditionCampScene } from './underground-expedition-camp-scene.js';
import { mountUndergroundMainlineScene } from './underground-mainline-scene.js';
import {mountFirstMineWorkfaces} from './town-c-first-mine-workfaces.js';
import {mountFirstMineDeepWorks} from './town-c-first-mine-deep-works.js';
import {
  mountTownC2UndergroundWaterMinus90,
  type UndergroundWater90Authority, type UndergroundWater90OreVisual,
} from './town-c2-underground-water-minus90.js';

type Mine = ReturnType<typeof createUndergroundMineLayout>;
type Registration = ReturnType<typeof resolveUndergroundShaftRegistration>;
type Point = Readonly<{ east: number; north: number; height: number }>;
type Camp = UndergroundMineSpec['camp'];
type Walker = UndergroundMineSpec['walker'];
type OreSite = Readonly<{
  target: UndergroundMiningTargetView;
  normal: Readonly<{ east: number; north: number; height: number }>;
}>;
type Host = Readonly<{
  parent: Group;
  registration: Registration;
  /** The certified yaw of the mine's local +Z axis, not a review-only angle. */
  mineYaw?: number;
  mine?: Mine;
  camp?: Camp;
  walker?: Walker;
  /** Confirm real mine collision/route geometry is registered at the supplied world pose. */
  acceptsMineGeometry?(placement: Readonly<{
    domainId: string;
    landing: Point;
    yaw: number;
    localPool: readonly [number, number, number];
  }>): boolean;
  /** Enable U-2 interactions only with movement-accepted feet, sight and inventory receipts. */
  campRuntime?: Pick<Parameters<typeof mountUndergroundCampScene>[0], 'actions' | 'pickaxe' | 'ambience'>;
  /** Mining markers come ONLY from the authenticated U-8 world site registry. */
  oreRuntime?: Readonly<{
    sites: readonly OreSite[];
    supportsFace(site: OreSite): boolean;
    readTargets(): readonly UndergroundMiningTargetView[];
  }>;
  /** U-13's authoritative fires and contact receipts, not a new healing implementation. */
  recoveryRuntime?: Readonly<{
    sites: readonly UndergroundRecoveryFireSite[];
    supportsFire(site: UndergroundRecoveryFireSite): boolean;
    readConfirmedContact(): Readonly<{ fireId: string; layer: string }> | undefined;
  }>;
  /** U-17's between-layer world site is certified separately from the mine landing. */
  pumpHouseRuntime?: Omit<Parameters<typeof mountUndergroundPumpHouseScene>[0], 'parent'>;
  /** U-18 shared host camp receipts, dynamically accepted by U-13 light and safety sources. */
  expeditionRuntime?: Omit<Parameters<typeof mountUndergroundExpeditionCampScene>[0], 'parent'>;
  /** U-19's entire 120m rail exists only if the real U-15 host certifies its mainline survey. */
  mainlineRuntime?: Omit<Parameters<typeof mountUndergroundMainlineScene>[0], 'parent'>;
  /** C2-06 visual-only water adapter; absent means the certified baseline stays untouched. */
  waterRuntime?: Readonly<{
    highWaterOffsetM: number;
    readWater?: () => UndergroundWater90Authority | null | undefined;
    oreVisuals?: readonly UndergroundWater90OreVisual[];
  }>;
  /** Read the accepted gate stage from its sole movement authority. Unknown means closed. */
  readGateStage?(): UndergroundMineGateStage | undefined;
  /** Host-approved light budget and offering receipts; never grant light from render state. */
  readLights(): {
    litNicheIds: ReadonlySet<string>;
    extraCampLightCount: number;
    remainingBudget: number;
  };
}>;

function validPoint(value: Point): boolean {
  return [value.east, value.north, value.height].every(Number.isFinite);
}

/**
 * Installed, world-anchored first-mine scene section. This owns no player movement,
 * E handling, teleport, inventory or realm transition authority. It can only mount
 * after the B-01 host confirms both a mine receiving foot and collision geometry.
 */
export function mountUndergroundMineDomain(host: Host) {
  const { registration, parent, mine, camp: campSpec, walker, mineYaw, acceptsMineGeometry } = host;
  if (registration.kind !== 'ready' || !mine || !campSpec || !walker || mineYaw === undefined ||
      !Number.isFinite(mineYaw) || !acceptsMineGeometry) return { kind: 'unregistered' } as const;
  const { firstFallLanding: landing, shaftFoot } = registration.connection;
  const pool = mine.anchors.poolLanding;
  if (!landing.domainId || landing.domainId === shaftFoot.domainId ||
      !validPoint(landing) || pool.length !== 3 || !pool.every(Number.isFinite) ||
      landing.height !== pool[1] || pool[1] !== -90) {
    return { kind: 'invalid-landing' } as const;
  }
  const placement = {
    domainId: landing.domainId, landing: { east: landing.east, north: landing.north, height: landing.height },
    yaw: mineYaw, localPool: [...pool] as [number, number, number],
  };
  if (acceptsMineGeometry(placement) !== true) return { kind: 'unsupported-mine' } as const;
  const oreSites = host.oreRuntime?.sites ?? [];
  const oreIds = new Set<string>();
  for (const site of oreSites) {
    const { target, normal } = site;
    if (target.kind !== 'ore' || !target.id.trim() || oreIds.has(target.id) ||
        target.at.layer !== landing.domainId ||
        ![target.at.east, target.at.north, target.at.height,
          normal.east, normal.north, normal.height].every(Number.isFinite) ||
        Math.hypot(normal.east, normal.north, normal.height) < .0001 ||
        host.oreRuntime?.supportsFace(site) !== true) return { kind: 'unsupported-ores' } as const;
    oreIds.add(target.id);
  }

  const recoverySites = host.recoveryRuntime?.sites ?? [];
  for (const site of recoverySites) {
    if (site.fire.point.layer !== landing.domainId ||
        ![site.fire.point.east, site.fire.point.north, site.fire.point.height,
          site.fire.healPerSecond, site.radius].every(Number.isFinite) ||
        site.fire.healPerSecond < 0 || site.radius <= 0 ||
        host.recoveryRuntime?.supportsFire(site) !== true) {
      return { kind: 'unsupported-fires' } as const;
    }
  }

  // A single rigid transform aligns the original pool, gallery, camp and ore markers.
  // Three uses (east, height, -north); local +Z is the mine's forward direction.
  const root = new Group();
  root.name = 'underground-mine-domain:' + landing.domainId;
  root.rotation.y = mineYaw;
  const localPool = new Vector3(...pool).applyAxisAngle(new Vector3(0, 1, 0), mineYaw);
  root.position.set(landing.east - localPool.x, landing.height - localPool.y,
    -landing.north - localPool.z);
  const materials = {
    rock: new MeshStandardMaterial({ color: 0x544f49, roughness: .98, side: DoubleSide, flatShading: true }),
    rail: new MeshStandardMaterial({ color: 0x77695b, roughness: .88, metalness: .20, side: DoubleSide }),
    water: new MeshStandardMaterial({
      color: 0x497b8c, transparent: true, opacity: .69, roughness: .18, side: DoubleSide,
    }),
  };
  const geometries: BufferGeometry[] = [];
  let waterMesh: Mesh | undefined;
  for (const surface of ['rock', 'rail', 'water'] as const) {
    const vertices = mine.mesh[surface];
    if (!(vertices instanceof Float32Array) || vertices.length < 9 || vertices.length % 9 !== 0 ||
        !vertices.every(Number.isFinite)) {
      for (const geometry of geometries) geometry.dispose();
      for (const material of Object.values(materials)) material.dispose();
      throw new RangeError('Mine scene requires validated rock, rail and water triangles');
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    geometries.push(geometry);
    const mesh = new Mesh(geometry, materials[surface]);
    mesh.name = 'underground-mine-' + surface;
    root.add(mesh);
    if (surface === 'water') waterMesh = mesh;
  }

  let staticCamp: ReturnType<typeof createUndergroundCampRemains> | undefined;
  let staticCampLights: ReturnType<typeof mountUndergroundCampLighting> | undefined;
  let interactiveCamp: ReturnType<typeof mountUndergroundCampScene> | undefined;
  try {
    if (host.campRuntime) {
      interactiveCamp = mountUndergroundCampScene({
        parent: root, mine, camp: campSpec, walker,
        ...host.campRuntime, readLights: host.readLights,
      });
    } else {
      staticCamp = createUndergroundCampRemains({ mine, camp: campSpec, walker });
      root.add(staticCamp.group);
      staticCampLights = mountUndergroundCampLighting(staticCamp.lighting);
      staticCampLights.sync(new Set(), 0, 0);
    }
  } catch (error) {
    for (const geometry of geometries) geometry.dispose();
    for (const material of Object.values(materials)) material.dispose();
    throw error;
  }
  // Do not create or draw a crystal gate from a review-only position. Its shape comes
  // from this same collision layout, and opening is driven by an accepted gate stage.
  const gate = host.readGateStage && mine.expansion?.gate
    ? createUndergroundCrystalGate(mine.expansion.gate) : undefined;
  if (gate) root.add(gate.group);
  const recovery = recoverySites.length ? createUndergroundRecoveryFirePresentation(recoverySites, point => {
    const scene = new Vector3(point.east, point.height, -point.north)
      .sub(root.position).applyAxisAngle(new Vector3(0, 1, 0), -mineYaw);
    return [scene.x, scene.y, scene.z];
  }) : undefined;
  if (recovery) root.add(recovery.group);
  const veins = new Map<string, ReturnType<typeof createUndergroundOreVein>>();
  for (const { target, normal } of oreSites) {
    const localFace = new Vector3(target.at.east, target.at.height, -target.at.north)
      .sub(root.position).applyAxisAngle(new Vector3(0, 1, 0), -mineYaw);
    const localNormal = new Vector3(normal.east, normal.height, -normal.north)
      .applyAxisAngle(new Vector3(0, 1, 0), -mineYaw);
    const vein = createUndergroundOreVein({ id: target.id, face: localFace, normal: localNormal, ore: target });
    vein.group.visible = false; // Never display an ore that lacks a live U-8 authority snapshot.
    veins.set(target.id, vein);
    root.add(vein.group);
  }
  const workfaces=mountFirstMineWorkfaces(root,mine.workfaces,mine.supportStation);
  const deepWorks=mountFirstMineDeepWorks(root,mine.expansion?.deepWorks===true);
  const waterOverlay = host.waterRuntime && waterMesh
    ? mountTownC2UndergroundWaterMinus90({
      parent: root, mine, waterMesh,
      highWaterOffsetM: host.waterRuntime.highWaterOffsetM,
      readWater: host.waterRuntime.readWater,
      oreVisuals: host.waterRuntime.oreVisuals,
    })
    : undefined;
  parent.add(root);
  // The pump room uses a distinct certified ENY site in the between-layer passage,
  // not the mine-local pool frame. Missing site/foot approval leaves it unmounted.
  const pumpHouse = host.pumpHouseRuntime && mountUndergroundPumpHouseScene({
    parent, ...host.pumpHouseRuntime,
  });
  const expedition = host.expeditionRuntime && mountUndergroundExpeditionCampScene({
    parent, ...host.expeditionRuntime,
  });
  const mainline = host.mainlineRuntime && mountUndergroundMainlineScene({
    parent, ...host.mainlineRuntime,
  });
  let disposed = false;

  return {
    kind: 'ready',
    group: root,
    poolWorld: { east: landing.east, north: landing.north, height: landing.height },
    camp: interactiveCamp?.camp ?? staticCamp,
    workfaces,
    deepWorks,
    pumpHouse: pumpHouse?.kind === 'ready' ? pumpHouse : undefined,
    pumpHouseStatus: pumpHouse?.kind ?? 'unregistered',
    expedition,
    mainline: mainline?.kind === 'ready' ? mainline : undefined,
    mainlineStatus: mainline?.kind ?? 'unregistered',
    waterOverlay,
    /** Caller sends the E request only to the registered and current camp action. */
    campPrompt: () => interactiveCamp?.prompt(),
    pressCamp: async (expectedId: string) => interactiveCamp
      ? interactiveCamp.press(expectedId) : 'unavailable' as const,
    /** For a renderer preview only: movement authority still validates any attempted step. */
    toWorld(local: readonly [number, number, number]) {
      if (disposed || local.length !== 3 || !local.every(Number.isFinite)) return;
      const world = new Vector3(...local).applyAxisAngle(new Vector3(0, 1, 0), mineYaw).add(root.position);
      return { east: world.x, north: -world.z, height: world.y };
    },
    sync() {
      if (disposed) return;
      if (interactiveCamp) interactiveCamp.update();
      else if (staticCampLights) {
        const lights = host.readLights();
        staticCampLights.sync(lights.litNicheIds, lights.extraCampLightCount, lights.remainingBudget);
      }
      gate?.update(host.readGateStage?.() ?? 'closed');
      recovery?.sync(host.recoveryRuntime?.readConfirmedContact());
      if (pumpHouse?.kind === 'ready') pumpHouse.sync();
      expedition?.sync();
      if (mainline?.kind === 'ready') mainline.sync();
      waterOverlay?.sync();
      if (host.oreRuntime) {
        const snapshot = new Map(host.oreRuntime.readTargets().map(target => [target.id, target]));
        for (const [id, vein] of veins) {
          const candidate = snapshot.get(id);
          const reference = oreSites.find(site => site.target.id === id)!.target;
          const authorized = candidate?.kind === 'ore' && candidate.at.layer === landing.domainId &&
            candidate.at.east === reference.at.east && candidate.at.north === reference.at.north &&
            candidate.at.height === reference.at.height && candidate.mineral === reference.mineral &&
            Number.isSafeInteger(candidate.hits) && candidate.hits >= 0 &&
            Number.isSafeInteger(candidate.strikes) && candidate.strikes >= 1 && candidate.hits <= candidate.strikes;
          vein.group.visible = authorized === true;
          if (authorized) vein.sync(candidate!);
        }
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      interactiveCamp?.dispose();
      staticCampLights?.dispose();
      gate?.dispose();
      recovery?.dispose();
      if (pumpHouse?.kind === 'ready') pumpHouse.dispose();
      expedition?.dispose();
      if (mainline?.kind === 'ready') mainline.dispose();
      waterOverlay?.dispose();
      for (const vein of veins.values()) vein.dispose();
      staticCamp?.dispose();
      workfaces.dispose();
      deepWorks.dispose();
      for (const geometry of geometries) geometry.dispose();
      for (const material of Object.values(materials)) material.dispose();
    },
  } as const;
}
