import {
  BufferAttribute, BufferGeometry, DataTexture, Group, Mesh, MeshLambertMaterial,
  NearestFilter, RepeatWrapping, SRGBColorSpace,
} from 'three';

export type TownC2CraterWorldPoint = Readonly<{ east: number; north: number }>;
export type TownC2CraterMoundAnchor = TownC2CraterWorldPoint & Readonly<{
  rimHeight: number;
  /** Clockwise radians from world north to the crater fixture's north. */
  yaw: number;
}>;
export type TownC2CraterWorkFace = TownC2CraterWorldPoint & Readonly<{
  radius: number;
  feather: number;
}>;

export type TownC2CraterCentralMoundSettings = Readonly<{
  center: TownC2CraterWorldPoint;
  radius: number;
  height: number;
  rimWidth: number;
  crownRadius: number;
  voxelSize: number;
  workFace: TownC2CraterWorkFace;
}>;

export type TownC2CraterCentralMoundOptions = Readonly<{
  center?: TownC2CraterWorldPoint;
  radius?: number;
  height?: number;
  rimWidth?: number;
  crownRadius?: number;
  voxelSize?: number;
  workFace?: Partial<TownC2CraterWorkFace>;
  /** Relative crater-floor datum used by the standalone visual builder. */
  floorOffset?: number;
  /** Optional relative terrain sampler; the live host should supply terrace heights. */
  floorHeightAtLocal?: (east: number, north: number) => number | undefined;
}>;

/** Reviewed ZA-22 anchor. rimHeight is zero here because the height model is relative. */
export const townC2CraterCentralMoundAnchor: TownC2CraterMoundAnchor = Object.freeze({
  east: -120,
  north: 185,
  rimHeight: 0,
  // Same surveyed south approach as town-za22-crater-road.ts: N159 is 26 m south of the rim centre.
  yaw: Math.atan2(Math.sqrt(55 ** 2 - 26 ** 2), -26) - .7,
});

/** Batch 95 C2-01 dimensions, in world metres. The work face is a smooth south-foot notch. */
export const townC2CraterCentralMoundPlan: TownC2CraterCentralMoundSettings = Object.freeze({
  center: Object.freeze({ east: -120, north: 196 }),
  radius: 21,
  height: 7.5,
  rimWidth: 4,
  crownRadius: 4,
  voxelSize: .75,
  workFace: Object.freeze({ east: -120.6, north: 182.7, radius: 8, feather: 2 }),
});

const lampRoomFixture = Object.freeze({ east: -10, south: 10, radius: 3.3 });
const lampRoomC = Math.cos(townC2CraterCentralMoundAnchor.yaw);
const lampRoomS = Math.sin(townC2CraterCentralMoundAnchor.yaw);
export const townC2CraterCentralMoundProtectedSites = Object.freeze({
  well: Object.freeze({ east: -120, north: 185, radius: 3.8 }),
  winch: Object.freeze({ east: -120.7468, north: 180.605, radius: 1.4 }),
  // Mirror the read-only lamp-room fixture transform so its whole base stays on B-01 ground.
  lampRoom: Object.freeze({
    east: townC2CraterCentralMoundAnchor.east + lampRoomFixture.east * lampRoomC - lampRoomFixture.south * lampRoomS,
    north: townC2CraterCentralMoundAnchor.north - lampRoomFixture.south * lampRoomC - lampRoomFixture.east * lampRoomS,
    radius: lampRoomFixture.radius,
  }),
});

