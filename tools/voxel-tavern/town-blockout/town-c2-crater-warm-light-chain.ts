import {
  BoxGeometry, Color, DataTexture, Group, InstancedMesh, MeshLambertMaterial,
  NearestFilter, NoColorSpace, Object3D, PointLight, RGBAFormat, SRGBColorSpace, StaticDrawUsage,
} from 'three';
import {
  createMeteorCrater, meteorCraterDepth, meteorCraterFixturePlan, meteorCraterFloorRadius, meteorCraterRimRadius,
} from './meteor-crater';
import type { mountWestCraterRoad } from './town-za22-crater-road';
import { surveyZa31CraterWinch } from './town-za31-crater-winch';

/** 批95：门房→正门→坑沿→集结地→绞盘→井口的固定暖光链。 */
export const craterWarmLightColor = 0xe08a3c;
export const craterWarmLightPrefix = 'town-c2/warm-chain/';

export type CraterWarmLightRole = 'gatehouse' | 'front-gate' | 'rim' | 'camp' | 'winch' | 'wellhead';
export type CraterWarmLightSite = Readonly<{
  id: string;
  role: CraterWarmLightRole;
  east: number;
  north: number;
  footHeight: number;
  bulbHeight: number;
}>;

type CraterRoad = Pick<ReturnType<typeof mountWestCraterRoad>, 'anchor' | 'heightAt' | 'lip'>;
type MaterialFamily = 'stone' | 'timber' | 'worn-iron' | 'brass' | 'amber' | 'frost';
type Piece = Readonly<{
  id: string;
  family: MaterialFamily;
  position: readonly [number, number, number];
  size: readonly [number, number, number];
}>;

const materialFamilies: readonly MaterialFamily[] = ['stone', 'timber', 'worn-iron', 'brass', 'amber', 'frost'];
const palette: Readonly<Record<MaterialFamily, readonly [number, number, number, number]>> = {
  stone: [0x77736c, 0x99968c, 0x474a4b, 0xb5b1a6],
  timber: [0x72543e, 0x997352, 0x47362d, 0xbc9565],
  'worn-iron': [0x5f6262, 0x86847b, 0x3a4144, 0xb7b5a9],
  brass: [0xa98a56, 0xc6a86d, 0x6f533a, 0xe1ca8c],
  amber: [craterWarmLightColor, 0xffc37a, 0x91603d, 0xffdfa1],
  frost: [0xb9cbd2, 0xe8e6db, 0x8295a1, 0xf7faf9],
};
const roleOrder: readonly CraterWarmLightRole[] = ['gatehouse', 'front-gate', 'rim', 'camp', 'winch', 'wellhead'];
const realLightIds = Object.freeze(['gatehouse', 'front-gate', 'rim-05', 'camp-1', 'winch', 'wellhead']);
const warmColor = new Color(craterWarmLightColor);
const rimRadius = meteorCraterRimRadius;
const rimStartBearing = 180;
const rimStepBearing = 33;
const bulbOffset = 2.55;
const fixture = createMeteorCrater(meteorCraterFixturePlan);
const trailSamples = Object.freeze(Array.from({ length: 513 }, (_, index) => fixture.mainTrailPoint(index / 512)));

function framePoint(origin: { east: number; north: number }, bearing: number, right: number, forward: number) {
  return {
    east: origin.east + Math.cos(bearing) * right + Math.sin(bearing) * forward,
    north: origin.north - Math.sin(bearing) * right + Math.cos(bearing) * forward,
  };
}

/**
 * Resolves all sixteen nodes against the existing ZA-22 ground authority.
 * The two pit-floor nodes are the card 13/14 workface and shaft-head lamps,
 * not extra worklights. No portable lamp, action, collider or legacy stage is read.
 */
