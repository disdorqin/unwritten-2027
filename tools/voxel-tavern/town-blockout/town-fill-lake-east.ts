import { BoxGeometry, Group, Mesh, MeshLambertMaterial } from 'three';

// Blank-fill campaign, package 2 (zone-2 self-build + self-stage, 暂存):
// B2 lake-east snowfield (E 440–640, N 0–160, ~17,600 m²) plus the ice-lake
// east-shore play strip (E 396–440). Same builders and red lines as the
// zone-1 fill packages (heightfield untouched, snow-mound undulation only,
// clusters not uniform scatter, density >= 2.0 per 40 m cell).
// Exclusions kept: ice-crystal palace body/forecourt (E 460–508, N 39–91),
// hot-spring plot (E 524–572, N 142–174), the lake surface itself, and the
// ice functional zones (夺宝/滑冰/静钓 stay unpressed — play pieces sit on
// the shore strip as their own spots). Every cluster carries a story hook
// (see the placement doc) and at least one touchable point.

export type LakeEastKind = 'fishingShed' | 'boardwalk' | 'shoreLamp' | 'mooringPost'
  | 'iceCart' | 'kitePoint' | 'topTable' | 'creekEnd' | 'snowSculpture' | 'steamPool'
  | 'pineCluster' | 'rockCluster' | 'snowMound' | 'snowmanPair' | 'woodPile' | 'lampPost';

export type LakeEastCluster = {
  id: string; kind: LakeEastKind; east: number; north: number; heading?: number;
};

export const LAKE_EAST_RADII: Record<LakeEastKind, number> = {
  fishingShed: 1.8, boardwalk: 2.2, shoreLamp: 0.6, mooringPost: 0.7,
  iceCart: 1.2, kitePoint: 0.8, topTable: 1.0, creekEnd: 2.2,
  snowSculpture: 1.4, steamPool: 1.6, pineCluster: 2.2, rockCluster: 1.6,
  snowMound: 2.4, snowmanPair: 1.1, woodPile: 1.2, lampPost: 0.6,
};

export const fillLakeEastClusters: readonly LakeEastCluster[] = [
  // East-shore strip: fishing sheds, boardwalk, moorings, shore lamps.
  { id: 'le-shed-1', kind: 'fishingShed', east: 414, north: 64, heading: Math.PI / 2 },
  { id: 'le-shed-2', kind: 'fishingShed', east: 408, north: 68, heading: Math.PI / 2 },
  { id: 'le-shed-3', kind: 'fishingShed', east: 404, north: 84, heading: Math.PI / 2 },
  { id: 'le-walk-1', kind: 'boardwalk', east: 416, north: 60 },
  { id: 'le-walk-2', kind: 'boardwalk', east: 416, north: 76 },
  { id: 'le-shorelamp-1', kind: 'shoreLamp', east: 420, north: 44 },
  { id: 'le-shorelamp-2', kind: 'shoreLamp', east: 420, north: 92 },
  { id: 'le-moor-1', kind: 'mooringPost', east: 398, north: 46 },
  { id: 'le-moor-2', kind: 'mooringPost', east: 398, north: 90 },
  // Shore play spots (own spots, off the ice functional zones).
  { id: 'le-icecart', kind: 'iceCart', east: 424, north: 58, heading: -0.4 },
  { id: 'le-kite', kind: 'kitePoint', east: 428, north: 82 },
  { id: 'le-toptable', kind: 'topTable', east: 412, north: 44 },
  { id: 'le-creekend', kind: 'creekEnd', east: 402, north: 36, heading: 0.3 },
  // Snow sculpture garden (north of the ice palace).
  { id: 'le-sculpt-1', kind: 'snowSculpture', east: 478, north: 108 },
  { id: 'le-sculpt-2', kind: 'snowSculpture', east: 492, north: 116, heading: 0.7 },
  { id: 'le-sculpt-3', kind: 'snowSculpture', east: 466, north: 118, heading: -0.5 },
  // Hot-spring outer pools (south of the hot-spring plot).
  { id: 'le-steam-1', kind: 'steamPool', east: 536, north: 128 },
  { id: 'le-steam-2', kind: 'steamPool', east: 550, north: 116, heading: 0.4 },
  // Snowfield fill: pines, rocks, mounds, snowmen, wood, lamps.
  { id: 'le-pine-1', kind: 'pineCluster', east: 520, north: 60 },
  { id: 'le-pine-2', kind: 'pineCluster', east: 540, north: 48, heading: 0.8 },
  { id: 'le-pine-3', kind: 'pineCluster', east: 600, north: 80, heading: 0.3 },
  { id: 'le-pine-4', kind: 'pineCluster', east: 452, north: 146 },
  { id: 'le-pine-5', kind: 'pineCluster', east: 630, north: 140, heading: 1.2 },
  { id: 'le-rock-1', kind: 'rockCluster', east: 590, north: 20 },
  { id: 'le-rock-2', kind: 'rockCluster', east: 500, north: 14, heading: 0.6 },
  { id: 'le-mound-1', kind: 'snowMound', east: 528, north: 78 },
  { id: 'le-mound-2', kind: 'snowMound', east: 610, north: 130 },
  { id: 'le-mound-3', kind: 'snowMound', east: 472, north: 12 },
  { id: 'le-snowman-1', kind: 'snowmanPair', east: 530, north: 105, heading: -0.3 },
  { id: 'le-woodpile-1', kind: 'woodPile', east: 575, north: 100, heading: 0.5 },
  { id: 'le-lamp-1', kind: 'lampPost', east: 486, north: 124 },
  { id: 'le-lamp-2', kind: 'lampPost', east: 615, north: 55 },
];

