import {
  BufferGeometry, DataTexture, DoubleSide, Float32BufferAttribute, Group, Mesh,
  MeshLambertMaterial, NearestFilter, SRGBColorSpace,
} from 'three';
import {
  createMeteorCrater, meteorCraterDepth, meteorCraterFixturePlan, meteorCraterFloorRadius,
  meteorCraterRimRadius,
} from './meteor-crater';
import type { MeteorCraterWorldAnchor } from './meteor-crater-surface';
import type { Box } from './landmark-kit';
import type { mountWestCraterRoad } from './town-za22-crater-road';

/** Batch 95 / card 19: fixed bearings are clockwise from the real crater centre. */
export const craterBrokenCircleSpec = Object.freeze({
  collapseBearings: Object.freeze([40, 95, 150]),
  collapseWidth: 20,
  gullyBearings: Object.freeze([65, 125, 200, 255, 320]),
  gullyWidth: 2.4,
  gullyMaxDepth: 1.2,
  haulCorridorHalfWidth: 4.5,
  oldWorkClearance: 10,
  voxelSize: .8,
  /** Visual-only separation from the cut walk mesh; heightAt stays authoritative. */
  voxelSkinLift: .025,
});

export type CraterBrokenCircleFeature = Readonly<{
  id: string;
  kind: 'collapse' | 'gully';
  bearingDeg: number;
  width: number;
  innerRadius: number;
  outerRadius: number;
}>;

export type CraterBrokenCirclePlacement = Readonly<{
  id: string;
  featureId: string;
  kind: 'collapse-voxel' | 'gully-voxel' | 'haul-track';
  east: number;
  north: number;
  height: number;
  footprint: number;
}>;

type Ground = Pick<ReturnType<typeof mountWestCraterRoad>, 'anchor' | 'heightAt'>;
type Reserved = Readonly<{ east: number; north: number }>;
type LocalPoint = Readonly<{ east: number; north: number }>;
type FieldSample = Readonly<{ offset: number; kind: CraterBrokenCircleFeature['kind'] | 'haul' | undefined }>;

const fixture = createMeteorCrater(meteorCraterFixturePlan);
const tau = Math.PI * 2;
const radians = (degrees: number) => degrees * Math.PI / 180;
const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));
const smooth = (value: number) => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};
const positiveAngle = (angle: number) => (angle % tau + tau) % tau;
const angleDistance = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

export const craterBrokenCircleFeatures: readonly CraterBrokenCircleFeature[] = Object.freeze([
  ...craterBrokenCircleSpec.collapseBearings.map((bearing, index) => ({
    id: `collapse-${index + 1}`, kind: 'collapse' as const, bearingDeg: bearing,
    width: craterBrokenCircleSpec.collapseWidth,
    innerRadius: meteorCraterFloorRadius, outerRadius: meteorCraterRimRadius - .75,
  })),
  ...craterBrokenCircleSpec.gullyBearings.map((bearing, index) => ({
    id: `gully-${index + 1}`, kind: 'gully' as const, bearingDeg: bearing,
    width: craterBrokenCircleSpec.gullyWidth,
    innerRadius: meteorCraterFloorRadius + .25, outerRadius: meteorCraterRimRadius - .75,
  })),
]);

/** Collapse fans retain a narrow toe and open to exactly 20 m at their outer rim. */
export function craterCollapseWidthAtRadius(feature: CraterBrokenCircleFeature, radius: number) {
  if (feature.kind !== 'collapse') return 0;
  const t = clamp((radius - feature.innerRadius) / (feature.outerRadius - feature.innerRadius), 0, 1);
  return feature.width * (.18 + .82 * t);
}

function segmentDistance(point: LocalPoint, a: LocalPoint, b: LocalPoint) {
  const de = b.east - a.east, dn = b.north - a.north;
  const length = de * de + dn * dn;
  const t = length === 0 ? 0 : clamp(((point.east - a.east) * de + (point.north - a.north) * dn) / length, 0, 1);
  return Math.hypot(point.east - a.east - t * de, point.north - a.north - t * dn);
}

/**
 * Analytic, quantized height difference in fixture coordinates. Add this to the
 * existing road.heightAt result; never replace that authoritative surface.
 * The existing spiral/haul corridor is hard-excluded, so its geometry is intact.
 */