export function surveyCraterWarmLightChain(road: CraterRoad): readonly CraterWarmLightSite[] {
  const { anchor, heightAt } = road;
  const c = Math.cos(anchor.yaw), s = Math.sin(anchor.yaw);
  const nodes: CraterWarmLightSite[] = [];

  function add(id: string, role: CraterWarmLightRole, east: number, north: number) {
    const footHeight = heightAt(east, north);
    if (footHeight === undefined || !Number.isFinite(footHeight)) {
      throw new RangeError(`C2 warm-light chain lacks surveyed ground at ${id}`);
    }
    nodes.push(Object.freeze({
      id, role, east, north, footHeight, bulbHeight: footHeight + bulbOffset,
    }));
  }

  // 卡08 gatehouse's existing door-side carrier position.
  const gatehouse = framePoint({ east: -13, north: 150.5 }, Math.PI / 2, 1.4, 2.6);
  add('gatehouse', 'gatehouse', gatehouse.east, gatehouse.north);

  // 卡09 main gate: the east gate post, leaving the passage itself clear.
  const gateBearing = (167.6 * Math.PI) / 180;
  add('front-gate', 'front-gate',
    anchor.east + 90 * Math.sin(gateBearing), anchor.north + 90 * Math.cos(gateBearing));

  // 卡16–20: ten rim nodes, clockwise from the main gate. The 33° spacing
  // gives 31.2–32.4 m gaps; only the two nodes near the spiral are eased
  // outward onto the rim apron, preserving a 3.1 m walk clearance.
  for (let index = 0; index < 10; index++) {
    const bearing = ((rimStartBearing + index * rimStepBearing) * Math.PI) / 180;
    const localBearing = bearing - anchor.yaw;
    let radius = rimRadius;
    let clearance = 0;
    while (radius <= 61) {
      const localEast = radius * Math.sin(localBearing), localNorth = radius * Math.cos(localBearing);
      clearance = Math.min(...trailSamples.map(point => Math.hypot(localEast - point.east, localNorth - point.north)));
      if (clearance >= 3.1) break;
      radius += .25;
    }
    if (clearance < 3.1) throw new RangeError(`C2 rim lamp ${index + 1} lacks trail clearance`);
    add(`rim-${String(index + 1).padStart(2, '0')}`, 'rim',
      anchor.east + radius * Math.sin(bearing), anchor.north + radius * Math.cos(bearing));
  }

  // 卡15: the assembly yard's two reviewed lamp positions, both real sources.
  const assemblyBearing = (168 * Math.PI) / 180;
  const assembly = {
    east: anchor.east + 70 * Math.sin(assemblyBearing),
    north: anchor.north + 70 * Math.cos(assemblyBearing),
  };
  for (const [index, right] of [-7.6, 7.6].entries()) {
    const point = framePoint(assembly, assemblyBearing + Math.PI, right, 1.2);
    add(`camp-${index + 1}`, 'camp', point.east, point.north);
  }

  // 卡13/14/21: exactly two warm sources on the floor. Both sit outside the
  // sealed cover, machinery foot and snake-stone reservation.
  const survey = surveyZa31CraterWinch(road);
  if (!survey) throw new RangeError('C2 warm-light chain lacks the accepted winch survey');
  function floorPoint(east: number, south: number) {
    return {
      east: anchor.east + east * c - south * s,
      north: anchor.north - south * c - east * s,
    };
  }
  const winchLamp = floorPoint(6.6, 5.8);
  add('winch', 'winch', winchLamp.east, winchLamp.north);
  const wellheadLamp = floorPoint(-2.55, -.4);
  add('wellhead', 'wellhead', wellheadLamp.east, wellheadLamp.north);

  if (nodes.length !== 16) throw new RangeError('C2 warm-light chain must contain sixteen nodes');
  const floorHeight = anchor.rimHeight - meteorCraterDepth;
  for (const node of nodes.filter(item => item.role === 'winch' || item.role === 'wellhead')) {
    const dx = node.east - anchor.east, dn = node.north - anchor.north;
    const localEast = dx * c - dn * s, localSouth = -(dx * s + dn * c);
    if (node.footHeight !== floorHeight || Math.hypot(localEast, localSouth) >= meteorCraterFloorRadius) {
      throw new RangeError(`C2 floor lamp ${node.id} left the accepted workface`);
    }
  }
  if (Math.hypot(-2.55, -.4) <= meteorCraterRimRadius / 30 + .45) {
    throw new RangeError('C2 shaft-head lamp covers the sealed shaft');
  }
  if (Math.hypot(winchLamp.east - survey.snakeStoneReservation.east,
    winchLamp.north - survey.snakeStoneReservation.north) < survey.snakeStoneReservation.radius + .45) {
    throw new RangeError('C2 winch lamp covers the snake-stone reservation');
  }
  for (const node of nodes.filter(item => item.role === 'rim')) {
    const dx = node.east - anchor.east, dn = node.north - anchor.north;
    const localEast = dx * c - dn * s, localNorth = dx * s + dn * c;
    const clearance = Math.min(...trailSamples.map(point => Math.hypot(localEast - point.east, localNorth - point.north)));
    if (clearance < 3.1) throw new RangeError(`C2 rim lamp ${node.id} covers the descent trail`);
  }
  return Object.freeze(nodes);
}

