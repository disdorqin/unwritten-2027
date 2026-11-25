import {
  BoxGeometry, Color, DataTexture, FrontSide, Group, InstancedMesh, Matrix4,
  MeshLambertMaterial, NearestFilter, Object3D, PointLight, RGBAFormat,
  SRGBColorSpace, StaticDrawUsage, UnsignedByteType,
} from 'three';
import { createStaticFootIndex } from './town-c-static-foot-index.js';

/**
 * C2-R02 -165 warrior-city tavern sample, in the city's local ENY frame
 * (x=east, y=height, z=-north). It is a self-contained art/dressing prefab that
 * sits INSIDE the existing shell tavern footprint (te=125, tn=20), adding the
 * dungeon-tavern dark-room/warm-pool, heavy stone-and-timber and 9-colour 16px
 * pixel surface called for by the third-round art spec.
 *
 * It does NOT register a world anchor, change the safety pocket, add loot,
 * presence, gameplay authority or the shell's existing counter/tables/ledger.
 * The host decides whether and where to mount it. Coordinates are explicit
 * local fixture coordinates; no production transform is implied.
 */

export type C2R30TavernFamily =
  | 'deep-stone' | 'old-stone' | 'wet-stone' | 'timber' | 'dark-timber'
  | 'rust' | 'warm-ember' | 'moon-metal' | 'shadow';
export type C2R30TavernRole =
  | 'wall' | 'pillar' | 'beam' | 'hearth' | 'barrel' | 'shelf' | 'lamp'
  | 'sign' | 'prop' | 'rubble';
export type C2R30TavernZone =
  | 'entrance' | 'bar' | 'hearth' | 'seating' | 'rear' | 'back';

export type C2R30TavernPiece = Readonly<{
  id: string;
  zone: C2R30TavernZone;
  role: C2R30TavernRole;
  family: C2R30TavernFamily;
  e: number; // absolute local-city east
  y: number; // height above the tavern floor datum (0 = shell floor)
  n: number; // absolute local-city north
  w: number;
  h: number;
  d: number;
  solid: boolean;
  emitter: boolean;
}>;

export type C2R30TavernSite = Readonly<{
  domainId: string;
  east: number;
  north: number;
  height: number;
  yaw: number;
}>;

export const c2R30TavernFixtureSite: C2R30TavernSite = Object.freeze({
  domainId: 'fixture:c2-r30:minus165:warrior-city:tavern',
  east: 0,
  north: 0,
  height: 0,
  yaw: 0,
});

export const c2R30TavernFixtureDatum = Object.freeze({
  id: 'c2-r30/minus165/warrior-city/tavern-dressing',
  layer: -165 as const,
  coordinateFrame: 'warrior-city-local-east-height-north' as const,
  placementKind: 'visual/fixture datum' as const,
  worldAnchor: false as const,
  registration: 'requires-explicit-host-certification; not-a-C-world-anchor' as const,
  footprint: Object.freeze({ minE: 119.55, maxE: 130.45, minN: 14.4, maxN: 24.55 }),
});

/** Nine pigments from the third-round art board: cold dark stone, heavy timber, one warm fire. */
export const c2R30TavernPalette = Object.freeze({
  'deep-stone': 0x343940,
  'old-stone': 0x77746b,
  'wet-stone': 0x505258,
  timber: 0x70543e,
  'dark-timber': 0x4a3829,
  rust: 0x80563d,
  'warm-ember': 0xe5a45d,
  'moon-metal': 0x8fa1a6,
  shadow: 0x242a30,
} as const satisfies Readonly<Record<C2R30TavernFamily, number>>);

const familyOrder = Object.freeze(Object.keys(c2R30TavernPalette) as C2R30TavernFamily[]);
const roleOrder: readonly C2R30TavernRole[] = [
  'wall', 'pillar', 'beam', 'hearth', 'barrel', 'shelf', 'lamp', 'sign', 'prop', 'rubble',
];
const zoneOrder: readonly C2R30TavernZone[] = [
  'entrance', 'bar', 'hearth', 'seating', 'rear', 'back',
];

