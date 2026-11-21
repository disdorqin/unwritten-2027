import { BoxGeometry, Group, Mesh, MeshLambertMaterial } from 'three';

// Blank-fill campaign, lake scene 2 of 3 (zone-2 self-build + self-stage, 暂存):
// Reed marsh on the mirror lake south-shore shallows (E 28–76, N 120–128).
// Same builders and red lines as the other fill packages (heightfield
// untouched, snow-mound undulation only). Story hook: a "listen" point —
// wind through dry reeds makes sound (sound hook registered in the doc).

export type ReedMarshKind = 'reedClump' | 'snowMound';

export type ReedMarshCluster = {
  id: string; kind: ReedMarshKind; east: number; north: number; heading?: number;
};

export const REED_MARSH_RADII: Record<ReedMarshKind, number> = {
  reedClump: 1.2, snowMound: 2.4,
};

export const fillReedMarshClusters: readonly ReedMarshCluster[] = [
  { id: 'rm-reed-1', kind: 'reedClump', east: 30, north: 126 },
  { id: 'rm-reed-2', kind: 'reedClump', east: 36, north: 124, heading: 0.4 },
  { id: 'rm-reed-3', kind: 'reedClump', east: 42, north: 127, heading: -0.3 },
  { id: 'rm-reed-4', kind: 'reedClump', east: 48, north: 125 },
  { id: 'rm-reed-5', kind: 'reedClump', east: 54, north: 128, heading: 0.6 },
  { id: 'rm-reed-6', kind: 'reedClump', east: 60, north: 124, heading: -0.5 },
  { id: 'rm-reed-7', kind: 'reedClump', east: 66, north: 127 },
  { id: 'rm-reed-8', kind: 'reedClump', east: 72, north: 125, heading: 0.3 },
  { id: 'rm-reed-9', kind: 'reedClump', east: 45, north: 122, heading: -0.2 },
  // Undulation pieces (visual snow mounds, low amplitude).
  { id: 'rm-mound-1', kind: 'snowMound', east: 32, north: 115 },
  { id: 'rm-mound-2', kind: 'snowMound', east: 76, north: 121 },
];

const PALETTE = {
  snow: '#e8ecf0', reedSilver: '#c8c4b0',
} as const;

const materials = new Map<string, MeshLambertMaterial>();
function material(hex: string) {
  let m = materials.get(hex);
  if (!m) { m = new MeshLambertMaterial({ color: hex }); materials.set(hex, m); }
  return m;
}
const boxGeometry = new BoxGeometry();

type Part = (u: number, h: number, v: number, size: [number, number, number], hex: string, yaw?: number, pitch?: number, roll?: number) => void;

const BUILDERS: Record<ReedMarshKind, (part: Part) => void> = {
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

export function mountTownFillReedMarsh(parent: Group, heightAt: (east: number, north: number) => number) {
  const group = new Group();
  group.name = 'town-fill-reed-marsh';
  parent.add(group);
  const placed: string[] = [];
  for (const cluster of fillReedMarshClusters) {
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
