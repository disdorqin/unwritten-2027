import {
  BufferGeometry, CircleGeometry, Color, ConeGeometry, CylinderGeometry,
  DodecahedronGeometry, Float32BufferAttribute, Group, IcosahedronGeometry,
  InstancedMesh, Matrix3, Matrix4, MeshLambertMaterial, Object3D, Quaternion,
  Vector3,
} from 'three';
import { sampleNorthRidge350 } from './north-ridge-350-terrain';
import { createFrontRidgeSwitchbackRoad } from './front-ridge-switchback-road';

/**
 * Front-ridge vegetation band (入图标准 3: front surface + vegetation
 * in bands). Draped on sampleNorthRidge350, laid out in altitude
 * bands per the mountain four-band gradient (《设计-景物册》):
 *   foot (surface < 120 m)  -- pine forest clusters + rocks, the only
 *                              band where soil/rock colour dominates;
 *   treeline (120-220 m)    -- flag-form pines + shrub clusters;
 *   snowfield (220-300 m)   -- rock clusters + shaded snow patches;
 *   crown (> 300 m)         -- sparse rocks only.
 *
 * Clearance discipline (air-wall audit commitment): every placement
 * is >= 8 m in plan from the switchback centreline AND the entry
 * spur (corridor half 1.75 + feather 3.4 + ~3 m safety), >= 8 m from
 * the cable rope line, and outside the station terraces. Everything
 * is visual-only instancing -- nothing registers a collider, so the
 * corridor's feather band stays physically clear by construction.
 *
 * One InstancedMesh per kind (4 draws total). Placements are
 * exported for the acceptance re-measure.
 */

export interface VegetationPlacement {
  kind: 'pine' | 'flagpine' | 'shrub' | 'rock' | 'snow';
  east: number; north: number; height: number; scale: number;
}

const hash = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const CENTRE = { east: 320, north: 650, radiusE: 330, radiusN: 380 };
const thetaOf = (east: number, north: number) => Math.atan2(
  (north - CENTRE.north) / CENTRE.radiusN, (east - CENTRE.east) / CENTRE.radiusE);

const CABLE: [number, number][] = [[526, 329], [440, 520], [336, 640]];
const distToSeg = (e: number, n: number, a: [number, number], b: [number, number]) => {
  const vx = b[0] - a[0], vy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((e - a[0]) * vx + (n - a[1]) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(e - (a[0] + vx * t), n - (a[1] + vy * t));
};
const TERRACES = [
  { east: 440, north: 520, hw: 19, hd: 16 },  // mid station terrace
  { east: 336, north: 640, hw: 22, hd: 18 },  // cloud terrace
  { east: 526, north: 329, hw: 14, hd: 12 },  // base station plot
];

/** Merge transformed primitives into one vertex-coloured geometry. */
function mergeParts(parts: { geo: BufferGeometry; x: number; y: number; z: number; s: number; color: string }[]): BufferGeometry {
  const positions: number[] = [], normals: number[] = [], colors: number[] = [], indices: number[] = [];
  let base = 0;
  const m = new Matrix4(), q = new Quaternion(), v = new Vector3();
  for (const part of parts) {
    const g = part.geo.index ? part.geo.toNonIndexed() : part.geo;
    const p = g.getAttribute('position'), n = g.getAttribute('normal');
    m.compose(v.set(part.x, part.y, part.z), q.identity(), new Vector3(part.s, part.s, part.s));
    const nm = new Matrix3().getNormalMatrix(m);
    const col = new Color(part.color);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p as never, i).applyMatrix4(m);
      positions.push(v.x, v.y, v.z);
      v.fromBufferAttribute(n as never, i).applyMatrix3(nm).normalize();
      normals.push(v.x, v.y, v.z);
      colors.push(col.r, col.g, col.b);
    }
    for (let i = 0; i < p.count; i++) indices.push(base + i);
    base += p.count;
    if (g !== part.geo) g.dispose();
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new Float32BufferAttribute(positions, 3));
  out.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  out.setAttribute('color', new Float32BufferAttribute(colors, 3));
  out.setIndex(indices);
  return out;
}

