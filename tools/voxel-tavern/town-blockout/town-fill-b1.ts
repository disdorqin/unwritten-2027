import { BoxGeometry, Group, Matrix4, Mesh, MeshLambertMaterial } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Blank-fill campaign, B1 northeast wilds (zone-1): INTERACTIVE menu
// package (Thomas 00:49) — every named piece carries at least one touch
// (climb / enter / look / sit / gather), pure-look pieces stay under
// half, and each cluster registers its interaction in `touch`. Colors
// rotate per the discipline (berry red / red-stem shrubs / reed silver /
// rime cyan / pine green / rust rock), snow only as the base.

export type B1Kind = 'boulderField' | 'hunterHut' | 'loneLookout' | 'starCamp'
  | 'berryThicket' | 'mushroomPatch' | 'pineStand' | 'rockCluster' | 'snowMound';

export type B1Cluster = { id: string; kind: B1Kind; east: number; north: number; heading?: number; touch: string };

export const B1_RADII: Record<B1Kind, number> = {
  boulderField: 3.4, hunterHut: 2.2, loneLookout: 3.0, starCamp: 2.6,
  berryThicket: 1.9, mushroomPatch: 1.5, pineStand: 2.8, rockCluster: 1.7, snowMound: 2.4,
};

export const fillB1Clusters: readonly B1Cluster[] = [
  { id: 'b1-boulders', kind: 'boulderField', east: 568, north: 317, heading: .4, touch: 'climb/sit — stepped boulders, flat top is a lookout' },
  { id: 'b1-hut', kind: 'hunterHut', east: 498, north: 399, heading: Math.PI, touch: 'enter — hunter shelter micro-domain' },
  { id: 'b1-lookout', kind: 'loneLookout', east: 610, north: 420, heading: -.6, touch: 'look — platform + telescope toward the banner cloud' },
  { id: 'b1-starcamp', kind: 'starCamp', east: 565, north: 235, heading: .9, touch: 'sit/rest — night-only star camp, fire ring' },
  { id: 'b1-berry-545', kind: 'berryThicket', east: 545, north: 180, touch: 'gather — winter berries' },
  { id: 'b1-berry-600', kind: 'berryThicket', east: 600, north: 360, touch: 'gather — winter berries' },
  { id: 'b1-berry-500', kind: 'berryThicket', east: 500, north: 455, touch: 'gather — winter berries' },
  { id: 'b1-berry-630', kind: 'berryThicket', east: 630, north: 265, touch: 'gather — winter berries' },
  { id: 'b1-shroom-505', kind: 'mushroomPatch', east: 505, north: 300, touch: 'gather — pine mushrooms for the tavern kitchen' },
  { id: 'b1-shroom-585', kind: 'mushroomPatch', east: 585, north: 455, touch: 'gather — pine mushrooms for the tavern kitchen' },
  { id: 'b1-shroom-635', kind: 'mushroomPatch', east: 635, north: 390, touch: 'gather — pine mushrooms for the tavern kitchen' },
  { id: 'b1-pine-555', kind: 'pineStand', east: 555, north: 410, touch: 'look — stand shade marker' },
  { id: 'b1-pine-620', kind: 'pineStand', east: 620, north: 180, touch: 'look — stand shade marker' },
  { id: 'b1-pine-480', kind: 'pineStand', east: 461, north: 240, touch: 'look — stand shade marker' },
  { id: 'b1-rock-530', kind: 'rockCluster', east: 530, north: 330, heading: .8, touch: 'look' },
  { id: 'b1-rock-615', kind: 'rockCluster', east: 615, north: 480, heading: 1.9, touch: 'look' },
  { id: 'b1-mound-470', kind: 'snowMound', east: 448, north: 331, touch: 'look' },
  { id: 'b1-mound-575', kind: 'snowMound', east: 575, north: 140, touch: 'look' },
  { id: 'b1-mound-645', kind: 'snowMound', east: 632, north: 330, touch: 'look' },
];

