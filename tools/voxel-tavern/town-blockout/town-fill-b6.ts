import { BoxGeometry, Group, Matrix4, Mesh, MeshLambertMaterial } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Blank-fill campaign, B6 southeast foothill shoulder (zone-1): the
// station-back shoulder between the memorial plots and the front-peak
// skirt. Interactive menu: a beginner ski run and a panorama lookout
// deck lead; red-stem shrubs rotate the winter color in. Every cluster
// registers its interaction in `touch`.

export type B6Kind = 'skiRun' | 'lookoutDeck' | 'redStem' | 'mushroomPatch'
  | 'restStones' | 'freightScatter' | 'pineStand';

export type B6Cluster = { id: string; kind: B6Kind; east: number; north: number; heading?: number; touch: string };

export const B6_RADII: Record<B6Kind, number> = {
  skiRun: 3.2, lookoutDeck: 2.4, redStem: 1.8, mushroomPatch: 1.5,
  restStones: 1.4, freightScatter: 2.0, pineStand: 2.8,
};

export const fillB6Clusters: readonly B6Cluster[] = [
  { id: 'b6-ski', kind: 'skiRun', east: 495, north: 368, heading: 0, touch: 'play — beginner ski/sled run with buffer stop' },
  { id: 'b6-deck', kind: 'lookoutDeck', east: 428, north: 370, heading: -2.2, touch: 'look/sit — lake and town panorama deck' },
  { id: 'b6-redstem-480', kind: 'redStem', east: 456, north: 314, touch: 'gather — red-stem cuttings' },
  { id: 'b6-redstem-545', kind: 'redStem', east: 545, north: 348, touch: 'gather — red-stem cuttings' },
  { id: 'b6-shroom', kind: 'mushroomPatch', east: 454, north: 369, touch: 'gather — pine mushrooms for the tavern kitchen' },
  { id: 'b6-rest', kind: 'restStones', east: 532, north: 322, touch: 'sit — line-keeper rest stones' },
  { id: 'b6-freight', kind: 'freightScatter', east: 520, north: 392, heading: .5, touch: 'look — station freight traces' },
  { id: 'b6-pine', kind: 'pineStand', east: 552, north: 318, touch: 'look — stand shade marker' },
];

