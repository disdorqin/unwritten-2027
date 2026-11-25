import { BoxGeometry, Group, Mesh, MeshLambertMaterial } from 'three';

// Blank-fill campaign, package 1 (zone-2 self-build + self-stage, 暂存):
// B5 south gate (E 280–360, N 0–40). Same builders and red lines as the
// zone-1 fill packages (heightfield untouched, snow-mound undulation only,
// clusters not uniform scatter, density >= 2.0 per 40 m cell).
// Red line: the heightfield is never touched — undulation comes only from
// low snow-mound visual pieces, kept off roads and off the river/lake.
// Every cluster carries a story hook (see the placement doc) and at least
// one touchable point (sit / drink / rub / look / gather).

export type SouthGateKind = 'gatePaifang' | 'boundaryStele' | 'redDogwoodRow'
  | 'teaStall' | 'navLamp' | 'mooringPost' | 'snowmanPost' | 'reedClump'
  | 'snowMound';

export type SouthGateCluster = {
  id: string; kind: SouthGateKind; east: number; north: number; heading?: number;
};

export const SOUTH_GATE_RADII: Record<SouthGateKind, number> = {
  gatePaifang: 2.6, boundaryStele: 0.7, redDogwoodRow: 1.8, teaStall: 1.6,
  navLamp: 0.6, mooringPost: 0.7, snowmanPost: 1.1, reedClump: 1.2,
  snowMound: 2.4,
};

export const fillSouthGateClusters: readonly SouthGateCluster[] = [
  // South-gate cluster: the entrance itself. The paifang stands astride the
  // south approach road axis (E ~330); its posts sit on the road shoulders.
  { id: 'sg-paifang-330', kind: 'gatePaifang', east: 330, north: 24 },
  { id: 'sg-stele-west', kind: 'boundaryStele', east: 320, north: 20, heading: 0.3 },
  { id: 'sg-stele-east', kind: 'boundaryStele', east: 340, north: 20, heading: -0.3 },
  { id: 'sg-snowman-gate', kind: 'snowmanPost', east: 318, north: 26, heading: Math.PI },
  // Red-dogwood avenue: two rows flanking the entrance axis.
  { id: 'sg-redwood-w1', kind: 'redDogwoodRow', east: 316, north: 12 },
  { id: 'sg-redwood-e1', kind: 'redDogwoodRow', east: 344, north: 12 },
  { id: 'sg-redwood-w2', kind: 'redDogwoodRow', east: 316, north: 30 },
  { id: 'sg-redwood-e2', kind: 'redDogwoodRow', east: 348, north: 18 },
  // Roadside tea stall (west flank, off the roadbed).
  { id: 'sg-tea-300', kind: 'teaStall', east: 300, north: 16, heading: Math.PI / 2 },
  { id: 'sg-reed-292', kind: 'reedClump', east: 292, north: 8 },
  // River-mouth cluster (east bank of the river, E 263–274 channel).
  { id: 'sg-moor-278', kind: 'mooringPost', east: 278, north: 8 },
  { id: 'sg-navlamp-281', kind: 'navLamp', east: 281, north: 16 },
  // Undulation pieces (visual snow mounds, low amplitude, off roads).
  { id: 'sg-mound-290', kind: 'snowMound', east: 290, north: 22 },
  { id: 'sg-mound-352', kind: 'snowMound', east: 356, north: 14 },
];

const PALETTE = {
  timber: '#5d4630', wood: '#a98a56', stone: '#8a8378', snow: '#e8ecf0',
  dark: '#2c3648', rust: '#8a4a34', firA: '#36534e', firB: '#395b53',
  lampGlow: '#e08a3c', bark: '#6b5138', logEnd: '#c8a878',
  lanternRed: '#b03a2a', dogwoodRed: '#a33327', reedSilver: '#c8c4b0',
} as const;

const materials = new Map<string, MeshLambertMaterial>();
function material(hex: string) {
  let m = materials.get(hex);
  if (!m) { m = new MeshLambertMaterial({ color: hex }); materials.set(hex, m); }
  return m;
}
const boxGeometry = new BoxGeometry();

type Part = (u: number, h: number, v: number, size: [number, number, number], hex: string, yaw?: number, pitch?: number, roll?: number) => void;

