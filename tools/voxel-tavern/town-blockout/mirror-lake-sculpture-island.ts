import { BoxGeometry, Color, Group, InstancedMesh, MeshLambertMaterial, Object3D } from 'three';
import type { Box } from './landmark-kit';

const east = 50;
const north = 207;
const iceHeight = 10;
const deckHeight = 1.2;
const radius = 7;
const stepWidth = 3.2;
const ice = {
  deep: '#578fac', middle: '#86bace', light: '#c4e6ed',
  snow: '#e0f0f0', shade: '#6397b0', lamp: '#baf1fa', gold: '#dfcc8c',
};
const exhibits = [
  { x: -3.75, n: 2.5, pieces: [
    [0, 0, .54, .61, .55, .54, ice.light], [0, 0, 1.02, .58, .45, .49, ice.snow],
    [-.31, -.02, 1.14, .27, .18, .24, ice.middle], [.31, -.02, 1.14, .27, .18, .24, ice.middle],
    [0, .27, .78, .51, .11, .13, ice.shade], [.16, .28, .59, .12, .34, .13, ice.shade],
  ] },
  { x: 3.75, n: 2.5, pieces: [
    [0, 0, .59, .9, .37, .54, ice.gold], [.45, 0, .77, .36, .35, .42, ice.light],
    [.45, -.24, .87, .27, .24, .13, ice.gold], [.45, .24, .87, .27, .24, .13, ice.gold],
    [-.31, -.16, .36, .14, .27, .14, ice.light], [.27, -.16, .36, .14, .27, .14, ice.light],
    [-.31, .16, .36, .14, .27, .14, ice.light], [.27, .16, .36, .14, .27, .14, ice.light],
  ] },
  { x: -3.75, n: -.55, pieces: [
    [0, 0, .45, 1.25, .18, .48, ice.shade], [-.37, 0, .73, .37, .45, .49, ice.middle],
    [-.37, 0, .99, .48, .1, .58, ice.snow], [.18, 0, .67, .72, .27, .42, ice.light],
    [.39, 0, .86, .16, .23, .17, ice.middle], [.39, 0, .99, .23, .08, .21, ice.snow],
    [-.39, 0, .32, .23, .21, .6, ice.deep], [0, 0, .32, .23, .21, .6, ice.deep],
    [.37, 0, .32, .23, .21, .6, ice.deep], [.64, 0, .48, .12, .19, .52, ice.middle],
  ] },
  { x: 3.75, n: -.55, pieces: [
    [0, 0, .66, .55, .92, .55, ice.middle], [0, -.285, .91, .29, .29, .06, ice.light],
    [0, -.32, .94, .05, .12, .025, ice.shade], [.045, -.32, .88, .1, .045, .025, ice.shade],
    [0, 0, 1.12, .74, .14, .74, ice.snow], [0, 0, 1.25, .53, .13, .53, ice.light],
    [0, 0, 1.38, .34, .13, .34, ice.light], [0, 0, 1.49, .16, .12, .16, ice.snow],
  ] },
] as const;

type Voxel = { x: number; n: number; y: number; width: number; depth: number; height: number; color: string };
type IceHeightAt = (east: number, north: number) => number | undefined;

function bounds({ x, n, y, width, depth, height }: Voxel): Box {
  return { min: [x - width / 2, y - height / 2, -n - depth / 2],
    max: [x + width / 2, y + height / 2, -n + depth / 2] };
}