const pineGeometry = () => mergeParts([
  { geo: new CylinderGeometry(0.22, 0.34, 2.6, 5), x: 0, y: 1.3, z: 0, s: 1, color: '#5d4630' },
  { geo: new ConeGeometry(1.9, 3.4, 7), x: 0, y: 3.9, z: 0, s: 1, color: '#44503c' },
  { geo: new ConeGeometry(1.35, 2.8, 7), x: 0, y: 5.8, z: 0, s: 1, color: '#4d5c43' },
  { geo: new ConeGeometry(0.8, 2.0, 6), x: 0, y: 7.5, z: 0, s: 1, color: '#57684c' },
]);
const flagPineGeometry = () => mergeParts([
  { geo: new CylinderGeometry(0.18, 0.3, 3.4, 5), x: 0.25, y: 1.7, z: 0, s: 1, color: '#5d4630' },
  // wind-flagged canopy: mass pushed to one side (+x, lee of the wind)
  { geo: new ConeGeometry(1.5, 2.6, 6), x: 0.95, y: 4.4, z: 0, s: 1, color: '#44503c' },
  { geo: new ConeGeometry(0.9, 1.9, 6), x: 1.25, y: 6.0, z: 0, s: 1, color: '#4d5c43' },
]);
const shrubGeometry = () => mergeParts([
  { geo: new IcosahedronGeometry(1.1, 0), x: 0, y: 0.75, z: 0, s: 1, color: '#4d5c43' },
  { geo: new IcosahedronGeometry(0.8, 0), x: 0.8, y: 0.55, z: 0.3, s: 1, color: '#57684c' },
  { geo: new IcosahedronGeometry(0.7, 0), x: -0.7, y: 0.5, z: -0.3, s: 1, color: '#44503c' },
]);
const rockGeometry = () => mergeParts([
  { geo: new DodecahedronGeometry(1.3, 0), x: 0, y: 0.7, z: 0, s: 1, color: '#8a8378' },
  { geo: new DodecahedronGeometry(0.85, 0), x: 1.0, y: 0.45, z: 0.4, s: 1, color: '#7a7264' },
]);

