import {
  BoxGeometry, DataTexture, Group, InstancedMesh, Matrix4, MeshLambertMaterial,
  NearestFilter, Quaternion, SRGBColorSpace, StaticDrawUsage, Vector3,
} from 'three';
import {
  c2SecondMineBoxAllowed, type C2SecondMineBox,
} from './town-c2-second-mine-contract.js';

export type C2SecondMineNearBankBandId = 'west' | 'east';
export type C2SecondMineNearBankMaterial = 'basalt' | 'gravel' | 'iron' | 'rust';
export type C2SecondMineNearBankFeature =
  | 'scarp' | 'rock-tooth' | 'stalagmite' | 'stalactite'
  | 'collapse-rubble' | 'rust-vein' | 'industrial-brace';

export type C2SecondMineNearBankPlacement = C2SecondMineBox & Readonly<{
  id: string;
  band: C2SecondMineNearBankBandId;
  kind: C2SecondMineNearBankFeature;
  family: C2SecondMineNearBankMaterial;
  visualOnly: true;
}>;

export type C2SecondMineNearBankStats = Readonly<{
  coordinateFrame: 'second-mine-local-east-north-up';
  visualOnly: true;
  instanced: true;
  textureSize: 16;
  filtering: 'nearest';
  pieceCount: number;
  meshCount: number;
  materialFamilies: number;
  materialCounts: Readonly<Record<C2SecondMineNearBankMaterial, number>>;
  featureCounts: Readonly<Record<C2SecondMineNearBankFeature, number>>;
  bandCounts: Readonly<Record<C2SecondMineNearBankBandId, number>>;
  scarpCourses: number;
  colliderCount: 0;
  orePointCount: 0;
  bounds: Readonly<{
    minX: number; maxX: number; minY: number; maxY: number; minN: number; maxN: number;
  }>;
}>;

/** Reviewed wall bands only. The river, ferry line, bypass and wing doors stay outside this module. */
export const c2SecondMineNearBankTeethBands = Object.freeze([
  Object.freeze({ id: 'west' as const, side: -1, x0: -46, x1: -42, n0: 100, n1: 123 }),
  Object.freeze({ id: 'east' as const, side: 1, x0: 42, x1: 46, n0: 100, n1: 123 }),
]);

const featureOrder: readonly C2SecondMineNearBankFeature[] = Object.freeze([
  'scarp', 'rock-tooth', 'stalagmite', 'stalactite',
  'collapse-rubble', 'rust-vein', 'industrial-brace',
]);
const materialOrder: readonly C2SecondMineNearBankMaterial[] = Object.freeze([
  'basalt', 'gravel', 'iron', 'rust',
]);
const palette = Object.freeze({
  basalt: Object.freeze({ base: 0x505b65, dark: 0x303943, fleck: 0x74818c }),
  gravel: Object.freeze({ base: 0x626a70, dark: 0x3b444b, fleck: 0x899198 }),
  iron: Object.freeze({ base: 0x66737d, dark: 0x35414b, fleck: 0x9aa7af }),
  rust: Object.freeze({ base: 0x80533f, dark: 0x4b3028, fleck: 0xb87950 }),
});

function hash(...values: readonly number[]) {
  let value = 2166136261;
  for (const item of values) value = Math.imul(value ^ item, 16777619);
  return value >>> 0;
}
const noise = (...values: readonly number[]) => hash(...values) / 0x1_0000_0000;

function pixelTexture(family: C2SecondMineNearBankMaterial) {
  const size = 16, pixels = new Uint8Array(size * size * 4);
  const { base, dark, fleck } = palette[family];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const course = Math.floor(y / 4), offset = course % 2 ? 2 : 0;
    const joint = y % 4 === 0 || (x + offset) % 8 === 0;
    const grain = (x * 7 + y * 11 + course * 13) % 19;
    const scratch = family === 'iron' && (x * 3 + y * 5) % 17 < 2;
    const pit = family === 'rust' && (x * 5 + y * 7) % 23 < 3;
    const color = joint || pit ? dark : scratch || grain < 3 ? fleck : base;
    pixels.set([color >>> 16, color >>> 8 & 255, color & 255, 255], (y * size + x) * 4);
  }
  const texture = new DataTexture(pixels, size, size);
  texture.name = `c2-second-mine-near-bank-${family}-16px`;
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Builds a deterministic visual-only wall dressing in the existing second-mine
 * local ENY frame. Every cube, including rubble chips and mineral flecks, is
 * checked against the shared C2 placement contract. No floor, collider, water,
 * route, mine-site or reward authority is created.
 */