const BUILDERS: Record<SouthGateKind, (part: Part) => void> = {
  gatePaifang(part) {
    // Two posts OUTSIDE the 7 m roadbed (posts at +/-3.8 m) + spanning
    // beams + snow-capped roof. No ground footprint on the road itself.
    for (const u of [-3.8, 3.8]) {
      part(u, 1.7, 0, [0.5, 3.4, 0.5], PALETTE.timber);
      part(u, 0.15, 0, [0.8, 0.3, 0.8], PALETTE.stone);
    }
    part(0, 3.55, 0, [8.6, 0.5, 0.6], PALETTE.wood);
    part(0, 3.05, 0, [8.0, 0.35, 0.5], PALETTE.wood);
    part(0, 3.95, 0, [9.0, 0.18, 1.0], PALETTE.timber);
    part(0, 4.06, 0, [9.05, 0.05, 1.05], PALETTE.snow);
    // Hanging red lanterns under the lower beam.
    for (const u of [-2.4, 2.4]) part(u, 2.72, 0, [0.34, 0.4, 0.34], PALETTE.lanternRed);
  },
  boundaryStele(part) {
    part(0, 0.15, 0, [1.2, 0.3, 0.6], PALETTE.stone);
    part(0, 1.05, 0, [0.9, 1.6, 0.35], PALETTE.stone);
    part(0, 1.92, 0, [1.0, 0.15, 0.45], PALETTE.stone);
    part(0, 2.02, 0, [1.02, 0.05, 0.47], PALETTE.snow);
  },
  redDogwoodRow(part) {
    // A row of red-twig shrubs: five fanning twigs + red berries on snow.
    part(0, 0.05, 0, [2.2, 0.1, 0.8], PALETTE.snow);
    const twigs: [number, number][] = [[-0.9, -0.25], [-0.45, 0.3], [0, -0.3], [0.45, 0.25], [0.9, -0.2]];
    for (const [u, lean] of twigs) part(u, 0.62, 0, [0.08, 1.15, 0.08], PALETTE.dogwoodRed, 0, 0, lean);
    part(-0.45, 1.2, 0, [0.14, 0.14, 0.14], PALETTE.lanternRed);
    part(0.45, 1.18, 0, [0.14, 0.14, 0.14], PALETTE.lanternRed);
  },
  teaStall(part) {
    part(0, 0.45, 0, [1.8, 0.9, 0.8], PALETTE.wood);
    part(0, 0.95, 0, [1.9, 0.08, 0.9], PALETTE.timber);
    for (const u of [-0.85, 0.85]) part(u, 1.5, 0, [0.12, 1.2, 0.12], PALETTE.timber);
    part(0, 2.14, 0, [2.2, 0.12, 1.4], PALETTE.timber);
    part(0, 2.23, 0, [2.25, 0.05, 1.45], PALETTE.snow);
    part(-0.4, 1.12, 0, [0.34, 0.3, 0.34], PALETTE.dark);
    part(0.55, 1.12, 0.1, [0.22, 0.16, 0.22], PALETTE.lampGlow);
    part(-1.35, 0.22, 0.5, [0.45, 0.44, 0.45], PALETTE.bark);
    part(1.35, 0.22, 0.5, [0.45, 0.44, 0.45], PALETTE.bark);
  },
  navLamp(part) {
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
  snowmanPost(part) {
    part(0, 0.31, 0, [0.78, 0.62, 0.78], PALETTE.snow);
    part(0, 0.82, 0, [0.58, 0.44, 0.58], PALETTE.snow);
    part(0, 1.16, 0, [0.4, 0.28, 0.4], PALETTE.snow);
    part(0, 0.88, 0.3, [0.6, 0.09, 0.06], PALETTE.rust);
    part(0, 1.34, 0, [0.44, 0.1, 0.44], PALETTE.dark);
  },
  reedClump(part) {
    part(0, 0.04, 0, [1.6, 0.08, 1.2], PALETTE.snow);
    const blades: [number, number, number][] = [
      [-0.6, 0, 0.3], [-0.3, 0.2, -0.35], [0, 0, 0.25], [0.3, -0.2, -0.3],
      [0.6, 0.1, 0.2], [-0.15, 0.35, 0.1], [0.2, -0.3, -0.1],
    ];
    for (const [u, v, lean] of blades) part(u, 0.68, v, [0.06, 1.3, 0.06], PALETTE.reedSilver, 0, 0, lean);
  },
  snowMound(part) {
    part(0, 0.14, 0, [4.4, 0.28, 3.4], PALETTE.snow);
    part(0.3, 0.36, -0.2, [3.1, 0.22, 2.4], PALETTE.snow);
    part(-0.2, 0.53, 0.1, [1.8, 0.16, 1.4], PALETTE.snow);
  },
};

export function mountTownFillSouthGate(parent: Group, heightAt: (east: number, north: number) => number) {
  const group = new Group();
  group.name = 'town-fill-south-gate';
  parent.add(group);
  const placed: string[] = [];
  for (const cluster of fillSouthGateClusters) {
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
