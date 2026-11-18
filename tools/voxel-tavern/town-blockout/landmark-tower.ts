import { BoxGeometry, Color, DynamicDrawUsage, Group, InstancedMesh, Matrix4, MeshLambertMaterial, PointLight, Quaternion, Vector3 } from 'three';
// The district builder calls this same geometry source for its Voxelize snapshot.
// @ts-expect-error The original JavaScript builder has no declaration file.
import { buildGrandClocktower } from '../build-grand-clocktower.mjs';
import type { Ramp, TownPlot } from './landmark-kit';
import { addTownWindow } from './town-window';

type Vec3 = [number, number, number];
type Bounds = { min: Vec3; max: Vec3 };
type Cuboid = { at: Vec3; size: Vec3; tone: number };
type Box = (kind: string, x: number, y: number, z: number, w?: number, h?: number, d?: number) => void;

export type TowerBellMotion = { strike(strength?: number): void; update(dt: number): void };

const unit32 = 1 / 32;
const hallCeiling = 10.25;
const dialBandStart = 53.5;
const dialBandEnd = 71.625;

/** The entrance and ground floor are anchored. The round dials move as a band. */
export function clocktowerHeight(y: number) {
  const shaft = Math.max(0, Math.min(y, dialBandStart) - hallCeiling);
  const belfryAndSpire = Math.max(0, y - dialBandEnd);
  const lift = (shaft + belfryAndSpire) * 5 / 16;
  return y + Math.round(lift / unit32) * unit32;
}

const colors: Record<string, string> = {
  limestone: '#ac9b87', blueStone: '#526276', ivory: '#d1c3a4', stone: '#766a62',
  paving: '#85919a', paveEdge: '#596975', snowFeather: '#d9e6f4',
  brass: '#b68d4a', bronze: '#ac753c', gold: '#eead49', glow: '#ffc370',
  wood: '#684633', plank: '#8f6646', dark: '#302b34', iron: '#47444c',
  runner: '#8a3737', cloth: '#a92c35', oxblood: '#903341', garnet: '#b42b3b',
  oak: '#a77653', oakEnd: '#bd8960', copper: '#c07743', copperDark: '#80472e',
  wineTile: '#703d4f', teal: '#547783', roofShadow: '#263c60', roofGlaze: '#4b7195', roof: '#365477',
};