export type TownC2CraterCentralMoundModel = Readonly<{
  anchor: TownC2CraterMoundAnchor;
  settings: TownC2CraterCentralMoundSettings;
  localCenter: TownC2CraterWorldPoint;
  localToWorld(east: number, north: number): TownC2CraterWorldPoint;
  worldToLocal(east: number, north: number): TownC2CraterWorldPoint;
  /** Un-composed mound rise above the supplied terrain; zero outside the nominal radius. */
  surfaceHeightAtWorld(east: number, north: number): number;
  surfaceHeightAtLocal(east: number, north: number): number;
  /** Height-authority override, or undefined where the mound leaves terrain unchanged. */
  heightOverrideAtLocal(east: number, north: number, floorOffset: number): number | undefined;
  /** max(terrain, terrain + mound), expressed as a relative crater height. */
  composeHeightOffsetAtLocal(east: number, north: number, floorOffset: number): number;
  composeHeightOffsetAtWorld(east: number, north: number, floorOffset: number): number;
  /** Absolute-world helper for the live road height sampler. */
  composeHeightAtWorld(east: number, north: number, baseHeight: number): number;
  survey(): TownC2CraterCentralMoundSurvey;
}>;

export type TownC2CraterCentralMoundSurvey = Readonly<{
  centerWorld: TownC2CraterWorldPoint;
  centerLocal: TownC2CraterWorldPoint;
  radius: number;
  height: number;
  rimWidth: number;
  crownRadius: number;
  voxelSize: number;
  maxSurfaceHeight: number;
  sampledFootprintM2: number;
  workFace: TownC2CraterWorkFace;
  protectedClearanceM: Readonly<{ well: number; winch: number }>;
}>;

export type TownC2CraterCentralMoundGeometryStats = Readonly<{
  voxelCount: number;
  exposedBlockFaces: number;
  triangles: number;
  materialFamilies: number;
  materialVoxelCounts: Readonly<Record<TownC2CraterMoundFamily, number>>;
  maxVisualRise: number;
  bounds: Readonly<{
    minEast: number; maxEast: number; minNorth: number; maxNorth: number;
    minHeightOffset: number; maxHeightOffset: number;
  }>;
}>;

export type TownC2CraterMoundFamily = 'scorched-earth' | 'basalt' | 'slag';

const defaultFloorOffset = -35;
const surveyStep = .25;
const familyOrder: readonly TownC2CraterMoundFamily[] = ['scorched-earth', 'basalt', 'slag'];

function finite(value: number, label: string) {
  if (!Number.isFinite(value)) throw new RangeError(`Central mound ${label} must be finite.`);
}

function smoothstep(value: number) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

