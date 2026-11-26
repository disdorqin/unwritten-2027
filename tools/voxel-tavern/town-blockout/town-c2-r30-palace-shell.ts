import { BoxGeometry, Color, CylinderGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshLambertMaterial } from 'three';
import { c2R30DeepMouths, type C2R30DeepMouth } from './town-c2-r30-deep-mouths.js';

type PalacePoint = readonly [east: number, north: number];
type Room = readonly [west: number, east: number, south: number, north: number, height: number];
type Solid = readonly [east: number, floor: number, north: number, width: number, height: number, depth: number];

export type C2R30PalacePassage = Readonly<{ floor: number; clearance: number }>;

export type C2R30PalaceShell = Readonly<{
  group: Group;
  floorAt(east: number, north: number): number | undefined;
  canStand(east: number, north: number, radius?: number, height?: number): boolean;
  passageLocal(east: number, north: number, radius?: number, height?: number): C2R30PalacePassage | undefined;
  acceptsMouth(mouth: unknown): boolean;
  route: readonly PalacePoint[];
  cover: readonly Readonly<{ arc: 'inner' | 'outer'; east: number; north: number }>[];
  dispose(): void;
}>;

const stairsEnd = 16;
const stairRise = .15;
const palaceFloor = -stairsEnd * stairRise;
const arenaHeight = 13;
const geometryEpsilon = 1e-9;
const sourceBlob = '9ab161e8691ea32662f389527ebb57f1d3fe0947';

// E/N/Y are local metres. The host supplies the U-4 threshold transform.
// The vault opening is a reservation for U-5, with a blind backing wall in this shell.
export const c2R30PalacePlan = {
  entry: { east: 0, north: .5, height: 0 },
  arena: { centre: [0, 126], radius: 22, floor: palaceFloor },
  vaultOpening: { east: 0, north: 126, floor: palaceFloor, width: 7.2, height: 9 },
  guardianReserve: { east: 0, north: 123, height: palaceFloor },
  fireReserve: { east: -2.6, north: 100.8, height: palaceFloor },
  columnBaseHeight: .95,
  colonnadeHeight: 9,
} as const;

const rooms = [
  [-4, 4, 0, stairsEnd, 7],
  [-8, 8, stairsEnd, 52, 11],
  [3, 14, 48, 52, 7],
  [10, 14, 48, 66, 7],
  [0, 14, 62, 68, 8],
  [-15, 15, 66, 96, 16],
  [-4, 4, 96, 108, 8],
] as const satisfies readonly Room[];

const route = [
  [0, .5], [0, 8.5], [0, 17], [0, 38], [0, 50], [12, 50],
  [12, 64], [8, 64], [8, 74], [8, 89], [0, 93], [0, 101.5], [0, 112], [0, 125.4],
] as const satisfies readonly PalacePoint[];

const arena = c2R30PalacePlan.arena;
const palette = ['#38404b', '#424957', '#4b5160', '#555b66', '#626570', '#747681'] as const;

function roomAt(east: number, north: number) {
  return rooms.find(([left, right, behind, ahead]) => east >= left && east <= right && north >= behind && north <= ahead);
}

function inArena(east: number, north: number) {
  return north <= arena.centre[1] && Math.hypot(east - arena.centre[0], north - arena.centre[1]) <= arena.radius;
}

function floorAt(east: number, north: number) {
  if (!roomAt(east, north) && !inArena(east, north)) return;
  return north < 1 ? 0 : -Math.min(Math.floor(north), stairsEnd) * stairRise;
}

function solidDistance(solid: Solid, east: number, north: number) {
  const [e, , n, width, , depth] = solid;
  const dx = Math.max(0, Math.abs(e - east) - width / 2);
  const dn = Math.max(0, Math.abs(n - north) - depth / 2);
  return Math.hypot(dx, dn);
}

function circleTouches(solid: Solid, east: number, north: number, radius: number) {
  return solidDistance(solid, east, north) <= radius + geometryEpsilon;
}

