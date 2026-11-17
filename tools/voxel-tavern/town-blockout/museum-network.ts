import { BoxGeometry, CanvasTexture, DoubleSide, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from 'three';
import type { MuseumBuilder } from './museum-kit';

const floor = 5.65;
const color = {
  shadow: '#37252b', walnut: '#674337', wood: '#8b5437', upperWood: '#b07549', brass: '#b68b50', gold: '#edc078',
  paper: '#ead9b4', parchment: '#ceac77', ink: '#574c46', jade: '#4f7878', garnet: '#963e45', blue: '#394d68',
  ceramic: '#a3b4b5', screen: '#203449', screenDark: '#192b3d', screenLight: '#aadad9', glassEdge: '#90bac3',
  stone: '#7c8089', stoneCap: '#a2a8b0', shade: '#ffd79b',
};

export const networkStops = [
  { id: 'terminal', x: -10.4, z: 5, label: '使用记忆检索台' },
  { id: 'screening', x: 0, z: -9.4, label: '打开影像放映台' },
  { id: 'collection', x: 9.45, z: 3.7, label: '翻阅网络记忆展柜' },
] as const;

const screeningSlides = [
  {
    label: '002 · 节目公开视频', topic: '马年春晚《武BOT》', caption: '节目影像可对照首发节目单，核对题名与播出时间。',
    date: '2026-02-16', month: 2, accent: '#efbd83',
  },
  {
    label: '004 · 公共活动通告', topic: '中国航天日科普展', caption: '从主管机构的原文核对活动地点、展品和开放安排。',
    date: '2026-04-24', month: 4, accent: '#94d3d8',
  },
  {
    label: '011 · 网络与城市', topic: '乌镇“互联网之光”', caption: '把线下展览与新闻报道对照，辨认同一事件的不同记录。',
    date: '2026-11-02', month: 11, accent: '#cbc2eb',
  },
] as const;
let screeningIndex = 0;

export function currentMuseumSlide(advance = false) {
  if (advance) screeningIndex = (screeningIndex + 1) % screeningSlides.length;
  return screeningSlides[screeningIndex];
}

function screeningPanel(m: MuseumBuilder, z: number) {
  if (typeof document === 'undefined') return;
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 416;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const panel = new Mesh(new PlaneGeometry(7.39, 3), new MeshBasicMaterial({ map: texture }));
  panel.name = '网络记忆放映屏';
  panel.position.set(0, floor + 2.27, z);
  m.group.add(panel);

  let rendered: ReturnType<typeof currentMuseumSlide> | undefined;
  const refresh = () => {
    const slide = currentMuseumSlide();
    if (rendered === slide) return;
    rendered = slide;
    ctx.fillStyle = '#162a39';
    ctx.fillRect(0, 0, 1024, 416);
    ctx.strokeStyle = slide.accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(26, 26, 972, 364);
    ctx.fillStyle = slide.accent;
    ctx.fillRect(26, 26, 5, 364);
    ctx.fillRect(58, 300, 908, 1);
    ctx.font = '600 27px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
    ctx.fillText('2026 纪念馆 · ' + slide.label, 61, 89, 900);
    ctx.fillStyle = '#f6ecdc';
    ctx.font = '700 66px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
    ctx.fillText(slide.topic, 58, 212, 908);
    ctx.font = '500 29px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
    ctx.fillText(slide.caption, 61, 262, 900);
    ctx.fillStyle = slide.accent;
    ctx.font = '500 24px system-ui, sans-serif';
    ctx.fillText(slide.date, 61, 350);
    ctx.textAlign = 'right';
    ctx.fillText(`${screeningIndex + 1} / ${screeningSlides.length}`, 964, 350);
    ctx.textAlign = 'left';
    texture.needsUpdate = true;
  };
  refresh();
  panel.onBeforeRender = refresh;
}

export function addMuseumNetwork(m: MuseumBuilder) {
  const { box, solid, beam, label } = m;
  const woodGrain = ['#815236', '#925e3f', '#87573c', '#9a6847', '#744536'];
  const rugTone = ['#634149', '#75474d', '#9f625d', '#ca967a'];
  const bookColors = ['#894450', '#566a79', '#687566', '#9a795a'];

  function insetFront(x: number, y: number, z: number, w: number, h: number) {
    box(color.walnut, x, y, z, w, h, .055);
    for (const side of [-1, 1]) {
      box(color.brass, x, y + side * (h - .09) / 2, z + .031, w - .10, .028, .018);
      box(color.brass, x + side * (w - .11) / 2, y, z + .031, .028, h - .09, .018);
    }
    box(color.gold, x, y + .03, z + .054, .15, .035, .039);
  }

  function drawerBank(x: number, z: number, w: number, d: number, h = .92) {
    solid(color.walnut, x, floor + h / 2, z, w, h, d);
    box(color.shadow, x, floor + .07, z, w + .14, .14, d + .13);
    box(color.upperWood, x, floor + h, z, w + .16, .105, d + .13);
    box(color.brass, x, floor + h - .065, z + d / 2 + .038, w + .13, .026, .025);
    const drawerWidth = (w - .20) / 3;
    for (let i = -1; i <= 1; i++) {
      insetFront(x + i * drawerWidth, floor + h * .69, z + d / 2 + .015, drawerWidth - .045, .27);
      insetFront(x + i * drawerWidth, floor + h * .35, z + d / 2 + .016, drawerWidth - .045, .29);
    }
  }

  function book(x: number, y: number, z: number, width: number, opened: boolean, tone: string) {
    const depth = width * .77;
    box(tone, x, y, z, width + .06, .045, depth + .06);
    box(opened ? color.paper : color.parchment, x, y + .042, z, width, .052, depth);
    if (!opened) {
      box(tone, x, y + .070, z, width + .05, .025, depth + .035);
      box(color.brass, x - width * .29, y + .085, z, .025, .009, depth - .065);
      return;
    }
    box(color.parchment, x, y + .071, z, .037, .020, depth + .01);
    for (const side of [-1, 1]) {
      box(color.paper, x + side * width * .25, y + .071, z, width * .45, .012, depth);
      for (let row = 0; row < 6; row++) {
        const length = width * (row === 5 ? .20 : .34);
        box(color.ink, x + side * width * .25, y + .079, z - depth * .29 + row * depth * .10, length, .005, .012);
      }
    }
  }

  function lamp(x: number, y: number, z: number, size: number) {
    box(color.brass, x, y + .10 * size, z, .56 * size, .20 * size, .56 * size);
    box(color.shade, x, y + .42 * size, z, .37 * size, .49 * size, .37 * size, 0, true);
    box(color.walnut, x, y + .67 * size, z, .53 * size, .11 * size, .53 * size);
    box(color.brass, x, y + .75 * size, z, .19 * size, .08 * size, .19 * size);
    for (const dx of [-.21, .21]) for (const dz of [-.21, .21]) {
      box(color.wood, x + dx * size, y + .42 * size, z + dz * size, .05 * size, .57 * size, .05 * size);
    }
  }

  function chair(x: number, z: number, towardNorth: boolean, tone: string) {
    const back = towardNorth ? 1 : -1;
    m.collider(x, floor + .46, z, .94, .93, .9);
    box(color.upperWood, x, floor + .55, z, 1.03, .12, .97);
    box(tone, x, floor + .627, z, .91, .06, .84);
    for (const sign of [-1, 1]) {
      box(color.walnut, x + sign * .43, floor + .26, z - back * .36, .086, .52, .095);
      box(color.walnut, x + sign * .43, floor + .69, z + back * .39, .09, 1.38, .105);
      box(color.brass, x + sign * .43, floor + 1.42, z + back * .39, .10, .075, .11);
    }
    for (const slat of [-.25, 0, .25]) {
      box(color.wood, x + slat, floor + 1.016, z + back * .39, .087, .58, .063);
    }
    box(color.upperWood, x, floor + 1.29, z + back * .39, .90, .11, .115);
  }

  function table(x: number, z: number, accent: string) {
    const width = 4.5;
    const depth = 1.74;
    const surface = floor + .99;
    solid(color.wood, x, surface - .065, z, width, .13, depth);
    box(color.brass, x, surface - .11, z + .88, width - .09, .022, .028);
    box(color.walnut, x, floor + .21, z, 3.83, .11, .12);
    for (const side of [-1, 1]) {
      for (const facing of [-1, 1]) {
        box(color.walnut, x + side * 2.02, floor + .45, z + facing * .69, .18, .91, .18);
        box(color.upperWood, x + side * 2.02, floor + .13, z + facing * .69, .24, .11, .23);
      }
      insetFront(x + side * 1.21, surface - .17, z + .776, 1.55, .15);
      chair(x + side * 1.25, z + 1.66, true, accent);
      chair(x + side * 1.25, z - 1.58, false, accent);
      book(x + side * .88, surface + .04, z + side * .22, .83, true, color.garnet);
    }
    for (let plank = 0; plank < 11; plank++) {
      box(woodGrain[plank % woodGrain.length], x - 2.07 + plank * .414, surface + .007, z, .409, .018, depth - .045);
    }
    lamp(x + 1.82, surface, z - .19, .57);
    for (let i = 0; i < 4; i++) book(x - 1.72, surface + .024 + i * .089, z + .21, .64 - i * .05, false, bookColors[i]);
    box(accent, x, surface + .018, z, .44, .016, 1.71);
  }

  function rug(x: number, z: number, w: number, d: number) {
    box(rugTone[0], x, floor + .018, z, w, .031, d);
    box(rugTone[1], x, floor + .028, z, w - .35, .016, d - .35);
    for (const side of [-1, 1]) {
      box(rugTone[2], x + side * (w / 2 - .28), floor + .041, z, .065, .011, d - .62);
      box(rugTone[2], x, floor + .041, z + side * (d / 2 - .28), w - .55, .011, .065);
      for (let i = 0; i < 10; i++) {
        const xx = x - w * .37 + i * w * .082;
        box(rugTone[3], xx, floor + .041, z + side * (d / 2 - .43), .10, .01, .10, Math.PI / 4);
      }
    }
  }

  function column(x: number, z: number, tall: number) {
    solid(color.stone, x, floor + .16, z, .85, .32, .85);
    box(color.stoneCap, x, floor + .36, z, .75, .10, .75);
    box(color.walnut, x, floor + tall / 2, z, .49, tall, .49);
    for (const side of [-1, 1]) {
      box(color.upperWood, x + side * .21, floor + tall / 2, z + .249, .058, tall - .45, .016);
      box(color.brass, x + side * .27, floor + tall - .25, z, .15, .14, .57);
    }
    for (let step = 0; step < 4; step++) {
      box(step % 2 ? color.wood : color.upperWood, x, floor + tall - .75 + step * .17, z,
        .52 + step * .21, .16, .61 + step * .19);
    }
  }

  for (const z of [-11.3, -.6, 9.35]) {
    for (const x of [-12.4, 12.4]) column(x, z, 4.60);
    box(color.walnut, 0, floor + 4.64, z, 25.2, .31, .46);
    box(color.upperWood, 0, floor + 4.49, z, 24.5, .07, .53);
    for (const side of [-1, 1]) lamp(side * 6.3, floor + 3.65, z, .78);
  }
  for (const x of [-9.8, -6.3, -3.2, 0, 3.2, 6.3, 9.8]) {
    box(color.wood, x, floor + 4.78, -1.2, .18, .24, 23.8);
    box(color.upperWood, x + .077, floor + 4.69, -1.2, .05, .10, 23.8);
  }

  // Reading-room furniture is split around the central aisle and the terrace cross-passage.
  for (const side of [-1, 1]) {
    const x = side * 3.9;
    rug(x, 8.35, 5.45, 5.08);
    table(x, 8.35, side < 0 ? color.jade : color.garnet);
  }
  for (const z of [-.5, 3.3, 8.8]) {
    const x = -18.3;
    solid(color.walnut, x, floor + .32, z, .83, .64, 2.5);
    box(color.upperWood, x, floor + .64, z, .91, .12, 2.59);
    box(color.garnet, x + .03, floor + .77, z, .79, .17, 2.39);
    box(color.wood, x - .39, floor + .86, z, .16, .53, 2.49);
    for (const end of [-1, 1]) {
      box(color.brass, x + .12, floor + .82, z + end * 1.24, .65, .12, .13);
      box(color.paper, x -.20, floor + .91, z + end * .83, .35, .26, .3);
    }
  }

  // Small archive objects use original, anonymous designs.
  function vessel(x: number, y: number, z: number, tone: string, size: number) {
    for (let i = 0; i < 6; i++) {
      const profile = [.36, .49, .54, .48, .29, .33][i] * size;
      box(tone, x, y + (.038 + i * .087) * size, z, profile, .086 * size, profile, Math.PI / 4);
    }
    for (const side of [-1, 1]) {
      beam(color.wood, [x, y + .48 * size, z], [x + side * .21 * size, y + .85 * size, z + .12 * size], .034 * size);
      box(color.garnet, x + side * .21 * size, y + .84 * size, z + .12 * size, .17 * size, .14 * size, .13 * size);
    }
  }

  // Each model uses integer ticks at its mounting surface. Adjacent ticks
  // share edges, so reel teeth and keycaps are real geometry at 1/64 m.
  function detailFrame(x: number, y: number, z: number, faceEast = false) {
    const gx = Math.round(x * 64) / 64;
    const gy = Math.ceil(y * 64) / 64;
    const gz = Math.round(z * 64) / 64;
    return (paint: string, left: number, base: number, back: number,
      width: number, height: number, depth: number, glow = false) => {
      const [u, v, w] = [(left + width / 2) / 64, (base + height / 2) / 64, (back + depth / 2) / 64];
      if (faceEast) m.detailBox(paint, gx + w, gy + v, gz - u, depth / 64, height / 64, width / 64, 0, glow);
      else m.detailBox(paint, gx + u, gy + v, gz + w, width / 64, height / 64, depth / 64, 0, glow);
    };
  }
  type MicroBox = ReturnType<typeof detailFrame>;
  const enamel = '#bfc4b5';
  const cream = '#eeddb4';
  const graphite = '#29363e';
  const teal = '#38716f';
  const copper = '#dcaa67';
  const paleGreen = '#c1f2c2';

  function reel(part: MicroBox, x: number, y: number, z: number, radius: number, edge: string, center: string) {
    for (let v = -radius; v <= radius; v++) {
      const u = Math.floor(Math.sqrt(radius * radius - v * v));
      part(edge, x - u, y + v, z, u * 2 + 1, 1, 3);
      const hub = radius - 3;
      if (Math.abs(v) > hub) continue;
      const span = Math.floor(Math.sqrt(hub * hub - v * v));
      part(center, x - span, y + v, z + 3, span * 2 + 1, 1, 2);
    }
    part(cream, x - 1, y - 2, z + 5, 3, 5, 1);
    part(cream, x - 2, y - 1, z + 5, 5, 3, 1);
  }

  function portableRadio(part: MicroBox) {
    for (const x of [-25, 18]) part(graphite, x, 0, -9, 7, 2, 18);
    part(color.walnut, -27, 2, -13, 54, 25, 26);
    part(color.upperWood, -25, 4, -14, 50, 21, 2);
    part(color.upperWood, -25, 26, -11, 50, 2, 23);
    part(enamel, -25, 5, 13, 50, 18, 2);
    part(graphite, -22, 9, 15, 18, 11, 1);
    part(teal, -19, 12, 16, 12, 5, 1);
    for (const x of [-18, -15, -12, -9]) part(cream, x, 13, 17, 1, 2, 1, true);
    for (let row = 0; row < 6; row++) {
      const n = row === 0 || row === 5 ? 6 : 8;
      for (let col = 0; col < n; col++) part(graphite, 5 + 2 * col + (n === 6 ? 2 : 0), 9 + row * 2, 15, 1, 1, 1);
    }
    reel(part, 22, 12, 15, 3, color.shadow, color.brass);
    for (let i = 0; i < 4; i++) part(i === 0 ? color.garnet : cream, -16 + 6 * i, 27, 4, 4, 2, 6);
    part(color.brass, 25, 28, -7, 1, 4, 1);
  }

  function magneticTape(part: MicroBox) {
    part(color.walnut, -29, 0, -11, 58, 3, 23);
    part(graphite, -26, 3, -4, 52, 29, 12);
    part(color.stoneCap, -24, 6, 8, 48, 24, 2);
    part(color.shadow, -22, 12, 10, 44, 17, 1);
    part(color.upperWood, -20, 11, 11, 40, 2, 1);
    part(copper, -14, 26, 11, 28, 1, 2);
    for (const x of [-13, 13]) {
      reel(part, x, 20, 11, 7, cream, color.stone);
      part(color.shadow, x - 1, 19, 17, 3, 3, 1);
    }
    for (const x of [-23, 22]) for (const y of [7, 28]) part(copper, x, y, 11, 1, 1, 1);
    part(color.garnet, -17, 7, 11, 34, 3, 1);
    for (const x of [-13, -8, 8, 13]) part(cream, x, 8, 12, 2, 1, 1);
  }

  function archiveBoard(part: MicroBox) {
    part('#876448', -29, 0, -12, 58, 3, 23);
    part(graphite, -24, 3, -8, 2, 29, 17);
    part(graphite, 22, 3, -8, 2, 29, 17);
    part(teal, -23, 4, -1, 46, 28, 4);
    part('#204f54', -19, 6, 3, 38, 25, 1);
    for (const [x, y, w, h] of [[-8, 15, 15, 10], [9, 23, 10, 6], [-18, 7, 7, 9]]) {
      part(graphite, x, y, 4, w, h, 3);
      part(enamel, x + 2, y + h - 3, 7, w - 4, 1, 1);
      for (let pin = 1; pin < w; pin += 2) {
        part(copper, x + pin, y - 2, 4, 1, 2, 1);
        part(copper, x + pin, y + h, 4, 1, 2, 1);
      }
    }
    for (let trace = 0; trace < 6; trace++) {
      const x = 9 + trace * 2;
      const y = 7 + trace * 2;
      part(copper, 2, y, 4, x - 1, 1, 1);
      part(copper, x, Math.min(y, 16), 4, 1, Math.abs(16 - y) + 1, 1);
      part(copper, x, 6, 4, 1, 1, 2);
    }
    for (let pin = 0; pin < 12; pin++) part(copper, -19 + pin * 3, 4, 3, 1, 2, 1);
    for (const x of [-21, 21]) for (const y of [6, 29]) part(cream, x, y, 4, 1, 1, 1);
    for (const [x,y] of [[-13,24],[-17,22],[18,13]]) {
      part(color.stoneCap, x, y, 4, 3, 3, 2);
      part('#9fd2b2', x + 1, y + 1, 6, 1, 1, 1, true);
    }
  }

  function terminalComputer(part: MicroBox, variant: number) {
    part(graphite, -21, 0, -18, 42, 4, 39);
    part(enamel, -17, 4, -14, 34, 7, 31);
    part(enamel, -35, 11, -25, 70, 49, 45);
    part(cream, -32, 13, 20, 64, 45, 4);
    part(graphite, -27, 19, 24, 54, 33, 2);
    part('#1a4240', -24, 22, 26, 48, 27, 1, true);
    part(teal, -22, 25, 27, 44, 21, 1);
    const indexed = variant % 2 === 0;
    for (let row = 0; row < 5; row++) {
      part(indexed ? paleGreen : '#e7dcb2', -19, 43 - row * 4, 28, 9 + (row * 5 + variant) % 20, 1, 1, true);
      part('#82cabb', 14, 43 - row * 4, 28, 4 + row % 3, 1, 1, true);
    }
    part(color.stone, -24, 15, 24, 32, 1, 1);
    part(color.garnet, 20, 14, 24, 4, 3, 1);
    part('#9fd2b2', 27, 15, 24, 1, 1, 1, true);
    for (let slot = 0; slot < 10; slot++) part(graphite, -27 + slot * 5, 59, -18, 1, 1, 16);
    for (let slot = 0; slot < 6; slot++) {
      part(color.stone, -35, 39 + slot * 3, -14, 1, 1, 23);
      part(color.stone, 34, 39 + slot * 3, -14, 1, 1, 23);
    }

    part(graphite, -28, 0, 35, 56, 4, 30);
    part(enamel, -27, 4, 35, 54, 3, 28);
    const rowTones = [cream, '#d6c7a6', cream, '#d4c6a3'];
    for (let row = 0; row < 4; row++) {
      for (let key = 0; key < 10; key++) {
        const left = -24 + key * 5 + (row % 2);
        const front = 38 + row * 5;
        part(rowTones[row], left, 7, front, 4, 2, 4);
        part(color.stone, left + 1, 9, front + 1, 1, 1, 1);
      }
    }
    part(cream, -13, 7, 58, 26, 2, 4);
  }

  const caseX = 9.45;
  const caseZ = 1.10;
  const caseTop = floor + .98;
  drawerBank(caseX, caseZ, 3.58, 1.6, .96);
  box(color.jade, caseX, caseTop + .032, caseZ, 3.38, .065, 1.42);
  const glassGeometry = new BoxGeometry();
  const glassMaterial = new MeshBasicMaterial({ color: '#afdbd8', side: DoubleSide, transparent: true, opacity: .105, depthWrite: false });
  function caseGlass(x: number, y: number, z: number, w: number, h: number, d: number) {
    const glass = new Mesh(glassGeometry, glassMaterial);
    glass.position.set(x, y, z);
    glass.scale.set(w, h, d);
    m.group.add(glass);
  }
  for (const side of [-1, 1]) {
    box(color.glassEdge, caseX + side * 1.72, caseTop + .58, caseZ, .039, .049, 1.52);
    box(color.glassEdge, caseX, caseTop + .58, caseZ + side * .76, 3.43, .049, .039);
    caseGlass(caseX + side * 1.72, caseTop + .30, caseZ, .012, .54, 1.50);
    caseGlass(caseX, caseTop + .30, caseZ + side * .76, 3.41, .54, .012);
    for (const end of [-1, 1]) {
      box(color.glassEdge, caseX + side * 1.72, caseTop + .29, caseZ + end * .76, .047, .58, .047);
    }
  }
  caseGlass(caseX, caseTop + .58, caseZ, 3.41, .012, 1.51);
  beam('#688991', [caseX - 1.69, caseTop + .19, caseZ + .77], [caseX - 1.16, caseTop + .56, caseZ + .77], .017);
  beam('#688991', [caseX - 1.46, caseTop + .14, caseZ + .77], [caseX - .94, caseTop + .51, caseZ + .77], .012);
  const objectBase = caseTop + .065;
  portableRadio(detailFrame(caseX - 1.09, objectBase, caseZ - .22));
  magneticTape(detailFrame(caseX, objectBase, caseZ - .22));
  archiveBoard(detailFrame(caseX + 1.09, objectBase, caseZ - .28));
  for (const [offset, title] of [[-1.09, '便携电台'], [0, '双轮磁带'], [1.09, '档案电路板']] as const) {
    const x = caseX + offset;
    box(color.shadow, x, caseTop + .041, caseZ + .42, .87, .078, .16);
    label(title, x, caseTop + .043, caseZ + .505, .79, .062, 0,
      { background: color.shadow, color: '#edd3a0', border: false });
  }
  const goldOnWood = { background: '#3e2728', color: '#f5d5ab', accent: '#966746' };

  function stationSign(title: string, x: number, y: number, z: number, width: number, depth: number, angle: number, accent: string) {
    const dx = Math.sin(angle), dz = Math.cos(angle);
    m.detailBox(accent, x, y, z, width + .13, .49, depth, angle);
    m.detailBox(color.shadow, x + dx * (depth / 2 + .016), y, z + dz * (depth / 2 + .016), width, .385, .037, angle);
    label(title, x + dx * (depth / 2 + .046), y, z + dz * (depth / 2 + .046), width - .08, .335, angle,
      { ...goldOnWood, accent });
  }

  // Keep the direction key at the stair landing and pair each line with a
  // matching badge at its station. Supports are above the walking envelope.
  const directoryX = 15.65, directoryZ = -12.90, directoryY = floor + 2.53;
  for (const dx of [-1.34, 1.34]) {
    beam(color.walnut, [directoryX + dx, directoryY + .55, directoryZ],
      [directoryX + dx, floor + 4.63, -11.3], .064);
    m.detailBox(color.brass, directoryX + dx, directoryY + .54, directoryZ + .11, .12, .18, .045);
  }
  m.detailBox(color.walnut, directoryX, directoryY, directoryZ, 4.11, 1.19, .16);
  m.detailBox(color.brass, directoryX, directoryY + .55, directoryZ + .088, 4.09, .031, .031);
  m.detailBox(color.brass, directoryX, directoryY - .55, directoryZ + .088, 4.09, .031, .031);
  const directoryLines = [
    ['01  西侧 · 记忆检索台', color.jade],
    ['02  北侧 · 影像放映台', color.brass],
    ['03  东侧 · 网络记忆展柜', color.garnet],
  ] as const;
  directoryLines.forEach(([title, accent], i) => {
    const y = directoryY + .33 - i * .33;
    m.detailBox(accent, directoryX - 1.85, y, directoryZ + .088, .19, .24, .032);
    label(title, directoryX + .022, y, directoryZ + .104, 3.49, .285, 0, { ...goldOnWood, accent });
  });

  for (const dx of [-1.05, 1.05]) {
    m.detailBox(color.walnut, caseX + dx, floor + 3.63, caseZ - .58, .064, 1.75, .064);
    beam(color.walnut, [caseX + dx, floor + 4.50, caseZ - .58], [9.8, floor + 4.72, caseZ - .58], .062);
  }
  stationSign('03  网络记忆展柜', caseX, floor + 2.71, caseZ - .58, 2.66, .13, 0, color.garnet);
  for (const offset of [-1.09, 0, 1.09]) {
    m.detailBox(color.shade, caseX + offset, caseTop + .55, caseZ + .718, .63, .018, .035, 0, true);
  }

  function readingPacket(part: MicroBox, accent: string) {
    part(accent, -12, 0, -16, 24, 2, 32);
    part(color.parchment, -10, 2, -14, 20, 1, 28);
    part(color.paper, -9, 3, -13, 18, 1, 26);
    part(color.brass, -4, 4, -13, 8, 2, 4);
    part(color.ink, -6, 4, -6, 11, 1, 1);
    for (let row = 0; row < 4; row++) part(color.parchment, -6, 4, -2 + row * 3, 12 - row % 2 * 3, 1, 1);
    part(color.brass, 15, 0, -11, 2, 2, 20);
    part(color.ink, 15, 1, 9, 2, 1, 2);
    part(color.garnet, 15, 1, -13, 2, 1, 2);
  }
  for (const side of [-1, 1]) {
    readingPacket(detailFrame(side * 3.9 + 1.32, floor + 1.01, 7.91),
      side < 0 ? color.jade : color.garnet);
  }

  const terminalX = -13.25;
  const terminalZ = 5.0;
  solid(color.walnut, terminalX, floor + .47, terminalZ, 1.6, .94, 3.48);
  box(color.upperWood, terminalX, floor + .99, terminalZ, 1.74, .14, 3.65);
  box(color.brass, terminalX + .883, floor + .93, terminalZ, .024, .031, 3.56);
  for (const [variant, z] of [terminalZ - .65, terminalZ + .66].entries()) {
    terminalComputer(detailFrame(terminalX - .36, floor + 1.06, z, true), variant);
  }
  stationSign('01  记忆检索台', terminalX - .15, floor + 2.50, terminalZ, 2.82, .18, Math.PI / 2, color.jade);
  const indexTray = detailFrame(terminalX + .42, floor + 1.06, terminalZ + 1.39, true);
  indexTray(color.walnut, -13, 0, -10, 26, 2, 19);
  indexTray(color.brass, -12, 2, 7, 24, 1, 2);
  for (let i = 0; i < 3; i++) {
    const u = -10 + i * 6;
    indexTray(color.parchment, u, 2, -7 + i, 10, 1, 12);
    indexTray(i === 1 ? color.paper : color.parchment, u + 1, 3, -7 + i, 8, 1, 11);
    indexTray(color.gold, u + 3, 4, 1 + i, 3, 1, 1);
  }

  const screenZ = -12.80;
  solid(color.walnut, 0, floor + 2.17, screenZ, 8.08, 3.85, .33);
  box(color.brass, 0, floor + 2.27, screenZ + .185, 7.77, 3.36, .11);
  box(color.screenDark, 0, floor + 2.27, screenZ + .258, 7.42, 3.01, .049);
  for (const side of [-1, 1]) {
    box(color.wood, side * 4.19, floor + 2.05, screenZ, .33, 3.62, .52);
    box(color.brass, side * 4.19, floor + 3.86, screenZ, .46, .14, .70);
  }
  screeningPanel(m, screenZ + .285);
  stationSign('02  影像放映台', 0, floor + 4.35, screenZ + .15, 3.00, .13, 0, color.brass);
  drawerBank(-4.89, -9.42, 1.26, 1.1, .74);
  box(color.shadow, -4.89, floor + 1.02, -9.43, .87, .45, .55);
  box(color.brass, -4.89, floor + 1.02, -9.735, .34, .26, .16);
  box(color.screenLight, -4.89, floor + 1.02, -9.828, .19, .15, .045, 0, true);
  for (const x of [-3.43, 3.43]) {
    solid(color.walnut, x, floor + .31, -7.7, 2.06, .62, .88);
    box(color.garnet, x, floor + .65, -7.65, 2.03, .12, .74);
    box(color.wood, x, floor + .78, -7.25, 2.13, .27, .105);
  }

  const rackX = -15.52;
  const rackZ = -12.1;
  const rackWidth = 4.2;
  solid(color.walnut, rackX, floor + 1.57, rackZ, rackWidth, 3.14, .86);
  for (const side of [-1, 1]) {
    box(color.wood, rackX + side * 2.13, floor + 1.58, rackZ + .15, .16, 3.18, 1.27);
    box(color.brass, rackX + side * 2.21, floor + .24, rackZ + .76, .05, .42, .09);
  }
  for (let row = 0; row < 4; row++) {
    const height = floor + .38 + row * .72;
    box(color.upperWood, rackX, height, rackZ + .17, rackWidth + .15, .09, 1.42);
    box(color.brass, rackX, height + .021, rackZ + .90, rackWidth + .10, .025, .018);
    for (let i = 0; i < 12; i++) {
      const xx = rackX - 1.71 + i * .30;
      const h = .29 + ((row * 11 + i * 7) % 9) * .033;
      const tone = bookColors[(row * 3 + i * 7) % bookColors.length];
      box(tone, xx, height + .055 + h / 2, rackZ + .62, .23, h, .46);
      box(color.brass, xx, height + .11, rackZ + .855, .18, .026, .013);
      box(color.parchment, xx, height + .055 + h * .7, rackZ + .856, .12, .091, .014);
    }
  }
  box(color.wood, rackX, floor + 3.22, rackZ, rackWidth + .37, .21, 1.38);
  label('公共资料阅览架', rackX, floor + 3.32, rackZ + .73, 2.15, .25, 0, goldOnWood);

  for (const [x, z, tone] of [[-17.15, -6.6, color.ceramic], [-17.15, -1.7, color.garnet], [11.65, 10.75, color.jade]] as const) {
    drawerBank(x, z, .93, .84, .81);
    vessel(x, floor + .87, z, tone, 1.22);
  }

  for (const [index, z, title] of [[0, 1.9, '阅览区'], [1, 8.4, '公共记忆']] as const) {
    box(color.wood, -19.60, floor + 2.23, z, .14, 1.0, .94);
    box(color.paper, -19.515, floor + 2.23, z, .035, .84, .79);
    box(index ? color.garnet : color.jade, -19.49, floor + 2.38, z, .025, .27, .65);
    label(title, -19.466, floor + 2.05, z, .71, .23, Math.PI / 2, { background: color.paper, color: color.shadow, border: false });
  }

  // Leave the west terrace crossing at z = -4 and the central aisle open.
  // The work station and cabinets sit in the bays between those routes.
  const bindingX = -5.75, bindingZ = .35, bindingSurface = floor + .99;
  m.collider(bindingX, floor + .52, bindingZ, 3.44, 1.04, 1.48);
  box(color.walnut, bindingX, bindingSurface - .09, bindingZ, 3.44, .18, 1.48);
  box(color.upperWood, bindingX, bindingSurface + .012, bindingZ, 3.41, .03, 1.47);
  box(color.brass, bindingX, bindingSurface - .1, bindingZ + .75, 3.18, .035, .027);
  for (const side of [-1, 1]) {
    const xx = bindingX + side * 1.47;
    for (const end of [-1, 1]) {
      box(color.wood, xx, floor + .44, bindingZ + end * .57, .15, .89, .14);
      box(color.shadow, xx, floor + .08, bindingZ + end * .57, .19, .13, .17);
    }
    box(color.upperWood, xx, floor + .29, bindingZ, .13, .14, 1.13);
  }
  box(color.walnut, bindingX, floor + .29, bindingZ, 2.88, .13, .20);
  insetFront(bindingX, bindingSurface - .18, bindingZ + .716, 1.36, .18);
  label('档案装订', bindingX, bindingSurface - .14, bindingZ + .79, .91, .17, 0, goldOnWood);
  box(color.jade, bindingX + .2, bindingSurface + .036, bindingZ + .14, 1.55, .023, .77);
  book(bindingX + .18, bindingSurface + .062, bindingZ + .11, 1.04, true, color.garnet);
  for (let i = 0; i < 3; i++) {
    book(bindingX - 1.04, bindingSurface + .023 + i * .090, bindingZ + .12, .65 - i * .053, false, bookColors[i]);
  }
  readingPacket(detailFrame(bindingX + .87, bindingSurface + .055, bindingZ + .42), color.garnet);
  lamp(bindingX + 1.37, bindingSurface + .027, bindingZ - .40, .60);
  m.light(bindingX + 1.10, floor + 1.82, bindingZ - .07, '#ffd5a2', 17, 5.6);

  const filesX = 5.22, filesZ = 1.94, filesW = 2.56;
  drawerBank(filesX, filesZ, filesW, .92, .73);
  m.collider(filesX, floor + 1.45, filesZ, filesW + .15, 1.48, .93);
  box(color.shadow, filesX, floor + 1.46, filesZ - .38, filesW, 1.47, .13);
  for (const side of [-1, 1]) {
    box(color.wood, filesX + side * 1.28, floor + 1.46, filesZ, .13, 1.46, .94);
    box(color.brass, filesX + side * 1.28, floor + 1.69, filesZ + .48, .05, .75, .025);
  }
  for (let row = 0; row < 2; row++) {
    const y = floor + .78 + row * .65;
    box(color.upperWood, filesX, y, filesZ, filesW, .071, .89);
    m.detailBox(color.brass, filesX, y + .022, filesZ + .45, filesW - .07, .021, .023);
    for (let slot = 0; slot < 8; slot++) {
      if ((row + slot) % 7 === 3) continue;
      const x = filesX - .97 + slot * .277;
      const h = .32 + ((slot * 3 + row) % 4) * .045;
      const paint = bookColors[(slot + row * 3) % bookColors.length];
      m.detailBox(paint, x, y + .043 + h / 2, filesZ + .13, .210, h, .46);
      m.detailBox(color.parchment, x, y + .11, filesZ + .369, .125, .061, .018);
      m.detailBox(color.brass, x, y + .22, filesZ + .374, .11, .014, .014);
    }
  }
  box(color.walnut, filesX, floor + 2.20, filesZ, filesW + .15, .18, 1.04);
  box(color.brass, filesX, floor + 2.20, filesZ + .524, 1.08, .17, .034);
  label('年度剪报', filesX, floor + 2.20, filesZ + .545, .95, .14, 0, goldOnWood);
  lamp(filesX - .92, floor + 2.29, filesZ, .55);

  const mediaX = 7.35, mediaZ = -7.03;
  drawerBank(mediaX, mediaZ, 2.36, 1.10, .81);
  box(color.jade, mediaX, floor + .88, mediaZ, 2.06, .042, .91);
  const viewerPart = detailFrame(mediaX + .23, floor + .905, mediaZ - .11);
  viewerPart(color.shadow, -29, 0, -20, 58, 4, 37);
  viewerPart(color.walnut, -27, 4, -14, 54, 16, 28);
  viewerPart(color.upperWood, -24, 6, 14, 48, 11, 2);
  viewerPart(color.brass, 11, 8, 16, 15, 11, 2);
  reel(viewerPart, -14, 29, -6, 10, graphite, color.stoneCap);
  reel(viewerPart, 8, 28, -6, 9, graphite, color.brass);
  viewerPart(color.jade, -19, 8, 17, 10, 6, 1);
  viewerPart('#fee09e', -11, 9, 18, 2, 4, 1, true);
  viewerPart(color.brass, 24, 6, 14, 5, 9, 2);
  book(mediaX - .79, floor + .905, mediaZ + .13, .45, false, color.garnet);
  label('双盘放映机', mediaX, floor + .841, mediaZ + .628, 1.13, .17, 0, goldOnWood);
  for (const side of [-1, 1]) {
    const x = mediaX + side * 1.10;
    for (const end of [-1, 1]) {
      box(color.glassEdge, x, floor + 1.27, mediaZ + end * .455, .034, .71, .034);
    }
    box(color.glassEdge, mediaX, floor + 1.62, mediaZ + side * .455, 2.18, .037, .043);
    caseGlass(x, floor + 1.27, mediaZ, .015, .70, .90);
  }
  caseGlass(mediaX, floor + 1.62, mediaZ, 2.18, .014, .91);
  caseGlass(mediaX, floor + 1.27, mediaZ + .455, 2.18, .69, .014);

  const foliosX = -7.4, foliosZ = -7.0;
  drawerBank(foliosX, foliosZ, 2.30, .94, .82);
  book(foliosX - .38, floor + .88, foliosZ + .05, .88, true, color.jade);
  for (let i = 0; i < 3; i++) book(foliosX + .62, floor + .88 + i * .087, foliosZ, .54 - i * .043, false, bookColors[i + 1]);
  label('公开资料选页', foliosX, floor + .828, foliosZ + .537, 1.22, .17, 0, goldOnWood);
  lamp(foliosX - .88, floor + .88, foliosZ - .28, .47);

  m.light(-7.3, floor + 3.82, 7.6, '#ffd4a1', 91, 14);
  m.light(5.2, floor + 3.92, -8.7, '#f7c69c', 86, 15);
}
