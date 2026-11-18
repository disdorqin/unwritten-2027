import { BoxGeometry, BufferAttribute, BufferGeometry, Color, DataTexture, DynamicDrawUsage, Euler, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshLambertMaterial, Points, PointsMaterial, Quaternion, Vector3 } from 'three';
import type { Box, Ramp } from './landmark-kit';
import { addHotSpringDetails } from './hot-spring-details';
import { addLandmarkNameplate, useLandmarkEmissionMask } from './landmark-label';
import { hotSpringOuterStep, hotSpringPoolFloor, hotSpringPools } from './hot-spring-soak';

const palette = {
  snow: '#c3d6e3',
  slate: '#364955',
  granite: '#637786',
  lightStone: '#91a8b3',
  timber: '#74513d',
  pine: '#b38359',
  frame: '#243d48',
  glass: '#51919c',
  ice: '#9acce0',
  trim: '#d0985b',
  lantern: '#ffb867',
  water: '#499aab',
  deepWater: '#397489',
  spruce: '#2c5456',
} as const;

type Paint = keyof typeof palette;
type Point = [number, number, number];

export function buildHotSpring(): Group {
  const group = new Group();
  group.name = 'h02-hot-spring';
  const boxes = new Map<Paint, Matrix4[]>();
  const colliders: Box[] = [];
  const floors: Box[] = [];
  const ramps: Ramp[] = [];
  const position = new Vector3();
  const size = new Vector3();
  const facing = new Quaternion();
  const rotation = new Euler();

  function box(x: number, y: number, z: number, w: number, h: number, d: number, paint: Paint, pitch = 0, yaw = 0) {
    position.set(x, y, z);
    size.set(w, h, d);
    facing.setFromEuler(rotation.set(pitch, yaw, 0));
    const transform = new Matrix4().compose(position, facing, size);
    const batch = boxes.get(paint);
    if (batch) batch.push(transform);
    else boxes.set(paint, [transform]);
  }

  function bounds(x: number, top: number, z: number, w: number, d: number, h: number): Box {
    return { min: [x - w / 2, top - h, z - d / 2], max: [x + w / 2, top, z + d / 2] };
  }

  function solid(x: number, z: number, w: number, h: number, d: number, paint: Paint, bottom = 0) {
    box(x, bottom + h / 2, z, w, h, d, paint);
    colliders.push(bounds(x, bottom + h, z, w, d, h));
  }

  function floor(x: number, top: number, z: number, w: number, d: number, h: number, paint: Paint) {
    box(x, top - h / 2, z, w, h, d, paint);
    floors.push(bounds(x, top, z, w, d, h));
  }

  function paving(x: number, z: number, w: number, d: number) {
    floor(x, .18, z, w, d, .19, 'granite');
    for (let row = 0; row < Math.floor(d / .92); row++) {
      const tileZ = z - d / 2 + .46 + row * .92;
      for (let cursor = -w / 2 + .17 + (row % 2) * .68; cursor + 1.27 < w / 2; cursor += 1.36) {
        const tone = (Math.round(cursor * 1.5) + row) % 4 === 0 ? 'lightStone' : 'slate';
        box(x + cursor + .635, .182, tileZ, 1.27, .021, .83, tone);
      }
    }
  }

  function masonry(x: number, z: number, w: number, d: number, top: number, rough = false) {
    solid(x, z, w, top, d, 'granite');
    const horizontal = w > d;
    const length = horizontal ? w : d;
    for (let row = 0; row * .32 + .16 < top - .05; row++) {
      for (let cursor = -length / 2 + .15 + (row % 2) * .37; cursor + .66 <= length / 2; cursor += .75) {
        const pattern = rough ? Math.floor(cursor * 19 + row * 7 + x * 13 + z * 9) : Math.round(cursor * 2) + row;
        const tone = Math.abs(pattern) % (rough ? 2 : 4) === 0 ? 'lightStone' : 'slate';
        const y = .16 + row * .32;
        const stoneLip = rough ? .06 : .03;
        if (horizontal) box(x + cursor + .33, y, z, .66, .24, d + stoneLip, tone);
        else box(x, y, z + cursor + .33, w + stoneLip, .24, .66, tone);
      }
    }
  }

  function lantern(x: number, y: number, z: number) {
    box(x, y, z, .27, .36, .27, 'lantern');
    for (const dy of [-.21, .21]) box(x, y + dy, z, .36, .07, .36, 'frame');
    for (const dx of [-.135, .135]) for (const dz of [-.135, .135]) {
      box(x + dx, y, z + dz, .035, .38, .035, 'frame');
    }
  }

  function bollard(x: number, z: number) {
    solid(x, z, .26, .84, .26, 'timber');
    lantern(x, 1.06, z);
  }

  function bench(x: number, z: number) {
    for (const offset of [-.88, .88]) box(x + offset, .43, z, .16, .5, .42, 'frame');
    solid(x, z, 2.42, .16, .6, 'pine', .63);
    for (const offset of [-.18, .03, .24]) box(x, .796, z + offset, 2.46, .035, .125, 'pine');
    solid(x, z + .29, 2.46, .49, .14, 'timber', .79);
    colliders.push(bounds(x, .63, z, 2.38, .6, .45));
  }

  function planter(x: number, z: number, width: number, depth: number, spruceCount: number) {
    masonry(x, z, width, depth, .48);
    box(x, .49, z, width - .08, .05, depth - .08, 'snow');
    for (let index = 0; index < spruceCount; index++) {
      const treeX = x + width * ((index + .5) / spruceCount - .5);
      const treeZ = z + (index % 2 ? -.13 : .13);
      box(treeX, .86, treeZ, .2, .72, .2, 'timber');
      for (let tier = 0; tier < 4; tier++) {
        const spread = 1.19 - tier * .235;
        box(treeX, 1.12 + tier * .31, treeZ, spread, .3, spread, 'spruce', 0, Math.PI / 4);
        box(treeX, 1.28 + tier * .31, treeZ, spread * .65, .06, spread * .65, 'snow', 0, Math.PI / 4);
      }
    }
  }

  // The west entrance continues directly from the existing approach road.
  paving(-4.1, 0, 39.8, 4.1);
  paving(-8, -6.8, 4.1, 13.6);
  paving(7.2, -5.1, 27.7, 3.4);
  paving(9.9, 2.62, 3.4, 3.6);
  paving(-1, -8.15, 8.6, 9.4);
  paving(12.05, -7.6, 11.9, 9.45);
  // Stop at the existing west walkway edge; together they form one deck without overlapping stone tiles.
  paving(-15, -6.65, 9.9, 7.5);

  for (const z of [-2.45, 2.45]) {
    masonry(-22.05, z, .85, .79, 3.08);
    box(-22.05, 3.18, z, 1.03, .19, .95, 'lightStone');
    lantern(-22.53, 2.15, z);
    box(-22.08, 3.49, z, .75, .18, .75, 'snow');
  }
  box(-22.05, 3.28, 0, .52, .32, 5.95, 'timber');
  box(-22.05, 3.49, 0, .68, .12, 6.3, 'snow');
  box(-22.36, 3.02, 0, .11, .49, 2.22, 'slate');

  planter(-16.7, -3.4, 7.2, 2.35, 4);
  planter(-16.7, 5.55, 8.9, 2.45, 4);
  planter(-10.5, -13.64, 8.6, 2.1, 4);
  planter(15.8, -13.56, 11.7, 1.85, 5);
  planter(21.95, 4.5, 2.2, 4.15, 1);
  for (const x of [-19.6, -13.2, -4.8, 1.3, 4.7, 15.05]) bollard(x, 2.57);

  function bath({ x, z, width, depth, water, rough }: (typeof hotSpringPools)[number]) {
    const edge = .42;
    const gap = 2.08;
    const wing = (width - gap) / 2;
    const sideX = (width + gap) / 4;
    const front = z + depth / 2;
    const back = z - depth / 2;
    const left = x - width / 2;
    const right = x + width / 2;
    floor(x, hotSpringPoolFloor, z, width - .12, depth - .1, .23, 'slate');
    box(x, .51, z, width - .43, .045, depth - .45, water);
    for (const [atX, atZ, w, d] of [
      [left, z, edge, depth],
      [right, z, edge, depth],
      [x, back, width + edge, edge],
      [x - sideX, front, wing, edge],
      [x + sideX, front, wing, edge],
    ]) {
      masonry(atX, atZ, w, d, .86, rough);
      box(atX, .9, atZ, w + .10, .09, d + .10, 'lightStone');
    }
    floor(x, hotSpringOuterStep, front + .71, 1.9, .8, .14, 'granite');
    floor(x, hotSpringPoolFloor, front + .13, 1.9, .84, .20, 'lightStone');
    for (const offset of [-1.18, 1.18]) {
      solid(x + offset, front + .78, .12, .82, .12, 'frame', .18);
      box(x + offset, 1.0, front + .36, .12, .10, .92, 'trim');
    }
    const streaks = rough ? 3 : 6;
    for (let streak = 0; streak < streaks; streak++) {
      const wave = (streak * 19 % 11) / 11 - .5;
      const waterline = z + (streak - (streaks - 1) / 2) * depth / (streaks + 2);
      box(x + width * wave * .57, .538, waterline, 1.02 + streak % 3 * .4, .013, .084, 'ice');
    }
  }

  for (const pool of hotSpringPools) bath(pool);
  for (const x of [-4.4, 3.1, 7.9, 16.3]) bollard(x, -11.78);
  bench(4.62, -8.55);
  function stoneLight(x: number, z: number) {
    solid(x, z, .42, .17, .42, 'granite', .16);
    box(x, .56, z, .20, .46, .20, 'slate');
    box(x, .82, z, .40, .11, .40, 'lightStone');
    box(x, 1.03, z, .27, .31, .27, 'lantern');
    for (const dx of [-.16, .16]) for (const dz of [-.16, .16]) {
      box(x + dx, 1.02, z + dz, .05, .36, .05, 'slate');
    }
    box(x, 1.24, z, .52, .12, .52, 'lightStone');
    box(x, 1.31, z, .45, .06, .45, 'snow');
  }

  function bambooFence(x: number, z: number, length: number, turned = false) {
    const width = turned ? .11 : length;
    const depth = turned ? length : .11;
    solid(x, z, width, .09, depth, 'timber', .38);
    box(x, 1.07, z, width, .09, depth, 'timber');
    colliders.push(bounds(x, 1.25, z, width, depth, 1.25));
    for (let slot = .12; slot < length; slot += .24) {
      const offset = slot - length / 2;
      const height = 1.29 + Math.sin(slot) * .11;
      box(x + (turned ? 0 : offset), .12 + height / 2, z + (turned ? offset : 0),
        .06, height, .06, 'pine');
    }
  }
  bambooFence(-1.5, -13.9, 37);
  bambooFence(-18.4, -8.5, 5, true);
  for (const [x, z] of [[-17.85, -11.76], [-4.65, -11], [12.2, -11.77], [17.42, -9.75], [20.9, -13.58]]) {
    stoneLight(x, z);
  }
  for (const [x, z] of [[17.65, -6.3], [22.41, -6.11], [22.32, -10.85], [21.92, -12.55], [18.1, -12.32], [19.3, -13.58]]) {
    bollard(x, z);
  }
  const stones = [
    [-10.15, -3.15], [-10.36, -4], [-10.55, -4.83], [-10.96, -5.65], [-11.78, -5.90], [-12.62, -5.98],
    [22.95, -6.2], [23.15, -7.05], [23.22, -7.9], [23.25, -8.75], [23.24, -9.6], [23.12, -10.45],
  ];
  for (const [index, [x, z]] of stones.entries()) {
    const yaw = .15 * Math.sin(index * 2.14);
    const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
    box(x, .175, z, .9, .06, .7, 'slate', 0, yaw);
    floors.push(bounds(x, .205, z, .9 * c + .7 * s, .9 * s + .7 * c, .06));
  }

  function stoneSeat(x: number, z: number) {
    for (const offset of [-.42, .42]) box(x + offset, .32, z, .20, .32, .47, 'slate');
    solid(x, z, 1.32, .17, .58, 'lightStone', .47);
  }
  stoneSeat(17.9, -7.05);
  stoneSeat(21.64, -4.5);

  // Lodge, with a clear north-facing doorway and an interior without collision across the aisle.
  floor(11.15, .26, 8.72, 20.3, 11.44, .26, 'timber');
  for (let row = 0; row < 20; row++) box(11.15, .267, 3.37 + row * .56, 19.84, .016, .50, 'pine');
  masonry(11.15, 14.23, 20.3, .42, 3.6);
  masonry(1.19, 8.78, .38, 10.81, 3.54);
  masonry(21.1, 8.78, .38, 10.81, 3.54);

  function bay(x: number, width: number) {
    const front = 3.33;
    masonry(x, front, width, .4, .76);
    solid(x, front, width, 2.58, .12, 'glass', .76);
    box(x, 3.39, front, width + .04, .2, .32, 'frame');
    for (const offset of [-width / 2, 0, width / 2]) box(x + offset, 2.0, front - .09, .12, 2.64, .26, 'frame');
    box(x, 1.86, front - .10, width, .12, .24, 'frame');
    box(x, 3.25, front - .14, width - .08, .045, .09, 'ice');
  }

  for (const [x, w] of [[2.94, 3.42], [6.35, 3.42], [13.47, 3.32], [16.72, 3.32], [19.84, 2.78]]) bay(x, w);
  for (const x of [1.22, 4.67, 8.08, 11.78, 15.09, 18.37, 21.15]) {
    solid(x, 3.25, .22, 3.55, .29, 'timber');
  }
  floor(9.94, .26, 3.33, 3.42, 1.15, .19, 'lightStone');
  box(9.94, 3.43, 3.25, 3.64, .27, .66, 'timber');
  box(9.94, 3.61, 3.05, 3.84, .11, .83, 'snow');
  lantern(8.28, 2.22, 3.02);
  lantern(11.6, 2.22, 3.02);

  // Snow-capped twin roof slopes. Local +z is south.
  const ridgeline = 8.76;
  const eaveSpan = 6.36;
  const roofAngle = .4;
  const eaveHeight = 3.74;
  const roofMidpoint = eaveHeight + Math.tan(roofAngle) * eaveSpan / 2;
  const angledLength = eaveSpan / Math.cos(roofAngle);
  for (const side of [-1, 1]) {
    const roofZ = ridgeline + side * eaveSpan / 2;
    box(11.16, roofMidpoint, roofZ, 21.5, .21, angledLength, 'slate', side * roofAngle);
    box(11.16, roofMidpoint + .14, roofZ, 21.0, .11, angledLength * .95, 'snow', side * roofAngle);
    for (let seam = 0; seam < 13; seam++) {
      box(1.1 + seam * 1.67, roofMidpoint + .21, roofZ, .072, .08, angledLength * .97, 'lightStone', side * roofAngle);
    }
    box(11.16, eaveHeight - .02, ridgeline + side * eaveSpan, 21.8, .2, .24, 'timber');
  }
  const ridgeHeight = eaveHeight + Math.tan(roofAngle) * eaveSpan;
  box(11.16, ridgeHeight + .12, ridgeline, 21.8, .25, .26, 'slate');
  box(11.16, ridgeHeight + .275, ridgeline, 21.56, .08, .175, 'snow');
  for (const x of [1.16, 21.15]) {
    for (let slat = -8; slat <= 8; slat++) {
      const z = ridgeline + slat * .64;
      const h = ridgeHeight - 3.51 - Math.abs(z - ridgeline) * Math.tan(roofAngle);
      box(x, 3.51 + h / 2, z, .20, h, .6, slat % 2 ? 'timber' : 'pine');
    }
  }

  for (const x of [4.65, 8.1, 13.8, 17.2]) {
    bench(x, 12.95);
    lantern(x, 2.33, 13.97);
  }
  for (const x of [3.45, 17.98, 19.27]) {
    solid(x, 6.0, 1.02, 1.94, .58, 'timber', .26);
    box(x, 1.25, 5.69, .86, .05, .04, 'trim');
    for (const dx of [-.24, .24]) box(x + dx, 1.36, 5.67, .035, .17, .05, 'frame');
  }
  for (const [x, z] of [[4.72, 9.6], [16.17, 9.6]]) {
    solid(x, z, 1.4, .68, 1.02, 'slate', .26);
    box(x, .97, z, 1.66, .13, 1.21, 'pine');
    box(x - .38, 1.06, z, .26, .06, .27, 'trim');
  }
  masonry(19.98, 13.21, 1.38, 1.02, 2.18);
  box(19.98, .92, 12.69, .81, .38, .08, 'lantern');
  box(19.98, 3.4, 13.21, .42, 2.56, .43, 'frame');

  // A low timber sauna fills the west yard and shares the approach promenade.
  paving(-9.5, 3.91, 2.95, 4.03);
  floor(-9.5, .25, 10.28, 9.84, 8.04, .25, 'timber');
  floor(-9.5, .25, 6.23, 2.8, 1.42, .19, 'lightStone');
  for (let row = 0; row < 14; row++) box(-9.5, .257, 6.6 + row * .56, 9.44, .016, .5, 'pine');

  function saunaWall(x: number, z: number, w: number, d: number) {
    masonry(x, z, w, d, .62);
    solid(x, z, w - .025, 2.33, d - .025, 'timber', .62);
    const horizontal = w > d;
    const length = horizontal ? w : d;
    for (let offset = -length / 2 + .25; offset < length / 2; offset += .36) {
      if (horizontal) box(x + offset, 1.7, z, .06, 2.14, d + .055, 'pine');
      else box(x, 1.7, z + offset, w + .055, 2.14, .06, 'pine');
    }
  }

  saunaWall(-14.23, 10.36, .35, 7.81);
  saunaWall(-4.77, 10.36, .35, 7.81);
  saunaWall(-9.5, 14.21, 9.78, .35);
  for (const x of [-12.51, -6.49]) {
    const front = 6.42;
    masonry(x, front, 3.4, .35, .96);
    solid(x, front, 3.4, 1.35, .15, 'glass', .96);
    solid(x, front, 3.4, .62, .35, 'timber', 2.31);
    for (const dx of [-1.7, 0, 1.7]) box(x + dx, 1.61, front, .11, 1.44, .31, 'frame');
    box(x, 1.72, front, 3.4, .10, .24, 'frame');
  }
  for (const x of [-10.8, -8.2]) {
    solid(x, 6.42, .2, 2.99, .34, 'timber');
    lantern(x, 2.02, 6.1);
  }
  box(-9.5, 2.83, 6.42, 2.8, .36, .38, 'timber');
  box(-9.5, 2.58, 6.21, 1.48, .22, .12, 'trim');
  const saunaRidge = 10.38;
  const saunaRun = 4.57;
  const saunaPitch = .38;
  const saunaEaveY = 2.94;
  const saunaRoofY = saunaEaveY + Math.tan(saunaPitch) * saunaRun / 2;
  for (const side of [-1, 1]) {
    const midZ = saunaRidge + side * saunaRun / 2;
    const depth = saunaRun / Math.cos(saunaPitch);
    box(-9.5, saunaRoofY, midZ, 10.5, .18, depth, 'slate', side * saunaPitch);
    box(-9.5, saunaRoofY + .12, midZ, 10.23, .10, depth * .95, 'snow', side * saunaPitch);
    for (let seam = -4; seam <= 4; seam++) box(-9.5 + seam * 1.13, saunaRoofY + .19, midZ, .055, .065, depth * .97, 'lightStone', side * saunaPitch);
  }
  const saunaRidgeY = saunaEaveY + Math.tan(saunaPitch) * saunaRun;
  box(-9.5, saunaRidgeY + .09, saunaRidge, 10.6, .18, .26, 'slate');
  for (const x of [-14.24, -4.76]) {
    for (let slat = -6; slat <= 6; slat++) {
      const offset = slat * .59;
      const h = saunaRidgeY - 2.91 - Math.abs(offset) * Math.tan(saunaPitch);
      box(x, 2.91 + h / 2, saunaRidge + offset, .18, h, .56, slat % 2 ? 'pine' : 'timber');
    }
  }
  bench(-11.88, 13.44);
  lantern(-11.88, 2.14, 14.0);
  masonry(-6.42, 12.52, 1.16, .92, 1.36);
  box(-6.42, 1.02, 12.04, .70, .27, .07, 'lantern');
  box(-6.42, 3.53, 12.52, .28, 4.34, .28, 'frame');
  box(-6.42, 5.78, 12.52, .53, .15, .53, 'snow');

  addHotSpringDetails({ box, solid, colliders });

  const geometry = new BoxGeometry();
  const opaque = [...boxes.entries()].filter(([paint]) => paint !== 'glass');
  const instanceCount = opaque.reduce((sum, [, transforms]) => sum + transforms.length, 0);
  const opaqueMaterial = new MeshLambertMaterial({ emissive: '#f48942', emissiveIntensity: 1.05 });
  useLandmarkEmissionMask(opaqueMaterial);
  const emission = new Float32Array(instanceCount);
  geometry.setAttribute('landmarkEmission', new InstancedBufferAttribute(emission, 1));
  const base = new InstancedMesh(geometry, opaqueMaterial, instanceCount);
  let index = 0;
  for (const [paint, transforms] of opaque) {
    const tint = new Color(palette[paint]);
    for (const transform of transforms) {
      base.setMatrixAt(index, transform);
      base.setColorAt(index, tint);
      emission[index++] = Number(paint === 'lantern');
    }
  }
  base.name = 'hot-spring-opaque';
  base.computeBoundingSphere();
  group.add(base);

  const glass = boxes.get('glass') ?? [];
  const glassMaterial = new MeshLambertMaterial({
    color: palette.glass, emissive: '#317889', emissiveIntensity: .43,
    transparent: true, opacity: .52, depthWrite: false,
  });
  const glaze = new InstancedMesh(geometry, glassMaterial, glass.length);
  glass.forEach((transform, index) => glaze.setMatrixAt(index, transform));
  glaze.computeBoundingSphere();
  glaze.name = 'hot-spring-glass';
  group.add(glaze);
  addLandmarkNameplate(group, '温泉', -22.425, 3.02, 0, 2.08, .42, -Math.PI / 2,
    { background: '#543924', color: '#fff2cf', accent: '#d69854' });
  group.userData.colliders = colliders;
  group.userData.floors = floors;
  group.userData.ramps = ramps;
  const seats: Point[] = [[-11.88, .82, 13.44], [4.65, .82, 12.95], [8.1, .82, 12.95], [13.8, .82, 12.95], [17.2, .82, 12.95]];
  group.userData.seats = seats;
  group.userData.updateSteam = addBathSteam(group);
  return group;
}

