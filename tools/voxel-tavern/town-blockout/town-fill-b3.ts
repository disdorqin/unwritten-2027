import { BoxGeometry, Group, Matrix4, Mesh, MeshLambertMaterial } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Blank-fill campaign, package 3 (zone-1 self-build + self-mount, 代挂):
// B3 mountain-skirt snowfield — the largest blank on the map (front-peak
// south slope, town frame). Slope-hugging visual pieces only, graded by
// the four-band rule (追令三): soil patches and camp traces stay in the
// foothill band; pines thin with height; the snowfield band takes rocks
// and drifts only. Cable line / mid station / summit platform keep clear.

export type B3Kind = 'pineStand' | 'pineSparse' | 'rockSlope' | 'driftSlope'
  | 'soilPatch' | 'milestone' | 'trailSign' | 'windShelter' | 'campTrace';

export type B3Cluster = { id: string; kind: B3Kind; east: number; north: number; heading?: number };

export const B3_RADII: Record<B3Kind, number> = {
  pineStand: 3.0, pineSparse: 2.2, rockSlope: 1.8, driftSlope: 2.6,
  soilPatch: 2.0, milestone: .5, trailSign: .6, windShelter: 1.6, campTrace: 1.8,
};

export const fillB3Clusters: readonly B3Cluster[] = [
  // Foothill band (N 505-545): full vocabulary — forest, soil, camp, shelter.
  { id: 'b3-soil-120', kind: 'soilPatch', east: 120, north: 520 },
  { id: 'b3-stand-170', kind: 'pineStand', east: 170, north: 535 },
  { id: 'b3-camp-225', kind: 'campTrace', east: 252, north: 548, heading: .4 },
  { id: 'b3-stand-285', kind: 'pineStand', east: 285, north: 540 },
  { id: 'b3-soil-345', kind: 'soilPatch', east: 345, north: 520 },
  { id: 'b3-shelter-395', kind: 'windShelter', east: 395, north: 530, heading: Math.PI },
  { id: 'b3-stand-470', kind: 'pineStand', east: 470, north: 545 },
  { id: 'b3-rock-520', kind: 'rockSlope', east: 520, north: 520, heading: .7 },
  { id: 'b3-mile-565', kind: 'milestone', east: 565, north: 535 },
  { id: 'b3-stand-80', kind: 'pineStand', east: 80, north: 545 },
  // Treeline transition (N 550-610): pines thin out, rocks and drifts grow.
  { id: 'b3-sparse-105', kind: 'pineSparse', east: 105, north: 575 },
  { id: 'b3-drift-160', kind: 'driftSlope', east: 160, north: 590 },
  { id: 'b3-sparse-215', kind: 'pineSparse', east: 215, north: 565 },
  { id: 'b3-rock-265', kind: 'rockSlope', east: 265, north: 595, heading: 1.2 },
  { id: 'b3-sign-310', kind: 'trailSign', east: 310, north: 575, heading: .3 },
  { id: 'b3-sparse-370', kind: 'pineSparse', east: 352, north: 592 },
  { id: 'b3-drift-425', kind: 'driftSlope', east: 425, north: 570 },
  { id: 'b3-rock-480', kind: 'rockSlope', east: 480, north: 600, heading: .2 },
  { id: 'b3-sparse-530', kind: 'pineSparse', east: 530, north: 580 },
  { id: 'b3-mile-585', kind: 'milestone', east: 585, north: 605 },
  { id: 'b3-drift-60', kind: 'driftSlope', east: 60, north: 600 },
  // Snowfield band (N 615-685): rocks and drifts only, sparse.
  { id: 'b3-rock-140', kind: 'rockSlope', east: 140, north: 640, heading: 1.7 },
  { id: 'b3-drift-205', kind: 'driftSlope', east: 205, north: 655 },
  { id: 'b3-rock-255', kind: 'rockSlope', east: 255, north: 630, heading: .5 },
  { id: 'b3-drift-390', kind: 'driftSlope', east: 390, north: 650 },
  { id: 'b3-rock-450', kind: 'rockSlope', east: 450, north: 635, heading: 1.0 },
  { id: 'b3-drift-510', kind: 'driftSlope', east: 510, north: 660 },
  { id: 'b3-rock-570', kind: 'rockSlope', east: 570, north: 640, heading: .9 },
  { id: 'b3-drift-95', kind: 'driftSlope', east: 95, north: 665 },
];

const PALETTE = {
  timber: '#5d4630', wood: '#a98a56', stone: '#8a8378', snow: '#e8ecf0',
  dark: '#2c3648', rust: '#8a4a34', firA: '#36534e', firB: '#395b53',
  soil: '#a98a56', soilDark: '#5d4630', ash: '#3d2a26', crystal: '#7fd4c8',
} as const;

const materials = new Map<string, MeshLambertMaterial>();
function material(hex: string) {
  let m = materials.get(hex);
  if (!m) { m = new MeshLambertMaterial({ color: hex }); materials.set(hex, m); }
  return m;
}
const boxGeometry = new BoxGeometry();

type Part = (u: number, h: number, v: number, size: [number, number, number], hex: string, yaw?: number, pitch?: number, roll?: number) => void;

function fir(part: Part, u: number, v: number, scale: number, lean = 0) {
  part(u, 0.67 * scale, v, [0.24 * scale, 1.34 * scale, 0.26 * scale], PALETTE.timber, 0, 0, lean);
  const tiers: [number, number][] = [[2.22, 1.04], [1.63, 1.51], [1.02, 1.98], [0.55, 2.45]];
  tiers.forEach(([w, h], i) => {
    part(u + lean * h * 2, h * scale, v, [w * scale, 0.58 * scale, w * 0.86 * scale], i % 2 ? PALETTE.firB : PALETTE.firA, 0, 0, lean);
    part(u + lean * h * 2, (h + 0.33) * scale, v, [w * 0.91 * scale, 0.1 * scale, w * 0.76 * scale], PALETTE.snow, 0, 0, lean);
  });
}

