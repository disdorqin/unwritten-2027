import {
  BoxGeometry, DataTexture, FrontSide, Group, InstancedMesh, Matrix4, MeshLambertMaterial,
  NearestFilter, RGBAFormat, SRGBColorSpace, StaticDrawUsage, UnsignedByteType,
} from 'three';
import {
  secondMineRiver, type MineRiverState,
} from '../../../src/shared/underground-second-mine-layout.js';
import {
  c2SecondMineBoxAllowed, type C2SecondMineBox,
} from './town-c2-second-mine-contract.js';

export const c2R30WaterworksTracePrefix = 'town-c2/r30/waterworks-trace/';
export const c2R30WaterworksPalette = Object.freeze([
  0x26343b, 0x52666d, 0x8ba0a2, 0x49362d, 0x9b6244,
  0x79613c, 0xc49b58, 0x77786b, 0x315f66,
] as const);

export type C2R30WaterworksFamily = 'pipe' | 'rust' | 'valve' | 'stone' | 'cabinet' | 'wet';
export type C2R30WaterworksPart =
  | 'pump-head' | 'pipe' | 'coupling' | 'pipe-pillar' | 'valve-body' | 'valve-stem'
  | 'valve-wheel' | 'drain-spout' | 'drain-mouth' | 'drain-basin' | 'cabinet'
  | 'wet-mark' | 'wall-wet-streak' | 'pipe-wet-streak';

export type C2R30WaterworksPlacement = C2SecondMineBox & Readonly<{
  id: string;
  family: C2R30WaterworksFamily;
  part: C2R30WaterworksPart;
  /** Presentation threshold only: 0=low, 1=middle, 2=high. */
  minLevel: 0 | 1 | 2;
  visualOnly: true;
}>;

export type C2R30WaterworksCollider = Readonly<{
  id: string;
  kind: 'cabinet' | 'pipe-pillar';
  box: C2SecondMineBox;
  /** Three.js local ENY AABB: x=east, y=height, z=-north. */
  min: readonly [number, number, number];
  max: readonly [number, number, number];
}>;

export type C2R30WaterworksStats = Readonly<{
  coordinateFrame: 'local-eny';
  axisMapping: 'x=east,y=height,z=-north';
  verticalDatum: 'second-mine-floor';
  mineDepth: -140;
  registered: false;
  placementGuard: 'c2SecondMineBoxAllowed';
  guardClearance: .45;
  waterPresentationState: MineRiverState;
  paletteSize: 9;
  palette: readonly number[];
  textureSize: 16;
  filtering: 'nearest';
  shading: 'lambert';
  instanced: true;
  materialFamilies: number;
  meshCount: number;
  drawCalls: number;
  triangles: number;
  realLightCount: 0;
  pieceCount: number;
  visiblePieceCount: number;
  visibleWetPieceCount: number;
  pipeSegmentCount: number;
  valveCount: number;
  drainCount: number;
  cabinetCount: number;
  colliderCount: number;
  colliderKinds: readonly C2R30WaterworksCollider['kind'][];
  interactive: false;
  authorityChangeCount: 0;
  inventoryCount: 0;
  disposed: boolean;
  bounds: Readonly<{
    minEast: number; maxEast: number; minNorth: number; maxNorth: number;
    minHeight: number; maxHeight: number;
  }>;
}>;

export type C2R30WaterworksScene = Readonly<{
  group: Group;
  placements: readonly C2R30WaterworksPlacement[];
  colliders: readonly C2R30WaterworksCollider[];
  readonly stats: C2R30WaterworksStats;
  setWaterState(state: MineRiverState): C2R30WaterworksStats;
  dispose(): void;
}>;

/** Unrotated local ENY centre line, continuously coupled from high bank to river drain. */
export const c2R30WaterworksPipePath = Object.freeze([
  Object.freeze({ x: -42.5, n: 100, y: 1.45 }),
  Object.freeze({ x: -41, n: 100, y: 1.45 }),
  Object.freeze({ x: -41, n: 106, y: 1.45 }),
  Object.freeze({ x: -37, n: 106, y: 1.45 }),
  Object.freeze({ x: -37, n: 114, y: 1.45 }),
  Object.freeze({ x: -40, n: 114, y: 1.45 }),
  Object.freeze({ x: -40, n: 121, y: 1.45 }),
  Object.freeze({ x: -37, n: 121, y: 1.45 }),
  Object.freeze({ x: -37, n: 126.8, y: 1.45 }),
]);

