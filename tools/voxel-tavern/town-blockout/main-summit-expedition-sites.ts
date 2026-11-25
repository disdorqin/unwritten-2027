import {
  BoxGeometry, Color, Group, InstancedMesh, MeshLambertMaterial, MeshBasicMaterial,
  Object3D, PointLight,
} from 'three';
import type { MainSummitTrailPoint } from './main-summit-trail';

/** Mountable artwork in the approved P-1 local E/N frame, on the real surveyed P-3 trail.
 * Coordinates never use the 300/676 town-map assembly offset a second time.
 */
type Point = Readonly<{ east: number; north: number; height: number }>;
type GroundAt = (east: number, north: number) => number | undefined;
type Family = 'rock' | 'stone' | 'timber' | 'tile' | 'bronze' | 'snow' | 'ice' | 'cloth' | 'ember';
type Voxel = Readonly<{
  family: Family; east: number; north: number; height: number;
  width: number; depth: number; tall: number; yaw: number; tint: string;
}>;
export type SummitExpeditionSite = Point & Readonly<{
  id: string; kind: 'stone-towers' | 'shelter' | 'observatory' | 'icefall' | 'summit-flag' | 'waymark' | 'machine-hall';
  yaw: number; trail: Point; distanceToTrail: number;
}>;
type SitePick = SummitExpeditionSite & { tangentEast: number; tangentNorth: number };
type ContactBox = Readonly<{
  id: string; site: SummitExpeditionSite; x: number; z: number;
  width: number; depth: number; base: number; top: number;
}>;

const families: readonly Family[] = ['rock', 'stone', 'timber', 'tile', 'bronze',
  'snow', 'ice', 'cloth', 'ember'];
const familyTint: Record<Family, string> = {
  rock: '#495158', stone: '#77858a', timber: '#88654d', tile: '#4e6571',
  bronze: '#b9a16e', snow: '#d4dce1', ice: '#94c9d2', cloth: '#ac544c', ember: '#ffcd8b',
};
const palette = {
  stone: ['#58666d', '#73818a', '#9aa2a6', '#596571'],
  rock: ['#293840', '#435159', '#657071', '#847448'],
  timber: ['#4d3931', '#785342', '#a07b56', '#a78a66'],
  tile: ['#344958', '#486174', '#566e7f', '#9eacb2'],
  bronze: ['#987144', '#c8a46e', '#e1c48b'],
  snow: ['#c7d1d6', '#dee5e8', '#a9bac6'],
  ice: ['#5c9fb1', '#a7d5d8', '#d4e8ea', '#7db9c8'],
  cloth: ['#ba594a', '#e1bc75', '#79a2a0', '#a86179', '#eee4bc'],
  ember: ['#d98a4c', '#efc67e'],
} as const;

function finite(point: Point) {
  return Number.isFinite(point.east) && Number.isFinite(point.north) && Number.isFinite(point.height);
}
function nearestTrailDistance(east: number, north: number, trail: readonly MainSummitTrailPoint[]) {
  let least = Infinity;
  for (let i = 0; i < trail.length; i += 3) {
    const p = trail[i]!;
    least = Math.min(least, Math.hypot(east - p.east, north - p.north));
  }
  return least;
}
function selectOffTrail(
  id: string, kind: SummitExpeditionSite['kind'],
  trail: readonly MainSummitTrailPoint[], groundAt: GroundAt,
  fraction: number, distance: number, minimumClearance: number,
  maximumSlope = 11,
): SitePick {
  const middle = Math.max(8, Math.min(trail.length - 9, Math.round(fraction * trail.length)));
  let best: SitePick | undefined;
  let bestCost = Infinity;
  for (let delta = 0; delta <= 390; delta += 21) {
    for (const sign of delta === 0 ? [1] : [1, -1]) {
      const index = middle + sign * delta;
      if (index < 8 || index > trail.length - 9) continue;
      const point = trail[index]!;
      const before = trail[index - 4]!, after = trail[index + 4]!;
      const length = Math.hypot(after.east - before.east, after.north - before.north);
      if (length < .1) continue;
      const tangentEast = (after.east - before.east) / length;
      const tangentNorth = (after.north - before.north) / length;
      for (const side of [-1, 1]) {
        const east = point.east + side * -tangentNorth * distance;
        const north = point.north + side * tangentEast * distance;
        const height = groundAt(east, north);
        if (height === undefined || !Number.isFinite(height)) continue;
        const clearance = nearestTrailDistance(east, north, trail);
        if (clearance < minimumClearance) continue;
        const surrounding = [
          [east - 4, north], [east + 4, north], [east, north - 4], [east, north + 4],
        ].map(([e, n]) => groundAt(e!, n!));
        if (surrounding.some(h => h === undefined || !Number.isFinite(h))) continue;
        if (Math.max(...surrounding as number[]) - Math.min(...surrounding as number[]) > maximumSlope) continue;
        // Three.js model-local +Z maps to (sin yaw, -cos yaw) in map
        // E/N. Point the genuine *front entrance* toward the surveyed P-3
        // centreline, not along its reflected north direction.
        const yaw = Math.atan2(point.east - east, north - point.north);
        const candidate: SitePick = {
          id, kind, east, north, height, yaw,
          trail: { ...point }, distanceToTrail: distance,
          tangentEast, tangentNorth,
        };
        const cost = delta + Math.abs(height - point.height) * 3;
        if (cost < bestCost) { best = candidate; bestCost = cost; }
      }
    }
    if (best && delta > 75) break;
  }
  if (!best) throw new RangeError('Cannot place expedition site clear of the P-3 trail: ' + id);
  return best;
}

