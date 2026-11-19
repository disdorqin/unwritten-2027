import { Vector3, type Object3D } from 'three';
import { icePalaceInteriorAnchors } from './ice-palace-expansion';
import { offsetBox, type Box } from './landmark-kit';

type PalacePoint = { x: number; n: number; ground: number };
type Seat = { x: number; n: number; eyeY: number };
type ProjectileGeometry = { colliders: Box[]; floors: Box[] };

// Clear floor rectangles in addIcePalaceChambers. Doorways and floors above
// the rooms are outside this exception; the regular projectile sweep still
// owns collision against scenery and the actual target.
const chambers = [
  ['throne-annex', 21.27, 23.71, -8.21, -5.19, .15, 3.02],
  ['gallery', 1.74, 7.11, -13.43, -11.87, .12, 2.97],
  ['stair-chamber', 4.65, 7.34, -11.70, -8.98, .12, 2.76],
  ['vault', 12.34, 16.82, -8.42, -5.72, .15, 2.75],
] as const;

export function createIcePalaceSnowballRules(castle: Object3D) {
  const point = new Vector3();
  const throneWorld = new Vector3();
  const [seatX, seatEyeY, seatZ] = icePalaceInteriorAnchors.throneSeat;
  const seatTop = seatEyeY - .98;
  const bounds = (x: number, bottom: number, z: number, width: number, height: number, depth: number) =>
    offsetBox({
      min: [x - width / 2, bottom, z - depth / 2],
      max: [x + width / 2, bottom + height, z + depth / 2],
    }, castle.position);
  // The walk collider prevents entering the chair on foot, but it also covers
  // the air where the player sits. Match that single box from buildIceCastle
  // and keep the visible cushion, back and arms as cover for the snowball sweep.
  const walkBlocker = bounds(seatX + .05, .57, seatZ, 1.25, 1.75, 1.52);
  const seatCover = [
    bounds(seatX, seatTop - .20, seatZ, 1.08, .20, 1.23),
    bounds(seatX + .45, .88, seatZ, .24, 2.14, 1.27),
    bounds(seatX + .445, 2.96, seatZ, .34, .18, 1.37),
  ];
  for (const side of [-1, 1]) {
    seatCover.push(bounds(seatX, 1.23, seatZ + side * .64, 1.12, .18, .22));
    seatCover.push(bounds(seatX - .22, .57, seatZ + side * .51, .36, .46, .25));
    seatCover.push(bounds(seatX + .24, .57, seatZ + side * .51, .36, .46, .25));
  }
  const replacedCells = new WeakMap<ProjectileGeometry, ProjectileGeometry>();

  function room(x: number, y: number, z: number) {
    castle.worldToLocal(point.set(x, y, z));
    for (const [name, west, east, south, north, floor, ceiling] of chambers) {
      if (point.x >= west && point.x <= east && point.z >= south && point.z <= north &&
          point.y >= floor - .025 && point.y < ceiling) return name;
    }
    // The palace hall exception is only used when the seated throne is the target.
    if (point.x > 7 && point.x < 21 && Math.abs(point.z) < 9.75 && point.y >= .12 - .025 && point.y < 3.09) {
      return 'hall';
    }
  }

  function atThrone(seat?: Seat) {
    if (!seat) return false;
    castle.localToWorld(throneWorld.set(...icePalaceInteriorAnchors.throneSeat));
    return Math.abs(seat.eyeY - throneWorld.y) <= .3 && Math.hypot(seat.x - throneWorld.x, seat.n + throneWorld.z) <= .4;
  }

  return {
    atThrone,
    canRelay(origin: Vector3) {
      return room(origin.x, origin.y, origin.z) !== undefined;
    },
    canConfirm(origin: Vector3, target: PalacePoint, seat?: Seat) {
      const targetRoom = room(target.x, target.ground, -target.n);
      if (!targetRoom) return false;
      if (targetRoom === 'hall' && (!seat || !atThrone(seat) || Math.hypot(target.x - seat.x, target.n - seat.n) > .4)) {
        return false;
      }
      return targetRoom === room(origin.x, origin.y, origin.z);
    },
    projectileGeometry(cell: ProjectileGeometry) {
      const cached = replacedCells.get(cell);
      if (cached) return cached;
      const blocker = cell.colliders.findIndex(box => box.min.every((value, i) => value === walkBlocker.min[i]) &&
        box.max.every((value, i) => value === walkBlocker.max[i]));
      if (blocker === -1) {
        replacedCells.set(cell, cell);
        return cell;
      }
      const colliders = cell.colliders.slice();
      colliders.splice(blocker, 1, ...seatCover);
      const projectileCell = { colliders, floors: cell.floors };
      replacedCells.set(cell, projectileCell);
      return projectileCell;
    },
  };
}
