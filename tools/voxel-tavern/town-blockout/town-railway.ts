import {
  BoxGeometry, CatmullRomCurve3, Color, Group, InstancedMesh, Matrix4,
  MeshBasicMaterial, MeshLambertMaterial, Object3D, Quaternion, Vector3, type Material,
} from 'three';
import expansion from '../../../docs/p0-layout-draft.json';
import type { createTerrainGrid } from './terrain';
import type { Box } from './landmark-kit';

type Terrain = ReturnType<typeof createTerrainGrid>;
type XYZ = [number, number, number];
type Part = { position: XYZ; size: XYZ; tint: string; rotation?: Quaternion; closeDetail?: boolean };

const [station] = expansion.extension.coasterGuideLine;
const [stationX, stationNorth] = station;
const stationGround = expansion.extension.plots.find(plot => plot.id === 'coaster-station')!.origin[2];
const stationRailY = stationGround + .68;
const stationHalfLength = 24;
const chunkSize = expansion.chunkSize;
const gauge = 1.66;
const clearanceCell = 16;
const up = new Vector3(0, 1, 0);
const limit = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));
const smooth = (value: number) => {
  const t = limit(value, 0, 1);
  return t * t * (3 - 2 * t);
};

export function buildTownRailRoute(grid: Terrain) {
  // The last approved coordinate repeats the first. The closed spline supplies that seam.
  const curve = new CatmullRomCurve3(expansion.extension.coasterGuideLine.slice(0, -1).map(
    ([x, n]) => new Vector3(x, 0, -n),
  ), true, 'centripetal');
  curve.arcLengthDivisions = 2400;
  const length = curve.getLength();
  const count = Math.ceil(length / 1.7);
  const step = length / count;
  const points = Array.from({ length: count }, (_, i) => curve.getPointAt(i / count));
  const platformDistance = (index: number) => Math.min(index, count - index) * step;
  const grounds = points.map(point => {
    const n = -point.z;
    point.x += (stationX - point.x) * (1 - smooth((Math.abs(n - stationNorth) - stationHalfLength) / 6))
      * (1 - smooth(Math.abs(point.x - stationX) / 5));
    return Math.max(grid.heightAt(point.x, n), grid.heightAt(point.x - 1.4, n),
      grid.heightAt(point.x + 1.4, n), grid.heightAt(point.x, n - 1.4), grid.heightAt(point.x, n + 1.4));
  });
  const minHeights = grounds.map((ground, i) => {
    const approach = Math.max(0, platformDistance(i) - stationHalfLength);
    return ground + .62 + 5.7 * smooth(approach / 35);
  });
  const grades = minHeights.slice();
  const maxGrade = .225;
  for (const direction of [1, -1]) {
    for (let index = 1; index <= count * 2; index++) {
      const here = (direction * index + count * 2) % count;
      const previous = (here - direction + count) % count;
      grades[here] = Math.max(grades[here], grades[previous] - maxGrade * step);
    }
  }
  for (let i = 0; i < count; i++) {
    const approach = Math.max(0, platformDistance(i) - stationHalfLength);
    let smoothed = 0;
    for (let offset = -5; offset <= 5; offset++) {
      smoothed += grades[(i + offset + count) % count] * (6 - Math.abs(offset)) / 36;
    }
    const allowedChange = maxGrade * (approach - (1 - Math.exp(-approach / 7)) * 7);
    // The station is level. Its approach eases into the terrain-clearance envelope.
    points[i].y = approach === 0 ? stationRailY : Math.max(grounds[i] + .62,
      limit(smoothed + .35, stationRailY - allowedChange, stationRailY + allowedChange));
  }

  function pointAt(distance: number, target: Vector3) {
    const index = ((distance % length + length) % length) / step;
    const start = Math.min(count - 1, Math.floor(index));
    return target.lerpVectors(points[start], points[(start + 1) % count], index - start);
  }

  // Small world-space cells keep forest and building placement probes local to the route.
  const cells = new Map<string, number[]>();
  for (let i = 0; i < count; i++) {
    const point = points[i];
    const key = `${Math.floor(point.x / clearanceCell)},${Math.floor(-point.z / clearanceCell)}`;
    const cell = cells.get(key) ?? [];
    cell.push(i);
    cells.set(key, cell);
  }
  function keepClear(x: number, north: number, radius = 0) {
    const margin = radius + 3.25;
    const minX = Math.floor((x - margin) / clearanceCell);
    const maxX = Math.floor((x + margin) / clearanceCell);
    const minN = Math.floor((north - margin) / clearanceCell);
    const maxN = Math.floor((north + margin) / clearanceCell);
    for (let cellX = minX; cellX <= maxX; cellX++) {
      for (let cellN = minN; cellN <= maxN; cellN++) {
        const cell = cells.get(`${cellX},${cellN}`);
        if (cell?.some(i => (points[i].x - x) ** 2 + (-points[i].z - north) ** 2 < margin ** 2)) {
          return true;
        }
      }
    }
    return false;
  }
  return { length, step, points, pointAt, keepClear };
}

