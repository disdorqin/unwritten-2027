import {
  BoxGeometry, CanvasTexture, Group, InstancedMesh, Mesh, MeshBasicMaterial, MeshLambertMaterial,
  Object3D, PlaneGeometry, PointLight, SRGBColorSpace, type Material,
} from 'three';
import type { TownPlot } from './landmark-kit';

type Point = [number, number, number];
type Solid = { min: Point; max: Point };
type Block = { position: Point; size: Point; roll: number };

// ZA-11 镇公所 (JX-35): 门厅 / 讲古位 / 留言板 / 失物招领角 / 镇务公告墙 + 星石环本体。
// Local plot coordinates: x east, z toward the front door (plot door side), y up from the
// levelled plot floor. Palette locked to 《风格打造规范》: 石灰/土黄/深褐/墨绿/夜蓝/雪白/
// 火光橙/晶辉青/锈红. All signage stays blank: 牌示与告示正文留空待审, 本件只建场所本体。
const palette: Record<string, Material> = {
  stone: new MeshLambertMaterial({ color: '#8a8378' }),
  stoneTrim: new MeshLambertMaterial({ color: '#a39a8b' }),
  stoneDark: new MeshLambertMaterial({ color: '#6f695f' }),
  timber: new MeshLambertMaterial({ color: '#5d4630' }),
  timberWarm: new MeshLambertMaterial({ color: '#a98a56' }),
  roof: new MeshLambertMaterial({ color: '#2c3648' }),
  roofLight: new MeshLambertMaterial({ color: '#3d4c66' }),
  snow: new MeshLambertMaterial({ color: '#e8ecf0' }),
  paper: new MeshLambertMaterial({ color: '#e8e0cc' }),
  noticePaper: new MeshLambertMaterial({ color: '#d9b84a' }),
  rust: new MeshLambertMaterial({ color: '#8a4a34' }),
  dark: new MeshLambertMaterial({ color: '#2e2620' }),
  fire: new MeshLambertMaterial({ color: '#e08a3c', emissive: '#e08a3c', emissiveIntensity: 1.6 }),
  crystal: new MeshLambertMaterial({ color: '#7fd4c8', emissive: '#7fd4c8', emissiveIntensity: .55 }),
  rug: new MeshLambertMaterial({ color: '#7a3b2e' }),
  glass: new MeshBasicMaterial({ color: '#ffd482' }),
  goldLight: new MeshBasicMaterial({ color: '#ffe9bb' }),
};

function bounds([x, y, z]: Point, [w, h, d]: Point): Solid {
  return { min: [x - w / 2, y - h / 2, z - d / 2], max: [x + w / 2, y + h / 2, z + d / 2] };
}

// 星石环: 镇志圆环 (S-1 定版同一单环), 缺口 40° 位于环上偏右上 (自门厅望向环面取向)。
// Angles are measured in the ring plane from straight up, positive toward local -z.
export const STAR_RING_GAP = { centerDeg: -50, widthDeg: 40 } as const;
export const STAR_RING_RADIUS = 1.55;
export const STAR_RING_CENTER: Point = [7.35, 2.45, 2.0];

function gapArc(deg: number) {
  let d = ((deg - STAR_RING_GAP.centerDeg) % 360 + 360) % 360;
  if (d > 180) d -= 360;
  return Math.abs(d) < STAR_RING_GAP.widthDeg / 2;
}

// Twelve empty sockets spread over the present 320 degrees of the ring, local coords.
export const STAR_RING_SOCKETS: Point[] = Array.from({ length: 12 }, (_, i) => {
  const deg = STAR_RING_GAP.centerDeg + STAR_RING_GAP.widthDeg / 2 + (320 / 11) * i;
  const rad = deg * Math.PI / 180;
  const [cx, cy, cz] = STAR_RING_CENTER;
  return [cx - .24, cy + STAR_RING_RADIUS * Math.cos(rad), cz - STAR_RING_RADIUS * Math.sin(rad)] as Point;
});

export const CELLAR_HATCH_LOCAL: Point = [8.85, .36, -6.35];

