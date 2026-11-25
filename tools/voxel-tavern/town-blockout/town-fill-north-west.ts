import { BoxGeometry, Group, Mesh, MeshLambertMaterial } from 'three';

// Blank-fill campaign, package 5 (zone-2 self-build + self-stage, 暂存):
// B4 northwest frame edge (E 0–40, N 360–480, ~4,800 m²). Light forest-edge
// fill. Same builders and red lines as the other fill packages (heightfield
// untouched, snow-mound undulation only). Menu items: fox den (model first —
// den mouth + footprint chain; the distant fleeing shadow is a registered
// behavior candidate, NOT built here) and a gatherable mushroom ring.
// Story hooks: fox den = footprint-chain terminus (star-stone soft clues,
// direction sense only, no coordinates); ancestor graves at the forest edge
// pre-register into G-03 preparatory rows.

export type NorthWestKind = 'foxDen' | 'mushroomRing' | 'woodFence' | 'woodShed'
  | 'youngCedar' | 'boundaryStele' | 'rockCluster' | 'snowMound';

export type NorthWestCluster = {
  id: string; kind: NorthWestKind; east: number; north: number; heading?: number;
};

export const NORTH_WEST_RADII: Record<NorthWestKind, number> = {
  foxDen: 1.8, mushroomRing: 1.4, woodFence: 1.4, woodShed: 1.6,
  youngCedar: 1.4, boundaryStele: 0.7, rockCluster: 1.6, snowMound: 2.4,
};

export const fillNorthWestClusters: readonly NorthWestCluster[] = [
  { id: 'nw-foxden', kind: 'foxDen', east: 18, north: 420, heading: 0.6 },
  { id: 'nw-shroom-1', kind: 'mushroomRing', east: 24, north: 408 },
  { id: 'nw-shroom-2', kind: 'mushroomRing', east: 12, north: 436, heading: 0.8 },
  { id: 'nw-fence-1', kind: 'woodFence', east: 30, north: 396, heading: 0.3 },
  { id: 'nw-fence-2', kind: 'woodFence', east: 8, north: 452, heading: -0.4 },
  { id: 'nw-woodshed', kind: 'woodShed', east: 26, north: 444, heading: -0.2 },
  { id: 'nw-cedar-1', kind: 'youngCedar', east: 14, north: 388 },
  { id: 'nw-cedar-2', kind: 'youngCedar', east: 32, north: 428, heading: 0.5 },
  { id: 'nw-cedar-3', kind: 'youngCedar', east: 20, north: 464 },
  { id: 'nw-cedar-4', kind: 'youngCedar', east: 36, north: 380, heading: 1.0 },
  { id: 'nw-stele', kind: 'boundaryStele', east: 6, north: 404, heading: 0.2 },
  { id: 'nw-rock-1', kind: 'rockCluster', east: 34, north: 460 },
  { id: 'nw-mound-1', kind: 'snowMound', east: 16, north: 472 },
  { id: 'nw-mound-2', kind: 'snowMound', east: 28, north: 372 },
];

const PALETTE = {
  timber: '#5d4630', wood: '#a98a56', stone: '#8a8378', snow: '#e8ecf0',
  dark: '#2c3648', rust: '#8a4a34', firA: '#36534e', firB: '#395b53',
  bark: '#6b5138', logEnd: '#c8a878', earth: '#7a6248', capRed: '#b03a2a',
} as const;

const materials = new Map<string, MeshLambertMaterial>();
function material(hex: string) {
  let m = materials.get(hex);
  if (!m) { m = new MeshLambertMaterial({ color: hex }); materials.set(hex, m); }
  return m;
}
const boxGeometry = new BoxGeometry();

type Part = (u: number, h: number, v: number, size: [number, number, number], hex: string, yaw?: number, pitch?: number, roll?: number) => void;

const BUILDERS: Record<NorthWestKind, (part: Part) => void> = {
  foxDen(part) {
    // Earth-and-snow mound with a dark den mouth + a trailing footprint chain.
    part(0, 0.35, 0, [2.6, 0.7, 2.2], PALETTE.earth);
    part(0, 0.78, 0, [1.9, 0.3, 1.6], PALETTE.snow);
    part(0, 0.32, 1.05, [0.8, 0.5, 0.2], PALETTE.dark);
    const prints: [number, number][] = [[0.3, 1.9], [-0.25, 2.6], [0.35, 3.3], [-0.2, 4.0]];
    for (const [u, v] of prints) part(u, 0.03, v, [0.16, 0.04, 0.22], PALETTE.stone);
  },
  mushroomRing(part) {
    part(0, 0.04, 0, [2.2, 0.08, 2.2], PALETTE.snow);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const u = Math.cos(a) * 0.75, v = Math.sin(a) * 0.75;
      part(u, 0.14, v, [0.09, 0.2, 0.09], PALETTE.logEnd);
      part(u, 0.28, v, [0.24, 0.1, 0.24], PALETTE.capRed);
    }
  },
  woodFence(part) {
    for (const u of [-1.1, 0, 1.1]) part(u, 0.5, 0, [0.14, 1.0, 0.14], PALETTE.timber);
    part(0, 0.72, 0, [2.6, 0.1, 0.08], PALETTE.wood);
    part(0, 0.38, 0, [2.6, 0.1, 0.08], PALETTE.wood);
  },
  woodShed(part) {
    part(0, 0.08, 0, [2.0, 0.15, 1.8], PALETTE.wood);
    part(0, 0.9, -0.84, [2.0, 1.5, 0.12], PALETTE.timber);
    part(0, 1.72, 0, [2.4, 0.12, 2.2], PALETTE.timber);
    part(0, 1.81, 0, [2.45, 0.05, 2.25], PALETTE.snow);
    part(-0.4, 0.35, 0.3, [0.32, 0.3, 1.0], PALETTE.bark);
    part(0.35, 0.35, 0.3, [0.32, 0.3, 1.0], PALETTE.bark);
  },
  youngCedar(part) {
    part(0, 0.45, 0, [0.18, 0.9, 0.2], PALETTE.timber);
    const tiers: [number, number][] = [[1.5, 0.78], [1.05, 1.18], [0.6, 1.58]];
    tiers.forEach(([w, h], i) => {
      part(0, h, 0, [w, 0.44, w * 0.86], i % 2 ? PALETTE.firB : PALETTE.firA);
      part(0, h + 0.26, 0, [w * 0.9, 0.08, w * 0.75], PALETTE.snow);
    });
  },
  boundaryStele(part) {
    part(0, 0.15, 0, [1.2, 0.3, 0.6], PALETTE.stone);
    part(0, 1.05, 0, [0.9, 1.6, 0.35], PALETTE.stone);
    part(0, 1.92, 0, [1.0, 0.15, 0.45], PALETTE.stone);
    part(0, 2.02, 0, [1.02, 0.05, 0.47], PALETTE.snow);
  },
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
};

export function mountTownFillNorthWest(parent: Group, heightAt: (east: number, north: number) => number) {
  const group = new Group();
  group.name = 'town-fill-north-west';
  parent.add(group);
  const placed: string[] = [];
  for (const cluster of fillNorthWestClusters) {
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
