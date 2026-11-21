import {
  BoxGeometry, BufferGeometry, CanvasTexture, Color, ConeGeometry, CylinderGeometry,
  DataTexture, DodecahedronGeometry, Group, Matrix4, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, NearestFilter, PlaneGeometry, PointLight, Quaternion,
  SRGBColorSpace, Vector3, CatmullRomCurve3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { createTerrainGrid } from './terrain';
import type { mountWestCraterRoad } from './town-za22-crater-road';
import { craterBeltTrackCorridor } from './town-crater-outer-works';

type Terrain = ReturnType<typeof createTerrainGrid>;
type CraterRoad = Pick<ReturnType<typeof mountWestCraterRoad>, 'anchor' | 'heightAt'>;

export type RailExtensionAlignment = Readonly<{
  length: number;
  minRadius: number;
  stations: readonly { id: string; label: string; east: number; north: number; railY: number }[];
  boards: readonly { id: string; east: number; north: number }[];
  whistlePoints: readonly { id: string; east: number; north: number }[];
  divergence: Readonly<{ east: number; north: number }>;
}>;

const palette = {
  stone: '#8a8378', stoneDark: '#5d564c', ochre: '#a98a56', earth: '#5d4630',
  timberLight: '#a36b48', night: '#2c3648', snow: '#e8ecf0',
  ember: '#e08a3c', windowWarm: '#ffa455', rust: '#8a4a34',
  slate: '#4b5066', paper: '#e8e0cc',
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

const up = new Vector3(0, 1, 0);
const smooth01 = (t: number) => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };

/** Branch control line, town frame [east, north]. The divergence sits on the loop's
 * northern segment where the surveyed loop is at grade (477,335: track 33.7 over
 * ground 32.0, rise 1.6 m); the Beiling stretch of the loop flies 50+ m over its
 * ground on piers, so no ground-hugging branch can meet it there — the survey
 * table registers that finding for the pathing integration. From the junction the
 * line runs north-west to Shankou station, west along the northern skirt, then
 * south down the west side to the crater-mouth station. */
export const craterBranchControlLine: readonly (readonly [number, number])[] = [
  [492, 318], [477, 335], [468, 392], [452, 448], [420, 482], [372, 500], [326, 508],
  [296, 502], [262, 506], [200, 522], [140, 532], [80, 539], [20, 536], [-8, 524],
  [-24, 470], [-32, 395], [-36, 318], [-38, 248], [-41, 196], [-46, 158], [-52, 138],
];

/**
 * Railway north extension (crater book §五, mainline 3): the physical plant of the
 * branch — ground-hugging track built with the loop line's own idiom (spline
 * samples, ground envelope, grade limiting, station flattening), Shankou station
 * with its fake tunnel portal, crater-mouth station with freight siding and an ore
 * hopper car, and the narrow-gauge mine track along the corridor reserved in
 * mainline 2 to the smelter door. Train pathing (alternating loop/branch service,
 * night empty runs) integrates on this alignment via the exported survey data;
 * the loop's closed-route system is untouched here.
 */
export function buildCraterRailExtension(grid: Terrain, road: CraterRoad) {
  const group = new Group();
  group.name = 'crater-rail-extension';

  const stone = pixelMaterial(palette.stone, palette.stoneDark, 47, palette.earth);
  const stoneDark = pixelMaterial(palette.stoneDark, palette.night, 91, palette.stone);
  const timber = pixelMaterial(palette.earth, palette.night, 33, palette.stone);
  const timberWarm = pixelMaterial(palette.ochre, palette.earth, 71, palette.timberLight);
  const slate = pixelMaterial(palette.slate, palette.night, 143, palette.stone);
  const iron = pixelMaterial(palette.night, palette.rust, 161, palette.earth);
  const rustIron = pixelMaterial(palette.rust, palette.night, 187, palette.earth);
  const snow = pixelMaterial(palette.snow, palette.stone, 203);
  const paper = pixelMaterial(palette.paper, palette.ochre, 217, palette.stone);
  const steel = new MeshStandardMaterial({ color: 0x8e9eae, roughness: .45, metalness: .6 });
  const darkSteel = new MeshStandardMaterial({ color: 0x33323a, roughness: .8, metalness: .3 });
  const dark = new MeshStandardMaterial({ color: 0x100d0b, roughness: 1 });
  const ore = new MeshStandardMaterial({ color: 0x3d3a44, roughness: .95, flatShading: true });
  const glow = new MeshStandardMaterial({
    color: palette.windowWarm, emissive: palette.ember, emissiveIntensity: 1.25, roughness: .8,
  });

  const batches = new Map<MeshStandardMaterial, BufferGeometry[]>();
  function push(mat: MeshStandardMaterial, g: BufferGeometry) {
    const batch = batches.get(mat) ?? [];
    batch.push(g);
    batches.set(mat, batch);
  }
  function part(mat: MeshStandardMaterial, geo: BufferGeometry, east: number, h: number, north: number,
    yaw = 0, pitch = 0, roll = 0) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (roll) g.rotateZ(roll);
    if (pitch) g.rotateX(pitch);
    if (yaw) g.rotateY(yaw);
    g.translate(east, h, -north);
    push(mat, g);
    if (g !== geo) geo.dispose();
  }
  function box(mat: MeshStandardMaterial, east: number, h: number, north: number,
    sx: number, sy: number, sz: number, yaw = 0, pitch = 0, roll = 0) {
    part(mat, new BoxGeometry(sx, sy, sz), east, h, north, yaw, pitch, roll);
  }
  function segBox(mat: MeshStandardMaterial, center: Vector3, quat: Quaternion,
    lx: number, ly: number, lz: number, sx: number, sy: number, sz: number) {
    const geo = new BoxGeometry(sx, sy, sz);
    geo.translate(lx, ly, lz);
    const g = geo.toNonIndexed();
    g.applyQuaternion(quat);
    g.translate(center.x, center.y, center.z);
    push(mat, g);
    geo.dispose();
  }

  function groundAt(east: number, north: number): number {
    if (east >= 0) return grid.heightAt(east, north);
    const craterSide = road.heightAt(east, north);
    return craterSide ?? grid.heightAt(0, north);
  }

  type Sample = { east: number; north: number; y: number; ground: number };
  function buildTrackway(
    control: readonly (readonly [number, number])[],
    opts: { gauge: number; sleeperWidth: number; ballastWidth: number; railH: number;
      flatten?: readonly { east: number; north: number; half: number }[] },
  ): { samples: Sample[]; length: number; minRadius: number; stationY: Map<string, number> } {
    const curve = new CatmullRomCurve3(
      control.map(([x, n]) => new Vector3(x, 0, -n)), false, 'centripetal');
    curve.arcLengthDivisions = 2400;
    const length = curve.getLength();
    const count = Math.max(8, Math.ceil(length / 1.7));
    const step = length / count;
    const raw = Array.from({ length: count + 1 }, (_, i) => curve.getPointAt(i / count));
    const samples: Sample[] = raw.map(point => {
      const east = point.x, north = -point.z;
      const ground = Math.max(
        groundAt(east, north), groundAt(east - 1.4, north), groundAt(east + 1.4, north),
        groundAt(east, north - 1.4), groundAt(east, north + 1.4));
      return { east, north, y: ground + .62, ground };
    });
    const maxGrade = .12;
    const spans = samples.map((s, i) => i === 0 ? step
      : Math.hypot(s.east - samples[i - 1].east, s.north - samples[i - 1].north));
    for (const dir of [1, -1]) {
      const order = samples.map((_, i) => dir > 0 ? i : samples.length - 1 - i);
      for (let k = 1; k < order.length; k++) {
        const here = order[k], prev = order[k - 1];
        samples[here].y = Math.max(samples[here].y, samples[prev].y - maxGrade * spans[Math.max(here, prev)]);
      }
    }
    const stationY = new Map<string, number>();
    for (const flat of opts.flatten ?? []) {
      let nearest = 0, best = Infinity;
      samples.forEach((s, i) => {
        const d = (s.east - flat.east) ** 2 + (s.north - flat.north) ** 2;
        if (d < best) { best = d; nearest = i; }
      });
      const target = samples[nearest].y;
      stationY.set(`${flat.east},${flat.north}`, target);
      samples.forEach((s, i) => {
        const along = Math.abs(i - nearest) * step;
        const w = 1 - smooth01((along - flat.half) / 7);
        if (w > 0) s.y = s.y + (target - s.y) * w;
      });
    }
    const smoothed = samples.map((s, i) => {
      let acc = 0;
      for (let o = -5; o <= 5; o++) {
        const j = Math.max(0, Math.min(samples.length - 1, i + o));
        acc += samples[j].y * (6 - Math.abs(o)) / 36;
      }
      return Math.max(s.ground + .5, Math.min(s.ground + 2.4, acc + .1));
    });
    samples.forEach((s, i) => { s.y = smoothed[i]; });
    // Geometry: rails, rail bases, sleepers, ballast per segment.
    const orientation = new Matrix4();
    for (let i = 0; i < samples.length - 1; i++) {
      const a = samples[i], b = samples[i + 1];
      const va = new Vector3(a.east, a.y, -a.north);
      const vb = new Vector3(b.east, b.y, -b.north);
      const center = new Vector3().lerpVectors(va, vb, .5);
      const quat = new Quaternion().setFromRotationMatrix(orientation.lookAt(vb, va, up));
      const segLen = va.distanceTo(vb);
      for (const side of [-1, 1]) {
        segBox(steel, center, quat, side * opts.gauge / 2, -.08, 0, .15, opts.railH, segLen + .07);
        segBox(darkSteel, center, quat, side * opts.gauge / 2, -.22, 0, .3, .07, segLen + .07);
      }
      segBox(timber, center, quat, 0, -.32, 0, opts.sleeperWidth, .15, .36);
      segBox(stoneDark, center, quat, 0, -.5, 0, opts.ballastWidth, .26, segLen + .08);
      // Stone piers where the grade-limited profile bridges a dip (the loop
      // line's own idiom for rises over ~1.5 m), every fifth segment.
      if (i % 5 === 2) {
        const mid = samples[i];
        const rise = center.y - mid.ground;
        if (rise > 2.2) segBox(stone, center, quat, 0, -rise / 2 - .1, 0, 1.9, rise - .4, 1.3);
      }
    }
    let minRadius = Infinity;
    for (let i = 1; i < samples.length - 1; i++) {
      const a = samples[i - 1], b = samples[i], c = samples[i + 1];
      const ab = Math.hypot(b.east - a.east, b.north - a.north);
      const bc = Math.hypot(c.east - b.east, c.north - b.north);
      const ac = Math.hypot(c.east - a.east, c.north - a.north);
      const area2 = Math.abs((b.east - a.east) * (c.north - a.north) - (c.east - a.east) * (b.north - a.north));
      if (area2 < 1e-6) continue;
      minRadius = Math.min(minRadius, ab * bc * ac / (2 * area2));
    }
    return { samples, length, minRadius, stationY };
  }

  function sign(east: number, h: number, north: number, yaw: number, w: number, hh: number,
    draw?: (c: CanvasRenderingContext2D, w: number, h: number) => void) {
    box(timber, east, h, north, w + .18, hh + .18, .07, yaw);
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = Math.round(512 * hh / w);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#e8e0cc'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (draw) draw(ctx, canvas.width, canvas.height);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    const plane = new Mesh(new PlaneGeometry(w, hh), new MeshBasicMaterial({ map: texture }));
    const off = .06;
    plane.position.set(east + Math.sin(yaw) * off, h, -north + Math.cos(yaw) * off);
    plane.rotation.y = yaw;
    group.add(plane);
  }
  function stationSign(east: number, h: number, north: number, yaw: number, label: string) {
    box(timber, east, h - 1.15, north, .14, 2.3, .14, yaw);
    sign(east, h, north, yaw, 1.9, .62, (c, w, hh) => {
      c.fillStyle = '#2c3648'; c.fillRect(0, 0, w, hh);
      c.font = `bold ${Math.round(hh * .68)}px "Noto Sans SC", sans-serif`;
      c.fillStyle = '#e8e0cc'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(label, w / 2, hh / 2 + 2);
    });
  }
  function shelter(east: number, north: number, ground: number, topY: number, yaw: number, label: string) {
    const fr = { e: Math.sin(yaw), n: Math.cos(yaw) };
    const at = (dx: number, dz: number) => ({
      east: east + Math.cos(yaw) * dx + fr.e * dz,
      north: north - Math.sin(yaw) * dx + fr.n * dz,
    });
    // Platform slab with its top just under rail level.
    const pc = at(0, 2.6);
    box(stone, pc.east, topY - .42, pc.north, 13, .5, 3.1, yaw);
    box(snow, pc.east, topY - .14, pc.north, 13, .07, 3, yaw);
    for (const [px, pz] of [[-2.4, 1.6], [2.4, 1.6], [-2.4, 4.4], [2.4, 4.4]] as const) {
      const p = at(px, pz);
      box(timber, p.east, topY + 1.15, p.north, .2, 2.3, .2, yaw);
    }
    const rc = at(0, 3);
    box(slate, rc.east, topY + 2.45, rc.north, 6.4, .18, 4.6, yaw, .06);
    box(snow, rc.east, topY + 2.62, rc.north, 6.2, .12, 4.4, yaw, .06);
    const bc = at(0, 3.4);
    box(timberWarm, bc.east, topY + .45, bc.north, 3.4, .1, .5, yaw);
    const sc = at(-4.6, 2.6);
    stationSign(sc.east, topY + 1.7, sc.north, yaw, label);
    return at;
  }

  // ---------- the branch line ----------
  const main = buildTrackway(craterBranchControlLine, {
    gauge: 1.66, sleeperWidth: 2.5, ballastWidth: 2.9, railH: .18,
    flatten: [
      { east: 296, north: 502, half: 11 },
      { east: -44.5, north: 168, half: 10 },
    ],
  });
  const shankouY = main.stationY.get('296,502')!;
  const kengkouY = main.stationY.get('-44.5,168')!;

  // Portal stub: the line's scenic continuation into the ridge face north of
  // Shankou station (the fake tunnel mouth of §五.21).
  buildTrackway([[296, 502], [294, 524], [293, 540]], {
    gauge: 1.66, sleeperWidth: 2.5, ballastWidth: 2.9, railH: .18,
  });
  {
    const g = groundAt(293, 546);
    for (const s of [-1, 1]) box(stone, 293 + s * 2.9, g + 3.4, 546.5, 1.3, 6.8, 1.6);
    box(stone, 293, g + 7.3, 546.5, 7.2, 1.5, 1.7);
    box(stoneDark, 293, g + 8.3, 546.5, 7.6, .6, 1.9);
    box(dark, 293, g + 2.9, 546.2, 4.7, 5.8, .5);
    for (const [dx, dn, s] of [[-3.4, 3.4, 3.2], [3.6, 3, 2.7], [0, 4.6, 3.8], [-1.5, 2.6, 2.2]] as const) {
      part(stoneDark, new DodecahedronGeometry(s, 0), 293 + dx, g + s * .42, 546.5 + dn, dx * 1.3);
      part(snow, new DodecahedronGeometry(s * .82, 0), 293 + dx, g + s * .42 + s * .48, 546.5 + dn, dx * 1.3);
    }
  }

  // ---------- Shankou station (platform on the north side, at the pass node's foot) ----------
  shelter(296, 502, groundAt(296, 502), shankouY, 0, '山口站');
  {
    // Timetable board: the board stands now, its text follows once the branch
    // timetable is measured (the book's single text-later exception).
    const bx = 308, bn = 506;
    const g = groundAt(bx, bn);
    for (const s of [-1, 1]) box(timber, bx + s * .8, g + 1.1, bn, .12, 2.2, .12);
    sign(bx, g + 2.2, bn, 0, 2, 1.15, (c, w, h) => {
      c.strokeStyle = 'rgba(61,44,28,.55)'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(w * .06, h * .24); c.lineTo(w * .94, h * .24); c.stroke();
      for (let row = 0; row < 4; row++) {
        const y = h * (.4 + row * .14);
        c.beginPath(); c.moveTo(w * .06, y); c.lineTo(w * .94, y); c.stroke();
      }
    });
  }

  // ---------- Crater-mouth station, freight siding, hopper car, freight shed ----------
  const kengkouAt = shelter(-44.5, 168, groundAt(-44.5, 168), kengkouY, 1.7, '坑口站');
  const boards: { id: string; east: number; north: number }[] = [];
  {
    // Timetable board at the shelter's east end (《文本-坑区牌面》 §四,
    // verbatim chalk in two hands — the corner note's night empty run is
    // the timetable working as designed, never a defect to "fix").
    const bp = kengkouAt(4.9, 2.6);
    const g = groundAt(bp.east, bp.north);
    boards.push({ id: 'kengkou-timetable', east: bp.east, north: bp.north });
    for (const s of [-1, 1]) {
      const pp = kengkouAt(4.9 + s * .9, 2.6);
      box(timber, pp.east, g + 1.6, pp.north, .13, 3.2, .13);
    }
    sign(bp.east, g + 2.35, bp.north, 1.7, 2.3, 1.5, (c, w, h) => {
      c.fillStyle = '#35312b'; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(0, 0, 0, .35)'; c.lineWidth = 2;
      for (const fy of [.33, .66]) {
        c.beginPath(); c.moveTo(0, h * fy); c.lineTo(w, h * fy); c.stroke();
      }
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = '#e7e1cf';
      c.font = '33px "Noto Sans SC", sans-serif';
      c.fillText('晨一班　午一班　暮一班　夜一班', w / 2, h * .24);
      c.font = '30px "Noto Sans SC", sans-serif';
      c.fillText('货运矿料，随正班附挂。', w / 2, h * .5);
      c.fillStyle = '#cfc8b2'; c.textAlign = 'right';
      c.font = '23px "Noto Sans SC", sans-serif';
      c.fillText('夜车空驶，亦准点。', w - 26, h * .76);
      c.fillText('乘车请至山口站换乘。', w - 26, h * .9);
    });
  }
  {
    // Platform lamp: the station's one real light.
    const lx = -39.5, ln = 176;
    const g = groundAt(lx, ln);
    box(timber, lx, g + 1.5, ln, .15, 3, .15);
    box(glow, lx, g + 3.15, ln, .3, .4, .3);
    box(iron, lx, g + 3.45, ln, .46, .08, .46);
    const light = new PointLight(new Color(palette.ember), 7, 13, 2);
    light.position.set(lx, g + 3.15, -ln);
    group.add(light);
  }
  const siding = buildTrackway([[-50, 184], [-54, 158], [-57, 134]], {
    gauge: 1.66, sleeperWidth: 2.5, ballastWidth: 2.9, railH: .18,
  });
  {
    // Ore hopper car standing on the siding.
    let car = siding.samples[0], best = Infinity;
    for (const s of siding.samples) {
      const d = (s.east + 54.5) ** 2 + (s.north - 155) ** 2;
      if (d < best) { best = d; car = s; }
    }
    const yaw = Math.atan2(50, -7) + Math.PI / 2;
    const cy = car.y;
    box(iron, car.east, cy + .55, car.north, 5.9, .3, 2.3, yaw);
    box(rustIron, car.east, cy + 1.75, car.north, 5.7, 1.9, 2.45, yaw);
    part(rustIron, new CylinderGeometry(.75, 1.55, 1.15, 4), car.east, cy + .95, car.north, yaw + Math.PI / 4);
    part(ore, new ConeGeometry(1.05, .85, 8), car.east, cy + 3.1, car.north, yaw);
    for (const [lx, lz] of [[-2.2, -0.95], [2.2, -0.95], [-2.2, 0.95], [2.2, 0.95]] as const) {
      const wx = car.east + Math.cos(yaw) * lx + Math.sin(yaw) * lz;
      const wn = car.north - Math.sin(yaw) * lx + Math.cos(yaw) * lz;
      part(darkSteel, new CylinderGeometry(.42, .42, .14, 10), wx, cy + .18, wn, yaw, Math.PI / 2);
    }
  }
  {
    // Freight shed west of the siding.
    const sx = -64, sn = 146;
    const g = groundAt(sx, sn);
    for (const [px, pz] of [[-3.4, -2.4], [3.4, -2.4], [-3.4, 2.4], [3.4, 2.4]] as const) {
      box(timber, sx + px, g + 1.6, sn + pz, .26, 3.2, .26);
    }
    box(slate, sx, g + 3.45, sn, 8.4, .22, 6.2, 0, .05);
    box(snow, sx, g + 3.62, sn, 8.2, .14, 6, 0, .05);
    box(timber, sx, g + 1.5, sn - 2.55, 7.2, 3, .14);
    box(timberWarm, sx - 1.6, g + .65, sn + .6, 1.5, 1.3, 1.5);
    box(timberWarm, sx + .2, g + .55, sn + 1.1, 1.3, 1.1, 1.3, .4);
    part(ore, new ConeGeometry(1.7, 1.4, 9), sx + 2.2, g + .7, sn - .8, 0);
  }

  // ---------- narrow-gauge mine track along the reserved belt corridor ----------
  const corridorWorld = craterBeltTrackCorridor.map(([b, r]) => {
    const rad = b * Math.PI / 180;
    return [road.anchor.east + r * Math.sin(rad), road.anchor.north + r * Math.cos(rad)] as const;
  });
  const narrow = buildTrackway([[-54, 140], ...corridorWorld], {
    gauge: .9, sleeperWidth: 1.7, ballastWidth: 2, railH: .13,
    flatten: [{ east: corridorWorld.at(-1)![0], north: corridorWorld.at(-1)![1], half: 6 }],
  });
  {
    // One ore skip standing by the ore yard, and the buffer stop at the smelter door.
    let skip = narrow.samples[0], best = Infinity;
    for (const s of narrow.samples) {
      const d = (s.east + 118) ** 2 + (s.north - 101.5) ** 2;
      if (d < best) { best = d; skip = s; }
    }
    const idx = narrow.samples.indexOf(skip);
    const next = narrow.samples[Math.min(idx + 1, narrow.samples.length - 1)];
    const yaw = Math.atan2(-(next.east - skip.east), -(next.north - skip.north)) + Math.PI / 2;
    box(iron, skip.east, skip.y + .5, skip.north, 2.3, .75, 1.35, yaw);
    part(ore, new ConeGeometry(.62, .55, 8), skip.east, skip.y + 1.05, skip.north, yaw);
    const end = narrow.samples.at(-1)!;
    const prev = narrow.samples.at(-2)!;
    const eyaw = Math.atan2(-(end.east - prev.east), -(end.north - prev.north)) + Math.PI / 2;
    box(timber, end.east, end.y + .55, end.north, 1.7, .3, .3, eyaw, 0, .5);
    box(timber, end.east, end.y + .55, end.north, 1.7, .3, .3, eyaw, 0, -.5);
    box(iron, end.east, end.y + .6, end.north, 1.5, .5, .12, eyaw);
  }

  // ---------- merge batches ----------
  for (const [mat, geos] of batches) {
    const joined = mergeGeometries(geos.map(g => g.index ? g.toNonIndexed() : g));
    if (!joined) continue;
    joined.computeBoundingSphere();
    const mesh = new Mesh(joined, mat);
    mesh.name = `crater-rail-${mat.uuid.slice(0, 6)}`;
    group.add(mesh);
  }

  const alignment: RailExtensionAlignment = {
    length: main.length,
    minRadius: main.minRadius,
    stations: [
      { id: 'shankou-station', label: '山口站', east: 296, north: 502, railY: shankouY },
      { id: 'kengkou-station', label: '坑口站', east: -44.5, north: 168, railY: kengkouY },
    ],
    boards,
    whistlePoints: [
      { id: 'shankou-portal', east: 293, north: 542 },
      { id: 'kengkou-approach', east: -43.5, north: 190 },
    ],
    divergence: { east: 477, north: 335 },
  };
  return { group, alignment, samples: main.samples, narrowSamples: narrow.samples };
}
