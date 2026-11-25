import { BoxGeometry, Group, Mesh, MeshLambertMaterial } from 'three';

// ZA-32 second wave (zone-1 self-build, ruling 2026-11-21: module body by
// zone 1, viewer mounting by window A's public batch; fallback self-mount
// registered as 代挂). New prop vocabulary the streetscape infill lacks:
// bench / well / drying rack / plain fir. Placements were picked from a
// clearance scan of the assembled town (fence = largest reserve radius)
// and are listed in 《ZA32第二波落位清单与宿主签名》.

export type Za32PropKind = 'bench' | 'well' | 'dryingRack' | 'firTree';

export type Za32PropPoint = {
  kind: Za32PropKind; east: number; north: number; heading?: number;
};

export type Za32PropCluster = { id: string; points: readonly Za32PropPoint[] };

export const za32StreetPropClusters: readonly Za32PropCluster[] = [
  {
    id: 'south-loop-props',
    points: [
      { kind: 'bench', east: 176, north: 86, heading: Math.PI / 2 },
      { kind: 'well', east: 186, north: 92, heading: .3 },
      { kind: 'dryingRack', east: 196, north: 88, heading: Math.PI },
      { kind: 'bench', east: 206, north: 92, heading: -Math.PI / 2 },
      { kind: 'firTree', east: 216, north: 90 },
      { kind: 'dryingRack', east: 220, north: 98, heading: .5 },
    ],
  },
  {
    id: 'lake-road-props',
    points: [
      { kind: 'bench', east: 84, north: 166, heading: Math.PI / 2 },
      { kind: 'firTree', east: 72, north: 176 },
      { kind: 'dryingRack', east: 64, north: 182, heading: .3 },
    ],
  },
  {
    id: 'northeast-streets-props',
    points: [
      { kind: 'well', east: 278, north: 200, heading: .4 },
      { kind: 'bench', east: 304, north: 180, heading: 0 },
      { kind: 'dryingRack', east: 310, north: 186, heading: Math.PI / 2 },
      { kind: 'firTree', east: 318, north: 190 },
      { kind: 'bench', east: 322, north: 198, heading: .6 },
    ],
  },
];

const PALETTE = {
  timber: '#5d4630', wood: '#a98a56', stone: '#8a8378', snow: '#e8ecf0',
  dark: '#2c3648', rust: '#8a4a34', clothPale: '#c3d2e1', clothWhite: '#e8ecf0',
  firA: '#36534e', firB: '#395b53',
} as const;

const materials = new Map<string, MeshLambertMaterial>();
function material(hex: string) {
  let m = materials.get(hex);
  if (!m) { m = new MeshLambertMaterial({ color: hex }); materials.set(hex, m); }
  return m;
}
const boxGeometry = new BoxGeometry();

type Part = (u: number, h: number, v: number, size: [number, number, number], hex: string, yaw?: number, pitch?: number) => void;

function bench(part: Part) {
  for (const u of [-0.75, 0.75]) part(u, 0.21, 0, [0.18, 0.42, 0.55], PALETTE.stone);
  for (const v of [-0.19, 0, 0.19]) part(0, 0.46, v, [1.8, 0.07, 0.16], PALETTE.wood);
  for (const u of [-0.75, 0.75]) part(u, 0.72, -0.3, [0.14, 0.6, 0.12], PALETTE.timber);
  for (const h of [0.78, 1.0]) part(0, h, -0.33, [1.8, 0.13, 0.05], PALETTE.wood);
  part(0, 1.1, -0.33, [1.8, 0.05, 0.07], PALETTE.snow);
}