function append(pieces: Piece[], site: CraterWarmLightSite, suffix: string, family: MaterialFamily,
  east: number, up: number, north: number, width: number, height: number, depth: number) {
  pieces.push(Object.freeze({
    id: `${site.id}/${suffix}`,
    family,
    position: [east, site.footHeight + up, -north] as const,
    size: [width, height, depth] as const,
  }));
}

function buildPieces(nodes: readonly CraterWarmLightSite[]) {
  const pieces: Piece[] = [];
  for (const site of nodes) {
    const { east, north } = site;
    append(pieces, site, 'foot', 'stone', east, .09, north, .72, .18, .72);
    append(pieces, site, 'plinth', 'stone', east, .21, north, .52, .12, .52);
    for (const [index, dx, dn] of [
      [0, -.25, -.25], [1, -.25, .25], [2, .25, -.25], [3, .25, .25],
    ] as const) {
      append(pieces, site, `bolt-${index}`, 'worn-iron', east + dx, .31, north + dn, .085, .10, .085);
    }
    append(pieces, site, 'shaft', 'timber', east, 1.23, north, .19, 1.95, .19);
    for (const [index, dx, dn] of [
      [0, -.14, 0], [1, .14, 0], [2, 0, -.14], [3, 0, .14],
    ] as const) {
      append(pieces, site, `stiffener-${index}`, 'worn-iron', east + dx, 1.12, north + dn, .055, 1.28, .055);
    }
    append(pieces, site, 'lamp-base', 'brass', east, 2.27, north, .50, .12, .50);
    for (const [index, dx, dn] of [
      [0, -.22, 0], [1, .22, 0], [2, 0, -.22], [3, 0, .22],
    ] as const) {
      append(pieces, site, `frame-${index}`, 'worn-iron', east + dx, 2.55, north + dn, .052, .52, .052);
    }
    append(pieces, site, 'light-core', 'amber', east, 2.55, north, .32, .43, .32);
    append(pieces, site, 'roof', 'worn-iron', east, 2.88, north, .72, .12, .72);
    append(pieces, site, 'top-cap', 'brass', east, 2.99, north, .40, .12, .40);
    append(pieces, site, 'snow-cap', 'frost', east, 3.075, north, .30, .05, .30);
  }
  return pieces;
}

