import { BoxGeometry, Group, Matrix4, Mesh, MeshLambertMaterial } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Blank-fill campaign, package 2 (zone-1 self-build + self-mount, 代挂):
// east fields/shore + northeast periphery. Same builders and red lines
// as package 1 (heightfield untouched, snow-mound undulation only). Red line: the heightfield is never touched —
// undulation comes only from low snow-mound visual pieces, kept off roads.
// Every cluster carries pieces from the campaign vocabulary; benches and
// wood piles are the touchable points (look / sit-by / chop-by).

export type FillKind = 'snowMound' | 'pineCluster' | 'rockCluster' | 'stumpLogs'
  | 'woodPile' | 'crates' | 'viewBench' | 'lampPost' | 'signPost' | 'snowmanPair';

export type FillCluster = {
  id: string; kind: FillKind; east: number; north: number; heading?: number;
};

export const FILL_RADII: Record<FillKind, number> = {
  snowMound: 2.4, pineCluster: 2.2, rockCluster: 1.6, stumpLogs: 1.1,
  woodPile: 1.2, crates: 1.2, viewBench: 1.0, lampPost: .6, signPost: .6, snowmanPair: 1.1,
};

export const fillEastClusters: readonly FillCluster[] = [
  // East fields and shore (east/north of the long hall and lighthouse).
  { id: 'ef-pine-450', kind: 'pineCluster', east: 425, north: 148 },
  { id: 'ef-mound-490', kind: 'snowMound', east: 478, north: 82 },
  { id: 'ef-bench-520', kind: 'viewBench', east: 520, north: 130, heading: -Math.PI / 2 },
  { id: 'ef-rock-560', kind: 'rockCluster', east: 560, north: 100, heading: .6 },
  { id: 'ef-lamp-470', kind: 'lampPost', east: 470, north: 170 },
  { id: 'ef-wood-510', kind: 'woodPile', east: 510, north: 185, heading: .4 },
  { id: 'ef-pine-555', kind: 'pineCluster', east: 555, north: 165 },
  { id: 'ef-mound-595', kind: 'snowMound', east: 595, north: 140 },
  { id: 'ef-stump-460', kind: 'stumpLogs', east: 448, north: 212, heading: 1.0 },
  { id: 'ef-crates-500', kind: 'crates', east: 500, north: 240, heading: .8 },
  { id: 'ef-pine-545', kind: 'pineCluster', east: 545, north: 220 },
  { id: 'ef-sign-585', kind: 'signPost', east: 585, north: 205, heading: -Math.PI / 2 },
  { id: 'ef-rock-470', kind: 'rockCluster', east: 470, north: 285, heading: 1.4 },
  { id: 'ef-snowman-515', kind: 'snowmanPair', east: 528, north: 288 },
  { id: 'ef-pine-560', kind: 'pineCluster', east: 560, north: 275 },
  { id: 'ef-bench-600', kind: 'viewBench', east: 600, north: 250, heading: -Math.PI / 2 },
  { id: 'ef-mound-440', kind: 'snowMound', east: 440, north: 330 },
  { id: 'ef-lamp-490', kind: 'lampPost', east: 490, north: 345 },
  { id: 'ef-pine-540', kind: 'pineCluster', east: 540, north: 330 },
  { id: 'ef-wood-585', kind: 'woodPile', east: 558, north: 322, heading: 1.1 },
  // Northeast periphery (outside the memorial / long-hall core).
  { id: 'ne-stump-320', kind: 'stumpLogs', east: 320, north: 215, heading: .2 },
  { id: 'ne-mound-355', kind: 'snowMound', east: 355, north: 240 },
  { id: 'ne-lamp-395', kind: 'lampPost', east: 384, north: 192 },
  { id: 'ne-pine-425', kind: 'pineCluster', east: 425, north: 235 },
  { id: 'ne-rock-310', kind: 'rockCluster', east: 310, north: 265, heading: .8 },
  { id: 'ne-crates-350', kind: 'crates', east: 350, north: 350, heading: .5 },
  { id: 'ne-bench-400', kind: 'viewBench', east: 400, north: 360, heading: 0 },
  { id: 'ne-pine-445', kind: 'pineCluster', east: 445, north: 375 },
];

