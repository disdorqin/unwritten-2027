import {
  BoxGeometry,
  Color,
  DataTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  NearestFilter,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  type Material,
  type Object3D,
} from 'three';

/**
 * Shared procedural pixel-grain materials and asset metadata contracts
 * for lane-friend (FR-01 / FR-02 / FR-03).
 *
 * Style alignment: "Clay-factory / Voxel Tavern" — 24 px/m world-scale
 * crisp pixel grain (NearestFilter), warm wood, dark timber, limestone/cobble,
 * matte iron, warm paper/glow, snow cap, and subtle edge darkening.
 */

export const FRIEND_PIXELS_PER_METRE = 24;

export interface FriendColliderBox {
  /** Center relative to asset origin [x, y, z] in metres */
  center: [number, number, number];
  /** Full size [w, h, d] in metres */
  size: [number, number, number];
  /** Whether player movement should be blocked by this box */
  solid: boolean;
  label?: string;
}

export interface FriendLodSpec {
  /** Distance (m) within which full detail meshes are shown */
  nearDistance: number;
  /** Distance (m) beyond which asset switches to simplified proxy or culls */
  farDistance: number;
  /** Distance (m) beyond which asset can be hidden */
  cullDistance: number;
  /** True if suitable for InstancedMesh / static batching at far range */
  instancingReady: boolean;
}

export interface FriendAssetMeta {
  id: string;
  name: string;
  pack: 'FR-01' | 'FR-02' | 'FR-03';
  category: string;
  /** Bounding box [width, height, depth] in metres */
  dimensions: [number, number, number];
  colliders: FriendColliderBox[];
  lod: FriendLodSpec;
  clearanceNote: string;
  license: 'Original-Procedural-MIT';
}

export type FriendMaterialKind =
  | 'wood_warm'
  | 'wood_dark'
  | 'wood_plank'
  | 'stone_block'
  | 'cobble'
  | 'plaster'
  | 'iron'
  | 'brass'
  | 'paper_warm'
  | 'glass_frosted'
  | 'glow_amber'
  | 'snow'
  | 'ceramic_teal'
  | 'cloth_red'
  | 'pine_green'
  | 'terracotta'
  | 'roof_slate';

interface PaletteSpec {
  base: number;
  pattern: 'plank' | 'timber' | 'stone' | 'cobble' | 'plaster' | 'metal' | 'snow' | 'cloth' | 'paper' | 'foliage' | 'glow';
  emissive?: number;
  emissiveIntensity?: number;
  roughness?: number;
  metalness?: number;
  transparent?: boolean;
  opacity?: number;
}

const PALETTE: Record<FriendMaterialKind, PaletteSpec> = {
  wood_warm: { base: 0x8f5b38, pattern: 'plank', roughness: 0.86 },
  wood_dark: { base: 0x4b3326, pattern: 'timber', roughness: 0.9 },
  wood_plank: { base: 0xa66e44, pattern: 'plank', roughness: 0.84 },
  stone_block: { base: 0x7c8288, pattern: 'stone', roughness: 0.92 },
  cobble: { base: 0x676d75, pattern: 'cobble', roughness: 0.94 },
  plaster: { base: 0xd9d0c1, pattern: 'plaster', roughness: 0.92 },
  iron: { base: 0x3b4046, pattern: 'metal', roughness: 0.58, metalness: 0.45 },
  brass: { base: 0xc99c4e, pattern: 'metal', roughness: 0.42, metalness: 0.6 },
  paper_warm: { base: 0xf1dfb8, pattern: 'paper', emissive: 0x5c3b14, emissiveIntensity: 0.35, roughness: 0.78 },
  glass_frosted: { base: 0xa7cde0, pattern: 'plaster', roughness: 0.25, transparent: true, opacity: 0.65 },
  glow_amber: { base: 0xffcf77, pattern: 'glow', emissive: 0xffa63b, emissiveIntensity: 1.15, roughness: 0.4 },
  snow: { base: 0xeef5fb, pattern: 'snow', roughness: 0.88 },
  ceramic_teal: { base: 0x4b878c, pattern: 'plaster', roughness: 0.45 },
  cloth_red: { base: 0xa83b36, pattern: 'cloth', roughness: 0.88 },
  pine_green: { base: 0x2f5e42, pattern: 'foliage', roughness: 0.86 },
  terracotta: { base: 0x9c553b, pattern: 'stone', roughness: 0.86 },
  roof_slate: { base: 0x495360, pattern: 'stone', roughness: 0.85 },
};