const PALETTE = {
  timber: '#5d4630', wood: '#a98a56', stone: '#8a8378', snow: '#e8ecf0',
  dark: '#2c3648', rust: '#8a4a34', firA: '#36534e', firB: '#395b53',
  lampGlow: '#e08a3c', bark: '#6b5138', logEnd: '#c8a878',
  iceA: '#cfe8ec', iceB: '#a8ccd8', lanternRed: '#b03a2a', steam: '#eef2f2',
} as const;

const materials = new Map<string, MeshLambertMaterial>();
function material(hex: string) {
  let m = materials.get(hex);
  if (!m) { m = new MeshLambertMaterial({ color: hex }); materials.set(hex, m); }
  return m;
}
const boxGeometry = new BoxGeometry();

type Part = (u: number, h: number, v: number, size: [number, number, number], hex: string, yaw?: number, pitch?: number, roll?: number) => void;

function fir(part: Part, u: number, v: number, s: number) {
  part(u, 0.67 * s, v, [0.24 * s, 1.34 * s, 0.26 * s], PALETTE.timber);
  const tiers: [number, number][] = [[2.22, 1.04], [1.63, 1.51], [1.02, 1.98], [0.55, 2.45]];
  tiers.forEach(([w, h], i) => {
    part(u, h * s, v, [w * s, 0.58 * s, w * s * 0.86], i % 2 ? PALETTE.firB : PALETTE.firA);
    part(u, (h + 0.33) * s, v, [w * s * 0.91, 0.1 * s, w * s * 0.76], PALETTE.snow);
  });
}

