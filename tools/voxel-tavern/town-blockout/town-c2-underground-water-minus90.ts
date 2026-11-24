import {
  BoxGeometry, BufferAttribute, BufferGeometry, DoubleSide, Group, InstancedMesh,
  Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, OctahedronGeometry, TorusGeometry,
} from 'three';
import {
  waterFormFor, type WaterForm, type WaterLevel, type WaterPhase,
} from '../../../src/shared/underground-water.js';
import type { createUndergroundMineLayout } from './underground-mine-layout.js';

type Mine = ReturnType<typeof createUndergroundMineLayout>;
type Point = readonly [x: number, y: number, z: number];

/** The host owns the level and phase. This adapter deliberately owns no clock or night ordinal. */
export type UndergroundWater90Authority = Readonly<{
  level: WaterLevel;
  phase?: WaterPhase;
}>;

/** A certified visual anchor only; it grants no mining, depletion or inventory authority. */
export type UndergroundWater90OreVisual = Readonly<{
  id: string;
  kind: 'underwater' | 'riverbed';
  at: Point;
  normal?: Point;
}>;

export type UndergroundWater90SceneState = Readonly<{
  level: WaterLevel;
  phase: WaterPhase | undefined;
  configured: boolean;
  form: WaterForm;
  waterMode: 'baseline' | 'raised' | 'hidden';
  surfaceRiseM: number;
}>;

export type UndergroundWater90Stats = Readonly<{
  layer: -90;
  level: WaterLevel;
  phase: WaterPhase | undefined;
  configuration: 'host' | 'unconfigured';
  form: WaterForm;
  waterMode: 'baseline' | 'raised' | 'hidden';
  surfaceRiseM: number;
  baselineWaterVisible: boolean;
  highWaterVisible: boolean;
  riverbedShortcutVisible: boolean;
  underwaterOreMarkers: number;
  riverbedOreMarkers: number;
  waterMeshVertices: number;
  colliders: 0;
  disposed: boolean;
}>;

/** The host supplies the certified visual rise; this module owns no knee-height rule. */

function isLevel(value: unknown): value is WaterLevel {
  return value === 'low' || value === 'mid' || value === 'high';
}
function isPhase(value: unknown): value is WaterPhase {
  return value === 'rise' || value === 'level' || value === 'fall';
}
function point(value: unknown): value is Point {
  return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
}

/**
 * The sole level/phase adapter. Missing or malformed authority is explicitly the
 * unconfigured mid baseline. A supplied phase is preserved, never converted to a
 * level or checked against a night sequence; `level` alone selects the form.
 */
export function adaptUndergroundWater90(
  authority: UndergroundWater90Authority | null | undefined,
  highSurfaceRiseM = 0,
): UndergroundWater90SceneState {
  if (!Number.isFinite(highSurfaceRiseM) || highSurfaceRiseM < 0) {
    throw new RangeError('C2 water high-surface rise must be a finite non-negative host value.');
  }
  const valid = authority !== null && authority !== undefined && isLevel(authority.level) &&
    (authority.phase === undefined || isPhase(authority.phase));
  const level = valid ? authority!.level : 'mid';
  const form = Object.freeze({ ...waterFormFor(-90, level) });
  return Object.freeze({
    level,
    phase: valid ? authority!.phase : undefined,
    configured: valid,
    form,
    waterMode: level === 'high' ? 'raised' : level === 'low' ? 'hidden' : 'baseline',
    surfaceRiseM: level === 'high' ? highSurfaceRiseM : 0,
  });
}

function geometryFrom(positions: Float32Array, name: string) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.name = name;
  return geometry;
}

function raisedSurface(positions: Float32Array, riseM: number) {
  const raised = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    raised[i] = positions[i];
    raised[i + 1] = positions[i + 1] + riseM;
    raised[i + 2] = positions[i + 2];
  }
  return raised;
}