const BUILDERS: Record<B3Kind, (part: Part) => void> = {
  pineStand(part) {
    fir(part, -2.2, -1.2, 1.6); fir(part, 1.9, -1.6, 1.45); fir(part, 0.2, 0.6, 1.8);
    fir(part, -1.6, 1.8, 1.3); fir(part, 2.4, 1.4, 1.15); fir(part, 0.4, -2.4, 1.25);
    part(1.2, 0.25, 2.2, [1.1, 0.5, 0.8], PALETTE.stone, 0.5);
    part(-2.6, 0.05, 0.4, [1.6, 0.1, 1.2], PALETTE.soilDark);
  },
  pineSparse(part) {
    fir(part, -1.2, -0.6, 0.95, 0.06); fir(part, 1.4, 0.8, 0.8, -0.05); fir(part, 0.2, 1.6, 0.6, 0.09);
    part(0, 0.04, 0, [3.4, 0.08, 2.8], PALETTE.snow);
  },
  rockSlope(part) {
    part(-0.9, 0.35, 0.1, [1.5, 0.7, 1.1], PALETTE.stone, 0.4);
    part(0.6, 0.5, -0.4, [1.25, 1.0, 1.0], PALETTE.stone, 1.0);
    part(0.15, 1.05, -0.3, [0.8, 0.55, 0.7], PALETTE.dark, 0.2);
    part(1.4, 0.18, 0.6, [0.8, 0.36, 0.6], PALETTE.stone, 1.8);
    part(-0.2, 1.42, -0.25, [0.85, 0.1, 0.72], PALETTE.snow);
    part(0.95, 0.28, -0.9, [0.5, 0.2, 0.4], PALETTE.crystal, 0.7);
  },
  driftSlope(part) {
    part(0, 0.16, 0, [5.6, 0.32, 2.6], PALETTE.snow);
    part(0.5, 0.4, -0.3, [3.8, 0.24, 1.8], PALETTE.snow);
    part(-0.4, 0.58, 0.1, [2.2, 0.18, 1.2], PALETTE.snow);
    part(1.9, 0.2, 0.7, [1.4, 0.14, 0.9], PALETTE.snow);
  },
  soilPatch(part) {
    part(0, 0.03, 0, [3.6, 0.06, 2.8], PALETTE.soil);
    part(0.7, 0.05, -0.5, [1.8, 0.05, 1.3], PALETTE.soilDark);
    part(-0.9, 0.06, 0.6, [1.2, 0.05, 0.9], PALETTE.soil);
    part(0, 0.09, 0, [3.8, 0.03, 3.0], PALETTE.snow);
    part(-1.4, 0.22, -0.9, [0.7, 0.4, 0.55], PALETTE.stone, 0.8);
    part(1.5, 0.18, 0.9, [0.6, 0.32, 0.5], PALETTE.stone, 0.2);
  },
  milestone(part) {
    part(0, 0.06, 0, [0.5, 0.12, 0.5], PALETTE.stone);
    part(0, 0.55, 0, [0.3, 0.9, 0.24], PALETTE.stone);
    part(0, 1.04, 0, [0.34, 0.08, 0.28], PALETTE.snow);
  },
  trailSign(part) {
    part(0, 0.95, 0, [0.14, 1.9, 0.14], PALETTE.timber);
    part(0.2, 1.66, 0, [1.0, 0.34, 0.06], PALETTE.wood, 0.12);
    part(-0.16, 1.3, 0, [0.85, 0.3, 0.06], PALETTE.wood, -0.1);
    part(0.2, 1.86, 0, [1.0, 0.05, 0.08], PALETTE.snow);
  },
  windShelter(part) {
    for (const u of [-1.1, 1.1]) part(u, 0.8, -0.7, [0.16, 1.6, 0.16], PALETTE.timber);
    part(0, 1.68, -0.55, [2.7, 0.12, 1.5], PALETTE.wood, 0, -0.18);
    part(0, 1.78, -0.55, [2.7, 0.05, 1.5], PALETTE.snow, 0, -0.18);
    part(0, 0.75, -0.85, [2.4, 1.5, 0.12], PALETTE.timber);
    for (const u of [-0.8, 0, 0.8]) part(u, 0.35, 0.55, [0.5, 0.7, 0.4], PALETTE.wood);
    part(0, 0.1, -0.1, [0.9, 0.06, 0.7], PALETTE.ash);
  },
  campTrace(part) {
    part(0, 0.05, 0, [1.1, 0.1, 1.1], PALETTE.ash);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      part(Math.cos(a) * 0.62, 0.12, Math.sin(a) * 0.62, [0.3, 0.22, 0.26], PALETTE.stone, a);
    }
    part(1.3, 0.3, -0.5, [0.85, 0.6, 0.6], PALETTE.timber, 0.4);
    part(-1.25, 0.42, 0.4, [0.24, 0.84, 1.3], PALETTE.wood, 0, 0, 1.35);
    part(-0.4, 0.16, 1.15, [1.0, 0.3, 0.3], PALETTE.timber, Math.PI / 3);
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

export function mountTownFillB3(parent: Group, heightAt: (east: number, north: number) => number) {
  const group = new Group();
  group.name = 'town-fill-b3';
  parent.add(group);
  const placed: string[] = [];
  for (const cluster of fillB3Clusters) {
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