function orient(site: SummitExpeditionSite, x: number, z: number) {
  return {
    east: site.east + x * Math.cos(site.yaw) + z * Math.sin(site.yaw),
    north: site.north + x * Math.sin(site.yaw) - z * Math.cos(site.yaw),
  };
}

/** A full mountain-area model package; visual, collision and foot surface share one survey. */
export function mountMainSummitExpeditionSites(
  owner: Group, groundAt: GroundAt, trail: readonly MainSummitTrailPoint[],
) {
  if (trail.length < 5_000 || trail.some(p => !finite(p))) {
    throw new RangeError('Expedition scenery requires the full approved P-3 surveyed trail');
  }
  const group = new Group();
  group.name = 'main-summit-expedition-sites';
  owner.add(group);
  const pieces: Voxel[] = [];
  const sites: SummitExpeditionSite[] = [];
  const contact: ContactBox[] = [];
  const lights: PointLight[] = [];
  const walkable: { site: SummitExpeditionSite; width: number; depth: number; height: number }[] = [];
  const connectors: { site: SummitExpeditionSite; farZ: number; farHeight: number }[] = [];

  function box(
    family: Family, tint: string, east: number, north: number, height: number,
    width: number, tall: number, depth: number, yaw = 0,
  ) {
    if (![east, north, height, width, tall, depth, yaw].every(Number.isFinite) ||
        width <= 0 || depth <= 0 || tall <= 0) throw new RangeError('Invalid expedition voxel geometry');
    pieces.push({ family, tint, east, north, height, width, tall, depth, yaw });
  }
  function local(site: SummitExpeditionSite, family: Family, tint: string,
    x: number, y: number, z: number, w: number, h: number, d: number,
  ) {
    const p = orient(site, x, z);
    box(family, tint, p.east, p.north, site.height + y, w, h, d, site.yaw);
  }
  function light(site: SummitExpeditionSite, x: number, y: number, z: number,
    color: string, intensity: number, distance: number) {
    const p = orient(site, x, z);
    const glow = new PointLight(color, intensity, distance, 2);
    glow.name = site.id + '-source-lamp';
    glow.position.set(p.east, site.height + y, -p.north);
    group.add(glow);
    lights.push(glow);
  }
  function obstacle(site: SummitExpeditionSite, id: string, x: number, z: number,
    width: number, depth: number, fromY: number, toY: number) {
    // Keep the same yaw as the visual voxel. A world-space AABB enclosing a
    // diagonal wall falsely blocks the *open centre of the house*.
    contact.push({ id, site, x, z, width, depth,
      base: site.height + fromY, top: site.height + toY });
  }

  // R1: two complete semi-buried stone-and-timber mountain refuges.
  function shelter(site: SitePick, suffix: number) {
    sites.push(site);
    const plank = palette.timber;
    local(site, 'stone', palette.stone[0], 0, -.18, 0, 7.7, .38, 6.4);
    local(site, 'stone', palette.stone[2], 0, -.035, 0, 7.3, .09, 6.0);
    for (let i = 0; i < 19; i++) {
      local(site, 'timber', plank[i % 3]!, -3.42 + i * .38, .03, 0,
        .37, .07, 5.75);
    }
    walkable.push({ site, width: 7.15, depth: 5.75, height: site.height + .065 });
    for (const z of [-2.9, 2.9]) {
      if (z < 0) {
        local(site, 'stone', palette.stone[0], 0, 1.48, z, 7.4, 2.96, .36);
        obstacle(site, site.id + '-back', 0, z, 7.4, .36, 0, 2.96);
      } else {
        for (const side of [-1, 1]) {
          local(site, 'stone', palette.stone[0], side * 2.31, 1.30, z, 2.79, 2.60, .36);
          obstacle(site, site.id + '-front-wall', side * 2.31, z, 2.79, .36, 0, 2.6);
          local(site, 'timber', palette.timber[0], side * 2.31, 2.87, z, 2.79, .49, .38);
        }
        local(site, 'timber', plank[0], 0, 3.06, z, 2.02, .36, .36);
      }
    }
    for (const x of [-3.50, 3.50]) {
      local(site, 'stone', palette.stone[0], x, .65, 0, .35, 1.30, 5.6);
      for (const z of [-2.17, -.67, .93, 2.05]) {
        local(site, 'timber', plank[(z > 0 ? 2 : 1)], x, 2.34, z,
          .37, 2.08, z === -2.17 ? 1.12 : .88);
      }
      local(site, 'timber', plank[0], x, 3.35, 0, .38, .26, 6.4);
      obstacle(site, site.id + '-side-wall', x, 0, .35, 5.6, 0, 3.28);
    }
    // The roof is a complete layered, stepped saddle; snow remains in the upper
    // gutters rather than an untextured flat white wedge.
    for (let index = 0; index < 12; index++) for (const side of [-1, 1]) {
      const x = side * (3.72 - index * .29);
      const y = 3.34 + index * .14;
      local(site, 'tile', palette.tile[index % 3]!, x, y, 0, .63, .18, 6.65);
      if (index % 3 === 0) local(site, 'snow', palette.snow[1], x, y + .105, 0,
        .64, .065, 6.61);
    }
    local(site, 'timber', plank[0], 0, 5.02, 0, .38, .31, 6.70);
    for (const x of [-3.36, 3.36]) for (const z of [-2.8, 2.8]) {
      local(site, 'timber', plank[0], x, 1.80, z, .27, 3.6, .27);
      local(site, 'bronze', palette.bronze[1], x, 3.28, z, .36, .09, .36);
    }

    // Actual interior: sheltered fire circle, feeding wood, bunk, rope shelf,
    // ration tins, boots, weathered ledger and a small brass chime.
    local(site, 'stone', palette.stone[1], -1.85, .23, -1.05, 1.44, .32, 1.36);
    for (const [x, z] of [[-2.35, -1.5], [-1.3, -1.5], [-2.35, -.57], [-1.3, -.57]]) {
      local(site, 'rock', palette.rock[0], x, .35, z, .39, .40, .39);
    }
    for (const x of [-2.11, -1.70]) {
      local(site, 'timber', plank[0], x, .53, -1.02, .13, .28, 1.07);
    }
    local(site, 'ember', palette.ember[0], -1.85, .71, -1.05, .43, .55, .28);
    light(site, -1.85, 1.13, -1.05, '#ffd39e', 3.5, 9);
    for (const x of [1.65, 2.45]) {
      local(site, 'timber', plank[0], x, .25, -1.83, .53, .5, 1.73);
      local(site, 'cloth', palette.cloth[4], x, .56, -1.83, .57, .13, 1.75);
    }
    local(site, 'timber', plank[2], 2.12, .96, 1.28, 1.5, .16, 1.1);
    for (const x of [1.57, 2.72]) {
      local(site, 'timber', plank[0], x, .54, 1.28, .16, .86, 1.14);
    }
    for (let row = 0; row < 3; row++) for (let column = 0; column < 4; column++) {
      local(site, row === 1 ? 'bronze' : 'timber', row === 1 ? palette.bronze[0] : plank[column % 3]!,
        1.65 + column * .31, 1.13 + row * .21, 1.08, .22, .19, .32);
    }
    local(site, 'cloth', palette.cloth[1], 2.34, 1.10, -.29, .53, .13, .53);
    for (const z of [-.54, -.31, -.08]) local(site, 'bronze', palette.bronze[2], 2.34, 1.18, z,
      .06, .07, .06);
    const sign = suffix === 1 ? '避风窝棚·云海岗' : '避风窝棚·瀑顶岗';
    local(site, 'timber', plank[0], 0, 2.16, 2.94, 1.80, .68, .18);
    local(site, 'bronze', palette.bronze[2], 0, 2.37, 3.06, .96, .10, .07);
    local(site, 'bronze', palette.bronze[1], -.03, 2.13, 3.07, .88, .06, .07);
    for (const x of [-1.19, 1.19]) {
      local(site, 'timber', plank[0], x, 1.22, 3.02, .13, 2.44, .15);
      local(site, 'cloth', palette.cloth[suffix === 1 ? 0 : 2], x, 2.16, 3.17, .27, .58, .08);
    }
    local(site, 'bronze', palette.bronze[1], 0, 1.93, 3.16, .23, .40, .23);
    local(site, 'ember', palette.ember[1], 0, 1.67, 3.18, .14, .19, .13);
    light(site, 0, 1.70, 3.3, '#f7c78d', 2.1, 9);

    const farZ = site.distanceToTrail - .30;
    const landing = orient(site, 0, farZ);
    const farHeight = groundAt(landing.east, landing.north);
    if (farHeight === undefined) throw new RangeError('No certified walkway landing for ' + site.id);
    const stairAt = (z: number) => site.height + .065 +
      (farHeight - site.height - .065) * Math.max(0, Math.min(1, (z - 2.72) / (farZ - 2.72)));
    connectors.push({ site, farZ, farHeight });
    // Real stepped access from the exterior P-3 trail to the elevated shelter
    // door. The old 'ground + .08' boards stopped 1.4 m BELOW the doorway
    // and appeared as floating teeth in native first-person screenshots.
    for (let step = 0; step < Math.ceil((farZ - 2.9) / .42); step++) {
      const z = 2.96 + step * .42;
      if (z > farZ) break;
      const rise = stairAt(z);
      const p = orient(site, 0, z);
      const terrain = groundAt(p.east, p.north);
      if (terrain === undefined) continue;
      local(site, 'timber', plank[step % 3]!, 0, rise - site.height - .065,
        z, 1.78, .14, .43);
      for (const side of [-1, 1]) {
        // Load-bearing stone risers grow out of the actual P-1 slope and
        // remain below each tread instead of acting as invisible collision.
        const seat = orient(site, side * .76, z);
        const base = groundAt(seat.east, seat.north);
        if (base !== undefined && rise > base + .15) {
          local(site, 'stone', palette.stone[(step + (side > 0 ? 1 : 0)) % 3]!, side * .76,
            (rise + base - .11) / 2 - site.height, z, .29,
            Math.max(.12, rise - base + .11), .38);
        }
        if (step % 4 === 0) {
          const seatHeight = base ?? rise - .7;
          local(site, 'timber', plank[0], side * 1.02,
            Math.max(rise, seatHeight) + .45 - site.height, z,
            .14, .98, .15);
          local(site, 'bronze', palette.bronze[1], side * 1.02,
            rise + .95 - site.height, z, .16, .10, .16);
        }
      }
    }
    for (const side of [-1, 1]) for (let section = 0; section < Math.ceil((farZ - 3) / 2.7); section++) {
      const z = 3.0 + section * 2.7 + 1.25;
      if (z > farZ) continue;
      local(site, 'timber', plank[0], side * 1.02,
        stairAt(z) + .96 - site.height, z, .14, .13, 2.68);
    }
    // The elevated front plinth has stone supports all the way down to
    // physical ground, unlike an unsupported floating house slab.
    for (const x of [-3.2, 3.2]) for (const z of [1.7, 2.8]) {
      const spot = orient(site, x, z);
      const terrain = groundAt(spot.east, spot.north);
      if (terrain === undefined || terrain >= site.height - .20) continue;
      const height = site.height - terrain - .20;
      local(site, 'stone', palette.stone[1], x,
        terrain - site.height + height / 2, z, .65, height, .78);
    }
    return sign;
  }

  const shelterA = selectOffTrail('expedition-cloud-shelter', 'shelter', trail, groundAt, .37, 14, 7, 12);
  const shelterB = selectOffTrail('expedition-ice-shelter', 'shelter', trail, groundAt, .69, 14, 7, 12);
  const shelterNames = [shelter(shelterA, 1), shelter(shelterB, 2)];

  // R1: collapsed meteorological watch and stellar-slate terrace, 80 m off
  // the walking track. Broken architecture retains actual voids and access.
  const observatory = selectOffTrail('expedition-watch-ruins', 'observatory', trail, groundAt,
    .78, 82, 55, 16);
  sites.push(observatory);
  for (let i = 0; i < 72; i++) {
    const angle = 2 * Math.PI * i / 72;
    const radius = 6.2 * Math.sqrt((i + .5) / 72);
    local(observatory, 'stone', palette.stone[i % 4]!,
      Math.cos(angle * 2.17) * radius, -.20, Math.sin(angle * 2.17) * radius,
      .95, .37, .94);
  }
  // The entry gap faces the actual trail, not the back of the ruin.
  const entranceAngle = Math.PI / 2;
  for (let i = 0; i < 44; i++) {
    const angle = Math.PI * 2 * i / 44;
    if (Math.abs(Math.atan2(Math.sin(angle - entranceAngle), Math.cos(angle - entranceAngle))) < .28) continue;
    const x = 6.4 * Math.cos(angle);
    const z = 6.4 * Math.sin(angle);
    const height = .8 + (i % 8) * .21;
    for (let layer = 0; layer < Math.ceil(height / .38); layer++) {
      local(observatory, 'stone', palette.stone[(i + layer) % 4]!, x,
        .19 + layer * .38, z, 1.18, .38, .61);
    }
  }
  for (const [x, z, h] of [[-2.1, 1.5, 2.8], [1.9, -1.4, 3.5], [-3.5, -3.0, 2.2]]) {
    local(observatory, 'bronze', palette.bronze[0], x, h / 2, z, .31, h, .37);
    local(observatory, 'rock', palette.rock[2], x, -.02, z, 1.2, .24, 1.24);
    local(observatory, 'bronze', palette.bronze[1], x, h, z, .72, .20, .50);
  }
  for (let slab = 0; slab < 3; slab++) {
    const x = -2.1 + slab * 2.1;
    const z = .2 + (slab % 2) * .4;
    local(observatory, 'rock', palette.rock[1], x, .03, z, 1.8, .20, 2.2);
    local(observatory, 'stone', palette.stone[2], x, .16, z, 1.53, .07, 1.94);
    for (let dot = 0; dot < 9; dot++) {
      local(observatory, 'bronze', palette.bronze[2],
        x - .62 + (dot % 3) * .54, .21, z - .72 + Math.floor(dot / 3) * .71,
        .065, .026, .065);
    }
  }
  for (const [x, z] of [[-5.5, 3.3], [4.8, -3.8], [-4.3, -4.6]]) {
    for (let p = 0; p < 13; p++) {
      const dx = Math.cos(p * 2.5) * (.3 + .35 * p / 12);
      const dz = Math.sin(p * 2.5) * (.2 + .33 * p / 12);
      local(observatory, 'stone', palette.stone[p % 3]!, x + dx, .07 + .18 * (p % 3),
        z + dz, .43 + .17 * (p % 2), .22, .39);
    }
  }
  local(observatory, 'bronze', palette.bronze[1], 0, 3.20, -3.6, 1.45, .29, .18);
  light(observatory, 0, 2.40, -3.6, '#b0d0da', 1.4, 12);

  // R1: one approximately 40 m high frozen fall. The layered faces, translucent
  // blue bands, bubble pockets and six anchor rings use one grouped shape.
  const icefall = selectOffTrail('expedition-icefall', 'icefall', trail, groundAt,
    .56, 52, 29, 24);
  sites.push(icefall);
  for (let layer = 0; layer < 24; layer++) {
    const lift = layer * 1.67;
    const bow = .78 * Math.sin(layer * .43);
    for (let stripe = 0; stripe < 16; stripe++) {
      const x = -7.5 + (stripe + .5) * .94;
      const z = -.9 + bow + Math.sin(stripe * .67 + layer * .28) * .35;
      const variant = (stripe * 7 + layer * 3) % 4;
      local(icefall, 'ice', palette.ice[variant]!, x, lift + .83, z,
        .92, 1.72, .46 + .17 * (variant % 2));
      if ((stripe + layer * 5) % 11 === 0) {
        local(icefall, 'snow', palette.snow[(layer + stripe) % 3]!, x, lift + .39, z + .31,
          .22, .12, .21);
      }
    }
  }
  for (let i = 0; i < 36; i++) {
    const x = -7.75 + i * .43;
    local(icefall, 'rock', palette.rock[i % 4]!, x, .46 + (i % 3) * .34, -.85, .58,
      .95 + (i % 3) * .35, 1.25);
  }
  for (let index = 0; index < 6; index++) {
    const x = -6.7 + index * 2.6;
    const y = 4.8 + index * 5.1;
    local(icefall, 'bronze', palette.bronze[1], x, y, .64, .48, .44, .53);
    local(icefall, 'timber', palette.timber[0], x, y - .43, .67, .14, 1.05, .18);
    local(icefall, 'bronze', palette.bronze[2], x, y + .25, .68, .59, .09, .14);
  }
  for (let i = 0; i < 130; i++) {
    const x = -6.75 + ((i * 29) % 127) / 127 * 13.5;
    const y = 1.2 + ((i * 73) % 127) / 127 * 37;
    local(icefall, 'snow', palette.snow[2], x, y, .55, .055 + (i % 3) * .027,
      .07 + (i % 4) * .022, .048);
  }
  local(icefall, 'stone', palette.stone[0], 0, -.35, 1.58, 17.4, .35, 3.1);
  // R3: the native review found that the dark approach hillside hid the
  // bottom four metres of the 40 m icefall. A real raised viewing approach
  // now bridges that difference instead of cheating the first-person camera.
  walkable.push({ site: icefall, width: 4.0, depth: 6.2, height: icefall.height + .12 });
  const iceFarZ = 10.4;
  const iceFar = orient(icefall, 0, iceFarZ);
  const iceFarHeight = groundAt(iceFar.east, iceFar.north);
  if (iceFarHeight === undefined) throw new RangeError('Icefall landing has no P-1 ground');
  connectors.push({ site: icefall, farZ: iceFarZ, farHeight: iceFarHeight });
  const iceStairAt = (z: number) => icefall.height + .065 +
    (iceFarHeight - icefall.height - .065) * Math.max(0, Math.min(1, (z - 2.72) / (iceFarZ - 2.72)));
  for (let stair = 0; stair < 21; stair++) {
    const z = 2.99 + stair * .36;
    if (z > iceFarZ) break;
    const level = iceStairAt(z);
    local(icefall, 'timber', palette.timber[stair % 3]!,
      0, level - icefall.height - .06, z, 2.72, .14, .37);
    for (const side of [-1, 1]) {
      const support = orient(icefall, side * 1.2, z);
      const base = groundAt(support.east, support.north);
      if (base !== undefined && level > base) {
        local(icefall, 'stone', palette.stone[stair % 3]!, side * 1.2,
          (level + base) / 2 - icefall.height, z,
          .35, level - base + .07, .33);
      }
      if (stair % 5 === 0) {
        local(icefall, 'timber', palette.timber[0], side * 1.55,
          level + .5 - icefall.height, z, .17, 1.12, .16);
        local(icefall, 'bronze', palette.bronze[1], side * 1.55,
          level + 1.0 - icefall.height, z, .20, .13, .18);
      }
    }
  }
  for (const side of [-1, 1]) {
    for (let section = 0; section < 3; section++) {
      const z = 3.0 + section * 2.5;
      local(icefall, 'timber', palette.timber[0], side * 1.55,
        iceStairAt(z) + 1.03 - icefall.height, z + 1.25,
        .17, .13, 2.62);
    }
    // Dark rock framed ice, not one flat single-material glazed sheet.
    for (let tier = 0; tier < 42; tier++) {
      const height = tier * .94;
      const x = side * (8.05 + .35 * Math.sin(tier * .41));
      local(icefall, 'rock', palette.rock[(tier + (side > 0 ? 1 : 0)) % 4]!,
        x, height + .47, -.79 + .12 * (tier % 4),
        1.18 + .22 * (tier % 3), .96, 1.33);
      if (tier % 7 === 1) {
        local(icefall, 'snow', palette.snow[tier % 3]!, x, height + .99,
          -.39, 1.19, .12, 1.31);
      }
    }
  }
  // The actual deck is accessible from the stair and supports the viewer.
  local(icefall, 'timber', palette.timber[0], 0, .04, 2.25, 4.12, .18, 3.30);
  for (const x of [-2.02, 2.02]) {
    for (const z of [1.20, 3.1]) {
      local(icefall, 'timber', palette.timber[0], x, .70, z, .20, 1.40, .20);
      local(icefall, 'bronze', palette.bronze[0], x, 1.31, z, .27, .14, .27);
    }
    local(icefall, 'timber', palette.timber[1], x, 1.1, 2.15,
      .16, .17, 2.15);
  }
  light(icefall, -4.5, 2.5, 2.4, '#7db5ce', 1.6, 11);

  // R1: twelve middle-distance black rock and bronze strata ensembles,
  // all placed outside the swept 3 m P-3 walk.
  const towerFractions = [.09, .16, .23, .30, .39, .46, .53, .60, .68, .76, .85, .93];
  const towerHeights = [6, 8, 11, 14, 7, 13, 9, 17, 12, 18, 15, 10];
  for (const [index, fraction] of towerFractions.entries()) {
    const site = selectOffTrail('expedition-rock-towers-' + (index + 1), 'stone-towers',
      trail, groundAt, fraction, 26, 15, 25);
    sites.push(site);
    for (let tower = 0; tower < 4; tower++) {
      const x = (tower % 2 ? -1 : 1) * (3.1 + tower * .43);
      const z = (tower - 1.5) * 3.15;
      const base = groundAt(orient(site, x, z).east, orient(site, x, z).north) ?? site.height;
      const height = towerHeights[index]! * (.55 + (tower % 3) * .225);
      const layers = Math.round(height * 2);
      for (let layer = 0; layer < layers; layer++) {
        const taper = Math.max(.48, 1.85 - layer / layers * 1.3);
        const shift = Math.sin(tower * 3.71 + layer * .27) * .24;
        const tint = palette.rock[(index + tower + Math.floor(layer / 4)) % 4]!;
        local(site, 'rock', tint, x + shift, base - site.height + (layer + .5) * height / layers,
          z, taper, height / layers + .018, taper * .89);
        if (layer % 7 === 2) local(site, 'bronze', palette.bronze[0], x + shift,
          base - site.height + (layer + .5) * height / layers, z + taper * .44,
          taper * .94, .12, .09);
      }
      local(site, 'snow', palette.snow[0], x, base - site.height + height + .12, z, .67, .16, .61);
    }
  }

  // R2: upper summit landmark keeps the original hut, registry and lookout
  // clear while completing the world silhouette of prayer banners and stonework.
  const summitSpot = { id: 'expedition-summit-flag', kind: 'summit-flag',
    east: 41, north: 1018, height: groundAt(41, 1018)!, yaw: 0,
    trail: { east: 40, north: 982, height: 800 }, distanceToTrail: 36,
  } as const satisfies SummitExpeditionSite;
  sites.push(summitSpot);
  for (let ring = 0; ring < 20; ring++) {
    const theta = 2 * Math.PI * ring / 20;
    local(summitSpot, 'stone', palette.stone[ring % 4]!, Math.cos(theta) * 3.6,
      .26 + .04 * (ring % 3), Math.sin(theta) * 3.6, .73, .52, .73);
  }
  local(summitSpot, 'timber', palette.timber[0], 0, 5.6, 0, .39, 11.2, .40);
  local(summitSpot, 'bronze', palette.bronze[2], 0, 11.34, 0, .63, .30, .63);
  for (let index = 0; index < 5; index++) {
    const y = 6.4 + index * .91;
    local(summitSpot, 'cloth', palette.cloth[index]!, 1.37, y, .17,
      2.62, .47, .09);
    local(summitSpot, 'bronze', palette.bronze[1], .16, y + .12, .17,
      .24, .16, .17);
  }
  local(summitSpot, 'stone', palette.stone[0], -1.25, .26, -1.6, .80, .50, .79);
  local(summitSpot, 'bronze', palette.bronze[1], -1.25, .61, -1.6, .37, .22, .37);

  // R2: every 66–78 m the long path obtains a small *cluster*, not one bare
  // isolated marker. This keeps the near-trail visual rhythm legible.
  for (let i = 34; i < trail.length - 45; i += 72) {
    const before = trail[i - 3]!, here = trail[i]!, after = trail[i + 3]!;
    const len = Math.hypot(after.east - before.east, after.north - before.north);
    if (len < .1) continue;
    const normalEast = -(after.north - before.north) / len;
    const normalNorth = (after.east - before.east) / len;
    const side = (Math.floor(i / 72) % 2) ? -1 : 1;
    const east = here.east + normalEast * 4.1 * side;
    const north = here.north + normalNorth * 4.1 * side;
    const h = groundAt(east, north);
    if (h === undefined || !Number.isFinite(h) || nearestTrailDistance(east, north, trail) < 3) continue;
    const marker: SummitExpeditionSite = {
      id: 'expedition-waymark-' + i, kind: 'waymark', east, north, height: h,
      yaw: Math.atan2(here.east - east, -(here.north - north)),
      trail: { ...here }, distanceToTrail: 4.1,
    };
    sites.push(marker);
    local(marker, 'rock', palette.rock[1], 0, .17, 0, .70, .34, .76);
    local(marker, 'stone', palette.stone[2], 0, .85, 0, .39, 1.13, .43);
    local(marker, 'bronze', palette.bronze[1], 0, 1.54, 0, .49, .18, .49);
    local(marker, 'cloth', palette.cloth[(i / 72 | 0) % 5]!, .32, 1.46, 0, .58, .29, .055);
    for (let pebble = 0; pebble < 3; pebble++) {
      const x = -1.08 + pebble * .92;
      const z = -.87 + pebble % 2 * .60;
      const p = orient(marker, x, z);
      const foot = groundAt(p.east, p.north);
      if (foot !== undefined) local(marker, 'rock', palette.rock[pebble]!, x, foot - h + .16,
        z, .47, .30, .43);
    }
  }

  // R3: shared instancing. Multiple color variants of each family are one draw
  // via instanceColor rather than a draw per rock, slab or roof tile.
  const geometry = new BoxGeometry(1, 1, 1);
  const colour = new Color();
  const transform = new Object3D();
  const meshes: InstancedMesh[] = [];
  for (const family of families) {
    const familyPieces = pieces.filter(part => part.family === family);
    if (!familyPieces.length) continue;
    const material = family === 'ember'
      ? new MeshBasicMaterial({ color: '#ffffff' })
      : new MeshLambertMaterial({ color: '#ffffff',
        ...(family === 'ice' ? { transparent: true, opacity: .84 } : {}) });
    material.name = 'expedition-' + family;
    const instances = new InstancedMesh(geometry, material, familyPieces.length);
    instances.name = 'expedition-batch-' + family;
    for (const [index, part] of familyPieces.entries()) {
      transform.position.set(part.east, part.height, -part.north);
      transform.rotation.set(0, part.yaw, 0);
      transform.scale.set(part.width, part.tall, part.depth);
      transform.updateMatrix();
      instances.setMatrixAt(index, transform.matrix);
      instances.setColorAt(index, colour.set(part.tint));
    }
    instances.computeBoundingSphere();
    group.add(instances);
    meshes.push(instances);
  }

  let disposed = false;
  const activeSiteNames = ['避风窝棚·云海岗', '避风窝棚·瀑顶岗',
    '守天哨遗址', '折光冰瀑', '峰顶经幡石圈'];
  return {
    group,
    sites: sites.map(site => ({ ...site, trail: { ...site.trail } })) as readonly SummitExpeditionSite[],
    siteNames: [...shelterNames, ...activeSiteNames.slice(2)],
    lights,
    pieceCount: pieces.length,
    drawBudget: meshes.length,
    familyCounts: Object.freeze(Object.fromEntries(families.map(family =>
      [family, pieces.filter(part => part.family === family).length]))),
    contact: contact.map(c => ({ ...c })) as readonly ContactBox[],
    /** Roofs aren't walk surfaces. Shelter interiors and connector steps are. */
    surfaceAt(east: number, north: number, radius = .27): number | undefined {
      if (![east, north, radius].every(Number.isFinite) || radius < 0 || radius > .5) return;
      for (const floor of walkable) {
        const dx = east - floor.site.east, dn = north - floor.site.north;
        const x = dx * Math.cos(floor.site.yaw) + dn * Math.sin(floor.site.yaw);
        const z = dx * Math.sin(floor.site.yaw) - dn * Math.cos(floor.site.yaw);
        if (Math.abs(x) <= floor.width / 2 - radius && Math.abs(z) <= floor.depth / 2 - radius) return floor.height;
      }
      for (const link of connectors) {
        const dx = east - link.site.east, dn = north - link.site.north;
        const x = dx * Math.cos(link.site.yaw) + dn * Math.sin(link.site.yaw);
        const z = dx * Math.sin(link.site.yaw) - dn * Math.cos(link.site.yaw);
        if (Math.abs(x) <= .89 - radius && z >= 2.91 && z <= link.farZ) {
          return link.site.height + .065 + (link.farHeight - link.site.height - .065) *
            Math.max(0, Math.min(1, (z - 2.72) / (link.farZ - 2.72)));
        }
      }
    },
    blocked(east: number, north: number, feet: number, radius: number, bodyHeight: number) {
      return contact.some(solid => {
        if (feet + bodyHeight <= solid.base + .02 || feet >= solid.top - .02) return false;
        const de = east - solid.site.east, dn = north - solid.site.north;
        const x = de * Math.cos(solid.site.yaw) + dn * Math.sin(solid.site.yaw);
        const z = de * Math.sin(solid.site.yaw) - dn * Math.cos(solid.site.yaw);
        return Math.abs(x - solid.x) < solid.width / 2 + radius &&
          Math.abs(z - solid.z) < solid.depth / 2 + radius;
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const instance of meshes) {
        instance.dispose();
        (instance.material as MeshLambertMaterial).dispose();
      }
      geometry.dispose();
      group.removeFromParent();
      group.clear();
    },
  };
}