/** Extract only the outside edges of the real non-indexed water triangles. */
function waterPerimeter(positions: Float32Array) {
  const vertices: Point[] = [];
  const ids = new Map<string, number>();
  const edges = new Map<string, { a: number; b: number; count: number }>();
  const idAt = (offset: number) => {
    const value: Point = [positions[offset], positions[offset + 1], positions[offset + 2]];
    const key = value.map(coordinate => coordinate.toFixed(5)).join(',');
    const existing = ids.get(key);
    if (existing !== undefined) return existing;
    const id = vertices.length;
    vertices.push(value);
    ids.set(key, id);
    return id;
  };
  const addEdge = (a: number, b: number) => {
    const first = Math.min(a, b), second = Math.max(a, b);
    const key = first + ':' + second;
    const edge = edges.get(key);
    if (edge) edge.count++;
    else edges.set(key, { a: first, b: second, count: 1 });
  };
  for (let i = 0; i < positions.length; i += 9) {
    const a = idAt(i), b = idAt(i + 3), c = idAt(i + 6);
    if (a === b || b === c || c === a) continue;
    addEdge(a, b); addEdge(b, c); addEdge(c, a);
  }
  return [...edges.values()].filter(edge => edge.count === 1)
    .map(edge => [vertices[edge.a]!, vertices[edge.b]!] as const);
}

function waterVolumeSides(positions: Float32Array, riseM: number) {
  const output: number[] = [];
  for (const [a, b] of waterPerimeter(positions)) {
    const ah: Point = [a[0], a[1] + riseM, a[2]];
    const bh: Point = [b[0], b[1] + riseM, b[2]];
    output.push(...ah, ...bh, ...b, ...ah, ...b, ...a);
  }
  return new Float32Array(output);
}

/** Height of the certified baseline surface over a local XZ point. */
function surfaceHeightAt(positions: Float32Array, x: number, z: number) {
  for (let i = 0; i < positions.length; i += 9) {
    const ax = positions[i], az = positions[i + 2];
    const bx = positions[i + 3], bz = positions[i + 5];
    const cx = positions[i + 6], cz = positions[i + 8];
    const denominator = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(denominator) < 1e-10) continue;
    const a = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / denominator;
    const b = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / denominator;
    const c = 1 - a - b;
    if (a >= -1e-5 && b >= -1e-5 && c >= -1e-5) {
      return a * positions[i + 1] + b * positions[i + 4] + c * positions[i + 7];
    }
  }
  return undefined;
}

