import {
  BoxGeometry, Color, DataTexture, Group, InstancedMesh, Matrix4,
  MeshLambertMaterial, NearestFilter, Object3D, RGBAFormat,
  SRGBColorSpace, StaticDrawUsage, UnsignedByteType,
} from 'three';
import { createStaticFootIndex } from './town-c-static-foot-index.js';

/**
 * C2-R08 -190 vault forecourt "remnant ring and inscription band".
 *
 * Atlas card U-12 asks for the palace gate to read as monumental, sealed and
 * full of future suspense. The palace dressing already owns the forecourt
 * apron, the six cover columns, the gate jambs and the gate crown, and C2-R03
 * already owns the dog-stone plinth and the two cold braziers. This package
 * only adds what none of them has: the ring of ruined monoliths that once
 * closed the forecourt, and the inscription band cut into their faces.
 *
 * The ring sits on the empty band between the cover columns and the apron
 * rim, so it closes the forecourt without touching the processional axis:
 *  - fourteen slots on a 19.4 m arc around the gate centre, with two slots
 *    left open on the axis, because the ring was never finished there;
 *  - one monolith toppled, one only a stump, one broken short - the ruin is
 *    the story, no new fiction needed;
 *  - a vertical inscription panel on the approach face of every monolith,
 *    carrying abstract glyph marks. No letters, no words, no language;
 *  - a few glyphs in cold moon-metal on a single monolith, marking the one
 *    place where the band was touched again long after the rest was sealed.
 *
 * Placement rules:
 *  - the ring band is exclusive: nothing may sit inside the cover-column
 *    ring, and nothing may touch the apron rim the dressing already owns;
 *  - the processional axis stays open for the whole approach, so the ring
 *    cannot be walked through and the gate cannot be blocked;
 *  - the inscriptions are cut into the stone, so they carry no collider and
 *    no light of their own.
 *
 * Coordinates are the palace-shell local frame (east, height above the
 * -2.4 floor datum, north), the same frame and the same "y is the bottom of
 * the piece" convention the C2-R03 anchors use. The dressing that surrounds
 * this ring belongs to Window D and is only read here, never modified.
 */

export type C2R30RingFamily =
  | 'ancient-stone' | 'shadow-stone' | 'old-gold' | 'moon-metal'
  | 'cold-ash' | 'pale-stone';
export type C2R30RingRole =
  | 'stele' | 'plinth' | 'inscription' | 'glyph' | 'rubble' | 'foundation';
export type C2R30RingZone = 'outer-ring' | 'inscription-band' | 'opening';

export type C2R30RingPiece = Readonly<{
  id: string;
  zone: C2R30RingZone;
  role: C2R30RingRole;
  family: C2R30RingFamily;
  e: number; y: number; n: number;
  w: number; h: number; d: number;
  solid: boolean;
  emitter: boolean;
}>;

export type C2R30RingSite = Readonly<{
  domainId: string;
  east: number;
  north: number;
  height: number;
  yaw: number;
}>;

export const c2R30RingFixtureSite: C2R30RingSite = Object.freeze({
  domainId: 'fixture:c2-r30:minus190:remnant-ring',
  east: 0, north: 0, height: 0, yaw: 0,
});

export const c2R30RingFixtureDatum = Object.freeze({
  id: 'c2-r30/minus190/vault-remnant-ring',
  layer: -190 as const,
  coordinateFrame: 'palace-shell-local-east-height-north' as const,
  floorDatum: -2.4 as const,
  placementKind: 'visual/fixture datum' as const,
  worldAnchor: false as const,
  registration: 'requires-explicit-host-certification; not-a-C-world-anchor' as const,
  // Read from the palace dressing, not invented: the forecourt centre, the
  // apron rim the dressing owns, the cover-column ring and the gate line.
  forecourtCentre: Object.freeze({ east: 0, north: 126 }),
  ringRadius: 19.4,
  apronRimRadius: 20.5,
  columnRingRadius: 16,
  axisHalfWidth: 4.2,
});