function addBathSteam(group: Group) {
  const size = 16;
  const texels = new Uint8Array(size * size * 4);
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const radius = Math.hypot(x + .5 - size / 2, z + .5 - size / 2) / (size / 2);
      const offset = (z * size + x) * 4;
      texels.fill(255, offset, offset + 3);
      texels[offset + 3] = Math.round(255 * Math.max(0, 1 - radius * radius) ** 2);
    }
  }
  const texture = new DataTexture(texels, size, size);
  texture.needsUpdate = true;
  const particlesPerPool = 10;
  const positions = new Float32Array(hotSpringPools.length * particlesPerPool * 3);
  const geometry = new BufferGeometry();
  const buffer = new BufferAttribute(positions, 3).setUsage(DynamicDrawUsage);
  geometry.setAttribute('position', buffer);
  const steam = new Points(geometry, new PointsMaterial({
    map: texture, color: '#e6f3ff', transparent: true, opacity: .32, depthWrite: false, size: 1.65,
  }));
  steam.name = 'Bath steam';
  steam.visible = false;
  steam.frustumCulled = false;
  group.add(steam);
  let elapsed = 0;
  return (dt: number, distance: number) => {
    steam.visible = distance < 50;
    if (!steam.visible) return;
    elapsed += dt;
    hotSpringPools.forEach(({ x, z, width, depth }, pool) => {
      const radiusX = width * .32, radiusZ = depth * .29;
      for (let particle = 0; particle < particlesPerPool; particle++) {
        const i = pool * particlesPerPool + particle;
        const age = (elapsed * .27 + i * .61803) % 1;
        const angle = i * 2.39996;
        positions[i * 3] = x + radiusX * Math.cos(angle) + age * .4;
        positions[i * 3 + 1] = .62 + age * 2.45;
        positions[i * 3 + 2] = z + radiusZ * Math.sin(angle + age * .8);
      }
    });
    buffer.needsUpdate = true;
  };
}
