import {
  BoxGeometry, Color, DataTexture, Group, InstancedMesh, MeshLambertMaterial,
  NearestFilter, Object3D, RGBAFormat, SRGBColorSpace, StaticDrawUsage,
} from 'three';
import { secondMineDrySites, secondMineDryWings } from '../../../src/shared/underground-second-mine-dry-wings.js';
import {
  c2SecondMineBoxAllowed, c2SecondMineZones, type C2SecondMineBox,
} from './town-c2-second-mine-contract.js';

export type SecondMineUpperReliefFamily = 'rock' | 'basalt' | 'rust';
export type SecondMineUpperReliefZone = 'upper-west' | 'upper-east';
export type SecondMineUpperReliefRole = 'wall' | 'ceiling' | 'rubble' | 'stalagmite' | 'stalactite';
export type SecondMineUpperReliefFace = 'outer' | 'end' | 'door' | 'ceiling' | 'floor' | 'spike';

export type SecondMineUpperReliefBox = C2SecondMineBox & Readonly<{
  zone: SecondMineUpperReliefZone;
  family: SecondMineUpperReliefFamily;
  role: SecondMineUpperReliefRole;
  face: SecondMineUpperReliefFace;
}>;

export type SecondMineUpperReliefBuild = Readonly<{
  boxes: readonly SecondMineUpperReliefBox[];
  rejectedCandidates: number;
}>;

type ZoneSpec = Readonly<{
  id: SecondMineUpperReliefZone;
  x0: number; x1: number; n0: number; n1: number; ceiling: number;
  outerSide: -1 | 1;
  doorSide: -1 | 1;
  workface: Readonly<{ east: number; north: number }>;
}>;

const familyOrder: readonly SecondMineUpperReliefFamily[] = ['rock', 'basalt', 'rust'];
const roleOrder: readonly SecondMineUpperReliefRole[] = ['wall', 'ceiling', 'rubble', 'stalagmite', 'stalactite'];
const zoneOrder: readonly SecondMineUpperReliefZone[] = ['upper-west', 'upper-east'];
const palette = Object.freeze({
  rock: Object.freeze([0x555b62, 0x69717a, 0x3c434b]),
  basalt: Object.freeze([0x353b44, 0x4b535e, 0x242a32]),
  rust: Object.freeze([0x815b44, 0xa37552, 0x573d32]),
});

function requiredWing(id: 'west-workface' | 'east-workface') {
  const wing = secondMineDryWings.find(room => room.id === id);
  if (!wing) throw new RangeError(`C2 upper relief lacks surveyed ${id}`);
  return wing;
}

const zones: readonly ZoneSpec[] = Object.freeze([
  Object.freeze({
    id: 'upper-west', ...c2SecondMineZones.upperWest, ceiling: requiredWing('west-workface').ceiling,
    outerSide: -1, doorSide: 1, workface: secondMineDrySites.workfaceWest,
  }),
  Object.freeze({
    id: 'upper-east', ...c2SecondMineZones.upperEast, ceiling: requiredWing('east-workface').ceiling,
    outerSide: 1, doorSide: -1, workface: secondMineDrySites.workfaceEast,
  }),
]);

function hash(east: number, north: number, salt: number) {
  let value = Math.imul(Math.round(east * 100), 374761393) + Math.imul(Math.round(north * 100), 668265263);
  value = Math.imul(value ^ (salt * 0x45d9f3b), 1274126177);
  return (value ^ (value >>> 16)) >>> 0;
}

function random(east: number, north: number, salt: number) {
  return hash(east, north, salt) / 0x100000000;
}

function familyAt(east: number, north: number, salt: number): SecondMineUpperReliefFamily {
  const value = hash(east, north, salt) % 10;
  return value < 3 ? 'rock' : value < 7 ? 'basalt' : 'rust';
}