/** The shell keeps the front centre opening (|e-125|<1.45) clear for entry. */
export function c2R30TavernBoxAllowed(piece: C2R30TavernPiece) {
  if (![piece.e, piece.y, piece.n, piece.w, piece.h, piece.d].every(Number.isFinite) ||
    piece.w <= 0 || piece.h <= 0 || piece.d <= 0) return false;
  const foot = c2R30TavernFixtureDatum.footprint;
  // The back-face dressing sits just outside the shell's rear wall (n=24.55),
  // against the cave rock; allow that thin band for the back zone only.
  const maxN = piece.zone === 'back' ? foot.maxN + .4 : foot.maxN;
  if (piece.e - piece.w / 2 < foot.minE - 1e-6 ||
    piece.e + piece.w / 2 > foot.maxE + 1e-6 ||
    piece.n - piece.d / 2 < foot.minN - 1e-6 ||
    piece.n + piece.d / 2 > maxN + 1e-6) return false;
  if (piece.y < -1e-6 || piece.y + piece.h > 4.6) return false;
  // The entry throat and the bar approach centre-line must remain walkable:
  // no solid, player-height piece may cross |e-125|<1.25 within those bands.
  if (piece.solid && piece.y < 1.85 && piece.y + piece.h > 0) {
    const crossingThroat = piece.n - piece.d / 2 < 16.2 && piece.n + piece.d / 2 > 14.4;
    const crossingBar = piece.n - piece.d / 2 < 22.1 && piece.n + piece.d / 2 > 18.5;
    if ((crossingThroat || crossingBar) &&
      Math.abs(piece.e - 125) - piece.w / 2 < 1.25) return false;
  }
  return true;
}

function hash(...values: readonly number[]) {
  let value = 2166136261;
  for (const item of values) value = Math.imul(value ^ Math.round(item * 100), 16777619);
  return value >>> 0;
}
const noise = (...values: readonly number[]) => hash(...values) / 0x1_0000_0000;

function pixelTexture(family: C2R30TavernFamily) {
  const size = 16, pixels = new Uint8Array(size * size * 4);
  const base = c2R30TavernPalette[family];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let color = base;
    const grain = (Math.imul(x + 7, 15731) ^ Math.imul(y + 11, 4817)) >>> 0;
    if (family === 'deep-stone' || family === 'old-stone' || family === 'wet-stone') {
      const course = Math.floor(y / 4), shiftedX = x + (course % 2) * 4;
      const joint = y % 4 === 0 || shiftedX % 8 === 0;
      const facet = (Math.floor(x / 4) * 3 + Math.floor(y / 4)) % 5;
      color = joint ? c2R30TavernPalette.shadow :
        facet === 0 ? c2R30TavernPalette['wet-stone'] :
          grain % 23 < 3 ? c2R30TavernPalette['old-stone'] : base;
    } else if (family === 'timber' || family === 'dark-timber') {
      const grainLine = (x + Math.floor(y / 5) * 3) % 7;
      color = grainLine === 0 ? c2R30TavernPalette.shadow :
        grainLine === 1 ? c2R30TavernPalette.rust :
          grain % 29 < 4 ? c2R30TavernPalette.timber : base;
    } else if (family === 'rust') {
      color = y % 5 === 4 ? c2R30TavernPalette.shadow :
        grain % 17 < 4 ? c2R30TavernPalette['dark-timber'] : base;
    } else if (family === 'warm-ember') {
      color = grain % 7 === 0 ? c2R30TavernPalette.rust : base;
    } else if (family === 'moon-metal') {
      color = grain % 11 === 0 ? c2R30TavernPalette.shadow :
        grain % 5 === 0 ? c2R30TavernPalette['old-stone'] : base;
    } else {
      color = grain % 13 < 2 ? c2R30TavernPalette['deep-stone'] : base;
    }
    pixels.set([color >>> 16, (color >>> 8) & 255, color & 255, 255], (y * size + x) * 4);
  }
  const texture = new DataTexture(pixels, size, size, RGBAFormat, UnsignedByteType);
  texture.name = `town-c2-r30-tavern/${family}-9colour-16px`;
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function counts<T extends string>(items: readonly T[], order: readonly T[]) {
  const result = Object.fromEntries(order.map(key => [key, 0])) as Record<T, number>;
  for (const item of items) result[item]++;
  return result;
}

