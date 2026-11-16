import {
  BoxGeometry, Color, Group, InstancedMesh, Matrix4, MeshBasicMaterial, MeshLambertMaterial,
} from 'three';
import type { TownPlot } from './landmark-kit';

type Position = [number, number, number];
type Bounds = { min: Position; max: Position };
type Ramp = Bounds & { axis: 'z'; ascending: -1 };
type Piece = { at: Position; size: Position; color: string; light: boolean };

const palette = {
  stone: '#576478', ash: '#8391a2', lime: '#d1bf9e',
  timber: '#4f2929', red: '#813432', dark: '#3b2634', cedar: '#9a5844',
  brass: '#c28043', plaster: '#b99f8b', snow: '#dcebf6',
  roof: ['#334565', '#485978', '#526481', '#3b4e6b'],
  tile: ['#546074', '#626e81', '#586375', '#68778a'],
  glow: '#ffb96d', bright: '#ffde9b', paper: '#d6b787', runner: '#77343e',
};

function structure() {
  const group = new Group();
  const pieces: Piece[] = [];
  const colliders: Bounds[] = [];
  const floors: Bounds[] = [];
  const ramps: Ramp[] = [];
  const box = (color: string, x: number, y: number, z: number, w: number, h: number, d: number, light = false) => {
    pieces.push({ at: [x, y, z], size: [w, h, d], color, light });
  };
  const bounds = (x: number, y: number, z: number, w: number, h: number, d: number): Bounds => ({
    min: [x - w / 2, y - h / 2, z - d / 2],
    max: [x + w / 2, y + h / 2, z + d / 2],
  });
  const solid = (color: string, x: number, y: number, z: number, w: number, h: number, d: number) => {
    box(color, x, y, z, w, h, d);
    colliders.push(bounds(x, y, z, w, h, d));
  };
  function finish() {
    for (const light of [false, true]) {
      const subset = pieces.filter(piece => piece.light === light);
      const batch = new InstancedMesh(new BoxGeometry(1, 1, 1), light ? new MeshBasicMaterial() : new MeshLambertMaterial(), subset.length);
      const transform = new Matrix4();
      subset.forEach((piece, i) => {
        transform.makeScale(...piece.size).setPosition(...piece.at);
        batch.setMatrixAt(i, transform);
        batch.setColorAt(i, new Color(piece.color));
      });
      batch.instanceMatrix.needsUpdate = true;
      group.add(batch);
    }
    group.userData.colliders = colliders;
    group.userData.floors = floors;
    group.userData.ramps = ramps;
    return group;
  }
  return { box, bounds, solid, floors, ramps, finish };
}