/** Pure, deterministic candidate layout. Every retained box is checked by the C2 visual contract. */
export function buildSecondMineUpperRelief(): SecondMineUpperReliefBuild {
  const boxes: SecondMineUpperReliefBox[] = [];
  let rejectedCandidates = 0;

  function add(zone: ZoneSpec, family: SecondMineUpperReliefFamily,
    role: SecondMineUpperReliefRole, face: SecondMineUpperReliefFace,
    x: number, n: number, y: number, w: number, d: number, h: number) {
    const box: SecondMineUpperReliefBox = { zone: zone.id, family, role, face, x, n, y, w, d, h };
    const insideZone = x - w / 2 >= zone.x0 - 1e-9 && x + w / 2 <= zone.x1 + 1e-9 &&
      n - d / 2 >= zone.n0 - 1e-9 && n + d / 2 <= zone.n1 + 1e-9;
    if (!insideZone || !c2SecondMineBoxAllowed(box)) {
      rejectedCandidates++;
      return;
    }
    boxes.push(box);
  }

  function wallRun(zone: ZoneSpec, face: 'outer' | 'end' | 'door', along: 'x' | 'n',
    fixed: number, start: number, end: number) {
    const step = 1.08;
    for (let cursor = start, column = 0; cursor < end - .05; cursor += step, column++) {
      const length = Math.min(step + .05, end - cursor);
      const middle = cursor + length / 2;
      const thickness = .56 + random(middle, fixed, 11 + column) * .52;
      const inward = face === 'outer' ? -zone.outerSide : face === 'door' ? -zone.doorSide :
        fixed === zone.n0 ? 1 : -1;
      const fixedCentre = fixed + inward * (thickness / 2 + .04);
      const x = along === 'n' ? fixedCentre : middle;
      const n = along === 'n' ? middle : fixedCentre;
      const w = along === 'n' ? thickness : length;
      const d = along === 'n' ? length : thickness;
      const base = face === 'door' ? 3.38 : .08 + (column % 3) * .13;
      for (let y = base, tier = 0; y < zone.ceiling - .12; y += .72, tier++) {
        const h = Math.min(.58 + random(x, n, 31 + tier) * .31, zone.ceiling - y);
        add(zone, familyAt(x, n, 41 + tier), 'wall', face, x, n, y + h / 2, w, d, h);
      }
      // Projecting footing stones break the original planar wall into abrupt voxel terraces.
      if (column % 3 === 1) {
        const extra = .36 + random(x, n, 71) * .38;
        const bx = along === 'n' ? x + inward * extra / 2 : x;
        const bn = along === 'n' ? n : n + inward * extra / 2;
        add(zone, familyAt(bx, bn, 73), 'wall', face, bx, bn, .34,
          along === 'n' ? w + extra : w, along === 'n' ? d : d + extra, .62);
      }
    }
  }

  function ceilingCell(zone: ZoneSpec, x: number, n: number, w: number, d: number, salt: number) {
    const edgeDistance = Math.min(x - zone.x0, zone.x1 - x, n - zone.n0, zone.n1 - n);
    const depth = .40 + random(x, n, salt) * .62 + (edgeDistance < 1.45 ? .30 : 0);
    const family = familyAt(x, n, salt + 5);
    add(zone, family, 'ceiling', 'ceiling', x, n, zone.ceiling - depth / 2, w, d, depth);
    if (hash(x, n, salt + 9) % 3 === 0) {
      const drop = .32 + random(x, n, salt + 13) * .48;
      const lowerW = w * (.48 + random(x, n, salt + 17) * .22);
      const lowerD = d * (.48 + random(x, n, salt + 19) * .22);
      add(zone, familyAt(x, n, salt + 23), 'ceiling', 'ceiling', x + (hash(x, n, salt) % 2 ? .12 : -.12), n,
        zone.ceiling - depth - drop / 2, lowerW, lowerD, drop);
    }
  }

  function spike(zone: ZoneSpec, x: number, n: number, salt: number, hanging: boolean) {
    const count = 2 + Math.floor(random(x, n, salt) * 2);
    const height = (hanging ? .88 : .58) + random(x, n, salt + 1) * (hanging ? .86 : 1.04);
    const baseWidth = .44 + random(x, n, salt + 2) * .34;
    let consumed = 0;
    const weightTotal = Array.from({ length: count }, (_, index) => 1 + index * .12)
      .reduce((sum, weight) => sum + weight, 0);
    for (let index = 0; index < count; index++) {
      const h = height * (1 + index * .12) / weightTotal;
      const width = Math.max(.16, baseWidth * (1 - index / (count + .35)));
      const family = familyAt(x, n, salt + index * 7);
      if (hanging) {
        const top = zone.ceiling - consumed;
        add(zone, family, 'stalactite', 'spike', x, n, top - h / 2, width, width, h);
      } else {
        add(zone, family, 'stalagmite', 'spike', x, n, .025 + consumed + h / 2, width, width, h);
      }
      consumed += h;
    }
  }

  for (const zone of zones) {
    const outerX = zone.outerSide === -1 ? zone.x0 : zone.x1;
    const doorX = zone.doorSide === -1 ? zone.x0 : zone.x1;
    wallRun(zone, 'outer', 'n', outerX, zone.n0 + .18, zone.n1 - .18);
    wallRun(zone, 'door', 'n', doorX, zone.n0 + .18, zone.n1 - .18);
    wallRun(zone, 'end', 'x', zone.n0, zone.x0 + .20, zone.x1 - .20);
    wallRun(zone, 'end', 'x', zone.n1, zone.x0 + .20, zone.x1 - .20);

    // A dense, uneven ceiling mosaic replaces the broad flat slab without moving its datum.
    for (let x = zone.x0 + .72; x < zone.x1 - .45; x += 1.34) {
      for (let n = zone.n0 + .72; n < zone.n1 - .45; n += 1.34) {
        ceilingCell(zone, x, n, 1.27, 1.27, 101);
      }
    }
    // Tighten the visual ring around, never over, the reserved workface centre.
    for (let index = 0; index < 18; index++) {
      const angle = index * Math.PI * 2 / 18;
      ceilingCell(zone, zone.workface.east + Math.cos(angle) * 2.58,
        zone.workface.north + Math.sin(angle) * 2.58, .72, .72, 211);
    }

    // Broken floor slabs hug the perimeter; they are artwork, not support or collider edits.
    const floorBand = (along: 'x' | 'n', fixed: number, start: number, end: number, inward: number) => {
      for (let cursor = start, index = 0; cursor < end; cursor += 1.38, index++) {
        const middle = cursor + .62;
        const offset = .72 + random(middle, fixed, 307 + index) * .44;
        const x = along === 'n' ? fixed + inward * offset : middle;
        const n = along === 'n' ? middle : fixed + inward * offset;
        const w = .42 + random(x, n, 311) * .39;
        const d = .42 + random(x, n, 313) * .42;
        const h = .15 + random(x, n, 317) * .25;
        add(zone, familyAt(x, n, 319), 'rubble', 'floor', x, n, .018 + h / 2, w, d, h);
        if (index % 2 === 0) add(zone, familyAt(x, n, 331), 'rubble', 'floor',
          x + inward * .28, n + .16, .075, w * 1.18, .11, d * 1.12);
      }
    };
    floorBand('n', outerX, zone.n0 + .55, zone.n1 - .55, -zone.outerSide);
    floorBand('n', doorX, zone.n0 + .55, zone.n1 - .55, -zone.doorSide);
    floorBand('x', zone.n0, zone.x0 + .65, zone.x1 - .65, 1);
    floorBand('x', zone.n1, zone.x0 + .65, zone.x1 - .65, -1);

    for (let n = zone.n0 + 1.9, index = 0; n < zone.n1 - 1.2; n += 3.15, index++) {
      const x = outerX - zone.outerSide * (1.02 + random(n, outerX, 401 + index) * .42);
      spike(zone, x, n, 409 + index, false);
      spike(zone, x + (hash(n, x, 419) % 2 ? .32 : -.32), n + .28, 431 + index, true);
    }
    for (let x = zone.x0 + 2.1, index = 0; x < zone.x1 - 1.4; x += 3.65, index++) {
      for (const [wallN, inward] of [[zone.n0, 1], [zone.n1, -1]] as const) {
        const n = wallN + inward * (1.02 + random(x, wallN, 457 + index) * .38);
        spike(zone, x, n, 467 + index, false);
        spike(zone, x + .24, n - inward * .24, 487 + index, true);
      }
    }
    // Sparse upper-door teeth leave the entire low doorway strip open.
    for (let n = zone.n0 + 2.2, index = 0; n < zone.n1 - 1.5; n += 3.4, index++) {
      spike(zone, doorX - zone.doorSide * .94, n, 509 + index, true);
    }
  }

  for (const zone of zones) {
    for (const role of roleOrder) {
      if (!boxes.some(box => box.zone === zone.id && box.role === role)) {
        throw new RangeError(`C2 upper relief lost ${zone.id} ${role} density`);
      }
    }
  }
  return Object.freeze({ boxes: Object.freeze(boxes.map(box => Object.freeze(box))), rejectedCandidates });
}