export const c2R30RingPalette = Object.freeze({
  'ancient-stone': 0x6f6c64,
  'shadow-stone': 0x353a42,
  'old-gold': 0x8a7047,
  'moon-metal': 0x8fa1a6,
  'cold-ash': 0x505258,
  'pale-stone': 0x9a978f,
} as const satisfies Readonly<Record<C2R30RingFamily, number>>);

const familyOrder = Object.freeze(Object.keys(c2R30RingPalette) as C2R30RingFamily[]);
const roleOrder: readonly C2R30RingRole[] = [
  'stele', 'plinth', 'inscription', 'glyph', 'rubble', 'foundation',
];
const zoneOrder: readonly C2R30RingZone[] = ['outer-ring', 'inscription-band', 'opening'];

/** Distance of a piece from the forecourt centre the ring closes around. */
function ringRadius(e: number, n: number) {
  const centre = c2R30RingFixtureDatum.forecourtCentre;
  return Math.hypot(e - centre.east, n - centre.north);
}

/**
 * Placement guard. The ring owns one exclusive band of the forecourt: inside
 * the apron rim the dressing already owns, outside the cover columns it
 * already owns, and never across the processional axis.
 */
export function c2R30RingBoxAllowed(piece: C2R30RingPiece) {
  if (![piece.e, piece.y, piece.n, piece.w, piece.h, piece.d].every(Number.isFinite) ||
    piece.w <= 0 || piece.h <= 0 || piece.d <= 0) return false;
  const datum = c2R30RingFixtureDatum;
  // Footprint: the forecourt half-disc in front of the sealed gate.
  if (piece.e - piece.w / 2 < -21 || piece.e + piece.w / 2 > 21) return false;
  if (piece.n - piece.d / 2 < 104 || piece.n + piece.d / 2 > 126.5) return false;
  // Height: above the -2.4 floor datum, below the gate crown.
  if (piece.y < -1e-6 || piece.y + piece.h > 8) return false;
  // The exclusive band: never inside the column ring, never on the apron rim.
  const radius = ringRadius(piece.e, piece.n);
  if (radius < 16.9 || radius > datum.apronRimRadius - .05) return false;
  // The processional axis to the sealed gate stays open end to end.
  if (piece.solid && Math.abs(piece.e) - piece.w / 2 < datum.axisHalfWidth) return false;
  if (piece.role === 'inscription' || piece.role === 'glyph') {
    // Cut into the stone: no collider, no light, and it must stay on a face.
    if (piece.solid) return false;
    if (piece.emitter) return false;
    if (piece.role === 'glyph' && (piece.w > .32 || piece.h > .32)) return false;
    if (Math.abs(radius - datum.ringRadius) > 1.1) return false;
  }
  if (piece.role === 'rubble' && piece.h > .5) return false;
  return true;
}

function hash(...values: readonly number[]) {
  let value = 2166136261;
  for (const item of values) value = Math.imul(value ^ Math.round(item * 100), 16777619);
  return value >>> 0;
}
const noise = (...values: readonly number[]) => hash(...values) / 0x1_0000_0000;