export function buildTownOfficeLandmark(_plot: TownPlot): Group {
  const model = new Group();
  model.name = 'Town Office';
  const batches = new Map<string, Block[]>();
  const colliders: Solid[] = [];
  const floors: Solid[] = [];
  function box(tint: string, x: number, y: number, z: number, w: number, h: number, d: number, roll = 0) {
    const items = batches.get(tint) ?? [];
    items.push({ position: [x, y, z], size: [w, h, d], roll });
    batches.set(tint, items);
  }
  function solid(tint: string, x: number, y: number, z: number, w: number, h: number, d: number, roll = 0) {
    box(tint, x, y, z, w, h, d, roll);
    colliders.push(bounds([x, y, z], [w, h, d]));
  }

  const halfW = 10, halfD = 8, wallTop = 4.4, wallT = .36;

  // Plinth, floor and door steps.
  box('stoneDark', 0, .15, 0, 20.7, .3, 16.7);
  box('stone', 0, .31, 0, 20.2, .05, 16.2);
  for (let plank = -9; plank <= 9; plank++) {
    box(plank % 3 ? 'timberWarm' : 'timber', plank * 1.05, .345, 0, .98, .03, 15.6);
  }
  floors.push(bounds([0, .30, 0], [20.2, .06, 16.2]));
  for (let i = 0; i < 2; i++) {
    box('stoneTrim', 0, .075 * (i + 1), 8.85 - i * .34, 3.6, .15 * (i + 1), .34);
    floors.push(bounds([0, .075 * (i + 1), 8.85 - i * .34], [3.6, .15 * (i + 1), .36]));
  }

  // Exterior walls: stone courses with timber corner posts. Openings are real gaps.
  const doorHalf = 1.2;
  const frontWindows = [-5.6, 5.6];
  const backWindows = [-5.6, 0, 5.6];
  function wallRun(alongX: boolean, side: 1 | -1, openings: { u: number; w: number; h: number; y0: number }[]) {
    const face = (alongX ? halfD : halfW) * side;
    const length = alongX ? halfW * 2 : halfD * 2;
    for (let row = 0; row < 11; row++) {
      const y = .52 + row * .4;
      for (let index = -1; index < Math.ceil(length / .82); index++) {
        const shift = row % 2 ? .41 : 0;
        const left = Math.max(-length / 2, -length / 2 + index * .82 + shift);
        const right = Math.min(length / 2, -length / 2 + (index + 1) * .82 + shift);
        if (right - left < .1) continue;
        const u = (left + right) / 2;
        if (openings.some(o => y > o.y0 && y < o.y0 + o.h && Math.abs(u - o.u) < o.w / 2 + .2)) continue;
        const w = right - left - .03;
        const tint = row === 0 ? 'stoneDark' : (index + row * 3) % 6 ? 'stone' : 'stoneTrim';
        if (alongX) box(tint, u, y, face, w, .37, wallT); else box(tint, face, y, u, wallT, .37, w);
      }
    }
    // Window dressing: timber frame, warm glass, stone sill with snow.
    // Floor-level openings are doorways, not windows: no glass, frame or sill —
    // dressing the ZA-11 door span here is what sealed the office entrance
    // behind a full-span glass pane (Release 7/9 live failure, fixed 2026-11-21).
    for (const o of openings) {
      if (o.h < 1.5 || o.y0 < .5) continue;
      const cy = o.y0 + o.h / 2;
      const put = (tint: string, a: number, b: number, w: number, h: number, d: number, out: number) => {
        if (alongX) box(tint, a, b, face + out * side, w, h, d); else box(tint, face + out * side, b, a, d, h, w);
      };
      put('glass', o.u, cy, o.w - .18, o.h - .18, .06, .02);
      for (const edge of [-1, 1]) {
        put('timber', o.u + edge * (o.w / 2 + .02), cy, .13, o.h + .16, .3, -.02);
        put('timber', o.u, o.y0 + (edge > 0 ? o.h + .045 : -.045), o.w + .16, .13, .3, -.02);
      }
      put('stoneTrim', o.u, o.y0 - .08, o.w + .4, .17, .34, .1);
      put('snow', o.u, o.y0 + .03, o.w + .3, .05, .26, .14);
    }
    // Colliders follow the real openings: full-height spans between openings,
    // lintels above them and sills below windows — the door span stays passable.
    const seg = (u0: number, u1: number, y0: number, y1: number) => {
      if (u1 - u0 < .05 || y1 - y0 < .05) return;
      const uc = (u0 + u1) / 2, yc = (y0 + y1) / 2;
      colliders.push(alongX
        ? bounds([uc, yc, face], [u1 - u0, y1 - y0, wallT])
        : bounds([face, yc, uc], [wallT, y1 - y0, u1 - u0]));
    };
    const sorted = [...openings].sort((a, b) => a.u - b.u);
    let cursor = -length / 2;
    for (const o of sorted) {
      seg(cursor, o.u - o.w / 2, .3, wallTop + .3);
      seg(o.u - o.w / 2, o.u + o.w / 2, o.y0 + o.h, wallTop + .3);
      if (o.y0 > .35) seg(o.u - o.w / 2, o.u + o.w / 2, .3, o.y0);
      cursor = o.u + o.w / 2;
    }
    seg(cursor, length / 2, .3, wallTop + .3);
  }
  const win = (u: number) => ({ u, w: 1.8, h: 1.9, y0: 1.05 });
  wallRun(true, 1, [{ u: 0, w: doorHalf * 2, h: 3.1, y0: .3 }, ...frontWindows.map(win)]);
  wallRun(true, -1, backWindows.map(win));
  wallRun(false, 1, [win(0)]);
  wallRun(false, -1, [win(0)]);
  // Corner posts and wall plate.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    solid('timber', sx * (halfW - .05), 2.5, sz * (halfD - .05), .34, 4.4, .34);
  }
  for (const sz of [-1, 1]) box('timber', 0, wallTop + .38, sz * halfD, 20.5, .2, .3);
  for (const sx of [-1, 1]) box('timber', sx * halfW, wallTop + .38, 0, .3, .2, 16.5);

  // Interior partitions: 门厅 centre, 讲古位 west room, 星石环 east room. Door gaps face the hall.
  for (const px of [-3.4, 3.4]) {
    for (let row = 0; row < 10; row++) {
      const y = .55 + row * .4;
      for (let index = 0; index < 20; index++) {
        const z = -7.6 + index * .8 + .4;
        if (z > .6 && z < 3.4 && y < 3.2) continue; // doorway gap
        box((index + row) % 5 ? 'stone' : 'stoneTrim', px, y, z, .24, .37, .74);
      }
    }
    box('timber', px, 3.35, 2.0, .3, .35, 3.1); // doorway lintel
    for (const pz of [-7.9, 7.9, .55, 3.45]) box('timber', px, 2.35, pz, .32, 4.1, .3);
    colliders.push(bounds([px, 2.35, -5.7], [.3, 4.1, 4.6]), bounds([px, 2.35, 5.7], [.3, 4.1, 4.6]),
      bounds([px, 3.9, 2.0], [.3, 1.2, 3.1]));
  }

  // Gabled roof: stepped slate courses, snow patches, timber gable ends, one chimney.
  const ridgeY = wallTop + 2.7;
  for (let course = 0; course < 9; course++) {
    const y = ridgeY - course * .30;
    const zOff = course * .92;
    for (const side of [-1, 1]) {
      for (let strip = -10; strip < 10; strip++) {
        const x = strip + .5;
        box((strip + course) % 4 ? 'roof' : 'roofLight', x, y, side * (zOff + .46), 1.02, .3, .98);
        if (course > 2 && (strip * 5 + course * 3) % 7 > 2) box('snow', x, y + .19, side * (zOff + .46), .94, .13, .94);
      }
    }
  }
  box('snow', 0, ridgeY + .22, 0, 20.9, .16, .8);
  for (const sx of [-1, 1]) {
    for (let step = 0; step < 6; step++) {
      const w = 15.6 - step * 2.6;
      box(step % 2 ? 'timber' : 'stone', sx * (halfW + .02), wallTop + .75 + step * .42, 0, .24, .4, w);
    }
    colliders.push(bounds([sx * halfW, wallTop / 2 + .3, 0], [.4, wallTop + 2.4, 16]));
  }
  for (let y = 5.2; y < 8.4; y += .36) box((Math.round(y * 10) % 3) ? 'stone' : 'stoneTrim', -8.55, y, -5.5, 1.3, .32, 1.2);
  box('stoneDark', -8.55, 8.55, -5.5, 1.55, .24, 1.45);
  box('snow', -8.55, 8.72, -5.5, 1.6, .14, 1.5);

  // Porch over the front door.
  for (const px of [-1.9, 1.9]) solid('timber', px, 1.85, 9.35, .24, 3.7, .24);
  box('timber', 0, 3.78, 9.35, 4.6, .18, 1.9);
  box('roof', 0, 3.95, 9.35, 4.7, .14, 2.0);
  box('snow', 0, 4.08, 9.35, 4.5, .1, 1.8);
  // Blank door plaque (text pending review) and two door lanterns.
  box('timber', 0, 3.62, 8.24, 1.7, .62, .1);
  box('timberWarm', 0, 3.62, 8.3, 1.5, .44, .04);
  function lantern(x: number, y: number, z: number) {
    box('rust', x, y + .3, z, .4, .11, .4);
    box('goldLight', x, y, z, .22, .46, .22);
    box('timber', x, y - .28, z, .36, .1, .36);
    for (const dx of [-.12, .12]) for (const dz of [-.12, .12]) box('timber', x + dx, y, z + dz, .04, .5, .04);
  }
  lantern(-1.85, 2.5, 8.45);
  lantern(1.85, 2.5, 8.45);

  // ---- 门厅: sand-table town model, benches, tea corner ----
  solid('timber', 0, .85, 2.2, 3.6, .18, 1.9);
  for (const dx of [-1.6, 1.6]) for (const dz of [-.75, .75]) solid('timber', dx, .45, 2.2 + dz, .18, .9, .18);
  box('stoneTrim', 0, 1.0, 2.2, 3.3, .1, 1.6); // miniature plaza slab
  for (let i = 0; i < 6; i++) { // miniature houses
    const mx = -1.35 + i * .54, mz = 1.75 + (i % 2) * .85;
    box('stone', mx, 1.14, mz, .34, .18, .3);
    box('roof', mx, 1.28, mz, .4, .1, .36);
  }
  box('timber', -.5, 1.3, 2.6, .16, .5, .16); // miniature clock tower
  box('roof', -.5, 1.6, 2.6, .24, .12, .24);
  box('crystal', .7, 1.1, 1.8, .2, .08, .2); // miniature lake glint
  for (const bx of [-2.7, 2.7]) {
    solid('timber', bx, .62, 2.2, .5, .12, 3.4);
    for (const bz of [.8, 3.6]) solid('timber', bx, .3, bz, .44, .55, .14);
  }
  // Tea corner (front-east of the hall): stove, pot, cups — 热茶氛围件.
  solid('dark', 2.55, .75, 6.7, .8, .85, .8);
  box('rust', 2.55, 1.32, 6.7, .5, .3, .5);
  box('fire', 2.55, .95, 7.12, .4, .3, .04);
  box('stoneDark', 2.3, 1.55, 6.55, .34, .16, .34);
  box('timber', 2.3, 1.68, 6.55, .2, .1, .2);
  for (const c of [[-.14, 0], [.14, .1]]) box('paper', 2.72 + c[0], 1.24, 6.85 + c[1], .11, .07, .11);

  // ---- 失物招领角 (front-west corner of the hall): long table, grid shelf, three unclaimed pieces ----
  solid('timber', -2.35, .8, 6.85, 2.3, .14, .85);
  for (const dx of [-1.0, 1.0]) solid('timber', -2.35 + dx, .4, 6.85, .14, .8, .7);
  box('timber', -2.35, 2.0, 7.62, 2.5, 2.9, .12);
  for (const sy of [.75, 1.55, 2.35, 3.15]) box('timberWarm', -2.35, sy, 7.5, 2.5, .07, .5);
  for (const sx of [-3.55, -2.35, -1.15]) box('timber', sx, 2.0, 7.5, .07, 2.9, .5);
  for (const [gx, gy, tint] of [[-3.1, .95, 'paper'], [-1.7, .95, 'timberWarm'], [-2.9, 1.75, 'rust'], [-1.5, 2.55, 'paper'], [-3.2, 2.55, 'stoneTrim']] as const) {
    box(tint, gx, gy, 7.45, .42, .3, .34);
  }
  box('dark', -3.15, 1.05, 6.8, .07, .5, .07, .35); // the old umbrella, leaning
  box('rust', -3.15, 1.32, 6.72, .16, .05, .16);
  box('paper', -2.2, .92, 6.7, .3, .06, .22); // a single glove
  box('timber', -1.55, .93, 6.95, .44, .09, .32); // the coverless old book
  box('paper', -1.55, .99, 6.95, .4, .03, .28);

  // ---- 讲古位 (west room): fireplace, the mayor's empty chair, fresh tea, stool arc, old map, copied page ----
  solid('stoneDark', -9.55, 1.5, -1, .8, 3.0, 2.6);
  box('stone', -9.3, .75, -1, .5, .9, 1.1);
  box('dark', -9.35, .8, -1, .3, .55, .8);
  box('fire', -9.3, .62, -1, .22, .4, .55);
  box('timber', -9.28, .45, -1, .3, .12, .7);
  box('stoneTrim', -9.45, 3.1, -1, .7, .22, 2.8);
  box('rug', -6.6, .37, -1, 4.6, .03, 4.4);
  // The chair: high back, arms — kept empty; a fresh cup of tea waits beside it.
  solid('timber', -7.9, .75, -1, .85, .16, .95);
  solid('timber', -8.35, 1.75, -1, .16, 2.2, .95);
  box('timberWarm', -8.35, 2.9, -1, .18, .3, 1.0);
  for (const dz of [-.55, .55]) solid('timber', -7.55, 1.15, -1 + dz, .7, .12, .14);
  for (const dx of [-.3, .3]) for (const dz of [-.38, .38]) box('timber', -7.9 + dx, .38, -1 + dz, .12, .72, .12);
  solid('timber', -7.85, .62, .35, .55, .5, .55);
  box('paper', -7.85, .93, .35, .13, .09, .13); // today's fresh tea
  box('timberWarm', -7.85, .9, .35, .2, .02, .2);
  for (const [sx, sz] of [[-5.6, -2.3], [-5.2, -1], [-5.6, .3], [-6.6, 1.15]] as const) {
    solid('timberWarm', sx, .58, sz, .62, .1, .62);
    for (const dx of [-.22, .22]) for (const dz of [-.22, .22]) box('timber', sx + dx, .3, sz + dz, .09, .5, .09);
  }
  // Old town map (legend-layer strokes, no text) and the single copied chronicle page.
  function framedCanvas(x: number, y: number, z: number, w: number, h: number, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void) {
    box('timber', x, y, z, w + .18, h + .18, .07);
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 192;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    draw(ctx, 256, 192);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    const plane = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ map: texture }));
    plane.position.set(x, y, z + .05);
    model.add(plane);
  }
  framedCanvas(-6.9, 2.7, -7.78, 2.6, 1.9, (c) => {
    c.fillStyle = '#c9b083';
    c.fillRect(0, 0, 256, 192);
    c.strokeStyle = '#5d4630'; c.lineWidth = 4;
    c.strokeRect(10, 10, 236, 172);
    c.strokeStyle = '#7a9cc4'; c.lineWidth = 7;
    c.beginPath(); c.moveTo(0, 150); c.bezierCurveTo(80, 120, 150, 165, 256, 110); c.stroke();
    c.strokeStyle = '#5d4630'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(30, 170); c.lineTo(120, 90); c.lineTo(226, 60); c.stroke();
    c.beginPath(); c.moveTo(120, 90); c.lineTo(128, 20); c.stroke();
    c.fillStyle = '#8a4a34';
    for (const [dx, dy] of [[120, 90], [70, 130], [180, 70], [128, 30], [200, 120]] as const) c.fillRect(dx - 5, dy - 5, 10, 10);
  });
  framedCanvas(-4.6, 2.55, -7.78, 1.05, 1.5, (c) => {
    c.fillStyle = '#e8e0cc'; c.fillRect(0, 0, 256, 192);
    c.strokeStyle = '#5d4630'; c.lineWidth = 4; c.strokeRect(8, 8, 240, 176);
    c.fillStyle = 'rgba(93,70,48,.55)';
    for (let row = 0; row < 9; row++) c.fillRect(28, 26 + row * 16, 200 - (row % 3) * 22, 5);
  });

  // ---- 星石环 (east room): stepped base, the ring with its gap, twelve empty sockets, cellar hatch ----
  const [rcx, rcy, rcz] = STAR_RING_CENTER;
  box('stoneDark', rcx, .48, rcz, 1.1, .3, 4.6);
  box('stone', rcx, .72, rcz, .95, .2, 4.1);
  box('stoneTrim', rcx, .92, rcz, .8, .18, 3.6);
  floors.push(bounds([rcx, .45, rcz], [1.1, .3, 4.6]));
  const ringBlocks: { deg: number; y: number; z: number }[] = [];
  for (let deg = 0; deg < 360; deg += 12) {
    if (gapArc(deg)) continue;
    const rad = deg * Math.PI / 180;
    const y = rcy + STAR_RING_RADIUS * Math.cos(rad);
    const z = rcz - STAR_RING_RADIUS * Math.sin(rad);
    ringBlocks.push({ deg, y, z });
    box((deg % 48 === 0) ? 'stoneTrim' : 'stone', rcx, y, z, .3, .42, .42);
  }
  model.userData.ringBlockCount = ringBlocks.length;
  for (const [sx, sy, sz] of STAR_RING_SOCKETS) {
    box('dark', sx, sy, sz, .1, .3, .3);
    box('stoneDark', sx + .03, sy, sz, .06, .38, .38);
  }
  box('crystal', rcx - .1, 1.02, rcz, .3, .1, .3); // a faint crystal glint set into the base plate
  box('stoneDark', rcx - .3, 1.6, rcz, .08, .8, 1.1); // blank inscription plate (text pending review)
  lantern(rcx - 1.6, 1.9, rcz + 2.6);
  // Cellar hatch: the rat-stone cellar interface — stone rim, timber door, rust iron ring. Locked.
  const [hx, , hz] = CELLAR_HATCH_LOCAL;
  box('stoneTrim', hx, .38, hz, 1.7, .1, 1.7);
  box('timber', hx, .44, hz, 1.35, .07, 1.35);
  box('timber', hx, .485, hz, 1.35, .02, .18);
  for (const dx of [-.18, 0, .18]) box('rust', hx + dx, .5, hz + .3, .05, .05, .05);
  box('rust', hx, .52, hz - .3, .22, .05, .22);

  // ---- 留言板 (outside front wall, west of the door): posts, board, blank note papers, awning ----
  for (const px of [-6.1, -3.1]) solid('timber', px, 1.5, 8.75, .18, 3.0, .18);
  box('timber', -4.6, 2.25, 8.78, 3.6, 1.9, .1);
  box('timberWarm', -4.6, 2.25, 8.72, 3.4, 1.7, .05);
  for (let r = 0; r < 2; r++) for (let cix = 0; cix < 4; cix++) {
    if ((r * 4 + cix) % 3 === 1) continue;
    box('paper', -5.75 + cix * .78, 2.62 - r * .72, 8.68, .5, .58, .03, (cix % 2 ? -1 : 1) * .05);
  }
  box('roof', -4.6, 3.42, 8.85, 3.9, .12, 1.1);
  box('snow', -4.6, 3.53, 8.85, 3.7, .09, .95);

  // ---- 镇务公告墙 (front wall east section + 大事记 plaque row) ----
  box('rust', 4.9, 2.3, 8.24, 1.9, 2.3, .08);
  box('noticePaper', 4.9, 2.3, 8.29, 1.6, 2.0, .04);
  box('timber', 4.9, 3.55, 8.24, 2.1, .16, .1);
  for (let i = 0; i < 5; i++) {
    const px = 1.9 + i * 1.25;
    solid('timber', px, .55, 9.6, .14, 1.1, .14);
    box('timber', px, 1.35, 9.6, .8, .95, .07);
    box('timberWarm', px, 1.35, 9.56, .62, .76, .03);
  }

  // Interior warm light pools: hall lantern, story-corner firelight, ring-room lantern.
  const hallLight = new PointLight('#ffc18a', 90, 13, 2);
  hallLight.position.set(0, 3.4, 3.4);
  const fireLight = new PointLight('#e08a3c', 70, 10, 2);
  fireLight.position.set(-8.2, 1.6, -1);
  const ringLight = new PointLight('#ffc18a', 46, 9, 2);
  ringLight.position.set(rcx - 1.4, 2.6, rcz + 2.2);
  model.add(hallLight, fireLight, ringLight);

  const geometry = new BoxGeometry();
  const dummy = new Object3D();
  for (const [tint, blocks] of batches) {
    const mesh = new InstancedMesh(geometry, palette[tint], blocks.length);
    mesh.name = 'TownOffice ' + tint;
    blocks.forEach(({ position, size, roll }, index) => {
      dummy.position.set(...position);
      dummy.scale.set(...size);
      dummy.rotation.set(0, 0, roll);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    model.add(mesh);
  }
  model.userData.colliders = colliders;
  model.userData.floors = floors;
  model.userData.starRing = {
    centerLocal: STAR_RING_CENTER, radius: STAR_RING_RADIUS,
    gap: STAR_RING_GAP, socketsLocal: STAR_RING_SOCKETS, cellarHatchLocal: CELLAR_HATCH_LOCAL,
  };
  return model;
}
