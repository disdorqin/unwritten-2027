import { BoxGeometry, Group, Matrix4, Mesh, MeshLambertMaterial } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Blank-fill campaign, independent package (zone-1): the ancient pine
// forest — north forest edge + B3 foothill band. Not shrubs, not street
// trees: three height tiers (18 / 26 / 34 m class), trunks too thick to
// hug, canopy closing overhead, forest floor kept clean (needle soil,
// rock, fallen logs — the anti-white break). Named pieces: the Pine King
// (red silk on the trunk, cloth only, no plaques — wishing-tree grammar),
// the Hollow Pine (a lean-in trunk hollow, G-03 apparition candidate),
// the Fallen-log Bridge across the frozen stream (coordinates aligned
// with the stream piece), and an edge clearing reserved for snowman-
// family / camp pieces. Density rule: the forest itself is the piece —
// no 2.0 scatter inside it.

export type PinewoodKind = 'ancient18' | 'ancient26' | 'pineKing' | 'pineHollow'
  | 'frozenStream' | 'logBridge' | 'clearing';

export type PinewoodCluster = { id: string; kind: PinewoodKind; east: number; north: number; heading?: number };

export const PINEWOOD_RADII: Record<PinewoodKind, number> = {
  ancient18: 3.4, ancient26: 4.2, pineKing: 5.2, pineHollow: 4.2,
  frozenStream: 3.0, logBridge: 2.0, clearing: 3.2,
};

export const fillPinewoodClusters: readonly PinewoodCluster[] = [
  // West stand (foothill, west of the frozen stream).
  { id: 'pw-a26-140', kind: 'ancient26', east: 124, north: 434 },
  { id: 'pw-a18-300b', kind: 'ancient18', east: 300, north: 505 },
  { id: 'pw-a26-150', kind: 'ancient26', east: 150, north: 505 },
  { id: 'pw-a18-185', kind: 'ancient18', east: 185, north: 455 },
  { id: 'pw-a26-205', kind: 'ancient26', east: 189, north: 485 },
  { id: 'pw-a18-175', kind: 'ancient18', east: 175, north: 520 },
  { id: 'pw-a18-130', kind: 'ancient18', east: 130, north: 490 },
  { id: 'pw-king', kind: 'pineKing', east: 168, north: 512 },
  { id: 'pw-hollow', kind: 'pineHollow', east: 148, north: 468 },
  { id: 'pw-clearing', kind: 'clearing', east: 79, north: 448 },
  // The frozen stream and its fallen-log bridge (aligned coordinates).
  { id: 'pw-stream-1', kind: 'frozenStream', east: 232, north: 448, heading: 0.1 },
  { id: 'pw-stream-2', kind: 'frozenStream', east: 238, north: 464, heading: -0.06 },
  { id: 'pw-stream-3', kind: 'frozenStream', east: 240, north: 482, heading: 0.05 },
  { id: 'pw-stream-4', kind: 'frozenStream', east: 237, north: 498, heading: -0.1 },
  { id: 'pw-bridge', kind: 'logBridge', east: 237, north: 470, heading: Math.PI / 2 },
  // East clump (east of the stream).
  { id: 'pw-a26-285', kind: 'ancient26', east: 269, north: 459 },
  { id: 'pw-a18-300', kind: 'ancient18', east: 300, north: 488 },
  { id: 'pw-a18-272', kind: 'ancient18', east: 272, north: 505 },
  { id: 'pw-a26-322', kind: 'ancient26', east: 322, north: 470 },
];

const PALETTE = {
  timber: '#5d4630', wood: '#a98a56', stone: '#8a8378', snow: '#e8ecf0',
  dark: '#2c3648', silk: '#b03a2e', firA: '#36534e', firB: '#395b53',
  needle: '#4a3a28', ice: '#7fd4c8', iceDeep: '#5db3a8', hollow: '#1d150e',
} as const;

const materials = new Map<string, MeshLambertMaterial>();
function material(hex: string) {
  let m = materials.get(hex);
  if (!m) { m = new MeshLambertMaterial({ color: hex }); materials.set(hex, m); }
  return m;
}
const boxGeometry = new BoxGeometry();

type Part = (u: number, h: number, v: number, size: [number, number, number], hex: string, yaw?: number, pitch?: number, roll?: number) => void;

// An ancient pine of total height H: bare trunk to ~0.38H, then five
// canopy tiers tapering from 0.34H wide to a point, snow on each tier.
function ancient(part: Part, u: number, v: number, H: number) {
  const trunkW = H * 0.038;
  part(u, H * 0.19, v, [trunkW, H * 0.38, trunkW], PALETTE.timber);
  part(u, H * 0.02, v, [trunkW * 1.7, H * 0.04, trunkW * 1.7], PALETTE.timber);
  const tiers = 5;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const y = H * (0.36 + t * 0.58);
    const w = H * 0.34 * (1 - t * 0.78);
    part(u, y, v, [w, H * 0.075, w * 0.86], i % 2 ? PALETTE.firB : PALETTE.firA);
    part(u, y + H * 0.048, v, [w * 0.9, H * 0.016, w * 0.76], PALETTE.snow);
  }
  part(u, H * 0.99, v, [H * 0.03, H * 0.05, H * 0.03], PALETTE.firA);
}