function buildHeritageHall(plot: TownPlot, ceremonial: boolean) {
  const { box, bounds, solid, floors, ramps, finish } = structure();
  const [w, d] = plot.footprint;
  const shellW = w - (ceremonial ? 3.6 : 2.1);
  const shellD = d - 6;
  const outsideZ = 10;
  const front = outsideZ - 4.4;
  const rear = front - shellD;
  const centerZ = (front + rear) / 2;
  const deck = ceremonial ? 1.1 : .88;
  const wallH = ceremonial ? 5.15 : 4.8;
  const doorW = ceremonial ? 4.4 : 3.6;
  const halfShell = shellW / 2;
  const flankW = (shellW - doorW) / 2;
  const ridge = deck + wallH;
  const wall = ceremonial ? palette.timber : palette.plaster;
  const trim = ceremonial ? palette.red : palette.cedar;

  // The old valley hall used blue-stone platforms, red columns and a triple tiled roof.
  // B05 adds a portico and lateral museum wings below the ceremonial hall on the upper terrace.
  box(palette.stone, 0, deck / 2, centerZ, shellW + .9, deck, shellD + .7);
  box(palette.ash, 0, deck - .11, centerZ, shellW + 1.2, .22, shellD + 1);
  floors.push(bounds(0, deck - .14, centerZ, shellW + 1.2, .28, shellD + 1));
  for (let course = 0; course < 3; course++) {
    const y = .16 + course * .265;
    for (let x = -halfShell - .2; x < halfShell; x += .78) {
      box(palette.tile[(Math.floor((x + w) * 2) + course) % 4], x + (course % 2) * .25, y, front + .37, .72, .235, .06);
    }
  }
  const rampStart = front + .48;
  const run = outsideZ - rampStart;
  for (let i = 0; i < 6; i++) {
    const top = deck * (6 - i) / 6;
    box(i % 2 ? palette.ash : palette.lime, 0, top / 2, rampStart + (i + .5) * run / 6, doorW + 1.75, top, run / 6 + .025);
  }
  ramps.push({ min: [-doorW / 2 - .85, 0, rampStart], max: [doorW / 2 + .85, deck, outsideZ], axis: 'z', ascending: -1 });
  for (const direction of [-1, 1]) {
    const x = direction * (doorW / 2 + 1.18);
    box(palette.stone, x, deck * .56, (rampStart + outsideZ) / 2, .42, deck * 1.1, run - .12);
    for (const z of [rampStart + .12, outsideZ - .53]) {
      box(palette.ash, x, deck + .37, z, .55, 1.04, .55);
      box(palette.lime, x, deck + .92, z, .7, .12, .68);
    }
  }
  const faceY = deck + wallH / 2;
  solid(wall, 0, faceY, rear, shellW, wallH, .56);
  for (const dir of [-1, 1]) {
    solid(wall, dir * halfShell, faceY, centerZ, .5, wallH, shellD);
    solid(wall, dir * (doorW / 2 + flankW / 2), faceY, front, flankW, wallH, .54);
  }
  solid(trim, 0, ridge - .77, front, doorW, 1.53, .59);
  box(palette.dark, 0, ridge - 1.56, front + .21, doorW + .75, .31, .53);
  box(palette.brass, 0, ridge - 1.29, front + .48, doorW + .35, .085, .07);
  for (const x of [-doorW / 2, doorW / 2]) {
    box(palette.cedar, x, deck + 1.66, front + .14, .29, 3.3, .46);
    box(palette.brass, x, deck + .42, front + .4, .34, .125, .065);
  }
  for (const z of [front + .27, rear - .29]) {
    box(trim, 0, deck + .24, z, shellW, .34, .12);
    box(palette.dark, 0, ridge - .17, z, shellW + .25, .36, .26);
  }
  for (const dir of [-1, 1]) {
    box(trim, dir * (halfShell + .25), deck + .24, centerZ, .12, .34, shellD);
    box(palette.dark, dir * (halfShell + .25), ridge - .17, centerZ, .26, .36, shellD + .35);
  }

  function window(x: number, y: number, z: number, width: number, height: number, side = 0) {
    const plane = (color: string, u: number, v: number, layer: number, wide: number, tall: number, thick: number, light = false) => {
      if (side) box(color, x + layer * side, y + v, z + u, thick, tall, wide, light);
      else box(color, x + u, y + v, z + layer, wide, tall, thick, light);
    };
    plane(palette.dark, 0, 0, .075, width + .32, height + .35, .2);
    plane(palette.glow, 0, 0, .205, width, height, .115, true);
    for (const p of [-.33, 0, .33]) plane(palette.cedar, width * p, 0, .278, .085, height, .045);
    for (const p of [-.33, 0, .33]) plane(palette.cedar, 0, height * p, .281, width, .075, .052);
    plane(palette.brass, 0, -height / 2 - .13, .29, width + .49, .095, .28);
  }

  function lantern(x: number, y: number, z: number) {
    box(palette.red, x, y + .41, z, .64, .13, .65);
    box(palette.red, x, y - .39, z, .61, .12, .64);
    box(palette.bright, x, y, z, .45, .66, .45, true);
    for (const dx of [-.24, .24]) for (const dz of [-.24, .24]) box(palette.red, x + dx, y, z + dz, .067, .76, .067);
    box(palette.brass, x, y + .54, z, .065, .26, .065);
    box(palette.red, x, y - .54, z, .1, .25, .1);
  }

  const facadeBays = ceremonial ? 4 : 3;
  const bay = (flankW - 1.2) / facadeBays;
  for (const dir of [-1, 1]) {
    for (let i = 0; i < facadeBays; i++) {
      const x = dir * (doorW / 2 + .65 + bay * (i + .5));
      window(x, deck + 2.18, front + .24, Math.min(1.21, bay * .71), 1.78);
    }
    for (let i = 0; i <= facadeBays; i++) {
      const x = dir * (doorW / 2 + .37 + bay * i);
      box(palette.stone, x, deck + .2, front + .29, .7, .4, .68);
      box(trim, x, deck + wallH * .53, front + .32, .42, wallH - .34, .43);
      box(palette.brass, x, ridge - .61, front + .35, .535, .09, .47);
      box(palette.dark, x, ridge - .36, front + .38, .65, .22, .53);
    }
    for (const z of [centerZ - 3.8, centerZ, centerZ + 3.8]) window(dir * (halfShell + .23), deck + 2.25, z, 1.42, 1.72, dir);
    const porticoX = dir * (doorW / 2 + 1.2);
    box(palette.stone, porticoX, deck + .3, front + 1.65, .63, .6, .67);
    box(trim, porticoX, deck + 2.55, front + 1.65, .43, 4.2, .43);
    lantern(porticoX, deck + 3.5, front + 1.99);
    box(palette.red, porticoX, deck + 1.85, front + 1.89, .32, 1.42, .063);
    box(palette.brass, porticoX, deck + 1.24, front + 1.927, .225, .1, .028);
  }

  // Layered block courses, raised corner ends and continuous stepped snow caps.
  function roof(cx: number, y: number, z: number, width: number, depth: number, rise: number) {
    const courses = Math.ceil(depth * .83);
    const run = depth / 2 / courses;
    for (const side of [-1, 1]) {
      for (let i = 0; i < courses; i++) {
        const t = i / courses;
        const length = width - t * 2.3;
        const atZ = z + side * (depth / 2 - (i + .5) * run);
        const atY = y + rise * Math.pow(t, 1.55);
        box(palette.roof[(i + 1) % 4], cx, atY, atZ, length, .26, run + .028);
        box(palette.snow, cx, atY + .18, atZ, length - .15, .148, run * .865);
        for (let x = -length / 2 + .37; x < length / 2; x += .68) {
          box(palette.roof[(i + Math.floor((length / 2 + x) * 5)) % 4], cx + x, atY - .085, atZ, .075, .12, run + .055);
        }
        if (i >= 3) continue;
        for (const direction of [-1, 1]) {
          const corner = cx + direction * (length / 2 - .36);
          const lift = .22 * (3 - i);
          box(palette.roof[0], corner, atY + lift, atZ, .81, .22, run + .1);
          box(palette.snow, corner, atY + lift + .16, atZ, .68, .115, run);
          if (i === 0) box(palette.brass, corner + direction * .24, atY + lift + .27, atZ, .26, .3, run * .82);
        }
      }
    }
    box(palette.roof[0], cx, y + rise, z, width - 1.67, .34, .51);
    box(palette.snow, cx, y + rise + .27, z, width - 2.04, .16, .44);
    for (const dir of [-1, 1]) {
      box(palette.brass, cx + dir * (width / 2 - .83), y + rise + .26, z, .37, .45, .43);
      box(palette.roof[0], cx + dir * (width / 2 - .66), y + rise + .48, z, .26, .23, .33);
    }
    // Close the four gable volumes so the snow courses do not expose the sky.
    for (const dir of [-1, 1]) for (let tick = 0; tick < 6; tick++) {
      const level = (tick + .5) / 6;
      const chord = depth * (1 - Math.pow(level, 1 / 1.55));
      box(trim, cx + dir * (width / 2 - 1.06 - level * .5), y + level * rise, z, .24, rise / 6 + .03, chord);
    }
  }

  const eavesW = Math.min(w, shellW + 2.7);
  const eavesD = shellD + 2.6;
  roof(0, ridge + .18, centerZ, eavesW, eavesD, 1.88);
  roof(0, ridge - .71, front + .55, doorW + 4.95, 3.61, .74);
  const tiers = ceremonial ? [[.78, .68, 2.94], [.53, .49, 5.54]] : [[.53, .67, 2.79]];
  for (const [scaleX, scaleZ, lift] of tiers) {
    const upperW = eavesW * scaleX;
    const upperD = eavesD * scaleZ;
    const y = ridge + lift;
    for (const dir of [-1, 1]) {
      box(trim, 0, y - .76, centerZ + dir * (upperD / 2 - .7), upperW - 1.08, 1.68, .4);
      box(trim, dir * (upperW / 2 - .73), y - .76, centerZ, .42, 1.68, upperD - 1.4);
    }
    for (let x = 1 - upperW / 2; x < upperW / 2 - 1; x += 1.15) {
      window(x, y - .65, centerZ + upperD / 2 - .71, .64, .57);
    }
    roof(0, y, centerZ, upperW, upperD, ceremonial ? 1.63 : 2.13);
  }

  // Keep the floor continuous through the entry. The older hall's runner,
  // gold seams and suspended lanterns anchor the new walkable interior.
  box(palette.runner, 0, deck + .018, centerZ + .46, doorW - .62, .036, shellD - 1.13);
  for (const x of [-1, 1]) box(palette.brass, x * (doorW - .71) / 2, deck + .04, centerZ + .46, .09, .035, shellD - 1.13);
  for (const z of [front - 2.8, centerZ, rear + 2.6]) {
    box(palette.dark, 0, ridge - .55, z, shellW - .5, .4, .4);
    for (const dir of [-1, 1]) {
      const x = dir * (doorW / 2 + 1.51);
      solid(trim, x, deck + wallH / 2, z, .45, wallH, .43);
      lantern(x, deck + 3.32, z + .32);
    }
  }
  for (const dir of [-1, 1]) {
    for (const z of [centerZ + 2, centerZ - 2]) {
      const x = dir * (halfShell - 2.5);
      solid(palette.dark, x, deck + .37, z, ceremonial ? 2.2 : 2.96, .74, .87);
      box(palette.cedar, x, deck + .81, z, ceremonial ? 2.38 : 3.12, .16, 1);
      box(ceremonial ? palette.brass : palette.paper, x, deck + .935, z, ceremonial ? .74 : 1.53, .087, .55);
    }
  }
  if (!ceremonial) {
    // Front museum wings and archival shelves reflect the lower-tier B05 silhouette.
    for (const dir of [-1, 1]) {
      const x = dir * (halfShell - 3);
      box(palette.dark, x, deck + 1.5, rear + .56, 3.8, 2.9, .52);
      for (let level = 0; level < 4; level++) {
        box(palette.cedar, x, deck + .35 + level * .69, rear + .8, 3.7, .12, .56);
        for (let item = 0; item < 8; item++) box(item % 2 ? palette.paper : palette.ash, x - 1.48 + item * .41, deck + .6 + level * .69, rear + .86, .25, .37 + item % 2 * .11, .23);
      }
    }
  }
  return finish();
}

export function buildCultureLandmark(plot: TownPlot) {
  return buildHeritageHall(plot, plot.id === 'long-hall');
}