function counts<T extends string>(items: readonly T[], order: readonly T[]) {
  const result = Object.fromEntries(order.map(key => [key, 0])) as Record<T, number>;
  for (const item of items) result[item]++;
  return result;
}

export type SecondMineUpperReliefStats = Readonly<{
  voxelCount: number;
  triangles: number;
  drawCount: number;
  materialFamilies: number;
  materialFamilyCounts: Readonly<Record<SecondMineUpperReliefFamily, number>>;
  roleCounts: Readonly<Record<SecondMineUpperReliefRole, number>>;
  zoneCounts: Readonly<Record<SecondMineUpperReliefZone, number>>;
  wallFacadeAreaM2: Readonly<Record<SecondMineUpperReliefZone, number>>;
  rejectedCandidates: number;
  colliders: number;
  floorChanges: number;
  rewards: number;
  disposed: boolean;
}>;

function statsFor(data: SecondMineUpperReliefBuild, disposed: boolean): SecondMineUpperReliefStats {
  const wallFacadeAreaM2 = Object.fromEntries(zoneOrder.map(id => [id, 0])) as Record<SecondMineUpperReliefZone, number>;
  for (const box of data.boxes) {
    if (box.role !== 'wall') continue;
    wallFacadeAreaM2[box.zone] += (box.face === 'door' ? box.d : box.face === 'outer' ? box.d : box.w) * box.h;
  }
  return Object.freeze({
    voxelCount: data.boxes.length,
    triangles: data.boxes.length * 12,
    drawCount: familyOrder.length,
    materialFamilies: familyOrder.length,
    materialFamilyCounts: Object.freeze(counts(data.boxes.map(box => box.family), familyOrder)),
    roleCounts: Object.freeze(counts(data.boxes.map(box => box.role), roleOrder)),
    zoneCounts: Object.freeze(counts(data.boxes.map(box => box.zone), zoneOrder)),
    wallFacadeAreaM2: Object.freeze(wallFacadeAreaM2),
    rejectedCandidates: data.rejectedCandidates,
    colliders: 0,
    floorChanges: 0,
    rewards: 0,
    disposed,
  });
}

