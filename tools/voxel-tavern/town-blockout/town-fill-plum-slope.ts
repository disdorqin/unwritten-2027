import { BoxGeometry, Group, Mesh, MeshLambertMaterial } from 'three';

// Blank-fill campaign, lake scene 3 of 3 (zone-2 self-build + self-stage, 暂存):
// Red plum slope in the hot-spring geothermal belt, EAST of the hot-spring
// plot (E 578–606, N 132–162). ONE slope only — never scattered town-wide.
// Same builders and red lines as the other fill packages (heightfield
// untouched, snow-mound undulation only). Story hook: 温泉/浴场民俗线
// (public layer only — geothermal-belt blooming).

export type PlumSlopeKind = 'plumTree' | 'snowMound' | 'rockCluster';

export type PlumSlopeCluster = {
  id: string; kind: PlumSlopeKind; east: number; north: number; heading?: number;
};

export const PLUM_SLOPE_RADII: Record<PlumSlopeKind, number> = {
  plumTree: 1.5, snowMound: 2.4, rockCluster: 1.6,
};

export const fillPlumSlopeClusters: readonly PlumSlopeCluster[] = [
  { id: 'ps-plum-1', kind: 'plumTree', east: 582, north: 138 },
  { id: 'ps-plum-2', kind: 'plumTree', east: 588, north: 146, heading: 0.5 },
  { id: 'ps-plum-3', kind: 'plumTree', east: 584, north: 154, heading: -0.4 },
  { id: 'ps-plum-4', kind: 'plumTree', east: 592, north: 136, heading: 0.9 },
  { id: 'ps-plum-5', kind: 'plumTree', east: 596, north: 148 },
  { id: 'ps-plum-6', kind: 'plumTree', east: 588, north: 152, heading: -0.7 },
  { id: 'ps-plum-7', kind: 'plumTree', east: 600, north: 142, heading: 0.3 },
  { id: 'ps-plum-8', kind: 'plumTree', east: 602, north: 138, heading: 1.1 },
  // Undulation + warm rocks (geothermal belt).
  { id: 'ps-mound-1', kind: 'snowMound', east: 580, north: 148 },
  { id: 'ps-mound-2', kind: 'snowMound', east: 598, north: 132 },
  { id: 'ps-rock-1', kind: 'rockCluster', east: 594, north: 162 },
];

const PALETTE = {
  timber: '#5d4630', dark: '#2c3648', snow: '#e8ecf0', stone: '#8a8378',
  rust: '#8a4a34', plumRed: '#c2455e', plumLight: '#d97b8f',
} as const;

const materials = new Map<string, MeshLambertMaterial>();
function material(hex: string) {
  let m = materials.get(hex);
  if (!m) { m = new MeshLambertMaterial({ color: hex }); materials.set(hex, m); }
  return m;
}
const boxGeometry = new BoxGeometry();

type Part = (u: number, h: number, v: number, size: [number, number, number], hex: string, yaw?: number, pitch?: number, roll?: number) => void;

const BUILDERS: Record<PlumSlopeKind, (part: Part) => void> = {
  plumTree(part) {
    // Dark gnarled trunk + sparse branches + red blossom clusters in snow.
    part(0, 0.7, 0, [0.3, 1.4, 0.32], PALETTE.dark);
    part(-0.4, 1.55, 0, [0.9, 0.14, 0.14], PALETTE.dark, 0, 0, 0.5);
    part(0.42, 1.6, 0.1, [0.85, 0.14, 0.14], PALETTE.dark, 0.3, 0, -0.45);
    part(-0.62, 1.95, 0, [0.55, 0.4, 0.5], PALETTE.plumRed);
    part(0.66, 2.0, 0.12, [0.5, 0.36, 0.46], PALETTE.plumLight);
    part(0, 2.2, -0.1, [0.6, 0.34, 0.55], PALETTE.plumRed);
    part(-0.2, 1.78, 0.25, [0.34, 0.26, 0.3], PALETTE.plumLight);
    part(0, 0.05, 0, [1.5, 0.08, 1.3], PALETTE.snow);
  },
  snowMound(part) {
    part(0, 0.14, 0, [4.4, 0.28, 3.4], PALETTE.snow);
    part(0.3, 0.36, -0.2, [3.1, 0.22, 2.4], PALETTE.snow);
    part(-0.2, 0.53, 0.1, [1.8, 0.16, 1.4], PALETTE.snow);
  },
  rockCluster(part) {
    part(0, 0.33, 0, [1.25, 0.66, 1.02], PALETTE.stone, 0.2);
    part(0.62, 0.19, 0.3, [0.72, 0.38, 0.6], PALETTE.stone, -0.3);
    part(-0.55, 0.14, -0.28, [0.55, 0.28, 0.48], PALETTE.rust, 0.5);
    part(0.1, 0.73, -0.05, [0.86, 0.14, 0.7], PALETTE.snow);
    part(-0.2, 0.5, 0.42, [0.4, 0.3, 0.36], PALETTE.stone, 0.9);
  },
};

export function mountTownFillPlumSlope(parent: Group, heightAt: (east: number, north: number) => number) {
  const group = new Group();
  group.name = 'town-fill-plum-slope';
  parent.add(group);
  const placed: string[] = [];
  for (const cluster of fillPlumSlopeClusters) {
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
