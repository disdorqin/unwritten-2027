import {
  BoxGeometry, BufferGeometry, CylinderGeometry, DataTexture, DodecahedronGeometry,
  Group, Mesh, MeshStandardMaterial, NearestFilter, SRGBColorSpace,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { mountWestCraterRoad } from './town-za22-crater-road';

type CraterRoad = Pick<ReturnType<typeof mountWestCraterRoad>, 'anchor' | 'heightAt'>;
export type CraterDensityA2Placement = Readonly<{
  kind: 'pipe-heap' | 'crane' | 'fallen-fence' | 'moss-stone' | 'crate-stack' | 'gate-lamp';
  east: number; north: number; footprint: number;
}>;
export type CraterDensityA2Site = Readonly<{
  id: string; east: number; north: number; height: number; radius: number;
}>;

const palette = {
  stone: '#8a8378', stoneDark: '#5d564c', earth: '#5d4630', night: '#2c3648',
  snow: '#e8ecf0', ember: '#e08a3c', windowWarm: '#ffa455', rust: '#8a4a34',
  moss: '#6f7d55', mossDark: '#4c5a38', slate: '#4b5066', ochre: '#a98a56',
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

/**
 * Crater outside density backfill (A2, self-build; atlas ref-02 / ref-05 /
 * ref-11): the mid-ground clusters the references show and the mainlines left
 * thin — rusted pipe heaps, one rim crane, fallen fence at the two collapsed
 * gaps, moss-green boulders in the outer band, crate stacks at the stations,
 * and a roofed gate lamp. Scenery only, no new systems.
 *
 * Deliberate non-copies: ref-05's second lit tower stays dark (tower ruling:
 * north tower only, active); ref-11's lit plant windows stay cold (revision 2:
 * "the day work stopped"). The gate lamp is emissive only — the crater light
 * ledger (7 real lights) is unchanged; a real light here needs its own ruling.
 */
export function buildCraterDensityA2(
  road: CraterRoad,
  reserved: readonly { east: number; north: number; radius: number }[] = [],
) {
  const { anchor, heightAt } = road;
  const group = new Group();
  group.name = 'crater-density-a2';
  const sites: CraterDensityA2Site[] = [];
  const placements: CraterDensityA2Placement[] = [];

  const stone = pixelMaterial(palette.stone, palette.stoneDark, 211, palette.earth);
  const timber = pixelMaterial(palette.earth, palette.night, 29, palette.stone);
  const timberWarm = pixelMaterial(palette.ochre, palette.earth, 67, palette.earth);
  const rustIron = pixelMaterial(palette.rust, palette.night, 181, palette.earth);
  const iron = pixelMaterial(palette.night, palette.rust, 157, palette.earth);
  const moss = pixelMaterial(palette.moss, palette.mossDark, 223, palette.stone);
  const slate = pixelMaterial(palette.slate, palette.night, 139, palette.stone);
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

  function site(id: string, bearingDeg: number, radius: number, clear: number) {
    const b = d2r(bearingDeg);
    const east = anchor.east + radius * Math.sin(b);
    const north = anchor.north + radius * Math.cos(b);
    const height = heightAt(east, north);
    if (height === undefined) return undefined;
    const found: CraterDensityA2Site = { id, east, north, height, radius: clear };
    sites.push(found);
    return found;
  }
  function siteAt(id: string, east: number, north: number, clear: number) {
    const height = heightAt(east, north);
    if (height === undefined) return undefined;
    const found: CraterDensityA2Site = { id, east, north, height, radius: clear };
    sites.push(found);
    return found;
  }

  /** A cluster lands only when its centre clears every reserved keep-out. */
  function claim(kind: CraterDensityA2Placement['kind'], east: number, north: number, footprint: number) {
    const g = heightAt(east, north);
    if (g === undefined) return undefined;
    if (reserved.some(r => Math.hypot(east - r.east, north - r.north) < footprint + r.radius)) return undefined;
    placements.push({ kind, east, north, footprint });
    return g;
  }
  function claimAt(kind: CraterDensityA2Placement['kind'], bearingDeg: number, radius: number, footprint: number) {
    const b = d2r(bearingDeg);
    return claim(kind, anchor.east + radius * Math.sin(b), anchor.north + radius * Math.cos(b), footprint);
  }

  // ---------- 锈管堆 ×2（ref-02 缠堆弯管） ----------
  // Surveyed clear of the ejecta ring: (178°, 94) hit a boulder, (172°, 96) clears.
  for (const [bearing, radius, seed] of [[218, 98, 3], [172, 96, 11]] as const) {
    const g = claimAt('pipe-heap', bearing, radius, 2.6);
    if (g === undefined) continue;
    const b = d2r(bearing);
    const ce = anchor.east + radius * Math.sin(b), cn = anchor.north + radius * Math.cos(b);
    for (let i = 0; i < 5; i++) {
      const a = hash(seed + i * 3) * Math.PI;
      const dx = (hash(seed + i * 7) - .5) * 2.4, dn = (hash(seed + i * 5) - .5) * 2.4;
      const len = 2.6 + hash(seed + i * 13) * 1.8;
      cyl(rustIron, ce + dx, g + .35 + (i % 2) * .5, cn + dn, .3, .3, len, 9, a, Math.PI / 2);
    }
    cyl(rustIron, ce, g + 1.15, cn, .42, .42, 1.6, 9, hash(seed) * 3, Math.PI / 2 - .3);
  }

  // ---------- 坑沿小吊机 ×1（ref-02 锈吊钩，塌口外） ----------
  {
    const g = claimAt('crane', 291, 101, 2.2);
    if (g !== undefined) {
      const b = d2r(291);
      const ce = anchor.east + 101 * Math.sin(b), cn = anchor.north + 101 * Math.cos(b);
      const yaw = d2r(291 + 90);
      box(rustIron, ce - .9, g + 1.6, cn, .35, 3.4, .35, 0, 0, .28);
      box(rustIron, ce + .9, g + 1.6, cn, .35, 3.4, .35, 0, 0, -.28);
      box(rustIron, ce, g + 3.3, cn, 2.4, .3, .3);
      // Jib rising toward the bowl, hook hanging from its tip.
      box(rustIron, ce - 1.6, g + 4.4, cn, .3, .3, 5.2, yaw, .62);
      box(iron, ce - 3.4, g + 5.4, cn, .07, 1.4, .07);
      box(rustIron, ce - 3.4, g + 4.6, cn, .3, .42, .18);
      sites.push({ id: 'density-crane', east: ce, north: cn, height: g, radius: 2 });
    }
  }

  // ---------- 倒伏栅栏 ×2（两处塌口缺口，ref-02） ----------
  // Surveyed: the gaps themselves are occupied (outer-cluster-6 sits in gap 1,
  // the collapse sign in gap 2), so the fallen spans lie just off the gaps —
  // gap 1's span inside the ring at (21°, 86), gap 2's outside at (286°, 104).
  for (const [bearing, radius, seed] of [[21, 86, 5], [286, 104, 17]] as const) {
    const g = claimAt('fallen-fence', bearing, radius, 2.4);
    if (g === undefined) continue;
    const b = d2r(bearing);
    const ce = anchor.east + radius * Math.sin(b), cn = anchor.north + radius * Math.cos(b);
    const yaw = d2r(bearing + 90 + (hash(seed) - .5) * 20);
    for (let i = 0; i < 6; i++) {
      const off = (i - 2.5) * .55;
      box(timber, ce + Math.cos(yaw) * off, g + .16 + hash(seed + i) * .1, cn - Math.sin(yaw) * off,
        .13, .13, 2.1, yaw + (hash(seed + i * 2) - .5) * .3, 0, Math.PI / 2 - .12);
    }
    box(timber, ce, g + .34, cn, .12, .12, 3.4, yaw, 0, Math.PI / 2 - .1);
  }

  // ---------- 绿苔石簇 ×8（ref-02 灰绿圆石，外带散布） ----------
  // Surveyed: the 95° sector is pinched by the gate tower + wall, the 70–80°
  // sector by outer clusters, and (45°, 112) sits 3.3 m off the main branch;
  // the ring here reads (15°, 125°) instead.
  for (const [bearing, radius, seed] of [
    [60, 110, 21], [15, 112, 29], [125, 112, 37], [155, 112, 43],
    [200, 110, 53], [235, 105, 61], [260, 112, 71], [340, 110, 83],
  ] as const) {
    const g = claimAt('moss-stone', bearing, radius, 2.2);
    if (g === undefined) continue;
    const b = d2r(bearing);
    const ce = anchor.east + radius * Math.sin(b), cn = anchor.north + radius * Math.cos(b);
    for (let i = 0; i < 4; i++) {
      const s = .8 + hash(seed + i * 3) * 1.1;
      const dx = (hash(seed + i * 7) - .5) * 3, dn = (hash(seed + i * 5) - .5) * 3;
      part(moss, new DodecahedronGeometry(s, 0), ce + dx, g + s * .3, cn + dn, hash(seed + i) * 3);
    }
  }

  // ---------- 料箱簇 ×3（ref-05 站区密集堆） ----------
  // Surveyed: (−70, 152) sits on a rim lamp, (−146.5, 92.7) on the ruined shed.
  for (const [east, north, seed] of [[-76, 158, 91], [-92, 112, 97], [-128, 84, 103]] as const) {
    const g = claim('crate-stack', east, north, 1.8);
    if (g === undefined) continue;
    const yaw = hash(seed) * 1.2;
    for (const [dx, dn, s] of [[0, 0, 1.1], [1.15, .2, 1], [-.2, 1.1, .95]] as const) {
      box(timberWarm, east + dx, g + s / 2, north + dn, s, s, s, yaw);
    }
    box(timber, east + .55, g + 1.55, north + .6, .95, .95, .95, yaw + .4);
    box(timberWarm, east - .6, g + 1.5, north - .5, .85, .85, .85, yaw - .3);
  }

  // ---------- 墙门灯柱 ×1（ref-11 门口带顶灯，发光体，无真光源） ----------
  {
    const found = siteAt('wall-gate-lamp', -16.5, 155.5, 1);
    if (found) {
      placements.push({ kind: 'gate-lamp', east: found.east, north: found.north, footprint: 1 });
      const g = found.height;
      box(timber, found.east, g + 1.4, found.north, .18, 2.8, .18);
      box(slate, found.east, g + 2.95, found.north, .9, .12, .9);
      box(glow, found.east, g + 2.6, found.north, .32, .42, .32);
      box(iron, found.east, g + 2.86, found.north, .42, .07, .42);
    }
  }

  // ---------- merge batches ----------
  for (const [mat, geos] of batches) {
    const joined = mergeGeometries(geos.map(g => g.index ? g.toNonIndexed() : g));
    if (!joined) continue;
    joined.computeBoundingSphere();
    const mesh = new Mesh(joined, mat);
    mesh.name = `crater-density-a2-${(mat as MeshStandardMaterial).uuid.slice(0, 6)}`;
    group.add(mesh);
  }
  return { group, sites, placements };
}