function pixelTexture(family: C2R30RingFamily) {
  const size = 16, pixels = new Uint8Array(size * size * 4);
  const base = c2R30RingPalette[family];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const grain = (Math.imul(x + 19, 15731) ^ Math.imul(y + 37, 4817)) >>> 0;
    let color = base;
    if (family === 'ancient-stone' || family === 'shadow-stone') {
      const course = Math.floor(y / 5);
      const joint = y % 5 === 0 || (x + (course % 2) * 3) % 9 === 0;
      const facet = (Math.floor(x / 5) + Math.floor(y / 5)) % 4;
      color = joint ? c2R30RingPalette['shadow-stone'] :
        facet === 0 ? c2R30RingPalette['cold-ash'] :
          grain % 17 < 3 ? c2R30RingPalette['pale-stone'] : base;
    } else if (family === 'old-gold') {
      color = grain % 7 === 0 ? c2R30RingPalette['ancient-stone'] :
        grain % 13 === 0 ? c2R30RingPalette['moon-metal'] : base;
    } else if (family === 'moon-metal') {
      color = grain % 5 === 0 ? c2R30RingPalette['pale-stone'] :
        grain % 11 === 0 ? c2R30RingPalette['cold-ash'] : base;
    } else if (family === 'cold-ash') {
      color = (x * 3 + y * 5) % 13 < 3 ? c2R30RingPalette['shadow-stone'] : base;
    } else {
      color = grain % 11 === 0 ? c2R30RingPalette['ancient-stone'] : base;
    }
    pixels.set([color >>> 16, (color >>> 8) & 255, color & 255, 255], (y * size + x) * 4);
  }
  const texture = new DataTexture(pixels, size, size, RGBAFormat, UnsignedByteType);
  texture.name = `town-c2-r30-ring/${family}-6colour-16px`;
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

/** The sixteen ring slots, read off the forecourt arc. */
function ringSlots() {
  const centre = c2R30RingFixtureDatum.forecourtCentre;
  const radius = c2R30RingFixtureDatum.ringRadius;
  const slots: { e: number; n: number; theta: number }[] = [];
  for (let index = 0; index < 16; index++) {
    const theta = .1 + index * (Math.PI - .2) / 15;
    // The ring was not set out true: every slot drifts a little, so the
    // remnant reads as an old ruin and not as a drawn circle.
    const drift = (noise(index, 101) - .5) * .7;
    const distance = radius + drift;
    slots.push({
      theta,
      e: centre.east + Math.cos(theta) * distance,
      n: centre.north - Math.sin(theta) * distance,
    });
  }
  return slots;
}

