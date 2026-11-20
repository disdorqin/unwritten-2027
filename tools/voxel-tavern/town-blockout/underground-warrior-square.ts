import {
  Box3, BoxGeometry, Color, Group, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3,
} from 'three';
import type { Box } from './landmark-kit';

/** Local U-10 coordinates. The caller supplies the shared world's layer and transform. */
export const warriorSquarePlan = {
  statue: { east: 98.1, north: -9.65, height: -165 },
  fireSlot: { east: 98.1, north: -9.65, height: -164.72 },
  fireReserve: { east: 96.9, north: -6.7, height: -165 },
  fireTone: 'cold',
} as const;

const palette = {
  wall: '#52616d', face: '#6a7680', fracture: '#333e4d', grey: '#586775', shadow: '#414b55',
  blue: '#70bad2', blueWhite: '#b1edff',
} as const;
type Stone = keyof typeof palette;
type XYZ = readonly [number, number, number];
type SoupPart = readonly [offset: XYZ, size: XYZ, color: string];
const soupParts: readonly SoupPart[] = [
  [[0, .013, 0], [.112, .026, .105], '#6f483f'],
  [[0, .034, 0], [.158, .028, .148], '#845748'],
  [[-.083, .061, 0], [.04, .046, .158], '#9e6d53'],
  [[.083, .061, 0], [.04, .046, .158], '#9e6d53'],
  [[0, .061, -.081], [.178, .046, .038], '#bd8864'],
  [[0, .061, .081], [.178, .046, .038], '#bd8864'],
  [[0, .058, 0], [.127, .016, .124], '#b17d41'],
  [[-.027, .069, .018], [.026, .009, .022], '#d8b66e'],
  [[.034, .068, -.032], [.019, .009, .020], '#8c8957'],
  [[.008, .112, .005], [.015, .026, .016], '#827d70'],
  [[-.008, .135, .006], [.018, .020, .013], '#8a8270'],
  [[-.019, .157, .004], [.013, .018, .011], '#766f63'],
];

