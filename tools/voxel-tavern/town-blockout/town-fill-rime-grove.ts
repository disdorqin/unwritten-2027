import { BoxGeometry, Group, Mesh, MeshLambertMaterial } from 'three';

// Blank-fill campaign, lake scene 1 of 3 (zone-2 self-build + self-stage, 暂存):
// Rime grove on the mirror lake west shore (E 8–22, N 188–228). Same builders
// and red lines as the zone-1 fill packages and the B5 south-gate package
// (heightfield untouched, snow-mound undulation only, clusters not uniform
// scatter, density >= 2.0 per 40 m cell). Story hook: cold-source line
// （湖汽＋冷泄口） — the grove is the lake district's signature scene.

export type RimeGroveKind = 'rimeFir' | 'snowMound';

export type RimeGroveCluster = {
  id: string; kind: RimeGroveKind; east: number; north: number; heading?: number;
};

export const RIME_GROVE_RADII: Record<RimeGroveKind, number> = {
  rimeFir: 1.6, snowMound: 2.4,
};

export const fillRimeGroveClusters: readonly RimeGroveCluster[] = [
  // West of the ring railway (rail runs N-S at E ~16-20 through this band):
  // the grove sits on the far-west shore strip, E 4-12.
  // North sub-cluster.
  { id: 'rg-fir-n1', kind: 'rimeFir', east: 8, north: 222 },
  { id: 'rg-fir-n2', kind: 'rimeFir', east: 11, north: 226, heading: 0.5 },
  { id: 'rg-fir-n3', kind: 'rimeFir', east: 6, north: 218, heading: -0.4 },
  { id: 'rg-fir-n4', kind: 'rimeFir', east: 10, north: 220, heading: 0.9 },
  // Middle sub-cluster.
  { id: 'rg-fir-m1', kind: 'rimeFir', east: 7, north: 206 },
  { id: 'rg-fir-m2', kind: 'rimeFir', east: 11, north: 210, heading: 0.4 },
  { id: 'rg-fir-m3', kind: 'rimeFir', east: 6, north: 200, heading: -0.6 },
  { id: 'rg-fir-m4', kind: 'rimeFir', east: 10, north: 202, heading: 1.1 },
  // South sub-cluster.
  { id: 'rg-fir-s1', kind: 'rimeFir', east: 8, north: 192 },
  { id: 'rg-fir-s2', kind: 'rimeFir', east: 11, north: 196, heading: 0.7 },
  { id: 'rg-fir-s3', kind: 'rimeFir', east: 7, north: 188, heading: -0.3 },
  // Undulation pieces (visual snow mounds, low amplitude, off the shore path).
  { id: 'rg-mound-1', kind: 'snowMound', east: 4, north: 214 },
  { id: 'rg-mound-2', kind: 'snowMound', east: 4, north: 196 },
];

const PALETTE = {
  timber: '#5d4630', snow: '#e8ecf0',
  iceA: '#cfe8ec', iceB: '#b8dce6', iceCore: '#9fd0dd',
} as const;

const materials = new Map<string, MeshLambertMaterial>();
function material(hex: string) {
  let m = materials.get(hex);
  if (!m) { m = new MeshLambertMaterial({ color: hex }); materials.set(hex, m); }
  return m;
}
const boxGeometry = new BoxGeometry();

type Part = (u: number, h: number, v: number, size: [number, number, number], hex: string, yaw?: number, pitch?: number, roll?: number) => void;

const BUILDERS: Record<RimeGroveKind, (part: Part) => void> = {
  rimeFir(part) {
    // A fir wholly wrapped in rime ice: ice-crystal tiers, snow caps.
    part(0, 0.67, 0, [0.24, 1.34, 0.26], PALETTE.timber);
    const tiers: [number, number][] = [[2.22, 1.04], [1.63, 1.51], [1.02, 1.98], [0.55, 2.45]];
    tiers.forEach(([w, h], i) => {
      part(0, h, 0, [w, 0.58, w * 0.86], i % 2 ? PALETTE.iceB : PALETTE.iceA);
      part(0, h + 0.33, 0, [w * 0.91, 0.1, w * 0.76], PALETTE.snow);
    });
    part(0, 2.72, 0, [0.3, 0.24, 0.3], PALETTE.iceCore);
  },
  snowMound(part) {
    part(0, 0.14, 0, [4.4, 0.28, 3.4], PALETTE.snow);
    part(0.3, 0.36, -0.2, [3.1, 0.22, 2.4], PALETTE.snow);
    part(-0.2, 0.53, 0.1, [1.8, 0.16, 1.4], PALETTE.snow);
  },
};

export function mountTownFillRimeGrove(parent: Group, heightAt: (east: number, north: number) => number) {
  const group = new Group();
  group.name = 'town-fill-rime-grove';
  parent.add(group);
  const placed: string[] = [];
  for (const cluster of fillRimeGroveClusters) {
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