/** Static, auditable plan. */
export function c2R30RingPlan(): readonly C2R30RingPiece[] {
  const parts: C2R30RingPiece[] = [];
  function add(zone: C2R30RingZone, role: C2R30RingRole, family: C2R30RingFamily,
    e: number, y: number, n: number, w: number, h: number, d: number,
    solid = false, emitter = false) {
    const piece = Object.freeze({
      id: `${zone}/${role}/${family}/${parts.length}`,
      zone, role, family, e, y, n, w, h, d, solid, emitter,
    });
    if (!c2R30RingBoxAllowed(piece)) {
      throw new RangeError(`C2 R30 ring rejected ${piece.id}: ${JSON.stringify(piece)}`);
    }
    parts.push(piece);
  }

  const datum = c2R30RingFixtureDatum;
  const slots = ringSlots();
  // The two axis slots were never raised; only their foundations survive.
  const openSlots = new Set([7, 8]);
  // Slot 5 lies toppled, slot 9 was never raised past a stump, slot 14 is
  // broken short. Those three carry the suspense the atlas card asks for.
  const toppledSlot = 5, stumpSlot = 9, brokenSlot = 14;
  // The one monolith whose band was touched again later, in cold moon-metal.
  const reworkedSlot = 3;

  for (const [index, slot] of slots.entries()) {
    if (openSlots.has(index)) {
      // Flush foundation stones: the ring was planned here and never built.
      for (let course = 0; course < 2; course++) {
        add('opening', 'foundation', course % 2 ? 'shadow-stone' : 'ancient-stone',
          slot.e + (course % 2 ? .18 : -.18), course * .06, slot.n,
          1.5 - course * .12, .06, 1.05 - course * .1);
      }
      for (let chip = 0; chip < 5; chip++) {
        const e = slot.e + (noise(index, chip) - .5) * 6.4;
        const n = slot.n + (noise(index, chip + 9) - .5) * 2.6;
        if (Math.abs(e) - .2 < datum.axisHalfWidth) continue;
        // Loose stone may not wander out of the ring band.
        const radius = ringRadius(e, n);
        if (radius < 17.2 || radius > 20.3) continue;
        add('opening', 'rubble', chip % 2 ? 'cold-ash' : 'ancient-stone',
          e, .01, n, .3 + noise(index, chip + 3) * .3, .07 + noise(index, chip + 5) * .1,
          .26 + noise(index, chip + 7) * .24);
      }
      continue;
    }

    if (index === toppledSlot) {
      // The monolith fell along the arc and lies broken on the floor.
      add('outer-ring', 'plinth', 'shadow-stone', slot.e, 0, slot.n, 1.9, .2, 1.35);
      add('outer-ring', 'stele', 'ancient-stone', slot.e + .1, .2, slot.n + .16,
        2.6, .72, .74, true);
      add('outer-ring', 'stele', 'pale-stone', slot.e - 1.25, .2, slot.n + .1,
        1.1, .5, .62, true);
      add('outer-ring', 'rubble', 'cold-ash', slot.e + 1.15, .01, slot.n - .35,
        .5, .16, .42);
      add('outer-ring', 'rubble', 'ancient-stone', slot.e + 1.5, .01, slot.n - .1,
        .38, .12, .34);
      // Its band survives on the fallen shaft, still readable from above.
      add('inscription-band', 'inscription', 'shadow-stone',
        slot.e + .2, .28, slot.n - .22, 1.5, .34, .06);
      for (let glyph = 0; glyph < 5; glyph++) {
        add('inscription-band', 'glyph', glyph === 2 ? 'moon-metal' : 'old-gold',
          slot.e - .42 + glyph * .3, .32, slot.n - .28, .16, .16, .04);
      }
      continue;
    }

    // Every other slot: a two-course plinth and a standing shaft.
    add('outer-ring', 'plinth', 'ancient-stone', slot.e, 0, slot.n, 1.9, .22, 1.35, true);
    add('outer-ring', 'plinth', 'shadow-stone', slot.e, .22, slot.n, 1.66, .22, 1.12, true);
    const shaftBase = .44;
    const shaftHeight = index === stumpSlot ? 1.15 :
      index === brokenSlot ? 4.1 : 5.4 + noise(index, 21) * 1.6;
    add('outer-ring', 'stele', index % 3 === 0 ? 'pale-stone' : 'ancient-stone',
      slot.e, shaftBase, slot.n, 1.45, shaftHeight, .74, true);
    // A jagged crown, so the ruin reads as broken rather than trimmed.
    if (index !== stumpSlot) {
      const crownHeight = index === brokenSlot ? .9 : .45 + noise(index, 23) * .5;
      add('outer-ring', 'stele', 'shadow-stone', slot.e - .3, shaftBase + shaftHeight,
        slot.n + .12, .8, crownHeight * .6, .58, true);
      add('outer-ring', 'stele', 'ancient-stone', slot.e + .34, shaftBase + shaftHeight,
        slot.n - .16, .66, crownHeight * .4, .5, true);
    }
    // Loose stone at the foot of every monolith.
    for (let chip = 0; chip < 3; chip++) {
      const e = slot.e + (noise(index, chip + 31) - .5) * 2.4;
      const n = slot.n + (noise(index, chip + 41) - .5) * 2;
      // Loose stone may not wander out of the ring band.
      const radius = ringRadius(e, n);
      if (radius < 17.2 || radius > 20.3) continue;
      add('outer-ring', 'rubble', chip % 2 ? 'cold-ash' : 'ancient-stone',
        e, 0, n,
        .26 + noise(index, chip + 43) * .26, .08 + noise(index, chip + 47) * .12,
        .24 + noise(index, chip + 51) * .22);
    }

    // The inscription band: a cut panel on the approach face, a pale frame
    // around it so the band still reads in the dark, and the marks inside.
    // The gate side carries a second, shorter band, because the sconce over
    // the gate lights that face and the band must read from both sides.
    const panelHeight = Math.min(3.3, shaftHeight - .8);
    const panelBase = shaftBase + .3;
    for (const face of [-1, 1] as const) {
      const panelN = slot.n + face * (.37 + .035);
      add('inscription-band', 'inscription', 'shadow-stone',
        slot.e, panelBase, panelN, 1.05, panelHeight, .07);
      add('inscription-band', 'inscription', 'pale-stone',
        slot.e - .565, panelBase, panelN + face * .035, .08, panelHeight + .12, .05);
      add('inscription-band', 'inscription', 'pale-stone',
        slot.e + .565, panelBase, panelN + face * .035, .08, panelHeight + .12, .05);
      add('inscription-band', 'inscription', 'pale-stone',
        slot.e, panelBase + panelHeight, panelN + face * .035, 1.21, .08, .05);
      const marks = index === stumpSlot ? 3 :
        face < 0 ? 7 + Math.round(noise(index, 61) * 6) : 4 + Math.round(noise(index, 67) * 3);
      for (let glyph = 0; glyph < marks; glyph++) {
        const row = glyph % 5, column = Math.floor(glyph / 5);
        const metal = index === reworkedSlot && glyph % 3 === 0;
        add('inscription-band', 'glyph', metal ? 'moon-metal' : 'old-gold',
          slot.e + (row % 2 ? .21 : -.21) + column * .04,
          panelBase + .25 + row * .42, panelN + face * .07,
          .18 + noise(index, glyph) * .05, .18 + noise(index, glyph + 9) * .05, .05);
      }
    }
    // The band is cut, never lit: the moon-metal reads by its own sheen.
    if (index === reworkedSlot) {
      add('inscription-band', 'inscription', 'moon-metal',
        slot.e - .52, shaftBase + 1.1, slot.n - .47, .12, .5, .05);
    }
  }
  return Object.freeze(parts);
}

