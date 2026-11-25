import {
  BoxGeometry, ConeGeometry, DataTexture, DodecahedronGeometry, Group, InstancedMesh, Matrix4,
  MeshStandardMaterial, NearestFilter, Object3D, SRGBColorSpace,
} from 'three';
import type { BufferGeometry } from 'three';
import { createMeteorCrater, meteorCraterFixturePlan } from './meteor-crater';
import type { mountWestCraterRoad } from './town-za22-crater-road';

type WestCraterGround = Pick<ReturnType<typeof mountWestCraterRoad>, 'anchor' | 'lip' | 'heightAt'>;
export type CraterRimClearance = Readonly<{ east: number; north: number; radius: number }>;
type Piece = 'rubble' | 'snow' | 'pine' | 'fallen-pine';
type Band = 'rim' | 'upper' | 'middle' | 'lower' | 'floor';
type Cluster = Readonly<{
  name: string; band: Band; bearing: number; radius: number;
  pieces: readonly [rubble: number, snow: number, pine: number, fallen: number];
}>;
type Placement = CraterRimClearance & { height: number; kind: Piece; band: Band; cluster: string; orientation: number; scale: number };

const palette = {
  limestone: 0x8a8378, ochre: 0xa98a56, bark: 0x5d4630, pine: 0x44503c, night: 0x2c3648, snow: 0xe8ecf0,
};
const fixture = createMeteorCrater(meteorCraterFixturePlan);
const tau = 2 * Math.PI;
// Bearings start at the live entrance and increase clockwise.
const clusters: readonly Cluster[] = [
  { name: 'windward-lip', band: 'rim', bearing: .96, radius: 55, pieces: [4, 3, 2, 1] },
  { name: 'western-rim-break', band: 'rim', bearing: 2.15, radius: 54, pieces: [5, 3, 2, 1] },
  { name: 'lee-rim', band: 'rim', bearing: 3.55, radius: 54, pieces: [5, 4, 2, 1] },
  { name: 'sheltered-rim', band: 'rim', bearing: 5.06, radius: 54, pieces: [4, 4, 2, 1] },
  { name: 'pine-bank', band: 'upper', bearing: 1.22, radius: 48, pieces: [7, 4, 2, 1] },
  { name: 'upper-scree', band: 'upper', bearing: 2.65, radius: 48, pieces: [8, 4, 1, 1] },
  { name: 'split-trunks', band: 'upper', bearing: 4.18, radius: 45, pieces: [7, 4, 2, 1] },
  { name: 'upper-snow-pocket', band: 'upper', bearing: 5.56, radius: 48, pieces: [7, 5, 1, 1] },
  { name: 'middle-stone-chute', band: 'middle', bearing: 1.04, radius: 39, pieces: [11, 3, 0, 1] },
  { name: 'middle-shoulder-fan', band: 'middle', bearing: 2.56, radius: 39, pieces: [11, 4, 1, 0] },
  { name: 'middle-lee-scree', band: 'middle', bearing: 4.27, radius: 42, pieces: [12, 3, 0, 1] },
  { name: 'middle-snow-fan', band: 'middle', bearing: 5.62, radius: 39, pieces: [10, 5, 0, 1] },
  { name: 'lower-dark-fragments', band: 'lower', bearing: 1.26, radius: 29, pieces: [15, 4, 0, 0] },
  { name: 'lower-scree-fan', band: 'lower', bearing: 2.65, radius: 29, pieces: [16, 4, 0, 0] },
  { name: 'lower-melt-cut', band: 'lower', bearing: 4.32, radius: 31.5, pieces: [17, 3, 0, 0] },
  { name: 'lower-gravel-pocket', band: 'lower', bearing: 5.65, radius: 29, pieces: [15, 4, 0, 0] },
  { name: 'eastern-core-ejecta', band: 'floor', bearing: 1.35, radius: 15, pieces: [20, 3, 0, 0] },
  { name: 'eastern-floor-breccia', band: 'floor', bearing: 2.15, radius: 15, pieces: [21, 3, 0, 0] },
  { name: 'western-floor-breccia', band: 'floor', bearing: 4.13, radius: 15, pieces: [22, 2, 0, 0] },
  { name: 'western-core-ejecta', band: 'floor', bearing: 4.94, radius: 15, pieces: [22, 3, 0, 0] },
];
const pieceRadii: Readonly<Record<Piece, number>> = { rubble: .66, snow: .71, pine: 1.22, 'fallen-pine': 1.92 };
const buildOrder: readonly Piece[] = ['pine', 'fallen-pine', 'rubble', 'snow'];
const countIndex: Readonly<Record<Piece, number>> = { rubble: 0, snow: 1, pine: 2, 'fallen-pine': 3 };

