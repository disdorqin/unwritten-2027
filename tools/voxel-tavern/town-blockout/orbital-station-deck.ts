import { BoxGeometry, Group, HemisphereLight, Mesh, MeshStandardMaterial, Points, type Material } from 'three';
import { createOrbitalEarlyRooms, type OrbitalRoomPoint } from './orbital-early-rooms.js';
import { createOrbitalLivingCabin } from './orbital-living-cabin.js';
import { createOrbitalObservationCabin } from './orbital-observation-cabin.js';
import { createOrbitalTeleportCabin } from './orbital-teleport-cabin.js';
import { mountOrbitalCabinSignage } from './orbital-cabin-signage.js';
import { mountOrbitalStatusDisplay } from './orbital-status-display.js';

export type OrbitalStationRoom = 'airlock' | 'cockpit' | 'observation' | 'living' | 'teleport';

const corridor = { west: 5.4, east: 12.8, south: .90, north: 19.2 };
const airlockDoor = { north: 1.72, half: .79, deck: 0, height: 2.95 };
const cockpitDoor = { north: 6.15, half: .92, deck: .32, height: 3.75 };
const livingDoor = 5.6;
const observationDoor = 17.15;
const teleportDoor = 9.1;
const rampEnd = 7.45;
const wall = .18;
const ceiling = 2.85;

const arcSamples = Array.from({ length: 24 }, (_, index) => {
  const angle = 2 * Math.PI * index / 24;
  return [Math.cos(angle), Math.sin(angle)] as const;
});
const distanceToRange = (value: number, min: number, max: number) => Math.max(min - value, value - max, 0);
const at = (x: number, n: number, ground = 0): OrbitalRoomPoint => ({ x, n, ground });