const BUILDERS: Record<PinewoodKind, (part: Part) => void> = {
  ancient18(part) { ancient(part, 0, 0, 18); part(1.8, 0.2, 1.2, [0.9, 0.4, 0.7], PALETTE.stone, 0.6); },
  ancient26(part) { ancient(part, 0, 0, 26); part(-2.2, 0.16, 1.6, [1.1, 0.32, 0.8], PALETTE.stone, 1.1); part(0, 0.02, 0, [5.4, 0.04, 4.6], PALETTE.needle); },
  pineKing(part) {
    ancient(part, 0, 0, 34);
    part(0, 0.02, 0, [7.2, 0.04, 6.2], PALETTE.needle);
    // Red silk: a band around the trunk + two hanging strips. Cloth only.
    part(0, 2.1, 0, [1.5, 0.5, 1.5], PALETTE.silk);
    part(0.55, 1.55, 0.62, [0.34, 0.85, 0.06], PALETTE.silk);
    part(-0.4, 1.42, 0.66, [0.28, 0.6, 0.06], PALETTE.silk);
    part(2.8, 0.3, -1.8, [1.3, 0.6, 0.95], PALETTE.stone, 0.4);
    part(-3.1, 0.22, 1.4, [1.0, 0.44, 0.8], PALETTE.stone, 1.3);
  },
  pineHollow(part) {
    ancient(part, 0, 0, 26);
    // The hollow: a dark lean-in opening at the trunk base, south face.
    part(0, 0.85, 0.62, [0.95, 1.7, 0.3], PALETTE.hollow);
    part(0, 1.78, 0.6, [1.05, 0.18, 0.34], PALETTE.timber);
    part(0, 0.03, 1.15, [1.5, 0.05, 0.9], PALETTE.needle);
  },
  frozenStream(part) {
    part(0, 0.05, 0, [7.5, 0.1, 9.5], PALETTE.ice);
    part(0.4, 0.09, -1.2, [5.6, 0.06, 6.8], PALETTE.iceDeep);
    for (const u of [-4.3, 4.3]) part(u, 0.14, 0, [1.1, 0.28, 9.5], PALETTE.snow);
    part(-1.8, 0.3, 2.8, [0.7, 0.42, 0.55], PALETTE.ice, 0.7);
    part(2.1, 0.22, -3.1, [0.55, 0.3, 0.45], PALETTE.ice, 1.4);
  },
  logBridge(part) {
    // One fallen ancient, trunk lying east-west across the stream; the
    // flattened top is the walking face. Root plate stands at the west end.
    part(0, 0.55, 0, [17, 1.05, 1.15], PALETTE.timber, Math.PI / 2);
    part(0, 1.12, 0, [17, 0.1, 0.8], PALETTE.wood, Math.PI / 2);
    part(0, 1.24, 0, [17, 0.05, 0.86], PALETTE.snow, Math.PI / 2);
    part(-8.2, 1.0, 0, [0.5, 2.6, 2.4], PALETTE.timber);
    part(8.4, 0.3, 0.3, [1.4, 0.6, 1.0], PALETTE.stone, 0.5);
    part(-8.4, 0.25, -0.4, [1.2, 0.5, 0.9], PALETTE.stone, 1.1);
  },
  clearing(part) {
    // The clearing doubles as the menu's foothill cookout point: fire
    // ring at the center, sitting stones around it.
    part(0, 0.02, 0, [7.6, 0.045, 6.4], PALETTE.needle);
    part(0, 0.05, 0, [1.0, 0.1, 1.0], PALETTE.needle);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      part(Math.cos(a) * 0.62, 0.12, Math.sin(a) * 0.62, [0.3, 0.22, 0.26], PALETTE.stone, a);
    }
    part(0, 0.14, 0, [0.55, 0.1, 0.55], '#3d2a26');
    part(0, 0.24, 0, [0.3, 0.12, 0.3], '#e08a3c');
    for (const a of [0.4, 2.5, 4.4]) part(Math.cos(a) * 1.5, 0.26, Math.sin(a) * 1.5, [1.0, 0.5, 0.55], PALETTE.stone, -a);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      part(Math.cos(a) * 3.4, 0.14, Math.sin(a) * 2.8, [0.5, 0.26, 0.42], PALETTE.stone, a);
    }
    part(-2.4, 0.26, -1.6, [0.62, 0.52, 0.62], PALETTE.timber);
    part(2.6, 0.26, 1.8, [0.62, 0.52, 0.62], PALETTE.timber);
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

export function mountTownFillPinewood(parent: Group, heightAt: (east: number, north: number) => number) {
  const group = new Group();
  group.name = 'town-fill-pinewood';
  parent.add(group);
  const placed: string[] = [];
  for (const cluster of fillPinewoodClusters) {
    // The stream sits in the channel bed: sample its own low point.
    const y = heightAt(cluster.east, cluster.north);
    const item = new Group();
    item.position.set(cluster.east, y, -cluster.north);
    item.rotation.y = cluster.heading ?? 0;
    if (cluster.kind === 'pineHollow') group.userData.g03Candidate = 'hollow-pine-lean-in @148,468';
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
  return { group, placed, dispose() { parent.remove(group); } };
}
