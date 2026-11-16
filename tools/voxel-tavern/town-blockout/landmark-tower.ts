import { BoxGeometry, Color, Group, InstancedMesh, Matrix4, MeshLambertMaterial, PointLight, Quaternion, Vector3 } from 'three';
// The district builder calls this same geometry source for its Voxelize snapshot.
// @ts-expect-error The original JavaScript builder has no declaration file.
import { buildGrandClocktower } from '../build-grand-clocktower.mjs';
import type { TownPlot } from './landmark-kit';

type Vec3 = [number, number, number];
type Bounds = { min: Vec3; max: Vec3 };
type Cuboid = { at: Vec3; size: Vec3; tone: number };
type Box = (kind: string, x: number, y: number, z: number, w?: number, h?: number, d?: number) => void;

const colors: Record<string, string> = {
  limestone: '#ac9b87', blueStone: '#526276', ivory: '#d1c3a4', stone: '#766a62',
  paving: '#85919a', paveEdge: '#596975', snowFeather: '#d9e6f4',
  brass: '#b68d4a', bronze: '#ac753c', gold: '#eead49', glow: '#ffc370',
  wood: '#684633', plank: '#8f6646', dark: '#302b34', iron: '#47444c',
  runner: '#8a3737', cloth: '#a92c35', oxblood: '#903341', garnet: '#b42b3b',
  wineTile: '#703d4f', teal: '#547783', roofShadow: '#263c60', roofGlaze: '#4b7195', roof: '#365477',
};

export function buildTowerLandmark(plot: TownPlot): Group {
  const tower = new Group();
  tower.name = 'Clocktower · 96 m';
  const parts = new Map<string, Cuboid[]>();
  const colliders: Bounds[] = [];
  const floors: Bounds[] = [];
  const unit = new BoxGeometry(1, 1, 1);
  const matrix = new Matrix4();
  const rotation = new Quaternion();
  const base = new Vector3();
  const sizing = new Vector3();

  const box: Box = (kind, x, y, z, w = 1, h = 1, d = 1) => {
    if (Math.min(w, h, d) <= 0) return;
    const cubes = parts.get(kind) ?? [];
    const tone = .9 + .16 * Math.abs(Math.sin(x * 14.2 + y * 8.3 + z * 95.7));
    cubes.push({ at: [x + w / 2, y + h / 2, z + d / 2], size: [w, h, d], tone });
    parts.set(kind, cubes);
  };
  const solid = (x: number, y: number, z: number, w: number, h: number, d: number) => {
    colliders.push({ min: [x, y, z], max: [x + w, y + h, z + d] });
  };
  const floor = (x: number, y: number, z: number, w: number, h: number, d: number) => {
    floors.push({ min: [x, y, z], max: [x + w, y + h, z + d] });
  };
  function lamp(b: Box, x: number, y: number, z: number, s = 1) {
    b('glow', x - .23 * s, y, z - .23 * s, .46 * s, .61 * s, .46 * s);
    for (const cap of [-.08, .61]) b('dark', x - .29 * s, y + cap * s, z - .29 * s, .58 * s, .08 * s, .58 * s);
    for (const dx of [-.24, .20]) for (const dz of [-.24, .20]) {
      b('brass', x + dx * s, y, z + dz * s, .045 * s, .61 * s, .045 * s);
    }
  }

  // Rotate the original north entrance to face the new plaza. The old shaft,
  // clock faces, belfry, spire and bell hall are retained at their original scale.
  const oldBox: Box = (kind, x, y, z, w = 1, h = 1, d = 1) => box(kind, -3 - x - w, y - 2, 37.5 - z - d, w, h, d);
  buildGrandClocktower({ box: oldBox, beam: oldBox, lantern: (x: number, y: number, z: number) => {
    lamp(box, -3 - x, y - 2, 37.5 - z);
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
  solid(-5.75, .25, -5.63, 11.5, 10, .7);
  solid(-5.63, .25, -5.75, .7, 10, 11.5);
  solid(4.93, .25, -5.75, .7, 10, 11.5);
  solid(-5.75, .25, 4.99, 3.875, 10, .7);
  solid(1.875, .25, 4.99, 3.875, 10, .7);
  solid(-2.25, .25, -5, 4.5, 3.75, 1.75);

  for (const [kind, cubes] of parts) {
    const emissive = kind === 'glow' ? '#f59b28' : kind === 'gold' ? '#44250d' : '#000000';
    const material = new MeshLambertMaterial({ emissive, emissiveIntensity: kind === 'glow' ? .85 : .18 });
    const mesh = new InstancedMesh(unit, material, cubes.length);
    const tint = new Color();
    cubes.forEach(({ at, size, tone }, i) => {
      matrix.compose(base.set(...at), rotation, sizing.set(...size));
      mesh.setMatrixAt(i, matrix);
      mesh.setColorAt(i, tint.set(colors[kind] ?? colors.limestone).multiplyScalar(tone));
    });
    mesh.name = kind;
    tower.add(mesh);
  }
  const hallLight = new PointLight('#ffad63', 86, 14, 2);
  hallLight.position.set(0, 5, 2.75);
  tower.add(hallLight);
  tower.userData.colliders = colliders;
  tower.userData.floors = floors;
  return tower;
}