/** Static geometry plan, separated so tests can audit it without Three.js. */
export function c2R30TavernPlan(): readonly C2R30TavernPiece[] {
  const parts: C2R30TavernPiece[] = [];
  const te = 125;
  function add(zone: C2R30TavernZone, role: C2R30TavernRole, family: C2R30TavernFamily,
    e: number, y: number, n: number, w: number, h: number, d: number,
    solid = false, emitter = false) {
    const piece = Object.freeze({
      id: `${zone}/${role}/${family}/${parts.length}`,
      zone, role, family, e, y, n, w, h, d, solid, emitter,
    });
    if (!c2R30TavernBoxAllowed(piece)) {
      throw new RangeError(`C2 R30 tavern rejected ${piece.id}: ${JSON.stringify(piece)}`);
    }
    parts.push(piece);
  }

  // --- Rear and side interior skins: thick, offset stone courses over the shell
  // walls, reading as load-bearing masonry rather than a flat texture wall.
  for (let row = 0; row < 8; row++) {
    const y = row * .52;
    for (let col = 0; col < 20; col++) {
      const e = 120.0 + col * .52 + (row % 2 ? .13 : 0);
      const family = (row * 3 + col * 5) % 13 === 0 ? 'old-stone' :
        (row + col) % 5 === 0 ? 'wet-stone' : 'deep-stone';
      add('rear', 'wall', family, e, y, 24.12, .5, .49, .34, true);
    }
    for (const side of [-1, 1]) for (let col = 0; col < 19; col++) {
      const n = 15.1 + col * .5 + (row % 2 ? .12 : 0);
      const family = (row * 7 + col * 3) % 11 === 0 ? 'old-stone' : 'deep-stone';
      add(side > 0 ? 'seating' : 'hearth', 'wall', family,
        te + side * 5.1, y, n, .3, .49, .48, true);
    }
  }

  // --- Entrance: heavy jambs and an unlettered hanging sign just inside the
  // opening. The centre (|e-125|<1.45) is left clear for the shell doorway.
  for (const side of [-1, 1]) {
    for (let row = 0; row < 7; row++) {
      add('entrance', 'pillar', row % 3 === 0 ? 'old-stone' : 'deep-stone',
        te + side * 1.92, row * .55, 15.0, .62, .52, .62, true);
    }
    add('entrance', 'beam', 'dark-timber', te + side * 1.92, 3.86, 15.0, .74, .3, .74);
  }
  add('entrance', 'beam', 'timber', te, 3.9, 15.0, 4.6, .34, .58);
  // Sign board and two chains, just inside the doorway but above head height.
  for (const side of [-1, 1]) {
    add('entrance', 'sign', 'rust', te + side * 1.05, 3.35, 15.1, .06, .62, .06);
  }
  add('entrance', 'sign', 'dark-timber', te, 2.92, 15.1, 2.2, .64, .16);
  add('entrance', 'sign', 'warm-ember', te, 2.92, 15.02, .5, .5, .06, false, true);
  add('entrance', 'sign', 'old-stone', te, 2.92, 15.02, 1.3, .12, .06);

  // --- Bar: dark timber shelving behind the shell counter, bottle/cup rows,
  // and a warm lamp pool above the working area (the shell's lamps stay dead).
  for (let row = 0; row < 3; row++) {
    const y = 1.9 + row * .72;
    add('bar', 'shelf', 'dark-timber', te, y, 23.9, 8.4, .16, .52, true);
    for (let col = 0; col < 13; col++) {
      const e = te - 3.9 + col * .65;
      const family = col % 4 === 0 ? 'moon-metal' : col % 3 === 0 ? 'old-stone' : 'wet-stone';
      add('bar', 'prop', family, e, y + .28, 23.78, .28, .42, .26);
    }
  }
  for (const side of [-1, 1]) {
    add('bar', 'pillar', 'dark-timber', te + side * 4.1, 1.9, 23.9, .34, 2.3, .34, true);
  }
  add('bar', 'lamp', 'rust', te, 3.5, 22.7, .5, .34, .5);
  add('bar', 'lamp', 'warm-ember', te, 3.24, 22.7, .34, .28, .34, false, true);

  // --- Hearth in the north-west corner: a stone firebox with a real ember
  // core, warm buttresses and a squat chimney; the only second warm light.
  const he = 121.2, hn = 22.7;
  add('hearth', 'hearth', 'old-stone', he, .18, hn, 2.5, .36, 1.7, true);
  for (const side of [-1, 1]) {
    add('hearth', 'hearth', 'deep-stone', he + side * 1.02, 1.0, hn, .46, 1.4, 1.5, true);
  }
  add('hearth', 'hearth', 'deep-stone', he, 1.75, hn - .62, 2.5, .32, .5, true);
  add('hearth', 'hearth', 'warm-ember', he, .52, hn - .2, 1.3, .34, .7, false, true);
  for (let i = 0; i < 5; i++) {
    add('hearth', 'hearth', i % 2 === 0 ? 'warm-ember' : 'rust',
      he - .5 + i * .25, .74 + (i % 2) * .08, hn - .42, .16, .3, .16, false, i % 2 === 0);
  }
  add('hearth', 'hearth', 'deep-stone', he, 2.5, hn + .3, 1.5, 1.2, .9, true);
  // Firewood stack and a leaning poker, kept against the corner.
  for (let i = 0; i < 4; i++) {
    add('hearth', 'prop', 'dark-timber', he - .7 + i * .42, .32, hn + 1.0, .34, .28, .9);
  }
  add('hearth', 'prop', 'rust', he + 1.35, .95, hn - .1, .08, 1.5, .08);

  // --- Barrels and crates along the side walls, behind the shell tables.
  const barrelSpots: readonly (readonly [number, number, number])[] = [
    [120.3, 18.4, 1], [120.9, 18.4, 0.72], [129.7, 18.9, 1], [129.1, 20.2, .72],
    [129.7, 21.6, 1], [120.4, 16.2, .72],
  ];
  for (const [e, n, scale] of barrelSpots) {
    const h = 1.05 * scale;
    add('seating', 'barrel', 'dark-timber', e, h / 2, n, .78 * scale, h, .78 * scale, true);
    for (const band of [.24, .68]) {
      add('seating', 'barrel', 'rust', e, h * band, n, .82 * scale, .09, .82 * scale);
    }
    add('seating', 'barrel', 'old-stone', e, h + .02, n, .62 * scale, .05, .62 * scale);
  }
  // Stacked crates by the rear shelf.
  for (let i = 0; i < 3; i++) {
    add('rear', 'prop', 'dark-timber', 128.3 + (i % 2) * .1, .32 + i * .62, 23.3, .86, .6, .8, true);
  }

  // --- Seating-side wall details: a mounted mug rail and abandoned benches.
  for (let i = 0; i < 6; i++) {
    add('seating', 'shelf', 'dark-timber', 129.75, 1.55, 16.2 + i * .92, .24, .12, .8);
    add('seating', 'prop', i % 2 ? 'moon-metal' : 'old-stone',
      129.62, 1.72, 16.2 + i * .92, .18, .26, .2);
  }
  for (const n of [17.2, 20.4]) {
    add('seating', 'prop', 'dark-timber', 128.2, .42, n, 1.7, .14, .44, true);
    for (const side of [-1, 1]) {
      add('seating', 'prop', 'dark-timber', 128.2 + side * .7, .2, n, .14, .4, .4, true);
    }
  }

  // --- Rear: a shuttered service hatch and a cold moonlight slit (crystal/moon,
  // not a real light), reinforcing the centuries-empty underground atmosphere.
  add('rear', 'shelf', 'dark-timber', 123.2, 2.1, 23.94, 2.2, 1.5, .18, true);
  for (let i = 0; i < 4; i++) {
    add('rear', 'prop', 'dark-timber', 122.3 + i * .55, 2.1, 23.8, .1, 1.4, .12);
  }
  add('rear', 'prop', 'moon-metal', 126.9, 3.05, 24.0, .5, .5, .08, false, true);

  // --- Back face: the shell's rear wall seen from outside the tavern volume.
  // A weathered timber brace and unreadable carved plaque complete the silhouette.
  for (let i = 0; i < 3; i++) {
    add('back', 'beam', 'dark-timber', 121.6 + i * 3.4, 0, 24.72, .3, 3.5, .24);
  }
  add('back', 'sign', 'old-stone', 125, 2.5, 24.78, 2.0, .7, .14);
  add('back', 'sign', 'shadow', 125, 2.5, 24.86, 1.5, .12, .06);

  // --- Loose rubble and spilled stools give the room lived-in wear without
  // blocking the entry throat or bar approach centre-line.
  for (let i = 0; i < 8; i++) {
    const e = 120.2 + noise(i, 11) * 9.6;
    const n = 16.0 + noise(i, 29) * 6.6;
    if (Math.abs(e - te) < 1.5) continue;
    add('seating', 'rubble', i % 3 === 0 ? 'old-stone' : 'wet-stone',
      e, .07, n, .2 + noise(i, 5) * .22, .14, .18 + noise(i, 7) * .2);
  }
  return Object.freeze(parts);
}

