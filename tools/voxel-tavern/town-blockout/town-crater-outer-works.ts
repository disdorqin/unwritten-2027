import {
  BoxGeometry, BufferGeometry, Color, ConeGeometry, CylinderGeometry,
  DataTexture, DodecahedronGeometry, Group, Mesh, MeshStandardMaterial,
  NearestFilter, PointLight, SRGBColorSpace, TorusGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { mountWestCraterRoad } from './town-za22-crater-road';

type CraterRoad = Pick<ReturnType<typeof mountWestCraterRoad>, 'anchor' | 'heightAt'>;
export type CraterOuterSite = Readonly<{
  id: string; east: number; north: number; height: number; radius: number;
  topHeight?: number;
}>;

const palette = {
  stone: '#8a8378', stoneDark: '#5d564c', ochre: '#a98a56', earth: '#5d4630',
  timberLight: '#a36b48', pine: '#44503c', night: '#2c3648', snow: '#e8ecf0',
  ember: '#e08a3c', windowWarm: '#ffa455', crystal: '#7fd4c8', rust: '#8a4a34',
  slate: '#4b5066', brass: '#c68d4d',
} as const;

function pixelMaterial(base: string, shade: string, seed: number, accent = shade) {
  const tones = [base, shade, accent].map(color => Number.parseInt(color.slice(1), 16));
  const size = 16;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const grain = (Math.imul(x + 11, 733) ^ Math.imul(y + 13, 199) ^ seed) & 15;
      const crack = (2 * y + x + Math.floor(x / 4)) % 17 === 0;
      const tone = tones[crack ? 2 : Number(grain < 4)];
      data.set([tone >>> 16, (tone >>> 8) & 255, tone & 255, 255], 4 * (y * size + x));
    }
  }
  const map = new DataTexture(data, size, size);
  map.magFilter = map.minFilter = NearestFilter;
  map.colorSpace = SRGBColorSpace;
  map.needsUpdate = true;
  return new MeshStandardMaterial({ map, roughness: 1 });
}

function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const d2r = (deg: number) => deg * Math.PI / 180;

/** Narrow-gauge corridor reserved for mainline 3: station (105°) along the belt's
 * inner edge to the smelter door (207°). Nothing in this module may intrude. */
export const craterBeltTrackCorridor: readonly (readonly [number, number])[] = [
  [100, 80], [120, 79], [140, 79], [150, 81.5], [160, 84], [176, 84], [190, 80], [207, 80],
];

/**
 * Crater outer works (mainline 2a industrial belt + 2b three-layer isolation and
 * outer-band retrofit; crater book revisions 1–3 + the tower ruling):
 * the salvage era's plant cluster built "as on the day work stopped", the town-era
 * rammed-earth wall across the approach valley, the full iron fence ring on the
 * works boundary, and the three stone-iron defense towers. Ground is sampled from
 * the road's heightAt everywhere; gates stand open or are guarded by people —
 * nothing here is a collision wall.
 */