function rectangleCovered(solids: readonly Solid[], left: number, right: number, bottom: number, top: number) {
  const xs = [...new Set([left, right, ...solids.flatMap(([e, , , width]) => {
    const min = Math.max(left, e - width / 2), max = Math.min(right, e + width / 2);
    return min <= max ? [min, max] : [];
  })])].sort((a, b) => a - b);
  const ys = [...new Set([bottom, top, ...solids.flatMap(([, floor, , , height]) => {
    const min = Math.max(bottom, floor), max = Math.min(top, floor + height);
    return min <= max ? [min, max] : [];
  })])].sort((a, b) => a - b);
  for (let x = 0; x < xs.length - 1; x++) for (let y = 0; y < ys.length - 1; y++) {
    const east = (xs[x]! + xs[x + 1]!) / 2;
    const height = (ys[y]! + ys[y + 1]!) / 2;
    if (!solids.some(([e, floor, , width, blockHeight]) =>
      Math.abs(e - east) <= width / 2 + geometryEpsilon &&
      height >= floor - geometryEpsilon && height <= floor + blockHeight + geometryEpsilon)) return false;
  }
  return true;
}

export function createTownC2R30PalaceShell(): C2R30PalaceShell {
  const group = new Group();
  group.name = 'town-c2-r30-palace-shell';
  group.userData.sourceBlob = sourceBlob;
  group.userData.owner = 'C2-R04';
  group.userData.coordinateFrame = 'palace-shell-local-east-height-north';
  const blocks: { solid: Solid; color: string }[] = [];
  const blockers: Solid[] = [];
  const cover = ([
    { arc: 'inner', distance: 9, angles: [-.86, -.30, .65] },
    { arc: 'outer', distance: 16, angles: [-1.04, .18, .96] },
  ] as const).flatMap(({ arc, distance, angles }) => angles.map(angle => ({
    arc, east: Math.sin(angle) * distance, north: arena.centre[1] - Math.cos(angle) * distance,
  })));

  function block(solid: Solid, color: string, stopsWalking = false) {
    blocks.push({ solid, color });
    if (stopsWalking) blockers.push(solid);
  }

  // 1 m stone courses share the plan and datum used by the walking sampler.
  for (let n = 0; n < arena.centre[1]; n++) {
    for (let e = -arena.radius; e < arena.radius; e++) {
      const east = e + .5;
      const north = n + .5;
      const floor = floorAt(east, north);
      if (floor === undefined) continue;
      block([east, floor - .24, north, 1, .24, 1], palette[(e * e + n * 3) % 3]!);
      const height = roomAt(east, north)?.[4] ?? arenaHeight;
      block([east, floor + height, north, 1, .28, 1], palette[(e * e + n) % 3]!);
      for (const [dx, dn] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const wallNorth = north + dn / 2;
        if (floorAt(east + dx, north + dn) !== undefined || wallNorth === 0 ||
            (wallNorth === arena.centre[1] && Math.abs(east) < c2R30PalacePlan.vaultOpening.width / 2)) continue;
        const tint = (e * e + n + (dx === 0 ? 2 : 0)) % 3;
        block([east + dx * .74, floor, north + dn * .74, dx ? .48 : 1, height, dn ? .48 : 1], palette[tint]!, true);
        for (const course of [1.05, height - .65]) {
          block([east + dx * .535, floor + course, north + dn * .535, dx ? .09 : 1, .16, dn ? .09 : 1],
            palette[tint + 2]!);
        }
      }
    }
  }

  // The receiving wall occupies N0. Its 44 collidable courses leave exactly
  // E[-1.7,1.7] clear below Y3.24; the original N0 skip cannot create air wall.
  const entryWall: Solid[] = [];
  for (const [side, left, right] of [[-1, -4, -1.7], [1, 1.7, 4]] as const) {
    const width = (right - left) / 2;
    for (let column = 0; column < 2; column++) for (let row = 0; row < 7; row++) {
      const solid: Solid = [left + (column + .5) * width, row, 0, width, 1, .48] as const;
      block(solid, palette[(column + row + (side + 1)) % 3]!, true);
      entryWall.push(solid);
    }
  }
  const mouth = c2R30DeepMouths['minus165-to-minus190'].to;
  const lintelHeight = 7 - mouth.height;
  for (let column = 0; column < 4; column++) for (let row = 0; row < 4; row++) {
    const solid: Solid = [-mouth.width / 2 + (column + .5) * mouth.width / 4,
      mouth.height + row * lintelHeight / 4, 0, mouth.width / 4, lintelHeight / 4, .48] as const;
    block(solid, palette[(column + row + 1) % 3]!, true);
    entryWall.push(solid);
  }

  for (let n = 0; n < stairsEnd; n++) {
    for (const e of [-.85, .85]) block([e, -n * stairRise, n + .54, .12, .01, .85], '#303844');
  }
  for (const e of [-3.0, 3.0]) {
    for (const n of [3.6, 8.5, 13.1]) {
      block([e, floorAt(e, n)!, n, 1.24, .42, 1.25], palette[3], true);
      block([e - Math.sign(e) * .38, floorAt(e, n + .9)!, n + .9, .62, .35, 1.27], palette[2], true);
    }
  }

  // Paired columns end at the fall. The only continuation bends through the east passage.
  for (const e of [-5.5, 5.5]) {
    for (const n of [20, 25, 30, 35, 40, 45]) {
      block([e, palaceFloor, n, 1.5, .65, 1.5], palette[4], true);
      block([e, palaceFloor + .65, n, 1.06, 7.75, 1.06], palette[2], true);
      block([e, palaceFloor + 8.4, n, 1.5, .6, 1.5], palette[3], true);
    }
    block([e, palaceFloor + c2R30PalacePlan.colonnadeHeight, 33, .9, .6, 30], palette[3]);
  }
  for (let i = 0; i < 10; i++) {
    const e = -7.2 + i * 1.55;
    block([e, palaceFloor, 51.6, 1.5, 2.3 + (i % 4) * .64, 1.6], palette[(i % 3) + 1]!, true);
  }
  for (let i = 0; i < 9; i++) {
    const tint = i % 3;
    block([14.04, palaceFloor + .4 + tint, 55.5 + i * .42, .08, 2.7 + (i % 5) * .31, .55],
      ['#34343b', '#30333b', '#3b3a40'][tint]!);
  }

  // The dais is empty. Its slab and older inset are structural geometry only.
  block([0, palaceFloor, 81, 8.4, .32, 6.8], palette[3], true);
  block([0, palaceFloor + .32, 81, 7.4, .38, 5.8], palette[4], true);
  block([0, palaceFloor + .70, 81, 6.5, .38, 5.0], palette[4], true);
  block([0, palaceFloor + 1.08, 81, 3.9, .014, 2.1], '#85838a');
  for (const e of [-13, 13]) for (const n of [71, 82, 93]) {
    block([e, palaceFloor, n, 1.9, .6, 1.9], palette[4], true);
    block([e, palaceFloor + .6, n, 1.4, 12.6, 1.4], palette[2], true);
  }
  block([2.55, palaceFloor, 101, .75, 1.85, .46], palette[4], true);
  block([2.55, palaceFloor, 101, 1.1, .24, .78], palette[2], true);

  for (const [index, { east, north }] of cover.entries()) {
    block([east, palaceFloor, north, 1.6, c2R30PalacePlan.columnBaseHeight, 1.6], palette[4], true);
    block([east, palaceFloor + c2R30PalacePlan.columnBaseHeight, north, 1.13, 1.55 + index % 3 * .5, 1.13], palette[2], true);
    block([east - .08, palaceFloor + 2.45 + index % 3 * .5, north + .08, .72, .34, .85], palette[3], true);
  }
  const opening = c2R30PalacePlan.vaultOpening;
  for (const e of [-4.2, 4.2]) {
    block([e, palaceFloor, opening.north - .1, 1.2, opening.height + .95, 1.08], palette[4], true);
  }
  block([0, palaceFloor + opening.height, opening.north - .1, 9.6, 1.05, 1.08], palette[4]);
  block([0, palaceFloor, opening.north + .74, opening.width, opening.height, .36], '#252b36');

  const geometry = new BoxGeometry(1, 1, 1);
  const material = new MeshLambertMaterial();
  const mesh = new InstancedMesh(geometry, material, blocks.length);
  mesh.name = 'palace-masonry';
  const pose = new Matrix4();
  const tint = new Color();
  for (const [index, { solid: [e, floor, n, w, h, d], color }] of blocks.entries()) {
    pose.makeScale(w, h, d).setPosition(e, floor + h / 2, -n);
    mesh.setMatrixAt(index, pose);
    mesh.setColorAt(index, tint.set(color));
  }
  mesh.computeBoundingSphere();
  group.add(mesh);
  // The exact semicircle supports the irregular last cells of the tiled edge.
  const apronGeometry = new CylinderGeometry(arena.radius + .004, arena.radius + .004, .24, 128, 1, false, -Math.PI / 2, Math.PI);
  const apronMaterial = new MeshLambertMaterial({ color: palette[1] });
  const apron = new Mesh(apronGeometry, apronMaterial);
  apron.name = 'vault-forecourt-slab';
  apron.position.set(0, palaceFloor - .122, -arena.centre[1]);
  group.add(apron);

  function supportAt(east: number, north: number, radius: number) {
    const floor = floorAt(east, north);
    if (floor === undefined) return;
    let supportFloor = floor;
    for (let index = 0; radius > 0 && index < 64; index++) {
      const angle = Math.PI * index / 32;
      const sample = floorAt(east + Math.cos(angle) * radius, north + Math.sin(angle) * radius);
      if (sample === undefined) return;
      supportFloor = Math.max(supportFloor, sample);
    }
    return { floor, supportFloor };
  }

  function passageLocal(east: number, north: number, radius = .27, height = 1.8): C2R30PalacePassage | undefined {
    if (disposed || ![east, north, radius, height].every(Number.isFinite) || radius < 0 || height <= 0) return;
    const support = supportAt(east, north, radius);
    if (!support) return;
    const { floor, supportFloor } = support;
    for (const solid of blockers) {
      const bottom = solid[1], top = bottom + solid[4];
      if (top <= floor + geometryEpsilon || bottom >= floor + height - geometryEpsilon) continue;
      if (circleTouches(solid, east, north, radius)) return;
    }
    let clearance = Infinity;
    for (const { solid } of blocks) {
      const bottom = solid[1], top = bottom + solid[4];
      // Floor courses up to the highest supported step are walking surfaces,
      // not headroom; every other visible top/bottom remains authoritative.
      if (top <= supportFloor + geometryEpsilon || bottom <= floor + geometryEpsilon ||
          !circleTouches(solid, east, north, radius)) continue;
      clearance = Math.min(clearance, bottom - floor);
    }
    const apronTop = apron.position.y + .24 / 2;
    if (apronTop > supportFloor + geometryEpsilon &&
        Math.hypot(east, north - arena.centre[1]) <= arena.radius + radius + geometryEpsilon) {
      clearance = Math.min(clearance, apronTop - floor);
    }
    return clearance + geometryEpsilon >= height ? { floor, clearance } : undefined;
  }

  function canStand(east: number, north: number, radius = .27, height = 1.8) {
    return passageLocal(east, north, radius, height) !== undefined;
  }

  function matchesMouth(value: unknown): value is C2R30DeepMouth {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<C2R30DeepMouth>;
    return candidate.layer === mouth.layer && candidate.axis === mouth.axis && candidate.at === mouth.at &&
      candidate.centre === mouth.centre && candidate.width === mouth.width && candidate.height === mouth.height;
  }

  function acceptsMouth(value: unknown) {
    if (disposed || !matchesMouth(value)) return false;
    if (entryWall.length !== 44 || entryWall.some(solid =>
      Math.abs(solid[2]) > geometryEpsilon || Math.abs(solid[5] - .48) > geometryEpsilon ||
      solid[1] < -geometryEpsilon || solid[1] + solid[4] > 7 + geometryEpsilon || !blockers.includes(solid))) return false;
    if (!rectangleCovered(entryWall, -4, -mouth.width / 2, 0, 7) ||
        !rectangleCovered(entryWall, mouth.width / 2, 4, 0, 7) ||
        !rectangleCovered(entryWall, -mouth.width / 2, mouth.width / 2, mouth.height, 7)) return false;
    if (entryWall.some(([east, bottom, , width, height]) =>
      east - width / 2 < mouth.width / 2 - geometryEpsilon &&
      east + width / 2 > -mouth.width / 2 + geometryEpsilon &&
      bottom < mouth.height - geometryEpsilon && bottom + height > geometryEpsilon)) return false;
    const entryPassage = passageLocal(0, .5, .27, mouth.height);
    if (!entryPassage || entryPassage.floor !== 0 ||
        entryPassage.clearance + geometryEpsilon < mouth.height || !canStand(0, .5, .27, 1.8)) return false;
    for (let lateral = -1.65; lateral <= 1.65 + geometryEpsilon; lateral += .06) {
      const passage = passageLocal(lateral, .25, .01, mouth.height);
      if (!passage || passage.floor !== 0 || passage.clearance + geometryEpsilon < mouth.height) return false;
    }
    return !canStand(-2, .25, .05, 1.8) && !canStand(2, .25, .05, 1.8);
  }

  let disposed = false;
  return Object.freeze({
    group, floorAt, canStand, passageLocal, acceptsMouth, route, cover,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.clear();
      mesh.dispose();
      geometry.dispose();
      material.dispose();
      apronGeometry.dispose();
      apronMaterial.dispose();
    },
  });
}