/** The lake host supplies the height only on strict, walkable Mirror Lake ice. */
export function createMirrorLakeSculptureIsland(iceHeightAt: IceHeightAt) {
  const voxels: Voxel[] = [];
  const floors: Box[] = [];
  const colliders: Box[] = [];
  const block = (x: number, n: number, y: number, width: number, depth: number, height: number,
    color: string, support?: Box[]) => {
    const voxel = { x, n, y, width, depth, height, color };
    voxels.push(voxel);
    support?.push(bounds(voxel));
  };

  // Use identical rectangular strips for the stepped ice edge and its supports.
  const strip = .5;
  for (let left = -radius; left < radius; left += strip) {
    const x = left + strip / 2;
    const edge = Math.max(Math.abs(left), Math.abs(left + strip));
    const span = 2 * Math.sqrt(radius ** 2 - edge ** 2);
    if (span === 0) continue;
    block(x, 0, deckHeight / 2, strip, span, deckHeight, ice.middle, floors);
    block(x, 0, .30, strip - .012, span + .08, .19, ice.deep);
    block(x, 0, .88, strip - .012, span + .04, .16, ice.light);
  }
  for (const [start, end, height] of [[-8.8, -7.8, .4], [-7.8, -6.8, .8], [-6.8, -6.1, 1.2]]) {
    block(0, (start + end) / 2, height / 2, stepWidth, end - start, height, ice.light, floors);
    for (const dx of [-1, 0, 1]) block(dx, (start + end) / 2, height + .006, .34, .48, .012, ice.snow);
  }
  // Sample the deck and stairs before creating resources. The old terrain
  // cannot host this island even if the land is already walkable.
  for (const { min, max } of floors) {
    const sections = Math.ceil((max[2] - min[2]) / .5);
    for (let i = 0; i <= sections; i++) {
      const n = north - min[2] - (max[2] - min[2]) * i / sections;
      for (const e of [east + min[0], east + max[0]]) {
        const height = iceHeightAt(e, n);
        if (height === undefined || !Number.isFinite(height) || Math.abs(height - iceHeight) > .025) return;
      }
    }
  }

  for (let i = 0; i < 96; i++) {
    const angle = i * Math.PI / 48;
    const x = 6.43 * Math.cos(angle), n = 6.43 * Math.sin(angle);
    if (n < 0 && Math.abs(x) < 1.95) continue;
    block(x, n, 1.43, .47, .47, .46, i % 2 ? ice.light : ice.middle, colliders);
    if (i % 3 === 0) block(x, n, 1.75, .25, .25, .26, ice.snow, colliders);
  }
  // Fine blocks in the walking surface and a six-metre display area around
  // the empty central plinth, which the host can use for rotating artwork.
  for (let row = -8; row <= 8; row++) {
    for (let col = -8; col <= 8; col++) {
      const x = col * .66 + (Math.abs(row) % 2) * .18, n = row * .70;
      const d = Math.hypot(x, n);
      if (d > 6.02) continue;
      if ((row + col) % 3 !== 0 && Math.abs(d - 2.82) > .14) continue;
      block(x, n, deckHeight + .003, .20, .17, .006, d < 3 ? ice.snow : ice.light);
    }
  }
  block(0, 0, 1.36, 2.05, 2.05, .32, ice.light, colliders);
  block(0, 0, 1.53, 2.14, 2.14, .08, ice.snow);
  for (const { x, n, pieces } of exhibits) {
    block(x, n, 1.325, 1.5, 1.5, .25, ice.deep, colliders);
    block(x, n, 1.44, 1.54, 1.54, .12, ice.lamp);
    for (const [dx, dn, dy, width, height, depth, color] of pieces) {
      block(x + dx, n + dn, 1.35 + dy, width, depth, height, color, colliders);
    }
  }

  const group = new Group();
  group.name = 'mirror-lake-sculpture-island';
  group.position.set(east, iceHeight, -north);
  group.userData = { floors, colliders };
  const geometry = new BoxGeometry();
  const material = new MeshLambertMaterial();
  const mesh = new InstancedMesh(geometry, material, voxels.length);
  const tile = new Object3D();
  const color = new Color();
  for (const [i, voxel] of voxels.entries()) {
    tile.position.set(voxel.x, voxel.y, -voxel.n);
    tile.scale.set(voxel.width, voxel.height, voxel.depth);
    tile.updateMatrix();
    mesh.setMatrixAt(i, tile.matrix);
    mesh.setColorAt(i, color.set(voxel.color));
  }
  mesh.name = 'ice-body-steps-rails-and-exhibits';
  mesh.computeBoundingSphere();
  group.add(mesh);
  let disposed = false;
  return {
    group,
    tigerStoneFootpoint: { east: 47.5, north: 203.1, height: iceHeight + deckHeight } as const,
    rotatingDisplay: { east, north, height: iceHeight + 1.57 },
    onWalkingSurface(playerEast: number, playerNorth: number, feet: number) {
      const x = playerEast - east;
      const z = north - playerNorth;
      return floors.some(({ min, max }) => x >= min[0] && x <= max[0] &&
        z >= min[2] && z <= max[2] && Math.abs(feet - iceHeight - max[1]) <= .025);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      mesh.removeFromParent();
      mesh.dispose();
      geometry.dispose();
      material.dispose();
      floors.length = colliders.length = 0;
    },
  };
}
