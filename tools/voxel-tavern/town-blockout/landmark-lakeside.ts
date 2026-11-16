import {
  AdditiveBlending, BoxGeometry, BufferGeometry, Color, CylinderGeometry, Float32BufferAttribute, Group,
  Matrix4, Mesh, MeshLambertMaterial, Quaternion, ShaderMaterial, Vector3, DoubleSide, FrontSide,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Box, TownPlot } from './landmark-kit';

type Point = [number, number, number];
const palette = {
  stone: '#617180', slate: '#3e515c', snow: '#cee0ed',
  white: '#d9cab7', red: '#a63b49', deepRed: '#702b3d', yellow: '#d6a662',
  oak: '#9c694a', wood: '#674635', iron: '#2f5c62', darkIron: '#223f4b',
  glass: '#abd6d4', ice: '#78c6e9', amber: '#ffbc65', black: '#37272c',
  leaf: '#498158', paleLeaf: '#75a15b', soil: '#4b3a35',
} as const;
type Paint = keyof typeof palette;

function model() {
  const meshes = new Map<Paint, BufferGeometry[]>();
  const group = new Group();
  const colliders: Box[] = [];
  const floors: Box[] = [];
  const bounds = (x: number, top: number, z: number, w: number, d: number, h: number): Box => ({
    min: [x - w / 2, top - h, z - d / 2], max: [x + w / 2, top, z + d / 2],
  });
  const solid = (x: number, top: number, z: number, w: number, d: number, h: number) => colliders.push(bounds(x, top, z, w, d, h));
  const floor = (x: number, top: number, z: number, w: number, d: number, h: number) => floors.push(bounds(x, top, z, w, d, h));
  const position = new Vector3();
  const rotation = new Quaternion();
  const scale = new Vector3(1, 1, 1);
  const transform = new Matrix4();
  const yAxis = new Vector3(0, 1, 0);
  const add = (geometry: BufferGeometry, at: Point, paint: Paint, angle = 0, orientation?: Quaternion) => {
    position.set(...at);
    rotation.setFromAxisAngle(yAxis, angle);
    transform.compose(position, orientation ?? rotation, scale);
    geometry.applyMatrix4(transform);
    const item = geometry.index ? geometry.toNonIndexed() : geometry;
    if (geometry !== item) geometry.dispose();
    if (!meshes.has(paint)) meshes.set(paint, []);
    meshes.get(paint)!.push(item);
  };
  const box = (x: number, y: number, z: number, w: number, h: number, d: number, paint: Paint, yaw = 0) =>
    add(new BoxGeometry(w, h, d), [x, y, z], paint, yaw);
  const cylinder = (x: number, y: number, z: number, rt: number, rb: number, h: number, paint: Paint, sides = 16) =>
    add(new CylinderGeometry(rt, rb, h, sides), [x, y, z], paint);
  const beam = (from: Point, to: Point, width: number, paint: Paint, depth = width) => {
    const a = new Vector3(...from);
    const b = new Vector3(...to);
    const axis = b.clone().sub(a);
    const orientation = new Quaternion().setFromUnitVectors(yAxis, axis.clone().normalize());
    add(new BoxGeometry(width, axis.length(), depth), a.lerp(b, .5).toArray(), paint, 0, orientation);
  };
  const panel = (quad: [Point, Point, Point, Point], paint: Paint) => {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute([quad[0], quad[1], quad[2], quad[0], quad[2], quad[3]].flat(), 3));
    geo.computeVertexNormals();
    geo.setAttribute('uv', new Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
    add(geo, [0, 0, 0], paint);
  };
  function finish() {
    for (const [paint, pieces] of meshes) {
      const transparent = paint === 'glass';
      const gold = paint === 'amber';
      const material = new MeshLambertMaterial({
        color: new Color(palette[paint]),
        emissive: gold ? '#ff9e3d' : transparent ? '#304949' : '#000',
        emissiveIntensity: gold ? 1.6 : transparent ? .35 : 0,
        transparent,
        opacity: transparent ? .24 : 1,
        depthWrite: !transparent,
        side: transparent || paint === 'white' || paint === 'red' || paint === 'ice' ? DoubleSide : FrontSide,
      });
      const shape = mergeGeometries(pieces);
      pieces.forEach(piece => piece.dispose());
      if (shape) group.add(new Mesh(shape, material));
    }
    group.userData.colliders = colliders;
    group.userData.floors = floors;
    return group;
  }
  return { box, cylinder, beam, panel, solid, floor, finish };
}