export function buildTowerLandmark(plot: TownPlot): Group {
  const tower = new Group();
  let towerHeight = 0;
  const shellParts = new Map<string, Cuboid[]>();
  const interiorParts = new Map<string, Cuboid[]>();
  let parts = shellParts;
  const colliders: Bounds[] = [];
  const floors: Bounds[] = [];
  const ramps: Ramp[] = [];
  const unit = new BoxGeometry(1, 1, 1);
  const matrix = new Matrix4();
  const rotation = new Quaternion();
  const base = new Vector3();
  const sizing = new Vector3();

  const box: Box = (kind, x, y, z, w = 1, h = 1, d = 1) => {
    if (Math.min(w, h, d) <= 0) return;
    const cubes = parts.get(kind) ?? [];
    const tone = .9 + .16 * Math.abs(Math.sin(x * 14.2 + y * 8.3 + z * 95.7));
    const bottom = clocktowerHeight(y);
    const top = clocktowerHeight(y + h);
    towerHeight = Math.max(towerHeight, top);
    cubes.push({ at: [x + w / 2, (bottom + top) / 2, z + d / 2], size: [w, top - bottom, d], tone });
    parts.set(kind, cubes);
  };
  const bounds = (x: number, y: number, z: number, w: number, h: number, d: number): Bounds => ({
    min: [x, clocktowerHeight(y), z],
    max: [x + w, clocktowerHeight(y + h), z + d],
  });
  const solid = (x: number, y: number, z: number, w: number, h: number, d: number) => {
    colliders.push(bounds(x, y, z, w, h, d));
  };
  const floor = (x: number, y: number, z: number, w: number, h: number, d: number) => {
    floors.push(bounds(x, y, z, w, h, d));
  };
  function lamp(b: Box, x: number, y: number, z: number, s = 1) {
    b('glow', x - .23 * s, y, z - .23 * s, .46 * s, .61 * s, .46 * s);
    for (const cap of [-.08, .61]) b('dark', x - .29 * s, y + cap * s, z - .29 * s, .58 * s, .08 * s, .58 * s);
    for (const dx of [-.24, .20]) for (const dz of [-.24, .20]) {
      b('brass', x + dx * s, y, z + dz * s, .045 * s, .61 * s, .045 * s);
    }
  }

  // The original north entrance faces the plaza; the procedural detail feeds the taller shell.
  const windowSill = 1.375;
  const windowLintel = 3.625;
  const windowHalf = .875;
  const oldBox: Box = (kind, x, y, z, w = 1, h = 1, d = 1) => {
    x = -3 - x - w;
    y -= 2;
    z = 37.5 - z - d;
    const oldSlab = w >= 10 && d >= 10 && [10.25, 53, 71, 79.8125].includes(y);
    const oldFurniture = y >= .3125 && y < 5.6 && x >= -4.99 && x + w <= 4.99 && z >= -5 && z + d <= 5;
    const oldBells = y >= 73.125 && y < 79 && Math.max(Math.abs(x), Math.abs(x + w), Math.abs(z), Math.abs(z + d)) < 4.625;
    if (oldSlab || oldFurniture || oldBells) return;
    if (kind === 'limestone' && x === -5.625 && y === .5 && h === 9.75 && d === 11.5) {
      box(kind, x, y, z, w, h, -windowHalf - z);
      box(kind, x, y, windowHalf, w, h, z + d - windowHalf);
      box(kind, x, y, -windowHalf, w, windowSill - y, 2 * windowHalf);
      box(kind, x, windowLintel, -windowHalf, w, y + h - windowLintel, 2 * windowHalf);
    } else if (y >= 87.75 && y < 90.25 && z >= 1.9375 && z < 3.125 && d <= .3125 && x < .75 && x + w > -.75) {
      // The four upper slate courses frame a real lookout slit on the plaza side.
      box(kind, x, y, z, Math.min(w, -.75 - x), h, d);
      box(kind, Math.max(x, .75), y, z, x + w - Math.max(x, .75), h, d);
    } else {
      box(kind, x, y, z, w, h, d);
    }
  };
  buildGrandClocktower({ box: oldBox, beam: oldBox, lantern: (x: number, y: number, z: number) => {
    if (y < 7.5 && z < 41) lamp(box, -3 - x, y - 2, 37.5 - z);
  } });

  // Side wings and entrance surround from B01. The lowest bands are aligned to
  // the plaza-facing plot edge rather than projecting into the footpath.
  const halfWidth = plot.footprint[0] / 2;
  const south = plot.footprint[1] / 2;
  const wingDepth = south - .45;
  for (const side of [-1, 1]) {
    const wing = (kind: string, x: number, y: number, z: number, w: number, h: number, d: number) => {
      box(kind, side > 0 ? x : -x - w, y, z, w, h, d);
    };
    const inner = 5.4;
    const outer = halfWidth - .75;
    const span = outer - inner;
    wing('blueStone', inner, 0, -wingDepth, span + .25, .46, wingDepth * 2);
    wing('ivory', inner, .46, -wingDepth + .12, span, .18, wingDepth * 2 - .24);
    wing('limestone', inner, .64, -wingDepth + .38, span - .15, 8, wingDepth * 2 - .76);
    solid(side > 0 ? inner : -outer, .25, -wingDepth, span, 8.2, wingDepth * 2);
    for (const yy of [1, 7.45, 8.48]) {
      wing(yy === 7.45 ? 'brass' : 'blueStone', inner, yy, wingDepth - .42, span, .24, .45);
    }
    for (const u of [6.85, 10.45, 14.05]) {
      const w = 2.125;
      const y = 2.05;
      const z = wingDepth - .28;
      wing('dark', u, y, z, w, 3.45, .15);
      wing('glow', u + .19, y + .18, z + .16, w - .38, 2.62, .1);
      for (let ring = 0; ring < 5; ring++) {
        const inset = ring * .21;
        wing('dark', u + inset, y + 3.4 + ring * .12, z, w - inset * 2, .12, .15);
        wing('glow', u + inset + .17, y + 2.8 + ring * .12, z + .16, w - inset * 2 - .34, .12, .1);
      }
      wing('brass', u + w / 2 - .06, y + .14, z + .28, .12, 3.24, .08);
      for (const cross of [1.05, 2.07]) wing('dark', u + .14, y + cross, z + .26, w - .28, .105, .1);
      wing('ivory', u - .1, y - .11, z - .2, w + .2, .16, .56);
    }
    for (const u of [5.65, 9.55, 13.08, 16.1]) {
      wing('blueStone', u - .14, .66, wingDepth - .52, .63, .41, .74);
      wing('ivory', u, 1.07, wingDepth - .49, .35, 6.05, .54);
      wing('brass', u - .1, 7.1, wingDepth - .54, .54, .23, .66);
      wing('snowFeather', u - .16, 8.72, wingDepth - .54, .64, .13, .75);
    }
    for (let course = 0; course < 10; course++) {
      const z = wingDepth - course * .65;
      const y = 8.68 + course * .254;
      for (const dz of [z - .65, -z]) {
        wing(course % 3 ? 'roof' : 'roofShadow', inner - .15, y, dz, span + .65, .23, .65);
        for (let x = inner; x < outer; x += .7) {
          if ((Math.round(x * 10) + course) % 4 !== 1) wing('snowFeather', x, y + .23, dz + .035, .65, .12, .56);
        }
      }
    }
    wing('roofGlaze', inner - .1, 11.225, -.18, span + .55, .23, .36);
    for (const y of [1.25, 1.56, 1.87]) {
      wing('blueStone', 5.6, y, wingDepth - .1, .7, .095, .13);
    }

    const x = side * 3.25;
    box('brass', x - .54, 6.75, 6.46, 1.08, .105, .15);
    box('cloth', x - .42, 3.3, 6.51, .84, 3.4, .10);
    for (let j = -2; j <= 2; j++) {
      box('gold', x - .07, 4.48 + j * .165, 6.623, .14, .12, .04);
      if (j) box('gold', x - .07 + j * .12, 4.48, 6.623, .14, .12, .04);
    }
    box('gold', x - .43, 3.3, 6.6, .86, .09, .035);
    lamp(box, side * 4.65, 2.9, 6.4, 1.2);
  }

  // Voussoirs read as an arched surround while staying clear of the open passage.
  for (let i = 0; i <= 20; i++) {
    const a = Math.PI * i / 20;
    const x = 2.43 * Math.cos(a);
    const y = 4.18 + 1.95 * Math.sin(a);
    box(i % 3 ? 'ivory' : 'limestone', x - .125, y, 5.8, .25, .29, .66);
    box('brass', x - .08, y + .31, 6.25, .16, .115, .11);
  }
  for (const x of [-2.53, 2.27]) box('limestone', x, .31, 5.7, .27, 3.87, .76);
  for (let i = 0; i < 3; i++) {
    const h = .105 * (i + 1);
    const z = south - (i + 1) * .39;
    box(i === 2 ? 'ivory' : 'blueStone', -3.35, 0, z, 6.7, h, .39);
    floor(-3.35, 0, z, 6.7, h, .39);
  }
  floor(-6.5, 0, -6.5, 13, .3125, 13);
  floor(-1.875, .3125, 5.25, 3.75, .1875, .4375);
  solid(-5.75, .25, -5.625, 11.5, 10, .625);
  solid(5, .25, -5.75, .625, 10, 11.5);
  solid(-5.75, .25, 5, 3.875, 10, .625);
  solid(1.875, .25, 5, 3.875, 10, .625);
  solid(-5.625, .25, -5.75, .625, 10, 5.75 - windowHalf);
  solid(-5.625, .25, windowHalf, .625, 10, 5.75 - windowHalf);
  solid(-5.625, .25, -windowHalf, .625, windowSill - .25, 2 * windowHalf);
  solid(-5.625, windowLintel, -windowHalf, .625, 10.25 - windowLintel, 2 * windowHalf);
  addTownWindow(tower, {
    x: -5.3125, y: 2.5, z: 0, yaw: -Math.PI / 2, width: 1.75, height: 2.25,
    ground: .3125, approach: [-4, 0], style: 'tavern',
  });
  for (const zz of [-.96875, .875]) box('oak', -5.66, windowSill, zz, .75, 2.25, .09375);
  for (const yy of [windowSill - .09375, windowLintel]) box('oakEnd', -5.71875, yy, -.96875, .8125, .09375, 1.9375);

  function shaftWalls(bottom: number, top: number, inner: number, outer: number) {
    const depth = outer - inner;
    for (const edge of [-outer, inner]) {
      solid(edge, bottom, -outer, depth, top - bottom, outer * 2);
      solid(-inner, bottom, edge, inner * 2, top - bottom, depth);
    }
  }
  shaftWalls(hallCeiling, dialBandStart, 4.5, 5.375);
  shaftWalls(dialBandStart, dialBandEnd, 5, 5.5);
  // The belfry has open arches. Its perimeter guard is aligned with the old iron grilles.
  shaftWalls(71.625, 72.875, 4.875, 5.375);
  // Match the stepped slate shell. Keep the high slot protected by the lookout rail.
  for (let course = 0; course <= 15; course++) {
    const outer = 5.75 - .25 * course;
    shaftWalls(80.875 + course * .625, 81.5 + course * .625, outer - .3125, outer);
  }

  parts = interiorParts;
  const snap = (value: number) => Math.round(value / unit32) * unit32;
  function deck(x0: number, z0: number, x1: number, z1: number, y: number, supportZ = z0) {
    box('wood', x0, y - .25, z0, x1 - x0, .21875, z1 - z0);
    const rows = Math.ceil((x1 - x0) / .375);
    for (let i = 0; i < rows; i++) {
      const a = x0 + .375 * i;
      const b = Math.min(x1, a + .375);
      box(i % 3 === 0 ? 'oakEnd' : 'oak', a, y - unit32, z0, b - a - unit32, unit32, z1 - z0);
    }
    floor(x0, y - .25, supportZ, x1 - x0, .25, z1 - supportZ);
  }

  function guard(x0: number, z0: number, x1: number, z1: number, y: number, endY = y) {
    const alongX = z0 === z1;
    const x = Math.min(x0, x1);
    const z = Math.min(z0, z1);
    const length = Math.hypot(x1 - x0, z1 - z0);
    const w = alongX ? length : .09375;
    const d = alongX ? .09375 : length;
    const offsetX = alongX ? 0 : -.046875;
    const offsetZ = alongX ? -.046875 : 0;
    const yy = Math.min(y, endY);
    const dy = Math.abs(endY - y);
    solid(x + offsetX, yy, z + offsetZ, w, 1.15625 + dy, d);
    const intervals = Math.ceil(length / .34);
    for (let i = 0; i < intervals; i++) {
      const t = (i + .5) / intervals;
      const a = snap(x0 + (x1 - x0) * t);
      const b = snap(z0 + (z1 - z0) * t);
      const height = snap(y + (endY - y) * t);
      const span = snap(length / intervals + .0625);
      box('iron', a - .03125, height + .0625, b - .03125, .0625, 1, .0625);
      box(i % 3 === 0 ? 'oakEnd' : 'oak', a - (alongX ? span : .125) / 2,
        height + 1.03125, b - (alongX ? .125 : span) / 2,
        alongX ? span : .125, .125 + dy / intervals, alongX ? .125 : span);
      box('brass', a - .046875, height + .09375, b - .046875, .09375, unit32, .09375);
    }
  }

  function stairs(x0: number, z0: number, x1: number, z1: number, y: number, rise: number, width: number, count: number, walkRamp = false) {
    const alongX = z0 === z1;
    const length = Math.hypot(x1 - x0, z1 - z0);
    const half = width / 2;
    const at = (i: number) => snap((alongX ? x0 : z0) + ((alongX ? x1 - x0 : z1 - z0) * i) / count);
    const ascending = alongX ? x1 > x0 : z1 > z0;
    if (walkRamp) {
      const volume = bounds(
        alongX ? Math.min(x0, x1) : x0 - half, y,
        alongX ? z0 - half : Math.min(z0, z1),
        alongX ? length : width, count * rise, alongX ? width : length,
      );
      ramps.push({ ...volume, axis: alongX ? 'x' : 'z', ascending: ascending ? 1 : -1 });
    }
    for (let i = 0; i < count; i++) {
      const lo = Math.min(at(i), at(i + 1));
      const depth = Math.abs(at(i + 1) - at(i));
      const tx = alongX ? lo : x0 - half;
      const tz = alongX ? z0 - half : lo;
      const w = alongX ? depth : width;
      const d = alongX ? width : depth;
      const yy = y + (i + 1) * rise;
      box('oak', tx, yy - rise, tz, w, rise, d);
      if (!walkRamp) floor(tx, yy - rise, tz, w, rise, d);
      const edge = ascending ? lo : lo + depth - unit32;
      box('oakEnd', alongX ? edge : tx, yy - unit32, alongX ? tz : edge,
        alongX ? unit32 : w, unit32, alongX ? d : unit32);
      for (const edge of [-half + .09375, half - .09375]) {
        box('wood', alongX ? tx : x0 + edge - .09375, yy - rise - .1875, alongX ? z0 + edge - .09375 : tz,
          alongX ? w : .1875, .1875, alongX ? .1875 : d);
      }
    }
    // Break the sloped rail into short solid spans so the feet can follow the treads.
    const spans = Math.ceil(length / 1.15);
    for (const side of [-1, 1]) {
      for (let i = 0; i < spans; i++) {
        const a = (i + .035) / spans;
        const b = (i + 1 - .035) / spans;
        const x = alongX ? 0 : side * half;
        const z = alongX ? side * half : 0;
        guard(snap(x0 + (x1 - x0) * a) + x, snap(z0 + (z1 - z0) * a) + z,
          snap(x0 + (x1 - x0) * b) + x, snap(z0 + (z1 - z0) * b) + z,
          snap(y + count * rise * a), snap(y + count * rise * b));
      }
    }
  }

  const corner = 3.21875;
  const lane = 2.0625;
  const outer = corner + lane / 2;
  const inner = corner - lane / 2;
  const corners: [number, number][] = [[corner, corner], [corner, -corner], [-corner, -corner], [-corner, corner]];
  const hallY = .3125;
  const riser = .21875;
  const flightRise = 12 * riser;
  const heightAt = (index: number) => hallY + index * flightRise;
  const dialStop = 24;
  const bellStop = 27;
  const spireStop = 31;
  const branchWidth = 1.125;

  for (let i = 0; i <= spireStop; i++) {
    const [x, z] = corners[i % 4];
    const y = heightAt(i);
    if (i > 0) {
      deck(x - lane / 2, z - lane / 2, x + lane / 2, z + lane / 2, y);
      const ex = Math.sign(x) * outer;
      const ez = Math.sign(z) * outer;
      guard(ex, z - lane / 2, ex, z + lane / 2, y);
      guard(x - lane / 2, ez, x + lane / 2, ez, y);
      lamp(box, ex - Math.sign(x) * .25, y + 1.375, ez - Math.sign(z) * .25, .52);
      box('wood', x - lane / 2, y - .4375, z - lane / 2, lane, .1875, .25);
    }
    if (i === spireStop) break;
    const [nx, nz] = corners[(i + 1) % 4];
    const dx = Math.sign(nx - x);
    const dz = Math.sign(nz - z);
    const branch = i === dialStop || i === bellStop ? branchWidth : 0;
    stairs(x + dx * (lane / 2 + branch), z + dz * (lane / 2 + branch),
      nx - dx * lane / 2, nz - dz * lane / 2, y, riser, lane, 12);
  }

  function viewingDeck(y: number, entry: 'east' | 'south') {
    deck(-inner, -inner, inner, inner, y);
    if (entry === 'east') {
      deck(inner, inner - branchWidth, outer, inner, y);
      guard(outer, inner - branchWidth, outer, inner, y);
      guard(inner, -inner, inner, inner - branchWidth, y);
      guard(-inner, inner, inner, inner, y);
    } else {
      deck(-inner, inner, -inner + branchWidth, outer, y);
      guard(-inner, outer, -inner + branchWidth, outer, y);
      guard(inner, -inner, inner, inner, y);
      guard(-inner + branchWidth, inner, inner, inner, y);
    }
    guard(-inner, -inner, -inner, inner, y);
    guard(-inner, -inner, inner, -inner, y);
  }

  const dialY = heightAt(dialStop);
  const bellY = heightAt(bellStop);
  viewingDeck(dialY, 'east');
  viewingDeck(bellY, 'south');

  // The upper flights turn inside the slate roof and end at the plaza-facing lookout.
  const spireY = heightAt(spireStop);
  const upperTurnY = spireY + 14 * riser;
  const lookoutY = upperTurnY + 18 * .1875;
  deck(-outer, 2.0625, -.625, outer, spireY);
  guard(-inner, outer, -.625, outer, spireY);
  guard(-.625, 2.0625, -.625, outer, spireY);
  stairs(-1.4375, 2.0625, -1.4375, -2.15625, spireY, riser, 1.625, 14);
  deck(-2.25, -3, 1.78125, -2.15625, upperTurnY);
  guard(-2.25, -3, 1.78125, -3, upperTurnY);
  guard(-2.25, -3, -2.25, -2.15625, upperTurnY);
  guard(1.78125, -3, 1.78125, -2.15625, upperTurnY);
  guard(-.625, -2.15625, .28125, -2.15625, upperTurnY);
  // The shallow treads at the roof overlap the player's foot radius. A single
  // support slope lets the taller stair retain all eighteen visible treads.
  stairs(1.03125, -2.15625, 1.03125, .8125, upperTurnY, .1875, 1.5, 18, true);
  // Start platform support slightly behind the visual edge, near the ramp crest.
  deck(-1.65625, .8125, 1.78125, 1.8125, lookoutY, 1.03125);
  guard(-1.65625, 1.8125, 1.78125, 1.8125, lookoutY);
  guard(-1.65625, .8125, -1.65625, 1.8125, lookoutY);
  guard(1.78125, .8125, 1.78125, 1.8125, lookoutY);
  guard(-1.65625, .8125, .28125, .8125, lookoutY);

  // A brass nosing, carved wooden joinery and warm lamps follow the tavern palette.
  box('runner', -1.1875, hallY, .75, 2.375, unit32, 4.5);
  for (const x of [-1.15625, 1.125]) box('brass', x, hallY + unit32, .75, unit32, unit32, 4.5);
  for (const z of [-2.6875, 2.6875]) {
    box('wood', -4.25, hallY, z - .59375, .625, .40625, 1.1875);
    box('oak', -4.3125, hallY + .40625, z - .6875, .75, .09375, 1.375);
    box('runner', -4.1875, hallY + .5, z - .5625, .46875, unit32, 1.125);
    solid(-4.3125, hallY, z - .6875, .75, .53125, 1.375);
  }
  for (const x of [-2.625, 2.625]) {
    box('wood', x - .125, .3125, -4.875, .25, 7.75, .25);
    for (let y = .5; y < 7.5; y += 1.25) box('brass', x - .15625, y, -4.90625, .3125, unit32, .3125);
  }

  function pixel(kind: string, x: number, y: number, z: number, width: number, depth: number) {
    box(kind, snap(x - width / 2), snap(y - width / 2), z, width, width, depth);
  }
  function stroke(kind: string, x: number, y: number, z: number, angle: number, length: number, width: number) {
    for (let r = 0; r <= length; r += .09375) {
      pixel(kind, x + Math.sin(angle) * r, y + Math.cos(angle) * r, z, width, .0625);
    }
  }

  // The south dial is double-sided. The inward face exposes its chapter ring and hands.
  const faceY = 65;
  for (let row = -19; row <= 19; row++) {
    const ry = row * .125;
    const span = snap(Math.sqrt(Math.max(0, 2.375 ** 2 - ry ** 2)));
    if (span > 0) box('dark', -span, faceY + ry - .0625, 4.90625, span * 2, .125, .09375);
  }
  for (let tick = 0; tick < 120; tick++) {
    const a = tick * Math.PI / 60;
    pixel('brass', Math.sin(a) * 2.25, faceY + Math.cos(a) * 2.25, 4.875, .125, unit32);
    if (tick % 2) continue;
    const r = tick % 10 === 0 ? 1.96875 : 2.0625;
    pixel('gold', Math.sin(a) * r, faceY + Math.cos(a) * r, 4.84375, tick % 10 ? unit32 : .125, unit32);
  }
  stroke('gold', 0, faceY, 4.8125, -Math.PI / 15, 1.84, .125);
  stroke('copper', 0, faceY, 4.78125, -Math.PI / 3, 1.31, .1875);
  pixel('brass', 0, faceY, 4.75, .21875, .09375);

  function gear(x: number, y: number, z: number, radius: number, teeth: number) {
    for (let tooth = 0; tooth < teeth * 3; tooth++) {
      const a = tooth / (teeth * 3) * Math.PI * 2;
      const outer = radius + (tooth % 3 === 0 ? .0625 : 0);
      pixel(tooth % 3 === 0 ? 'gold' : 'copper', x + Math.sin(a) * outer,
        y + Math.cos(a) * outer, z, .125, .15625);
      if (tooth % 9 === 0) pixel('brass', x + Math.sin(a) * outer, y + Math.cos(a) * outer, z + .15625, unit32, unit32);
    }
    for (let i = 0; i < 6; i++) stroke('bronze', x, y, z + .03125, i * Math.PI / 3, radius, .15625);
    pixel('iron', x, y, z - .15625, .3125, .4375);
    for (const side of [-1, 1]) pixel('brass', x + side * .09375, y, z + .28125, unit32, unit32);
  }
  const gearZ = -.8125;
  box('wood', -1.625, dialY, -1.125, 3.125, .4375, .75);
  box('oakEnd', -1.6875, dialY + .4375, -1.1875, 3.25, .09375, .875);
  for (const x of [-1.4375, 1.3125]) {
    box('wood', x - .09375, dialY + .5, -1.03125, .1875, 2.75, .3125);
    box('brass', x - .125, dialY + 2.40625, -.6875, .25, .25, unit32);
  }
  box('wood', -1.625, dialY + 3.125, -1.125, 3.125, .1875, .5);
  gear(-.625, dialY + 1.375, gearZ, .90625, 28);
  gear(.90625, dialY + 1.625, gearZ + .125, .625, 22);
  gear(.4375, dialY + 2.5625, gearZ + .0625, .46875, 16);
  solid(-1.6875, dialY, -1.1875, 3.25, 2.875, .875);

  function copperRing(y: number, radius: number, height: number, thickness: number, color: string, centerX = 0, centerZ = 0) {
    const slice = .125;
    const hole = Math.max(0, radius - thickness);
    for (let row = -radius; row < radius; row += slice) {
      const distance = row + slice / 2;
      const span = snap(Math.sqrt(Math.max(0, radius ** 2 - distance ** 2)));
      const inner = snap(Math.sqrt(Math.max(0, hole ** 2 - distance ** 2)));
      if (inner === 0) box(color, centerX - span, y, centerZ + row, span * 2, height, slice);
      else for (const side of [-1, 1]) {
        box(color, centerX + (side < 0 ? -span : inner), y, centerZ + row, span - inner, height, slice);
      }
    }
  }
  const bellBase = bellY + 2.53125;
  const bellParts = new Map<string, Cuboid[]>();
  const clapperParts = new Map<string, Cuboid[]>();
  const ropeParts = new Map<string, Cuboid[]>();
  parts = bellParts;
  const profile: [number, number, number, string][] = [
    [0, 1.78125, .09375, 'copper'], [.09375, 1.78125, .125, 'bronze'], [.21875, 1.65625, .28125, 'copperDark'],
    [.5, 1.53125, .3125, 'copper'], [.8125, 1.40625, .375, 'bronze'], [1.1875, 1.3125, .5, 'copper'],
    [1.6875, 1.25, .5625, 'bronze'], [2.25, 1.125, .4375, 'copper'], [2.6875, .96875, .375, 'bronze'],
    [3.0625, .78125, .25, 'copperDark'],
  ];
  for (const [dy, radius, height, color] of profile) copperRing(bellBase + dy, radius, height, dy >= 3 ? radius : .1875, color);
  copperRing(bellBase + .0625, 1.8125, unit32, .1875, 'gold');
  copperRing(bellBase + .21875, 1.6875, unit32, .1875, 'brass');
  for (let i = 0; i < 40; i++) {
    const a = i * Math.PI / 20;
    box('brass', snap(Math.sin(a) * 1.661), bellBase + .3125, snap(Math.cos(a) * 1.661), unit32, .09375, unit32);
  }
  parts = clapperParts;
  box('iron', -.09375, bellBase - .1875, -.09375, .1875, 3.5, .1875);
  box('copperDark', -.21875, bellBase - .4375, -.21875, .4375, .34375, .4375);
  parts = ropeParts;
  box('oakEnd', .86375, bellY + 1.35, .625, .055, 3.65, .055);
  box('brass', .80125, bellY + 1.2, .5625, .18, .20, .18);
  parts = interiorParts;
  box('oak', -2.1875, bellBase + 3.375, -.375, 4.375, .375, .75);
  box('wood', -.28125, bellBase + 3.3125, -2.1875, .5625, .46875, 4.375);
  for (const x of [-1.875, -.25, .25, 1.875]) {
    box('iron', x - .0625, bellBase + 3.25, -.40625, .125, .625, .8125);
    box('gold', x - unit32, bellBase + 3.4375, .40625, .0625, .0625, unit32);
  }
  for (const z of [-2.125, 2.125]) {
    for (const x of [-2.125, 2.125]) {
      box('wood', x - .09375, bellY - .25, z - .09375, .1875, 5.75, .1875);
      box('oakEnd', x - .15625, bellBase + 3.21875, z - .15625, .3125, .28125, .3125);
    }
  }
  // The rail separates the wall-mounted tool board from the walking strip.
  const toolBoard = bellY + 1.5625;
  box('wood', -.90625, toolBoard, -2.28125, 1.8125, 1.09375, .125);
  for (const y of [toolBoard, toolBoard + 1]) box('oakEnd', -.96875, y, -2.21875, 1.9375, .09375, .15625);
  for (const x of [-.671875, -.21875, .21875, .671875]) {
    box('brass', x - .03125, toolBoard + .75, -2.15625, .0625, .0625, .09375);
    box('oak', x - .046875, toolBoard + .1875, -2.125, .09375, .53125, .09375);
  }
  box('iron', -.859375, toolBoard + .65625, -2.09375, .375, .1875, .15625);
  box('bronze', -.4375, toolBoard + .65625, -2.09375, .4375, .0625, .15625);
  box('iron', .125, toolBoard + .125, -2.09375, .1875, .15625, .15625);
  box('iron', .578125, toolBoard + .625, -2.09375, .1875, .21875, .15625);
  box('oakEnd', -2.15625, bellY + 5.28125, 1.6875, .5625, .125, .375);
  box('iron', -1.90625, bellY + 4.1875, 1.84375, .0625, 1.09375, .0625);
  box('brass', -1.96875, bellY + 4.21875, 1.78125, .1875, .09375, .1875);

  for (const [x, y, z, radius] of [[0, dialY + 3.55, 1.875, .75], [-1.875, bellY + 3.75, 1.875, .72], [0, lookoutY + 1.75, -.5, .48]]) {
    lamp(box, x, y, z, radius);
    const light = new PointLight('#ffb778', 68 * radius, 12, 2);
    light.position.set(x, clocktowerHeight(y + .15), z);
    tower.add(light);
  }

  function addBatches(target: Group, components: Map<string, Cuboid[]>) {
    const meshes = new Map<string, [string, Cuboid[]][]>();
    for (const [kind, cubes] of components) {
      const light = kind === 'glow' || kind === 'gold' ? kind : 'opaque';
      const grouped = meshes.get(light);
      if (grouped) grouped.push([kind, cubes]);
      else meshes.set(light, [[kind, cubes]]);
    }
    for (const [light, grouped] of meshes) target.add(createBatch(grouped, light));
  }

  function createBatch(grouped: readonly [string, Cuboid[]][], light: string, origin = new Vector3()) {
    const emissive = light === 'glow' ? '#f59b28' : light === 'gold' ? '#44250d' : '#000000';
    const material = new MeshLambertMaterial({ emissive, emissiveIntensity: light === 'glow' ? .85 : .18 });
    const mesh = new InstancedMesh(unit, material, grouped.reduce((total, [, cubes]) => total + cubes.length, 0));
    const tint = new Color();
    let index = 0;
    for (const [kind, cubes] of grouped) {
      for (const { at, size, tone } of cubes) {
        mesh.setMatrixAt(index, matrix.compose(base.set(...at).sub(origin), rotation, sizing.set(...size)));
        mesh.setColorAt(index, tint.set(colors[kind] ?? colors.limestone).multiplyScalar(tone));
        index++;
      }
    }
    mesh.computeBoundingSphere();
    mesh.name = light;
    return mesh;
  }

  function attachBell(target: Group): TowerBellMotion {
    const pivot = new Group();
    pivot.name = 'Clocktower bell axle';
    pivot.position.set(0, clocktowerHeight(bellBase + 3.375), 0);
    const moving = createBatch([...bellParts, ...clapperParts, ...ropeParts], 'Clocktower moving bell', pivot.position);
    moving.instanceMatrix.setUsage(DynamicDrawUsage);
    // Clapper and rope swing inside this padding while the shell rotates about the axle.
    moving.boundingSphere!.radius += .4;
    pivot.add(moving);
    target.add(pivot);

    const clapper = [new Matrix4(), new Matrix4()];
    const rope = [new Matrix4(), new Matrix4()];
    const clapperStart = moving.count - clapper.length - rope.length;
    const ropeStart = moving.count - rope.length;
    clapper.forEach((rest, i) => moving.getMatrixAt(clapperStart + i, rest));
    rope.forEach((rest, i) => moving.getMatrixAt(ropeStart + i, rest));
    const clapperPin = new Vector3(0, clocktowerHeight(bellBase + 3.3125), 0).sub(pivot.position);
    const ropePin = new Vector3(.89125, clocktowerHeight(bellY + 5), .6525).sub(pivot.position);
    const hinge = new Matrix4(), swung = new Matrix4(), offset = new Vector3();
    const duration = 4;
    const omega = 2 * Math.PI / 1.02;
    const maxSwing = Math.PI / 30;
    let elapsed = duration, impulse = 0, startAngle = 0;

    function sway(rest: Matrix4[], start: number, pin: Vector3, angle: number) {
      hinge.makeRotationX(angle);
      hinge.setPosition(offset.copy(pin).applyMatrix4(hinge).negate().add(pin));
      for (let i = 0; i < rest.length; i++) moving.setMatrixAt(start + i, swung.multiplyMatrices(hinge, rest[i]));
      moving.instanceMatrix.addUpdateRange(start * 16, rest.length * 16);
    }

    return {
      strike(strength = 1) {
        startAngle = pivot.rotation.x;
        impulse = maxSwing * Math.max(0, Math.min(strength, 1));
        elapsed = 0;
      },
      update(dt) {
        if (elapsed >= duration) return;
        elapsed = Math.min(duration, elapsed + dt);
        const resting = elapsed >= duration;
        if (!resting && !target.visible) return;
        const decay = (1 - elapsed / duration) ** 2;
        const phase = omega * elapsed;
        const body = decay * (startAngle * Math.cos(phase) + impulse * Math.sin(phase));
        pivot.rotation.x = resting ? 0 : Math.max(-maxSwing, Math.min(maxSwing, body));
        const delayed = resting ? 0 : decay * impulse * Math.sin(omega * Math.max(0, elapsed - .115));
        moving.instanceMatrix.clearUpdateRanges();
        sway(clapper, clapperStart, clapperPin, delayed * .86 - pivot.rotation.x * .72);
        sway(rope, ropeStart, ropePin, -pivot.rotation.x * .65 + delayed * .13);
        moving.instanceMatrix.needsUpdate = true;
      },
    };
  }
  addBatches(tower, shellParts);
  const detailInterior = new Group();
  detailInterior.name = 'Tower stairs and interiors';
  addBatches(detailInterior, interiorParts);
  tower.userData.bellMotion = attachBell(detailInterior);
  tower.add(detailInterior);
  tower.userData.detailInterior = detailInterior;
  const hallLight = new PointLight('#ffad63', 86, 14, 2);
  hallLight.position.set(0, 5, 2.75);
  tower.add(hallLight);
  tower.userData.colliders = colliders;
  tower.userData.floors = floors;
  tower.userData.ramps = ramps;
  tower.name = `Clocktower · ${Math.round(towerHeight)} m`;
  tower.userData.stops = {
    dial: [0, clocktowerHeight(dialY), 1.25],
    bell: [.65, clocktowerHeight(bellY), .65],
    lookout: [1, clocktowerHeight(lookoutY), 1.3],
  };
  tower.userData.dialFocus = [0, clocktowerHeight(faceY), 4.90625] as Vec3;
  return tower;
}