export function buildTownC2SecondMineNearBankTeeth() {
  const group = new Group();
  group.name = 'town-c2-second-mine-near-bank-teeth';
  group.userData.coordinateFrame = 'second-mine-local-east-north-up';
  group.userData.visualOnly = true;
  group.userData.walkHeightAuthority = 'underground-second-mine-layout.secondMineFloor';
  const placements: C2SecondMineNearBankPlacement[] = [];
  const colliders = Object.freeze([]) as readonly [];
  const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minN: Infinity, maxN: -Infinity };

  function add(band: (typeof c2SecondMineNearBankTeethBands)[number],
    kind: C2SecondMineNearBankFeature, family: C2SecondMineNearBankMaterial,
    x: number, n: number, y: number, w: number, d: number, h: number) {
    const box: C2SecondMineBox = { x, y, n, w, h, d };
    const epsilon = 1e-9;
    const inBand = x - w / 2 >= band.x0 - epsilon && x + w / 2 <= band.x1 + epsilon &&
      n - d / 2 >= band.n0 - epsilon && n + d / 2 <= band.n1 + epsilon;
    if (!inBand) {
      throw new RangeError(`Near-bank tooth ${kind}/${band.id}/${placements.length} leaves its reviewed band: ${JSON.stringify(box)}.`);
    }
    // Reject route-near candidates rather than thinning their boxes or moving
    // them into the ferry/bypass. A 1 m pre-guard is stricter than the shared
    // default and leaves the horizontal bypass crossing visibly open.
    if (!c2SecondMineBoxAllowed(box, 1)) return false;
    placements.push(Object.freeze({
      ...box, id: `${band.id}-${kind}-${placements.length}`,
      band: band.id, kind, family, visualOnly: true as const,
    }));
    bounds.minX = Math.min(bounds.minX, x - w / 2); bounds.maxX = Math.max(bounds.maxX, x + w / 2);
    bounds.minY = Math.min(bounds.minY, y - h / 2); bounds.maxY = Math.max(bounds.maxY, y + h / 2);
    bounds.minN = Math.min(bounds.minN, n - d / 2); bounds.maxN = Math.max(bounds.maxN, n + d / 2);
  }

  for (const band of c2SecondMineNearBankTeethBands) {
    const side = band.side, bandIndex = band.id === 'west' ? 0 : 1;

    // Eighteen broken courses replace the long planar shore wall. Alternating
    // ledges and inset blocks keep the silhouette visibly tooth-like.
    for (let column = 0; column < 34; column++) {
      const n = 100.55 + column * .66;
      for (let row = 0; row < 18; row++) {
        const seed = hash(bandIndex, column, row);
        const x = side * (45.55 - ((column * 7 + row * 11) % 3) * .055);
        const w = .58 + (seed % 4) * .055;
        const d = .59 + ((seed >>> 3) % 4) * .04;
        const h = .56 + ((seed >>> 6) % 4) * .035;
        const family = (column * 5 + row * 3) % 17 === 0 ? 'gravel' : 'basalt';
        add(band, 'scarp', family, x, n, .32 + row * .625, w, d, h);
      }
    }
    for (let column = 0; column < 17; column++) for (let row = 1; row < 17; row += 4) {
      const seed = hash(91, bandIndex, column, row);
      add(band, 'scarp', seed % 5 === 0 ? 'gravel' : 'basalt',
        side * (44.83 + (seed % 3) * .06), 100.88 + column * 1.32,
        .40 + row * .625, .66 + (seed % 3) * .07, .72 + (seed % 4) * .05, .42 + (seed % 3) * .06);
    }

    // Seven tapered rock teeth per bank, with uneven widths and crowns.
    for (let tooth = 0; tooth < 7; tooth++) {
      const n = 101.45 + tooth * 3.28 + noise(17, bandIndex, tooth) * .34;
      const x = side * (43.45 + noise(23, bandIndex, tooth) * .55);
      const levels = 6 + Math.floor(noise(29, bandIndex, tooth) * 5);
      for (let level = 0; level < levels; level++) {
        const taper = 1 - level / (levels + 1);
        add(band, 'rock-tooth', level % 4 === 3 ? 'gravel' : 'basalt',
          x + side * level * .018, n + Math.sin(level * 1.7 + tooth) * .045,
          .27 + level * .50, .30 + 1.02 * taper, .28 + .88 * taper, .48);
      }
    }

    // Floor stalagmites and short ceiling stalactites use stepped voxel cones,
    // never smooth primitives that would break the mine's block language.
    for (let cone = 0; cone < 7; cone++) {
      const n = 101.7 + cone * 3.15;
      const x = side * (43.30 + noise(37, bandIndex, cone) * .72);
      const levels = 6 + Math.floor(noise(41, bandIndex, cone) * 6);
      for (let level = 0; level < levels; level++) {
        const width = .20 + .62 * (1 - level / (levels + 1));
        add(band, 'stalagmite', 'basalt', x + side * Math.sin(level) * .025,
          n, .22 + level * .36, width, width * .88, .34);
      }
    }
    for (let cone = 0; cone < 6; cone++) {
      const n = 102.1 + cone * 3.75;
      const x = side * (43.65 + noise(47, bandIndex, cone) * .55);
      const levels = 5 + Math.floor(noise(53, bandIndex, cone) * 4);
      for (let level = 0; level < levels; level++) {
        const width = .22 + .64 * (1 - level / (levels + 1));
        add(band, 'stalactite', level % 3 === 2 ? 'gravel' : 'basalt', x,
          n, 11.18 - level * .43, width, width * .92, .46);
      }
    }

    // Collapse fans shed small, low chips inward. Their entire AABB remains in
    // the wall band and the shared route guard, so they cannot become barriers.
    for (let fan = 0; fan < 5; fan++) for (let chip = 0; chip < 28; chip++) {
      const fanN = 101.9 + fan * 4.55;
      const seed = hash(61, bandIndex, fan, chip);
      const distance = .20 + noise(67, bandIndex, fan, chip) * 2.18;
      const n = fanN + (noise(71, bandIndex, fan, chip) - .5) * 3.15;
      const h = .18 + noise(73, bandIndex, fan, chip) * .42;
      const family = seed % 9 === 0 ? 'rust' : seed % 3 === 0 ? 'basalt' : 'gravel';
      add(band, 'collapse-rubble', family, side * (45.22 - distance), n,
        h / 2 + .015, .28 + noise(79, bandIndex, fan, chip) * .58,
        .28 + noise(83, bandIndex, fan, chip) * .52, h);
      if (seed % 5 === 0) add(band, 'collapse-rubble', family,
        side * (45.05 - distance), n + .16, h + .10, .20, .22, .17);
    }

    // Rust veins are stepped wall inclusions, explicitly not collectible ore
    // anchors. Dark iron flecks keep the cold industrial/mineral contrast.
    for (let vein = 0; vein < 7; vein++) for (let part = 0; part < 16; part++) {
      const row = Math.floor(part / 2), seed = hash(89, bandIndex, vein, part);
      const n = 101.35 + vein * 3.02 + (part % 2) * .23 + Math.sin(row * .84 + vein) * .27;
      const y = 1.25 + (vein % 3) * 1.14 + row * .34;
      add(band, 'rust-vein', part % 7 === 0 ? 'iron' : 'rust',
        side * (44.91 - (row % 3) * .035), n, y,
        .25 + (seed % 3) * .06, .29 + ((seed >>> 3) % 4) * .05, .18 + ((seed >>> 6) % 3) * .055);
    }

    // Five iron support ribs per bank: plate feet, riveted posts, crown beams
    // and stepped rust braces read as abandoned mine industry, not fantasy props.
    for (let rib = 0; rib < 5; rib++) {
      const n = 103 + rib * 4.35, x = side * 43.55;
      add(band, 'industrial-brace', 'rust', x, n, .11, .66, .72, .22);
      add(band, 'industrial-brace', 'iron', x, n, 2.05, .22, .28, 3.90);
      add(band, 'industrial-brace', 'rust', x, n, 4.08, .50, .46, .24);
      add(band, 'industrial-brace', 'iron', x, n, 4.29, .28, 2.70, .22);
      for (let rivet = 0; rivet < 5; rivet++) add(band, 'industrial-brace', 'iron',
        side * 43.37, n, .65 + rivet * .72, .13, .15, .13);
      for (let step = 0; step < 7; step++) add(band, 'industrial-brace', 'rust',
        side * 43.47, n - 1.16 + step * .36, 1.02 + step * .40, .17, .35, .39);
    }
  }

  const featureCounts = Object.fromEntries(featureOrder.map(kind => [kind, 0])) as Record<C2SecondMineNearBankFeature, number>;
  const materialCounts = Object.fromEntries(materialOrder.map(family => [family, 0])) as Record<C2SecondMineNearBankMaterial, number>;
  const bandCounts = { west: 0, east: 0 };
  for (const placement of placements) {
    featureCounts[placement.kind]++;
    materialCounts[placement.family]++;
    bandCounts[placement.band]++;
  }
  const stats: C2SecondMineNearBankStats = Object.freeze({
    coordinateFrame: 'second-mine-local-east-north-up', visualOnly: true, instanced: true,
    textureSize: 16, filtering: 'nearest', pieceCount: placements.length,
    meshCount: materialOrder.length, materialFamilies: materialOrder.length,
    materialCounts: Object.freeze(materialCounts), featureCounts: Object.freeze(featureCounts),
    bandCounts: Object.freeze(bandCounts), scarpCourses: 18, colliderCount: 0, orePointCount: 0,
    bounds: Object.freeze({ ...bounds }),
  });
  group.userData.stats = stats;
  Object.freeze(placements);

  const geometry = new BoxGeometry(1, 1, 1);
  geometry.name = 'c2-second-mine-near-bank-unit-cube';
  const textures = materialOrder.map(pixelTexture);
  const materials = materialOrder.map(family => new MeshLambertMaterial({
    name: `c2-second-mine-near-bank-${family}`, map: textures[materialOrder.indexOf(family)],
    flatShading: true,
  }));
  const meshes: InstancedMesh<BoxGeometry, MeshLambertMaterial>[] = [];
  const matrix = new Matrix4(), position = new Vector3(), scale = new Vector3();
  const rotation = new Quaternion();
  for (let familyIndex = 0; familyIndex < materialOrder.length; familyIndex++) {
    const family = materialOrder[familyIndex]!;
    const items = placements.filter(placement => placement.family === family);
    const mesh = new InstancedMesh(geometry, materials[familyIndex]!, items.length);
    mesh.name = `town-c2-second-mine-near-bank-teeth/${family}`;
    mesh.userData.visualOnly = true;
    mesh.userData.materialFamily = family;
    mesh.instanceMatrix.setUsage(StaticDrawUsage);
    items.forEach((placement, index) => {
      matrix.compose(position.set(placement.x, placement.y, -placement.n), rotation,
        scale.set(placement.w, placement.h, placement.d));
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    meshes.push(mesh);
  }

  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    group.removeFromParent();
    for (const mesh of meshes) mesh.dispose();
    geometry.dispose();
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
    group.clear();
  }

  return Object.freeze({
    group, placements, colliders, stats, meshes, materials, textures, geometry, dispose,
  });
}