const PALETTE = {
  timber: '#5d4630', wood: '#a98a56', stone: '#8a8378', snow: '#e8ecf0',
  dark: '#2c3648', rust: '#8a4a34', firA: '#36534e', firB: '#395b53',
  lampGlow: '#e08a3c', bark: '#6b5138', logEnd: '#c8a878',
} as const;

const materials = new Map<string, MeshLambertMaterial>();
function material(hex: string) {
  let m = materials.get(hex);
  if (!m) { m = new MeshLambertMaterial({ color: hex }); materials.set(hex, m); }
  return m;
}
const boxGeometry = new BoxGeometry();

type Part = (u: number, h: number, v: number, size: [number, number, number], hex: string, yaw?: number, pitch?: number, roll?: number) => void;

function fir(part: Part, u: number, v: number, scale: number) {
  part(u, 0.67 * scale, v, [0.24 * scale, 1.34 * scale, 0.26 * scale], PALETTE.timber);
  const tiers: [number, number][] = [[2.22, 1.04], [1.63, 1.51], [1.02, 1.98], [0.55, 2.45]];
  tiers.forEach(([w, h], i) => {
    part(u, h * scale, v, [w * scale, 0.58 * scale, w * 0.86 * scale], i % 2 ? PALETTE.firB : PALETTE.firA);
    part(u, (h + 0.33) * scale, v, [w * 0.91 * scale, 0.1 * scale, w * 0.76 * scale], PALETTE.snow);
  });
}

const BUILDERS: Record<FillKind, (part: Part) => void> = {
  snowMound(part) {
    part(0, 0.14, 0, [4.4, 0.28, 3.4], PALETTE.snow);
    part(0.3, 0.36, -0.2, [3.1, 0.22, 2.4], PALETTE.snow);
    part(-0.2, 0.53, 0.1, [1.8, 0.16, 1.4], PALETTE.snow);
  },
  pineCluster(part) {
    part(0, 0.03, 0, [5.2, 0.06, 4.4], PALETTE.snow);
    fir(part, -1.5, -0.8, 1.15); fir(part, 1.3, -1.1, 0.9); fir(part, 0.1, 0.9, 1.3);
    fir(part, -1.2, 1.2, 0.65); fir(part, 1.7, 0.7, 0.75);
  },
  rockCluster(part) {
    part(-0.8, 0.3, 0.1, [1.3, 0.6, 1.0], PALETTE.stone, 0.4);
    part(0.5, 0.42, -0.3, [1.1, 0.84, 0.9], PALETTE.stone, 1.0);
    part(0.1, 0.85, -0.2, [0.7, 0.5, 0.6], PALETTE.stone, 0.2);
    part(1.2, 0.16, 0.5, [0.7, 0.32, 0.55], PALETTE.stone, 1.8);
    part(-0.3, 1.18, -0.15, [0.72, 0.1, 0.62], PALETTE.snow);
  },
  stumpLogs(part) {
    part(0, 0.26, 0, [0.62, 0.52, 0.62], PALETTE.bark);
    part(0, 0.53, 0, [0.56, 0.04, 0.56], PALETTE.logEnd);
    part(0.85, 0.16, 0.3, [1.15, 0.3, 0.3], PALETTE.bark, Math.PI / 2);
    part(0.8, 0.47, 0.28, [1.05, 0.28, 0.28], PALETTE.bark, Math.PI / 2);
    part(-0.75, 0.35, -0.4, [0.28, 0.95, 0.28], PALETTE.bark, 0, 0, 0.5);
  },
  woodPile(part) {
    for (let row = 0; row < 3; row++) {
      const count = 4 - (row === 2 ? 1 : 0);
      for (let i = 0; i < count; i++)
        part(-0.66 + i * 0.44, 0.17 + row * 0.31, 0, [0.4, 0.3, 1.5], row % 2 ? PALETTE.bark : PALETTE.wood);
    }
    part(0, 1.06, 0, [1.9, 0.06, 1.6], PALETTE.snow);
  },
  crates(part) {
    part(-0.5, 0.4, 0, [0.8, 0.8, 0.8], PALETTE.wood);
    part(-0.5, 0.86, 0, [0.84, 0.06, 0.84], PALETTE.snow);
    part(0.45, 0.32, 0.15, [0.64, 0.64, 0.64], PALETTE.timber);
    part(0.5, 0.95, -0.3, [0.52, 0.62, 0.52], PALETTE.bark);
    part(0.5, 1.3, -0.3, [0.56, 0.05, 0.56], PALETTE.snow);
  },
  viewBench(part) {
    for (const u of [-0.75, 0.75]) part(u, 0.21, 0, [0.18, 0.42, 0.55], PALETTE.stone);
    for (const v of [-0.19, 0, 0.19]) part(0, 0.46, v, [1.8, 0.07, 0.16], PALETTE.wood);
    for (const u of [-0.75, 0.75]) part(u, 0.72, -0.3, [0.14, 0.6, 0.12], PALETTE.timber);
    for (const h of [0.78, 1.0]) part(0, h, -0.33, [1.8, 0.13, 0.05], PALETTE.wood);
    part(0, 1.1, -0.33, [1.8, 0.05, 0.07], PALETTE.snow);
  },
  lampPost(part) {
    part(0, 0.06, 0, [0.42, 0.12, 0.42], PALETTE.stone);
    part(0, 1.25, 0, [0.13, 2.5, 0.13], PALETTE.timber);
    part(0, 2.42, 0, [0.3, 0.36, 0.3], PALETTE.lampGlow);
    part(0, 2.68, 0, [0.44, 0.12, 0.44], PALETTE.timber);
    part(0, 2.76, 0, [0.46, 0.05, 0.46], PALETTE.snow);
  },
  signPost(part) {
    part(0, 0.95, 0, [0.14, 1.9, 0.14], PALETTE.timber);
    part(0.18, 1.62, 0, [0.95, 0.5, 0.06], PALETTE.wood);
    part(0.18, 1.9, 0, [0.95, 0.05, 0.08], PALETTE.snow);
  },
  snowmanPair(part) {
    const man = (u: number, v: number, s: number) => {
      part(u, 0.31 * s, v, [0.78 * s, 0.62 * s, 0.78 * s], PALETTE.snow);
      part(u, 0.82 * s, v, [0.58 * s, 0.44 * s, 0.58 * s], PALETTE.snow);
      part(u, 1.16 * s, v, [0.4 * s, 0.28 * s, 0.4 * s], PALETTE.snow);
      part(u, 0.88 * s, v + 0.3 * s, [0.6 * s, 0.09 * s, 0.06], PALETTE.rust);
    };
    man(-0.55, 0, 1); man(0.75, 0.35, 0.62);
  },
};