function addBatch(parts: Part[], name: string, geometry: BoxGeometry, material: Material, group: Group) {
  const model = new InstancedMesh(geometry, material, parts.length);
  const transform = new Object3D();
  const color = new Color();
  for (const [index, part] of parts.entries()) {
    transform.position.set(...part.position);
    transform.scale.set(...part.size);
    transform.quaternion.copy(part.rotation ?? identity);
    transform.updateMatrix();
    model.setMatrixAt(index, transform.matrix);
    model.setColorAt(index, color.set(part.tint));
  }
  model.name = name;
  model.computeBoundingSphere();
  group.add(model);
}
const identity = new Quaternion();

function buildTrack(
  grid: Terrain, route: ReturnType<typeof buildTownRailRoute>, geometry: BoxGeometry,
  material: MeshLambertMaterial, group: Group,
) {
  const chunks = new Map<string, Part[]>();
  const colliders: Box[] = [];
  const { points } = route;
  const orientation = new Matrix4();
  const delta = new Vector3();
  const platformLimit = stationHalfLength + 1;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const center = new Vector3().lerpVectors(a, b, .5);
    const length = delta.subVectors(b, a).length();
    const turn = new Quaternion().setFromRotationMatrix(orientation.lookAt(b, a, up));
    const atPlatform = Math.hypot(center.x - stationX, center.z + stationNorth) < platformLimit;
    const key = `${Math.floor(center.x / chunkSize)},${Math.floor(-center.z / chunkSize)}`;
    const parts = chunks.get(key) ?? [];
    chunks.set(key, parts);
    function local(x: number, y: number, z: number, w: number, h: number, d: number, tint: string, closeDetail = false) {
      const p = new Vector3(x, y, z).applyQuaternion(turn).add(center);
      parts.push({ position: [p.x, p.y, p.z], size: [w, h, d], tint, rotation: turn, closeDetail });
    }
    for (const x of [-gauge / 2, gauge / 2]) {
      local(x, -.105, 0, .21, .21, length + .06, '#8e9eae');
      local(x, -.28, 0, .2, .13, length + .06, '#58474a', true);
      local(x, -.18, 0, .34, .09, .24, '#33323a', true);
    }
    local(0, -.32, 0, 2.9, .16, .31, '#664a3c', !atPlatform);
    if (!atPlatform) {
      local(0, -.53, 0, 2.45, .24, length + .06, '#5d4850');
      local(-1.2, -.4, .13, .21, .08, length * .48, '#c2d2df', true);
      local(1.2, -.4, -.15, .21, .08, length * .58, '#d3deea', true);
    }

    if (atPlatform || i % 8 !== 4) continue;
    const north = -center.z;
    const surface = grid.surfaces[Math.round(north) * grid.gridWidth + Math.round(center.x)];
    // Walking roads pass under the continuous girders and stay free of footing blocks.
    if (surface !== 0) continue;
    const footingCenter = grid.heightAt(center.x, north);
    if (center.y - footingCenter < 1.5) continue;
    const offset = new Vector3(1.33, 0, 0).applyQuaternion(turn);
    const width = center.y - footingCenter >= 13 ? .93 : .63;
    for (const side of [-1, 1]) {
      const x = center.x + offset.x * side;
      const z = center.z + offset.z * side;
      const base = grid.heightAt(x, -z) - .2;
      const top = center.y - .6;
      parts.push({ position: [x, base + .15, z], size: [width + .55, .62, width + .5], tint: '#596879' });
      parts.push({ position: [x, (base + top) / 2, z], size: [width, top - base, width], tint: '#685057' });
      parts.push({ position: [x, top - .3, z], size: [width + .18, .38, width + .17], tint: '#9e7472' });
      const pad = (width + .55) / 2;
      colliders.push({ min: [x - pad, base - .16, z - pad], max: [x + pad, top, z + pad] });
    }
    local(0, -.78, 0, 3.47, .32, .55, '#6a4a48');
    if (center.y - footingCenter > 4) {
      const bank = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), .51);
      const tangential = new Quaternion().setFromRotationMatrix(orientation.lookAt(
        new Vector3(b.x, 0, b.z), new Vector3(a.x, 0, a.z), up,
      ));
      parts.push({ position: [center.x, center.y - 2.04, center.z], size: [.26, 3.05, .33],
        tint: '#745350', rotation: tangential.clone().multiply(bank) });
      bank.invert();
      parts.push({ position: [center.x, center.y - 2.04, center.z], size: [.26, 3.05, .33],
        tint: '#745350', rotation: tangential.multiply(bank) });
    }
  }
  const detailed = new Group();
  group.add(detailed);
  for (const [key, parts] of chunks) addBatch(parts, `tour-train-track-${key}`, geometry, material, detailed);
  let panorama: Group | undefined;
  function setPanorama(wide: boolean) {
    detailed.visible = !wide;
    if (!panorama && wide) {
      panorama = new Group();
      const silhouettes = [...chunks.values()].flatMap(parts => parts.filter(part => !part.closeDetail));
      addBatch(silhouettes, 'tour-train-track-panorama', geometry, material, panorama);
      group.add(panorama);
    }
    if (panorama) panorama.visible = wide;
  }
  return { colliders, setPanorama };
}

