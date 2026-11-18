import {
  Box3, BoxGeometry, Color, DynamicDrawUsage, Group, InstancedMesh, Matrix4, Mesh, MeshLambertMaterial, Object3D,
  OctahedronGeometry, Sphere, Vector3,
} from 'three';
import type { IcePalaceActivityAnchors, IcePalaceActivityState, IcePalacePoint } from './ice-palace-activity';
import { buildIcePalaceMaze, icePalaceMazeBlockGrooves } from './ice-palace-maze';
import { icePalaceSite } from './ice-palace-site';
import { readWalkGeometry, type Box } from './landmark-kit';

export const icePalaceForecourt = {
  // Terrain extends south without moving the west gate, hall or existing collision.
  buildingOrigin: icePalaceSite.buildingOrigin,
  terrainOrigin: icePalaceSite.terrain.origin,
  terrainFootprint: icePalaceSite.terrain.footprint,
  bounds: icePalaceSite.forecourtBounds,
  mazeOrigin: [484, 53, 12.12],
  mazeEntry: [483.5, 47.75, 12.12],
  mazeGrotto: [499.75, 44.75, 12.12],
  stationTrailWidth: 6,
  stationTrail: [
    [496, 34], [472, 39], [472, 48], [466, 53.3],
    [461.6, 54.2], [460.1, 58.8], [460.1, 69.8], [460, 72],
  ],
  southGateTrail: [[472, 48], [477, 51], [481, 54], [486, 54], [486, 55.65]],
  mazeEntryTrail: [[472, 48], [483.5, 47.75], [484.75, 47.75]],
} as const;

type WalkGeometry = { colliders?: Box[]; floors?: Box[] };
type GrottoVisualState = Pick<IcePalaceActivityState, 'platePressed' | 'doors' | 'blockPositions' | 'key'>;
type GrottoVisuals = { update(state: GrottoVisualState): void };

const mazeOffset = [0, .12, 19] as const;
const toCastle = ([x, z]: readonly [number, number]): IcePalacePoint => [x + mazeOffset[0], mazeOffset[1], z + mazeOffset[2]];
const toMaze = ([x, y, z]: IcePalacePoint): IcePalacePoint => [x - mazeOffset[0], y - mazeOffset[1], z - mazeOffset[2]];
const block = ({ home, target }: (typeof icePalaceMazeBlockGrooves)[number]) => ({ home: toCastle(home), target: toCastle(target) });
const [pressureGroove, westernGroove, centralGroove] = icePalaceMazeBlockGrooves;

export const icePalaceForecourtGrotto = {
  plate: toCastle(pressureGroove.target),
  key: toCastle([15.75, 8.25]),
  blocks: [block(pressureGroove), block(westernGroove), block(centralGroove)],
  door: { min: [17.82, .12, 26.7], max: [18.18, 2.32, 27.8] },
} satisfies Pick<IcePalaceActivityAnchors, 'plate' | 'key' | 'blocks'> & { door: Box };

export type IcePalaceForecourtGroup = Group & { userData: WalkGeometry & { grottoVisuals: GrottoVisuals } };