function hash2d(x: number, y: number, seed: number): number {
  let v = Math.imul(x + 19, 374761393) ^ Math.imul(y + 79, 668265263) ^ Math.imul(seed, 1274126177);
  v = Math.imul(v ^ (v >>> 13), 1274126177);
  return (v ^ (v >>> 16)) >>> 0;
}

function build16pxGrainTexture(kind: FriendMaterialKind, seed: number): DataTexture {
  const size = 16;
  const data = new Uint8Array(size * size * 4);
  const spec = PALETTE[kind];
  const r0 = (spec.base >> 16) & 255;
  const g0 = (spec.base >> 8) & 255;
  const b0 = spec.base & 255;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = ((hash2d(x, y, seed) % 100) / 100 - 0.5) * 0.14;
      let delta = n;

      if (spec.pattern === 'plank') {
        if (y % 4 === 0) delta -= 0.18;
        else if (y % 4 === 1) delta += 0.08;
        if (x % 8 === (Math.floor(y / 4) % 2) * 4) delta -= 0.1;
      } else if (spec.pattern === 'timber') {
        if (x % 4 === 0) delta -= 0.15;
        else if (x % 4 === 1) delta += 0.07;
      } else if (spec.pattern === 'stone' || spec.pattern === 'cobble') {
        const row = Math.floor(y / 4);
        const joint = (x + (row % 2) * 4) % 8;
        if (y % 4 === 0 || joint === 0) delta -= 0.22;
        else if (y % 4 === 1 || joint === 1) delta += 0.1;
      } else if (spec.pattern === 'cloth') {
        delta += x % 2 === y % 2 ? 0.06 : -0.05;
        if (x === 0 || x === 15 || y === 0 || y === 15) delta -= 0.12;
      } else if (spec.pattern === 'metal') {
        if ((x === 3 || x === 12) && (y === 3 || y === 12)) delta += 0.16;
        else if (x === 0 || y === 0) delta -= 0.1;
      } else if (spec.pattern === 'snow') {
        delta *= 0.4;
        if ((x + y * 3) % 11 === 0) delta -= 0.06;
      } else if (spec.pattern === 'foliage') {
        delta += (x + y) % 3 === 0 ? -0.14 : 0.08;
      } else if (spec.pattern === 'glow') {
        const dist = Math.abs(x - 7.5) + Math.abs(y - 7.5);
        delta = 0.12 - dist * 0.015;
      }

      const shade = Math.max(0.42, Math.min(1.25, 1 + delta));
      const idx = (y * size + x) * 4;
      data[idx] = Math.min(255, Math.round(r0 * shade));
      data[idx + 1] = Math.min(255, Math.round(g0 * shade));
      data[idx + 2] = Math.min(255, Math.round(b0 * shade));
      data[idx + 3] = 255;
    }
  }

  const tex = new DataTexture(data, size, size, RGBAFormat);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestFilter;
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export class FriendMaterialLibrary {
  private readonly cache = new Map<FriendMaterialKind, MeshStandardMaterial>();
  private readonly textures: DataTexture[] = [];

  get(kind: FriendMaterialKind): MeshStandardMaterial {
    const existing = this.cache.get(kind);
    if (existing) return existing;

    const spec = PALETTE[kind];
    const seed = [...kind].reduce((acc, ch) => acc * 31 + ch.charCodeAt(0), 17) >>> 0;
    const map = build16pxGrainTexture(kind, seed);
    this.textures.push(map);

    const mat = new MeshStandardMaterial({
      map,
      roughness: spec.roughness ?? 0.85,
      metalness: spec.metalness ?? 0.05,
      emissive: spec.emissive !== undefined ? new Color(spec.emissive) : new Color(0x000000),
      emissiveIntensity: spec.emissiveIntensity ?? 0,
      transparent: spec.transparent ?? false,
      opacity: spec.opacity ?? 1,
    });
    mat.userData.friendSharedMaterial = true;
    map.userData.friendSharedTexture = true;
    this.cache.set(kind, mat);
    return mat;
  }

  ownsMaterial(mat: Material | null | undefined): boolean {
    return Boolean(mat && mat.userData?.friendSharedMaterial === true);
  }

  get size(): number {
    return this.cache.size;
  }

  dispose(): { materialsDisposed: number; texturesDisposed: number } {
    const materialsDisposed = this.cache.size;
    const texturesDisposed = this.textures.length;
    for (const mat of this.cache.values()) mat.dispose();
    for (const tex of this.textures) tex.dispose();
    this.cache.clear();
    this.textures.length = 0;
    return { materialsDisposed, texturesDisposed };
  }
}