/** Local candidate host. Production coordinates and door authority are supplied by S-1/S-4. */
export function createOrbitalStationDeck() {
  const group = new Group();
  group.name = 'orbital-station-deck';
  const early = createOrbitalEarlyRooms();
  const signage = mountOrbitalCabinSignage(early.group);
  const status = mountOrbitalStatusDisplay(early.group);
  const living = createOrbitalLivingCabin();
  const observation = createOrbitalObservationCabin();
  const teleport = createOrbitalTeleportCabin();
  const hall = new Group();
  hall.name = 'orbital-continuous-corridor';

  for (const child of [...living.group.children]) {
    if (child instanceof HemisphereLight) child.removeFromParent();
  }
  living.group.position.set(corridor.east, 0, -livingDoor);
  living.group.rotation.y = -Math.PI / 2;
  observation.group.position.set(corridor.west, 0, -observationDoor);
  observation.group.rotation.y = Math.PI / 2;
  teleport.group.position.set(teleportDoor, 0, -corridor.north);
  group.add(early.group, hall, living.group, observation.group, teleport.group);

  const hull = new MeshStandardMaterial({ color: 0x414c56, roughness: .85, metalness: .22 });
  const deck = new MeshStandardMaterial({ color: 0x354450, roughness: .94 });
  const rim = new MeshStandardMaterial({ color: 0x667889, roughness: .72, metalness: .38 });
  const marker = new MeshStandardMaterial({ color: 0x9d9177, emissive: 0x544326, roughness: .82 });
  const stationMaterials = new Set<Material>([hull, deck, rim, marker]);
  const unit = new BoxGeometry();
  function box(parent: Group, name: string, material: MeshStandardMaterial,
    x: number, n: number, y: number, width: number, depth: number, height: number) {
    const mesh = new Mesh(unit, material);
    mesh.name = name;
    mesh.position.set(x, y, -n);
    mesh.scale.set(width, height, depth);
    parent.add(mesh);
    return mesh;
  }

  function eastOpening(id: 'airlock' | 'cockpit', door: typeof airlockDoor | typeof cockpitDoor) {
    const room = early.rooms[id];
    const shell = early.group.getObjectByName('orbital-' + id);
    if (!(shell instanceof Group)) throw new Error('Missing early orbital room shell: ' + id);
    const east = shell.children.find(child => child.name === 'orbital-cutaway-shell' &&
      child.position.x > room.maxX && child instanceof Mesh);
    if (!(east instanceof Mesh)) throw new Error('Missing early orbital east bulkhead: ' + id);
    east.removeFromParent();
    east.geometry.dispose();
    for (const [minN, maxN] of [[room.minN, door.north - door.half], [door.north + door.half, room.maxN]]) {
      box(shell, 'orbital-east-bulkhead', hull, room.maxX + wall / 2, (minN + maxN) / 2,
        door.deck + door.height / 2, wall, maxN - minN, door.height);
    }
    box(shell, 'orbital-east-opening-header', rim, room.maxX + wall / 2, door.north,
      door.deck + (door.height + 2.25) / 2, wall, door.half * 2, door.height - 2.25);
  }

  eastOpening('airlock', airlockDoor);
  eastOpening('cockpit', cockpitDoor);

  const width = corridor.east - corridor.west;
  const length = corridor.north - corridor.south;
  const middleX = (corridor.east + corridor.west) / 2;
  const middleN = (corridor.north + corridor.south) / 2;
  box(hall, 'orbital-hall-deck', deck, middleX, middleN, -.08, width, length, .16);
  box(hall, 'orbital-hall-ceiling', hull, middleX, middleN, ceiling + .08, width + wall * 2, length, .16);
  box(hall, 'orbital-hall-south', hull, middleX, corridor.south - wall / 2, ceiling / 2, width, wall, ceiling);
  for (const [minX, maxX] of [[corridor.west, teleportDoor - 1.7], [teleportDoor + 1.7, corridor.east]]) {
    box(hall, 'orbital-hall-north-jamb', hull, (minX + maxX) / 2, corridor.north + wall / 2, ceiling / 2,
      maxX - minX, wall, ceiling);
  }
  box(hall, 'orbital-hall-north-header', rim, teleportDoor, corridor.north + wall / 2, (ceiling + 2.49) / 2,
    3.4, wall, ceiling - 2.49);
  for (const [x, minN, maxN] of [
    [corridor.west - wall / 2, early.rooms.airlock.maxN, early.rooms.cockpit.minN],
    [corridor.west - wall / 2, early.rooms.cockpit.maxN, observationDoor - 1.7],
    [corridor.west - wall / 2, observationDoor + 1.7, corridor.north],
    [corridor.east + wall / 2, corridor.south, livingDoor - 1.7],
    [corridor.east + wall / 2, livingDoor + 1.7, corridor.north],
  ]) {
    box(hall, 'orbital-hall-side', hull, x, (minN + maxN) / 2, ceiling / 2, wall, maxN - minN, ceiling);
  }
  for (const n of [2.6, 6.4, 10.2, 14, 17.8]) {
    box(hall, 'orbital-hall-light', marker, middleX, n, ceiling - .025, .44, 2.15, .032);
  }
  // Match the preserved S-2 cockpit rise with a physical side ramp.
  const run = rampEnd - corridor.west;
  const slope = Math.atan2(cockpitDoor.deck, run);
  const ramp = box(hall, 'orbital-cockpit-side-ramp', deck, (corridor.west + rampEnd) / 2,
    cockpitDoor.north, cockpitDoor.deck / 2, Math.hypot(run, cockpitDoor.deck), cockpitDoor.half * 2, .09);
  ramp.rotation.z = -slope;
  ramp.position.x -= ramp.scale.y * Math.sin(slope) / 2;
  ramp.position.y -= ramp.scale.y * Math.cos(slope) / 2;

  const localLiving = (x: number, n: number) => [livingDoor - n, x - corridor.east] as const;
  const localObservation = (x: number, n: number) => [n - observationDoor, corridor.west - x] as const;
  const localTeleport = (x: number, n: number) => [x - teleportDoor, n - corridor.north] as const;

  function corridorHeightAt(x: number, n: number) {
    if (x < corridor.west || x > corridor.east || n < corridor.south || n > corridor.north) return;
    if (Math.abs(n - cockpitDoor.north) <= cockpitDoor.half && x <= rampEnd) {
      return cockpitDoor.deck * (rampEnd - x) / run;
    }
    return 0;
  }

  function floorHeightAt(x: number, n: number) {
    if (!Number.isFinite(x) || !Number.isFinite(n)) return;
    return early.floorHeightAt(x, n) ?? corridorHeightAt(x, n) ??
      living.floorHeightAt(...localLiving(x, n)) ??
      observation.floorHeightAt(...localObservation(x, n)) ??
      teleport.floorHeightAt(...localTeleport(x, n));
  }

  function roomAt(x: number, n: number): OrbitalStationRoom | undefined {
    const inline = ({ minX, maxX, minN, maxN }: typeof early.rooms.airlock) =>
      x >= minX && x <= maxX && n >= minN && n <= maxN;
    if (inline(early.rooms.airlock)) return 'airlock';
    if (inline(early.rooms.cockpit)) return 'cockpit';
    if (x > corridor.east && living.floorHeightAt(...localLiving(x, n)) !== undefined) return 'living';
    if (x < corridor.west && observation.floorHeightAt(...localObservation(x, n)) !== undefined) return 'observation';
    if (n > corridor.north && teleport.floorHeightAt(...localTeleport(x, n)) !== undefined) return 'teleport';
  }

  function centered(x: number, n: number) {
    if (early.floorHeightAt(x, n) !== undefined) return early.isWalkable(x, n, 0);
    if (corridorHeightAt(x, n) !== undefined) return true;
    const livingPoint = localLiving(x, n);
    if (living.floorHeightAt(...livingPoint) !== undefined) return living.isWalkable(...livingPoint, 0);
    const observationPoint = localObservation(x, n);
    if (observation.floorHeightAt(...observationPoint) !== undefined) return observation.isWalkable(...observationPoint, 0);
    const teleportPoint = localTeleport(x, n);
    return teleport.isWalkable(...teleportPoint, 0);
  }

  function fitsDoor(x: number, n: number, radius: number) {
    if (Math.abs(x - corridor.west) <= radius) {
      const allowed = [airlockDoor, cockpitDoor, { north: observationDoor, half: 1.7 }];
      if (!allowed.some(door => Math.abs(n - door.north) + radius < door.half)) return false;
    }
    if (Math.abs(x - corridor.east) <= radius && Math.abs(n - livingDoor) + radius >= 1.7) return false;
    if (Math.abs(n - corridor.north) <= radius && x >= corridor.west &&
        Math.abs(x - teleportDoor) + radius >= 1.7) return false;
    return true;
  }

  function isWalkable(x: number, n: number, radius = .27) {
    if (![x, n, radius].every(Number.isFinite) || radius < 0 || !centered(x, n)) return false;
    if (!fitsDoor(x, n, radius)) return false;
    if (early.collisions.some(bounds => Math.hypot(distanceToRange(x, bounds.minX, bounds.maxX),
      distanceToRange(n, bounds.minN, bounds.maxN)) <= radius)) return false;
    const current = roomAt(x, n);
    if (current === 'living' && x - corridor.east > radius && !living.isWalkable(...localLiving(x, n), radius)) return false;
    if (current === 'observation' && corridor.west - x > radius &&
        !observation.isWalkable(...localObservation(x, n), radius)) return false;
    if (current === 'teleport' && n - corridor.north > radius &&
        !teleport.isWalkable(...localTeleport(x, n), radius)) return false;
    return arcSamples.every(([dx, dn]) => centered(x + dx * radius, n + dn * radius));
  }

  const rooms = {
    airlock: at(0, .7),
    living: at(corridor.east + 1.9, livingDoor),
    cockpit: at(3.65, cockpitDoor.north, cockpitDoor.deck),
    observation: at(corridor.west - observation.viewPoint.n, observationDoor + observation.viewPoint.x),
    teleport: at(teleportDoor + teleport.console.x, corridor.north + teleport.console.n, teleport.console.ground),
  } satisfies Record<OrbitalStationRoom, OrbitalRoomPoint>;
  const start = early.ports.starport.arrival;
  const tourRoute = [start, at(0, -.35), rooms.airlock, at(0, airlockDoor.north), at(8.4, airlockDoor.north),
    at(9.5, livingDoor), rooms.living, at(9.5, livingDoor), at(9.5, cockpitDoor.north), rooms.cockpit,
    at(9.5, cockpitDoor.north), at(9.5, observationDoor), at(4.3, observationDoor), rooms.observation,
    at(4.3, observationDoor), at(9.1, observationDoor), rooms.teleport];
  let disposed = false;
  return {
    group, rooms, start, tourRoute, floorHeightAt, roomAt, isWalkable, status,
    teleport: { ...teleport, console: rooms.teleport },
    dispose() {
      if (disposed) return;
      disposed = true;
      signage.dispose();
      status.dispose();
      const geometries = new Set<Mesh['geometry']>();
      early.group.traverse(node => {
        if (!(node instanceof Mesh) && !(node instanceof Points)) return;
        if (node.geometry !== unit) geometries.add(node.geometry);
        for (const material of Array.isArray(node.material) ? node.material : [node.material]) stationMaterials.add(material);
      });
      for (const geometry of geometries) geometry.dispose();
      living.dispose();
      observation.dispose();
      teleport.dispose();
      unit.dispose();
      for (const material of stationMaterials) material.dispose();
      group.removeFromParent();
      group.clear();
    },
  };
}
