import {
  BufferAttribute, BufferGeometry, DoubleSide, Group, Mesh, MeshStandardMaterial, Vector3,
} from 'three';
import type { resolveUndergroundShaftRegistration } from '../../../src/presence/underground-shaft-registration.js';
import type { createUndergroundMineLayout, UndergroundMineSpec } from './underground-mine-layout.js';
import { createUndergroundCampRemains } from './underground-camp-remains.js';
import { mountUndergroundCampLighting } from './underground-camp-lighting.js';

type Mine = ReturnType<typeof createUndergroundMineLayout>;
type Registration = ReturnType<typeof resolveUndergroundShaftRegistration>;
type Point = Readonly<{ east: number; north: number; height: number }>;
type Camp = UndergroundMineSpec['camp'];
type Walker = UndergroundMineSpec['walker'];
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
  }

  let camp: ReturnType<typeof createUndergroundCampRemains>;
  try {
    camp = createUndergroundCampRemains({ mine, camp: campSpec, walker });
  } catch (error) {
    for (const geometry of geometries) geometry.dispose();
    for (const material of Object.values(materials)) material.dispose();
    throw error;
  }
  root.add(camp.group);
  const campLights = mountUndergroundCampLighting(camp.lighting);
  // Never illuminate the detached scene until the caller provides the live budget.
  campLights.sync(new Set(), 0, 0);
  parent.add(root);
  let disposed = false;

  return {
    kind: 'ready',
    group: root,
    poolWorld: { east: landing.east, north: landing.north, height: landing.height },
    /** For a renderer preview only: movement authority still validates any attempted step. */
    toWorld(local: readonly [number, number, number]) {
      if (disposed || local.length !== 3 || !local.every(Number.isFinite)) return;
      const world = new Vector3(...local).applyAxisAngle(new Vector3(0, 1, 0), mineYaw).add(root.position);
      return { east: world.x, north: -world.z, height: world.y };
    },
    sync() {
      if (disposed) return;
      const lights = host.readLights();
      campLights.sync(lights.litNicheIds, lights.extraCampLightCount, lights.remainingBudget);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      campLights.dispose();
      camp.dispose();
      for (const geometry of geometries) geometry.dispose();
      for (const material of Object.values(materials)) material.dispose();
    },
  } as const;
}