const familyOrder: readonly C2R30WaterworksFamily[] = Object.freeze([
  'pipe', 'rust', 'valve', 'stone', 'cabinet', 'wet',
]);
const guardClearance = .45;
const pipeStates: readonly MineRiverState[] = Object.freeze(['low', 'middle', 'high']);

function pixelTexture(family: C2R30WaterworksFamily) {
  const pixels = new Uint8Array(16 * 16 * 4);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const grain = (Math.imul(x + 3, 15731) ^ Math.imul(y + 11, 4817)) >>> 0;
    let tone: number;
    if (family === 'pipe') {
      tone = x % 8 === 0 ? 0 : (x + y * 3) % 19 === 0 ? 2 : grain % 23 < 3 ? 4 : 1;
    } else if (family === 'rust') {
      tone = y % 6 === 5 ? 3 : grain % 17 < 4 ? 5 : grain % 13 < 3 ? 1 : 4;
    } else if (family === 'valve') {
      tone = (x + y) % 7 === 0 ? 5 : y % 8 === 0 ? 0 : grain % 17 < 3 ? 3 : grain % 5 < 2 ? 6 : 5;
    } else if (family === 'stone') {
      const joint = x % 5 === 0 || y % 4 === 0;
      tone = joint ? 1 : grain % 11 < 3 ? 2 : grain % 19 < 3 ? 3 : 7;
    } else if (family === 'cabinet') {
      tone = x % 8 === 0 || y % 8 === 0 ? 0 : grain % 29 < 4 ? 3 :
        grain % 17 < 3 ? 2 : grain % 31 < 3 ? 6 : 1;
    } else {
      tone = (x * 3 + y * 5) % 17 < 3 ? 0 : (x + y * 2) % 13 < 3 ? 7 :
        grain % 19 < 4 ? 1 : 8;
    }
    const color = c2R30WaterworksPalette[tone]!;
    pixels.set([color >>> 16, color >>> 8 & 255, color & 255, 255], (y * 16 + x) * 4);
  }
  const texture = new DataTexture(pixels, 16, 16, RGBAFormat, UnsignedByteType);
  texture.name = `${c2R30WaterworksTracePrefix}${family}-nine-colour-16px`;
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function touchesOrOverlaps(a: C2SecondMineBox, b: C2SecondMineBox) {
  const epsilon = 1e-7;
  return a.x + a.w / 2 >= b.x - b.w / 2 - epsilon &&
    b.x + b.w / 2 >= a.x - a.w / 2 - epsilon &&
    a.n + a.d / 2 >= b.n - b.d / 2 - epsilon &&
    b.n + b.d / 2 >= a.n - a.d / 2 - epsilon &&
    a.y + a.h >= b.y - epsilon && b.y + b.h >= a.y - epsilon;
}

/**
 * C2-R01/R30: detached -140 waterworks trace artwork in local ENY.
 * x=east, y=height above the second-mine floor, z=-north. The caller retains
 * the registered domain transform. This module adds no floor, water authority,
 * passage lock, inventory, interaction, light or host collider channel.
 */