function buildVehicle(engine: boolean, accent: string, geometry: BoxGeometry, opaque: Material, glow: Material) {
  const vehicle = new Group();
  const parts: Part[] = [];
  const lamps: Part[] = [];
  function box(x: number, y: number, z: number, w: number, h: number, d: number, tint: string) {
    parts.push({ position: [x, y, z], size: [w, h, d], tint });
  }
  function lamp(x: number, y: number, z: number, w: number, h: number, d: number, tint = '#ffbf62') {
    lamps.push({ position: [x, y, z], size: [w, h, d], tint });
  }
  const steel = '#333439';
  const brass = '#d4a96a';
  const cream = '#e2cba3';
  const snow = '#d2e0ec';
  box(0, .83, 0, 2.14, .34, 5.38, steel);
  for (const x of [-1.01, 1.01]) {
    box(x, 1.02, 0, .17, .2, 5.48, brass);
    box(x, .93, -1.07, .54, .12, .7, '#594a40');
  }
  for (const z of [-1.65, 1.65]) {
    box(0, .51, z, 2.02, .18, .22, steel);
    for (const x of [-gauge / 2, gauge / 2]) {
      box(x, .51, z, .3, .65, .65, '#48454e');
      box(x, .51, z, .35, .34, .91, '#494750');
      box(x, .51, z, .35, .92, .36, '#494750');
      box(x, .51, z, .43, .23, .23, brass);
      for (let spoke = 0; spoke < 8; spoke++) {
        const angle = spoke * Math.PI / 4;
        parts.push({
          position: [x, .51 + Math.cos(angle) * .46, z + Math.sin(angle) * .46],
          size: [.4, .10, .37], tint: '#34343e',
          rotation: new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), angle - Math.PI / 2),
        });
      }
    }
  }
  for (const z of [-2.87, 2.87]) {
    box(0, .69, z, .32, .24, .61, steel);
    box(0, .68, z * 1.07, .47, .21, .18, '#786362');
  }
  if (engine) {
    // A stepped copper boiler, cab windows and fascia retain the original voxel proportions.
    box(0, 1.63, .82, 1.60, 1.18, 3.16, accent);
    box(0, 2.19, .82, 1.30, .29, 3.17, accent);
    box(0, 2.36, .82, .92, .12, 3.12, '#aa5545');
    for (const z of [0, 1.99]) {
      box(0, 2.25, z, 1.37, .35, .09, brass);
      for (const x of [-.815, .815]) box(x, 1.61, z, .11, 1.14, .095, brass);
    }
    box(0, 1.62, 2.43, 1.48, 1.02, .14, steel);
    box(0, 1.63, 2.53, .8, .69, .11, '#58515b');
    box(0, 2.61, 1.85, .47, .53, .51, steel);
    box(0, 2.91, 1.85, .66, .17, .66, brass);
    box(0, 2.98, 1.85, .5, .08, .5, steel);
    box(0, 2.53, .38, .46, .26, .45, brass);
    box(0, 1.42, -1.63, 2.16, .88, 1.91, accent);
    for (const x of [-.99, .99]) {
      box(x, 2.28, -1.69, .15, 1.00, 1.85, accent);
      lamp(x * 1.10, 2.34, -1.67, .045, .57, .99);
      box(x * 1.13, 2.02, -1.67, .11, .12, 1.16, brass);
      box(x * 1.13, 2.33, -1.67, .11, .66, .055, brass);
      box(x, .7, .22, .19, .12, 2.95, brass);
    }
    box(0, 2.84, -1.64, 2.4, .19, 2.10, steel);
    box(0, 2.98, -1.64, 2.17, .12, 1.99, snow);
    box(0, 3.07, -1.64, 1.67, .07, 1.90, snow);
    box(0, 2.13, 2.49, .56, .55, .22, brass);
    lamp(0, 2.13, 2.65, .39, .40, .11, '#ffda84');
    box(0, .96, 2.57, 2.12, .35, .48, accent);
    for (const x of [-.69, -.46, -.23, 0, .23, .46, .69]) {
      box(x, .79, 2.76, .12, .25, .36, brass);
    }
  } else {
    box(0, 1.025, 0, 2.25, .15, 5.26, '#8b6450');
    for (const x of [-1.05, 1.05]) {
      box(x, 1.35, 0, .15, .55, 5.28, accent);
      box(x, 1.67, 0, .24, .12, 5.32, brass);
      for (const z of [-1.82, -.61, .61, 1.82]) {
        box(x * 1.09, 1.39, z, .1, .29, .74, cream);
        box(x * 1.16, 1.39, z, .046, .21, .57, accent);
      }
      for (const z of [-2.5, -.78, .78, 2.5]) {
        box(x, 2.33, z, .13, 1.3, .13, '#684945');
        box(x, 2.78, z, .20, .10, .19, brass);
      }
    }
    for (const z of [-2.48, 2.48]) {
      box(0, 1.52, z, 2.03, .52, .18, accent);
      box(0, 1.83, z, 2.09, .11, .24, brass);
      box(0, 1.48, z * .49, 1.58, .17, .58, cream);
      box(0, 1.68, z * .49 + .23, 1.58, .48, .13, '#93644e');
      box(0, 2.62, z * .84, .23, .26, .2, '#564d45');
      lamp(0, 2.55, z * .84, .15, .18, .21);
      for (const x of [-.82, .82]) lamp(x, 1.33, z * 1.035, .15, .16, .043, '#ed8455');
    }
    box(0, 3.01, 0, 2.42, .14, 5.55, accent);
    box(0, 3.13, 0, 2.13, .12, 5.41, '#483d48');
    box(0, 3.22, 0, 1.81, .09, 5.28, snow);
    box(0, 3.29, 0, 1.25, .06, 5.10, snow);
  }
  addBatch(parts, engine ? 'tour-train-engine' : 'tour-train-coach', geometry, opaque, vehicle);
  addBatch(lamps, 'painted-train-light', geometry, glow, vehicle);
  return vehicle;
}

