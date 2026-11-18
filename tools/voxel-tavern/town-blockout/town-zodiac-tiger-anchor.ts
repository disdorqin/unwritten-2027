import {
  BoxGeometry, Color, Group, InstancedMesh, MeshLambertMaterial, Object3D, Quaternion, Vector3,
} from 'three';
import type { Box } from './landmark-kit';

type Point = readonly [x: number, y: number, z: number];
type Landing = { x: number; z: number; top: number; width: number; depth: number };
type Piece = { at: Point; size: Point; tint: string; rotation?: Quaternion };

export const tigerPineOrigin = [129.48, 404.65] as const;
export const tigerPineApproach = [[123.68, 406.75], [124.16, 405.42], [124.46, 403.41]] as const;
export const tigerPineLandings: readonly Landing[] = [
  { x: -3.39, z: 1.24, top: 1.43, width: 1.48, depth: 1.84 },
  { x: -1.78, z: 1.24, top: 2.20, width: 1.37, depth: 1.78 },
  { x: -.10, z: 1.24, top: 3.00, width: 1.72, depth: 1.92 },
];

export const tigerZodiacSite = {
  id: 'tiger',
  stand: [-.10, tigerPineLandings[2].top, 1.24],
  object: [.55, tigerPineLandings[2].top + .035, 1.57],
  yaw: -Math.PI / 2,
  range: .38,
} as const;

export function buildTigerZodiacAnchor(groundHeightAt: (east: number, north: number) => number) {
  const [east, north] = tigerPineOrigin;
  const ground = groundHeightAt(east, north);
  const group = new Group();
  group.name = '林间老松与第一分杈';
  group.position.set(east, ground, -north);

  const pieces: Piece[] = [];
  const floors: Box[] = [];
  const colliders: Box[] = [];
  const add = (at: Point, size: Point, tint: string, rotation?: Quaternion) => pieces.push({ at, size, tint, rotation });
  const localGround = (x: number, z: number) => groundHeightAt(east + x, north - z) - ground;
  const up = new Vector3(0, 1, 0);
  function beam(from: Point, to: Point, width: number, tint: string) {
    const start = new Vector3(...from);
    const end = new Vector3(...to);
    const delta = end.clone().sub(start);
    const length = delta.length();
    const rotation = new Quaternion().setFromUnitVectors(up, delta.normalize());
    add(start.lerp(end, .5).toArray(), [width, length, width], tint, rotation);
  }

  const bark = '#6b4f3e';
  add([0, 1.44, 0], [1.02, 3.2, .96], bark);
  add([.17, 4.03, -.10], [.69, 3.04, .68], '#735743');
  add([.15, 5.98, -.14], [.37, 1.54, .39], '#846450');
  colliders.push({ min: [-.51, -.16, -.48], max: [.51, 3.04, .48] });
  colliders.push({ min: [-.175, 2.51, -.44], max: [.515, 5.55, .24] });
  for (const [x, z] of [[-.84, -.25], [.76, -.32], [.33, .64], [-.57, .68]]) {
    beam([0, .40, 0], [x, localGround(x, z) + .08, z], .26, '#594132');
  }
  for (const x of [-.38, .29]) {
    add([x, 1.44, -.489], [.092, 2.84, .027], '#8e6a4f');
    add([x, 1.79, .489], [.071, 2.24, .026], '#513c33');
  }
  beam([.08, 2.19, .09], [.21, 2.82, 1.92], .38, bark);
  beam([-.13, 2.65, -.08], [-1.32, 4.36, -.96], .39, '#765844');
  beam([.40, 3.46, -.07], [1.43, 4.61, -.18], .29, '#775946');

  for (const [height, width, offset] of [[5.11, 3.15, -.11], [5.65, 2.63, -.04], [6.19, 2.02, .08], [6.73, 1.38, .19], [7.22, .69, .22]]) {
    add([offset, height, -.16], [width, .37, width * .59], '#28493d');
    add([offset, height + .025, -.16], [width * .63, .46, width * .93], '#345446');
    add([offset - width * .19, height + .23, -.23], [width * .40, .087, width * .67], '#cedee5');
    add([offset + width * .17, height + .24, -.14], [width * .32, .077, width * .51], '#aabfc8');
  }

  for (const [index, { x, z, top, width, depth }] of tigerPineLandings.entries()) {
    const thickness = .20;
    floors.push({ min: [x - width / 2, top - thickness, z - depth / 2], max: [x + width / 2, top, z + depth / 2] });
    add([x, top - .14, z], [width, .12, depth], '#674f3e');
    for (let plank = 0; plank < 5; plank++) {
      const tx = x + (plank - 2) * width / 5;
      add([tx, top - .052, z], [width / 5 - .022, .104, depth],
        plank % 2 ? '#a68a63' : '#b69a73');
    }
    for (const tz of [z - depth * .37, z + depth * .37]) {
      const supportX = x - width * .30;
      if (index === 2) {
        beam([.04, 2.08, .30], [supportX, top - .14, tz], .19, '#765a42');
      } else {
        const y = localGround(supportX, tz) - .045;
        const supportHeight = top - .20 - y;
        add([supportX, y + supportHeight / 2, tz], [.19, supportHeight, .19], '#71513e');
        colliders.push({
          min: [supportX - .095, y, tz - .095], max: [supportX + .095, top - .20, tz + .095],
        });
      }
      add([x, top - .03, tz], [width + .04, .075, .085], '#d7e4e9');
    }
  }

  const geometry = new BoxGeometry();
  const batch = new InstancedMesh(geometry, new MeshLambertMaterial(), pieces.length);
  batch.name = '老松、雪冠与三阶木台';
  const part = new Object3D();
  const tint = new Color();
  for (const [index, { at, size, tint: color, rotation }] of pieces.entries()) {
    part.position.set(...at);
    part.scale.set(...size);
    if (rotation) part.quaternion.copy(rotation);
    else part.quaternion.identity();
    part.updateMatrix();
    batch.setMatrixAt(index, part.matrix);
    batch.setColorAt(index, tint.set(color));
  }
  batch.computeBoundingSphere();
  group.add(batch);
  group.userData.colliders = colliders;
  group.userData.floors = floors;
  return group;
}