// The four .25-meter-rise flights, three masonry bands, lookout ring, and
// stepped lantern roof are retained from the original build-lakeside layout.
// B24 changes the tower silhouette to tapered masonry and faces the lane north.
function lighthouse() {
  const { box, cylinder, beam, solid, floor, finish } = model();
  cylinder(0, .19, 0, 5.34, 5.55, .38, 'slate');
  cylinder(0, .39, 0, 5.23, 5.32, .14, 'stone');
  for (let i = 0; i < 16; i++) {
    const angle = i * Math.PI / 8;
    box(Math.sin(angle) * 4.9, .5, -Math.cos(angle) * 4.9, .92, .12, .54, 'snow', -angle);
  }
  const radiusAt = (y: number) => 4.65 - y * .096;
  for (let row = 0; row < 19; row++) {
    const y = .48 + row * .58;
    const radius = radiusAt(y);
    const paint: Paint = row < 2 ? 'stone' : row >= 10 && row <= 14 ? 'red' : 'white';
    for (let i = 0; i < 16; i++) {
      const angle = Math.PI * (i + (row % 2) * .5) / 8;
      const door = Math.cos(angle) > .88 && Math.abs(Math.sin(angle) * radius) < 1.35 && row < 5;
      const slit = row % 6 === 4 && (i % 4 === 0);
      const x = Math.sin(angle) * radius;
      const z = -Math.cos(angle) * radius;
      if (!door) box(x, y + .29, z, Math.PI * radius / 8 + .03, .579, slit ? .25 : .47,
        slit ? 'amber' : paint, -angle);
    }
  }
  for (const y of [1.65, 6.23, 9.15, 11.5]) {
    const r = radiusAt(y) + .18;
    for (let i = 0; i < 16; i++) {
      if (y < 3 && (i <= 1 || i >= 15)) continue;
      const angle = i * Math.PI / 8;
      box(Math.sin(angle) * r, y, -Math.cos(angle) * r, Math.PI * r / 8 + .07, .13, .26, 'stone', -angle);
    }
  }
  for (let i = 1; i < 16; i++) {
    const a = i * Math.PI / 8;
    const r = 4.52;
    const w = 1.71 * Math.abs(Math.cos(a)) + .5 * Math.abs(Math.sin(a));
    const d = 1.71 * Math.abs(Math.sin(a)) + .5 * Math.abs(Math.cos(a));
    solid(Math.sin(a) * r, 10.8, -Math.cos(a) * r, w, d, 10.8);
  }
  box(0, .11, -5.65, 3.05, .22, .67, 'stone');
  floor(0, .22, -5.65, 3.05, .67, .22);
  box(0, .23, -5.15, 3, .46, .77, 'stone');
  floor(0, .46, -5.15, 3, .77, .46);
  floor(0, .46, 0, 6.1, 9.75, .14);
  floor(0, .46, 0, 8.75, 5.78, .14);
  for (const x of [-1.46, 1.46]) {
    box(x, 1.61, -4.46, .32, 2.81, .63, 'oak');
    box(x * 1.2, 2.33, -4.61, .38, .42, .37, 'amber');
  }
  box(0, 3.01, -4.46, 3.25, .24, .65, 'oak');
  for (const [x, z, startY, dx, dz] of [
    [-2.58, -2.56, .46, 1, 0], [2.36, -1.77, 3.30, 0, 1],
    [1.64, 2.33, 6.14, -1, 0], [-2.24, 1.63, 8.98, 0, -1],
  ]) {
    for (let step = 1; step <= 11; step++) {
      const xx = x + dx * (step - 1) * .38;
      const zz = z + dz * (step - 1) * .38;
      const level = startY + step * (2.84 / 11);
      box(xx, level - .13, zz, dx ? .4 : 1.28, .26, dz ? .4 : 1.28, step % 3 ? 'oak' : 'wood');
      floor(xx, level, zz, dx ? .4 : 1.28, dz ? .4 : 1.28, .26);
    }
  }
  for (const [x, y, z] of [[1.82, 3.3, -2.48], [2.32, 6.14, 2.21], [-2.19, 8.98, 2.28]]) {
    box(x, y - .125, z, 1.55, .25, 1.55, 'oak');
    floor(x, y, z, 1.55, 1.55, .25);
  }
  // The lookout stays open above the last flight. Square stone tiles avoid
  // blocking the stairs, while preserving the previous wrap-around railing.
  const rail = 4.2;
  for (let x = -4; x <= 4; x += .5) {
    for (let z = -4; z <= 4; z += .5) {
      if (Math.hypot(x, z) > 4.34) continue;
      if (x >= -3 && x <= -1.5 && z >= -2.1 && z <= .25) continue;
      const outer = Math.hypot(x, z) > 3.9;
      box(x, 11.94, z, .5, .24, .5, outer ? 'snow' : 'stone');
      floor(x, 12.06, z, .5, .5, .24);
    }
  }
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const b = (i + 1) * Math.PI / 8;
    const x = Math.sin(a) * rail;
    const z = Math.cos(a) * rail;
    const ex = Math.sin(b) * rail;
    const ez = Math.cos(b) * rail;
    box(x, 12.52, z, .14, .91, .14, 'oak');
    beam([x, 12.92, z], [ex, 12.92, ez], .17, 'wood');
    solid((x + ex) / 2, 13, (z + ez) / 2, Math.abs(x - ex) + .12, Math.abs(z - ez) + .12, .94);
  }
  cylinder(0, 12.22, 0, 2.25, 2.36, .28, 'deepRed');
  solid(0, 14.9, 0, 2.85, 2.85, 2.84);
  cylinder(0, 13.42, 0, 1.86, 1.86, 2.43, 'amber', 12);
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6;
    box(Math.sin(a) * 1.93, 13.48, Math.cos(a) * 1.93, .15, 2.72, .18, 'wood', a);
  }
  cylinder(0, 14.82, 0, 2.52, 2.52, .29, 'yellow');
  cylinder(0, 15.25, 0, 1.95, 2.43, .57, 'red');
  cylinder(0, 15.74, 0, .8, 1.95, .47, 'deepRed');
  cylinder(0, 16.17, 0, .07, .82, .48, 'red');
  cylinder(0, 16.63, 0, .09, .09, .49, 'yellow', 8);
  const group = finish();
  const beaconPivot = new Group();
  beaconPivot.name = 'lighthouse-beacon';
  beaconPivot.position.y = 13.42;
  beaconPivot.rotation.y = -Math.PI * .43;
  const beamLength = 57;
  const beamGeometry = new CylinderGeometry(4.5, .38, beamLength, 20, 1, true);
  beamGeometry.rotateX(Math.PI / 2);
  const beamMaterial = new ShaderMaterial({
    uniforms: { beamColor: { value: new Color('#9ac8ff') } },
    vertexShader: `
      varying vec2 beamUv;
      varying vec3 beamNormal;
      varying vec3 beamView;
      void main() {
        beamUv = uv;
        beamNormal = normalMatrix * normal;
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        beamView = -viewPosition.xyz;
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 beamColor;
      varying vec2 beamUv;
      varying vec3 beamNormal;
      varying vec3 beamView;
      void main() {
        float rim = abs(dot(normalize(beamNormal), normalize(beamView)));
        float glow = (1.0 - smoothstep(0.01, 1.0, beamUv.y)) * smoothstep(0.0, 0.8, rim) * 0.16;
        gl_FragColor = vec4(beamColor, glow);
        #include <colorspace_fragment>
      }
    `,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    forceSinglePass: true,
    toneMapped: false,
  });
  const lightBeam = new Mesh(beamGeometry, beamMaterial);
  lightBeam.position.z = beamLength / 2 + 1.87;
  lightBeam.rotation.x = -.03;
  beaconPivot.add(lightBeam);
  group.add(beaconPivot);
  group.userData.beaconPivot = beaconPivot;
  return group;
}