export function createTownRailway(grid: Terrain) {
  const route = buildTownRailRoute(grid);
  const group = new Group();
  group.name = 'town-tour-train';
  const geometry = new BoxGeometry();
  const opaque = new MeshLambertMaterial();
  const glow = new MeshBasicMaterial();
  const track = buildTrack(grid, route, geometry, opaque, group);
  group.userData.colliders = track.colliders;
  const vehicles = [
    { model: buildVehicle(true, '#884248', geometry, opaque, glow), offset: 6.15 },
    { model: buildVehicle(false, '#426756', geometry, opaque, glow), offset: 0 },
    { model: buildVehicle(false, '#6b505d', geometry, opaque, glow), offset: -6.15 },
  ];
  const view = new Object3D();
  view.name = 'tour-train-view';
  group.add(...vehicles.map(({ model }) => model), view);
  const boarding = { x: stationX - 4.5, n: stationNorth, ground: stationGround };

  let distance = 0;
  let speed = 0;
  let riding = false;
  let atPlatform = true;
  const previous = new Vector3(), next = new Vector3();
  const front = new Vector3(), rear = new Vector3();
  const frame = new Matrix4();
  const facing = new Quaternion();

  function updatePoses(delta: number) {
    for (const { model, offset } of vehicles) {
      const along = distance + offset;
      route.pointAt(along - 2.1, previous);
      route.pointAt(along + 2.1, next);
      model.position.lerpVectors(previous, next, .5);
      model.quaternion.setFromRotationMatrix(frame.lookAt(next, previous, up));
    }
    view.position.copy(vehicles[1].model.position);
    view.position.y += 2.46;
    // A level horizon and spring-free yaw limit keep the first-person ride steady.
    route.pointAt(distance - 5, rear);
    route.pointAt(distance + 12, front);
    rear.y = front.y;
    facing.setFromRotationMatrix(frame.lookAt(front, rear, up));
    view.quaternion.rotateTowards(facing, delta * Math.PI * .16);
  }

  function park() {
    distance = 0;
    speed = 0;
    atPlatform = true;
    updatePoses(Infinity);
  }
  park();
  return {
    group, boarding, view, route,
    keepClear: route.keepClear,
    setPanorama: track.setPanorama,
    get riding() { return riding; },
    get atPlatform() { return atPlatform; },
    board() {
      if (!atPlatform) return;
      riding = true;
      atPlatform = false;
    },
    disembark() {
      riding = false;
      park();
    },
    update(dt: number) {
      if (!riding || atPlatform || dt <= 0 || !Number.isFinite(dt)) return;
      const elapsed = Math.min(dt, .12);
      const remaining = route.length - distance;
      const brakingSpeed = Math.sqrt(2 * 2.8 * remaining);
      speed = Math.min(13.2, speed + 2.8 * elapsed, brakingSpeed);
      if (speed * elapsed >= remaining) park();
      else {
        distance += speed * elapsed;
        updatePoses(elapsed);
      }
    },
  };
}