export type C2R30TavernStats = Readonly<{
  coordinateFrame: 'warrior-city-local-east-height-north';
  depth: -165;
  datum: typeof c2R30TavernFixtureDatum;
  site: C2R30TavernSite;
  siteCertified: boolean;
  pieceCount: number;
  solidCount: number;
  emitterCount: number;
  paletteColorCount: 9;
  paletteCounts: Readonly<Record<C2R30TavernFamily, number>>;
  roleCounts: Readonly<Record<C2R30TavernRole, number>>;
  zoneCounts: Readonly<Record<C2R30TavernZone, number>>;
  drawBatchCount: number;
  pixelTextureCount: number;
  textureSize: 16;
  textureFilter: 'nearest';
  shading: 'lambert';
  realLightCount: number;
  visibleLightCount: number;
  colliderCount: number;
  worldAnchor: false;
  registrationChanges: 0;
  lootCount: 0;
  presenceChanges: 0;
  disposed: boolean;
}>;

function effectivelyVisible(object: Object3D) {
  for (let current: Object3D | null = object; current; current = current.parent) {
    if (!current.visible) return false;
  }
  return true;
}

export type C2R30TavernCollider = Readonly<{
  min: readonly [number, number, number];
  max: readonly [number, number, number];
}>;

export type C2R30TavernScene = Readonly<{
  group: Group;
  pieces: readonly C2R30TavernPiece[];
  colliders: readonly C2R30TavernCollider[];
  canStand(e: number, n: number, y?: number, r?: number): boolean;
  stats(): C2R30TavernStats;
  dispose(): void;
}>;