export type C2R30RingStats = Readonly<{
  coordinateFrame: 'palace-shell-local-east-height-north';
  depth: -190;
  datum: typeof c2R30RingFixtureDatum;
  site: C2R30RingSite;
  siteCertified: boolean;
  pieceCount: number;
  solidCount: number;
  emitterCount: number;
  paletteColorCount: 6;
  paletteCounts: Readonly<Record<C2R30RingFamily, number>>;
  roleCounts: Readonly<Record<C2R30RingRole, number>>;
  zoneCounts: Readonly<Record<C2R30RingZone, number>>;
  drawBatchCount: number;
  pixelTextureCount: number;
  textureSize: 16;
  textureFilter: 'nearest';
  shading: 'lambert';
  realLightCount: 0;
  visibleLightCount: 0;
  colliderCount: number;
  worldAnchor: false;
  registrationChanges: 0;
  gateAuthorityChanges: 0;
  lootCount: 0;
  presenceChanges: 0;
  disposed: boolean;
}>;

export type C2R30RingCollider = Readonly<{
  min: readonly [number, number, number];
  max: readonly [number, number, number];
}>;

export type C2R30RingScene = Readonly<{
  group: Group;
  pieces: readonly C2R30RingPiece[];
  colliders: readonly C2R30RingCollider[];
  canStand(e: number, n: number, y?: number, r?: number): boolean;
  stats(): C2R30RingStats;
  dispose(): void;
}>;

/**
 * Mount the remnant ring and its inscription band. Hidden by default; a host
 * must pass an explicit certified site.
 */