function distanceToSegment(east: number, north: number, from: CraterRimClearance, to: CraterRimClearance) {
  const dx = to.east - from.east;
  const dn = to.north - from.north;
  const t = Math.min(1, Math.max(0, ((east - from.east) * dx + (north - from.north) * dn) / (dx * dx + dn * dn)));
  return Math.hypot(east - from.east - t * dx, north - from.north - t * dn);
}

function buildDecorMap(dark: number, light: number, fleck: number) {
  const size = 16;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const seam = (x + (y >> 1)) % 9 === 0;
    const speckled = (x * 13 + y * 7 + x * y * 3) % 29 === 0;
    const shade = seam ? dark : speckled ? fleck : light;
    data.set([shade >> 16, (shade >> 8) & 255, shade & 255, 255], (x + size * y) * 4);
  }
  const texture = new DataTexture(data, size, size);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = texture.minFilter = NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

function renderPlacements(group: Group, placements: readonly Placement[]) {
  const matrix = new Object3D();
  const batches = new Map<string, { geometry: BufferGeometry; material: MeshStandardMaterial; matrices: Matrix4[] }>();
  function batch(id: string, geometry: BufferGeometry, material: MeshStandardMaterial) {
    const matrices: Matrix4[] = [];
    batches.set(id, { geometry, material, matrices });
    return matrices;
  }
  const flat = (color: number) => new MeshStandardMaterial({ color, flatShading: true, roughness: 1 });
  const stoneGeometry = new DodecahedronGeometry(1, 0);
  const shale = batch('wind-scoured-rock', stoneGeometry, new MeshStandardMaterial({
    map: buildDecorMap(palette.night, palette.limestone, palette.ochre), flatShading: true, roughness: 1,
  }));
  const fragments = batch('dark-meteor-fragment', stoneGeometry, new MeshStandardMaterial({
    map: buildDecorMap(palette.bark, palette.night, palette.limestone), flatShading: true, roughness: 1,
  }));
  const drifts = batch('drifted-snow', stoneGeometry, flat(palette.snow));
  const trunks = batch('split-pine-bark', new BoxGeometry(), new MeshStandardMaterial({
    map: buildDecorMap(palette.bark, palette.bark, palette.ochre), flatShading: true, roughness: 1,
  }));
  const coneGeometry = new ConeGeometry(1, 1, 5);
  const boughs = batch('pine-boughs', coneGeometry, flat(palette.pine));
  const treeSnow = batch('snow-crusted-boughs', coneGeometry, flat(palette.snow));

  function push(target: Matrix4[], x: number, y: number, z: number, width: number, height: number, depth: number,
    yaw: number, tilt = 0, roll = 0) {
    matrix.position.set(x, y, z);
    matrix.rotation.set(tilt, yaw, roll, 'YXZ');
    matrix.scale.set(width, height, depth);
    matrix.updateMatrix();
    target.push(matrix.matrix.clone());
  }
  for (const [index, { east, north, height, kind, orientation, scale, band }] of placements.entries()) {
    const z = -north;
    if (kind === 'rubble') {
      const isMeteor = band === 'floor' || band === 'lower' || index % 4 === 0;
      push(isMeteor ? fragments : shale, east, height + .08 * scale, z, .58 * scale,
        (index % 3 === 0 ? .62 : .38) * scale, .46 * scale, orientation, .18, -.21);
    } else if (kind === 'snow') {
      push(drifts, east, height + .03 * scale, z, .7 * scale, .23 * scale, .44 * scale, orientation, 0, .06);
    } else if (kind === 'pine') {
      push(trunks, east, height + .57 * scale, z, .28 * scale, 1.55 * scale, .27 * scale, orientation, .04);
      for (const [radius, y, length] of [[1.05, 1.24, 1.25], [.84, 1.91, 1.28], [.58, 2.64, 1.44]]) {
        push(boughs, east, height + y * scale, z, radius * scale, length * scale, radius * scale, orientation);
        push(treeSnow, east, height + (y + .23) * scale, z,
          radius * .78 * scale, length * .7 * scale, radius * .78 * scale, orientation);
      }
    } else {
      const { sin, cos } = Math;
      push(trunks, east, height + .28 * scale, z, .36 * scale, 3.4 * scale, .33 * scale, orientation, Math.PI / 2 - .07);
      for (const at of [-.3, .42, 1.02]) {
        const x = east + sin(orientation) * at * scale, nz = z + cos(orientation) * at * scale;
        const radius = (.73 - .24 * at) * scale;
        push(boughs, x, height + .27 * scale, nz, radius, .91 * scale, radius, orientation, Math.PI / 2 - .07);
        push(treeSnow, x, height + .45 * scale, nz, radius * .61, .6 * scale, radius * .61, orientation, Math.PI / 2 - .06);
      }
    }
  }
  for (const [id, { geometry, material, matrices }] of batches) {
    if (!matrices.length) continue;
    const instances = new InstancedMesh(geometry, material, matrices.length);
    instances.name = `za31-crater-rim-${id}`;
    matrices.forEach((transform, index) => instances.setMatrixAt(index, transform));
    instances.computeBoundingSphere();
    group.add(instances);
  }
}