function riverbedShortcut(mine: Mine) {
  const group = new Group();
  group.name = 'town-c2-water90-riverbed-shortcut-visual';
  const transforms: { at: Point; scale: Point; yaw: number }[] = [];
  const start = mine.anchors.poolLanding[2] - 1.45;
  const end = mine.anchors.shoreExit[2] - .35;
  for (let i = 0; i < 22; i++) {
    const z = start + (end - start) * i / 21;
    const x = Math.sin(i * 2.17) * .14;
    const passage = mine.queryPassage(x, z, 0, .1);
    if (!passage || (passage.zone !== 'pool' && passage.zone !== 'shore')) continue;
    transforms.push({
      at: [x, passage.floor + .012, z],
      scale: [.42 + (i % 3) * .08, .016, .25 + (i % 2) * .07],
      yaw: Math.sin(i * 1.31) * .22,
    });
  }
  // Three low-contrast chevrons point out along the existing shore; they are inlays,
  // not a new route, collider or permission to bypass the movement authority.
  for (let i = 0; i < 3; i++) {
    const z = end - .45 - i * .62;
    const passage = mine.queryPassage(0, z, 0, .1);
    if (!passage) continue;
    for (const side of [-1, 1]) transforms.push({
      at: [side * .16, passage.floor + .014, z],
      scale: [.34, .018, .07], yaw: side * .62,
    });
  }
  const geometry = new BoxGeometry();
  const material = new MeshStandardMaterial({ color: 0x8a806c, roughness: 1, flatShading: true });
  const mesh = new InstancedMesh(geometry, material, transforms.length);
  mesh.name = 'water90-exposed-riverbed-inlays';
  mesh.userData.visualOnly = true;
  const pose = new Object3D();
  transforms.forEach((transform, index) => {
    pose.position.fromArray(transform.at);
    pose.scale.fromArray(transform.scale);
    pose.rotation.set(0, transform.yaw, 0);
    pose.updateMatrix();
    mesh.setMatrixAt(index, pose.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  group.add(mesh);
  return { group, geometry, material, pieces: transforms.length };
}

/**
 * Mounts a visual-only overlay on the already certified mine domain root. The
 * caller supplies the existing `underground-mine-water` mesh and, when available,
 * the presence-side `tonight()` snapshot. No authority means mid/unconfigured.
 */
export function mountTownC2UndergroundWaterMinus90(host: Readonly<{
  parent: Group;
  mine: Mine;
  waterMesh: Mesh;
  /** Certified by the movement/world host; no physical default is claimed here. */
  highWaterOffsetM: number;
  readWater?: () => UndergroundWater90Authority | null | undefined;
  oreVisuals?: readonly UndergroundWater90OreVisual[];
}>) {
  const { parent, mine, waterMesh } = host;
  if (!Number.isFinite(host.highWaterOffsetM) || host.highWaterOffsetM <= 0) {
    throw new RangeError('C2 water overlay requires a positive certified high-water offset.');
  }
  const highRiseM = host.highWaterOffsetM;
  if (mine.anchors.poolLanding[1] !== -90 || mine.anchors.shoreExit[1] !== -90 ||
      !(waterMesh instanceof Mesh) || !waterMesh.geometry.getAttribute('position')) {
    throw new RangeError('C2 water overlay requires the certified -90 mine water mesh');
  }
  const attribute = waterMesh.geometry.getAttribute('position');
  const waterPositions = new Float32Array(mine.mesh.water);
  if (attribute.count !== waterPositions.length / 3) {
    throw new RangeError('C2 water overlay water mesh does not match the mine layout');
  }
  for (let i = 0; i < waterPositions.length; i += 3) {
    if (![waterPositions[i], waterPositions[i + 1], waterPositions[i + 2]].every(Number.isFinite) ||
        attribute.getX(i / 3) !== waterPositions[i] ||
        attribute.getY(i / 3) !== waterPositions[i + 1] ||
        attribute.getZ(i / 3) !== waterPositions[i + 2]) {
      throw new RangeError('C2 water overlay requires the certified mine water coordinates');
    }
  }
  const oreVisuals = host.oreVisuals ?? [];
  const oreIds = new Set<string>();
  for (const ore of oreVisuals) {
    if (!ore || !ore.id.trim() || oreIds.has(ore.id) || !point(ore.at) ||
        (ore.kind !== 'underwater' && ore.kind !== 'riverbed') ||
        (ore.normal !== undefined && (!point(ore.normal) ||
          Math.hypot(...ore.normal) < .0001))) {
      throw new RangeError('C2 water overlay requires unique certified ore visual anchors');
    }
    if (ore.kind === 'underwater') {
      const surface = surfaceHeightAt(waterPositions, ore.at[0], ore.at[2]);
      if (surface === undefined || ore.at[1] > surface + 1e-4) {
        throw new RangeError('Underwater ore visual is outside the certified water mesh: ' + ore.id);
      }
    }
    oreIds.add(ore.id);
  }

  const root = new Group();
  root.name = 'town-c2-underground-water-minus90';
  root.userData.visualOnly = true;
  const highWater = new Group();
  highWater.name = 'water90-high-knee-rise';
  const highSurfaceGeometry = geometryFrom(raisedSurface(waterPositions, highRiseM), 'water90-raised-surface');
  const highVolumeGeometry = geometryFrom(waterVolumeSides(waterPositions, highRiseM), 'water90-raised-volume');
  const highWaterMaterial = new MeshStandardMaterial({
    color: 0x497b8c, transparent: true, opacity: .62, roughness: .18,
    side: DoubleSide, depthWrite: false,
  });
  const highSurface = new Mesh(highSurfaceGeometry, highWaterMaterial);
  highSurface.name = 'water90-high-surface';
  const highVolume = new Mesh(highVolumeGeometry, highWaterMaterial);
  highVolume.name = 'water90-high-volume-sides';
  highSurface.renderOrder = highVolume.renderOrder = 2;
  highWater.add(highSurface, highVolume);
  root.add(highWater);

  const riverbed = riverbedShortcut(mine);
  root.add(riverbed.group);

  const oreRoot = new Group();
  oreRoot.name = 'water90-host-certified-ore-visuals';
  const crystalGeometry = new OctahedronGeometry(.12, 0);
  const ringGeometry = new TorusGeometry(.23, .018, 4, 16);
  const underwaterMaterial = new MeshStandardMaterial({
    color: 0x82d8cf, emissive: 0x2f746f, emissiveIntensity: .65, roughness: .35,
  });
  const riverbedMaterial = new MeshStandardMaterial({
    color: 0xc6aa72, emissive: 0x5c431f, emissiveIntensity: .35, roughness: .7,
  });
  const ringMaterial = new MeshBasicMaterial({ color: 0x9ee8df, transparent: true, opacity: .8 });
  const underwaterMarkers: Group[] = [];
  const riverbedMarkers: Group[] = [];
  for (const ore of oreVisuals) {
    const marker = new Group();
    marker.name = 'water90-ore-visual:' + ore.id;
    marker.userData.visualOnly = true;
    if (ore.kind === 'underwater') {
      const surface = surfaceHeightAt(waterPositions, ore.at[0], ore.at[2])!;
      const ring = new Mesh(ringGeometry, ringMaterial);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(ore.at[0], surface + highRiseM + .025, ore.at[2]);
      const crystal = new Mesh(crystalGeometry, underwaterMaterial);
      crystal.position.set(ore.at[0], surface + highRiseM + .16, ore.at[2]);
      crystal.scale.y = 1.45;
      marker.add(ring, crystal);
      underwaterMarkers.push(marker);
    } else {
      const offset = ore.normal ?? [0, 1, 0];
      const x = ore.at[0] + offset[0] * .1;
      const z = ore.at[2] + offset[2] * .1;
      const floor = mine.queryPassage(x, z, 0, .1)?.floor ?? ore.at[1];
      const crystal = new Mesh(crystalGeometry, riverbedMaterial);
      crystal.position.set(x, Math.max(ore.at[1] + offset[1] * .1, floor) + .13, z);
      crystal.scale.set(.85, 1.2, .85);
      marker.add(crystal);
      riverbedMarkers.push(marker);
    }
    oreRoot.add(marker);
  }
  root.add(oreRoot);
  parent.add(root);

  const originalWaterVisible = waterMesh.visible;
  const ownedGeometries = [highSurfaceGeometry, highVolumeGeometry, riverbed.geometry,
    crystalGeometry, ringGeometry];
  const ownedMaterials = [highWaterMaterial, riverbed.material,
    underwaterMaterial, riverbedMaterial, ringMaterial];
  let disposed = false;
  let manualAuthority: UndergroundWater90Authority | undefined;
  let state = adaptUndergroundWater90(undefined, highRiseM);

  function apply(next: UndergroundWater90SceneState) {
    state = next;
    waterMesh.visible = originalWaterVisible && next.waterMode === 'baseline';
    highWater.visible = next.waterMode === 'raised';
    riverbed.group.visible = next.form.riverbedOpen;
    for (const marker of underwaterMarkers) marker.visible = next.form.underwaterOre;
    for (const marker of riverbedMarkers) marker.visible = next.form.riverbedOpen;
  }

  function stats(): UndergroundWater90Stats {
    return Object.freeze({
      layer: -90,
      level: state.level,
      phase: state.phase,
      configuration: state.configured ? 'host' : 'unconfigured',
      form: state.form,
      waterMode: state.waterMode,
      surfaceRiseM: state.surfaceRiseM,
      baselineWaterVisible: !disposed && waterMesh.visible,
      highWaterVisible: !disposed && highWater.visible,
      riverbedShortcutVisible: !disposed && riverbed.group.visible,
      underwaterOreMarkers: disposed ? 0 : underwaterMarkers.filter(marker => marker.visible).length,
      riverbedOreMarkers: disposed ? 0 : riverbedMarkers.filter(marker => marker.visible).length,
      waterMeshVertices: attribute.count,
      colliders: 0,
      disposed,
    });
  }

  apply(state);
  return {
    group: root,
    setLevel(level: WaterLevel, phase?: WaterPhase) {
      if (disposed) return stats();
      manualAuthority = { level, phase };
      apply(adaptUndergroundWater90(manualAuthority, highRiseM));
      return stats();
    },
    sync() {
      if (disposed) return stats();
      const authority = host.readWater ? host.readWater() : manualAuthority;
      apply(adaptUndergroundWater90(authority, highRiseM));
      return stats();
    },
    stats,
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      waterMesh.visible = originalWaterVisible;
      for (const marker of [...underwaterMarkers, ...riverbedMarkers]) marker.visible = false;
      for (const geometry of ownedGeometries) geometry.dispose();
      for (const material of ownedMaterials) material.dispose();
      root.clear();
    },
  } as const;
}
