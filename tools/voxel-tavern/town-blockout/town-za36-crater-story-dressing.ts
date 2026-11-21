import {
  BoxGeometry, ConeGeometry, DataTexture, DodecahedronGeometry, Group, InstancedMesh,
  MeshStandardMaterial, NearestFilter, Object3D, SRGBColorSpace,
} from 'three';
import { createMeteorCrater, meteorCraterFixturePlan } from './meteor-crater';
import type { mountWestCraterRoad } from './town-za22-crater-road';
import { surveyZa31CraterWinch } from './town-za31-crater-winch';

type Ground = Pick<ReturnType<typeof mountWestCraterRoad>, 'anchor' | 'lip' | 'heightAt'>;
type Piece = 'scorch' | 'black-rock' | 'timber' | 'rust' | 'ice';
type Band = 'rim' | 'trail' | 'floor';
export type Za36ScenePiece = Readonly<{
  kind: Piece; band: Band; cluster: string; east: number; north: number; height: number;
}>;
const fixture = createMeteorCrater(meteorCraterFixturePlan);
const tau = 2 * Math.PI;
const geometry = {
  scorch: new BoxGeometry(),
  'black-rock': new DodecahedronGeometry(1, 0),
  timber: new BoxGeometry(),
  rust: new ConeGeometry(1, 1, 5),
  ice: new ConeGeometry(1, 1, 5),
};
const sizes: Record<Piece, readonly [number, number, number]> = {
  scorch: [1.25, .09, .72],
  'black-rock': [.53, .55, .43],
  timber: [.9, .14, .23],
  rust: [.24, .42, .23],
  ice: [.19, .69, .19],
};

function grain(base: number, fleck: number, streak: number) {
  const size = 16;
  const rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const pattern = (x * 11 + y * 7 + Math.floor(x / 3) * y * 3) % 31;
    const color = pattern < 4 ? fleck : x % 7 === 1 && y % 3 !== 0 ? streak : base;
    rgba.set([color >> 16, color >> 8 & 255, color & 255, 255], 4 * (x + size * y));
  }
  const map = new DataTexture(rgba, size, size);
  map.colorSpace = SRGBColorSpace;
  map.minFilter = map.magFilter = NearestFilter;
  map.generateMipmaps = false;
  map.needsUpdate = true;
  return map;
}
const createMaterial = (base: number, fleck: number, streak: number) =>
  new MeshStandardMaterial({ map: grain(base, fleck, streak), flatShading: true, roughness: 1 });
const materials: Record<Piece, MeshStandardMaterial> = {
  scorch: createMaterial(0x2c3648, 0x5d4630, 0x8a4a34),
  'black-rock': createMaterial(0x2c3648, 0x8a8378, 0x5d4630),
  timber: createMaterial(0x5d4630, 0xa98a56, 0x2c3648),
  rust: createMaterial(0x8a4a34, 0x2c3648, 0x5d4630),
  ice: new MeshStandardMaterial({ color: 0x7fd4c8, emissive: 0x7fd4c8,
    emissiveIntensity: .18, roughness: 1, flatShading: true }),
};