function pixelTexture(family: SecondMineUpperReliefFamily): DataTexture {
  const [base, highlight, shadow] = palette[family];
  const size = 16;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const crack = ((x * 7 + y * 11) % 19 < 2) || (x % 8 === 3 && y > 3 && y < 12);
    const facet = (Math.floor(x / 3) * 5 + Math.floor(y / 4) * 7) % 11 < 3;
    const fleck = family === 'rust' && (x * 13 + y * 3) % 17 < 3;
    const color = crack ? shadow : fleck ? highlight : facet ? highlight : base;
    pixels.set([color >> 16, (color >> 8) & 255, color & 255, 255], (y * size + x) * 4);
  }
  const texture = new DataTexture(pixels, size, size, RGBAFormat);
  texture.magFilter = texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** Local-coordinate visual overlay. It deliberately exposes no floor, passage, collision or reward authority. */
export function createSecondMineUpperRelief() {
  const data = buildSecondMineUpperRelief();
  const group = new Group();
  group.name = 'town-c2-second-mine-upper-relief';
  const geometry = new BoxGeometry(1, 1, 1);
  const transform = new Object3D();
  const tint = new Color();
  const meshes: InstancedMesh[] = [];
  const materials: MeshLambertMaterial[] = [];
  const textures: DataTexture[] = [];
  let night = false;
  let disposed = false;

  for (const [familyIndex, family] of familyOrder.entries()) {
    const members = data.boxes.filter(box => box.family === family);
    const texture = pixelTexture(family);
    const material = new MeshLambertMaterial({
      map: texture, flatShading: true,
      ...(family === 'rust' ? { emissive: new Color(0x5b2d18), emissiveIntensity: 0 } : {}),
    });
    material.userData.materialFamily = family;
    const mesh = new InstancedMesh(geometry, material, members.length);
    mesh.name = `town-c2/second-mine-upper-relief/${family}`;
    for (const [index, box] of members.entries()) {
      transform.position.set(box.x, box.y, -box.n);
      transform.scale.set(box.w, box.h, box.d);
      transform.rotation.set(0, 0, 0);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
      const variation = .91 + random(box.x, box.n, familyIndex * 37 + 601) * .16;
      mesh.setColorAt(index, tint.setRGB(variation, variation, variation));
    }
    mesh.instanceMatrix.setUsage(StaticDrawUsage);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    meshes.push(mesh);
    materials.push(material);
    textures.push(texture);
  }
  group.userData.upperReliefStats = statsFor(data, false);

  return {
    group,
    meshes,
    boxes: data.boxes,
    setNight(value: boolean) {
      if (disposed) return;
      const nextNight = !!value;
      if (night === nextNight) return;
      night = nextNight;
      for (const material of materials) {
        if (material.userData.materialFamily === 'rust') material.emissiveIntensity = night ? .16 : 0;
      }
    },
    stats(): SecondMineUpperReliefStats { return statsFor(data, disposed); },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      for (const mesh of meshes) mesh.dispose();
      for (const material of materials) material.dispose();
      for (const texture of textures) texture.dispose();
      geometry.dispose();
      group.clear();
      group.userData.upperReliefStats = statsFor(data, true);
    },
  };
}

export const buildTownC2SecondMineUpperRelief = buildSecondMineUpperRelief;
export const createTownC2SecondMineUpperRelief = createSecondMineUpperRelief;
