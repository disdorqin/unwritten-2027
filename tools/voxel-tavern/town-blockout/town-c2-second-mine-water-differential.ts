import {
  BoxGeometry, DoubleSide, Group, InstancedMesh, Matrix4,
  MeshBasicMaterial, MeshLambertMaterial, Object3D, StaticDrawUsage,
} from 'three';
import {
  readUndergroundWaterPresentation, type AcceptedWaterReader,
} from '../../../src/shared/town-c-water-snapshot-port.js';
import {
  secondMineAnchors, secondMineBed, secondMineRiver,
} from '../../../src/shared/underground-second-mine-layout.js';

export type C2SecondMineWaterMode = 'raised' | 'baseline' | 'hidden' | 'unconfigured';

export type C2SecondMineWaterStats = Readonly<{
  level: 'low' | 'mid' | 'high';
  phase: 'rise' | 'level' | 'fall' | undefined;
  configured: boolean;
  waterMode: C2SecondMineWaterMode;
  ferryRunning: boolean;
  groundedBoat: boolean;
  flowStreakCount: number;
  riverbedPatchCount: number;
  riverbedStoneCount: number;
  realLightCount: number;
  colliderCount: number;
  disposed: boolean;
}>;

type C2SecondMineWaterScene = Readonly<{
  group: Group;
  sync(): C2SecondMineWaterStats;
  setNight(night: boolean): void;
  stats(): C2SecondMineWaterStats;
  dispose(): void;
}>;