function well(part: Part) {
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    part(Math.cos(a) * 0.72, 0.28, Math.sin(a) * 0.72, [0.52, 0.56, 0.2], PALETTE.stone, -a);
  }
  part(0, 0.5, 0, [1.1, 0.06, 1.1], PALETTE.dark);
  part(0, 0.62, 0, [1.5, 0.09, 0.24], PALETTE.stone);
  for (const u of [-0.62, 0.62]) part(u, 1.05, 0, [0.13, 2.1, 0.13], PALETTE.timber);
  part(0, 2.02, 0, [1.5, 0.11, 0.11], PALETTE.wood);
  part(0, 1.55, 0, [0.045, 0.95, 0.045], PALETTE.rust);
  part(0, 1.02, 0, [0.3, 0.26, 0.3], PALETTE.timber);
  part(0, 2.32, -0.18, [1.7, 0.06, 0.62], PALETTE.timber, 0, 0.5);
  part(0, 2.32, 0.18, [1.7, 0.06, 0.62], PALETTE.timber, 0, -0.5);
  part(0, 2.52, 0, [1.7, 0.05, 0.5], PALETTE.snow);
}

function dryingRack(part: Part) {
  for (const u of [-1.0, 1.0]) {
    part(u, 0.75, -0.28, [0.09, 1.7, 0.09], PALETTE.timber, 0, 0.32);
    part(u, 0.75, 0.28, [0.09, 1.7, 0.09], PALETTE.timber, 0, -0.32);
  }
  for (const h of [1.52, 1.14]) part(0, h, 0, [2.3, 0.07, 0.07], PALETTE.wood);
  part(-0.62, 1.22, 0, [0.52, 0.62, 0.03], PALETTE.clothPale);
  part(0.05, 1.2, 0, [0.44, 0.66, 0.03], PALETTE.clothWhite);
  part(0.66, 1.24, 0, [0.4, 0.56, 0.03], PALETTE.rust);
  part(0, 1.58, 0, [2.3, 0.04, 0.09], PALETTE.snow);
}

function firTree(part: Part) {
  part(0, 0.67, 0, [0.24, 1.34, 0.26], PALETTE.timber);
  const tiers: [number, number][] = [[2.22, 1.04], [1.63, 1.51], [1.02, 1.98], [0.55, 2.45]];
  tiers.forEach(([width, height], tier) => {
    part(0, height, 0, [width, 0.58, width * 0.86], tier % 2 ? PALETTE.firB : PALETTE.firA);
    part(0, height + 0.33, 0, [width * 0.91, 0.1, width * 0.76], PALETTE.snow);
  });
}

const BUILDERS: Record<Za32PropKind, (part: Part) => void> = { bench, well, dryingRack, firTree };
export const ZA32_PROP_COLLIDERS: Record<Za32PropKind, number> = {
  bench: 0.8, well: 0.95, dryingRack: 0.9, firTree: 0.5,
};

export function mountZa32StreetProps(
  parent: Group,
  heightAt: (east: number, north: number) => number,
) {
  const group = new Group();
  group.name = 'za32-street-props';
  parent.add(group);
  const colliders: { x: number; n: number; radius: number }[] = [];
  const placed: Za32PropKind[] = [];
  for (const cluster of za32StreetPropClusters) {
    for (const point of cluster.points) {
      const yaw = point.heading ?? 0;
      const y = heightAt(point.east, point.north);
      const prop = new Group();
      prop.position.set(point.east, y, -point.north);
      prop.rotation.y = yaw;
      const cos = Math.cos(yaw), sin = Math.sin(yaw);
      const part: Part = (u, h, v, size, hex, partYaw = 0, pitch = 0) => {
        const mesh = new Mesh(boxGeometry, material(hex));
        // Local (u east, v south-in-plan) -> prop local (x, z): z = -north.
        mesh.position.set(u, h, -v);
        mesh.scale.set(size[0], size[1], size[2]);
        mesh.rotation.set(pitch, partYaw, 0);
        prop.add(mesh);
        void cos; void sin;
      };
      BUILDERS[point.kind](part);
      group.add(prop);
      colliders.push({ x: point.east, n: point.north, radius: ZA32_PROP_COLLIDERS[point.kind] });
      placed.push(point.kind);
    }
  }
  return {
    group,
    colliders,
    placed,
    dispose() {
      parent.remove(group);
    },
  };
}
