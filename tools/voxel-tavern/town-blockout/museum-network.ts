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
  vessel(caseX - 1.01, caseTop + .07, caseZ -.16, color.ceramic, .65);
  book(caseX - .25, caseTop + .12, caseZ -.02, .62, true, color.garnet);
  box(color.wood, caseX + .77, caseTop + .20, caseZ, .73, .31, .47);
  box(color.brass, caseX + .77, caseTop + .37, caseZ, .76, .055, .49);
  box(color.shadow, caseX + .77, caseTop + .23, caseZ + .241, .56, .238, .025);
  box(color.jade, caseX + .91, caseTop + .25, caseZ + .256, .155, .14, .019);
  for (let i = 0; i < 5; i++) {
    box(color.brass, caseX + .55 + i * .038, caseTop + .24, caseZ + .254, .015, .14, .011);
    box(color.brass, caseX + .55 + i * .065, caseTop + .409, caseZ + .15, .032, .025, .06);
  }
  const goldOnWood = { background: '#3e2728', color: '#f5d5ab', accent: '#966746' };
  label('网络记忆选集', caseX, floor + .70, caseZ + .836, 1.50, .24, 0, goldOnWood);

  const terminalX = -13.25;
  const terminalZ = 5.0;
  solid(color.walnut, terminalX, floor + .47, terminalZ, 1.6, .94, 3.48);
  box(color.upperWood, terminalX, floor + .99, terminalZ, 1.74, .14, 3.65);
  box(color.brass, terminalX + .883, floor + .93, terminalZ, .024, .031, 3.56);
  for (const z of [terminalZ - .65, terminalZ + .66]) {
    box(color.wood, terminalX -.44, floor + 1.21, z, .51, .17, .77);
    box(color.shadow, terminalX -.56, floor + 1.67, z, .30, .81, 1.12);
    box(color.screen, terminalX -.394, floor + 1.68, z, .038, .60, .89);
    for (let line = 0; line < 4; line++) {
      box(line === 0 ? color.parchment : color.screenLight, terminalX -.369, floor + 1.84 - line * .12, z - .04,
        .013, line === 0 ? .05 : .025, .66 - (line % 2) * .14, 0, true);
    }
    box(color.shadow, terminalX + .42, floor + 1.09, z, .4, .070, .68);
    for (let i = 0; i < 5; i++) for (let row = 0; row < 3; row++) {
      box(color.paper, terminalX + .29 + row * .092, floor + 1.137, z - .26 + i * .113, .069, .019, .08);
    }
  }
  box(color.garnet, terminalX - .15, floor + 2.50, terminalZ, .18, .37, 2.88);
  box(color.brass, terminalX -.043, floor + 2.70, terminalZ, .04, .032, 2.91);
  label('记忆检索台', terminalX -.039, floor + 2.50, terminalZ, 2.24, .29, Math.PI / 2, goldOnWood);

  const screenZ = -12.80;
  solid(color.walnut, 0, floor + 2.17, screenZ, 8.08, 3.85, .33);
  box(color.brass, 0, floor + 2.27, screenZ + .185, 7.77, 3.36, .11);
  box(color.screenDark, 0, floor + 2.27, screenZ + .258, 7.42, 3.01, .049);
  for (const side of [-1, 1]) {
    box(color.wood, side * 4.19, floor + 2.05, screenZ, .33, 3.62, .52);
    box(color.brass, side * 4.19, floor + 3.86, screenZ, .46, .14, .70);
  }
  screeningPanel(m, screenZ + .285);
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

  m.light(-7.3, floor + 3.82, 7.6, '#ffd4a1', 91, 14);
  m.light(5.2, floor + 3.92, -8.7, '#f7c69c', 86, 15);
}