const BUILDERS: Record<LakeEastKind, (part: Part) => void> = {
  fishingShed(part) {
    part(0, 0.08, 0, [2.2, 0.15, 2.2], PALETTE.wood);
    part(0, 0.95, -1.04, [2.2, 1.6, 0.12], PALETTE.timber);
    part(-1.04, 0.95, 0, [0.12, 1.6, 2.2], PALETTE.timber);
    part(1.04, 0.95, 0, [0.12, 1.6, 2.2], PALETTE.timber);
    part(0, 1.85, 0, [2.6, 0.12, 2.6], PALETTE.timber);
    part(0, 1.94, 0, [2.65, 0.05, 2.65], PALETTE.snow);
    part(0.4, 0.18, 0.3, [0.5, 0.05, 0.5], PALETTE.iceA);
    part(-0.5, 0.35, 0.2, [0.45, 0.4, 0.45], PALETTE.bark);
    part(0, 1.5, -0.9, [0.3, 0.34, 0.3], PALETTE.lampGlow);
  },
  boardwalk(part) {
    part(0, 0.3, 0, [1.6, 0.12, 4.4], PALETTE.wood);
    for (const [u, v] of [[-0.6, -1.9], [0.6, -1.9], [-0.6, 1.9], [0.6, 1.9]] as const)
      part(u, 0.15, v, [0.18, 0.3, 0.18], PALETTE.timber);
    part(-0.82, 0.62, 0, [0.08, 0.5, 4.4], PALETTE.timber);
    part(0.82, 0.62, 0, [0.08, 0.5, 4.4], PALETTE.timber);
  },
  shoreLamp(part) {
    part(0, 0.06, 0, [0.42, 0.12, 0.42], PALETTE.stone);
    part(0, 0.95, 0, [0.13, 1.9, 0.13], PALETTE.timber);
    part(0, 1.9, 0, [0.3, 0.36, 0.3], PALETTE.lampGlow);
    part(0, 2.14, 0, [0.44, 0.12, 0.44], PALETTE.timber);
    part(0, 2.22, 0, [0.46, 0.05, 0.46], PALETTE.snow);
  },
  mooringPost(part) {
    part(0, 0.12, 0, [0.7, 0.24, 0.7], PALETTE.stone);
    part(0, 0.65, 0, [0.35, 1.1, 0.35], PALETTE.timber);
    part(0, 1.05, 0, [0.9, 0.12, 0.12], PALETTE.wood);
    part(0.3, 0.85, 0, [0.08, 0.4, 0.08], PALETTE.dark, 0, 0, 0.5);
  },
  iceCart(part) {
    part(0, 0.32, 0, [1.4, 0.15, 0.7], PALETTE.wood);
    part(0, 0.62, -0.3, [1.4, 0.5, 0.12], PALETTE.timber);
    part(-0.55, 0.08, 0, [0.08, 0.12, 1.6], PALETTE.dark);
    part(0.55, 0.08, 0, [0.08, 0.12, 1.6], PALETTE.dark);
    part(-0.85, 0.75, 0.5, [0.06, 1.4, 0.06], PALETTE.bark, 0, 0.5, 0);
    part(0.85, 0.75, 0.5, [0.06, 1.4, 0.06], PALETTE.bark, 0, 0.5, 0);
    part(0, 0.42, 0.05, [1.2, 0.06, 0.5], PALETTE.rust);
  },
  kitePoint(part) {
    part(0, 1.3, 0, [0.1, 2.6, 0.1], PALETTE.timber);
    part(0, 2.45, 0, [0.7, 0.9, 0.05], PALETTE.lanternRed, 0, 0, Math.PI / 4);
    part(0.12, 1.95, 0, [0.1, 0.6, 0.04], PALETTE.lampGlow, 0, 0, 0.3);
  },
  topTable(part) {
    part(0, 0.25, 0, [0.3, 0.5, 0.3], PALETTE.stone);
    part(0, 0.6, 0, [1.6, 0.18, 1.6], PALETTE.stone);
    part(0, 0.82, 0, [0.3, 0.26, 0.3], PALETTE.dark, 0.6);
    part(0, 0.72, 0, [1.5, 0.04, 1.5], PALETTE.iceA);
  },
  creekEnd(part) {
    part(0, 0.05, 0, [1.8, 0.08, 5.0], PALETTE.iceA);
    part(-1.3, 0.3, -1.6, [1.4, 0.6, 1.8], PALETTE.snow);
    part(1.3, 0.3, -1.6, [1.4, 0.6, 1.8], PALETTE.snow);
    part(-0.9, 0.18, 2.2, [0.24, 0.24, 1.4], PALETTE.bark, 0.4);
    part(0.9, 0.18, 2.2, [0.24, 0.24, 1.4], PALETTE.bark, -0.4);
  },
  snowSculpture(part) {
    part(0, 0.15, 0, [1.8, 0.3, 1.2], PALETTE.snow);
    part(0, 0.65, 0, [1.3, 0.7, 0.9], PALETTE.snow);
    part(0, 1.2, 0, [0.9, 0.5, 0.7], PALETTE.snow);
    part(0.1, 1.62, 0, [0.5, 0.4, 0.45], PALETTE.snow);
    part(0.1, 1.68, 0.28, [0.16, 0.1, 0.16], PALETTE.rust);
  },
  steamPool(part) {
    part(-0.95, 0.2, 0, [0.3, 0.4, 2.2], PALETTE.stone);
    part(0.95, 0.2, 0, [0.3, 0.4, 2.2], PALETTE.stone);
    part(0, 0.2, -0.95, [2.2, 0.4, 0.3], PALETTE.stone);
    part(0, 0.2, 0.95, [2.2, 0.4, 0.3], PALETTE.stone);
    part(0, 0.3, 0, [1.7, 0.12, 1.7], PALETTE.iceB);
    part(-0.3, 0.85, 0.2, [0.5, 0.9, 0.5], PALETTE.steam);
    part(0.35, 1.15, -0.25, [0.4, 0.7, 0.4], PALETTE.steam);
    part(1.45, 0.25, 0.6, [0.5, 0.5, 0.4], PALETTE.bark);
  },
  pineCluster(part) { fir(part, 0, 0, 1); fir(part, 0.95, 0.55, 0.72); },
  rockCluster(part) {
    part(0, 0.33, 0, [1.25, 0.66, 1.02], PALETTE.stone, 0.2);
    part(0.62, 0.19, 0.3, [0.72, 0.38, 0.6], PALETTE.stone, -0.3);
    part(-0.55, 0.14, -0.28, [0.55, 0.28, 0.48], PALETTE.rust, 0.5);
    part(0.1, 0.73, -0.05, [0.86, 0.14, 0.7], PALETTE.snow);
    part(-0.2, 0.5, 0.42, [0.4, 0.3, 0.36], PALETTE.stone, 0.9);
  },
  snowMound(part) {
    part(0, 0.14, 0, [4.4, 0.28, 3.4], PALETTE.snow);
    part(0.3, 0.36, -0.2, [3.1, 0.22, 2.4], PALETTE.snow);
    part(-0.2, 0.53, 0.1, [1.8, 0.16, 1.4], PALETTE.snow);
  },
  snowmanPair(part) {
    const one = (u: number, v: number, s: number) => {
      part(u, 0.31 * s, v, [0.78 * s, 0.62 * s, 0.78 * s], PALETTE.snow);
      part(u, 0.82 * s, v, [0.58 * s, 0.44 * s, 0.58 * s], PALETTE.snow);
      part(u, 1.16 * s, v, [0.4 * s, 0.28 * s, 0.4 * s], PALETTE.snow);
      part(u, 0.88 * s, v + 0.3 * s, [0.6 * s, 0.09, 0.06], PALETTE.rust);
    };
    one(-0.42, 0, 1); one(0.48, 0.18, 0.78);
    part(-0.42, 1.34, 0, [0.44, 0.1, 0.44], PALETTE.dark);
  },
  woodPile(part) {
    const log = (u: number, h: number, v: number) => {
      part(u, h, v, [0.32, 0.3, 1.25], PALETTE.bark);
      part(u, h, v - 0.64, [0.26, 0.24, 0.03], PALETTE.logEnd);
    };
    log(-0.36, 0.16, 0); log(0, 0.16, 0.08); log(0.36, 0.16, -0.04); log(-0.18, 0.44, 0.02); log(0.18, 0.44, -0.02);
    part(0, 0.62, 0, [0.3, 0.26, 1.1], PALETTE.bark);
  },
  lampPost(part) {
    part(0, 0.06, 0, [0.42, 0.12, 0.42], PALETTE.stone);
    part(0, 1.06, 0, [0.14, 2.12, 0.14], PALETTE.timber);
    part(0, 2.08, 0, [0.32, 0.38, 0.32], PALETTE.lampGlow);
    part(0, 2.32, 0, [0.46, 0.12, 0.46], PALETTE.timber);
    part(0, 2.4, 0, [0.48, 0.05, 0.48], PALETTE.snow);
  },
};

export function mountTownFillLakeEast(parent: Group, heightAt: (east: number, north: number) => number) {
  const group = new Group();
  group.name = 'town-fill-lake-east';
  parent.add(group);
  const placed: string[] = [];
  for (const cluster of fillLakeEastClusters) {
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
  return {
    group,
    placed,
    dispose() { parent.remove(group); },
  };
}
