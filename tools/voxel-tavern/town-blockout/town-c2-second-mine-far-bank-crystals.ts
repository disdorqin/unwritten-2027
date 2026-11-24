import {
  BoxGeometry, Color, DataTexture, Group, InstancedMesh, MeshStandardMaterial,
  NearestFilter, Object3D, RGBAFormat, SRGBColorSpace, StaticDrawUsage,
} from 'three';
import {
  c2SecondMineBoxAllowed, type C2SecondMineBox,
} from './town-c2-second-mine-contract.js';

/** C2 -140 visual-only outer-bank dressing. Coordinates are mine-local metres:
 * x=east, y=height, z=-north. No floor, collider, light or mine site is created. */
export const c2SecondMineFarBankCrystalsPlan = Object.freeze({
  id: 'c2-second-mine-far-bank-crystals',
  layer: -140,
  west: Object.freeze({ minX: -46, maxX: -42, minN: 149, maxN: 179 }),
  east: Object.freeze({ minX: 42, maxX: 46, minN: 149, maxN: 179 }),
  groundClusterCount: 20,
  elevatedClusterCount: 16,
  columnCount: 12,
  veinCount: 12,
  metalDropCount: 20,
  rubbleCount: 72,
  textureSize: 16,
  nightCrystalEmission: .34,
  nightVeinEmission: .20,
} as const);

export type FarBankMaterialFamily =
  | 'basalt' | 'rubble' | 'crystal' | 'ore-vein' | 'frozen-metal';
export type FarBankClusterSite = Readonly<{
  id: string;
  east: number;
  north: number;
  baseY: number;
  tier: 'ground' | 'elevated';
}>;
export type FarBankCrystalsStats = Readonly<{
  layer: -140;
  band: 'far-bank-outer-strips';
  clusterCount: number;
  groundClusterCount: number;
  elevatedClusterCount: number;
  columnCount: number;
  crystalCount: number;
  veinCount: number;
  metalDropCount: number;
  rubbleCount: number;
  pieceCount: number;
  materialFamilies: readonly FarBankMaterialFamily[];
  instanceMeshes: number;
  drawCalls: number;
  triangles: number;
  textureSize: 16;
  textureFilter: 'nearest';
  night: boolean;
  emissiveIntensity: number;
  maxEmissiveIntensity: number;
  lightCount: 0;
  colliders: 0;
  oreSites: 0;
  floorChanges: 0;
  clusterSites: readonly FarBankClusterSite[];
  disposed: boolean;
}>;
export type FarBankCrystalsScene = Readonly<{
  group: Group;
  setNight(night: boolean): FarBankCrystalsStats;
  stats(): FarBankCrystalsStats;
  dispose(): void;
}>;

type Family = FarBankMaterialFamily;
type Part = Readonly<{
  family: Family;
  x: number;
  n: number;
  y: number;
  w: number;
  d: number;
  h: number;
  rz: number;
  color: number;
}>;
type Cluster = FarBankClusterSite & Readonly<{ side: -1 | 1; column: boolean }>;
type State = {
  scene: FarBankCrystalsScene;
  root: Group;
  meshes: readonly InstancedMesh[];
  geometry: BoxGeometry;
  materials: Readonly<Record<Family, MeshStandardMaterial>>;
  textures: readonly DataTexture[];
  parts: readonly Part[];
  clusters: readonly Cluster[];
  night: boolean;
  disposed: boolean;
};

const materialFamilies = Object.freeze([
  'basalt', 'rubble', 'crystal', 'ore-vein', 'frozen-metal',
] as const satisfies readonly Family[]);
const states = new WeakMap<FarBankCrystalsScene, State>();