export function buildTownC2R30WaterworksTrace(parent?: Group): C2R30WaterworksScene {
  const group = new Group();
  group.name = 'town-c2-r30-waterworks-trace';
  group.userData.coordinateFrame = 'local-eny';
  group.userData.axisMapping = 'x=east,y=height,z=-north';
  group.userData.verticalDatum = 'second-mine-floor';
  group.userData.mineDepth = -140;
  group.userData.registered = false;
  group.userData.visualOnly = true;
  group.userData.interactive = false;
  group.userData.walkHeightAuthority = 'underground-second-mine-layout.secondMineFloor';
  group.userData.waterPresentationState = 'low';

  const placements: C2R30WaterworksPlacement[] = [];
  const colliders: C2R30WaterworksCollider[] = [];
  let serial = 0;

  function add(part: C2R30WaterworksPart, family: C2R30WaterworksFamily,
    x: number, n: number, y: number, w: number, d: number, h: number, minLevel: 0 | 1 | 2 = 0) {
    const box: C2SecondMineBox = Object.freeze({ x, y, n, w, h, d });
    if (!c2SecondMineBoxAllowed(box, guardClearance)) {
      throw new RangeError(`C2-R30 placement rejected: ${part}/${serial} ${JSON.stringify(box)}`);
    }
    placements.push(Object.freeze({
      ...box, id: `${c2R30WaterworksTracePrefix}${part}-${serial++}`,
      family, part, minLevel, visualOnly: true as const,
    }));
  }

  function collider(id: string, kind: C2R30WaterworksCollider['kind'], box: C2SecondMineBox) {
    if (!c2SecondMineBoxAllowed(box, guardClearance)) {
      throw new RangeError(`C2-R30 collider rejected: ${id} ${JSON.stringify(box)}`);
    }
    colliders.push(Object.freeze({
      id: `${c2R30WaterworksTracePrefix}${id}`, kind, box: Object.freeze(box),
      min: Object.freeze([box.x - box.w / 2, box.y, -box.n - box.d / 2] as const),
      max: Object.freeze([box.x + box.w / 2, box.y + box.h, -box.n + box.d / 2] as const),
    }));
  }

  // Wall-mounted pump head at the high-bank end. Its underside stays above head height.
  add('pump-head', 'pipe', -42.55, 100, 1.55, 1.05, .72, .62);
  add('pump-head', 'rust', -43.05, 100, 1.53, .42, .56, .5);
  add('pump-head', 'pipe', -41.83, 100, 1.45, .5, .3, .3);
  add('pump-head', 'valve', -42.55, 99.61, 1.6, .54, .06, .32);
  for (const dx of [-.36, .36]) for (const dn of [-.22, .22]) {
    add('pump-head', 'valve', -42.55 + dx, 100 + dn, 1.9, .09, .09, .08);
  }

  // Every straight overlaps its neighbours by .05 m; corner couplings close the 3D graph.
  for (let index = 0; index < c2R30WaterworksPipePath.length - 1; index++) {
    const a = c2R30WaterworksPipePath[index]!, b = c2R30WaterworksPipePath[index + 1]!;
    const dx = b.x - a.x, dn = b.n - a.n;
    if (dx !== 0 && dn !== 0) throw new RangeError('C2-R30 pipe path must be axis aligned');
    add('pipe', 'pipe', (a.x + b.x) / 2, (a.n + b.n) / 2, a.y,
      dx === 0 ? .3 : Math.abs(dx) + .1, dn === 0 ? .3 : Math.abs(dn) + .1, .3);
  }
  c2R30WaterworksPipePath.forEach((point, index) => {
    add('coupling', index % 3 === 0 ? 'rust' : 'pipe', point.x, point.n, point.y, .43, .43, .34);
  });

  // Eight solid pipe pillars, including the final drain downpipe. Elevated pipe runs
  // and valve wheels deliberately have no collider.
  for (let index = 1; index < c2R30WaterworksPipePath.length; index++) {
    const point = c2R30WaterworksPipePath[index]!;
    const id = `pipe-pillar-${index}`;
    add('pipe-pillar', 'stone', point.x, point.n, .07, .56, .56, .14);
    add('pipe-pillar', 'pipe', point.x, point.n, .79, .18, .18, 1.38);
    add('pipe-pillar', 'rust', point.x, point.n, 1.25, .3, .3, .12);
    collider(id, 'pipe-pillar', Object.freeze({
      x: point.x, y: 0, n: point.n, w: .56, h: 1.52, d: .56,
    }));
  }

  function valve(x: number, n: number) {
    add('valve-body', 'pipe', x, n, 1.45, .44, .44, .38);
    add('valve-stem', 'valve', x, n, 1.72, .1, .1, .48);
    add('valve-wheel', 'valve', x, n, 1.98, .18, .18, .12);
    for (let index = 0; index < 12; index++) {
      const angle = index * Math.PI / 6;
      add('valve-wheel', index % 4 === 0 ? 'rust' : 'valve',
        x + Math.cos(angle) * .31, n + Math.sin(angle) * .31,
        1.98, .14, .14, .1);
    }
    add('valve-wheel', 'valve', x, n, 1.98, .57, .07, .07);
    add('valve-wheel', 'valve', x, n, 1.98, .07, .57, .07);
  }
  valve(-41, 103);
  valve(-37, 110);
  valve(-40, 118);

  // Flush drain apron and spout stop on the guarded bank, before the authoritative river.
  add('drain-basin', 'stone', -37, 127.08, .055, 1, .6, .11);
  add('drain-basin', 'stone', -37.46, 127.08, .075, .1, .62, .15);
  add('drain-basin', 'stone', -36.54, 127.08, .075, .1, .62, .15);
  add('drain-spout', 'pipe', -37, 127.08, .55, .32, .72, .28);
  add('drain-mouth', 'pipe', -37, 127.4, .53, .24, .1, .16);
  add('wet-mark', 'wet', -37, 127.4, .31, .12, .1, .4, 1);
  add('wet-mark', 'wet', -37, 127.15, .035, .7, .55, .07, 2);

  // Three physically solid maintenance cabinets; doors, hinges and vents are artwork.
  const cabinetCentres = [-35.1, -33.75, -32.4] as const;
  cabinetCentres.forEach((x, cabinetIndex) => {
    const n = 113;
    add('cabinet', 'cabinet', x, n + .34, 1.08, 1.06, .08, 1.72);
    for (const side of [-1, 1]) {
      add('cabinet', 'cabinet', x + side * .53, n, 1.08, .08, .82, 1.72);
      add('cabinet', 'pipe', x + side * .43, n - .36, .05, .12, .14, .1);
    }
    add('cabinet', 'cabinet', x, n, .12, 1.14, .84, .14);
    add('cabinet', 'cabinet', x, n, 2, 1.14, .84, .1);
    for (const side of [-1, 1]) {
      add('cabinet', 'pipe', x + side * .27, n - .4, 1.12, .5, .06, 1.58);
      add('cabinet', 'valve', x + side * .39, n - .45, 1.15, .06, .07, .3);
      for (const slot of [0, 1, 2]) {
        add('cabinet', 'rust', x + side * .27, n - .436, 1.58 + slot * .09, .28, .025, .035);
      }
    }
    add('cabinet', 'valve', x, n - .441, 1.28, .24, .025, .12);
    collider(`cabinet-${cabinetIndex}`, 'cabinet', Object.freeze({
      x, y: 0, n, w: 1.24, h: 2.08, d: .94,
    }));
    add('wet-mark', 'wet', x, n - .68, .03, 1.15, .55, .06);
  });

  // Low-state stains remain legible; middle/high add drips and spread along the same
  // pre-guarded footprints. State changes only instance counts, never collider boxes.
  const wetStripe = (x: number, n: number, alongX: boolean, minLevel: 0 | 1 | 2, size = 1) => {
    add('wet-mark', 'wet', x, n, .035,
      alongX ? .72 * size : .24 + size * .08, alongX ? .24 + size * .08 : .72 * size,
      .07, minLevel);
  };
  for (let index = 0; index < c2R30WaterworksPipePath.length - 1; index++) {
    const a = c2R30WaterworksPipePath[index]!, b = c2R30WaterworksPipePath[index + 1]!;
    const alongX = a.n === b.n;
    for (const t of [.3, .75]) {
      wetStripe(a.x + (b.x - a.x) * t + (alongX ? 0 : .23),
        a.n + (b.n - a.n) * t + (alongX ? .23 : 0), alongX, 0, t + .55);
    }
    wetStripe((a.x + b.x) / 2 - (alongX ? 0 : .2),
      (a.n + b.n) / 2 - (alongX ? .2 : 0), alongX, 1, .85);
    wetStripe((a.x + b.x) / 2 + (alongX ? .08 : .34),
      (a.n + b.n) / 2 + (alongX ? .34 : .08), alongX, 2, 1.15);
  }
  for (const [index, point] of c2R30WaterworksPipePath.entries()) {
    if (index === 0) continue;
    add('pipe-wet-streak', 'wet', point.x + .2, point.n, .82, .055, .12, .76, 1);
    if (index % 2 === 0) add('wet-mark', 'wet', point.x + .38, point.n + .18,
      .035, .42, .58, .07, 2);
  }
  for (const n of [99.55, 100.15, 100.65]) {
    add('wall-wet-streak', 'wet', -43.16, n, .68, .07, .15 + (n % 1) * .12, 1.18, 1);
    add('wall-wet-streak', 'wet', -43.13, n + .09, .16, .06, .28, .24, 2);
  }

  const geometry = new BoxGeometry(1, 1, 1);
  geometry.name = `${c2R30WaterworksTracePrefix}unit-cube`;
  const materials: MeshLambertMaterial[] = [];
  const textures: DataTexture[] = [];
  const meshes: InstancedMesh[] = [];
  const batches = new Map<C2R30WaterworksFamily, C2R30WaterworksPlacement[]>();
  const matrix = new Matrix4();

  for (const family of familyOrder) {
    const items = placements.filter(placement => placement.family === family);
    if (family === 'wet') items.sort((a, b) => a.minLevel - b.minLevel);
    batches.set(family, items);
    const texture = pixelTexture(family);
    const material = new MeshLambertMaterial({
      name: `${c2R30WaterworksTracePrefix}${family}`,
      map: texture,
      color: 0xffffff,
      side: FrontSide,
      flatShading: true,
    });
    const mesh = new InstancedMesh(geometry, material, items.length);
    mesh.name = `${c2R30WaterworksTracePrefix}${family}`;
    mesh.userData.coordinateFrame = 'local-eny';
    mesh.userData.visualOnly = true;
    mesh.instanceMatrix.setUsage(StaticDrawUsage);
    items.forEach((placement, index) => {
      matrix.makeScale(placement.w, placement.h, placement.d);
      matrix.setPosition(placement.x, placement.y, -placement.n);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    materials.push(material);
    textures.push(texture);
    meshes.push(mesh);
  }

  const allBounds = placements.reduce((bounds, placement) => ({
    minEast: Math.min(bounds.minEast, placement.x - placement.w / 2),
    maxEast: Math.max(bounds.maxEast, placement.x + placement.w / 2),
    minNorth: Math.min(bounds.minNorth, placement.n - placement.d / 2),
    maxNorth: Math.max(bounds.maxNorth, placement.n + placement.d / 2),
    minHeight: Math.min(bounds.minHeight, placement.y),
    maxHeight: Math.max(bounds.maxHeight, placement.y + placement.h),
  }), {
    minEast: Infinity, maxEast: -Infinity, minNorth: Infinity,
    maxNorth: -Infinity, minHeight: Infinity, maxHeight: -Infinity,
  });
  const bounds = Object.freeze(allBounds);
  const frozenPlacements = Object.freeze([...placements]);
  const frozenColliders = Object.freeze([...colliders]);
  let disposed = false;
  let waterState: MineRiverState = 'low';

  function currentStats(): C2R30WaterworksStats {
    const visiblePieceCount = meshes.reduce((sum, mesh) => sum + mesh.count, 0);
    const wetCount = batches.get('wet')!.filter(item => item.minLevel <= pipeStates.indexOf(waterState)).length;
    return Object.freeze({
      coordinateFrame: 'local-eny',
      axisMapping: 'x=east,y=height,z=-north',
      verticalDatum: 'second-mine-floor',
      mineDepth: -140,
      registered: false,
      placementGuard: 'c2SecondMineBoxAllowed',
      guardClearance,
      waterPresentationState: waterState,
      paletteSize: c2R30WaterworksPalette.length,
      palette: c2R30WaterworksPalette,
      textureSize: 16,
      filtering: 'nearest',
      shading: 'lambert',
      instanced: true,
      materialFamilies: familyOrder.length,
      meshCount: meshes.length,
      drawCalls: disposed ? 0 : meshes.length,
      triangles: visiblePieceCount * 12,
      realLightCount: 0,
      pieceCount: frozenPlacements.length,
      visiblePieceCount,
      visibleWetPieceCount: wetCount,
      pipeSegmentCount: c2R30WaterworksPipePath.length - 1,
      valveCount: 3,
      drainCount: 1,
      cabinetCount: cabinetCentres.length,
      colliderCount: frozenColliders.length,
      colliderKinds: Object.freeze(['cabinet', 'pipe-pillar'] as const),
      interactive: false,
      authorityChangeCount: 0,
      inventoryCount: 0,
      disposed,
      bounds,
    });
  }

  function setWaterState(state: MineRiverState): C2R30WaterworksStats {
    if (!pipeStates.includes(state)) throw new RangeError(`C2-R30 unknown water presentation state: ${state}`);
    if (disposed) return currentStats();
    waterState = state;
    const rank = pipeStates.indexOf(state);
    const wet = batches.get('wet')!;
    meshes[familyOrder.indexOf('wet')]!.count = wet.filter(item => item.minLevel <= rank).length;
    group.userData.waterPresentationState = state;
    group.userData.stats = currentStats();
    return group.userData.stats as C2R30WaterworksStats;
  }

  parent?.add(group);
  setWaterState('low');
  return Object.freeze({
    group,
    placements: frozenPlacements,
    colliders: frozenColliders,
    get stats() { return currentStats(); },
    setWaterState,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      for (const mesh of meshes) mesh.dispose();
      for (const material of materials) material.dispose();
      for (const texture of textures) texture.dispose();
      geometry.dispose();
      group.clear();
      group.userData.disposed = true;
      group.userData.stats = currentStats();
    },
  });
}

/** Local convenience alias; no registration or interactive mount is implied. */
export { buildTownC2R30WaterworksTrace as build };

/** Compile-time and runtime assertion that the drain remains outside river authority. */
export function c2R30WaterworksDrainBankGap(placements: readonly C2R30WaterworksPlacement[]) {
  const northEdge = Math.max(...placements.map(placement => placement.n + placement.d / 2));
  return secondMineRiver.n0 - northEdge;
}
