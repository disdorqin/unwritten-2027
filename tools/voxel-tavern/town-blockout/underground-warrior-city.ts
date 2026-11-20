import { BoxGeometry, Color, Group, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3 } from 'three';
import type { Box } from './landmark-kit';

const palette = {
  foundation: '#333e4d', oldStone: '#52616d', darkStone: '#3d495a', cutStone: '#6a7680',
  frostStone: '#586775', paving: '#485866', moonstone: '#a6dce9', crystal: '#476d8f',
  iron: '#38424c',
} as const;
type Stone = keyof typeof palette;
type Point = { east: number; north: number; height: number };
type Extent = { west: number; east: number; south: number; north: number };
type Seal = 'open' | 'rubble' | 'fallen-head' | 'stone-grate';

export const warriorCityDatum = -165;
export const warriorCityStreet = [
  { id: 'gate-lane', start: 0, end: 25 }, { id: 'stone-houses', start: 25, end: 80 },
  { id: 'central-square', start: 80, end: 120 }, { id: 'market-arcade', start: 120, end: 160 },
  { id: 'descent-forecourt', start: 160, end: 180 },
] as const;

const wall = { west: 89, east: 179, south: 26, north: 30.6 } as const;
const stair = { west: 91.2, east: 95.6, south: 14, north: wall.south } as const;
const stairSteps = 21;
const riser = .3;
const rampTread = (stair.north - stair.south) / stairSteps;
const wallHeight = warriorCityDatum + stairSteps * riser;
const archNorth = -8.6;
const houseNorth = 7.2;
const point = (east: number, north: number, height = warriorCityDatum): Point => ({ east, north, height });

function contains(box: Extent, e: number, n: number) {
  return e >= box.west && e <= box.east && n >= box.south && n <= box.north;
}

function streetCentre(east: number) {
  return east >= 0 && east < 25 ? 1.2 * Math.sin(east / 25 * Math.PI) : 0;
}

function pavingCentre(east: number) {
  return streetCentre(2 * Math.min(89, Math.floor(east / 2)) + 1);
}