// A radial platform, striped crown, and the old six wooden horses carry over
// from build-festival and festival-scene, with the B24 brass gallery lights.
function carousel() {
  const { box, cylinder, panel, beam, solid, floor, finish } = model();
  const rotating = model();
  cylinder(0, .14, 0, 6.76, 6.76, .28, 'stone', 32);
  rotating.cylinder(0, .39, 0, 6.14, 6.37, .28, 'deepRed', 32);
  rotating.cylinder(0, .56, 0, 6.04, 6.14, .13, 'yellow', 32);
  rotating.cylinder(0, .63, 0, 5.93, 5.93, .15, 'oak', 32);
  cylinder(0, 3.55, 0, 1.03, 1.03, 5.85, 'deepRed', 12);
  cylinder(0, 2.15, 0, 1.09, 1.09, .16, 'yellow', 12);
  cylinder(0, 3.71, 0, 1.09, 1.09, .16, 'yellow', 12);
  cylinder(0, 5.15, 0, 1.09, 1.09, .16, 'yellow', 12);
  const radial = (angle: number, y: number, r: number): Point => [Math.sin(angle) * r, y, Math.cos(angle) * r];
  const slices = 16;
  for (let i = 0; i < slices; i++) {
    const a = i * Math.PI * 2 / slices;
    const b = (i + 1) * Math.PI * 2 / slices;
    const paint = i % 2 ? 'red' : 'white';
    panel([radial(a, 8.62, .55), radial(b, 8.62, .55), radial(b, 7.13, 3.55), radial(a, 7.13, 3.55)], paint);
    panel([radial(a, 7.13, 3.55), radial(b, 7.13, 3.55), radial(b, 6.18, 6.3), radial(a, 6.18, 6.3)], paint);
    panel([radial(a, 6.18, 6.3), radial(b, 6.18, 6.3), radial(b, 5.59, 6.29), radial(a, 5.59, 6.29)], 'red');
    beam(radial(a, 6.19, 6.31), radial(b, 6.19, 6.31), .1, 'yellow');
    beam(radial(a, 5.59, 6.31), radial(b, 5.59, 6.31), .11, 'yellow');
    for (let light = 0; light < 5; light++) {
      const angle = a + (b - a) * (light + .1) / 5;
      const [x, , z] = radial(angle, 0, 6.31);
      box(x, 5.74 + Math.sin(light * Math.PI / 4) * .11, z, .12, .17, .12, 'amber', angle);
    }
    const [x, , z] = radial((a + b) / 2, 0, 6.32);
    box(x, 5.98, z, .22, .2, .17, 'amber', (a + b) / 2);
  }
  cylinder(0, 8.69, 0, .56, .67, .23, 'yellow');
  cylinder(0, 9.02, 0, .14, .33, .43, 'amber', 8);
  const rideSeat = new Group();
  rideSeat.name = 'carousel-seat-view';
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3 + Math.PI / 6;
    const r = 4.24;
    const [x, , z] = radial(a, 0, r);
    rotating.cylinder(x, 3.12, z, .066, .066, 4.98, 'yellow', 8);
    if (i === 0) {
      rideSeat.position.set(x - Math.sin(a) * .24, 3.96, z - Math.cos(a) * .24);
      rideSeat.rotation.y = a + Math.PI / 3;
    }
    for (const angle of [a - .21, a, a + .21]) {
      const [lightX, , lightZ] = radial(angle, 0, 6.26);
      rotating.box(lightX, .4, lightZ, .15, .097, .12, 'amber', angle);
    }
    const coat = i % 3 !== 1 ? 'white' : 'oak';
    const piece = (dx: number, y: number, dz: number, w: number, h: number, d: number, paint: Paint) =>
      rotating.box(x + Math.cos(a) * dx + Math.sin(a) * dz, y, z - Math.sin(a) * dx + Math.cos(a) * dz, w, h, d, paint, a);
    piece(0, 2.03, 0, .68, .61, 1.32, coat);
    piece(0, 2.31, .48, .45, .84, .49, coat);
    piece(0, 2.75, .65, .48, .39, .71, coat);
    piece(0, 2.41, -.09, .72, .16, .62, i % 2 ? 'red' : 'iron');
    piece(0, 2.52, -.1, .44, .09, .44, 'yellow');
    piece(0, 1.96, -.69, .28, .39, .38, 'wood');
    for (const foot of [-.23, .23]) {
      piece(foot, 2.96, .54, .1, .19, .13, 'wood');
      for (const dz of [-.42, .5]) {
        piece(foot, 1.65, dz, .16, .34, .16, coat);
        piece(foot, 1.42, dz + .05, .19, .12, .27, 'wood');
      }
    }
  }
  // Removable south entry tread and open gap in the balustrade.
  box(0, .14, 6.47, 2.16, .28, .97, 'oak');
  floor(0, .28, 6.47, 2.16, .97, .28);
  box(0, .35, 6.2, 2.16, .22, .74, 'oak');
  floor(0, .46, 6.2, 2.16, .74, .22);
  floor(0, .705, 0, 2.6, 11.86, .15);
  floor(0, .705, 0, 8.36, 8.36, .15);
  floor(0, .705, 0, 11, 4.2, .15);
  solid(0, 6.48, 0, 1.94, 1.94, 5.85);
  for (let i = 2; i <= 30; i++) {
    const a = i * Math.PI / 16;
    const b = (i + 1) * Math.PI / 16;
    const [x, , z] = radial(a, 0, 5.85);
    box(x, 1.21, z, .13, .98, .13, 'wood');
    const [ex, , ez] = radial(b, 0, 5.85);
    beam(radial(a, 1.69, 5.85), radial(b, 1.69, 5.85), .1, 'yellow');
    solid((x + ex) / 2, 1.76, (z + ez) / 2, Math.abs(ex - x) + .15, Math.abs(ez - z) + .15, 1.2);
  }
  const group = finish();
  const ridePivot = rotating.finish();
  ridePivot.name = 'carousel-rotating-stage';
  ridePivot.add(rideSeat);
  group.add(ridePivot);
  group.userData.ridePivot = ridePivot;
  group.userData.rideSeat = rideSeat;
  return group;
}

