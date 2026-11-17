import {
  BoxGeometry, CanvasTexture, Group, InstancedMesh, Mesh, MeshBasicMaterial, MeshLambertMaterial,
  Object3D, PlaneGeometry, PointLight, SRGBColorSpace, type Material,
} from 'three';
import type { TownPlot } from './landmark-kit';
import { addTownWindow } from './town-window';

type Point = [number, number, number];
type Solid = { min: Point; max: Point };
type Block = { position: Point; size: Point; roll: number };

const palette: Record<string, Material> = {
  brick1: new MeshLambertMaterial({ color: '#9a4c36' }),
  brick2: new MeshLambertMaterial({ color: '#824030' }),
  brick3: new MeshLambertMaterial({ color: '#a6573b' }),
  brick4: new MeshLambertMaterial({ color: '#b26c51' }),
  mortar: new MeshLambertMaterial({ color: '#513833' }),
  stone: new MeshLambertMaterial({ color: '#818997' }),
  stoneTrim: new MeshLambertMaterial({ color: '#a1a7b5' }),
  timber: new MeshLambertMaterial({ color: '#64412d' }),
  timberWarm: new MeshLambertMaterial({ color: '#945934' }),
  slate: new MeshLambertMaterial({ color: '#334c68' }),
  slateLight: new MeshLambertMaterial({ color: '#405b77' }),
  snow: new MeshLambertMaterial({ color: '#cce7fa' }),
  paper: new MeshLambertMaterial({ color: '#efd7a3', emissive: '#774930', emissiveIntensity: .42 }),
  parcel: new MeshLambertMaterial({ color: '#b77a3f' }),
  brass: new MeshLambertMaterial({ color: '#d3a258', emissive: '#55201a', emissiveIntensity: .38 }),
  red: new MeshLambertMaterial({ color: '#b64734', emissive: '#602519', emissiveIntensity: .23 }),
  redDark: new MeshLambertMaterial({ color: '#672c2a' }),
  dark: new MeshLambertMaterial({ color: '#30262b' }),
  glass: new MeshBasicMaterial({ color: '#ffd482' }),
  goldLight: new MeshBasicMaterial({ color: '#ffe9bb' }),
};

function bounds([x, y, z]: Point, [w, h, d]: Point): Solid {
  return { min: [x - w / 2, y - h / 2, z - d / 2], max: [x + w / 2, y + h / 2, z + d / 2] };
}