/** Places the scattered material off the road atop the live west-domain walk surface. */
export function buildZa31CraterRim(road: WestCraterGround, reserved: readonly CraterRimClearance[] = []) {
  const { anchor, lip, heightAt } = road;
  const { east: x0, north: n0 } = anchor;
  const bearingAtLip = Math.atan2(lip.east - x0, lip.north - n0);
  const center: CraterRimClearance = { east: x0, north: n0, radius: 8 };
  const mouth: CraterRimClearance = { east: lip.east, north: lip.north, radius: 10 };
  const c = Math.cos(anchor.yaw), s = Math.sin(anchor.yaw);
  // The same reviewed local trail supplies both ZA-22's surface and this lane reservation.
  const spiral = Array.from({ length: 701 }, (_, index) => {
    const at = fixture.mainTrailPoint(index / 700);
    return { east: x0 + at.east * c + at.north * s, north: n0 + at.north * c - at.east * s, radius: 0 };
  });
  const floorApproach = spiral.at(-1)!;
  const keepouts = [center, mouth, ...reserved];
  const group = new Group();
  group.name = 'za31-crater-rim-clusters';
  const placements: Placement[] = [];

  for (const cluster of clusters) for (const kind of buildOrder) {
    const count = cluster.pieces[countIndex[kind]];
    let placed = 0;
    // Sites stay in the local cluster's fan, with the rubble dispersing farther than the heavy pines.
    for (let i = 0; i < 240 && placed < count; i++) {
      const u = ((i * 37 + count * 11) % 239) / 238;
      const v = ((i * 89 + count * 17) % 241) / 240;
      const spread = cluster.band === 'floor' ? 4.2 : 6.1;
      const angle = cluster.bearing + (u - .5) * 2 * spread / cluster.radius;
      const radial = cluster.radius + (v - .5) * (cluster.band === 'rim' ? 4.6 : 5.3);
      const bearing = bearingAtLip + angle;
      const east = x0 + Math.sin(bearing) * radial;
      const north = n0 + Math.cos(bearing) * radial;
      const scale = (kind === 'rubble' || kind === 'snow' ? .49 : .73) + .32 * ((i * 17 + count) % 29) / 28;
      const radius = pieceRadii[kind] * scale;
      const height = heightAt(east, north);
      if (height === undefined || keepouts.some(area => Math.hypot(area.east - east, area.north - north) < area.radius + radius)) continue;
      if (cluster.band === 'floor' && (angle < .75 || angle > tau - .75)) continue;
      if (cluster.band === 'floor' && distanceToSegment(east, north, floorApproach, center) < radius + 2.8) continue;
      if (spiral.some((from, index) => index > 0 && distanceToSegment(east, north, spiral[index - 1], from) < radius + 2.75)) continue;
      const tree = kind === 'pine' || kind === 'fallen-pine';
      if (tree) {
        const half = radius * .62;
        const supports = [[east - half, north], [east + half, north], [east, north - half], [east, north + half]];
        if (supports.some(([x, n]) => Math.abs((heightAt(x, n) ?? Infinity) - height) > (kind === 'pine' ? .42 : .28))) continue;
      }
      const spacing = tree ? .81 : .64;
      if (placements.some(piece => Math.hypot(piece.east - east, piece.north - north) < (piece.radius + radius) * spacing)) continue;
      const orientation = kind === 'fallen-pine' ? bearing + Math.PI / 2 : v * tau;
      placements.push({ east, north, height, radius, kind, band: cluster.band, cluster: cluster.name, orientation, scale });
      placed++;
    }
  }

  renderPlacements(group, placements);
  return { group, placements };
}