export function buildCraterOuterWorks(road: CraterRoad) {
  const { anchor, heightAt } = road;
  const group = new Group();
  group.name = 'crater-outer-works';
  const sites: CraterOuterSite[] = [];

  const stone = pixelMaterial(palette.stone, palette.stoneDark, 43, palette.earth);
  const stoneDark = pixelMaterial(palette.stoneDark, palette.night, 89, palette.stone);
  const concrete = pixelMaterial('#9a958a', palette.stoneDark, 97, palette.stone);
  const earthWall = pixelMaterial('#a98a56', palette.earth, 31, palette.stone);
  const timber = pixelMaterial(palette.earth, palette.night, 29, palette.stone);
  const timberWarm = pixelMaterial(palette.ochre, palette.earth, 67, palette.timberLight);
  const slate = pixelMaterial(palette.slate, palette.night, 139, palette.stone);
  const iron = pixelMaterial(palette.night, palette.rust, 157, palette.earth);
  const rustIron = pixelMaterial(palette.rust, palette.night, 181, palette.earth);
  const corrugated = pixelMaterial('#6a7076', palette.rust, 191, palette.night);
  const snow = pixelMaterial(palette.snow, palette.stone, 199);
  const dark = new MeshStandardMaterial({ color: 0x14100d, roughness: 1 });
  const ore = new MeshStandardMaterial({ color: 0x3d3a44, roughness: .95, flatShading: true });
  const slag = new MeshStandardMaterial({ color: 0x2e2c30, roughness: 1, flatShading: true });
  const brass = new MeshStandardMaterial({ color: palette.brass, roughness: .45, metalness: .65 });
  const glow = new MeshStandardMaterial({
    color: palette.windowWarm, emissive: palette.ember, emissiveIntensity: 1.25, roughness: .8,
  });

  const batches = new Map<MeshStandardMaterial, BufferGeometry[]>();
  function part(mat: MeshStandardMaterial, geo: BufferGeometry, east: number, h: number, north: number,
    yaw = 0, pitch = 0, roll = 0) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (roll) g.rotateZ(roll);
    if (pitch) g.rotateX(pitch);
    if (yaw) g.rotateY(yaw);
    g.translate(east, h, -north);
    const batch = batches.get(mat) ?? [];
    batch.push(g);
    batches.set(mat, batch);
    if (g !== geo) geo.dispose();
  }
  function box(mat: MeshStandardMaterial, east: number, h: number, north: number,
    sx: number, sy: number, sz: number, yaw = 0, pitch = 0, roll = 0) {
    part(mat, new BoxGeometry(sx, sy, sz), east, h, north, yaw, pitch, roll);
  }
  function cyl(mat: MeshStandardMaterial, east: number, h: number, north: number,
    rTop: number, rBottom: number, height: number, segments = 10, yaw = 0, pitch = 0, roll = 0) {
    part(mat, new CylinderGeometry(rTop, rBottom, height, segments), east, h, north, yaw, pitch, roll);
  }
  function cone(mat: MeshStandardMaterial, east: number, h: number, north: number,
    r: number, height: number, segments = 9, yaw = 0, pitch = 0, roll = 0) {
    part(mat, new ConeGeometry(r, height, segments), east, h, north, yaw, pitch, roll);
  }

  function site(id: string, bearingDeg: number, radius: number, clear: number, topHeight?: number) {
    const b = d2r(bearingDeg);
    const east = anchor.east + radius * Math.sin(b);
    const north = anchor.north + radius * Math.cos(b);
    const height = heightAt(east, north);
    if (height === undefined) return undefined;
    const found: CraterOuterSite = { id, east, north, height, radius: clear, topHeight };
    sites.push(found);
    return found;
  }
  function siteAt(id: string, east: number, north: number, clear: number, topHeight?: number) {
    const height = heightAt(east, north);
    if (height === undefined) return undefined;
    const found: CraterOuterSite = { id, east, north, height, radius: clear, topHeight };
    sites.push(found);
    return found;
  }

  /** Local frame: +dz toward the facing bearing, +dx to the right of it. */
  function frame(origin: { east: number; north: number; height: number }, faceDeg: number) {
    const f = d2r(faceDeg);
    const fwd = { e: Math.sin(f), n: Math.cos(f) };
    const right = { e: Math.cos(f), n: -Math.sin(f) };
    return {
      yaw: Math.PI - f,
      at(dx: number, dz: number) {
        return {
          east: origin.east + right.e * dx + fwd.e * dz,
          north: origin.north + right.n * dx + fwd.n * dz,
        };
      },
    };
  }

  // ================= 2a · industrial belt （停工那一天） =================

  // ---------- smelter plant (bearing 207°, main hall 28 m + blast-furnace tower) ----------
  const smelter = site('smelter-plant', 207, 88, 17, 19);
  if (smelter) {
    const fr = frame(smelter, 207 + 180);
    const g = smelter.height;
    const put = (mat: MeshStandardMaterial, dx: number, h: number, dz: number,
      sx: number, sy: number, sz: number, pitch = 0, roll = 0) => {
      const p = fr.at(dx, dz);
      box(mat, p.east, h, p.north, sx, sy, sz, fr.yaw, pitch, roll);
    };
    // Yard pad and hall: stone base, corrugated walls, timber posts, slate gable.
    const pad = fr.at(0, 0);
    cyl(stoneDark, pad.east, g + .07, pad.north, 19.5, 20.5, .14, 4, fr.yaw);
    put(stone, 0, g + .6, 0, 28, 1.2, 11);
    put(corrugated, 0, g + 5.1, 0, 28, 7.8, 11);
    for (const dx of [-13.5, -6.75, 0, 6.75, 13.5]) put(timber, dx, g + 5.1, 5.45, .45, 7.8, .3);
    put(slate, -7.05, g + 10.6, 0, 14.6, .28, 12.6, 0, .5);
    put(slate, 7.05, g + 10.6, 0, 14.6, .28, 12.6, 0, -.5);
    put(timber, 0, g + 12.3, 0, 28.6, .4, .5);
    // Cold furnace mouth on the yard face: dark arch inset, iron door ajar.
    put(dark, -4, g + 2.2, 5.56, 3.4, 4.4, .18);
    const doorP = fr.at(-2.1, 5.75);
    box(iron, doorP.east, g + 2.1, doorP.north, 1.7, 4.2, .14, fr.yaw + .5);
    // Tall brick chimney, cold.
    put(rustIron, 10.5, g + 9.5, -2, 1.5, 13, 1.5);
    put(stoneDark, 10.5, g + 16.2, -2, 1.9, .5, 1.9);
    // Ingot stacks and crates left where the last shift dropped them.
    for (let s = 0; s < 3; s++) {
      for (let layer = 0; layer < 3 - s; layer++) {
        for (let i = 0; i < 4 - layer; i++) {
          put(iron, 6 + s * 2.6, g + .45 + layer * .62, 9.5, 1.9, .55, .8);
        }
      }
    }
    put(timberWarm, -9, g + .8, 9, 1.6, 1.6, 1.6);
    put(timberWarm, -7.2, g + .7, 9.4, 1.4, 1.4, 1.4, 0, .2);
    // Blast-furnace tower, independent at the west end: tapered iron stack, cold mouth.
    const bf = fr.at(-19.5, 0);
    cyl(rustIron, bf.east, g + 5, bf.north, 1.9, 2.7, 10, 12);
    cyl(iron, bf.east, g + 10.3, bf.north, 2.15, 2.15, .6, 12);
    const bfDoor = fr.at(-19.5, 2.55);
    box(dark, bfDoor.east, g + 1.1, bfDoor.north, 1.6, 2.2, .2, fr.yaw);
    cone(slag, fr.at(-19.5, 6.5).east, g + 1.1, fr.at(-19.5, 6.5).north, 3.4, 2.2, 10);
    cone(slag, fr.at(-24, -5).east, g + .9, fr.at(-24, -5).north, 2.8, 1.8, 10);
    // Hand cart, handles down, mid-yard.
    const cart = fr.at(2, 8);
    box(timber, cart.east, g + .75, cart.north, 1.7, .18, 1.05, fr.yaw);
    for (const s of [-1, 1]) {
      const w = fr.at(2 + s * .95, 8);
      cyl(iron, w.east, g + .42, w.north, .42, .42, .12, 10, fr.yaw, Math.PI / 2);
    }
  }

  // ---------- instrument plant (bearing 127°, two-storey, tall chimney, water tower) ----------
  const instrument = site('instrument-plant', 127, 88, 14, 17.5);
  if (instrument) {
    const fr = frame(instrument, 127 + 180);
    const g = instrument.height;
    const put = (mat: MeshStandardMaterial, dx: number, h: number, dz: number,
      sx: number, sy: number, sz: number, pitch = 0, roll = 0) => {
      const p = fr.at(dx, dz);
      box(mat, p.east, h, p.north, sx, sy, sz, fr.yaw, pitch, roll);
    };
    const pad = fr.at(0, 0);
    cyl(stoneDark, pad.east, g + .07, pad.north, 15, 16, .14, 4, fr.yaw);
    put(stone, 0, g + 2.1, 0, 20, 4.2, 10);
    put(timberWarm, 0, g + 6.3, 0, 20, 4.2, 10);
    put(slate, -5.05, g + 9.6, 0, 10.6, .26, 11.4, 0, .48);
    put(slate, 5.05, g + 9.6, 0, 10.6, .26, 11.4, 0, -.48);
    // Two rows of dark windows; two boarded up.
    for (const dx of [-8, -4.8, -1.6, 1.6, 4.8, 8]) {
      put(dark, dx, g + 2.6, 5.03, 1.7, 1.9, .1);
      put(dark, dx, g + 6.8, 5.03, 1.7, 1.7, .1);
    }
    for (const dx of [-4.8, 4.8]) {
      put(timber, dx, g + 6.8, 5.12, 1.9, .28, .08, 0, .6);
      put(timber, dx, g + 6.8, 5.12, 1.9, .28, .08, 0, -.6);
    }
    // Chimney twice the ridge height above the roof.
    put(rustIron, -8, g + 11, -2, 1.1, 13, 1.1);
    put(stoneDark, -8, g + 17.7, -2, 1.5, .45, 1.5);
    // Loading platform, crates, and a burst instrument crate spilling brass parts.
    put(stone, 0, g + .45, 6.8, 8, .9, 2.6);
    put(timberWarm, 2.5, g + 1.6, 6.8, 1.5, 1.5, 1.5);
    put(timber, -2.8, g + 1.35, 7.1, 1.3, 1.1, 1.3, 0, .35);
    for (let i = 0; i < 5; i++) {
      const p = fr.at(-3.6 + hash(i * 3) * 1.6, 8 + hash(i * 7) * .8);
      box(brass, p.east, g + 1.05, p.north, .34, .22, .34, hash(i) * 3);
    }
    // Water tower: four legs, tank, cone cap.
    const wt = fr.at(15.5, -1);
    for (const [lx, lz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) {
      const p = fr.at(15.5 + lx, -1 + lz);
      box(timber, p.east, g + 3.4, p.north, .32, 6.8, .32, fr.yaw, lz > 0 ? .06 : -.06, lx > 0 ? -.06 : .06);
    }
    cyl(corrugated, wt.east, g + 8.4, wt.north, 2.3, 2.3, 3.2, 12);
    cone(slate, wt.east, g + 10.9, wt.north, 2.7, 1.8, 12);
  }

  // ---------- ore yard (bearing 186°): piles, sorting shed, small derrick ----------
  const yard = site('ore-yard', 186, 86, 11, 8);
  if (yard) {
    const fr = frame(yard, 186 + 180);
    const g = yard.height;
    const put = (mat: MeshStandardMaterial, dx: number, h: number, dz: number,
      sx: number, sy: number, sz: number, pitch = 0, roll = 0) => {
      const p = fr.at(dx, dz);
      box(mat, p.east, h, p.north, sx, sy, sz, fr.yaw, pitch, roll);
    };
    const piles: [number, number, number, number][] = [[-6, -2, 3.6, 2.6], [-1, 3.5, 2.8, 2], [4.5, -3, 3.1, 2.2], [8, 2.5, 2.2, 1.5]];
    for (const [dx, dz, r, h] of piles) {
      const p = fr.at(dx, dz);
      cone(ore, p.east, g + h / 2, p.north, r, h, 10);
    }
    // Sorting shed: four posts, flat roof, sorted boxes beneath.
    for (const [px, pz] of [[-2.6, -2.2], [2.6, -2.2], [-2.6, 2.2], [2.6, 2.2]]) {
      put(timber, -8 + px, g + 1.5, -6 + pz, .26, 3, .26);
    }
    put(corrugated, -8, g + 3.2, -6, 6.4, .22, 5.6);
    put(snow, -8, g + 3.42, -6, 6.2, .16, 5.4);
    for (let i = 0; i < 3; i++) put(timberWarm, -9.4 + i * 1.5, g + .55, -6, 1.25, 1.1, 1.25);
    // Derrick: two A-frames, crossbeam, hook hanging over the yard.
    for (const s of [-1, 1]) {
      const p = fr.at(7 + s * 2.2, -6);
      box(timber, p.east, g + 2.6, p.north, .3, 5.6, .3, fr.yaw, 0, s * .38);
    }
    const beam = fr.at(7, -6);
    box(timber, beam.east, g + 5.2, beam.north, 5.6, .34, .34, fr.yaw);
    const hook = fr.at(7, -6);
    box(iron, hook.east, g + 3.9, hook.north, .1, 1.1, .1, fr.yaw);
    part(iron, new TorusGeometry(.3, .06, 5, 10), hook.east, g + 3.2, hook.north, fr.yaw);
    // Loose ore chunks scattered at the pile feet.
    for (let i = 0; i < 14; i++) {
      const p = fr.at(-8 + hash(i * 13 + 1) * 17, -5 + hash(i * 7 + 3) * 10);
      const s = .3 + hash(i * 5) * .5;
      part(ore, new DodecahedronGeometry(s, 0), p.east, g + s * .4, p.north, hash(i) * 3);
    }
  }

  // ---------- salvage-era ruins layer （修订一 §五） ----------
  const shedRuins = site('ruined-shed', 196, 94, 6, 4);
  if (shedRuins) {
    const fr = frame(shedRuins, 196 + 180);
    const g = shedRuins.height;
    const put = (mat: MeshStandardMaterial, dx: number, h: number, dz: number,
      sx: number, sy: number, sz: number, pitch = 0, roll = 0) => {
      const p = fr.at(dx, dz);
      box(mat, p.east, h, p.north, sx, sy, sz, fr.yaw, pitch, roll);
    };
    put(corrugated, 0, g + 1.3, -2.4, 5.4, 2.6, .14);
    put(corrugated, -2.65, g + 1.3, 0, .14, 2.6, 4.8);
    put(corrugated, 2.65, g + 1.05, 0, .14, 2.1, 4.8);
    // Roof half-collapsed: one end still on the walls, the other on the ground.
    put(corrugated, 0, g + 2.1, .4, 5.8, .16, 5.6, .62);
    put(timberWarm, -1, g + .6, .5, 1.3, 1.2, 1.3, 0, .2);
    put(timber, 1.2, g + .5, -.8, 1.1, 1, 1.1);
  }
  // Rusted pipe sections east of the smelter, one half-buried.
  for (let i = 0; i < 3; i++) {
    const p = site(`pipe-section-${i + 1}`, 198 + i * 2.2, 97 + (i % 2) * 3, 3);
    if (!p) continue;
    cyl(rustIron, p.east, p.height + (i === 1 ? .35 : .8), p.north, .85, .85, 5.2, 12, d2r(198 + i * 2.2) + Math.PI / 2, 0, Math.PI / 2);
  }
  // Concrete foundation stubs along the belt's outer edge.
  for (let i = 0; i < 6; i++) {
    const b = 112 + i * 19 + hash(i * 7) * 6;
    const p = site(`foundation-stub-${i + 1}`, b, 101 + hash(i * 3) * 6, 2.5);
    if (!p) continue;
    const s = 1.6 + hash(i * 11) * 1.8;
    box(concrete, p.east, p.height + .3 + hash(i) * .3, p.north, s, .6 + hash(i * 5) * .7, s * .8, hash(i * 13) * 3);
  }

  // ================= 2b · three-layer isolation + outer band =================

  // ---------- layer 1: the town-era rammed-earth wall across the approach valley ----------
  const wallEast = -18, wallGateNorth = 159;
  siteAt('wall-south-end', wallEast, 10, 3);
  siteAt('wall-gate', wallEast, wallGateNorth, 3.4);
  siteAt('wall-north-end', wallEast, 310, 3);
  for (let n = 13; n <= 307; n += 6) {
    if (Math.abs(n - wallGateNorth) < 4.2) continue;
    const g = heightAt(wallEast, n);
    if (g === undefined) continue;
    box(stone, wallEast, g + .6, n, 1.5, 1.2, 6.15);
    box(earthWall, wallEast, g + 3, n, 1.15, 3.6, 6.15);
    box(stoneDark, wallEast, g + 5.15, n, 1.45, .7, 6.3);
    box(snow, wallEast, g + 5.56, n, 1.3, .12, 6.2);
  }
  {
    // Gate frame and two leaves standing open — the guard turns you back, not the door.
    const g = heightAt(wallEast, wallGateNorth);
    if (g !== undefined) {
      for (const s of [-1, 1]) {
        box(stone, wallEast, g + 3.1, wallGateNorth + s * 3.4, 1.7, 6.2, 1.1);
        const leafN = wallGateNorth + s * 2.2;
        box(timber, wallEast - 1.1, g + 2.2, leafN, .14, 4.4, 2.7, s * .85);
        box(iron, wallEast - 1.1, g + 3.4, leafN, .18, .3, 2.7, s * .85);
      }
      box(timber, wallEast, g + 6.35, wallGateNorth, 1.2, .45, 8.2);
    }
  }
  // Gatehouse: enterable stone-and-timber hut on the town side of the gate, door to the road.
  const gatehouse = siteAt('gatehouse', -13, 150.5, 4);
  if (gatehouse) {
    const fr = frame(gatehouse, 90);
    const g = gatehouse.height;
    const put = (mat: MeshStandardMaterial, dx: number, h: number, dz: number,
      sx: number, sy: number, sz: number, pitch = 0, roll = 0) => {
      const p = fr.at(dx, dz);
      box(mat, p.east, h, p.north, sx, sy, sz, fr.yaw, pitch, roll);
    };
    put(stone, 0, g + .5, 0, 5, 1, 4);
    put(timber, 0, g + 2.2, -1.93, 5, 2.6, .16);
    put(timber, -2.43, g + 2.2, 0, .16, 2.6, 4);
    put(timber, 2.43, g + 2.2, 0, .16, 2.6, 4);
    put(timber, -1.55, g + 2.2, 1.93, 1.75, 2.6, .16);
    put(timber, 1.85, g + 2.2, 1.93, 1.15, 2.6, .16);
    put(timber, .15, g + 3.35, 1.93, 2.25, .35, .16);
    put(slate, 0, g + 4.35, -1.05, 5.7, .2, 2.6, .5);
    put(slate, 0, g + 4.35, 1.05, 5.7, .2, 2.6, -.5);
    // Interior: table, bench, duty board; lamp by the door.
    put(timberWarm, 0, g + 1.35, -.6, 1.7, .12, .9);
    put(timber, -.8, g + 1.3, .6, 1.5, .1, .45);
    const lampP = fr.at(1.4, 2.6);
    box(timber, lampP.east, g + 1, lampP.north, .14, 2, .14);
    box(glow, lampP.east, g + 2.15, lampP.north, .3, .38, .3);
    box(iron, lampP.east, g + 2.42, lampP.north, .44, .08, .44);
  }

  // ---------- layer 2: the full iron fence ring on the works boundary ----------
  const fencePosts: { bearing: number; radius: number }[] = [];
  {
    const gaps: [number, number][] = [[18, 24], [283, 289]];
    const stationGap: [number, number] = [102, 109];
    const inZone = (b: number, z: [number, number]) => b >= z[0] && b <= z[1];
    const ringRadius = (b: number) => {
      if (b >= 108 && b < 142) return 102;
      if (b >= 142 && b < 146) return 102 - (b - 142) / 4 * 12;
      if (b >= 184 && b < 190) return 90 + (b - 184) / 6 * 14;
      if (b >= 190 && b < 224) return 104;
      if (b >= 224 && b < 230) return 104 - (b - 224) / 6 * 7;
      return 97;
    };
    let prev: { b: number; east: number; north: number; h: number } | undefined;
    for (let b = 0; b < 360; b += 2) {
      if (b >= 146 && b < 184) { prev = undefined; continue; }
      if (inZone(b, stationGap)) { prev = undefined; continue; }
      if (gaps.some(z => inZone(b, z))) { prev = undefined; continue; }
      const r = ringRadius(b);
      const rad = d2r(b);
      const east = anchor.east + r * Math.sin(rad);
      const north = anchor.north + r * Math.cos(rad);
      const h = heightAt(east, north);
      if (h === undefined) { prev = undefined; continue; }
      box(rustIron, east, h + 2.35, north, .14, 4.7, .14, -rad);
      part(rustIron, new ConeGeometry(.11, .42, 5), east, h + 4.9, north, -rad);
      fencePosts.push({ bearing: b, radius: r });
      if (prev && b - prev.b === 2) {
        const midB = d2r((b + prev.b) / 2);
        const midR = (r + ringRadius(prev.b)) / 2;
        const me = anchor.east + midR * Math.sin(midB);
        const mn = anchor.north + midR * Math.cos(midB);
        const mh = heightAt(me, mn);
        if (mh !== undefined) {
          const chord = 2 * midR * Math.sin(d2r(1)) + .15;
          for (const ry of [1.15, 2.6, 4.05]) box(rustIron, me, mh + ry, mn, chord, .12, .07, -midB);
          for (let bar = 0; bar < 4; bar++) {
            const bb = d2r(prev.b + .4 + bar * .4);
            const br = ringRadius(prev.b + .4 + bar * .4);
            const be = anchor.east + br * Math.sin(bb);
            const bn = anchor.north + br * Math.cos(bb);
            const bh = heightAt(be, bn);
            if (bh !== undefined) box(rustIron, be, bh + 2.3, bn, .07, 4.4, .07, -bb);
          }
        }
      }
      prev = { b, east, north, h };
    }
    // Fallen panels at the two collapsed gaps — passable at night, never walled.
    for (const [z0, z1] of gaps) {
      const mid = d2r((z0 + z1) / 2);
      const r = ringRadius((z0 + z1) / 2);
      const e = anchor.east + r * Math.sin(mid);
      const n = anchor.north + r * Math.cos(mid);
      const h = heightAt(e, n);
      if (h === undefined) continue;
      box(rustIron, e, h + .3, n, 3.4, .12, 1.6, -mid + .3, 0, .06);
      box(rustIron, e + 1.2, h + .18, n + .8, 3, .1, 1.4, -mid - .2, 0, -.05);
    }
    // Flanking posts at the station crossing gap.
    for (const b of [101, 110]) {
      const rad = d2r(b);
      const r = ringRadius(b);
      const e = anchor.east + r * Math.sin(rad);
      const n = anchor.north + r * Math.cos(rad);
      const h = heightAt(e, n);
      if (h === undefined) continue;
      box(iron, e, h + 2.6, n, .3, 5.2, .3, -rad);
      fencePosts.push({ bearing: b, radius: r });
    }
  }
  site('fence-station-crossing', 105.5, ringRadiusAt(105.5), 4);
  function ringRadiusAt(b: number) {
    if (b >= 108 && b < 142) return 102;
    if (b >= 190 && b < 224) return 104;
    return 97;
  }

  // ---------- layer 3: three stone-iron defense towers ----------
  function tower(origin: { east: number; north: number; height: number }, totalH: number,
    mode: 'active' | 'tilted' | 'broken-ladder', faceDeg: number) {
    const fr = frame(origin, faceDeg);
    const g = origin.height;
    const put = (mat: MeshStandardMaterial, dx: number, h: number, dz: number,
      sx: number, sy: number, sz: number, pitch = 0, roll = 0) => {
      const p = fr.at(dx, dz);
      box(mat, p.east, h, p.north, sx, sy, sz, fr.yaw, pitch, roll);
    };
    const shaftH = totalH - 2.6;
    put(stone, 0, g + shaftH * .28, 0, 3.9, shaftH * .56, 3.9);
    put(stone, 0, g + shaftH * .78, 0, 3.3, shaftH * .44, 3.3);
    for (const fy of [.3, .62, .92]) put(iron, 0, g + shaftH * fy, 0, 4, .28, 4);
    put(stoneDark, 0, g + shaftH + .25, 0, 4.7, .5, 4.7);
    for (let m = 0; m < 8; m++) {
      const a = m * Math.PI / 4;
      const p = fr.at(Math.sin(a) * 2.15, Math.cos(a) * 2.15);
      box(stone, p.east, g + shaftH + .95, p.north, .85, .85, .4, fr.yaw + a);
    }
    // Cabin on the platform; the west tower's cabin lists where its frame gave.
    const tilt = mode === 'tilted' ? .13 : 0;
    put(timber, .6, g + shaftH + 1.55, -.5, 2.3, 2.1, 2.3, 0, tilt);
    const roofP = fr.at(.6, -.5);
    part(slate, new ConeGeometry(2, 1.1, 4), roofP.east, g + shaftH + 3.15, roofP.north, fr.yaw + Math.PI / 4, 0, tilt);
    // Ladder up the crater-facing side; the gate tower's ladder ends mid-shaft.
    const ladderTop = mode === 'broken-ladder' ? .55 : 1;
    const rungs = Math.floor(shaftH * ladderTop / .45);
    for (const s of [-1, 1]) put(iron, s * .42, g + shaftH * ladderTop / 2, 2.02, .07, shaftH * ladderTop, .07);
    for (let i = 0; i < rungs; i++) put(iron, 0, g + .3 + i * .45, 2.02, .9, .06, .06);
    if (mode === 'broken-ladder') {
      const fallen = fr.at(1.6, 3.4);
      box(iron, fallen.east, g + .25, fallen.north, .85, .08, 3.4, fr.yaw + .4, 0, .04);
    }
    if (mode === 'active') {
      const lampP = fr.at(-1.7, 1.7);
      box(iron, lampP.east, g + shaftH + 1.5, lampP.north, .1, 2, .1);
      box(glow, lampP.east, g + shaftH + 2.6, lampP.north, .34, .42, .34);
      const light = new PointLight(new Color(palette.ember), 14, 32, 2);
      light.position.set(lampP.east, g + shaftH + 2.6, -lampP.north);
      group.add(light);
    }
  }
  const northTower = site('north-tower', 358, 67.5, 4, 13.5);
  if (northTower) tower(northTower, 13.5, 'active', 358 + 180);
  const westTower = site('west-tower', 262, 64, 4, 12.5);
  if (westTower) tower(westTower, 12.5, 'tilted', 262 + 180);
  const gateTower = siteAt('gate-tower', -30, 174, 4, 12);
  if (gateTower) tower(gateTower, 12, 'broken-ladder', 90);

  // ---------- outer-band mid-ground clusters (north/west band + approach) ----------
  const clusterSpots: [number, number][] = [[232, 84], [258, 96], [288, 86], [315, 102], [340, 90], [22, 98], [48, 84], [72, 106]];
  clusterSpots.forEach(([b, r], ci) => {
    const p = site(`outer-cluster-${ci + 1}`, b, r, 7);
    if (!p) return;
    const g = p.height;
    for (let i = 0; i < 4; i++) {
      const e = p.east + (hash(ci * 31 + i * 7) - .5) * 11;
      const n = p.north + (hash(ci * 17 + i * 3) - .5) * 11;
      const h = heightAt(e, n);
      if (h === undefined) continue;
      const s = 1.2 + hash(i * 13 + ci) * 2.4;
      part(i % 2 ? stoneDark : stone, new DodecahedronGeometry(s, 0), e, h + s * .3, n, hash(i + ci) * 3);
    }
    // One or two dead pines per cluster, bare trunks leaning.
    for (let i = 0; i < 2; i++) {
      const e = p.east + (hash(ci * 7 + i * 19) - .5) * 9;
      const n = p.north + (hash(ci * 23 + i * 5) - .5) * 9;
      const h = heightAt(e, n);
      if (h === undefined) continue;
      const lean = .08 + hash(i * 3 + ci) * .12;
      cyl(timber, e, h + 3.4, n, .14, .24, 7, 7, 0, 0, lean);
      cone(timber, e, h + 6.4, n, 1.5, 2.6, 7, 0, 0, lean);
    }
  });
  for (const [e0, n0] of [[-6, 118], [-6, 208]] as const) {
    const p = siteAt(`approach-cluster-${n0}`, e0, n0, 6);
    if (!p) continue;
    for (let i = 0; i < 3; i++) {
      const e = p.east + (hash(i * 7 + n0) - .5) * 7;
      const n = p.north + (hash(i * 3 + 1) - .5) * 7;
      const h = heightAt(e, n);
      if (h === undefined) continue;
      const s = 1 + hash(i * 11) * 1.8;
      part(stone, new DodecahedronGeometry(s, 0), e, h + s * .3, n, hash(i) * 3);
    }
  }

  // ---------- merge batches ----------
  for (const [mat, geos] of batches) {
    const joined = mergeGeometries(geos.map(g => g.index ? g.toNonIndexed() : g));
    if (!joined) continue;
    joined.computeBoundingSphere();
    const mesh = new Mesh(joined, mat);
    mesh.name = `crater-outer-${(mat as MeshStandardMaterial).uuid.slice(0, 6)}`;
    group.add(mesh);
  }
  return { group, sites, fencePosts };
}