function addGrottoVisuals(group: Group): GrottoVisuals {
  const shape = new BoxGeometry();
  const plateMaterial = new MeshLambertMaterial({ color: '#79b1c8', emissive: '#58c8dc', emissiveIntensity: .15 });
  const plate = new Mesh(shape, plateMaterial);
  const [px, py, pz] = toMaze(icePalaceForecourtGrotto.plate);
  plate.name = '石窟压力板';
  plate.position.set(px, py + .022, pz);
  plate.scale.set(.9, .044, .9);
  group.add(plate);

  const { min, max } = icePalaceForecourtGrotto.door;
  const door = new Mesh(shape, new MeshLambertMaterial({
    color: '#72b4cc', emissive: '#376274', emissiveIntensity: .22, transparent: true, opacity: .84, depthWrite: false,
  }));
  door.name = '石窟冰门';
  door.position.set(...toMaze([(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]));
  door.scale.set(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  group.add(door);

  const blockSites = icePalaceForecourtGrotto.blocks;
  const snow = new MeshLambertMaterial({ color: '#c9e5ec' });
  const blocks = new InstancedMesh(shape, snow, blockSites.length);
  blocks.name = '迷宫雪块';
  blocks.instanceMatrix.setUsage(DynamicDrawUsage);
  const blockTransform = new Matrix4().makeScale(1.2, 1.2, 1.2);
  const sweptBounds = new Box3();
  for (const { home, target } of blockSites) {
    for (const point of [home, target]) {
      const [x, y, z] = toMaze(point);
      sweptBounds.expandByPoint(new Vector3(x, y + .6, z));
    }
  }
  blocks.boundingSphere = sweptBounds.expandByScalar(.6).getBoundingSphere(new Sphere());
  group.add(blocks);

  const previousPositions: (IcePalacePoint | undefined)[] = [];
  function positionBlocks(positions: readonly IcePalacePoint[]) {
    let changed = false;
    for (const [index, position] of positions.entries()) {
      const previous = previousPositions[index];
      if (previous && previous[0] === position[0] && previous[1] === position[1] && previous[2] === position[2]) continue;
      const [x, y, z] = toMaze(position);
      blocks.setMatrixAt(index, blockTransform.setPosition(x, y + .6, z));
      previousPositions[index] = position;
      changed = true;
    }
    if (changed) blocks.instanceMatrix.needsUpdate = true;
  }
  positionBlocks(blockSites.map(({ home }) => home));

  const key = new Mesh(new OctahedronGeometry(.21), new MeshLambertMaterial({
    color: '#c0f5fe', emissive: '#74d0f3', emissiveIntensity: .58,
  }));
  key.name = '石窟冰钥匙';
  key.position.set(...toMaze(icePalaceForecourtGrotto.key));
  key.position.y += .50;
  key.position.z += .49;
  key.scale.set(.56, 1.35, .54);
  group.add(key);

  return {
    update(state) {
      plateMaterial.emissiveIntensity = state.platePressed ? .65 : .15;
      door.visible = !state.doors.grotto;
      key.visible = !state.key;
      positionBlocks(state.blockPositions);
    },
  };
}

export function buildIcePalaceForecourt(): IcePalaceForecourtGroup {
  const group = buildIcePalaceMaze({ snowBlockGrooves: true }) as IcePalaceForecourtGroup;
  const [east, north, floor] = icePalaceForecourt.mazeOrigin;
  const [west, south, right, back] = icePalaceForecourt.bounds;
  group.name = '城堡南前庭与冰宫迷宫';
  group.position.set(east, floor, -north);

  const pieces = [
    { x: 0, y: -.12, z: 7, width: 48, height: .24, depth: 14, color: '#8bb7ce' },
    { x: -12, y: .009, z: 7, width: 23.8, height: .018, depth: 13.65, color: '#b5d2e4' },
    { x: 0, y: .009, z: 13.26, width: 29.8, height: .018, depth: 1.18, color: '#a0cadf' },
    { x: 12, y: .009, z: 12.15, width: 23.8, height: .018, depth: .22, color: '#78a7c8' },
    { x: 15.75, y: .13, z: 8.74, width: .34, height: .26, depth: .34, color: '#597b97' },
  ];
  const pavement = new InstancedMesh(new BoxGeometry(), new MeshLambertMaterial(), pieces.length);
  pavement.name = '南前庭地台';
  const pose = new Object3D();
  const color = new Color();
  pieces.forEach((piece, index) => {
    pose.position.set(piece.x, piece.y, piece.z);
    pose.scale.set(piece.width, piece.height, piece.depth);
    pose.updateMatrix();
    pavement.setMatrixAt(index, pose.matrix);
    pavement.setColorAt(index, color.set(piece.color));
  });
  pavement.computeBoundingSphere();
  group.add(pavement);
  group.userData.floors = [{ min: [west - east, -.24, north - back], max: [right - east, 0, north - south] }];
  group.userData.grottoVisuals = addGrottoVisuals(group);
  return group;
}

export function mountIcePalaceForecourt(palace: Group) {
  const forecourt = buildIcePalaceForecourt();
  const [east, north, height] = icePalaceForecourt.buildingOrigin;
  forecourt.position.x -= east;
  forecourt.position.y -= height;
  forecourt.position.z += north;

  const child = readWalkGeometry(forecourt);
  const geometry: WalkGeometry = palace.userData;
  // The world collision index reads only the landmark root's boxes.
  (geometry.colliders ??= []).push(...child.colliders);
  (geometry.floors ??= []).push(...child.floors);
  palace.add(forecourt);
  return forecourt;
}