function hash2(x: number, z: number) {
  let value = Math.imul(x, 374761393) + Math.imul(z, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return (value ^ (value >>> 16)) >>> 0;
}

function resolveSettings(options: TownC2CraterCentralMoundOptions): TownC2CraterCentralMoundSettings {
  const settings: TownC2CraterCentralMoundSettings = {
    center: options.center ?? townC2CraterCentralMoundPlan.center,
    radius: options.radius ?? townC2CraterCentralMoundPlan.radius,
    height: options.height ?? townC2CraterCentralMoundPlan.height,
    rimWidth: options.rimWidth ?? townC2CraterCentralMoundPlan.rimWidth,
    crownRadius: options.crownRadius ?? townC2CraterCentralMoundPlan.crownRadius,
    voxelSize: options.voxelSize ?? townC2CraterCentralMoundPlan.voxelSize,
    workFace: { ...townC2CraterCentralMoundPlan.workFace, ...options.workFace },
  };
  for (const [label, value] of Object.entries({
    centerEast: settings.center.east, centerNorth: settings.center.north,
    radius: settings.radius, height: settings.height, rimWidth: settings.rimWidth,
    crownRadius: settings.crownRadius, voxelSize: settings.voxelSize,
    workFaceEast: settings.workFace.east, workFaceNorth: settings.workFace.north,
    workFaceRadius: settings.workFace.radius, workFaceFeather: settings.workFace.feather,
  })) finite(value, label);
  if (settings.radius <= 0 || settings.height <= 0 || settings.voxelSize <= 0 ||
    settings.rimWidth <= 0 || settings.rimWidth >= settings.radius ||
    settings.crownRadius < 0 || settings.crownRadius >= settings.radius - settings.rimWidth ||
    settings.workFace.radius <= 0 || settings.workFace.feather <= 0) {
    throw new RangeError('Central mound dimensions must leave a positive crown, slope and smooth rim.');
  }
  return Object.freeze({
    ...settings,
    center: Object.freeze({ ...settings.center }),
    workFace: Object.freeze({ ...settings.workFace }),
  });
}

/** Pure EN/height model. World centre is authoritative; crater yaw only changes its local frame. */
export function createTownC2CraterCentralMound(
  anchor: TownC2CraterMoundAnchor,
  options: TownC2CraterCentralMoundOptions = {},
): TownC2CraterCentralMoundModel {
  for (const [label, value] of Object.entries({
    east: anchor.east, north: anchor.north, rimHeight: anchor.rimHeight, yaw: anchor.yaw,
  })) finite(value, `anchor ${label}`);
  const settings = resolveSettings(options);
  const c = Math.cos(anchor.yaw), s = Math.sin(anchor.yaw);
  const dx = settings.center.east - anchor.east, dn = settings.center.north - anchor.north;
  const localCenter = Object.freeze({ east: dx * c - dn * s, north: dx * s + dn * c });

  function localToWorld(east: number, north: number) {
    return {
      east: anchor.east + east * c + north * s,
      north: anchor.north + north * c - east * s,
    };
  }

  function worldToLocal(east: number, north: number) {
    const x = east - anchor.east, n = north - anchor.north;
    return { east: x * c - n * s, north: x * s + n * c };
  }

  function surfaceHeightAtLocal(east: number, north: number) {
    if (!Number.isFinite(east) || !Number.isFinite(north)) return 0;
    const radius = Math.hypot(east - localCenter.east, north - localCenter.north);
    const { radius: outerRadius, height, rimWidth, crownRadius, workFace } = settings;
    if (radius >= outerRadius) return 0;
    const shoulderRadius = outerRadius - rimWidth;
    let rise: number;
    if (radius <= crownRadius) {
      rise = height;
    } else if (radius <= shoulderRadius) {
      // Cubic Hermite: flat crown, then a C1 join to the linear outer shoulder.
      const span = shoulderRadius - crownRadius;
      const t = (radius - crownRadius) / span;
      const endHeight = height * rimWidth / outerRadius;
      const endSlope = -height * span / outerRadius;
      rise = height * (2 * t ** 3 - 3 * t ** 2 + 1) +
        endSlope * (t ** 3 - t ** 2) + endHeight * (-2 * t ** 3 + 3 * t ** 2);
    } else {
      // The approved last 4 m are a C1 smoothstep to zero at the nominal radius.
      const t = (radius - shoulderRadius) / rimWidth;
      rise = height * rimWidth / outerRadius * (1 - t) ** 2 * (1 + t);
    }
    const world = localToWorld(east, north);
    const workDistance = Math.hypot(world.east - workFace.east, world.north - workFace.north);
    if (workDistance <= workFace.radius) return 0;
    if (workDistance < workFace.radius + workFace.feather) {
      rise *= smoothstep((workDistance - workFace.radius) / workFace.feather);
    }
    for (const site of Object.values(townC2CraterCentralMoundProtectedSites)) {
      const distance = Math.hypot(world.east - site.east, world.north - site.north);
      if (distance <= site.radius) return 0;
      if (distance < site.radius + 2) rise *= smoothstep((distance - site.radius) / 2);
    }
    return Math.max(0, rise);
  }

  function surfaceHeightAtWorld(east: number, north: number) {
    if (!Number.isFinite(east) || !Number.isFinite(north)) return 0;
    const local = worldToLocal(east, north);
    return surfaceHeightAtLocal(local.east, local.north);
  }

  function heightOverrideAtLocal(east: number, north: number, floorOffset: number) {
    if (!Number.isFinite(east) || !Number.isFinite(north) || !Number.isFinite(floorOffset)) return;
    const rise = surfaceHeightAtLocal(east, north);
    return rise > 1e-9 ? floorOffset + rise : undefined;
  }

  function composeHeightOffsetAtLocal(east: number, north: number, floorOffset: number) {
    if (!Number.isFinite(east) || !Number.isFinite(north) || !Number.isFinite(floorOffset)) {
      throw new RangeError('Central mound height composition requires finite coordinates and floor height.');
    }
    return Math.max(floorOffset, floorOffset + surfaceHeightAtLocal(east, north));
  }

  function survey(): TownC2CraterCentralMoundSurvey {
    let maxSurfaceHeight = 0, occupied = 0;
    const minEast = settings.center.east - settings.radius, maxEast = settings.center.east + settings.radius;
    const minNorth = settings.center.north - settings.radius, maxNorth = settings.center.north + settings.radius;
    for (let north = minNorth + surveyStep / 2; north < maxNorth; north += surveyStep) {
      for (let east = minEast + surveyStep / 2; east < maxEast; east += surveyStep) {
        const rise = surfaceHeightAtWorld(east, north);
        maxSurfaceHeight = Math.max(maxSurfaceHeight, rise);
        if (rise > 1e-9) occupied++;
      }
    }
    maxSurfaceHeight = Math.max(maxSurfaceHeight,
      surfaceHeightAtWorld(settings.center.east, settings.center.north));
    const clearance = (site: TownC2CraterWorldPoint & { radius: number }) =>
      settings.workFace.radius - site.radius -
      Math.hypot(site.east - settings.workFace.east, site.north - settings.workFace.north);
    return Object.freeze({
      centerWorld: Object.freeze({ ...settings.center }),
      centerLocal: Object.freeze({ ...localCenter }),
      radius: settings.radius,
      height: settings.height,
      rimWidth: settings.rimWidth,
      crownRadius: settings.crownRadius,
      voxelSize: settings.voxelSize,
      maxSurfaceHeight,
      sampledFootprintM2: occupied * surveyStep ** 2,
      workFace: Object.freeze({ ...settings.workFace }),
      protectedClearanceM: Object.freeze({
        well: clearance(townC2CraterCentralMoundProtectedSites.well),
        winch: clearance(townC2CraterCentralMoundProtectedSites.winch),
      }),
    });
  }

  return Object.freeze({
    anchor: Object.freeze({ ...anchor }), settings, localCenter, localToWorld, worldToLocal,
    surfaceHeightAtWorld, surfaceHeightAtLocal, heightOverrideAtLocal,
    composeHeightOffsetAtLocal, composeHeightOffsetAtWorld(east, north, floorOffset) {
      const local = worldToLocal(east, north);
      return composeHeightOffsetAtLocal(local.east, local.north, floorOffset);
    }, composeHeightAtWorld(east, north, baseHeight) {
      if (!Number.isFinite(east) || !Number.isFinite(north) || !Number.isFinite(baseHeight)) {
        throw new RangeError('Central mound world height composition requires finite coordinates and base height.');
      }
      return Math.max(baseHeight, baseHeight + surfaceHeightAtWorld(east, north));
    }, survey,
  });
}

type GeometryBatch = {
  positions: number[]; normals: number[]; uvs: number[]; colors: number[];
};
type VoxelCell = {
  east: number; north: number; base: number; top: number; layers: number;
  family: TownC2CraterMoundFamily; shade: number;
};

const familyPalette: Readonly<Record<TownC2CraterMoundFamily, readonly [number, number, number]>> = {
  'scorched-earth': [0x493a30, 0x6a5140, 0x282420],
  basalt: [0x555552, 0x77736a, 0x343634],
  slag: [0x76503b, 0xa2764e, 0x40352d],
};

function pixelTexture(family: TownC2CraterMoundFamily) {
  const [base, grain, outline] = familyPalette[family];
  const size = 16, pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const border = x === 0 || y === 0 || x === size - 1 || y === size - 1;
    const cluster = (Math.floor(x / 3) * 5 + Math.floor(y / 4) * 7) % 11;
    const pit = (x * 7 + y * 13) % 17 === 0;
    const color = border || pit ? outline : cluster < 3 ? grain : base;
    pixels.set([color >> 16, (color >> 8) & 255, color & 255, 255], (y * size + x) * 4);
  }
  const texture = new DataTexture(pixels, size, size);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = texture.magFilter = NearestFilter;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function addBlockFace(batch: GeometryBatch, corners: readonly (readonly [number, number, number])[],
  normal: readonly [number, number, number], shade: number) {
  const order = [0, 1, 2, 0, 2, 3];
  const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
  for (const index of order) {
    batch.positions.push(...corners[index]);
    batch.normals.push(...normal);
    batch.uvs.push(...uvs[index]);
    batch.colors.push(shade, shade, shade);
  }
}

/**
 * Builds exposed voxel faces only. The group is in world ENY space; add it to a world-space
 * owner such as the ZA-22 road group, not to the already transformed crater surface group.
 */
export function buildTownC2CraterCentralMound(
  anchor: TownC2CraterMoundAnchor,
  options: TownC2CraterCentralMoundOptions = {},
) {
  const model = createTownC2CraterCentralMound(anchor, options);
  const { settings } = model;
  const floorOffset = options.floorOffset ?? defaultFloorOffset;
  finite(floorOffset, 'floor offset');
  const size = settings.voxelSize, half = size / 2;
  const extent = Math.ceil(settings.radius / size);
  const cells = new Map<string, VoxelCell>();
  const counts: Record<TownC2CraterMoundFamily, number> = {
    'scorched-earth': 0, basalt: 0, slag: 0,
  };
  let minHeight = Infinity, maxHeight = -Infinity, maxVisualRise = 0;
  let minEast = Infinity, maxEast = -Infinity, minNorth = Infinity, maxNorth = -Infinity;

  for (let z = -extent; z <= extent; z++) for (let x = -extent; x <= extent; x++) {
    const east = model.localCenter.east + x * size, north = model.localCenter.north + z * size;
    const rise = model.surfaceHeightAtLocal(east, north);
    const layers = Math.round(rise / size);
    if (layers <= 0) continue;
    const base = options.floorHeightAtLocal?.(east, north) ?? floorOffset;
    if (!Number.isFinite(base)) continue;
    const top = base + rise;
    const random = hash2(x, z);
    const family: TownC2CraterMoundFamily = layers >= 7 && random % 11 < 2 ? 'slag' :
      random % 12 < 5 ? 'basalt' : 'scorched-earth';
    const cell: VoxelCell = {
      east, north, base, top, layers, family, shade: .88 + (random % 9) * .025,
    };
    cells.set(`${x},${z}`, cell);
    counts[family]++;
    minHeight = Math.min(minHeight, base); maxHeight = Math.max(maxHeight, top);
    maxVisualRise = Math.max(maxVisualRise, top - base);
    minEast = Math.min(minEast, east - half); maxEast = Math.max(maxEast, east + half);
    minNorth = Math.min(minNorth, north - half); maxNorth = Math.max(maxNorth, north + half);
  }

  const batches: Record<TownC2CraterMoundFamily, GeometryBatch> = {
    'scorched-earth': { positions: [], normals: [], uvs: [], colors: [] },
    basalt: { positions: [], normals: [], uvs: [], colors: [] },
    slag: { positions: [], normals: [], uvs: [], colors: [] },
  };
  let exposedBlockFaces = 0;
  const face = (cell: VoxelCell, corners: readonly (readonly [number, number, number])[],
    normal: readonly [number, number, number]) => {
    addBlockFace(batches[cell.family], corners, normal, cell.shade);
    exposedBlockFaces++;
  };
  const neighbour = (x: number, z: number, dx: number, dz: number) =>
    cells.get(`${x + dx},${z + dz}`);

  for (const [key, cell] of cells) {
    const [x, z] = key.split(',').map(Number);
    const x0 = cell.east - half, x1 = cell.east + half;
    const z0 = -(cell.north + half), z1 = -(cell.north - half);
    const y = cell.top;
    face(cell, [[x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0]], [0, 1, 0]);

    const sides = [
      { dx: 1, dz: 0, normal: [1, 0, 0] as const, corners: (lo: number, hi: number) =>
        [[x1, lo, z0], [x1, hi, z0], [x1, hi, z1], [x1, lo, z1]] as const },
      { dx: -1, dz: 0, normal: [-1, 0, 0] as const, corners: (lo: number, hi: number) =>
        [[x0, lo, z1], [x0, hi, z1], [x0, hi, z0], [x0, lo, z0]] as const },
      { dx: 0, dz: -1, normal: [0, 0, -1] as const, corners: (lo: number, hi: number) =>
        [[x0, lo, z0], [x0, hi, z0], [x1, hi, z0], [x1, lo, z0]] as const },
      { dx: 0, dz: 1, normal: [0, 0, 1] as const, corners: (lo: number, hi: number) =>
        [[x1, lo, z1], [x1, hi, z1], [x0, hi, z1], [x0, lo, z1]] as const },
    ] as const;
    for (const side of sides) {
      const adjacent = neighbour(x, z, side.dx, side.dz);
      let lower = Math.max(cell.base, adjacent?.top ?? cell.base);
      // Each exposed course is a separate textured quad, preserving visible voxel steps.
      while (lower < y - 1e-7) {
        const upper = Math.min(y, lower + size);
        face(cell, side.corners(lower, upper), side.normal);
        lower = upper;
      }
    }
  }

  const group = new Group();
  group.name = 'town-c2-crater-central-mound';
  group.position.set(anchor.east, anchor.rimHeight, -anchor.north);
  group.rotation.y = -anchor.yaw;
  const meshes: Mesh<BufferGeometry, MeshLambertMaterial>[] = [];
  const materials: MeshLambertMaterial[] = [];
  const textures: DataTexture[] = [];
  for (const family of familyOrder) {
    const batch = batches[family];
    if (!batch.positions.length) continue;
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(batch.positions), 3));
    geometry.setAttribute('normal', new BufferAttribute(new Float32Array(batch.normals), 3));
    geometry.setAttribute('uv', new BufferAttribute(new Float32Array(batch.uvs), 2));
    geometry.setAttribute('color', new BufferAttribute(new Float32Array(batch.colors), 3));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const texture = pixelTexture(family);
    const material = new MeshLambertMaterial({
      map: texture, vertexColors: true, flatShading: true,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
    const mesh = new Mesh(geometry, material);
    mesh.name = `town-c2-crater-central-mound/${family}`;
    group.add(mesh);
    meshes.push(mesh); materials.push(material); textures.push(texture);
  }

  const survey = model.survey();
  const stats: TownC2CraterCentralMoundGeometryStats = Object.freeze({
    voxelCount: cells.size,
    exposedBlockFaces,
    triangles: exposedBlockFaces * 2,
    materialFamilies: meshes.length,
    materialVoxelCounts: Object.freeze({ ...counts }),
    maxVisualRise,
    bounds: Object.freeze({
      minEast, maxEast, minNorth, maxNorth, minHeightOffset: minHeight, maxHeightOffset: maxHeight,
    }),
  });
  group.userData.townC2CraterCentralMound = Object.freeze({ survey, stats });
  group.userData.walkHeightAuthority = 'meteor-crater.heightOffsetAt';
  let disposed = false;
  return {
    group, model, survey, stats, meshes, materials, textures,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      for (const mesh of meshes) mesh.geometry.dispose();
      for (const material of materials) material.dispose();
      for (const texture of textures) texture.dispose();
      group.clear();
    },
  };
}

/** Convenience mount for the world-space ZA-22 road/root owner. */
export function mountTownC2CraterCentralMound(owner: Group,
  anchor: TownC2CraterMoundAnchor, options: TownC2CraterCentralMoundOptions = {}) {
  const built = buildTownC2CraterCentralMound(anchor, options);
  owner.add(built.group);
  return built;
}