function instanceBoxes(group: Group, name: string,
  boxes: readonly Readonly<{ x: number; y: number; n: number; w: number; h: number; d: number }>[],
  material: MeshLambertMaterial | MeshBasicMaterial) {
  const geometry = new BoxGeometry();
  const mesh = new InstancedMesh(geometry, material, boxes.length);
  mesh.name = name;
  mesh.instanceMatrix.setUsage(StaticDrawUsage);
  const matrix = new Matrix4();
  boxes.forEach((box, index) => {
    matrix.makeScale(box.w, box.h, box.d);
    matrix.setPosition(box.x, box.y, -box.n);
    mesh.setMatrixAt(index, matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  group.add(mesh);
  return { geometry, mesh };
}

function makeBoat(group: Group) {
  const wood = new MeshLambertMaterial({ color: 0x6f5038, flatShading: true });
  const iron = new MeshLambertMaterial({ color: 0x59636a, flatShading: true });
  const parts: { x: number; y: number; n: number; w: number; h: number; d: number }[] = [];
  for (let n = -2.2; n <= 2.2; n += .38) {
    parts.push({ x: 0, y: 0, n, w: 2.05, h: .16, d: .34 });
  }
  for (const x of [-1, 1]) for (let n = -2; n <= 2; n += .5) {
    parts.push({ x, y: .24, n, w: .14, h: .42, d: .46 });
  }
  for (const n of [-2.35, 2.35]) parts.push({ x: 0, y: .22, n, w: 2.05, h: .46, d: .16 });
  const hull = instanceBoxes(group, 'town-c2-water/grounded-ferry-hull', parts, wood);
  const pole = instanceBoxes(group, 'town-c2-water/grounded-ferry-pole', [
    { x: .72, y: 1.05, n: 0, w: .07, h: 2.8, d: .07 },
    { x: .72, y: .12, n: 0, w: .5, h: .12, d: .5 },
  ], iron);
  group.position.set(0, -.52, -137);
  return { materials: [wood, iron], geometries: [hull.geometry, pole.geometry] };
}

/** Local visual overlay for the registered -140 domain. It owns no water authority or collision. */
export function mountTownC2SecondMineWaterDifferential(options: Readonly<{
  parent: Group;
  readAcceptedWater: AcceptedWaterReader;
}>): C2SecondMineWaterScene {
  const root = new Group();
  root.name = 'town-c2-second-mine-water-differential';
  root.userData.visualOnly = true;
  root.userData.coordinateFrame = 'second-mine-local-east-up-north';
  options.parent.add(root);

  const high = new Group();
  high.name = 'town-c2-water/high-flow';
  const mid = new Group();
  mid.name = 'town-c2-water/mid-ferry';
  const low = new Group();
  low.name = 'town-c2-water/low-dry-bed';
  root.add(high, mid, low);

  const flowMaterial = new MeshBasicMaterial({
    color: 0x79a8b8, transparent: true, opacity: .28, depthWrite: false,
    side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  const flowBoxes = Array.from({ length: 18 }, (_, index) => {
    const n = secondMineRiver.n0 + 1 + (index % 6) * 2.7;
    return {
      x: -40 + (index % 3) * 36,
      y: -.012 + (index % 2) * .006,
      n,
      w: 7 + (index % 4) * 1.8,
      h: .012,
      d: .10 + (index % 3) * .045,
    };
  });
  const flow = instanceBoxes(high, 'town-c2-water/high-flow-streaks', flowBoxes, flowMaterial);

  const barrierMaterial = new MeshLambertMaterial({
    color: 0xc98b45, emissive: 0x6b3b16, emissiveIntensity: .2, flatShading: true,
  });
  const barriers = instanceBoxes(high, 'town-c2-water/high-pier-barriers', [
    { x: -3.7, y: .72, n: secondMineAnchors.nearPier.north, w: .18, h: .16, d: 2.2 },
    { x: 3.7, y: .72, n: secondMineAnchors.farPier.north, w: .18, h: .16, d: 2.2 },
  ], barrierMaterial);

  const midMaterial = new MeshBasicMaterial({
    color: 0xe0aa63, transparent: true, opacity: .55, depthWrite: false,
    side: DoubleSide,
  });
  const midMarkers = instanceBoxes(mid, 'town-c2-water/mid-ferry-markers', [
    { x: 0, y: .24, n: secondMineAnchors.nearPier.north, w: 2.8, h: .025, d: .18 },
    { x: 0, y: .24, n: secondMineAnchors.farPier.north, w: 2.8, h: .025, d: .18 },
  ], midMaterial);

  const wetMaterial = new MeshLambertMaterial({ color: 0x343d40, flatShading: true });
  const stoneMaterial = new MeshLambertMaterial({ color: 0x69706c, flatShading: true });
  const wetBoxes = Array.from({ length: 26 }, (_, index) => {
    const n = secondMineRiver.n0 + .8 + (index % 13) * 1.32;
    return {
      x: -43 + (index % 5) * 20.5,
      y: secondMineBed(n) + .025,
      n,
      w: 3.2 + (index % 3) * 1.4,
      h: .028,
      d: .65 + (index % 4) * .22,
    };
  });
  const wet = instanceBoxes(low, 'town-c2-water/low-wet-riverbed', wetBoxes, wetMaterial);
  const stoneBoxes = Array.from({ length: 42 }, (_, index) => {
    const n = secondMineRiver.n0 + .6 + ((index * 7) % 17) * .96;
    const size = .12 + (index % 4) * .045;
    return {
      x: -44 + ((index * 13) % 88),
      y: secondMineBed(n) + size / 2 + .02,
      n,
      w: size,
      h: size * .65,
      d: size * 1.25,
    };
  });
  const stones = instanceBoxes(low, 'town-c2-water/low-riverbed-stones', stoneBoxes, stoneMaterial);
  const boatResources = makeBoat(low);

  const ownedGeometries = [
    flow.geometry, barriers.geometry, midMarkers.geometry, wet.geometry, stones.geometry,
    ...boatResources.geometries,
  ];
  const ownedMaterials = [
    flowMaterial, barrierMaterial, midMaterial, wetMaterial, stoneMaterial,
    ...boatResources.materials,
  ];

  let disposed = false;
  let night = false;
  let state: C2SecondMineWaterStats = Object.freeze({
    level: 'mid', phase: undefined, configured: false, waterMode: 'unconfigured',
    ferryRunning: false, groundedBoat: false, flowStreakCount: 0,
    riverbedPatchCount: 0, riverbedStoneCount: 0, realLightCount: 0,
    colliderCount: 0, disposed: false,
  });

  function apply(level: 'low' | 'mid' | 'high', phase: 'rise' | 'level' | 'fall' | undefined) {
    high.visible = level === 'high';
    mid.visible = level === 'mid';
    low.visible = level === 'low';
    state = Object.freeze({
      level,
      phase,
      configured: true,
      waterMode: level === 'high' ? 'raised' : level === 'low' ? 'hidden' : 'baseline',
      ferryRunning: level === 'mid',
      groundedBoat: level === 'low',
      flowStreakCount: level === 'high' ? flowBoxes.length : 0,
      riverbedPatchCount: level === 'low' ? wetBoxes.length : 0,
      riverbedStoneCount: level === 'low' ? stoneBoxes.length : 0,
      realLightCount: 0,
      colliderCount: 0,
      disposed,
    });
  }

  function sync(): C2SecondMineWaterStats {
    if (disposed) return state;
    const accepted = readUndergroundWaterPresentation(options.readAcceptedWater);
    if (!accepted) {
      root.visible = false;
      state = Object.freeze({
        level: 'mid', phase: undefined, configured: false, waterMode: 'unconfigured',
        ferryRunning: false, groundedBoat: false, flowStreakCount: 0,
        riverbedPatchCount: 0, riverbedStoneCount: 0, realLightCount: 0,
        colliderCount: 0, disposed,
      });
      return state;
    }
    root.visible = true;
    apply(accepted.level, accepted.phase);
    return state;
  }

  root.userData.stats = sync();
  return Object.freeze({
    group: root,
    sync,
    setNight(value: boolean) {
      if (disposed) return;
      const next = !!value;
      if (next === night) return;
      night = next;
      barrierMaterial.emissiveIntensity = night ? .65 : .2;
      flowMaterial.opacity = night ? .34 : .22;
    },
    stats: () => state,
    dispose() {
      if (disposed) return;
      disposed = true;
      root.visible = false;
      for (const geometry of ownedGeometries) geometry.dispose();
      for (const material of ownedMaterials) material.dispose();
      root.removeFromParent();
      root.clear();
      state = Object.freeze({ ...state, configured: false, waterMode: 'unconfigured', disposed: true });
    },
  });
}
