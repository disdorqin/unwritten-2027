import { BoxGeometry, Group, Matrix4, Mesh, MeshLambertMaterial } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Blank-fill campaign, B3 additions (zone-1): the interactive menu items
// for the mountain skirt — gatherable pine mushrooms and red-berry
// thickets on the foothill band, and the frozen-stream slide: a banked
// ice chute running from the foothill down toward the lake quarter.
// Every cluster registers its interaction in `touch`.

export type B3xKind = 'mushroomPatch' | 'berryThicket' | 'iceChute' | 'chuteGate';

export type B3xCluster = { id: string; kind: B3xKind; east: number; north: number; heading?: number; touch: string };

export const B3X_RADII: Record<B3xKind, number> = {
  mushroomPatch: 1.5, berryThicket: 1.9, iceChute: 2.2, chuteGate: 1.6,
};

export const fillB3xClusters: readonly B3xCluster[] = [
  { id: 'b3x-shroom-180', kind: 'mushroomPatch', east: 180, north: 528, touch: 'gather — pine mushrooms for the tavern kitchen' },
  { id: 'b3x-shroom-300', kind: 'mushroomPatch', east: 300, north: 548, touch: 'gather — pine mushrooms for the tavern kitchen' },
  { id: 'b3x-shroom-455', kind: 'mushroomPatch', east: 455, north: 538, touch: 'gather — pine mushrooms for the tavern kitchen' },
  { id: 'b3x-berry-240', kind: 'berryThicket', east: 240, north: 560, touch: 'gather — winter berries' },
  { id: 'b3x-berry-505', kind: 'berryThicket', east: 505, north: 555, touch: 'gather — winter berries' },
  { id: 'b3x-gate', kind: 'chuteGate', east: 233, north: 438, heading: 0.08, touch: 'play — slide start gate below the railway crossing' },
  { id: 'b3x-chute-1', kind: 'iceChute', east: 229, north: 420, heading: 0.06, touch: 'play — frozen-stream slide' },
  { id: 'b3x-chute-2', kind: 'iceChute', east: 228, north: 402, heading: -0.02, touch: 'play — frozen-stream slide' },
  { id: 'b3x-chute-3', kind: 'iceChute', east: 229, north: 384, heading: -0.04, touch: 'play — frozen-stream slide' },
  { id: 'b3x-chute-4', kind: 'iceChute', east: 231, north: 366, heading: -0.03, touch: 'play — frozen-stream slide' },
  { id: 'b3x-chute-5', kind: 'iceChute', east: 232, north: 348, heading: -0.1, touch: 'play — frozen-stream slide' },
  { id: 'b3x-chute-6', kind: 'iceChute', east: 239, north: 333, heading: -0.24, touch: 'play — slide run-out at the channel bend' },
];

const PALETTE = {
  timber: '#5d4630', wood: '#a98a56', stone: '#8a8378', snow: '#e8ecf0',
  rust: '#8a4a34', berry: '#b03a2e', holly: '#2f4a34', needle: '#4a3a28',
  ice: '#7fd4c8', iceDeep: '#5db3a8', cap: '#a98a56',
} as const;

const materials = new Map<string, MeshLambertMaterial>();
function material(hex: string) {
  let m = materials.get(hex);
  if (!m) { m = new MeshLambertMaterial({ color: hex }); materials.set(hex, m); }
  return m;
}
const boxGeometry = new BoxGeometry();

type Part = (u: number, h: number, v: number, size: [number, number, number], hex: string, yaw?: number, pitch?: number, roll?: number) => void;

function shrub(part: Part, u: number, v: number, s: number) {
  part(u, 0.42 * s, v, [1.15 * s, 0.84 * s, 1.0 * s], PALETTE.holly);
  part(u + 0.3 * s, 0.95 * s, v, [0.7 * s, 0.3 * s, 0.6 * s], PALETTE.snow);
  for (const [du, dv] of [[-0.5, 0.3], [0.45, -0.35], [0.1, 0.52], [-0.2, -0.48]] as const)
    part(u + du * s, 0.62 * s, v + dv * s, [0.13 * s, 0.13 * s, 0.13 * s], PALETTE.berry);
}

const BUILDERS: Record<B3xKind, (part: Part) => void> = {
  mushroomPatch(part) {
    part(0, 0.02, 0, [2.6, 0.04, 2.2], PALETTE.needle);
    const spots: [number, number, string][] = [[-0.8, -0.5, PALETTE.cap], [0.3, -0.7, PALETTE.rust], [0.9, 0.2, PALETTE.cap], [-0.4, 0.6, PALETTE.rust], [0.6, 0.8, PALETTE.cap], [-1.0, 0.1, PALETTE.rust]];
    for (const [u, v, hex] of spots) {
      part(u, 0.14, v, [0.09, 0.24, 0.09], PALETTE.snow);
      part(u, 0.3, v, [0.34, 0.12, 0.34], hex);
    }
    part(1.15, 0.35, -0.85, [0.5, 0.66, 0.45], PALETTE.timber);
  },
  berryThicket(part) {
    shrub(part, -1.1, -0.5, 1.0); shrub(part, 0.9, -0.8, 1.2); shrub(part, 0, 0.7, 0.9);
    shrub(part, 1.5, 0.6, 0.8); shrub(part, -1.6, 0.5, 0.75);
    part(0, 0.02, 0, [3.6, 0.04, 2.6], PALETTE.needle);
  },
  iceChute(part) {
    // One banked segment of the slide; segments chain by placement.
    part(0, 0.05, 0, [3.2, 0.1, 9.6], PALETTE.ice);
    part(0, 0.09, 0, [2.2, 0.05, 9.6], PALETTE.iceDeep);
    part(-1.95, 0.32, 0, [0.75, 0.55, 9.6], PALETTE.snow);
    part(1.95, 0.32, 0, [0.75, 0.55, 9.6], PALETTE.snow);
  },
  chuteGate(part) {
    for (const u of [-1.9, 1.9]) part(u, 1.15, 0, [0.18, 2.3, 0.18], PALETTE.timber);
    part(0, 2.24, 0, [4.2, 0.2, 0.16], PALETTE.rust);
    part(0, 0.05, 1.8, [3.2, 0.1, 3.4], PALETTE.ice);
    part(-1.95, 0.3, 1.8, [0.7, 0.5, 3.4], PALETTE.snow);
    part(1.95, 0.3, 1.8, [0.7, 0.5, 3.4], PALETTE.snow);
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

export function mountTownFillB3x(parent: Group, heightAt: (east: number, north: number) => number) {
  const group = new Group();
  group.name = 'town-fill-b3x';
  parent.add(group);
  const placed: string[] = [];
  for (const cluster of fillB3xClusters) {
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