export function createCraterBrokenCircleHeightField(anchor: MeteorCraterWorldAnchor) {
  const { east: originE, north: originN, yaw } = anchor;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const haulRoute = Array.from({ length: 401 }, (_, index) => fixture.mainTrailPoint(index / 400));
  const haulSegments = haulRoute.slice(1).map((point, index) => [haulRoute[index]!, point] as const);

  function toLocal(east: number, north: number): LocalPoint {
    const dx = east - originE, dn = north - originN;
    return { east: dx * c - dn * s, north: dx * s + dn * c };
  }
  function toWorld(point: LocalPoint): LocalPoint {
    return { east: originE + point.east * c + point.north * s,
      north: originN + point.north * c - point.east * s };
  }
  function inHaulCorridor(point: LocalPoint) {
    return haulSegments.some(([a, b]) => segmentDistance(point, a, b) < craterBrokenCircleSpec.haulCorridorHalfWidth);
  }
  function localSample(east: number, north: number): FieldSample {
    if (!Number.isFinite(east) || !Number.isFinite(north)) return { offset: 0, kind: undefined };
    const radius = Math.hypot(east, north);
    if (radius < meteorCraterFloorRadius || radius >= meteorCraterRimRadius) return { offset: 0, kind: undefined };
    const point = { east, north };
    if (inHaulCorridor(point)) return { offset: 0, kind: 'haul' };
    const bearing = positiveAngle(Math.atan2(east, north));
    let collapseOffset: number | undefined;
    let gullyOffset = 0;
    let kind: FieldSample['kind'];
    for (const feature of craterBrokenCircleFeatures) {
      const centre = radians(feature.bearingDeg);
      if (radius < feature.innerRadius || radius > feature.outerRadius) continue;
      const transverse = radius * angleDistance(bearing, centre);
      if (feature.kind === 'collapse') {
        const halfWidth = craterCollapseWidthAtRadius(feature, radius) / 2;
        if (transverse >= halfWidth) continue;
        const side = smooth((halfWidth - transverse) / Math.max(.01, halfWidth * .22));
        const radial = smooth((radius - feature.innerRadius) / 1.5) *
          (1 - smooth((radius - feature.outerRadius) / .75));
        const ground = fixture.terraceHeightOffsetAt(radius) ?? 0;
        const descent = smooth((meteorCraterRimRadius - radius) /
          (meteorCraterRimRadius - meteorCraterFloorRadius));
        const candidate = (-meteorCraterDepth * descent - ground) * side * radial;
        if (collapseOffset === undefined || Math.abs(candidate) > Math.abs(collapseOffset)) {
          collapseOffset = candidate;
          kind = 'collapse';
        }
      } else {
        const halfWidth = feature.width * (.5 + .5 * smooth((radius - feature.innerRadius) / 3)) / 2;
        if (transverse >= halfWidth) continue;
        const across = smooth((halfWidth - transverse) / Math.max(.01, halfWidth * .3));
        const along = smooth((radius - feature.innerRadius) / 2.5) *
          (1 - smooth((radius - feature.outerRadius) / 2));
        const candidate = -craterBrokenCircleSpec.gullyMaxDepth * across * along;
        if (candidate < gullyOffset) { gullyOffset = candidate; kind = 'gully'; }
      }
    }
    // A gully is a shallow cut in the broken surface, never a second deeper
    // collapse stacked on top of a fan. Its total signed offset stays <=1.2 m.
    const offset = gullyOffset < 0 ? gullyOffset : collapseOffset ?? 0;
    if (offset === 0) return { offset: 0, kind: undefined };
    const step = gullyOffset < 0 ? .15 : .3;
    return { offset: Math.round(offset / step) * step, kind };
  }

  return {
    toLocal,
    toWorld,
    inHaulCorridor,
    sampleAt: localSample,
    localHeightOffsetAt(east: number, north: number) { return localSample(east, north).offset; },
    heightOffsetAt(east: number, north: number) {
      const local = toLocal(east, north);
      return localSample(local.east, local.north).offset;
    },
  };
}