/**
 * Mount the tavern dressing. By default it stays local at the fixture datum and
 * hidden; a host passes an explicit certified site (and optional night/light
 * budget) to reveal it. It owns no gameplay or world authority.
 */
export function mountTownC2R30Tavern(options: Readonly<{
  parent?: Group;
  site?: C2R30TavernSite;
  supportsSite?: (site: C2R30TavernSite) => boolean;
  readNight?: () => boolean;
  readLightBudget?: () => number;
}> = {}): C2R30TavernScene {
  const group = new Group();
  group.name = 'town-c2-r30-tavern-dressing';
  group.userData.coordinateFrame = 'warrior-city-local-east-height-north';
  group.userData.worldAnchor = false;
  group.userData.datum = c2R30TavernFixtureDatum;
  group.userData.visualOnly = true;

  const site = options.site ?? c2R30TavernFixtureSite;
  const certified = site.domainId !== c2R30TavernFixtureSite.domainId &&
    options.supportsSite?.(site) === true;
  group.userData.site = site;
  group.userData.siteCertified = certified;
  group.position.set(site.east, site.height, -site.north);
  group.rotation.y = site.yaw;
  group.visible = certified;

  const pieces = c2R30TavernPlan();
  const geometry = new BoxGeometry(1, 1, 1);
  geometry.name = 'town-c2-r30-tavern-unit-box';
  const matrices = new Map<C2R30TavernFamily, Matrix4[]>();
  const matrix = new Matrix4(), pose = new Object3D();
  for (const family of familyOrder) matrices.set(family, []);
  for (const piece of pieces) {
    pose.position.set(piece.e, piece.y, -piece.n);
    pose.rotation.set(0, 0, 0);
    pose.scale.set(piece.w, piece.h, piece.d);
    pose.updateMatrix();
    matrices.get(piece.family)!.push(matrix.clone().copy(pose.matrix));
  }

  const meshes: InstancedMesh[] = [];
  const textures: DataTexture[] = [];
  const materials: MeshLambertMaterial[] = [];
  for (const family of familyOrder) {
    const items = matrices.get(family)!;
    if (!items.length) continue;
    const texture = pixelTexture(family);
    const emissive = family === 'warm-ember' || family === 'moon-metal';
    const material = new MeshLambertMaterial({
      name: `town-c2-r30-tavern/${family}`,
      map: texture,
      color: 0xffffff,
      flatShading: true,
      ...(emissive ? { emissive: new Color(c2R30TavernPalette[family]), emissiveIntensity: .5 } : {}),
    });
    const mesh = new InstancedMesh(geometry, material, items.length);
    mesh.name = `town-c2-r30-tavern/${family}`;
    mesh.userData.visualOnly = true;
    items.forEach((item, index) => mesh.setMatrixAt(index, item));
    mesh.instanceMatrix.setUsage(StaticDrawUsage);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    meshes.push(mesh);
    textures.push(texture);
    materials.push(material);
  }

  // Two bounded warm pools: one over the bar, one at the hearth. The host's
  // night/light budget can dim them; they never leak beyond the tavern room.
  const lights: PointLight[] = [];
  const night = options.readNight?.() !== false;
  const budget = night ? Math.max(0, Math.floor(options.readLightBudget?.() ?? 2)) : 0;
  const lightSpecs = [
    { e: 125, y: 3.24, n: 22.7, color: 0xe5a45d, power: 6.5 },
    { e: 121.2, y: .8, n: 22.3, color: 0xe5a45d, power: 5.5 },
  ];
  for (const spec of lightSpecs.slice(0, budget)) {
    const light = new PointLight(spec.color, spec.power, 11, 2);
    light.name = 'town-c2-r30-tavern/warm-pool';
    light.position.set(spec.e, spec.y, -spec.n);
    group.add(light);
    lights.push(light);
  }

  const solidPieces = pieces.filter(piece => piece.solid);
  const colliders = solidPieces.map(piece => ({
    min: [piece.e - piece.w / 2, piece.y, -piece.n - piece.d / 2] as const,
    max: [piece.e + piece.w / 2, piece.y + piece.h, -piece.n + piece.d / 2] as const,
  }));
  const footIndex = createStaticFootIndex(colliders);
  // Scene is authored in absolute local-city coordinates; canStand consumes them directly.
  function canStand(e: number, n: number, y = 0, r = .27) {
    const foot = c2R30TavernFixtureDatum.footprint;
    if (![e, n, y, r].every(Number.isFinite) || e - r < foot.minE || e + r > foot.maxE ||
      n - r < foot.minN || n + r > foot.maxN) return false;
    return !footIndex.blocks(e, n, y, r);
  }

  let disposed = false;
  function stats(): C2R30TavernStats {
    return Object.freeze({
      coordinateFrame: 'warrior-city-local-east-height-north' as const,
      depth: -165 as const,
      datum: c2R30TavernFixtureDatum,
      site: Object.freeze({ ...site }),
      siteCertified: certified,
      pieceCount: pieces.length,
      solidCount: solidPieces.length,
      emitterCount: pieces.filter(piece => piece.emitter).length,
      paletteColorCount: familyOrder.length as 9,
      paletteCounts: Object.freeze(counts(pieces.map(piece => piece.family), familyOrder)),
      roleCounts: Object.freeze(counts(pieces.map(piece => piece.role), roleOrder)),
      zoneCounts: Object.freeze(counts(pieces.map(piece => piece.zone), zoneOrder)),
      drawBatchCount: disposed ? 0 : meshes.length,
      pixelTextureCount: disposed ? 0 : textures.length,
      textureSize: 16 as const,
      textureFilter: 'nearest' as const,
      shading: 'lambert' as const,
      realLightCount: disposed ? 0 : lights.length,
      visibleLightCount: disposed ? 0 : lights.filter(effectivelyVisible).length,
      colliderCount: colliders.length,
      worldAnchor: false as const,
      registrationChanges: 0,
      lootCount: 0,
      presenceChanges: 0,
      disposed,
    });
  }
  group.userData.stats = stats();

  options.parent?.add(group);
  return Object.freeze({
    group, pieces, colliders, canStand, stats,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      for (const mesh of meshes) mesh.dispose();
      for (const material of materials) material.dispose();
      for (const texture of textures) texture.dispose();
      for (const light of lights) light.dispose();
      geometry.dispose();
      group.clear();
      group.userData.stats = stats();
    },
  });
}

export const buildTownC2R30Tavern = mountTownC2R30Tavern;