export function mountTownC2R30RemnantRing(options: Readonly<{
  parent?: Group;
  site?: C2R30RingSite;
  supportsSite?: (site: C2R30RingSite) => boolean;
}> = {}): C2R30RingScene {
  const group = new Group();
  group.name = 'town-c2-r30-remnant-ring';
  group.userData.coordinateFrame = 'palace-shell-local-east-height-north';
  group.userData.worldAnchor = false;
  group.userData.datum = c2R30RingFixtureDatum;
  group.userData.visualOnly = true;

  const site = options.site ?? c2R30RingFixtureSite;
  const certified = site.domainId !== c2R30RingFixtureSite.domainId &&
    options.supportsSite?.(site) === true;
  group.userData.site = site;
  group.userData.siteCertified = certified;
  group.position.set(site.east, site.height, -site.north);
  group.rotation.y = site.yaw;
  group.visible = certified;

  const pieces = c2R30RingPlan();
  const geometry = new BoxGeometry(1, 1, 1);
  geometry.name = 'town-c2-r30-ring-unit-box';
  const matrix = new Matrix4(), pose = new Object3D();
  const meshes: InstancedMesh[] = [];
  const textures: DataTexture[] = [];
  const materials: MeshLambertMaterial[] = [];
  for (const family of familyOrder) {
    const members = pieces.filter(piece => piece.family === family);
    if (!members.length) continue;
    const texture = pixelTexture(family);
    const material = new MeshLambertMaterial({
      name: `town-c2-r30-ring/${family}`,
      map: texture, color: 0xffffff, flatShading: true,
    });
    const mesh = new InstancedMesh(geometry, material, members.length);
    mesh.name = `town-c2-r30-ring/${family}`;
    members.forEach((piece, index) => {
      // `y` is the bottom of the piece, so the box centre sits half a height up.
      pose.position.set(piece.e, piece.y + piece.h / 2, -piece.n);
      pose.rotation.set(0, 0, 0);
      pose.scale.set(piece.w, piece.h, piece.d);
      pose.updateMatrix();
      mesh.setMatrixAt(index, pose.matrix);
    });
    mesh.instanceMatrix.setUsage(StaticDrawUsage);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    mesh.userData.visualOnly = true;
    group.add(mesh);
    meshes.push(mesh);
    textures.push(texture);
    materials.push(material);
  }

  const solids = pieces.filter(piece => piece.solid);
  const colliders = solids.map(piece => ({
    min: [piece.e - piece.w / 2, piece.y, -piece.n - piece.d / 2] as const,
    max: [piece.e + piece.w / 2, piece.y + piece.h, -piece.n + piece.d / 2] as const,
  }));
  const footIndex = createStaticFootIndex(colliders);

  function canStand(e: number, n: number, y = 0, r = .27) {
    if (![e, n, y, r].every(Number.isFinite) || r < 0) return false;
    return !footIndex.blocks(e, n, y, r);
  }

  let disposed = false;
  function stats(): C2R30RingStats {
    return Object.freeze({
      coordinateFrame: 'palace-shell-local-east-height-north' as const,
      depth: -190 as const,
      datum: c2R30RingFixtureDatum,
      site: Object.freeze({ ...site }),
      siteCertified: certified,
      pieceCount: pieces.length,
      solidCount: solids.length,
      emitterCount: pieces.filter(piece => piece.emitter).length,
      paletteColorCount: familyOrder.length as 6,
      paletteCounts: Object.freeze(counts(pieces.map(piece => piece.family), familyOrder)),
      roleCounts: Object.freeze(counts(pieces.map(piece => piece.role), roleOrder)),
      zoneCounts: Object.freeze(counts(pieces.map(piece => piece.zone), zoneOrder)),
      drawBatchCount: disposed ? 0 : meshes.length,
      pixelTextureCount: disposed ? 0 : textures.length,
      textureSize: 16 as const,
      textureFilter: 'nearest' as const,
      shading: 'lambert' as const,
      realLightCount: 0 as const,
      visibleLightCount: 0 as const,
      colliderCount: colliders.length,
      worldAnchor: false as const,
      registrationChanges: 0 as const,
      gateAuthorityChanges: 0 as const,
      lootCount: 0 as const,
      presenceChanges: 0 as const,
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
      for (const material of new Set(materials)) material.dispose();
      for (const texture of new Set(textures)) texture.dispose();
      geometry.dispose();
      group.clear();
      group.userData.stats = stats();
    },
  });
}

export const buildTownC2R30RemnantRing = mountTownC2R30RemnantRing;