export function buildPostLandmark(_plot: TownPlot): Group {
  const model = new Group();
  model.name = 'New Year Post Office';
  const batches = new Map<string, Block[]>();
  const colliders: Solid[] = [];
  const floors: Solid[] = [];
  function box(tint: string, x: number, y: number, z: number, w: number, h: number, d: number, roll = 0) {
    const items = batches.get(tint) ?? [];
    items.push({ position: [x, y, z], size: [w, h, d], roll });
    batches.set(tint, items);
  }

  // B13's stone plinth, brick wall bays and window grid. Leave a real 2.5 m door opening.
  const front = 7.28;
  const halfWidth = 7;
  const ground = .3;
  const mezzanine = 4.14;
  const eave = 7.86;
  box('stone', 0, .13, .05, 14.4, .26, 14.8);
  box('timber', 0, .27, 0, 13.8, .06, 14.2);
  floors.push(bounds([0, .27, .05], [14, .06, 14.5]));
  for (let i = 0; i < 2; i++) {
    box('stoneTrim', 0, .075 * (i + 1), 7.89 - i * .32, 3.35, .15 * (i + 1), .32);
    floors.push(bounds([0, .075 * (i + 1), 7.89 - i * .32], [3.35, .15 * (i + 1), .34]));
  }

  const doorWidth = 2.5;
  const brickColours = ['brick1', 'brick2', 'brick1', 'brick3', 'brick4'];
  const frontOpenings = [
    { u: 0, y: 1.53, width: doorWidth, height: 3.08 },
    ...[-4.15, 4.15].map(u => ({ u, y: 2.34, width: 1.76, height: 1.96 })),
    ...[-4.15, 0, 4.15].map(u => ({ u, y: 5.74, width: 1.68, height: 1.82 })),
  ];
  const sideOpenings = [2.34, 5.74].flatMap(y =>
    [-3.65, 2.48].map(u => ({ u, y, width: 1.68, height: 1.9 })),
  );

  function window(u: number, y: number, alongX: boolean, side: 1 | -1, w: number, h: number) {
    const face = (alongX ? front : halfWidth) * side;
    const block = (tint: string, a: number, b: number, width: number, height: number, depth: number, outward: number) => {
      if (alongX) box(tint, a, b, face + outward * side, width, height, depth);
      else box(tint, face + outward * side, b, a, depth, height, width);
    };
    for (const edge of [-1, 1]) {
      block('timberWarm', u + edge * (w / 2 + .027), y, .14, h + .19, .49, -.045);
      block('timber', u, y + edge * (h / 2 + .033), w + .19, .133, .46, -.045);
    }
    let walkHeight = y < 4 ? ground : mezzanine;
    let approach: [number, number] | undefined;
    if (y > 4 && side === 1) {
      const pull = alongX ? u + (u === 0 ? 0 : 1.03) : u;
      walkHeight = alongX ? ground : ground + (mezzanine - ground) * 5 / 16;
      approach = alongX ? [pull, front - 1.55] : [5.25, 2.59];
      const bottom = walkHeight + 1.47;
      const length = y - h / 2 - bottom;
      block('timber', pull, bottom + length / 2, .032, length, .032, -.3);
      block('brass', pull, bottom, .09, .14, .065, -.3);
    }
    addTownWindow(model, {
      x: alongX ? u : face, y, z: alongX ? face : u,
      yaw: alongX ? (side === 1 ? 0 : Math.PI) : side * Math.PI / 2,
      width: w, height: h, ground: walkHeight, approach, style: 'post',
    });
    block('stoneTrim', u, y + h / 2 + .1, w + .42, .19, .27, .16);
    block('stone', u, y - h / 2 - .11, w + .46, .24, .4, .2);
    block('snow', u, y - h / 2 + .018, w + .34, .05, .24, .23);
  }

  for (const alongX of [true, false]) {
    for (const side of [-1, 1] as const) {
      const face = (alongX ? front : halfWidth) * side;
      const length = alongX ? 14.15 : 14.66;
      const openings = alongX && side === 1 ? frontOpenings : sideOpenings;
      for (let row = 0; row < 23; row++) {
        const y = .2 + row * .334;
        const tint = y < 1 ? 'stone' : 'mortar';
        for (let index = -1; index < Math.ceil(length / .655); index++) {
          const shift = row % 2 ? .3275 : 0;
          const left = Math.max(-length / 2, -length / 2 + index * .655 + shift);
          const right = Math.min(length / 2, -length / 2 + (index + 1) * .655 + shift);
          if (right - left < .08) continue;
          const u = (left + right) / 2;
          if (openings.some(o => Math.abs(y - o.y) < o.height / 2 && Math.abs(u - o.u) < o.width / 2)) continue;
          const w = right - left - .025;
          const brick = y < 1 ? (index % 4 ? 'stone' : 'stoneTrim')
            : brickColours[(index + row * 7 + 10) % brickColours.length];
          if (alongX) {
            box(tint, u, y, face - side * .045, w + .022, .329, .31);
            box(brick, u, y, face + side * .117, w, .3, .09);
          } else {
            box(tint, face - side * .045, y, u, .31, .329, w + .022);
            box(brick, face + side * .117, y, u, .09, .3, w);
          }
        }
      }
      for (const o of openings) {
        if (alongX && side === 1 && o.y < 2) continue;
        window(o.u, o.y, alongX, side, o.width, o.height);
      }
    }
  }
  colliders.push(bounds([-halfWidth, 3.8, 0], [.42, 7.6, 14.6]), bounds([halfWidth, 3.8, 0], [.42, 7.6, 14.6]),
    bounds([0, 3.8, -front], [14, 7.6, .44]));
  for (const side of [-1, 1]) {
    colliders.push(bounds([side * 4.16, 3.8, front], [5.82, 7.6, .43]));
  }

  for (const z of [-front, front]) {
    for (const x of [-6.94, 6.94]) {
      box('timber', x * .966, 3.78, z * .972, .31, 7.56, .36);
      for (let y = .48; y < eave; y += .48) box('stoneTrim', x, y, z, .51, .436, .46);
    }
    for (const y of [4.04, 7.73]) box('timber', 0, y, z, 14.25, .17, .31);
    for (let row = 0; row < 8; row++) {
      const y = eave + .16 + row * .30;
      const width = Math.max(0, 13.9 * (1 - (y - eave) / 2.77));
      const cols = Math.ceil(width / .63);
      for (let col = 0; col < cols; col++) {
        const tileWidth = width / cols;
        box(brickColours[(row * 7 + col) % brickColours.length], (col + .5) * tileWidth - width / 2,
          y, z, tileWidth - .025, .285, .39);
      }
    }
  }

  // B13 shows a snow-covered standing gable with tile courses and two chimneys.
  for (let course = 0; course < 16; course++) {
    const x = (course + .5) * .475;
    const y = eave + 2.83 - x * .37;
    for (const side of [-1, 1]) {
      for (let strip = 0; strip < 16; strip++) {
        const z = -7.45 + strip * .993;
        box((strip + course) % 4 ? 'slate' : 'slateLight', x * side, y, z, .518, .32, 1.0);
        if (course < 9 || (strip * 3 + course * 7) % 11 > 2) {
          box('snow', x * side, y + .205 + (strip + course) % 3 * .027, z,
            course % 5 ? .49 : .53, .15, 1.0);
        }
      }
      box('timberWarm', x * side, y - .12, front + .66, .47, .26, .24);
      box('timberWarm', x * side, y - .12, -front - .66, .47, .26, .24);
    }
  }
  box('snow', 0, 10.85, 0, .60, .18, 15.98);
  for (const [x, z] of [[-3.03, -2.67], [3.03, 1.16]]) {
    for (let y = 9.35; y < 12.5; y += .35) {
      box(brickColours[Math.round(y * 10) % brickColours.length], x, y, z, 1.38, .31, 1.25);
    }
    box('stone', x, 12.48, z, 1.6, .27, 1.49);
    box('snow', x, 12.67, z, 1.65, .17, 1.54);
  }

  function lantern(x: number, y: number, z: number, exterior = false) {
    box(exterior ? 'red' : 'timberWarm', x, y + .31, z, .47, .13, .46);
    box('goldLight', x, y, z, .25, .52, .25);
    box('brass', x, y - .30, z, .42, .12, .41);
    for (const dx of [-.14, .14]) for (const dz of [-.14, .14]) {
      box('timber', x + dx, y, z + dz, .048, .57, .048);
    }
  }
  function envelope(x: number, y: number, z: number, w: number, h: number) {
    box('brass', x, y, z, w + .14, h + .14, .12);
    box('paper', x, y, z + .071, w, h, .036);
    const angle = Math.atan2(h * .36, w * .47);
    const line = Math.hypot(w * .47, h * .36);
    for (const side of [-1, 1]) box('timberWarm', x + side * w * .235, y + h * .11, z + .105, line, .06, .035, side * angle);
  }
  for (const x of [-1.52, 1.52]) {
    box('timberWarm', x, 1.64, front + .12, .24, 3.28, .32);
    box('timber', x, 3.59, 7.73, .24, .37, .41);
    lantern(x * 1.31, 2.68, front + .61, true);
  }
  box('timberWarm', 0, 3.27, front + .15, 3.24, .31, .31);
  box('timber', 0, 3.93, 7.61, 4.18, .24, .71);
  box('snow', 0, 4.065, 7.60, 4.2, .11, .73);
  envelope(0, 8.56, front + .30, 1.57, .91);

  // Reuse the legacy Blender post office's postbox, writing desk and sorting wall,
  // with their local positions translated to this larger building.
  const mailboxX = 3.26;
  const mailboxZ = 7.6;
  box('red', mailboxX, .85, mailboxZ, .65, 1.35, .65);
  box('snow', mailboxX, 1.57, mailboxZ, .75, .14, .75);
  box('dark', mailboxX, 1.19, mailboxZ + .34, .4, .075, .035);
  box('brass', mailboxX, .88, mailboxZ + .34, .30, .22, .035);
  colliders.push(bounds([mailboxX, .85, mailboxZ], [.65, 1.35, .65]));

  function writeDesk(x: number, y: number, z: number) {
    box('timber', x, y + .65, z, 3, 1.3, 1.1);
    box('timberWarm', x, y + 1.31, z, 3.1, .08, 1.2);
    for (const dx of [-.99, 0, .99]) {
      box('timberWarm', x + dx, y + .97, z + .57, .88, .37, .06);
      box('brass', x + dx, y + 1.01, z + .63, .20, .045, .055);
    }
    box('red', x - .38, y + 1.365, z + .05, 1.15, .018, .72);
    for (let layer = 0; layer < 4; layer++) {
      box('paper', x - .38 + layer * .005, y + 1.382 + layer * .006, z + .05, .62, .006, .45);
    }
    box('dark', x + .5, y + 1.46, z - .16, .12, .18, .12);
    box('timberWarm', x + .63, y + 1.41, z + .13, .035, .035, .50);
    for (let layer = 0; layer < 5; layer++) {
      box('paper', x + 1.1, y + 1.39 + layer * .018, z - .15, .36, .015, .23);
    }
    colliders.push(bounds([x, y + .66, z], [3.1, 1.32, 1.2]));
  }
  function sortingWall(x: number, y: number, z: number, columns: number) {
    const width = columns * .67;
    box('timber', x, y + 1.1, z - .23, width, 2.2, .12);
    for (const dy of [.12, .62, 1.12, 1.62, 2.12]) box('timberWarm', x, y + dy, z, width + .035, .065, .48);
    for (let col = 0; col <= columns; col++) box('timber', x - width / 2 + col * .67, y + 1.12, z, .065, 2.1, .48);
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < columns; col++) {
        if ((row + col) % 3 === 0) continue;
        for (let layer = 0; layer < 3; layer++) box('paper', x - width / 2 + .33 + col * .67,
          y + .19 + row * .5 + layer * .026, z + .06, .37, .021, .25);
      }
    }
    colliders.push(bounds([x, y + 1.1, z], [width, 2.2, .56]));
  }
  writeDesk(-4.34, ground, 3.58);
  writeDesk(-.65, mezzanine, -4.96);
  sortingWall(-.42, ground + .65, -6.65, 5);
  sortingWall(-.42, mezzanine, -6.64, 5);

  // B14/15 service desk, archive mezzanine and the east stair remain traversable.
  box('timber', -.85, ground + .58, -1.40, 5.1, 1.16, .84);
  box('timberWarm', -.85, ground + 1.20, -1.40, 5.45, .13, 1.12);
  envelope(-.85, ground + .67, -.91, .72, .39);

  // A card rack and date stamp mark the souvenir counter inside the hall.
  const countertop = ground + 1.265;
  box('timber', .46, countertop + .23, -1.31, 1.07, .46, .13);
  box('brass', .46, countertop + .04, -1.31, 1.19, .08, .24);
  box('dark', .98, countertop + .035, -1.65, .23, .07, .21);
  box('redDark', .98, countertop + .075, -1.65, .19, .035, .16);
  box('brass', .87, countertop + .04, -1.08, .20, .08, .16);
  box('timberWarm', .87, countertop + .13, -1.08, .05, .13, .05);
  box('red', .87, countertop + .204, -1.08, .138, .055, .11);
  for (let layer = 0; layer < 6; layer++) {
    box(layer % 3 === 0 ? 'slateLight' : 'paper', -.35 + layer * .01,
      countertop + .018 + layer * .018, -1.20, .48, .016, .29);
  }
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#522c29';
      ctx.fillRect(0, 0, 320, 128);
      ctx.strokeStyle = '#dfa86d';
      ctx.lineWidth = 5;
      ctx.strokeRect(8, 8, 304, 112);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '700 45px "Microsoft YaHei", sans-serif';
      ctx.fillStyle = '#ffe4b6';
      ctx.fillText('纪念戳台', 160, 66);
      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      const plaque = new Mesh(new PlaneGeometry(1.02, .408), new MeshBasicMaterial({ map: texture }));
      plaque.position.set(.46, countertop + .244, -1.243);
      model.add(plaque);
    }
  }
  colliders.push(bounds([-.85, ground + .59, -1.4], [5.45, 1.25, 1.12]));
  box('timber', -.65, mezzanine - .15, -5.26, 12.65, .3, 3.46);
  floors.push(bounds([-.65, mezzanine - .15, -5.26], [12.65, .3, 3.46]));
  box('timber', -5.54, mezzanine - .15, -.35, 2.65, .30, 6.4);
  floors.push(bounds([-5.54, mezzanine - .15, -.35], [2.65, .30, 6.4]));
  for (let plank = -13; plank <= 10; plank++) {
    box(plank % 4 ? 'timberWarm' : 'timber', plank * .502, mezzanine - .011, -5.24, .484, .026, 3.4);
  }
  const stepDepth = .49;
  const stairX = 5.25;
  const firstZ = 4.55;
  const steps = 16;
  const rise = (mezzanine - ground) / steps;
  for (let step = 0; step < steps; step++) {
    const z = firstZ - step * stepDepth;
    const y = ground + (step + 1) * rise;
    box('timberWarm', stairX, y - rise / 2, z, 2.12, rise, stepDepth + .012);
    box('brass', stairX, y - .018, z + .235, 2.13, .035, .035);
    floors.push(bounds([stairX, y - rise / 2, z], [2.12, rise, stepDepth + .005]));
    for (const side of [-1, 1]) {
      if (step % 3 === 0) box('timber', stairX + side * 1.03, y + .51, z, .11, 1.02, .12);
      box('timber', stairX + side * 1.03, y + .98, z, .12, .13, stepDepth + .035);
    }
  }
  box('timber', stairX, mezzanine - .15, -3.40, 2.12, .3, .72);
  floors.push(bounds([stairX, mezzanine - .15, -3.4], [2.12, .3, .72]));
  function rail(x: number, z: number, length: number, alongX: boolean) {
    const w = alongX ? length : .11;
    const d = alongX ? .11 : length;
    box('timberWarm', x, mezzanine + .97, z, w, .13, d);
    for (let along = -.5 * length; along <= length * .5; along += .45) {
      box('timber', x + (alongX ? along : 0), mezzanine + .51, z + (alongX ? 0 : along), .1, 1.02, .1);
    }
    colliders.push(bounds([x, mezzanine + .46, z], [w, .92, d]));
  }
  rail(-.89, -3.57, 6.67, true);
  rail(-4.24, -.35, 6.39, false);

  function parcel(x: number, y: number, z: number, size: number) {
    box('parcel', x, y + size * .36, z, size, size * .72, size * .8);
    box('paper', x, y + size * .725, z, size * .095, .022, size * .795);
    box('paper', x, y + size * .73, z, size * .99, .024, size * .075);
    box('paper', x, y + size * .35, z + size * .408, size * .085, size * .69, .014);
  }
  parcel(-4.23, .27, 7.73, .58);
  parcel(-5.04, .27, 7.71, .7);
  parcel(-3.65, .27, 7.72, .39);
  parcel(-2.43, ground + 1.27, -1.58, .52);
  parcel(-1.77, ground + 1.27, -1.62, .34);
  parcel(1.39, ground + 1.27, -1.48, .45);
  parcel(2.93, ground, -6.2, .77);
  parcel(-5.8, mezzanine, -4.72, .61);
  parcel(-5.9, mezzanine, -5.5, .62);
  for (let z = -4; z <= 5; z += 4.5) {
    for (const x of [-3.37, 3.37]) {
      box('timber', x, 6.22, z, .065, 2.4, .065);
      lantern(x, 5.02, z);
    }
  }
  for (const z of [-5.7, -2.05, 2.15, 6.7]) box('timberWarm', 0, 7.24, z, 13.4, .29, .22);

  const hallLight = new PointLight('#ffc18a', 118, 15, 2);
  hallLight.position.set(0, 3.78, 1.9);
  const archiveLight = new PointLight('#ffd39b', 62, 11, 2);
  archiveLight.position.set(-1.6, 6.25, -4.8);
  model.add(hallLight, archiveLight);
  const entryRug = [0, ground + .02, 5.3] as const;
  box('redDark', ...entryRug, 2.69, .04, 2.55);
  for (const z of [4.12, 6.47]) box('brass', 0, ground + .045, z, 2.4, .012, .062);
  for (const x of [-1.19, 1.19]) box('brass', x, ground + .045, 5.3, .063, .012, 2.42);

  const geometry = new BoxGeometry();
  const dummy = new Object3D();
  for (const [tint, blocks] of batches) {
    const mesh = new InstancedMesh(geometry, palette[tint], blocks.length);
    mesh.name = 'Postal ' + tint;
    blocks.forEach(({ position, size, roll }, index) => {
      dummy.position.set(...position);
      dummy.scale.set(...size);
      dummy.rotation.z = roll;
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    model.add(mesh);
  }
  model.userData.colliders = colliders;
  model.userData.floors = floors;
  return model;
}
