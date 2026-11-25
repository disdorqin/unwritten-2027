import {
  BoxGeometry, Color, DataTexture, Group, InstancedMesh, Matrix4,
  MeshLambertMaterial, NearestFilter, RGBAFormat, SRGBColorSpace, StaticDrawUsage, UnsignedByteType,
} from 'three';
import {
  c2SecondMineBoxAllowed, type C2SecondMineBox,
} from './town-c2-second-mine-contract.js';

export type C2SecondMineBypassWallSide = 'west' | 'east';
export type C2SecondMineBypassWallFamily =
  | 'rock' | 'basalt' | 'rust' | 'wood' | 'iron' | 'gravel';
export type C2SecondMineBypassWallFeature =
  | 'layer-slab' | 'rust-seep' | 'wood-remnant' | 'iron-nail'
  | 'tool-outline' | 'wall-foot-fragment';

export type C2SecondMineBypassWallPart = C2SecondMineBox & Readonly<{
  family: C2SecondMineBypassWallFamily;
  side: C2SecondMineBypassWallSide;
  feature: C2SecondMineBypassWallFeature;
}>;

export type C2SecondMineBypassWallStats = Readonly<{
  pieces: number;
  visiblePieces: number;
  materialFamilies: number;
  materialPieceCounts: Readonly<Record<C2SecondMineBypassWallFamily, number>>;
  textureSize: 16;
  textureFilter: 'nearest';
  colliders: 0;
  railings: 0;
  wingDoors: 0;
  routeCenterClearanceM: number;
  bounds: Readonly<{
    minEast: number; maxEast: number; minNorth: number; maxNorth: number;
    minHeight: number; maxHeight: number;
  }>;
  disposed: boolean;
}>;

export type C2SecondMineBypassWallScene = Readonly<{
  group: Group;
  boxes: readonly C2SecondMineBypassWallPart[];
  stats(): C2SecondMineBypassWallStats;
  dispose(): void;
}>;

const familyOrder: readonly C2SecondMineBypassWallFamily[] = [
  'rock', 'basalt', 'rust', 'wood', 'iron', 'gravel',
];
const wallEast = Object.freeze({ west: 48.08, east: 54.92 });
const palette = Object.freeze({
  rock: Object.freeze([0x5a6065, 0x343c43, 0x93958b, 0x737974]),
  basalt: Object.freeze([0x3c454e, 0x202832, 0x78848d, 0x505d68]),
  rust: Object.freeze([0x744832, 0x332521, 0xc08450, 0x9b6240]),
  wood: Object.freeze([0x66492f, 0x30251e, 0xa88056, 0x846044]),
  iron: Object.freeze([0x65727b, 0x29343c, 0xb4bfc0, 0x849198]),
  gravel: Object.freeze([0x57574f, 0x2d322e, 0x999581, 0x747568]),
} as const);

function pixelTexture(family: C2SecondMineBypassWallFamily) {
  const [base, dark, light, mid] = palette[family];
  const size = 16, pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const shiftedX = x + (Math.floor(y / 4) % 2) * 2;
    const chip = (shiftedX * 17 + y * 23) % 43 < 3;
    let color = base;
    if (family === 'rock' || family === 'basalt') {
      const seam = family === 'rock'
        ? y % 5 === 0 || shiftedX % 12 === 0
        : (shiftedX + y * 2) % 13 === 0 || y % 7 === 0;
      const facet = (Math.floor(x / 3) * 3 + Math.floor(y / 2)) % 8 < 3;
      color = seam ? dark : chip ? light : facet ? mid : base;
    } else if (family === 'rust') {
      const seam = y % 6 === 5 || (shiftedX + Math.floor(y / 2)) % 11 === 0;
      const pocket = (x * 5 + y * 7) % 13 < 3;
      const ore = (x * 11 + y * 3) % 29 < 4;
      color = seam ? dark : pocket ? mid : ore ? light : base;
    } else if (family === 'wood') {
      const split = x % 5 === 0 || (x + Math.floor(y / 3)) % 13 === 0;
      const grain = (x * 3 + y * 11) % 23 < 4;
      color = split ? dark : chip ? light : grain ? mid : base;
    } else if (family === 'iron') {
      const plateJoint = y % 7 === 0 || shiftedX % 12 === 0;
      const scratch = (x + y * 5) % 17 < 3;
      color = plateJoint ? dark : scratch ? light : (x * 7 + y * 3) % 19 < 3 ? mid : base;
    } else {
      const joint = x % 3 === 0 || y % 3 === 0;
      const pebble = (Math.floor(x / 3) * 5 + Math.floor(y / 3) * 3) % 7 < 3;
      color = joint ? dark : chip ? light : pebble ? mid : base;
    }
    pixels.set([color >> 16, color >> 8 & 255, color & 255, 255], (y * size + x) * 4);
  }
  const texture = new DataTexture(pixels, size, size, RGBAFormat, UnsignedByteType);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function inwardX(side: C2SecondMineBypassWallSide, offset: number) {
  return side === 'west' ? wallEast.west + offset : wallEast.east - offset;
}