/**
 * Create a BoxMesh whose UVs are scaled proportionally to world dimensions
 * so 16px grain tiles evenly without stretching on wide/tall faces.
 */
export function makeScaledBox(
  w: number,
  h: number,
  d: number,
  mat: Material,
  name?: string,
): Mesh {
  const geo = new BoxGeometry(w, h, d);
  const uv = geo.attributes.uv;
  if (uv) {
    // BoxGeometry face order: +x (d,h), -x (d,h), +y (w,d), -y (w,d), +z (w,h), -z (w,h)
    const faceScales: Array<[number, number]> = [
      [d, h],
      [d, h],
      [w, d],
      [w, d],
      [w, h],
      [w, h],
    ];
    for (let f = 0; f < 6; f++) {
      const [su, sv] = faceScales[f]!;
      const tileU = Math.max(0.5, su * 1.5);
      const tileV = Math.max(0.5, sv * 1.5);
      for (let v = 0; v < 4; v++) {
        const idx = f * 4 + v;
        uv.setXY(idx, uv.getX(idx) * tileU, uv.getY(idx) * tileV);
      }
    }
    uv.needsUpdate = true;
  }
  const mesh = new Mesh(geo, mat);
  if (name) mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Bake a world-scale clay/voxel box with dark edge bevels into a single Mesh
 * (similar to clay-metal-panel.ts, adapted for wood/stone/snow).
 */
export function makeEdgedPanelBox(
  width: number,
  height: number,
  depth: number,
  baseColor: number,
  seed: number,
  name?: string,
): Mesh {
  const ppm = FRIEND_PIXELS_PER_METRE;
  const dims = [
    [depth, height],
    [depth, height],
    [width, depth],
    [width, depth],
    [width, height],
    [width, height],
  ] as const;

  let atlasW = 0;
  const faces = dims.map(([w, h]) => {
    const face = {
      x: atlasW,
      width: Math.max(2, Math.round(w * ppm)),
      height: Math.max(2, Math.round(h * ppm)),
    };
    atlasW += face.width;
    return face;
  });
  const atlasH = Math.max(...faces.map((f) => f.height));
  const texels = new Uint8Array(atlasW * atlasH * 4);
  const geo = new BoxGeometry(width, height, depth);
  const uvs = geo.attributes.uv!;
  const indices = geo.index!;

  for (const [fi, face] of faces.entries()) {
    const fSeed = seed + fi * 43;
    const { width: w, height: h, x: offset } = face;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const edge = Math.min(x, y, w - x - 1, h - y - 1);
        const patch = hash2d(Math.floor(x / 3), Math.floor(y / 3), fSeed) % 5;
        const speck = hash2d(x, y, fSeed) % 3;
        const shade = edge === 0 ? 0.64 : edge === 1 ? 0.82 : 0.88 + patch * 0.035 + speck * 0.02;
        const px = ((h - 1 - y) * atlasW + offset + x) * 4;
        texels[px] = Math.min(255, Math.round(((baseColor >> 16) & 255) * shade));
        texels[px + 1] = Math.min(255, Math.round(((baseColor >> 8) & 255) * shade));
        texels[px + 2] = Math.min(255, Math.round((baseColor & 255) * shade));
        texels[px + 3] = 255;
      }
    }
    const { start, count } = geo.groups[fi]!;
    for (const vertex of new Set(Array.from({ length: count }, (_, i) => indices.getX(start + i)))) {
      const u = (offset + 0.5 + uvs.getX(vertex) * (w - 1)) / atlasW;
      const v = (0.5 + uvs.getY(vertex) * (h - 1)) / atlasH;
      uvs.setXY(vertex, u, v);
    }
  }
  uvs.needsUpdate = true;

  const tex = new DataTexture(texels, atlasW, atlasH, RGBAFormat);
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestFilter;
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;

  const mat = new MeshLambertMaterial({ map: tex });
  const mesh = new Mesh(geo, mat);
  if (name) mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function applyAssetLod(root: Object3D, level: 'high' | 'low'): void {
  root.traverse((obj) => {
    if (obj.userData?.lodRole === 'detail') {
      obj.visible = level === 'high';
    } else if (obj.userData?.lodRole === 'proxy') {
      obj.visible = level === 'low';
    }
  });
}