function noise(seed: number) {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function grainTexture(base: number, dark: number, light: number, seed: number) {
  const size = c2SecondMineFarBankCrystalsPlan.textureSize;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const grain = noise(seed + x * 31 + y * 131);
    const color = grain < .24 ? dark : grain > .83 ? light : base;
    pixels.set([color >> 16, color >> 8 & 255, color & 255, 255], 4 * (x + size * y));
  }
  const texture = new DataTexture(pixels, size, size, RGBAFormat);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function inOuterBand(box: C2SecondMineBox) {
  const west = c2SecondMineFarBankCrystalsPlan.west;
  const east = c2SecondMineFarBankCrystalsPlan.east;
  const inWest = box.x - box.w / 2 >= west.minX && box.x + box.w / 2 <= west.maxX;
  const inEast = box.x - box.w / 2 >= east.minX && box.x + box.w / 2 <= east.maxX;
  return (inWest || inEast) && box.n - box.d / 2 >= west.minN &&
    box.n + box.d / 2 <= west.maxN;
}

function makeClusters() {
  const clusters: Cluster[] = [];
  const groundRows = [150.5, 157, 163.5, 170, 176.5];
  const elevatedRows = [153.5, 161.5, 169.5, 177.5];
  for (const side of [-1, 1] as const) {
    const tag = side < 0 ? 'west' : 'east';
    groundRows.forEach((north, row) => {
      [43, 44.95].forEach((east, lane) => {
        clusters.push({
          id: `${tag}-ground-${row}-${lane}`, side, east: side * east, north,
          baseY: .34, tier: 'ground', column: row === 0 || row === 4,
        });
      });
    });
    elevatedRows.forEach((north, row) => {
      [43.45, 44.95].forEach((east, lane) => {
        clusters.push({
          id: `${tag}-elevated-${row}-${lane}`, side, east: side * east, north,
          baseY: 4.15 + row * .16, tier: 'elevated', column: row === 1,
        });
      });
    });
  }
  return clusters;
}

/** Build a detached local group, or attach it to an existing second-mine root. */
export function build(parent?: Group): FarBankCrystalsScene {
  if (parent !== undefined && !(parent instanceof Group)) {
    throw new TypeError('C2 far-bank crystals require a Three.js Group parent.');
  }
  const plan = c2SecondMineFarBankCrystalsPlan;
  const root = new Group();
  root.name = plan.id;
  root.userData.visualOnly = true;
  root.userData.localFrame = 'second-mine-east-height-minus-north';
  root.userData.layer = plan.layer;
  const parts: Part[] = [];
  const clusters = makeClusters();

  const add = (family: Family, x: number, n: number, y: number, w: number, d: number,
    h: number, rz: number, color: number) => {
    const cosine = Math.abs(Math.cos(rz)), sine = Math.abs(Math.sin(rz));
    // The contract sees conservative world-axis bounds, including crystal lean.
    const box: C2SecondMineBox = {
      x, n, y, w: cosine * w + sine * h, d, h: sine * w + cosine * h,
    };
    if (!inOuterBand(box) || !c2SecondMineBoxAllowed(box)) {
      throw new RangeError(`C2 far-bank piece rejected at E${x}/N${n}/Y${y}: ${family}`);
    }
    parts.push({ family, x, n, y, w, d, h, rz, color });
  };

  const shardOffsets = [
    [0, 0], [-.34, .16], [.34, .14], [-.18, -.32],
    [.20, -.28], [.02, .35], [-.06, -.04],
  ] as const;
  for (const cluster of clusters) {
    const seed = 1400 + (cluster.side < 0 ? 0 : 100) +
      (cluster.tier === 'ground' ? 0 : 50) + Math.round(cluster.north * 10);
    if (cluster.tier === 'ground') {
      add('basalt', cluster.east, cluster.north, .17, 1.12, 1, .34, 0, 0xc4c9cc);
    } else {
      const pillarX = cluster.east + cluster.side * .27;
      const pillarH = cluster.baseY - .42;
      add('basalt', pillarX, cluster.north, .17 + pillarH / 2,
        .58, .64, pillarH, 0, 0xb9c0c4);
      add('basalt', pillarX, cluster.north, .14, .92, .92, .28, 0, 0xaeb6bb);
      add('basalt', cluster.east - cluster.side * .04, cluster.north,
        cluster.baseY - .12, 1.30, 1.04, .24, 0, 0xc4c9cc);
    }

    shardOffsets.forEach(([dx, dn], index) => {
      const x = cluster.east + dx, n = cluster.north + dn;
      const bottom = cluster.baseY + .16 + (index % 2) * .04;
      const width = .27 + noise(seed + index * 7) * .23;
      const depth = .24 + noise(seed + index * 13) * .20;
      const crystalTones = [0x8fbcb8, 0xa8cfca, 0x759f9f, 0xb8d8ce];
      const color = crystalTones[(index + (cluster.side > 0 ? 1 : 0)) % crystalTones.length]!;
      if (cluster.column && index === 0) {
        const height = cluster.tier === 'ground'
          ? 5.8 + noise(seed) * 1.1 : 3.6 + noise(seed) * .5;
        const fractions = [.50, .32, .18];
        const widths = [1.06, .82, .56];
        let cursor = bottom;
        fractions.forEach((fraction, segment) => {
          const h = height * fraction;
          add('crystal', x + segment * .018, n, cursor + h / 2,
            width * widths[segment]!, depth * (1 - segment * .12), h, 0, color);
          cursor += h;
        });
      } else {
        const height = cluster.tier === 'ground'
          ? 1.25 + noise(seed + index * 17) * 2 : 1.05 + noise(seed + index * 17) * 1.55;
        const lean = cluster.side * (.06 + noise(seed + index * 19) * .14);
        add('crystal', x, n, bottom + height / 2, width, depth, height, lean, color);
        if (index % 3 !== 0) {
          const cap = .16 + noise(seed + index * 23) * .12;
          add('crystal', x, n, bottom + height + cap / 2 - .04,
            width * .56, depth * .55, cap, lean, 0xc6ded8);
        }
      }
    });
  }

  // Mineral seams are artwork, not mineable sites. Each has a dark rock backing
  // and six small broken branches; only the mineral family carries cyan emission.
  for (const side of [-1, 1] as const) {
    [151.5, 156.8, 162.1, 167.4, 172.7, 178].forEach((north, vein) => {
      const seed = 2300 + vein * 17 + (side > 0 ? 9 : 0);
      add('basalt', side * 45.65, north, 2.7, .42, 1.65, 5.1, 0, 0xaeb6bb);
      for (let branch = 0; branch < 6; branch++) {
        const y = .92 + branch * .70 + noise(seed + branch) * .18;
        const lean = side * (branch % 2 === 0 ? -.10 : .12);
        const color = branch % 3 === 0 ? 0xb2aa7d : 0x8eaaa1;
        add('ore-vein', side * 45.37, north + (noise(seed + branch * 3) - .5) * .28,
          y, .20, .88 + noise(seed + branch * 5) * .28, .20 + noise(seed + branch) * .08,
          lean, color);
      }
    });
  }

  // Frozen drops use stepped silver/rust blocks, never cyan and never emission.
  for (const side of [-1, 1] as const) for (let index = 0; index < plan.metalDropCount / 2; index++) {
    const x = side * (index % 2 === 0 ? 43.5 : 45.25);
    const n = 150.5 + index * 3;
    const color = index % 4 === 0 ? 0xa58b74 : index % 2 === 0 ? 0x8f928f : 0xb7b9b5;
    const wallDrop = index % 3 === 0;
    const dropN = wallDrop ? n + .9 : n;
    const baseY = wallDrop ? 2.25 + (index % 4) * .72 : .06;
    add('frozen-metal', x, dropN, baseY, wallDrop ? .40 : .52, wallDrop ? .20 : .44,
      .10, 0, color);
    add('frozen-metal', x - side * .04, dropN, baseY + .25, .17, .17, .42, 0, color);
    add('frozen-metal', x - side * .08, dropN, baseY + .57, .32, .30, .34, 0, color);
    add('frozen-metal', x - side * .10, dropN, baseY + .79, .18, .17, .16, 0, color);
  }

  for (const side of [-1, 1] as const) for (let index = 0; index < plan.rubbleCount / 2; index++) {
    const seed = 4100 + index * 43 + (side > 0 ? 11 : 0);
    const x = side * (42.4 + ((index * 17) % 32) / 10);
    const n = 149.35 + ((index * 29) % 290) / 10;
    const w = .18 + noise(seed) * .34, d = .18 + noise(seed + 1) * .32;
    const h = .14 + noise(seed + 2) * .38;
    const tone = index % 5 === 0 ? 0xa6a39a : index % 2 === 0 ? 0xc1c0b8 : 0x929691;
    add('rubble', x, n, h / 2 + .02, w, d, h, (noise(seed + 3) - .5) * .22, tone);
  }

  const textures = [
    grainTexture(0x3e464c, 0x20282e, 0x68747a, 5101),
    grainTexture(0x74766f, 0x454b48, 0xa2a197, 5203),
    grainTexture(0x769a9e, 0x3c6268, 0xc1dedc, 5307),
    grainTexture(0x756f5d, 0x393f3e, 0xb39a63, 5409),
    grainTexture(0x777d7e, 0x343c40, 0xb9b6a6, 5501),
  ];
  const materials: Record<Family, MeshStandardMaterial> = {
    basalt: new MeshStandardMaterial({
      map: textures[0], roughness: .98, flatShading: true,
      emissive: 0x000000, emissiveIntensity: 0,
    }),
    rubble: new MeshStandardMaterial({
      map: textures[1], roughness: 1, flatShading: true,
      emissive: 0x000000, emissiveIntensity: 0,
    }),
    crystal: new MeshStandardMaterial({
      map: textures[2], roughness: .38, metalness: .04, flatShading: true,
      emissive: 0x4b9fa8, emissiveIntensity: 0,
    }),
    'ore-vein': new MeshStandardMaterial({
      map: textures[3], roughness: .72, metalness: .08, flatShading: true,
      emissive: 0x4b9fa8, emissiveIntensity: 0,
    }),
    'frozen-metal': new MeshStandardMaterial({
      map: textures[4], roughness: .42, metalness: .72, flatShading: true,
      emissive: 0x000000, emissiveIntensity: 0,
    }),
  };
  const geometry = new BoxGeometry(1, 1, 1);
  const dummy = new Object3D();
  const color = new Color();
  const meshes = materialFamilies.map(family => {
    const items = parts.filter(part => part.family === family);
    const mesh = new InstancedMesh(geometry, materials[family], items.length);
    mesh.name = `${plan.id}:${family}`;
    mesh.userData.family = family;
    mesh.userData.visualOnly = true;
    items.forEach((part, index) => {
      dummy.position.set(part.x, part.y, -part.n);
      dummy.rotation.set(0, 0, part.rz);
      dummy.scale.set(part.w, part.h, part.d);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      mesh.setColorAt(index, color.setHex(part.color));
    });
    mesh.instanceMatrix.setUsage(StaticDrawUsage);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  });
  if (parent) parent.add(root);

  const scene: FarBankCrystalsScene = Object.freeze({
    group: root,
    setNight(night: boolean) { return setNight(scene, night); },
    stats() { return stats(scene); },
    dispose() { dispose(scene); },
  });
  states.set(scene, {
    scene, root, meshes, geometry, materials, textures, parts, clusters,
    night: false, disposed: false,
  });
  return scene;
}

function stateFor(scene: FarBankCrystalsScene): State {
  const state = states.get(scene);
  if (!state) throw new TypeError('Unknown C2 far-bank crystal scene.');
  return state;
}

export function stats(scene: FarBankCrystalsScene): FarBankCrystalsStats {
  const state = stateFor(scene);
  const disposed = state.disposed;
  const count = (family: Family) => disposed ? 0 : state.parts.filter(part => part.family === family).length;
  const columns = disposed ? 0 : state.clusters.filter(cluster => cluster.column).length;
  const elevated = disposed ? 0 : state.clusters.filter(cluster => cluster.tier === 'elevated').length;
  const pieceCount = disposed ? 0 : state.parts.length;
  return Object.freeze({
    layer: -140,
    band: 'far-bank-outer-strips',
    clusterCount: disposed ? 0 : state.clusters.length,
    groundClusterCount: disposed ? 0 : state.clusters.length - elevated,
    elevatedClusterCount: elevated,
    columnCount: columns,
    crystalCount: count('crystal'),
    veinCount: disposed ? 0 : c2SecondMineFarBankCrystalsPlan.veinCount,
    metalDropCount: disposed ? 0 : c2SecondMineFarBankCrystalsPlan.metalDropCount,
    rubbleCount: disposed ? 0 : c2SecondMineFarBankCrystalsPlan.rubbleCount,
    pieceCount,
    materialFamilies,
    instanceMeshes: disposed ? 0 : state.meshes.length,
    drawCalls: disposed ? 0 : state.meshes.length,
    triangles: pieceCount * 12,
    textureSize: 16,
    textureFilter: 'nearest',
    night: state.night,
    emissiveIntensity: disposed ? 0 : Math.max(
      state.materials.crystal.emissiveIntensity, state.materials['ore-vein'].emissiveIntensity),
    maxEmissiveIntensity: c2SecondMineFarBankCrystalsPlan.nightCrystalEmission,
    lightCount: 0,
    colliders: 0,
    oreSites: 0,
    floorChanges: 0,
    clusterSites: disposed ? Object.freeze([]) : Object.freeze(state.clusters.map(cluster => Object.freeze({
      id: cluster.id, east: cluster.east, north: cluster.north,
      baseY: cluster.baseY, tier: cluster.tier,
    }))),
    disposed,
  });
}

export function setNight(scene: FarBankCrystalsScene, night: boolean): FarBankCrystalsStats {
  if (typeof night !== 'boolean') throw new TypeError('C2 far-bank night must be boolean.');
  const state = stateFor(scene);
  if (!state.disposed) {
    state.night = night;
    state.materials.crystal.emissiveIntensity = night
      ? c2SecondMineFarBankCrystalsPlan.nightCrystalEmission : 0;
    state.materials['ore-vein'].emissiveIntensity = night
      ? c2SecondMineFarBankCrystalsPlan.nightVeinEmission : 0;
  }
  return stats(scene);
}

export function dispose(scene: FarBankCrystalsScene): void {
  const state = stateFor(scene);
  if (state.disposed) return;
  state.disposed = true;
  state.root.removeFromParent();
  for (const mesh of state.meshes) mesh.dispose();
  state.geometry.dispose();
  for (const material of Object.values(state.materials)) material.dispose();
  for (const texture of state.textures) texture.dispose();
  state.root.clear();
}