const PALETTE = {
  timber: '#5d4630', wood: '#a98a56', stone: '#8a8378', snow: '#e8ecf0',
  dark: '#2c3648', rust: '#8a4a34', firA: '#36534e', firB: '#395b53',
  stem: '#b03a2e', needle: '#4a3a28', ice: '#7fd4c8', cap: '#a98a56',
  lampGlow: '#e08a3c',
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

const BUILDERS: Record<B6Kind, (part: Part) => void> = {
  skiRun(part) {
    // Groomed strip running north (start) to south (buffer), banked sides.
    for (let i = 0; i < 4; i++) {
      const v = -6 + i * 4;
      part(0, 0.06, v, [3.4, 0.12, 4.4], i % 2 ? PALETTE.snow : PALETTE.ice);
      part(-2.1, 0.3, v, [0.8, 0.5, 4.4], PALETTE.snow);
      part(2.1, 0.3, v, [0.8, 0.5, 4.4], PALETTE.snow);
    }
    for (const u of [-1.9, 1.9]) part(u, 1.1, -8.6, [0.16, 2.2, 0.16], PALETTE.timber);
    part(0, 2.14, -8.6, [4.0, 0.18, 0.14], PALETTE.rust);
    part(-1.2, 0.55, 9.6, [2.2, 1.1, 1.4], PALETTE.snow);
    part(1.3, 0.45, 10.2, [1.9, 0.9, 1.2], PALETTE.snow);
    part(0, 0.7, 9.0, [2.6, 1.4, 1.1], PALETTE.snow);
  },
  lookoutDeck(part) {
    for (const [u, v] of [[-1.7, -1.2], [1.7, -1.2], [-1.7, 1.2], [1.7, 1.2]] as const)
      part(u, 0.55, v, [0.18, 1.1, 0.18], PALETTE.timber);
    part(0, 1.16, 0, [4.0, 0.14, 2.9], PALETTE.wood);
    part(0, 1.75, -1.5, [4.0, 0.1, 0.1], PALETTE.timber);
    for (const u of [-1.9, -0.65, 0.65, 1.9]) part(u, 1.45, -1.5, [0.09, 0.6, 0.09], PALETTE.timber);
    part(0.6, 1.45, 0.6, [1.5, 0.1, 0.45], PALETTE.timber);
    part(0.6, 1.28, 0.6, [0.12, 0.35, 0.4], PALETTE.timber);
    part(-1.55, 1.75, 1.15, [0.34, 0.34, 0.34], PALETTE.lampGlow);
    part(-1.55, 1.35, 1.15, [0.12, 0.5, 0.12], PALETTE.timber);
  },
  redStem(part) {
    part(0, 0.02, 0, [3.2, 0.04, 2.4], PALETTE.needle);
    const clumps: [number, number][] = [[-1.0, -0.5], [0.8, -0.7], [0, 0.6], [1.3, 0.5], [-1.4, 0.4]];
    for (const [u, v] of clumps) {
      part(u, 0.3, v, [0.5, 0.6, 0.5], PALETTE.dark);
      for (const du of [-0.14, 0, 0.14])
        part(u + du, 0.85, v, [0.055, 0.75, 0.055], PALETTE.stem, 0, du * 1.4);
      part(u, 1.22, v, [0.4, 0.07, 0.4], PALETTE.snow);
    }
  },
  mushroomPatch(part) {
    part(0, 0.02, 0, [2.6, 0.04, 2.2], PALETTE.needle);
    const spots: [number, number, string][] = [[-0.8, -0.5, PALETTE.cap], [0.3, -0.7, PALETTE.rust], [0.9, 0.2, PALETTE.cap], [-0.4, 0.6, PALETTE.rust], [0.6, 0.8, PALETTE.cap]];
    for (const [u, v, hex] of spots) {
      part(u, 0.14, v, [0.09, 0.24, 0.09], PALETTE.snow);
      part(u, 0.3, v, [0.34, 0.12, 0.34], hex);
    }
    part(-1.15, 0.3, 0.8, [0.45, 0.56, 0.4], PALETTE.timber);
  },
  restStones(part) {
    part(-0.7, 0.28, 0, [1.1, 0.56, 0.8], PALETTE.stone, 0.3);
    part(0.75, 0.24, 0.3, [0.95, 0.48, 0.7], PALETTE.stone, 1.1);
    part(0, 0.62, -0.75, [0.8, 0.5, 0.6], PALETTE.rust, 0.7);
    part(0, 0.9, -0.75, [0.7, 0.06, 0.5], PALETTE.snow);
    part(1.35, 0.85, -0.5, [0.12, 1.7, 0.12], PALETTE.timber);
    part(1.35, 1.62, -0.5, [0.28, 0.28, 0.28], PALETTE.lampGlow);
  },
  freightScatter(part) {
    part(-1.2, 0.4, -0.4, [1.05, 0.8, 0.85], PALETTE.timber, 0.15);
    part(-1.15, 1.0, -0.35, [0.95, 0.4, 0.75], PALETTE.wood, -0.1);
    part(0.4, 0.32, 0.5, [0.9, 0.64, 0.8], PALETTE.wood, 0.7);
    part(1.5, 0.28, -0.6, [0.75, 0.56, 0.7], PALETTE.timber, 1.2);
    part(0.2, 0.14, -1.15, [1.6, 0.28, 0.5], PALETTE.dark, 0.2);
    part(-0.5, 0.75, 0.95, [0.5, 0.5, 0.5], PALETTE.rust, 0.9);
  },
  pineStand(part) {
    fir(part, -1.7, -1.0, 1.5); fir(part, 1.6, -1.3, 1.35); fir(part, 0, 0.8, 1.65);
    part(-0.8, 0.03, 0.2, [3.8, 0.05, 3.0], PALETTE.needle);
  },
};

// Draw discipline (景物册追补 c7182bbb): one mesh per palette material.
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

export function mountTownFillB6(parent: Group, heightAt: (east: number, north: number) => number) {
  const group = new Group();
  group.name = 'town-fill-b6';
  parent.add(group);
  const placed: string[] = [];
  for (const cluster of fillB6Clusters) {
    const y = heightAt(cluster.east, cluster.north);
    const item = new Group();
    item.position.set(cluster.east, y, -cluster.north);
    item.rotation.y = cluster.heading ?? 0;
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