export interface DisposeStats {
  geometriesDisposed: number;
  materialsDisposed: number;
  texturesDisposed: number;
}

export function disposeAssetGroup(group: Group): DisposeStats {
  const stats: DisposeStats = {
    geometriesDisposed: 0,
    materialsDisposed: 0,
    texturesDisposed: 0,
  };
  group.traverse((obj) => {
    if (!(obj instanceof Mesh)) return;
    if (!obj.geometry.userData?.friendDisposed) {
      obj.geometry.userData = obj.geometry.userData ?? {};
      obj.geometry.userData.friendDisposed = true;
      obj.geometry.dispose();
      stats.geometriesDisposed += 1;
    }
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) {
      if (!m || typeof m.dispose !== 'function') continue;
      // Never dispose materials/textures owned by FriendMaterialLibrary.
      if (m.userData?.friendSharedMaterial === true) continue;
      if (m.userData?.friendDisposed === true) continue;

      if ('map' in m && m.map && typeof m.map.dispose === 'function') {
        const tex = m.map as { userData?: Record<string, unknown>; dispose: () => void };
        if (tex.userData?.friendSharedTexture !== true && tex.userData?.friendDisposed !== true) {
          tex.userData = tex.userData ?? {};
          tex.userData.friendDisposed = true;
          tex.dispose();
          stats.texturesDisposed += 1;
        }
      }
      m.userData = m.userData ?? {};
      m.userData.friendDisposed = true;
      m.dispose();
      stats.materialsDisposed += 1;
    }
  });
  return stats;
}

export function createDebugColliderWireframe(colliders: FriendColliderBox[]): Group {
  const g = new Group();
  g.name = 'debug-colliders';
  for (const c of colliders) {
    const geo = new BoxGeometry(c.size[0], c.size[1], c.size[2]);
    const mat = new MeshBasicMaterial({
      color: c.solid ? 0x55e6a5 : 0xf6c967,
      wireframe: true,
      transparent: true,
      opacity: 0.72,
    });
    const m = new Mesh(geo, mat);
    m.position.set(c.center[0], c.center[1], c.center[2]);
    g.add(m);
  }
  return g;
}