// Draw discipline (景物册追补 c7182bbb): the whole package merges into one
// mesh per palette material — static scenery costs a handful of draws no
// matter how many pieces it holds. Returns the pre-merge part count.
function mergePackage(group: Group): number {
  group.updateMatrixWorld(true);
  const byMaterial = new Map<MeshLambertMaterial, BoxGeometry[]>();
  let parts = 0;
  const world = new Matrix4();
  group.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh) return;
    parts++;
    world.copy(mesh.matrixWorld);
    const geometry = boxGeometry.clone().applyMatrix4(world);
    const key = mesh.material as MeshLambertMaterial;
    const list = byMaterial.get(key) ?? [];
    list.push(geometry);
    byMaterial.set(key, list);
  });
  for (const child of [...group.children]) group.remove(child);
  for (const [mat, geometries] of byMaterial) {
    const merged = new Mesh(mergeGeometries(geometries)!, mat);
    group.add(merged);
  }
  return parts;
}

export function mountTownFillEast(parent: Group, heightAt: (east: number, north: number) => number) {
  const group = new Group();
  group.name = 'town-fill-east';
  parent.add(group);
  const placed: string[] = [];
  for (const cluster of fillEastClusters) {
    const yaw = cluster.heading ?? 0;
    const y = heightAt(cluster.east, cluster.north);
    const item = new Group();
    item.position.set(cluster.east, y, -cluster.north);
    item.rotation.y = yaw;
    const part: Part = (u, h, v, size, hex, partYaw = 0, pitch = 0, roll = 0) => {
      const mesh = new Mesh(boxGeometry, material(hex));
      mesh.position.set(u, h, -v);
      mesh.scale.set(size[0], size[1], size[2]);
      mesh.rotation.set(pitch, partYaw, roll);
      item.add(mesh);
    };
    BUILDERS[cluster.kind](part);
    group.add(item);
    placed.push(cluster.id);
  }
  const parts = mergePackage(group);
  group.userData.parts = parts;
  return {
    group,
    placed,
    dispose() { parent.remove(group); },
  };
}