function chainStats(nodes: readonly CraterWarmLightSite[], pieces: readonly Piece[]) {
  const counts = Object.fromEntries(roleOrder.map(role => [role, 0])) as Record<CraterWarmLightRole, number>;
  for (const node of nodes) counts[node.role]++;
  const rim = nodes.filter(node => node.role === 'rim');
  const spacing = rim.length > 1
    ? rim.slice(1).reduce((sum, node, index) => sum + Math.hypot(node.east - rim[index]!.east, node.north - rim[index]!.north), 0) / (rim.length - 1)
    : 0;
  return Object.freeze({
    nodes: Object.freeze(nodes.map(node => Object.freeze({ ...node }))),
    order: Object.freeze(nodes.map(node => node.id)),
    roleCounts: Object.freeze(counts),
    lampCount: nodes.length,
    realLightCount: nodes.filter(node => realLightIds.includes(node.id)).length,
    realLightIds,
    pieceCount: pieces.length,
    pieceIds: Object.freeze(pieces.map(piece => piece.id)),
    materialFamilyCount: materialFamilies.length,
    materialFamilies: Object.freeze([...materialFamilies]),
    drawCount: materialFamilies.length,
    triangleCount: pieces.length * 12,
    rimSpacingM: spacing,
    warmColor: craterWarmLightColor,
  });
}

function writePixel(pixels: Uint8Array, index: number, color: number) {
  pixels[index] = color >> 16;
  pixels[index + 1] = (color >> 8) & 255;
  pixels[index + 2] = color & 255;
  pixels[index + 3] = 255;
}

function nearestPixelTexture(family: MaterialFamily, seed: number) {
  const [base, shine, outline, highlight] = palette[family];
  const size = 16;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const border = x < 1 || y < 1 || x > 14 || y > 14;
    const fleck = (x * 17 + y * 31 + seed * 13) % 47;
    let color = base;
    if (family === 'timber') {
      // Long vertical fibres and a small offset knot read as timber rather than tile noise.
      const fibre = (x * 7 + Math.floor(y / 4) * 3 + seed) % 19;
      const knot = Math.hypot(x - 11, y - (4 + seed % 4));
      color = fibre < 2 ? outline : fibre < 5 ? shine : fibre === 12 ? highlight : base;
      if (knot < 1.4) color = outline;
      else if (knot < 2.1) color = shine;
      if (y === 0 || y === 15) color = outline;
    } else if (family === 'worn-iron' || family === 'brass') {
      // Hammered pits plus diagonal wear distinguish forged metal from the wood shaft.
      const pit = (Math.floor(x / 2) * 11 + Math.floor(y / 2) * 7 + seed) % 23;
      const scratch = (x + y * 2 + seed) % 17 === 0 || (x * 2 - y + seed) % 29 === 0;
      color = pit < 3 ? outline : pit < 7 ? shine : pit === 15 ? highlight : base;
      if (scratch) color = highlight;
      if (border) color = pit % 2 === 0 ? shine : outline;
    } else if (family === 'amber') {
      // A dark shade rim, bright panes and a hot centre remain visible on the existing cube.
      const edge = Math.min(x, y, 15 - x, 15 - y);
      const pane = x === 3 || x === 12 || y === 4 || y === 11;
      const core = Math.hypot(x - 7.5, y - 7.5);
      color = edge < 2 ? outline : pane ? shine : core < 3.2 ? highlight : core < 5.2 ? shine : base;
      if (fleck === 0 && core > 5.2) color = shine;
    } else {
      const seam = family === 'stone'
        ? x === 7 || y === 8
        : (Math.floor(x / 4) * 5 + Math.floor(y / 3) * 7 + seed) % 9 < 2;
      color = border ? outline : seam ? shine : fleck < 2 ? highlight : base;
    }
    writePixel(pixels, (y * size + x) * 4, color);
  }
  const texture = new DataTexture(pixels, size, size, RGBAFormat);
  texture.magFilter = texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function amberEmissiveMask() {
  // Linear masks keep #e08a3c as the light hue while making the core hotter than its shade.
  const size = 16;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const edge = Math.min(x, y, 15 - x, 15 - y);
    const pane = x === 3 || x === 12 || y === 4 || y === 11;
    const core = Math.hypot(x - 7.5, y - 7.5);
    const value = edge < 2 ? 34 : pane ? 112 : core < 3.2 ? 255 : core < 5.2 ? 204 : 154;
    writePixel(pixels, (y * size + x) * 4, (value << 16) | (value << 8) | value);
  }
  const texture = new DataTexture(pixels, size, size, RGBAFormat);
  texture.magFilter = texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** Mount only on a supplied owner; the viewer and ZA-22 stay outside this module. */