export function createFrontRidgeVegetation(
  road: Pick<ReturnType<typeof createFrontRidgeSwitchbackRoad>, 'centreline' | 'entryCentreline'> =
    createFrontRidgeSwitchbackRoad(),
) {
  const group = new Group();
  group.name = 'front-ridge-vegetation';
  const line = [...road.centreline, ...road.entryCentreline];
  const clearOfRoad = (e: number, n: number) => {
    for (const p of line) {
      const dx = p.east - e, dn = p.north - n;
      if (dx * dx + dn * dn < 64) return false; // < 8 m
    }
    return true;
  };
  const clearOfCable = (e: number, n: number) =>
    distToSeg(e, n, CABLE[0]!, CABLE[1]!) >= 8 && distToSeg(e, n, CABLE[1]!, CABLE[2]!) >= 8;
  const clearOfTerraces = (e: number, n: number) =>
    TERRACES.every(t => Math.abs(e - t.east) > t.hw || Math.abs(n - t.north) > t.hd);

  const placements: VegetationPlacement[] = [];
  const tryPlace = (
    kind: VegetationPlacement['kind'], e: number, n: number,
    band: [number, number], scale: number,
  ) => {
    const h = sampleNorthRidge350(e, n);
    if (h < band[0] || h >= band[1]) return;
    if (!clearOfRoad(e, n) || !clearOfCable(e, n) || !clearOfTerraces(e, n)) return;
    placements.push({ kind, east: e, north: n, height: h, scale });
  };

  // Clustered scatter: cluster centres on a jittered (theta, height)
  // lattice per band, members sprinkled within the cluster radius.
  let seed = 0;
  const cluster = (
    kind: VegetationPlacement['kind'], hLo: number, hHi: number,
    centres: number, members: [number, number], radius: number,
    scale: [number, number], southBoost = 0,
  ) => {
    for (let c = 0; c < centres; c++) {
      seed++;
      const theta = -Math.PI + hash(seed * 1.31) * Math.PI * 2;
      // south face (town side, theta in (-pi, 0)) gets extra centres
      if (southBoost && theta > 0 && hash(seed * 2.17) > southBoost) continue;
      const ch = hLo + hash(seed * 3.71) * (hHi - hLo);
      const dC = 1 - Math.pow(Math.max(0, (ch - 18) / 332), 1 / 1.6);
      const ce = CENTRE.east + dC * CENTRE.radiusE * Math.cos(theta);
      const cn = CENTRE.north + dC * CENTRE.radiusN * Math.sin(theta);
      const count = members[0] + Math.floor(hash(seed * 5.13) * (members[1] - members[0]));
      for (let i = 0; i < count; i++) {
        seed++;
        const a = hash(seed * 7.77) * Math.PI * 2;
        const r = Math.sqrt(hash(seed * 9.31)) * radius;
        tryPlace(kind, ce + Math.cos(a) * r, cn + Math.sin(a) * r,
          [hLo - 8, hHi + 8], scale[0] + hash(seed * 11.7) * (scale[1] - scale[0]));
      }
    }
  };
  cluster('pine', 26, 118, 30, [6, 13], 26, [0.85, 1.5], 0.35);
  cluster('flagpine', 112, 224, 36, [4, 8], 22, [0.8, 1.3], 0.3);
  cluster('shrub', 60, 235, 42, [5, 10], 18, [0.8, 1.6], 0.3);
  cluster('rock', 30, 345, 36, [3, 7], 20, [0.8, 2.2], 0.25);
  // Shaded snow patches: upper band, biased to the north/east faces.
  for (let c = 0; c < 22; c++) {
    seed++;
    const theta = -0.4 + hash(seed * 1.93) * 2.4; // east-through-north arc
    const ch = 225 + hash(seed * 3.3) * 70;
    const dC = 1 - Math.pow(Math.max(0, (ch - 18) / 332), 1 / 1.6);
    const ce = CENTRE.east + dC * CENTRE.radiusE * Math.cos(theta);
    const cn = CENTRE.north + dC * CENTRE.radiusN * Math.sin(theta);
    const count = 2 + Math.floor(hash(seed * 5.9) * 3);
    for (let i = 0; i < count; i++) {
      seed++;
      const a = hash(seed * 7.1) * Math.PI * 2;
      const r = Math.sqrt(hash(seed * 8.3)) * 15;
      tryPlace('snow', ce + Math.cos(a) * r, cn + Math.sin(a) * r, [215, 305], 1 + hash(seed * 9.7) * 1.6);
    }
  }

  const dummy = new Object3D();
  const build = (
    kind: VegetationPlacement['kind'], geo: BufferGeometry, name: string,
    flat = false,
  ) => {
    const list = placements.filter(p => p.kind === kind);
    const mat = new MeshLambertMaterial({ vertexColors: !flat, color: flat ? 0xe8ecf0 : 0xffffff });
    const mesh = new InstancedMesh(geo, mat, Math.max(1, list.length));
    mesh.name = name;
    list.forEach((p, i) => {
      dummy.position.set(p.east, p.height - 0.15, p.north);
      dummy.rotation.set(0, hash(i * 3.3 + p.east) * Math.PI * 2, 0);
      if (flat) {
        dummy.rotation.set(-Math.PI / 2, 0, hash(i * 3.3) * Math.PI * 2);
        dummy.position.y = p.height + 0.22;
      }
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    group.add(mesh);
    return { mesh, mat };
  };
  const pines = build('pine', pineGeometry(), 'vegetation-pines');
  const flags = build('flagpine', flagPineGeometry(), 'vegetation-flag-pines');
  const shrubs = build('shrub', shrubGeometry(), 'vegetation-shrubs');
  const rocks = build('rock', rockGeometry(), 'vegetation-rocks');
  const snow = build('snow', new CircleGeometry(4.6, 9), 'vegetation-snow-patches', true);

  const counts = {
    pine: placements.filter(p => p.kind === 'pine').length,
    flagpine: placements.filter(p => p.kind === 'flagpine').length,
    shrub: placements.filter(p => p.kind === 'shrub').length,
    rock: placements.filter(p => p.kind === 'rock').length,
    snow: placements.filter(p => p.kind === 'snow').length,
  };
  return {
    group,
    placements,
    counts,
    setNight(on: boolean) {
      const tint = new Color(on ? 0x8b98ad : 0xffffff);
      for (const part of [pines, flags, shrubs, rocks]) part.mat.color.copy(tint);
      snow.mat.color.set(on ? 0x9fb2cc : 0xe8ecf0);
    },
    dispose() {
      for (const part of [pines, flags, shrubs, rocks, snow]) {
        part.mesh.geometry.dispose();
        part.mat.dispose();
      }
    },
  };
}