export function buildZa36CraterStoryDressing(road: Ground) {
  const { east: originE, north: originN, yaw } = road.anchor;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const group = new Group();
  group.name = 'za36-crater-story-dressing';
  const placements: Za36ScenePiece[] = [];
  const stamps = new Map<string, Object3D[]>();
  const trail = Array.from({ length: 801 }, (_, i) => {
    const at = fixture.mainTrailPoint(i / 800);
    return { east: originE + at.east * c + at.north * s,
      north: originN + at.north * c - at.east * s };
  });
  const survey = surveyZa31CraterWinch(road);
  const reserved = survey ? [
    { east: survey.useFoot.east, north: survey.useFoot.north, radius: 1.45 },
    survey.snakeStoneReservation,
    { east: survey.plinth.east, north: survey.plinth.north, radius: 1.2 },
  ] : [];
  function add(kind: Piece, band: Band, cluster: string, east: number, north: number,
    angle: number, scale = 1) {
    const height = road.heightAt(east, north);
    if (height === undefined || !Number.isFinite(height)) return;
    if (Math.hypot(east - originE, north - originN) < 8) return;
    if (Math.hypot(east - road.lip.east, north - road.lip.north) < 9.8) return;
    if (reserved.some(site => Math.hypot(east - site.east, north - site.north) < site.radius + .55)) return;
    if (trail.some(p => Math.hypot(east - p.east, north - p.north) < 3.1)) return;
    if (placements.some(p => Math.hypot(east - p.east, north - p.north) < .72)) return;
    const [sx, sy, sz] = sizes[kind];
    const part = new Object3D();
    part.position.set(east, height + sy * scale * .52, -north);
    part.rotation.y = angle;
    part.scale.set(sx * scale, sy * scale, sz * scale);
    part.updateMatrix();
    const key = band + ':' + kind;
    const entries = stamps.get(key) ?? [];
    entries.push(part);
    stamps.set(key, entries);
    placements.push({ kind, band, cluster, east, north, height });
  }

  // Twenty-eight named spiralling human/impact traces; every interval of the
  // 3.5-turn descent has a cluster in view, without putting objects on the lane.
  for (let cluster = 0; cluster < 28; cluster++) {
    const progress = (cluster + .5) / 28;
    const at = fixture.mainTrailPoint(progress);
    const radial = Math.hypot(at.east, at.north);
    const angle = Math.atan2(at.east, at.north);
    const worldAngle = angle + yaw;
    const kind: Piece[] = ['scorch', 'black-rock', 'black-rock', 'timber', 'rust',
      progress > .55 ? 'ice' : 'scorch', 'black-rock'];
    for (let part = 0; part < kind.length; part++) {
      const radialShift = 4.5 + Math.floor(part / 3) * .72;
      const transverse = ((part % 3) - 1) * 1.45;
      const localE = (radial + radialShift) * Math.sin(angle) + transverse * Math.cos(angle);
      const localN = (radial + radialShift) * Math.cos(angle) - transverse * Math.sin(angle);
      add(kind[part]!, 'trail', 'descent-' + String(cluster + 1).padStart(2, '0'),
        originE + localE * c + localN * s,
        originN + localN * c - localE * s,
        worldAngle + (part % 3) * .32, .78 + (part % 4) * .15);
    }
  }

  // Rim black-rock scatter: several signatures away from the guarded mouth.
  for (let cluster = 0; cluster < 16; cluster++) {
    const angle = meteorCraterFixturePlan.mainTrail.startBearing + cluster * tau / 16;
    const worldAngle = angle + yaw;
    for (let part = 0; part < 5; part++) {
      const radius = 56.5 + Math.floor(part / 3) * 1.4;
      const tangent = ((part % 3) - 1) * 1.42;
      const localE = radius * Math.sin(angle) + tangent * Math.cos(angle);
      const localN = radius * Math.cos(angle) - tangent * Math.sin(angle);
      add(part === 0 ? 'scorch' : part === 4 ? 'rust' : 'black-rock',
        'rim', 'ejecta-' + String(cluster + 1).padStart(2, '0'),
        originE + localE * c + localN * s,
        originN + localN * c - localE * s, worldAngle + part * .17, .88);
    }
  }

  // Broken engineering trace near the covered well, not a new shaft, ship
  // debris, snake stone, or pickup. All service/interaction footprints remain free.
  const workKinds: Piece[] = ['timber', 'rust', 'black-rock', 'timber', 'rust', 'ice'];
  for (let cluster = 0; cluster < 12; cluster++) {
    const angle = .23 + cluster * tau / 12;
    const radius = 11.5 + (cluster % 3) * 1.35;
    for (let part = 0; part < 2; part++) {
      const offsetAngle = angle + (part === 0 ? -.08 : .08);
      const localE = radius * Math.sin(offsetAngle);
      const localN = radius * Math.cos(offsetAngle);
      add(workKinds[(cluster + part) % workKinds.length]!, 'floor',
        'old-work-' + String(cluster + 1).padStart(2, '0'),
        originE + localE * c + localN * s, originN + localN * c - localE * s,
        angle + yaw, .83);
    }
  }

  const batches: string[] = [];
  for (const [key, parts] of stamps) {
    if (!parts.length) continue;
    const kind = key.split(':')[1] as Piece;
    const batch = new InstancedMesh(geometry[kind], materials[kind], parts.length);
    batch.name = 'za36-dressing-' + key;
    parts.forEach((part, index) => batch.setMatrixAt(index, part.matrix));
    batch.computeBoundingSphere();
    group.add(batch);
    batches.push(key);
  }
  return { group, placements, batches };
}