export function mountCraterWarmLightChain(owner: Group, sites: readonly CraterWarmLightSite[]) {
  if (!sites.length) throw new RangeError('C2 warm-light chain needs at least one site');
  const ids = new Set<string>();
  for (const site of sites) {
    if (ids.has(site.id)) throw new RangeError(`Duplicate C2 warm-light node ${site.id}`);
    ids.add(site.id);
    if (!roleOrder.includes(site.role) || ![site.east, site.north, site.footHeight, site.bulbHeight].every(Number.isFinite) ||
      site.bulbHeight <= site.footHeight) throw new RangeError(`Invalid C2 warm-light node ${site.id}`);
  }

  const nodes = Object.freeze(sites.map(site => Object.freeze({ ...site })));
  const pieces = buildPieces(nodes);
  const data = chainStats(nodes, pieces);
  const group = new Group();
  group.name = 'town-c2-crater-warm-light-chain';
  group.userData.chainStats = data;

  const geometry = new BoxGeometry(1, 1, 1);
  const matrix = new Object3D();
  const meshes: InstancedMesh[] = [];
  const materials: MeshLambertMaterial[] = [];
  const textures: DataTexture[] = [];
  for (const [familyIndex, family] of materialFamilies.entries()) {
    const members = pieces.filter(piece => piece.family === family);
    const texture = nearestPixelTexture(family, familyIndex * 17 + 3);
    const emissiveMap = family === 'amber' ? amberEmissiveMask() : null;
    if (emissiveMap) textures.push(emissiveMap);
    const material = new MeshLambertMaterial({
      map: texture,
      ...(family === 'amber' ? {
        color: 0xffffff,
        emissive: warmColor,
        emissiveMap,
        emissiveIntensity: .04,
      } : {}),
    });
    material.userData.materialFamily = family;
    const mesh = new InstancedMesh(geometry, material, members.length);
    mesh.name = `${craterWarmLightPrefix}fixture/${family}`;
    for (const [index, piece] of members.entries()) {
      matrix.position.set(...piece.position);
      matrix.scale.set(...piece.size);
      matrix.rotation.set(0, 0, 0);
      matrix.updateMatrix();
      mesh.setMatrixAt(index, matrix.matrix);
    }
    mesh.instanceMatrix.setUsage(StaticDrawUsage);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    meshes.push(mesh);
    materials.push(material);
    textures.push(texture);
  }

  const lights = nodes.filter(site => realLightIds.includes(site.id)).map(site => {
    const light = new PointLight(warmColor, site.role === 'winch' || site.role === 'wellhead' ? 8 : 6,
      site.role === 'winch' || site.role === 'wellhead' ? 12 : 10.5, 2);
    light.name = `${craterWarmLightPrefix}${site.id}/source`;
    light.position.set(site.east, site.bulbHeight, -site.north);
    light.visible = false;
    group.add(light);
    return light;
  });
  owner.add(group);

  let night = false;
  let disposed = false;
  return {
    group,
    meshes,
    lights,
    data,
    get isNightLit() { return night; },
    setNight(value: boolean) {
      if (disposed) return;
      const next = !!value;
      if (next === night) return;
      night = next;
      for (const light of lights) light.visible = night;
      for (const material of materials) {
        if (material.userData.materialFamily === 'amber') material.emissiveIntensity = night ? 1.65 : .04;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      for (const mesh of meshes) mesh.dispose();
      for (const material of materials) material.dispose();
      for (const texture of textures) texture.dispose();
      geometry.dispose();
      group.clear();
    },
  };
}
