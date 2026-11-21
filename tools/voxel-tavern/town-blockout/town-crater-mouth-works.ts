import {
  BoxGeometry, BufferGeometry, CanvasTexture, Color, ConeGeometry, CylinderGeometry,
  DataTexture, DodecahedronGeometry, Euler, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, NearestFilter, PlaneGeometry, PointLight, Quaternion,
  SRGBColorSpace, TorusGeometry, Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { meteorCraterRimRadius } from './meteor-crater';
import type { mountWestCraterRoad } from './town-za22-crater-road';

type CraterRoad = Pick<ReturnType<typeof mountWestCraterRoad>, 'anchor' | 'heightAt'>;
export type CraterMouthSite = Readonly<{
  id: string; east: number; north: number; height: number; radius: number;
}>;

const palette = {
  stone: '#8a8378', stoneDark: '#5d564c', ochre: '#a98a56', earth: '#5d4630',
  timberLight: '#a36b48', pine: '#44503c', night: '#2c3648', snow: '#e8ecf0',
  ember: '#e08a3c', windowWarm: '#ffa455', crystal: '#7fd4c8', rust: '#8a4a34',
  slate: '#4b5066', paper: '#e8e0cc', brass: '#c68d4d',
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
 * Crater-mouth works (crater book §三.8/9/10 + §六 outside segment, revisions 1–3):
 * assembly ground with the ZB-35 flagpole anchor, the supply station as the core
 * anchor building, the north-rim guard shed, the iron fence's main-gate segment,
 * the wreckage ring on the OUTER rim slope only, and the rim lamp chain.
 * Everything samples the road's heightAt; nothing here blocks a path — the
 * ZB-28 guards (people) do the turning-back, never a wall.
 */
export function buildCraterMouthWorks(road: CraterRoad) {
  const { anchor, heightAt } = road;
  const group = new Group();
  group.name = 'crater-mouth-works';
  const sites: CraterMouthSite[] = [];

  const stone = pixelMaterial(palette.stone, palette.stoneDark, 41, palette.earth);
  const stoneDark = pixelMaterial(palette.stoneDark, palette.night, 87, palette.stone);
  const timber = pixelMaterial(palette.earth, palette.night, 23, palette.stone);
  const timberWarm = pixelMaterial(palette.ochre, palette.earth, 61, palette.timberLight);
  const slate = pixelMaterial(palette.slate, palette.night, 133, palette.stone);
  const iron = pixelMaterial(palette.night, palette.rust, 151, palette.earth);
  const rustIron = pixelMaterial(palette.rust, palette.night, 177, palette.earth);
  const snow = pixelMaterial(palette.snow, palette.stone, 199);
  const paper = pixelMaterial(palette.paper, palette.ochre, 211, palette.stone);
  const brass = new MeshStandardMaterial({ color: palette.brass, roughness: .45, metalness: .65 });
  const glow = new MeshStandardMaterial({
    color: palette.windowWarm, emissive: palette.ember, emissiveIntensity: 1.25, roughness: .8,
  });
  const wreck = new MeshStandardMaterial({ color: 0x4a3a34, roughness: .92, metalness: .35, flatShading: true });

  const batches = new Map<MeshStandardMaterial, BufferGeometry[]>();
  function part(mat: MeshStandardMaterial, geo: BufferGeometry, east: number, h: number, north: number,
    yaw = 0, pitch = 0, roll = 0) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    // Compose roll -> pitch -> yaw (yaw outermost), matching Euler 'YXZ'.
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

  /** A ground site on the crater surroundings, or undefined where the survey has no ground. */
  function site(id: string, bearingDeg: number, radius: number, clear: number) {
    const b = d2r(bearingDeg);
    const east = anchor.east + radius * Math.sin(b);
    const north = anchor.north + radius * Math.cos(b);
    const height = heightAt(east, north);
    if (height === undefined) return undefined;
    const found = { id, east, north, height, radius: clear };
    sites.push(found);
    return found;
  }

  /** Local frame: +dz toward the facing bearing (the crater), +dx to the right of it. */
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

  function sign(east: number, h: number, north: number, yaw: number, w: number, hh: number,
    draw: (c: CanvasRenderingContext2D, w: number, h: number) => void) {
    box(timber, east, h, north, w + .16, hh + .16, .06, yaw);
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 320;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    draw(ctx, 512, 320);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    const plane = new Mesh(new PlaneGeometry(w, hh), new MeshBasicMaterial({ map: texture }));
    const off = .055;
    plane.position.set(east + Math.sin(yaw) * off, h, -north + Math.cos(yaw) * off);
    plane.rotation.y = yaw;
    group.add(plane);
  }

  function lampLight(east: number, h: number, north: number, intensity: number, distance: number) {
    const light = new PointLight(new Color(palette.ember), intensity, distance, 2);
    light.position.set(east, h, -north);
    group.add(light);
  }

  // ---------- §三.8 assembly ground (south rim, outside the haul gap) ----------
  const assembly = site('assembly-ground', 168, 70, 10);
  if (assembly) {
    const fr = frame(assembly, 168 + 180);
    const g = assembly.height;
    // Levelled yard pad.
    cyl(stoneDark, assembly.east, g + .09, assembly.north, 9.6, 10.4, .18, 18);
    // Flagpoles: town flag + survey pennant. The ZB-35 anchor ring sits at the main pole's foot.
    for (const [dx, tall] of [[-1.6, 7.2], [1.6, 5.6]] as const) {
      const p = fr.at(dx, 3.4);
      cyl(timber, p.east, g + tall / 2, p.north, .09, .13, tall, 7);
      box(timber, p.east, g + tall - .3, p.north, .8, .07, .07, fr.yaw);
    }
    const flagPole = fr.at(-1.6, 3.4);
    box(new MeshStandardMaterial({ color: 0x883738, roughness: .9 }), flagPole.east + .55, g + 6.55, flagPole.north, 1.05, .68, .05, fr.yaw);
    const pennant = fr.at(1.6, 3.4);
    box(timberWarm, pennant.east + .34, g + 5.05, pennant.north, .62, .3, .04, fr.yaw);
    cyl(stone, flagPole.east, g + .22, flagPole.north, 1.05, 1.25, .44, 12);
    sites.push({ id: 'zb35-anchor', east: flagPole.east, north: flagPole.north, height: g + .44, radius: 1.3 });
    // Notice board with the settled text and its empty duty grid.
    const board = fr.at(-4.6, 2.2);
    for (const s of [-1, 1]) {
      const p = fr.at(-4.6 + s * 1.15, 2.2);
      box(timber, p.east, g + .95, p.north, .14, 1.9, .14, fr.yaw);
    }
    sign(board.east, g + 1.62, board.north, fr.yaw, 2.5, 1.5, (c, w, h) => {
      c.fillStyle = '#d9c69c'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#5d4630'; c.lineWidth = 6; c.strokeRect(14, 14, w - 28, h - 28);
      c.fillStyle = '#3d2c1c'; c.textAlign = 'center';
      c.font = 'bold 54px "Noto Sans SC", sans-serif';
      c.fillText('入坑登记 · 天黑前出坑', w / 2, 92);
      c.lineWidth = 3; c.strokeStyle = 'rgba(61,44,28,.75)';
      for (let row = 0; row < 3; row++) {
        const y = 140 + row * 54;
        c.strokeRect(60, y, w - 120, 40);
        c.beginPath(); c.moveTo(150, y); c.lineTo(150, y + 40); c.stroke();
      }
    });
    // Sled slots: six stake pairs with a rope line.
    for (let i = 0; i < 6; i++) {
      const p = fr.at(-5 + i * 1.7, -2.8);
      box(timber, p.east, g + .42, p.north, .12, .84, .12, fr.yaw);
      const q = fr.at(-5 + i * 1.7, -4.1);
      box(timber, q.east, g + .42, q.north, .12, .84, .12, fr.yaw);
    }
    // Crate stacks, three groups, one rope coil.
    for (const [dx, dz, n] of [[4.9, 1.8, 3], [6.1, .4, 2], [5.2, -3.6, 2]] as const) {
      for (let i = 0; i < n; i++) {
        const p = fr.at(dx + (i % 2) * .15, dz - Math.floor(i / 2) * .1);
        box(i % 2 ? timberWarm : timber, p.east, g + .41 + i * .8, p.north, .92, .8, .92, fr.yaw + i * .13);
      }
    }
    const coil = fr.at(4.9, 3.1);
    part(timberWarm, new TorusGeometry(.42, .11, 6, 14), coil.east, g + .85, coil.north, fr.yaw, Math.PI / 2);
    // Two yard lamps; one carries a real light (chain link toward the rim lamps).
    for (const dx of [-7.6, 7.6]) {
      const p = fr.at(dx, 1.2);
      box(timber, p.east, g + 1.05, p.north, .16, 2.1, .16, fr.yaw);
      box(glow, p.east, g + 2.2, p.north, .3, .38, .3, fr.yaw);
      box(iron, p.east, g + 2.48, p.north, .44, .08, .44, fr.yaw);
    }
    const lampP = fr.at(-7.6, 1.2);
    lampLight(lampP.east, g + 2.2, lampP.north, 5.5, 9);
  }

  // ---------- §三.9 supply station (core anchor, per ref-01) ----------
  const supply = site('supply-station', 150, 74, 8);
  if (supply) {
    const fr = frame(supply, 150 + 180);
    const g = supply.height;
    const W = 7.4, D = 5.6, wallH = 2.7, foundH = .85;
    // Stone foundation and floor.
    const c0 = fr.at(0, 0);
    box(stone, c0.east, g + foundH / 2 - .1, c0.north, W + .5, foundH, D + .5, fr.yaw);
    box(timber, c0.east, g + foundH + .03, c0.north, W, .06, D, fr.yaw);
    // Walls: front (crater side) carries the door gap and two warm windows;
    // back and sides solid. Interior stays enterable through the open doorway.
    const wallY = g + foundH + wallH / 2;
    const front = fr.at(0, D / 2);
    box(timber, fr.at(-2.55, D / 2).east, wallY, front.north, 2.3, wallH, .22, fr.yaw);
    box(timber, fr.at(2.55, D / 2).east, wallY, fr.at(2.55, D / 2).north, 2.3, wallH, .22, fr.yaw);
    box(timber, front.east, g + foundH + wallH - .35, front.north, 2.9, .7, .22, fr.yaw);
    for (const dx of [-2.55, 2.55]) {
      const wp = fr.at(dx, D / 2 + .13);
      box(glow, wp.east, g + foundH + 1.65, wp.north, .92, 1.05, .06, fr.yaw);
      box(timber, wp.east, g + foundH + 1.65, wp.north, 1.06, .09, .09, fr.yaw);
    }
    const back = fr.at(0, -D / 2);
    box(timber, back.east, wallY, back.north, W, wallH, .22, fr.yaw);
    for (const s of [-1, 1]) {
      const side = fr.at(s * W / 2, 0);
      box(timber, side.east, wallY, side.north, .22, wallH, D, fr.yaw);
    }
    // Roof: pitched slate over the back half, flat viewing deck over the front half.
    const roofY = g + foundH + wallH;
    for (const s of [-1, 1]) {
      const rp = fr.at(0, -D / 4 + s * .1);
      box(slate, rp.east, roofY + .62, rp.north, W + .7, .12, D / 2 + .75, fr.yaw, s * .62);
    }
    const deck = fr.at(0, D / 4);
    box(timber, deck.east, roofY + .06, deck.north, W, .12, D / 2, fr.yaw);
    for (let i = 0; i < 7; i++) {
      const p = fr.at(-W / 2 + .4 + i * (W - .8) / 6, D / 2 - .12);
      box(timber, p.east, roofY + .5, p.north, .09, .9, .09, fr.yaw);
    }
    const rail = fr.at(0, D / 2 - .12);
    box(timber, rail.east, roofY + .95, rail.north, W, .08, .08, fr.yaw);
    // Exterior stair up the east side, climbing from the back toward the deck.
    for (let i = 0; i < 6; i++) {
      const p = fr.at(W / 2 + .55, -D / 2 + .4 + i * .55);
      box(timber, p.east, g + .3 + i * (foundH + wallH) / 6, p.north, 1, .14, .5, fr.yaw);
    }
    // Brass telescope on the deck, trained on the crater centre.
    const scope = fr.at(-1.8, D / 4 + .4);
    for (const a of [0, 2.1, 4.2]) {
      box(brass, scope.east + Math.sin(a) * .3, roofY + .45, scope.north + Math.cos(a) * .3, .06, .95, .06, fr.yaw, .3 * Math.cos(a), .3 * Math.sin(a));
    }
    cyl(brass, scope.east, roofY + 1.12, scope.north, .11, .16, 1.25, 9, fr.yaw, Math.PI / 2 - .18);
    // Door lanterns (one real light) and the doorway step.
    for (const s of [-1, 1]) {
      const lp = fr.at(s * 1.05, D / 2 + .3);
      box(glow, lp.east, g + foundH + 2.15, lp.north, .2, .3, .2, fr.yaw);
    }
    const doorLight = fr.at(0, D / 2 + .6);
    lampLight(doorLight.east, g + foundH + 2.1, doorLight.north, 5, 8.5);
    const step = fr.at(0, D / 2 + .55);
    box(stone, step.east, g + .12, step.north, 1.7, .24, 1, fr.yaw);
    // Interior: shelves with dry goods / rope / oil lamps, counter, hand-drawn map.
    for (const s of [-1, 1]) {
      const sh = fr.at(s * (W / 2 - .55), -.6);
      for (let lvl = 0; lvl < 3; lvl++) {
        box(timber, sh.east, g + foundH + .5 + lvl * .62, sh.north, .5, .07, 3.4, fr.yaw);
        for (let j = 0; j < 4; j++) {
          const gp = fr.at(s * (W / 2 - .55), -1.9 + j * .85);
          if ((j + lvl) % 3 === 2) cyl(glow, gp.east, g + foundH + .68 + lvl * .62, gp.north, .07, .09, .22, 6);
          else box(timberWarm, gp.east, g + foundH + .68 + lvl * .62, gp.north, .34, .3, .4, fr.yaw + j * .2);
        }
      }
    }
    const counter = fr.at(1.4, 1.1);
    box(timberWarm, counter.east, g + foundH + .5, counter.north, 2.4, 1, .6, fr.yaw);
    const mapP = fr.at(0, -D / 2 + .16);
    sign(mapP.east, g + foundH + 1.75, mapP.north, fr.yaw + Math.PI, 2.1, 1.35, (c, w, h) => {
      c.fillStyle = '#e3d3a8'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#5d4630'; c.lineWidth = 5; c.strokeRect(12, 12, w - 24, h - 24);
      c.lineWidth = 4; c.beginPath(); c.arc(w * .42, h * .46, 88, 0, Math.PI * 2); c.stroke();
      c.lineWidth = 2.5; c.beginPath(); c.arc(w * .42, h * .46, 52, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.arc(w * .42, h * .46, 20, 0, Math.PI * 2); c.stroke();
      c.fillStyle = '#3d2c1c'; c.font = 'bold 30px "Noto Sans SC", sans-serif'; c.textAlign = 'center';
      c.fillText('井口', w * .42, h * .46 + 10);
      c.fillText('栈道', w * .68, h * .3);
      c.fillText('黑石带', w * .2, h * .78);
      c.strokeStyle = 'rgba(61,44,28,.6)'; c.lineWidth = 3;
      c.strokeRect(w * .74, h * .62, 88, 66);
    });
  }

  // ---------- §三.10 guard shed (north rim high point, per ref-03) ----------
  const shed = site('guard-shed', 358, 64, 5);
  if (shed) {
    const fr = frame(shed, 358 + 180);
    const g = shed.height;
    for (const [dx, dz] of [[-1.7, -1.2], [1.7, -1.2], [-1.7, 1.2], [1.7, 1.2]] as const) {
      const p = fr.at(dx, dz);
      box(timber, p.east, g + 1.25, p.north, .18, 2.5, .18, fr.yaw);
    }
    const roofC = fr.at(0, 0);
    box(timber, roofC.east, g + 2.62, roofC.north, 4.3, .14, 3.3, fr.yaw, .1);
    box(snow, roofC.east, g + 2.78, roofC.north, 4.1, .16, 3.1, fr.yaw, .1);
    const backW = fr.at(0, -1.25);
    box(timber, backW.east, g + 1.1, backW.north, 3.6, 2.2, .14, fr.yaw);
    // Brazier with a real light — the warm chain's northernmost lamp.
    const brz = fr.at(.7, .3);
    cyl(iron, brz.east, g + .32, brz.north, .52, .34, .5, 9);
    part(glow, new ConeGeometry(.34, .42, 7), brz.east, g + .68, brz.north);
    lampLight(brz.east, g + .95, brz.north, 6, 9.5);
    for (let i = 0; i < 5; i++) {
      const p = fr.at(-1.15 + (i % 3) * .24, .9 + Math.floor(i / 3) * .3);
      box(timber, p.east, g + .12 + (i % 2) * .16, p.north, .16, .24 + (i % 2) * .2, .16, fr.yaw + i);
    }
    // Bench, small table, the half cup of tea.
    const bench = fr.at(-.8, -.5);
    box(timberWarm, bench.east, g + .48, bench.north, 1.7, .09, .42, fr.yaw);
    for (const s of [-1, 1]) {
      const p = fr.at(-.8 + s * .7, -.5);
      box(timber, p.east, g + .22, p.north, .12, .44, .34, fr.yaw);
    }
    const table = fr.at(.9, -.7);
    box(timberWarm, table.east, g + .62, table.north, .8, .07, .55, fr.yaw);
    box(timber, table.east, g + .3, table.north, .09, .6, .09, fr.yaw);
    cyl(paper, table.east, g + .74, table.north, .07, .055, .13, 8);
    // Hanging paper lantern under the roof edge.
    const lant = fr.at(-1.5, 1.35);
    cyl(paper, lant.east, g + 2.05, lant.north, .17, .17, .34, 8);
    box(glow, lant.east, g + 2.05, lant.north, .07, .2, .07, fr.yaw);
    // Duty board — the museum shift board's text, same source.
    const boardP = fr.at(1.95, -.4);
    sign(boardP.east, g + 1.5, boardP.north, fr.yaw - Math.PI / 2, 1.35, 1.5, (c, w, h) => {
      c.fillStyle = '#d9c69c'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#5d4630'; c.lineWidth = 6; c.strokeRect(12, 12, w - 24, h - 24);
      c.fillStyle = '#3d2c1c'; c.textAlign = 'center';
      c.font = 'bold 44px "Noto Sans SC", sans-serif';
      c.fillText('班次牌', w / 2, 66);
      c.font = '30px "Noto Sans SC", sans-serif';
      c.fillText('一班 辰入午出 · 班头 石沉', w / 2, 128);
      c.fillText('二班 午入酉出 · 班头 石沉', w / 2, 178);
      c.fillText('三班 夜里不入', w / 2, 228);
      c.font = '24px "Noto Sans SC", sans-serif'; c.fillStyle = 'rgba(61,44,28,.7)';
      c.fillText('（三班那一栏，年年空着）', w / 2, 272);
    });
  }

  // ---------- iron fence main-gate segment (works-boundary line, assembly side) ----------
  // Per 修订一/修订三 the fence ring follows the enlarged works boundary, bowing
  // outside the industrial belt on the south arc; the full ring lands in mainline 2.
  const fenceR = 90;
  {
    const gateB = 165;
    const segStart = 146, segEnd = 184, step = 3.4;
    const arcLen = d2r(segEnd - segStart) * fenceR;
    const panels = Math.floor(arcLen / step);
    for (let i = 0; i <= panels; i++) {
      const bDeg = segStart + (segEnd - segStart) * (i / panels);
      if (Math.abs(bDeg - gateB) < 3.4) continue;
      const b = d2r(bDeg);
      const east = anchor.east + fenceR * Math.sin(b);
      const north = anchor.north + fenceR * Math.cos(b);
      const h = heightAt(east, north);
      if (h === undefined) continue;
      const yaw = -b;
      box(rustIron, east, h + 2.35, north, .14, 4.7, .14, yaw);
      part(rustIron, new ConeGeometry(.11, .42, 5), east, h + 4.9, north, yaw);
      if (i < panels) {
        const mid = d2r(segStart + (segEnd - segStart) * ((i + .5) / panels));
        if (Math.abs(segStart + (segEnd - segStart) * ((i + .5) / panels) - gateB) >= 3.4) {
          const me = anchor.east + fenceR * Math.sin(mid);
          const mn = anchor.north + fenceR * Math.cos(mid);
          const mh = heightAt(me, mn);
          if (mh !== undefined) {
            for (const ry of [1.15, 2.6, 4.05]) box(rustIron, me, mh + ry, mn, step + .1, .12, .07, -mid);
            for (let bar = 0; bar < 5; bar++) {
              const bb = d2r(segStart + (segEnd - segStart) * ((i + .18 + bar * .16) / panels));
              const be = anchor.east + fenceR * Math.sin(bb);
              const bn = anchor.north + fenceR * Math.cos(bb);
              const bh = heightAt(be, bn);
              if (bh !== undefined) box(rustIron, be, bh + 2.3, bn, .07, 4.4, .07, -bb);
            }
          }
        }
      }
    }
    // Double gate at the assembly bearing: two framed leaves, chain and padlock.
    const gb = d2r(gateB);
    const gEast = anchor.east + fenceR * Math.sin(gb);
    const gNorth = anchor.north + fenceR * Math.cos(gb);
    const gH = heightAt(gEast, gNorth);
    if (gH !== undefined) {
      sites.push({ id: 'fence-main-gate', east: gEast, north: gNorth, height: gH, radius: 3.2 });
      for (const s of [-1, 1]) {
        const postB = d2r(gateB + s * 2.6);
        const pe = anchor.east + fenceR * Math.sin(postB);
        const pn = anchor.north + fenceR * Math.cos(postB);
        const ph = heightAt(pe, pn) ?? gH;
        box(iron, pe, ph + 2.5, pn, .3, 5, .3, -postB);
        const leafC = d2r(gateB + s * 1.3);
        const le = anchor.east + fenceR * Math.sin(leafC);
        const ln = anchor.north + fenceR * Math.cos(leafC);
        const lh = heightAt(le, ln) ?? gH;
        for (const ry of [.7, 2.3, 3.9]) box(iron, le, lh + ry, ln, 2.9, .16, .09, -leafC);
        for (let bar = 0; bar < 6; bar++) {
          const bb = d2r(gateB + s * (.35 + bar * .38));
          const be = anchor.east + fenceR * Math.sin(bb);
          const bn = anchor.north + fenceR * Math.cos(bb);
          const bh = heightAt(be, bn) ?? gH;
          box(iron, be, bh + 2.3, bn, .08, 4.3, .08, -bb);
        }
      }
      box(iron, gEast, gH + 2.2, gNorth, .34, .42, .14, -gb);
      part(iron, new TorusGeometry(.3, .05, 5, 10), gEast, gH + 2.55, gNorth, -gb);
    }
    // One older wooden stretch patched in beside the gate (two generations).
    for (let i = 0; i < 4; i++) {
      const b = d2r(188 + i * 1.9);
      const east = anchor.east + fenceR * Math.sin(b);
      const north = anchor.north + fenceR * Math.cos(b);
      const h = heightAt(east, north);
      if (h === undefined) continue;
      box(timber, east, h + 1.15 - (i === 2 ? .3 : 0), north, .16, 2.3 - (i === 2 ? .6 : 0), .1, -b, 0, i === 1 ? .06 : 0);
    }
  }

  // ---------- §六 rim lamp chain, outside segment (10 lamps at r=61) ----------
  const lampSites: CraterMouthSite[] = [];
  for (let i = 0; i < 10; i++) {
    const bDeg = 15 + i * 36;
    const b = d2r(bDeg);
    const east = anchor.east + 61 * Math.sin(b);
    const north = anchor.north + 61 * Math.cos(b);
    const h = heightAt(east, north);
    if (h === undefined) continue;
    box(timber, east, h + .75, north, .15, 1.5, .15);
    box(glow, east, h + 1.68, north, .26, .34, .26);
    box(iron, east, h + 1.92, north, .4, .07, .4);
    lampSites.push({ id: `rim-lamp-${i + 1}`, east, north, height: h, radius: .5 });
  }
  sites.push(...lampSites);

  // ---------- wreckage ring: outer slope only, never the walls or floor ----------
  let debrisCount = 0;
  {
    const geo = new DodecahedronGeometry(1, 0);
    geo.scale(1.25, .62, .9);
    const inst = new InstancedMesh(geo, wreck, 110);
    const dummy = new Matrix4();
    const quat = new Quaternion();
    const eul = new Euler();
    const pos = new Vector3();
    const scl = new Vector3();
    let placed = 0;
    for (let i = 0; i < 110; i++) {
      const bDeg = hash(i * 3 + 1) * 360;
      // Keep the industrial-belt arc and the approach corridor clear.
      if (bDeg > 84 && bDeg < 216) continue;
      if (Math.abs(bDeg - 118) < 8) continue;
      const falloff = hash(i * 7 + 2);
      const r = 59 + falloff * falloff * 34 + hash(i * 13 + 5) * 2.5;
      const b = d2r(bDeg);
      const east = anchor.east + r * Math.sin(b);
      const north = anchor.north + r * Math.cos(b);
      const h = heightAt(east, north);
      if (h === undefined) continue;
      const size = .8 + hash(i * 17 + 3) * 1.9;
      eul.set(hash(i) * .9 - .45, hash(i * 5) * Math.PI, hash(i * 11) * .7 - .35);
      quat.setFromEuler(eul);
      pos.set(east, h + size * .16, -north);
      scl.set(size, size, size);
      dummy.compose(pos, quat, scl);
      inst.setMatrixAt(placed++, dummy);
    }
    inst.count = placed;
    inst.instanceMatrix.needsUpdate = true;
    inst.name = 'crater-wreckage-ring';
    group.add(inst);
    debrisCount = placed;
  }

  for (const [mat, parts] of batches) {
    const merged = mergeGeometries(parts);
    for (const p of parts) p.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new Mesh(merged, mat);
    group.add(mesh);
  }

  return { group, sites, debrisCount, rimRadius: meteorCraterRimRadius };
}