/**
 * Standalone -140 dry-bypass wall dressing in local ENY coordinates
 * (Three.js x=east, y=height, z=-north). It owns no water, floor,
 * collision, passage, railing or wing-door authority.
 */
export function buildTownC2SecondMineBypassWall(): C2SecondMineBypassWallScene {
  const group = new Group();
  group.name = 'town-c2-second-mine-bypass-wall';
  group.userData.visualOnly = true;
  group.userData.localFrame = 'second-mine ENY: x=east, y=height, z=-north';
  group.userData.waterIndependent = true;
  const parts: C2SecondMineBypassWallPart[] = [];

  function add(family: C2SecondMineBypassWallFamily,
    side: C2SecondMineBypassWallSide, feature: C2SecondMineBypassWallFeature,
    x: number, n: number, y: number, w: number, d: number, h: number) {
    // The shared river guard extends to E48.45. Only the west-wall pieces
    // overlapping that buffer tuck farther into the bypass; the route stays clear.
    if (side === 'west' && n + d / 2 > 127.55 && n - d / 2 < 146.45 &&
      x - w / 2 < 48.45) x = 48.46 + w / 2;
    const part: C2SecondMineBypassWallPart = Object.freeze({
      family, side, feature, x, n, y, w, d, h,
    });
    if (!c2SecondMineBoxAllowed(part)) {
      throw new Error(`C2 bypass wall part rejected by placement guard: ${side}/${feature} ${x}/${n}`);
    }
    parts.push(part);
  }

  for (const side of ['west', 'east'] as const) {
    // Offset, coursed slabs break up the full 43 m wall without becoming new supports.
    for (let row = 0; row < 13; row++) for (let column = 0; column < 32; column++) {
      const n = 114.62 + column * 1.34 + (row % 2) * .22;
      const offset = .018 + ((row * 7 + column * 5) % 4) * .018;
      add(row % 3 === 0 ? 'basalt' : 'rock', side, 'layer-slab',
        inwardX(side, offset), n, .32 + row * .48,
        .13 + (column % 3) * .018, 1.18 + (row % 2) * .06, .44);
    }

    // Three short rust runs per wall: dark caps, bright edges and tapering drips.
    for (const [patch, centreN] of [119.4, 134.2, 150.8].entries()) {
      add('rust', side, 'rust-seep', inwardX(side, .19), centreN, 5.82,
        .065, .54 + patch * .08, .32);
      for (let step = 0; step < 8; step++) {
        const length = .74 - step * .065;
        add(step % 3 === 0 ? 'basalt' : 'rust', side, 'rust-seep',
          inwardX(side, .20 + (step % 2) * .012),
          centreN + Math.sin(step * 1.7 + patch) * .14,
          5.43 - step * .39, .06, Math.max(.12, length), .34);
      }
    }

    // Short weathered mounting boards and their remaining iron nails; no rail geometry.
    for (const [index, centreN] of [118.2, 141.1, 154.4].entries()) {
      const boardY = index === 1 ? 3.92 : 1.72;
      add('wood', side, 'wood-remnant', inwardX(side, .20), centreN,
        boardY, .12, 1.72 + index * .18, .22);
      for (const dn of [-.62, 0, .62]) {
        add('iron', side, 'iron-nail', inwardX(side, .285), centreN + dn,
          boardY + .025, .075, .07, .07);
        add('rust', side, 'iron-nail', inwardX(side, .273), centreN + dn + .07,
          boardY - .055, .06, .045, .045);
      }
    }

    // Raised pick silhouettes are wall-plane iron outlines, not placeable tools or props.
    for (const centreN of [122.1, 137.5, 152.5]) {
      const x = inwardX(side, .285);
      add('iron', side, 'tool-outline', x, centreN, 3.12, .075, .105, 1.72);
      add('iron', side, 'tool-outline', x, centreN, 4.02, .075, 1.06, .12);
      for (const direction of [-1, 1]) {
        add('iron', side, 'tool-outline', x, centreN + direction * .47,
          3.94, .075, .17, .24);
        add('rust', side, 'tool-outline', x, centreN + direction * .57,
          3.86, .068, .10, .12);
      }
      add('iron', side, 'iron-nail', x, centreN, 4.20, .08, .07, .17);
    }

    // Flush wall-foot chips are visual ground fragments, never raised obstacles.
    for (let index = 0; index < 18; index++) {
      const n = 115.1 + index * 2.35 + ((index * 7) % 3) * .09;
      const x = side === 'west'
        ? 48.43 + ((index * 5) % 4) * .075
        : 54.57 - ((index * 5) % 4) * .075;
      add(index % 4 === 0 ? 'rust' : 'gravel', side, 'wall-foot-fragment',
        x, n, .016, .42 + (index % 3) * .11, .24 + (index % 4) * .07, .022);
    }
  }

  const geometry = new BoxGeometry();
  const materials = new Map<C2SecondMineBypassWallFamily, MeshLambertMaterial>();
  const textures: DataTexture[] = [];
  const meshes: InstancedMesh[] = [];
  const counts = Object.fromEntries(familyOrder.map(family => [family, 0])) as
    Record<C2SecondMineBypassWallFamily, number>;
  const matrix = new Matrix4(), tint = new Color();
  for (const [familyIndex, family] of familyOrder.entries()) {
    const items = parts.filter(part => part.family === family);
    counts[family] = items.length;
    const texture = pixelTexture(family);
    const material = new MeshLambertMaterial({
      map: texture,
      color: 0xffffff,
      flatShading: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const mesh = new InstancedMesh(geometry, material, items.length);
    mesh.name = `town-c2-second-mine-bypass-wall/${family}`;
    mesh.userData.visualOnly = true;
    items.forEach((part, index) => {
      matrix.makeScale(part.w, part.h, part.d);
      matrix.setPosition(part.x, part.y, -part.n);
      mesh.setMatrixAt(index, matrix);
      const seed = familyIndex * 31 + part.n * 12.9898 + part.x * 78.233 + part.y * 37.719;
      const random = Math.sin(seed) * 43758.5453;
      const variation = random - Math.floor(random);
      const courseTone = part.feature === 'layer-slab'
        ? .94 + (Math.round(part.y / .48) % 3) * .035 : 1;
      const featureTone = part.feature === 'wall-foot-fragment' ? .84 :
        part.feature === 'iron-nail' ? 1.05 : part.feature === 'rust-seep' ? 1.02 : 1;
      const warmth = family === 'rust' ? .045 : family === 'wood' ? .035 :
        family === 'iron' || family === 'basalt' ? -.025 : 0;
      const shade = (.82 + variation * .25) * courseTone * featureTone;
      mesh.setColorAt(index, tint.setRGB(
        Math.min(1.16, shade + warmth), shade, Math.min(1.16, shade - warmth)));
    });
    mesh.instanceMatrix.setUsage(StaticDrawUsage);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    materials.set(family, material);
    textures.push(texture);
    meshes.push(mesh);
  }

  const boxes = Object.freeze([...parts]);
  const routeCenterClearanceM = Math.min(...parts.map(part => part.x < 51.5
    ? 51.5 - part.x - part.w / 2
    : part.x - part.w / 2 - 51.5));
  const bounds = Object.freeze({
    minEast: Math.min(...parts.map(part => part.x - part.w / 2)),
    maxEast: Math.max(...parts.map(part => part.x + part.w / 2)),
    minNorth: Math.min(...parts.map(part => part.n - part.d / 2)),
    maxNorth: Math.max(...parts.map(part => part.n + part.d / 2)),
    minHeight: Math.min(...parts.map(part => part.y - part.h / 2)),
    maxHeight: Math.max(...parts.map(part => part.y + part.h / 2)),
  });
  let disposed = false;
  function stats(): C2SecondMineBypassWallStats {
    return Object.freeze({
      pieces: parts.length,
      visiblePieces: disposed ? 0 : parts.length,
      materialFamilies: materials.size,
      materialPieceCounts: Object.freeze({ ...counts }),
      textureSize: 16,
      textureFilter: 'nearest',
      colliders: 0,
      railings: 0,
      wingDoors: 0,
      routeCenterClearanceM,
      bounds,
      disposed,
    });
  }
  group.userData.stats = stats();
  return {
    group, boxes, stats,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      for (const mesh of meshes) mesh.dispose();
      geometry.dispose();
      for (const material of materials.values()) material.dispose();
      for (const texture of textures) texture.dispose();
      group.clear();
    },
  };
}