export function createWarriorSquare() {
  const { statue, fireReserve, fireSlot, fireTone } = warriorSquarePlan;
  const group = new Group();
  group.name = 'warrior-city-fallen-statue';
  group.position.set(statue.east, statue.height, -statue.north);
  const instances = new Map<Stone, Matrix4[]>();
  const colliders: Box[] = [];
  const unitBox = new Box3(new Vector3(-.5, -.5, -.5), new Vector3(.5, .5, .5));
  const up = new Vector3(0, 1, 0);

  function part(stone: Stone, position: XYZ, scale: XYZ, solid = false, orientation = new Quaternion()) {
    const transform = new Matrix4().compose(new Vector3(...position), orientation, new Vector3(...scale));
    const batch = instances.get(stone) ?? [];
    if (!instances.has(stone)) instances.set(stone, batch);
    batch.push(transform);
    if (solid) {
      const { min, max } = unitBox.clone().applyMatrix4(transform).translate(group.position);
      colliders.push({ min: min.toArray(), max: max.toArray() });
    }
  }

  function angled(stone: Stone, from: XYZ, to: XYZ, width: number, depth: number, solid = true) {
    const start = new Vector3(...from);
    const end = new Vector3(...to);
    const axis = end.clone().sub(start);
    const middle = start.add(end).multiplyScalar(.5);
    part(stone, middle.toArray(), [width, axis.length(), depth], solid,
      new Quaternion().setFromUnitVectors(up, axis.normalize()));
  }

  const outerLip = { radius: 2.60, height: .23, width: .22, thickness: .31, depth: .54 };
  // This gap in the flame clusters faces the approach, on the lip above the existing recovery stand.
  const soupAngle = 22 * Math.PI / 16;
  const soupPosition = new Vector3(
    Math.cos(soupAngle) * outerLip.radius, outerLip.height + outerLip.thickness / 2,
    Math.sin(soupAngle) * outerLip.radius,
  );

  // The groove is a low stone ring around the separate statue plinth, with a dark floor and two lips.
  part('fracture', [0, .24, 0], [3.86, .48, 2.86], true);
  part('wall', [0, .70, 0], [3.61, .44, 2.64], true);
  part('face', [.02, .97, 0], [3.74, .10, 2.76], true);
  for (let index = 0; index < 32; index++) {
    const angle = index * Math.PI / 16;
    const point = (distance: number, height: number): XYZ => [Math.cos(angle) * distance, height, Math.sin(angle) * distance];
    const turn = new Quaternion().setFromAxisAngle(up, -angle);
    part('fracture', point(2.32, .13), [.70, .24, .51], true, turn);
    part(index % 4 ? 'wall' : 'grey', point(outerLip.radius, outerLip.height),
      [outerLip.width, outerLip.thickness, outerLip.depth], true, turn);
    part('face', point(2.07, .22), [.14, .26, .44], true, turn);
    if (index % 4 === 0 || index % 4 === 1) {
      const rise = .26 + (index * 7 % 9) * .027;
      part('blue', point(2.32, .24 + rise / 2), [.13, rise, .21], false, turn);
      part('blueWhite', point(2.34, .24 + rise * .34), [.07, rise * .64, .12], false, turn);
      part('blue', point(2.30, .24 + rise + .045), [.065, .09, .09], false, turn);
    }
  }

  // Shallow ram motif on the older west-facing plinth, partly crossed by a later repair strip.
  for (const [height, z] of [[.81, -.36], [.90, -.30], [.90, -.21], [.83, -.16], [.77, -.21],
    [.81, .06], [.89, .10], [.88, .19], [.80, .24], [.73, .12], [.73, -.10], [.67, -.14], [.66, .05]]) {
    part('shadow', [-1.811, height, z], [.014, .036, .068]);
  }
  part('grey', [-1.823, .70, .30], [.039, .055, .35]);

  for (const side of [-1, 1]) {
    const z = .53 * side;
    part('wall', [-.30, 1.23, z], [1.13, .38, .70], true);
    part('face', [-.68, 1.37, z], [.45, .12, .64]);
    angled('wall', [.01, 1.36, z], [.16, 2.59, z], side < 0 ? .69 : .74, .62);
    part('grey', [-.12, 2.18, z], [.31, .53, .56]);
  }
  part('fracture', [.25, 2.64, .02], [1.22, .29, 1.57], true);
  part('wall', [.15, 2.40, 0], [1.23, .27, 1.65], true);
  for (const [x, y, z] of [[-.18, 2.83, .55], [.31, 2.86, -.27], [.65, 2.78, .38]]) {
    part('shadow', [x, y, z], [.38, .12, .47]);
  }

  // The upper body has fallen east, chest towards the paving. The hand still holds the unbroken sword.
  angled('wall', [2.07, 2.52, .12], [4.67, .71, .95], 1.16, 1.76);
  angled('grey', [2.34, 2.78, .31], [4.38, 1.32, .87], .35, 1.57);
  part('fracture', [2.12, 2.42, .16], [.59, .71, 1.37], true);
  angled('face', [3.05, 2.40, 1.12], [4.51, 1.80, 1.40], .73, .69);
  angled('wall', [4.39, 1.78, 1.39], [5.52, 1.54, 1.73], .56, .54);
  part('grey', [5.58, 1.54, 1.77], [.57, .52, .52], true);
  angled('wall', [3.60, 1.76, -.03], [4.77, .94, -.72], .55, .55);
  angled('wall', [4.77, .94, -.72], [5.29, .24, -.58], .42, .46);
  angled('face', [5.50, 1.62, 1.75], [6.12, 1.31, 1.84], .19, .23);
  angled('grey', [5.95, 1.17, 1.43], [6.12, 1.43, 2.11], .20, .22);
  angled('face', [6.03, 1.33, 1.85], [7.67, .12, 2.14], .205, .30);
  angled('face', [7.64, .145, 2.13], [7.85, .028, 2.17], .075, .13);

  // Detached head spills toward the city gate (west), with facial features low to the paving.
  part('wall', [-3.77, .60, .55], [1.06, 1.12, .99], true);
  part('face', [-3.74, 1.13, .55], [.92, .22, 1.07]);
  part('grey', [-4.19, .39, .55], [.31, .54, .79], true);
  part('fracture', [-4.25, .15, .55], [.31, .21, .63]);
  part('face', [-4.43, .16, .53], [.17, .13, .23]);
  for (const [east, north] of [[1.13, 1.72], [2.06, .98], [4.88, -.12]]) {
    part('shadow', [east, .19, north], [.39, .38, .29], true);
  }

  const geometry = new BoxGeometry();
  for (const [stone, transforms] of instances) {
    const color = new Color(palette[stone]);
    const isFlame = stone === 'blue' || stone === 'blueWhite';
    const material = new MeshLambertMaterial({ color, emissive: isFlame ? color : 0,
      emissiveIntensity: stone === 'blueWhite' ? .89 : .54 });
    const mesh = new InstancedMesh(geometry, material, transforms.length);
    mesh.name = `warrior-statue-${stone}`;
    transforms.forEach((transform, index) => mesh.setMatrixAt(index, transform));
    mesh.computeBoundingSphere();
    group.add(mesh);
  }

  // Qin Nuan's bowl is scenery at the existing cold flame. Recovery stays with the registered fire.
  const soupMaterial = new MeshLambertMaterial({ emissive: '#433221', emissiveIntensity: .21 });
  const soup = new InstancedMesh(geometry, soupMaterial, soupParts.length);
  soup.name = 'warrior-cook-soup';
  soup.position.copy(soupPosition);
  soup.rotation.y = -soupAngle;
  soup.raycast = () => {};
  for (const [index, [offset, size, color]] of soupParts.entries()) {
    soup.setMatrixAt(index, new Matrix4().compose(new Vector3(...offset), new Quaternion(), new Vector3(...size)));
    soup.setColorAt(index, new Color(color));
  }
  soup.computeBoundingSphere();
  group.add(soup);

  let disposed = false;
  return {
    group, colliders, fireReserve, fireSlot, fireTone,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const child of group.children) {
        const mesh = child as InstancedMesh<BoxGeometry, MeshLambertMaterial>;
        mesh.dispose();
        mesh.material.dispose();
      }
      geometry.dispose();
      group.removeFromParent();
      group.clear();
    },
  };
}