const PALETTE = {
  timber: '#5d4630', wood: '#a98a56', stone: '#8a8378', snow: '#e8ecf0',
  dark: '#2c3648', rust: '#8a4a34', firA: '#36534e', firB: '#395b53',
  berry: '#b03a2e', holly: '#2f4a34', reed: '#c9cdd2', ice: '#7fd4c8',
  needle: '#4a3a28', ash: '#3d2a26', ember: '#e08a3c', cap: '#a98a56',
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

function shrub(part: Part, u: number, v: number, s: number) {
  part(u, 0.42 * s, v, [1.15 * s, 0.84 * s, 1.0 * s], PALETTE.holly);
  part(u + 0.3 * s, 0.95 * s, v, [0.7 * s, 0.3 * s, 0.6 * s], PALETTE.snow);
  for (const [du, dv] of [[-0.5, 0.3], [0.45, -0.35], [0.1, 0.52], [-0.2, -0.48]] as const)
    part(u + du * s, 0.62 * s, v + dv * s, [0.13 * s, 0.13 * s, 0.13 * s], PALETTE.berry);
}

const BUILDERS: Record<B1Kind, (part: Part) => void> = {
  boulderField(part) {
    part(-1.9, 0.6, 0.4, [2.2, 1.2, 1.8], PALETTE.stone, 0.3);
    part(-0.4, 1.1, -0.5, [2.0, 2.2, 1.9], PALETTE.stone, 0.9);
    part(1.15, 1.55, -0.4, [1.7, 3.1, 1.6], PALETTE.dark, 0.2);
    part(1.15, 3.16, -0.4, [1.8, 0.12, 1.7], PALETTE.stone);
    part(1.15, 3.3, -0.4, [1.2, 0.06, 1.1], PALETTE.snow);
    part(2.6, 0.45, 0.9, [1.3, 0.9, 1.1], PALETTE.rust, 1.4);
    part(-2.9, 0.3, -1.1, [1.1, 0.6, 0.9], PALETTE.stone, 2.0);
    part(-0.4, 2.26, -0.5, [1.4, 0.08, 1.3], PALETTE.snow);
  },
  hunterHut(part) {
    part(0, 0.05, 0, [3.4, 0.1, 2.8], PALETTE.timber);
    part(0, 0.95, -1.3, [3.4, 1.9, 0.14], PALETTE.timber);
    for (const u of [-1.63, 1.63]) part(u, 0.95, 0, [0.14, 1.9, 2.8], PALETTE.timber);
    part(0, 2.14, -0.15, [3.8, 0.12, 3.3], PALETTE.wood, 0, 0.14);
    part(0, 2.28, -0.15, [3.8, 0.05, 3.3], PALETTE.snow, 0, 0.14);
    part(-0.9, 0.35, -0.7, [0.8, 0.5, 0.6], PALETTE.wood);
    part(0.85, 0.3, 0.6, [0.24, 0.6, 1.1], PALETTE.timber, 0.2);
    part(1.95, 1.05, 1.15, [0.12, 2.1, 0.12], PALETTE.timber);
    part(1.95, 1.95, 1.15, [0.3, 0.3, 0.3], PALETTE.ember);
  },
  loneLookout(part) {
    fir(part, -1.4, -1.0, 2.6);
    for (const [u, v] of [[0.9, 0.9], [2.5, 0.9], [0.9, 2.5], [2.5, 2.5]] as const)
      part(u, 1.3, v, [0.16, 2.6, 0.16], PALETTE.timber);
    part(1.7, 2.68, 1.7, [2.1, 0.14, 2.1], PALETTE.wood);
    part(1.7, 3.3, 0.72, [2.1, 0.1, 0.1], PALETTE.timber);
    part(1.7, 3.3, 2.68, [2.1, 0.1, 0.1], PALETTE.timber);
    part(0.72, 3.3, 1.7, [0.1, 0.1, 2.1], PALETTE.timber);
    // Telescope: post + angled tube aimed along -heading (NW at rest).
    part(1.7, 3.35, 1.7, [0.14, 0.7, 0.14], PALETTE.timber);
    part(1.7, 3.85, 1.35, [0.2, 0.2, 1.15], PALETTE.dark, 0, -0.42);
    part(1.7, 3.98, 0.82, [0.26, 0.26, 0.22], PALETTE.rust, 0, -0.42);
    part(-0.6, 0.05, 2.2, [2.6, 0.1, 1.6], PALETTE.reed);
  },
  starCamp(part) {
    part(0, 0.05, 0, [1.0, 0.1, 1.0], PALETTE.ash);
    part(0, 0.16, 0, [0.4, 0.14, 0.4], PALETTE.ember);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      part(Math.cos(a) * 0.6, 0.11, Math.sin(a) * 0.6, [0.28, 0.2, 0.24], PALETTE.stone, a);
    }
    for (const a of [0.5, 2.6, 4.7]) part(Math.cos(a) * 1.45, 0.22, Math.sin(a) * 1.45, [1.05, 0.42, 0.4], PALETTE.timber, -a);
    part(-1.7, 0.75, -1.5, [0.14, 1.5, 0.14], PALETTE.timber);
    part(1.7, 0.75, -1.5, [0.14, 1.5, 0.14], PALETTE.timber);
    part(0, 1.35, -1.35, [3.6, 0.1, 1.5], PALETTE.wood, 0, -0.35);
    part(2.1, 0.3, 0.9, [0.8, 0.6, 0.6], PALETTE.timber, 0.4);
  },
  berryThicket(part) {
    shrub(part, -1.1, -0.5, 1.0); shrub(part, 0.9, -0.8, 1.2); shrub(part, 0, 0.7, 0.9);
    shrub(part, 1.5, 0.6, 0.8); shrub(part, -1.6, 0.5, 0.75);
    part(0, 0.02, 0, [3.6, 0.04, 2.6], PALETTE.needle);
  },
  mushroomPatch(part) {
    part(0, 0.02, 0, [2.6, 0.04, 2.2], PALETTE.needle);
    const spots: [number, number, string][] = [[-0.8, -0.5, PALETTE.cap], [0.3, -0.7, PALETTE.rust], [0.9, 0.2, PALETTE.cap], [-0.4, 0.6, PALETTE.rust], [0.6, 0.8, PALETTE.cap], [-1.0, 0.1, PALETTE.rust]];
    for (const [u, v, hex] of spots) {
      part(u, 0.14, v, [0.09, 0.24, 0.09], PALETTE.snow);
      part(u, 0.3, v, [0.34, 0.12, 0.34], hex);
    }
    part(1.15, 0.35, -0.85, [0.5, 0.66, 0.45], PALETTE.timber);
  },
  pineStand(part) {
    fir(part, -1.7, -1.0, 1.5); fir(part, 1.6, -1.3, 1.35); fir(part, 0, 0.8, 1.65); fir(part, 2.2, 1.2, 1.1);
    part(-0.8, 0.03, 0.2, [3.8, 0.05, 3.0], PALETTE.needle);
  },
  rockCluster(part) {
    part(-0.7, 0.3, 0.1, [1.3, 0.6, 1.0], PALETTE.stone, 0.4);
    part(0.55, 0.42, -0.3, [1.1, 0.84, 0.9], PALETTE.rust, 1.0);
    part(1.2, 0.15, 0.55, [0.7, 0.3, 0.55], PALETTE.stone, 1.8);
    part(0.1, 0.9, -0.2, [0.9, 0.09, 0.75], PALETTE.snow);
  },
  snowMound(part) {
    part(0, 0.22, 0, [4.4, 0.44, 3.2], PALETTE.snow);
    part(0.4, 0.5, -0.3, [2.9, 0.3, 2.1], PALETTE.snow);
    part(-0.5, 0.72, 0.15, [1.6, 0.24, 1.2], PALETTE.snow);
    part(1.7, 0.14, 0.8, [1.3, 0.12, 0.9], PALETTE.ice);
  },
};

// Draw discipline (景物册追补 c7182bbb): the whole package merges into one
// mesh per palette material. Returns the pre-merge part count.
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

export function mountTownFillB1(parent: Group, heightAt: (east: number, north: number) => number) {
  const group = new Group();
  group.name = 'town-fill-b1';
  parent.add(group);
  const placed: string[] = [];
  for (const cluster of fillB1Clusters) {
    const y = heightAt(cluster.east, cluster.north);
    const item = new Group();
    item.position.set(cluster.east, y, -cluster.north);
    item.rotation.y = cluster.heading ?? 0;
    item.userData.touch = cluster.touch;
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
