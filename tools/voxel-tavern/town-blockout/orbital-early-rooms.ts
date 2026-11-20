import {
  BoxGeometry, BufferGeometry, CircleGeometry, Float32BufferAttribute, Group, HemisphereLight,
  Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, Points, PointsMaterial,
  RingGeometry, type Material,
} from 'three';
import { createTownChronicleDoorRing } from './town-chronicle-door-ring.js';
import { buildOrbitalStatusWall } from './orbital-airlock-nameplate.js';

export type OrbitalRoomPoint = Readonly<{ x: number; n: number; ground: number }>;
export type OrbitalRoomArrival = OrbitalRoomPoint & Readonly<{ yaw: number }>;
export type OrbitalDoorPort = Readonly<{
  frame: OrbitalRoomPoint;
  approach: OrbitalRoomPoint;
  arrival: OrbitalRoomArrival;
}>;
export type OrbitalRoomBounds = Readonly<{ minX: number; maxX: number; minN: number; maxN: number }>;
export type OrbitalRoomCollision = OrbitalRoomBounds & Readonly<{
  kind: 'door-frame' | 'console' | 'captain-chair' | 'captain-table' | 'status-panel';
}>;

const airlock = { minX: -5.4, maxX: 5.4, minN: -3.8, maxN: 3.2 };
const passage = { minX: -1.7, maxX: 1.7, minN: airlock.maxN, maxN: 4.8 };
const bridge = { minX: -5.4, maxX: 5.4, minN: passage.maxN, maxN: 11.6 };
const bridgeDeck = .32;
const wall = .18;
const outline = [
  [airlock.minX, airlock.minN], [airlock.maxX, airlock.minN],
  [airlock.maxX, airlock.maxN], [passage.maxX, passage.minN],
  [passage.maxX, passage.maxN], [bridge.maxX, bridge.minN],
  [bridge.maxX, bridge.maxN], [bridge.minX, bridge.maxN],
  [bridge.minX, bridge.minN], [passage.minX, passage.maxN],
  [passage.minX, passage.minN], [airlock.minX, airlock.maxN],
] as const;

function inBounds(x: number, n: number, bounds: OrbitalRoomBounds) {
  return x >= bounds.minX && x <= bounds.maxX && n >= bounds.minN && n <= bounds.maxN;
}

function distanceToEdgeSquared(x: number, n: number, index: number) {
  const [ax, an] = outline[index]!;
  const [bx, bn] = outline[(index + 1) % outline.length]!;
  const nearestX = Math.max(Math.min(ax, bx), Math.min(x, Math.max(ax, bx)));
  const nearestN = Math.max(Math.min(an, bn), Math.min(n, Math.max(an, bn)));
  return (nearestX - x) ** 2 + (nearestN - n) ** 2;
}

/**
 * Independent, authored interior in local X-east, N-north, Y-up coordinates.
 * Port positions are floor points. Place the group and map these coordinates in the host.
 */