// B24 barrel-vault glasshouse, open west entrance and a potted-palm aisle.
function glasshouse() {
  const { box, cylinder, panel, beam, solid, floor, finish } = model();
  const xWest = -6.24;
  const xEast = 6.24;
  const half = 8.38;
  const springline = 3.35;
  const arch = (x: number, i: number): Point => {
    const angle = Math.PI * i / 10;
    return [x, springline + Math.sin(angle) * 4.55, Math.cos(angle) * half];
  };
  box(0, .09, 0, 12.95, .18, 17.52, 'stone');
  for (let x = -5.6; x < 6; x += 1.12) {
    for (let z = -7.8; z < 8.2; z += 1.18) {
      box(x, .191, z, 1.09, .03, 1.15, Math.abs(z) > 3 ? 'slate' : 'white');
    }
  }
  const bays = [xWest, -4.16, -2.08, 0, 2.08, 4.16, xEast];
  for (const x of bays) {
    for (const z of [-half, half]) beam([x, .18, z], [x, springline, z], .14, 'iron');
    for (let i = 0; i < 10; i++) beam(arch(x, i), arch(x, i + 1), .15, 'iron');
  }
  for (let k = 0; k < bays.length - 1; k++) {
    const lo = bays[k];
    const hi = bays[k + 1];
    for (const z of [-half, half]) {
      panel([[lo, .55, z], [hi, .55, z], [hi, springline, z], [lo, springline, z]], 'glass');
      for (const y of [.56, 1.71, springline]) beam([lo, y, z], [hi, y, z], .105, 'iron');
      box((lo + hi) / 2, .3, z, hi - lo, .35, .24, 'slate');
    }
    for (let i = 0; i < 10; i++) {
      panel([arch(lo, i), arch(hi, i), arch(hi, i + 1), arch(lo, i + 1)], 'glass');
      beam(arch(lo, i), arch(hi, i), .088, 'iron');
      if ((i === 0 || i === 9) && k % 3 !== 1) {
        const pos = arch((lo + hi) / 2, i === 0 ? 0 : 10);
        box(pos[0], pos[1] + .094, pos[2], (hi - lo) * .88, .12, .54, 'snow');
      }
    }
  }
  for (const end of [xWest, xEast]) {
    for (const z of [-half, -6.1, -4.05, -2, 2, 4.05, 6.1, half]) {
      const top = springline + 4.55 * Math.sqrt(Math.max(0, 1 - (z / half) ** 2));
      beam([end, .2, z], [end, top, z], .15, 'iron');
    }
    for (const side of [-1, 1]) {
      panel([[end, .6, side * 2], [end, .6, side * half], [end, springline, side * half], [end, springline, side * 2]], 'glass');
      beam([end, .57, side * 2], [end, .57, side * half], .13, 'iron');
      beam([end, 1.78, side * 2], [end, 1.78, side * half], .1, 'iron');
      box(end, .34, side * 5.2, .21, .4, 6.4, 'slate');
    }
    for (let i = 0; i < 10; i++) panel([[end, springline, arch(end, i)[2]], [end, springline, arch(end, i + 1)[2]], arch(end, i + 1), arch(end, i)], 'glass');
    beam([end, 3.34, -half], [end, 3.34, half], .2, 'darkIron');
    if (end === xEast) panel([[end, .58, -2], [end, .58, 2], [end, springline, 2], [end, springline, -2]], 'glass');
  }
  box(-7.84, .085, 0, 3.25, .17, 3.72, 'stone');
  floor(-7.84, .17, 0, 3.25, 3.72, .17);
  floor(0, .206, 0, 12.95, 17.52, .206);
  for (const side of [-1, 1]) {
    solid(0, 3.35, side * half, 12.5, .24, 3.2);
    solid(xWest, 3.35, side * 5.2, .24, 6.4, 3.2);
  }
  solid(xEast, 3.35, 0, .24, 16.76, 3.2);
  for (const x of [-5, -1.8, 1.9, 5]) {
    for (const sign of [-1, 1]) {
      const z = sign * 5.54;
      cylinder(x, .59, z, .68, .43, .8, 'red', 10);
      cylinder(x, .995, z, .67, .67, .12, 'yellow', 10);
      cylinder(x, 1.03, z, .54, .53, .12, 'soil', 10);
      solid(x, 1.09, z, 1.25, 1.25, .9);
      const tall = 3.02 + .45 * Math.cos(x);
      beam([x, 1.02, z], [x + .23, tall, z], .16, 'oak');
      for (let i = 0; i <= 8; i++) {
        const a = i * Math.PI * 2 / 9;
        const dx = Math.cos(a);
        const dz = Math.sin(a);
        const root: Point = [x + .23, tall, z];
        const middle: Point = [x + .23 + dx * .66, tall + .4, z + dz * .66];
        const tip: Point = [x + .23 + dx * 1.44, tall + .02, z + dz * 1.44];
        beam(root, middle, .1, i % 2 ? 'leaf' : 'paleLeaf', .34);
        beam(middle, tip, .07, 'leaf', .29);
      }
    }
  }
  for (const x of [-4, 0, 4]) {
    beam([x, 7.45, 0], [x, 4.85, 0], .045, 'iron');
    box(x, 4.58, 0, .38, .52, .38, 'amber');
    box(x, 4.88, 0, .49, .1, .49, 'wood');
    box(x, 4.27, 0, .47, .1, .47, 'iron');
  }
  return finish();
}

