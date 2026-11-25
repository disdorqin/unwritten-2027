import {
  BoxGeometry, Color, DoubleSide, Group, InstancedMesh, Matrix4,
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
  // White bases let the existing hull instances carry dry timber, damp grain and iron tones.
  const wood = new MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  const iron = new MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  const parts: { x: number; y: number; n: number; w: number; h: number; d: number; iron?: boolean }[] = [];
  for (let n = -2.2; n <= 2.2; n += .38) {
    parts.push({ x: 0, y: 0, n, w: 2.05, h: .16, d: .34 });
  }
  for (const x of [-1, 1]) for (let n = -2; n <= 2; n += .5) {
    parts.push({ x, y: .24, n, w: .14, h: .42, d: .46 });
  }
  for (const n of [-2.35, 2.35]) parts.push({
    x: 0, y: .22, n, w: 2.05, h: .46, d: .16, iron: true,
  });
  const hull = instanceBoxes(group, 'town-c2-water/grounded-ferry-hull', parts, wood);
  const woodTones = [0x76563b, 0x896447, 0x624833, 0x9a7350, 0x554332];
  const ironTones = [0x465158, 0x5b686d, 0x3d474c];
  parts.forEach((part, index) => hull.mesh.setColorAt(index,
    new Color(part.iron ? ironTones[index % ironTones.length] : woodTones[index % woodTones.length])));
  if (hull.mesh.instanceColor) hull.mesh.instanceColor.needsUpdate = true;
  const pole = instanceBoxes(group, 'town-c2-water/grounded-ferry-pole', [
    { x: .72, y: 1.05, n: 0, w: .07, h: 2.8, d: .07 },
    { x: .72, y: .12, n: 0, w: .5, h: .12, d: .5 },
  ], iron);
  pole.mesh.setColorAt(0, new Color(0x66747a));
  pole.mesh.setColorAt(1, new Color(0x765743));
  if (pole.mesh.instanceColor) pole.mesh.instanceColor.needsUpdate = true;
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
    color: 0xffffff, transparent: true, opacity: .4, depthWrite: false,
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
  const flowTones = [0x77c5cf, 0xb5e4df, 0x4d9eaf, 0x8fd6d6];
  flowBoxes.forEach((_, index) => flow.mesh.setColorAt(index,
    new Color(flowTones[(index + Math.floor(index / 6)) % flowTones.length])));
  if (flow.mesh.instanceColor) flow.mesh.instanceColor.needsUpdate = true;

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

  const wetMaterial = new MeshLambertMaterial({
    color: 0xffffff, emissive: 0x061217, emissiveIntensity: .12, flatShading: true,
  });
  const stoneMaterial = new MeshLambertMaterial({ color: 0xffffff, flatShading: true });
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
  const wetTones = [0x27383a, 0x35494a, 0x425654, 0x2d4145, 0x4b5b56];
  wetBoxes.forEach((_, index) => wet.mesh.setColorAt(index,
    new Color(wetTones[(index * 3 + Math.floor(index / 5)) % wetTones.length])));
  if (wet.mesh.instanceColor) wet.mesh.instanceColor.needsUpdate = true;
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
  const stoneTones = [0x68736d, 0x7c8378, 0x515e5c, 0x8a8978, 0x5e6964];
  stoneBoxes.forEach((_, index) => stones.mesh.setColorAt(index,
    new Color(stoneTones[(index * 7 + Math.floor(index / 4)) % stoneTones.length])));
  if (stones.mesh.instanceColor) stones.mesh.instanceColor.needsUpdate = true;
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
      flowMaterial.opacity = night ? .56 : .4;
      flowMaterial.color.setHex(night ? 0xc6eef2 : 0xffffff);
      midMaterial.opacity = night ? .7 : .55;
      wetMaterial.emissiveIntensity = night ? .22 : .12;
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