export function createOrbitalEarlyRooms({ scale = 1 }: { scale?: number } = {}) {
  if (!Number.isFinite(scale) || scale <= 0) throw new RangeError('Orbital room scale must be positive and finite');
  const group = new Group();
  group.name = 'orbital-early-rooms';
  group.scale.setScalar(scale);
  const airlockGroup = new Group();
  airlockGroup.name = 'orbital-airlock';
  const bridgeGroup = new Group();
  bridgeGroup.name = 'orbital-cockpit';
  group.add(airlockGroup, bridgeGroup, new HemisphereLight(0xd4e7ff, 0x806355, 1.45));

  const iron = new MeshStandardMaterial({ color: 0x414c56, roughness: .85, metalness: .22 });
  const rib = new MeshStandardMaterial({ color: 0x667889, roughness: .72, metalness: .38 });
  const dark = new MeshStandardMaterial({ color: 0x1b2832, roughness: .82, metalness: .23 });
  const floor = new MeshStandardMaterial({ color: 0x354450, roughness: .94 });
  const brass = new MeshStandardMaterial({ color: 0x9b7654, roughness: .62, metalness: .48 });
  const paper = new MeshStandardMaterial({ color: 0xd5bd8e, roughness: 1 });
  const dust = new MeshStandardMaterial({ color: 0x504d46, roughness: 1 });
  const warm = new MeshBasicMaterial({ color: 0xffc179 });
  const red = new MeshBasicMaterial({ color: 0xa63742 });
  const green = new MeshBasicMaterial({ color: 0x82d9a9 });
  const blue = new MeshBasicMaterial({ color: 0x659bb8 });
  const obstructions: OrbitalRoomCollision[] = [];

  function box(parent: Group, material: Material, x: number, y: number, n: number,
    width: number, height: number, depth: number) {
    const mesh = new Mesh(new BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, -n);
    parent.add(mesh);
    return mesh;
  }

  function deck(parent: Group, bounds: OrbitalRoomBounds, height: number) {
    box(parent, floor, (bounds.minX + bounds.maxX) / 2, height - .08, (bounds.minN + bounds.maxN) / 2,
      bounds.maxX - bounds.minX, .16, bounds.maxN - bounds.minN);
  }

  function enclose(parent: Group, bounds: OrbitalRoomBounds, ground: number, height: number,
    openSouth: boolean, openNorth: boolean) {
    const { minX, maxX, minN, maxN } = bounds;
    const width = maxX - minX, depth = maxN - minN, midN = (minN + maxN) / 2;
    deck(parent, bounds, ground);
    box(parent, iron, 0, ground + height + .08, midN, width + wall * 2, .16, depth).name = 'orbital-cutaway-shell';
    for (const side of [-1, 1]) {
      const sideWall = box(parent, iron, side * (maxX + wall / 2), ground + height / 2, midN, wall, height, depth);
      if (side > 0) sideWall.name = 'orbital-cutaway-shell';
      if (openSouth) {
        box(parent, iron, side * (maxX + passage.maxX) / 2, ground + height / 2, minN - wall / 2,
          maxX - passage.maxX, height, wall);
      }
      if (openNorth) {
        box(parent, iron, side * (maxX + passage.maxX) / 2, ground + height / 2, maxN + wall / 2,
          maxX - passage.maxX, height, wall);
      }
    }
    if (!openSouth) box(parent, iron, 0, ground + height / 2, minN - wall / 2, width, height, wall).name = 'orbital-cutaway-shell';
  }

  function obstacle(kind: OrbitalRoomCollision['kind'], x: number, n: number, halfX: number, halfN: number) {
    obstructions.push({ kind, minX: x - halfX, maxX: x + halfX, minN: n - halfN, maxN: n + halfN });
  }

  enclose(airlockGroup, airlock, 0, 2.95, false, true);
  enclose(bridgeGroup, bridge, bridgeDeck, 3.75, true, false);
  const rise = Math.atan2(bridgeDeck, passage.maxN - passage.minN);
  const ramp = box(group, floor, 0, bridgeDeck / 2, (passage.minN + passage.maxN) / 2,
    passage.maxX - passage.minX, .12, Math.hypot(passage.maxN - passage.minN, bridgeDeck));
  ramp.rotation.x = rise;
  ramp.position.y -= Math.cos(rise) * .06;
  ramp.position.z -= Math.sin(rise) * .06;
  for (const side of [-1, 1]) {
    const sideWall = box(group, iron, side * (passage.maxX + wall / 2), 1.53, 4, wall, 3.3, passage.maxN - passage.minN);
    if (side > 0) sideWall.name = 'orbital-cutaway-shell';
    box(group, blue, side * 1.51, 2.66, 4, .05, .04, passage.maxN - passage.minN);
  }
  box(group, iron, 0, 3.21, 4, passage.maxX * 2, .15, passage.maxN - passage.minN).name = 'orbital-cutaway-shell';
  for (const side of [-1, 1]) {
    const door = new Group();
    door.name = side < 0 ? 'orbital-starport-frame' : 'orbital-core-vault-frame';
    door.position.set(side * 5.35, 0, .35);
    door.rotation.y = side * -Math.PI / 2;
    box(door, dark, 0, 1.25, 0, 1.86, 2.5, .22).name = 'closed-door-surface';
    for (const post of [-1, 1]) box(door, rib, post * .96, 1.25, -.08, .2, 2.5, .25);
    box(door, rib, 0, 2.52, -.08, 2.12, .18, .25);
    const ring = createTownChronicleDoorRing(.55, .65);
    ring.position.set(0, 1.43, .14);
    door.add(ring);
    airlockGroup.add(door);
    obstacle('door-frame', side * 5.35, -.35, .14, 1.06);
    box(airlockGroup, rib, side * 4.55, 2.69, -.27, .12, .12, 6.75);
    box(airlockGroup, brass, side * 4.24, 2.55, -.27, .075, .075, 6.45);
    box(airlockGroup, warm, side * 4.04, 2.54, -.27, .06, .05, 2.35);
  }

  airlockGroup.add(buildOrbitalStatusWall(dark));
  obstacle('status-panel', 0, -3.65, 2.225, .17);
  for (let column = 0; column < 6; column++) {
    for (let row = 0; row < 3; row++) {
      const isTeleport = row === 0 && column === 1;
      const isLifeSupport = row === 0 && column === 4;
      const lamp = box(airlockGroup, isTeleport || isLifeSupport ? green : red,
        (column - 2.5) * .7, 1.95 - row * .43, -3.51, .27, .14, .05);
      lamp.name = isTeleport ? 'status-teleport' : isLifeSupport ? 'status-life-support' : 'status-red';
    }
  }
  for (let i = 0; i < 9; i++) {
    const mark = box(airlockGroup, dust, (i % 2) * .28 - .14, .002, -2.2 + .47 * i, .15, .004, .28);
    mark.name = 'old-dust-print';
    mark.rotation.y = (i % 2 ? 1 : -1) * .19;
  }

  for (let i = -2; i <= 2; i++) {
    const x = i * 1.12;
    const n = 9.83 - Math.abs(i) ** 2 * .12;
    const station = new Group();
    station.name = 'worn-bridge-console';
    station.position.set(x, bridgeDeck, -n);
    station.rotation.y = (i < 0 ? -1 : 1) * Math.abs(i) * .21;
    box(station, dark, 0, .42, 0, 1.1, .84, .51);
    box(station, iron, 0, .89, 0, 1.15, .1, .62);
    for (let key = 0; key < 6; key++) {
      box(station, key === 1 && i === 0 ? brass : rib, (key % 3 - 1) * .21, .96,
        key < 3 ? -.13 : .09, .13, .04, .13);
    }
    bridgeGroup.add(station);
    obstacle('console', x, n, .66, .54);
    const rail = box(bridgeGroup, blue, i * 1.83, 3.67, 11.39, 1.55, .06, .09);
    rail.name = 'cockpit-window-rail';
  }
  for (const side of [-1, 1]) {
    box(bridgeGroup, warm, side * .76, bridgeDeck + .011, 8.63, .37, .02, .045).name = 'captain-hands-marker';
  }
  const chair = box(bridgeGroup, dark, 0, bridgeDeck + .29, 7.4, .58, .58, .58);
  chair.name = 'captain-chair';
  box(bridgeGroup, rib, 0, bridgeDeck + .67, 7.17, .54, .61, .17);
  obstacle('captain-chair', 0, 7.38, .29, .31);
  box(bridgeGroup, rib, 0, bridgeDeck + .37, 8.12, .18, .74, .18);
  box(bridgeGroup, dark, 0, bridgeDeck + .77, 8.12, .49, .09, .43).name = 'captain-table';
  box(bridgeGroup, brass, -.08, bridgeDeck + .87, 8.16, .16, .12, .16).name = 'upturned-cup';
  obstacle('captain-table', 0, 8.12, .245, .215);
  const log = new Group();
  log.name = 'blank-log-bay';
  // A blank spread shows the half-filled last leaf without exposing any story text.
  box(log, dark, 0, .018, 0, .55, .036, .28);
  box(log, paper, -.13, .041, 0, .235, .009, .238);
  box(log, paper, .13, .041, .06, .235, .009, .107);
  box(log, warm, .303, .032, 0, .042, .018, .059).name = 'log-page-lamp';
  log.position.set(0, bridgeDeck + .947, -9.83);
  bridgeGroup.add(log);

  box(bridgeGroup, iron, 0, bridgeDeck + .46, bridge.maxN + wall / 2, 10.8, .92, wall);
  box(bridgeGroup, rib, 0, bridgeDeck + 3.57, bridge.maxN + wall / 2, 10.8, .36, wall);
  for (const side of [-1, 1]) {
    box(bridgeGroup, rib, side * 5.15, bridgeDeck + 2.17, bridge.maxN + wall / 2, .5, 2.5, wall);
  }
  function windowLayer(geometry: PlaneGeometry | CircleGeometry | RingGeometry, color: number,
    x: number, y: number, n: number) {
    const mesh = new Mesh(geometry, new MeshBasicMaterial({ color }));
    mesh.position.set(x, y, -n);
    bridgeGroup.add(mesh);
    return mesh;
  }
  const backdrop = windowLayer(new PlaneGeometry(16, 7), 0x0b1427, 0, 1.7, 14.5);
  backdrop.name = 'cockpit-window-backdrop';
  const starGeometry = new BufferGeometry();
  const stars: number[] = [];
  for (let i = 0; i < 60; i++) {
    stars.push(Math.sin(i * 47.61) * 7.7, 2 + Math.cos(i * 13.59) * 3.2, -14.35);
  }
  starGeometry.setAttribute('position', new Float32BufferAttribute(stars, 3));
  bridgeGroup.add(new Points(starGeometry, new PointsMaterial({ color: 0xbdc9e2, size: .028 })));
  const horizon = windowLayer(new CircleGeometry(8.2, 72), 0x3f657e, -.4, -5.08, 14.21);
  horizon.name = 'cockpit-planet-horizon';
  const atmosphere = windowLayer(new RingGeometry(8.2, 8.28, 72), 0x8db4ca, -.4, -5.08, 14.19);
  const clouds = [1.2, .88, .61, .38].map((y, i) => {
    const cloud = windowLayer(new CircleGeometry(1, 40), i % 2 ? 0x54788e : 0x5e8499,
      -.9 + i * .60, y, 14.03 - i * .012);
    cloud.scale.set(4.9 - i * .42, .085 + i * .01, 1);
    return cloud;
  });
  const town = windowLayer(new CircleGeometry(.035, 8), 0xffc787, .50, .50, 13.9);
  town.name = 'cockpit-distant-town-light';
  const fragment = windowLayer(new CircleGeometry(.044, 5), 0xa1abb7, 0, 3.1, 13.65);
  fragment.name = 'cockpit-window-fragment';
  fragment.visible = false;

  function setWindowMotion(seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 0) return;
    const drift = Math.sin(seconds / 170) * .42;
    horizon.position.x = atmosphere.position.x = -.4 + drift;
    clouds.forEach((cloud, i) => { cloud.position.x = -.9 + i * .60 + drift * (1 + i * .24); });
    town.position.x = .50 + drift;
    const pass = seconds % 29;
    fragment.visible = pass > 25 && pass < 27.4;
    fragment.position.x = -5.2 + (pass - 25) * 4.4;
    fragment.position.y = 3.1 - (pass - 25) * .21;
    fragment.rotation.z = pass;
  }

  const point = (x: number, n: number, ground = 0): OrbitalRoomPoint =>
    ({ x: x * scale, n: n * scale, ground: ground * scale });
  const scaledBounds = ({ minX, maxX, minN, maxN }: OrbitalRoomBounds): OrbitalRoomBounds =>
    ({ minX: minX * scale, maxX: maxX * scale, minN: minN * scale, maxN: maxN * scale });
  function port(side: -1 | 1): OrbitalDoorPort {
    return {
      frame: point(side * 5.22, -.35),
      approach: point(side * 4.56, -.35),
      arrival: { ...point(side * 3.83, -.35), yaw: -side * Math.PI / 2 },
    };
  }

  function floorHeightAt(east: number, north: number) {
    const x = east / scale, n = north / scale;
    if (inBounds(x, n, airlock)) return 0;
    if (inBounds(x, n, bridge)) return bridgeDeck * scale;
    if (inBounds(x, n, passage)) {
      return bridgeDeck * scale * (n - passage.minN) / (passage.maxN - passage.minN);
    }
  }

  function isWalkable(east: number, north: number, radius = .27) {
    if (!Number.isFinite(radius) || radius < 0 || floorHeightAt(east, north) === undefined) return false;
    const x = east / scale, n = north / scale, radiusSquared = (radius / scale) ** 2;
    if (outline.some((_, index) => distanceToEdgeSquared(x, n, index) < radiusSquared)) return false;
    return !obstructions.some(bounds => {
      const dx = Math.max(bounds.minX - x, 0, x - bounds.maxX);
      const dn = Math.max(bounds.minN - n, 0, n - bounds.maxN);
      return dx * dx + dn * dn <= radiusSquared;
    });
  }

  return {
    group,
    ports: { starport: port(-1), coreVault: port(1) },
    cockpit: {
      leftHand: point(-.76, 8.63, bridgeDeck),
      rightHand: point(.76, 8.63, bridgeDeck),
      log: { ...point(0, 9.83, bridgeDeck + .947), text: '' as const, lastPageFill: .5 as const },
    },
    rooms: { airlock: scaledBounds(airlock), passage: scaledBounds(passage), cockpit: scaledBounds(bridge) },
    collisions: obstructions.map(({ kind, ...bounds }) => ({ kind, ...scaledBounds(bounds) })),
    isWalkable,
    floorHeightAt,
    setWindowMotion,
  };
}

export type OrbitalEarlyRooms = ReturnType<typeof createOrbitalEarlyRooms>;