/** Cut the anchored walk mesh with the final reserved-work-filtered offset field. */
export function applyCraterBrokenCircleToWalkMesh(
  mesh: Mesh,
  anchor: MeteorCraterWorldAnchor,
  heightOffsetAt: (east: number, north: number) => number,
) {
  const geometry = mesh.geometry;
  const positions = geometry.getAttribute('position');
  if (!positions) throw new Error('Broken-circle walk mesh has no position attribute.');
  if (![anchor.east, anchor.north, anchor.rimHeight, anchor.yaw].every(Number.isFinite)) {
    throw new RangeError('Broken-circle terrain requires the live crater anchor.');
  }
  const c = Math.cos(anchor.yaw), s = Math.sin(anchor.yaw);
  for (let index = 0; index < positions.count; index++) {
    // B-01 is fixture-local: +X east, -Z north; world space applies final reservations.
    const east = positions.getX(index), north = -positions.getZ(index);
    const worldEast = anchor.east + east * c + north * s;
    const worldNorth = anchor.north + north * c - east * s;
    const offset = heightOffsetAt(worldEast, worldNorth);
    if (Number.isFinite(offset)) positions.setY(index, positions.getY(index) + offset);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}

function grain(base: number, fleck: number) {
  const size = 16;
  const bytes = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const color = (x * 7 + y * 11 + Math.floor(x / 4) * 13) % 17 < 3 ? fleck : base;
    bytes.set([color >> 16, color >> 8 & 255, color & 255, 255], (y * size + x) * 4);
  }
  const texture = new DataTexture(bytes, size, size);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
function material(base: number, fleck: number) {
  return new MeshLambertMaterial({
    map: grain(base, fleck), flatShading: true,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
}

type Cell = LocalPoint & { top: number; base: number; kind: 'collapse' | 'gully' };

function voxelGeometry(cells: readonly Cell[], size: number) {
  const positions: number[] = [], indices: number[] = [];
  const lookup = new Map(cells.map((cell, index) => [`${cell.east.toFixed(3)},${cell.north.toFixed(3)}`, index]));
  const half = size / 2;
  const vertex = (east: number, height: number, north: number) => {
    positions.push(east, height, -north);
    return positions.length / 3 - 1;
  };
  const quad = (a: number, b: number, c: number, d: number) => indices.push(a, b, c, a, c, d);
  cells.forEach((cell, index) => {
    const e = cell.east, n = cell.north;
    const a = vertex(e - half, cell.top, n - half), b = vertex(e + half, cell.top, n - half);
    const c = vertex(e + half, cell.top, n + half), d = vertex(e - half, cell.top, n + half);
    quad(a, b, c, d);
    const neighbours = [
      { key: `${(e - size).toFixed(3)},${n.toFixed(3)}`, edge: [a, d] },
      { key: `${(e + size).toFixed(3)},${n.toFixed(3)}`, edge: [b, c] },
      { key: `${e.toFixed(3)},${(n - size).toFixed(3)}`, edge: [a, b] },
      { key: `${e.toFixed(3)},${(n + size).toFixed(3)}`, edge: [d, c] },
    ];
    for (const { key, edge } of neighbours) {
      const other = lookup.get(key);
      const lower = other === undefined ? cell.base - .08 : Math.min(cell.base - .08, cells[other]!.top - .035);
      if (other !== undefined && Math.abs(cells[other]!.top - cell.top) < .035) continue;
      const bottomA = vertex(cells[index]!.east + (edge[0] === a ? -half : half), lower,
        cells[index]!.north + (edge[0] === a || edge[0] === b ? -half : half));
      const bottomB = vertex(cells[index]!.east + (edge[1] === b || edge[1] === c ? half : -half), lower,
        cells[index]!.north + (edge[1] === c || edge[1] === d ? half : -half));
      quad(edge[0], bottomA, bottomB, edge[1]);
    }
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function trackGeometry(points: readonly (LocalPoint & { height: number })[], width: number, heightDatum: number) {
  const positions: number[] = [], indices: number[] = [];
  points.forEach((point, index) => {
    const before = points[Math.max(0, index - 1)]!, after = points[Math.min(points.length - 1, index + 1)]!;
    const length = Math.hypot(after.east - before.east, after.north - before.north) || 1;
    const sideE = -(after.north - before.north) / length * width / 2;
    const sideN = (after.east - before.east) / length * width / 2;
    positions.push(point.east - sideE, point.height - heightDatum, -(point.north - sideN),
      point.east + sideE, point.height - heightDatum, -(point.north + sideN));
    if (index > 0) {
      const a = (index - 1) * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Builds walkable voxel cut/fill skins and two compacted haul traces. Old ZA-36
 * pieces are read-only reservations: new placement footprints keep 10 m clear.
 * No terrain wall or prop collider is introduced; heightAt is the walk surface.
 */
export function buildTownC2CraterBrokenCircle(road: Ground,
  options: Readonly<{ oldWorkPlacements?: readonly Reserved[] }> = {}) {
  const anchor = road.anchor;
  // Capture the baseline before the host wraps road.heightAt with this offset;
  // built.heightAt therefore remains safe to call after host integration.
  const baseHeightAt = road.heightAt;
  if (![anchor.east, anchor.north, anchor.rimHeight, anchor.yaw].every(Number.isFinite)) {
    throw new RangeError('Broken-circle terrain requires the live crater anchor.');
  }
  const field = createCraterBrokenCircleHeightField(anchor);
  const group = new Group();
  group.name = 'town-c2-crater-broken-circle';
  // Skins and traces are authored in fixture coordinates, just like B-01.
  group.position.set(anchor.east, anchor.rimHeight, -anchor.north);
  group.rotation.y = -anchor.yaw;
  group.userData.features = craterBrokenCircleFeatures;
  group.userData.heightAuthority = 'town-za22-crater-road.heightAt + brokenCircle.heightOffsetAt';
  const placements: CraterBrokenCirclePlacement[] = [];
  // Flat geological skins are traversable. Export the existing-channel array,
  // deliberately empty, rather than inventing invisible walls around relief.
  const colliders: Box[] = [];
  const reserved = options.oldWorkPlacements ?? [];
  const clearOfOldWork = (point: LocalPoint, footprint: number) => reserved.every(old =>
    Math.hypot(point.east - old.east, point.north - old.north) >=
    craterBrokenCircleSpec.oldWorkClearance + footprint);
  const size = craterBrokenCircleSpec.voxelSize;
  const cells: Cell[] = [];
  const limit = Math.floor(meteorCraterRimRadius / size);
  for (let row = -limit; row <= limit; row++) for (let column = -limit; column <= limit; column++) {
    const local = { east: column * size, north: row * size };
    const sample = field.sampleAt(local.east, local.north);
    if (!sample.kind || sample.kind === 'haul' || sample.offset === 0) continue;
    const world = field.toWorld(local);
    const base = baseHeightAt(world.east, world.north);
    if (base === undefined || !Number.isFinite(base)) continue;
    const footprint = size * Math.SQRT1_2;
    if (!clearOfOldWork(world, footprint)) continue;
    cells.push({ ...local, top: base + sample.offset + craterBrokenCircleSpec.voxelSkinLift - anchor.rimHeight,
      base: base - anchor.rimHeight, kind: sample.kind });
    placements.push({
      id: `${sample.kind}-${row}-${column}`, featureId: '', kind: `${sample.kind}-voxel`,
      east: world.east, north: world.north, height: base + sample.offset, footprint,
    });
  }
  const materials = {
    collapse: material(0x746b62, 0x4b4540),
    gully: material(0x49433c, 0x292723),
  };
  for (const kind of ['collapse', 'gully'] as const) {
    const subset = cells.filter(cell => cell.kind === kind);
    if (!subset.length) continue;
    const mesh = new Mesh(voxelGeometry(subset, size), materials[kind]);
    mesh.name = `town-c2-broken-circle-${kind}-voxels`;
    group.add(mesh);
  }
  // Associate material cells with the nearest prescribed radial feature.
  for (const placement of placements) {
    if (placement.kind === 'haul-track') continue;
    const local = field.toLocal(placement.east, placement.north);
    const bearing = positiveAngle(Math.atan2(local.east, local.north));
    const candidates = craterBrokenCircleFeatures.filter(feature => feature.kind === placement.kind.slice(0, -6));
    const nearest = candidates.sort((a, b) => angleDistance(bearing, radians(a.bearingDeg)) -
      angleDistance(bearing, radians(b.bearingDeg)))[0];
    if (nearest) (placement as { featureId: string }).featureId = nearest.id;
  }

  // Two visual traces flank, but never redefine, the existing descending trail.
  const trackPoints = Array.from({ length: 181 }, (_, index) => {
    const local = fixture.mainTrailPoint(index / 180);
    const before = fixture.mainTrailPoint(Math.max(0, index - .5) / 180);
    const after = fixture.mainTrailPoint(Math.min(180, index + .5) / 180);
    const length = Math.hypot(after.east - before.east, after.north - before.north) || 1;
    const sideE = -(after.north - before.north) / length;
    const sideN = (after.east - before.east) / length;
    return { local, sideE, sideN };
  });
  const trackMaterial = material(0x5b5045, 0x36312c);
  trackMaterial.side = DoubleSide; // The two flanking strips wind with the spiral.
  for (const side of [-1, 1]) {
    const points = trackPoints.map(({ local, sideE, sideN }) => {
      const offset = side * 3.15;
      const point = { east: local.east + sideE * offset, north: local.north + sideN * offset };
      const world = field.toWorld(point);
      const base = baseHeightAt(world.east, world.north);
      return { ...point, height: (base ?? anchor.rimHeight) + .035 };
    });
    const mesh = new Mesh(trackGeometry(points, 1.05, anchor.rimHeight), trackMaterial);
    mesh.name = `town-c2-haul-compacted-trace-${side < 0 ? 'west' : 'east'}`;
    group.add(mesh);
    points.forEach((point, index) => {
      const world = field.toWorld(point);
      if (!clearOfOldWork(world, .55)) return;
      placements.push({ id: `haul-${side}-${index}`, featureId: 'south-haul-notch',
        kind: 'haul-track', east: world.east, north: world.north, height: point.height, footprint: .55 });
    });
  }

  function heightOffsetAt(east: number, north: number) {
    if (!clearOfOldWork({ east, north }, size * Math.SQRT1_2)) return 0;
    return field.heightOffsetAt(east, north);
  }
  function heightAt(east: number, north: number) {
    const base = baseHeightAt(east, north);
    return base === undefined || !Number.isFinite(base) ? base : base + heightOffsetAt(east, north);
  }
  return { group, placements, colliders, features: craterBrokenCircleFeatures, heightOffsetAt, heightAt };
}