export function buildLakesideLandmark(plot: TownPlot): Group {
  if (plot.id === 'lighthouse') return lighthouse();
  if (plot.id === 'carousel') return carousel();
  return glasshouse();
}

export function buildIcePlayProps(): Group {
  const { box, panel, beam, solid, finish } = model();
  const slope: [number, number][] = [[-4.7, 4.08], [-3, 3.94], [-1.4, 3.31], [.25, 2.4], [1.8, 1.67], [3.3, 1.25], [4.75, 1.13]];
  for (const x of [-1.65, 1.65]) {
    for (let i = 1; i < slope.length; i++) {
      const [[z0, y0], [z1, y1]] = [slope[i - 1], slope[i]];
      panel([[x - 1.1, y0, z0], [x + 1.1, y0, z0], [x + 1.1, y1, z1], [x - 1.1, y1, z1]], 'ice');
      for (const edge of [x - 1.16, x + 1.16]) {
        beam([edge, y0 + .19, z0], [edge, y1 + .19, z1], .3, 'snow');
        beam([edge, y0 - .1, z0], [edge, y1 - .1, z1], .3, 'ice');
      }
      for (const offset of [-.86, .86]) beam([x + offset, y0 + .006, z0], [x + offset, y1 + .006, z1], .025, 'snow');
    }
    for (const [z, h] of [[-4.18, 3.9], [-1.9, 3.32], [1.05, 1.95], [3.58, 1.14]]) {
      box(x, (h - .32) / 2, z, 2.08, h + .32, .42, 'ice');
      box(x, -.05, z, 2.23, .66, .56, 'slate');
    }
    solid(x, 4.4, 0, 2.4, 9.4, 4.4);
  }
  box(0, 3.98, -5.08, 5.55, .2, .8, 'ice');
  box(0, 4.51, -5.42, 5.55, .13, .14, 'snow');
  for (let step = 0; step < 12; step++) {
    const height = 4.03 - step * .244;
    const z = -4.6 + step * .63;
    box(0, height / 2, z, .92, height, .65, step % 2 ? 'snow' : 'slate');
  }
  for (const [x, y, z, yaw] of [[-1.8, .665, 6.35, -.28], [.35, 1.175, 6.7, .2]]) {
    const piece = (dx: number, dy: number, dz: number, w: number, h: number, d: number, paint: Paint) =>
      box(x + Math.cos(yaw) * dx + Math.sin(yaw) * dz, y + dy, z - Math.sin(yaw) * dx + Math.cos(yaw) * dz, w, h, d, paint, yaw);
    for (const runner of [-.31, .31]) {
      piece(runner, .07, 0, .1, .12, 1.74, 'deepRed');
      piece(runner, .18, -.82, .1, .2, .24, 'yellow');
    }
    for (const cross of [-.49, .49]) piece(0, .2, cross, .71, .12, .16, 'red');
    for (const board of [-.22, 0, .22]) piece(board, .31, 0, .17, .09, 1.36, 'oak');
  }
  const group = finish();
  group.position.set(354.5, 8.67, -121);
  return group;
}