/** Local E/N on the canonical −165 m level. Geometry, floor support and solids share this survey. */
export function createUndergroundWarriorCity() {
  const group = new Group();
  group.name = 'warrior-city-u10';
  const parts = new Map<Stone, { position: Vector3; scale: Vector3; yaw: number }[]>();
  const colliders: Box[] = [];
  const houses: { id: string; extent: Extent; door: Point; entrance: Point; inside: Point; seal: Seal; roof: string }[] = [];

  function box(e: number, n: number, height: number, width: number, depth: number, tall: number,
    stone: Stone, solid = false, yaw = 0) {
    const batch = parts.get(stone) ?? [];
    if (!parts.has(stone)) parts.set(stone, batch);
    batch.push({ position: new Vector3(e, height + tall / 2, -n), scale: new Vector3(width, tall, depth), yaw });
    if (solid) {
      const cos = Math.abs(Math.cos(yaw)), sin = Math.abs(Math.sin(yaw));
      const dx = (cos * width + sin * depth) / 2, dz = (sin * width + cos * depth) / 2;
      colliders.push({ min: [e - dx, height, -n - dz], max: [e + dx, height + tall, -n + dz] });
    }
  }

  function masonry(e: number, n: number, width: number, depth: number, rows: number, seed: number) {
    const columns = Math.ceil(width / 1.45);
    const unit = width / columns;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        const shade = (row * 17 + col * 13 + seed * 7) % 8;
        box(e - width / 2 + (col + .5) * unit, n, warriorCityDatum + row * .64,
          unit - .025, depth + (shade % 3) * .04, .625, shade < 2 ? 'darkStone' : shade > 5 ? 'cutStone' : 'oldStone');
      }
    }
    colliders.push({ min: [e - width / 2, warriorCityDatum, -n - depth / 2],
      max: [e + width / 2, warriorCityDatum + rows * .64, -n + depth / 2] });
  }

  function lamp(e: number, n: number) {
    box(e, n, warriorCityDatum, .65, .65, .26, 'foundation', true);
    box(e, n, warriorCityDatum + .26, .30, .30, 2.13, 'oldStone', true);
    box(e, n, warriorCityDatum + 2.39, .46, .46, .54, 'moonstone');
    box(e, n, warriorCityDatum + 2.93, .62, .62, .18, 'cutStone');
  }

  for (let e = 0; e < 180; e += 2) {
    const centre = pavingCentre(e + 1);
    box(e + 1, centre, warriorCityDatum - .28, 2, 11, .28, 'foundation');
    for (let n = -5; n < 5; n += 2) {
      box(e + 1, centre + n + 1, warriorCityDatum - .10, 1.97, 1.97, .10,
        (e + n) % 7 < 2 ? 'frostStone' : 'paving');
    }
  }
  for (let e = 81; e < 120; e += 2) {
    for (let n = -19; n < 20; n += 2) {
      if (Math.abs(n) >= 5) box(e, n, warriorCityDatum - .25, 1.98, 1.98, .25,
        (e + n) % 6 === 0 ? 'frostStone' : 'paving');
    }
  }
  for (const east of [12, 34, 53, 71, 83, 116, 131, 153, 168]) {
    for (const north of (east === 83 || east === 116 ? [-17.5, 17.5] : [-4.8, 4.8])) lamp(east, north);
  }
  for (const e of [2, 174]) {
    for (const n of [-4.25, 4.25]) {
      box(e, n, warriorCityDatum, 2.7, 1.7, 1.1, 'foundation', true);
      box(e, n, warriorCityDatum + 1.1, 1.85, 1.12, e < 3 ? 5.75 : 4.8, 'oldStone', true);
    }
    const lintel = e < 3 ? 6.1 : 5.1;
    box(e, 0, warriorCityDatum + lintel, 2.1, 9.72, .76, 'cutStone', true);
    box(e, 0, warriorCityDatum + lintel + .76, 2.55, 10.6, .43, 'foundation');
    box(e, 0, warriorCityDatum + lintel + 1.19, 2.1, 8.85, .40, 'cutStone');
  }
  for (let row = 0; row < 2; row++) {
    const sign = row === 0 ? 1 : -1;
    for (let index = 0; index < 6; index++) {
      const east = 29.5 + index * 8.4 + row * 1.2;
      const width = 5.8 + (index % 3) * .32;
      const depth = 6.6 + (index % 4) * .55;
      const front = sign * houseNorth, back = front + sign * depth;
      const n = (front + back) / 2;
      const door = east + (index % 3 - 1) * .54;
      const seal: Seal = (row + index * 2) % 3 === 0 ? 'open' : (['rubble', 'fallen-head', 'stone-grate'] as const)[(row + index) % 3]!;
      const eastEdge = east + width / 2, westEdge = east - width / 2;
      const extent = { west: westEdge, east: eastEdge, south: Math.min(front, back), north: Math.max(front, back) };
      const roof = ['角缺', '台阶残脊', '整梁', '一端塌瓦'][index % 4]!;
      houses.push({ id: `stone-${row === 0 ? 'north' : 'south'}-${index + 1}`, extent,
        door: point(door, front), entrance: point(door, front - sign * 1.2), inside: point(door, front + sign * 2.1), seal, roof });
      box(east, n, warriorCityDatum - .31, width, depth, .31, 'foundation');
      box(east, (front + sign * 5) / 2, warriorCityDatum - .15, width, Math.abs(front - sign * 5), .15, 'paving');
      masonry(east, back, width, .50, 6, index + row);
      for (const side of [westEdge + .26, eastEdge - .26]) box(side, n, warriorCityDatum, .52, depth, 3.84, 'oldStone', true);
      const frontLeft = door - .92, frontRight = door + .92;
      masonry((westEdge + frontLeft) / 2, front, frontLeft - westEdge, .5, 6, index);
      masonry((eastEdge + frontRight) / 2, front, eastEdge - frontRight, .5, 6, index + 7);
      box(door, front, warriorCityDatum + 2.48, 1.86, .66, 1.36, 'cutStone', true);
      if (seal === 'rubble') {
        box(door, front, warriorCityDatum, 1.86, .82, .68, 'darkStone', true);
        box(door - .20, front, warriorCityDatum + .68, 1.13, .62, .65, 'oldStone', true);
      } else if (seal === 'fallen-head') {
        box(door, front, warriorCityDatum, 1.82, .68, 2.23, 'cutStone', true);
        box(door + .41, front - sign * .32, warriorCityDatum, .78, .64, .36, 'foundation', true);
      } else if (seal === 'stone-grate') {
        for (const offset of [-.66, -.22, .22, .66]) box(door + offset, front, warriorCityDatum, .31, .48, 2.48, 'oldStone', true);
      }
      for (let iz = 0; iz < 3; iz++) {
        const profile = index % 4;
        const tuck = profile === 0 && iz === 0 ? 1.22 : profile === 3 && iz === 2 ? width * .55 : .06;
        const lift = profile === 1 ? iz * .22 : profile === 2 ? .10 : iz === 1 ? .30 : 0;
        const offset = profile === 3 ? -tuck / 2 : tuck / 2;
        box(east + offset, n + (iz - 1) * depth / 3, warriorCityDatum + 3.84 + lift,
          width + .32 - tuck, depth / 3 + .23, .32, iz === 1 ? 'cutStone' : 'darkStone');
      }
      if (seal === 'open') box(east + width * .30, back - sign * 1.25, warriorCityDatum, .82, 1.07, .91, 'foundation', true);
    }
  }

  box(142, -11.7, warriorCityDatum - .25, 37, 13.6, .25, 'paving');
  for (let i = 0; i < 7; i++) {
    const e = 124.5 + i * 5.75;
    for (const n of [archNorth, -16.1]) {
      box(e, n, warriorCityDatum, 1.22, 1.22, .36, 'foundation', true);
      box(e, n, warriorCityDatum + .36, .84, .85, 3.74, 'oldStone', true);
      box(e, n, warriorCityDatum + 4.10, 1.35, 1.34, .40, 'cutStone');
      if (i < 6) {
        box(e + 2.875, n, warriorCityDatum + 4.48, 5.75, .93, .74, 'foundation');
        for (const [offset, lift, width] of [[1.04, 3.87, .79], [4.71, 3.87, .79], [1.6, 4.14, .52], [4.15, 4.14, .52]]) {
          box(e + offset, n, warriorCityDatum + lift, width, .84, .48, 'cutStone');
        }
      }
    }
    if (i > 0 && i < 6) {
      box(e + .65, -14.46, warriorCityDatum, 2.8, 1.14, .82, 'darkStone', true);
      box(e + 1.3, -14.50, warriorCityDatum + .82, .48, .55, .44, 'cutStone');
    }
  }
  for (let i = 0; i < 30; i++) {
    const e = wall.west + i * 3 + 1.5;
    box(e, 28.3, warriorCityDatum, 3, 4.6, stairSteps * riser, i % 3 === 0 ? 'darkStone' : 'oldStone', true);
    box(e, 28.3, wallHeight - .12, 2.98, 4.58, .12, 'paving');
    for (const n of [26.28, 30.32]) {
      const span = [e - 1.5, e + 1.5] as const;
      const pieces = n < 27 && span[0] < stair.east && span[1] > stair.west
        ? [[span[0], Math.min(span[1], stair.west)], [Math.max(span[0], stair.east), span[1]]]
        : [span];
      for (const [start, end] of pieces) {
        const length = end - start;
        if (length <= 0) continue;
        box((start + end) / 2, n, wallHeight, length, .55, .64, 'darkStone', true);
        if (length > .9) box(start + .5, n, wallHeight + .64, .76, .59, .48, 'cutStone');
      }
    }
  }
  for (let i = 0; i < stairSteps; i++) {
    box((stair.west + stair.east) / 2, stair.south + (i + .5) * rampTread, warriorCityDatum,
      stair.east - stair.west, rampTread, (i + 1) * riser, i === 0 ? 'cutStone' : 'oldStone');
  }
  for (const e of [89.8, 177.8, 178.5]) {
    box(e, 28.3, wallHeight, 1.58, wall.north - wall.south, 1.18, 'foundation', true);
    box(e, 28.7, wallHeight + 1.18, 1.11, 2.60, .50, 'cutStone');
  }
  for (const [e, n] of [[105, 29.49], [145, 29.65], [173, 29.55]]) {
    box(e, n, wallHeight, .43, .45, .48, 'foundation', true);
    box(e, n, wallHeight + .36, .29, .33, .24, 'oldStone');
  }
  box(151.5, 29.63, wallHeight, .12, .13, 1.2, 'iron', true);
  for (const [e, n, h] of [[41.5, 4.7, .70], [68.7, -4.68, .54], [122.9, 4.63, .76], [153.6, 4.75, .54]]) {
    box(e, n, warriorCityDatum, .40, .36, h, 'crystal', true, .48);
    box(e + .15, n - .09, warriorCityDatum, .23, .25, h * .58, 'moonstone', true, -.29);
  }

  const geometry = new BoxGeometry();
  const translate = new Matrix4(), rotation = new Quaternion(), up = new Vector3(0, 1, 0);
  for (const [stone, instances] of parts) {
    const material = new MeshLambertMaterial({ color: palette[stone],
      emissive: stone === 'moonstone' ? new Color('#347386') : 0, emissiveIntensity: .72 });
    const mesh = new InstancedMesh(geometry, material, instances.length);
    mesh.name = `warrior-city-${stone}`;
    for (const [index, transform] of instances.entries()) {
      rotation.setFromAxisAngle(up, transform.yaw);
      mesh.setMatrixAt(index, translate.compose(transform.position, rotation, transform.scale));
    }
    mesh.computeBoundingSphere();
    group.add(mesh);
  }

  function floorHeightAt(e: number, n: number) {
    if (!Number.isFinite(e) || !Number.isFinite(n)) return undefined;
    if (contains(wall, e, n)) return wallHeight;
    if (contains(stair, e, n)) return warriorCityDatum + (1 + Math.min(stairSteps - 1, Math.floor((n - stair.south) / rampTread))) * riser;
    if (e >= 0 && e <= 180 && (Math.abs(n - pavingCentre(e)) <= 5.5 || (e >= 80 && e <= 120 && Math.abs(n) <= 20))) {
      return warriorCityDatum;
    }
    if (e >= 123.5 && e <= 160.5 && n >= -18.5 && n <= -4.9) return warriorCityDatum;
    for (const { extent } of houses) {
      if (e >= extent.west && e <= extent.east && n >= Math.min(-5, extent.south) && n <= Math.max(5, extent.north)) return warriorCityDatum;
    }
    return undefined;
  }

  function isWalkable(e: number, n: number, radius = .27, bodyHeight = 1.8) {
    const feet = floorHeightAt(e, n);
    if (feet === undefined || !Number.isFinite(radius) || radius <= 0 || !Number.isFinite(bodyHeight) || bodyHeight <= 0) return false;
    return !colliders.some(({ min, max }) => {
      if (feet + .025 >= max[1]! || feet + bodyHeight - .025 <= min[1]!) return false;
      return Math.hypot(Math.max(min[0]! - e, e - max[0]!, 0), Math.max(min[2]! + n, -n - max[2]!, 0)) < radius;
    });
  }

  return {
    group, houses, colliders, floorHeightAt, isWalkable,
    street: warriorCityStreet,
    arcadeRoute: [point(124, 0), point(126.3, -11.4), point(156.5, -11.4), point(156.5, 0)],
    wallRoute: [point(93.4, 13), point(93.4, 28.3, wallHeight), point(175.8, 28.3, wallHeight)],
    dispose() {
      for (const child of [...group.children]) {
        const mesh = child as InstancedMesh<BoxGeometry, MeshLambertMaterial>;
        mesh.material.dispose();
        mesh.dispose();
      }
      geometry.dispose();
      group.removeFromParent();
      group.clear();
    },
  };
}
