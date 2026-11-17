type Point = readonly [number, number];

const width = 1000;
const height = 709;
const serif = '"Noto Serif CJK SC", "Source Han Serif SC", "Songti SC", SimSun, serif';
const sans = '"Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei", sans-serif';

export type MuseumMemory = { month: number; date: string; title: string; note: string };

function paintPostcard(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, memory?: MuseumMemory) {
  ctx.scale(canvas.width / width, canvas.height / height);

  function polygon(points: Point[], color: string) {
    ctx.fillStyle = color;
    ctx.beginPath();
    points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.closePath();
    ctx.fill();
  }
  function line(points: Point[], color: string, size = 1) {
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.beginPath();
    points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.stroke();
  }
  function ink(text: string, x: number, y: number, font: string, color: string) {
    ctx.fillStyle = color;
    ctx.font = font;
    ctx.fillText(text, x, y);
  }
  function spaced(text: string, x: number, y: number, color: string) {
    ctx.font = '600 12px ' + sans;
    ctx.fillStyle = color;
    for (const glyph of text) {
      ctx.fillText(glyph, x, y);
      x += ctx.measureText(glyph).width + 3.3;
    }
  }
  function circle(x: number, y: number, radius: number, color: string) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  const evening = ctx.createLinearGradient(0, 0, 0, height);
  evening.addColorStop(0, '#142641');
  evening.addColorStop(0.65, '#273d57');
  evening.addColorStop(1, '#405e75');
  ctx.fillStyle = evening;
  ctx.fillRect(0, 0, width, height);

  // Snowy trees and ridgelines behind the stylized museum façade.
  polygon([[0, 448], [88, 355], [172, 415], [286, 316], [401, 393], [506, 345], [648, 448], [648, 706], [0, 706]], '#3c5770');
  polygon([[0, 485], [65, 455], [145, 468], [263, 412], [319, 460], [481, 416], [638, 506], [638, 705], [0, 705]], '#536e83');
  polygon([[0, 533], [122, 503], [242, 509], [361, 474], [556, 506], [638, 488], [638, 709], [0, 709]], '#7e97a9');
  polygon([[0, 603], [158, 545], [309, 577], [463, 545], [639, 584], [639, 709], [0, 709]], '#b4c6ce');

  function pine(x: number, foot: number, size: number) {
    const top = foot - size;
    for (let tier = 0; tier < 3; tier++) {
      const y = top + tier * size * 0.19;
      const spread = size * (0.15 + tier * 0.044);
      polygon([[x, y], [x - spread, y + size * 0.50], [x + spread, y + size * 0.50]], '#233d50');
      polygon([[x, y], [x - spread * 0.80, y + size * 0.39], [x + spread * 0.14, y + size * 0.27], [x + spread * 0.78, y + size * 0.39]], '#9db5c3');
    }
  }
  for (const [x, foot, size] of [[69, 561, 103], [108, 547, 66], [141, 548, 48], [527, 551, 64], [561, 575, 99], [597, 541, 59]]) {
    pine(x, foot, size);
  }

  function window(x: number, y: number, w: number, h: number) {
    ctx.fillStyle = '#401f26';
    ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
    ctx.fillStyle = '#f5bb70';
    ctx.fillRect(x, y, w, h);
    line([[x + w / 2, y], [x + w / 2, y + h]], '#874735', 2);
    line([[x, y + h * 0.38], [x + w, y + h * 0.38]], '#874735', 2);
    line([[x, y + h * 0.72], [x + w, y + h * 0.72]], '#874735', 2);
  }
  function wing(x: number, y: number, w: number, h: number, windows: number) {
    ctx.fillStyle = '#833f32';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#b3694d';
    ctx.fillRect(x, y + 6, w, h - 15);
    const spacing = (w - 24) / windows;
    for (let i = 0; i < windows; i++) {
      ctx.fillStyle = '#6a302b';
      ctx.fillRect(x + 9 + i * spacing, y, 6, h);
      window(x + 20 + i * spacing, y + 15, Math.min(25, spacing - 15), h - 30);
    }
    ctx.fillStyle = '#4c4549';
    ctx.fillRect(x - 4, y + h - 6, w + 8, 10);
  }
  function roof(x: number, y: number, w: number, rise: number) {
    const edge = x + w;
    polygon([[x, y - 6], [x + w * 0.18, y - 13], [x + w * 0.29, y - rise], [edge - w * 0.29, y - rise], [edge - w * 0.18, y - 13], [edge, y - 6], [edge - 14, y + 4], [x + 14, y + 4]], '#172e42');
    polygon([[x, y - 8], [x + w * 0.18, y - 17], [x + w * 0.29, y - rise], [edge - w * 0.29, y - rise], [edge - w * 0.18, y - 17], [edge, y - 8], [edge - 28, y - 6], [x + 29, y - 6]], '#dbe8e7');
    for (let i = 0.31; i < 0.70; i += 0.056) {
      const foot = 0.19 + ((i - 0.29) / 0.42) * 0.62;
      line([[x + i * w, y - rise + 3], [x + foot * w, y - 10]], '#9bb1bc');
    }
    line([[x + w * 0.28, y - rise], [edge - w * 0.28, y - rise]], '#f4d59e', 2);
  }

  wing(128, 478, 412, 59, 8);
  roof(105, 478, 458, 41);
  wing(213, 422, 241, 52, 5);
  roof(192, 421, 283, 38);
  wing(270, 483, 126, 53, 2);
  roof(250, 482, 166, 28);
  ctx.fillStyle = '#342228';
  ctx.fillRect(321, 504, 25, 34);
  line([[324, 506], [343, 506]], '#f4d59e', 2);
  ctx.fillStyle = '#dde8e7';
  ctx.fillRect(124, 541, 418, 8);
  polygon([[296, 548], [370, 548], [408, 577], [256, 577]], '#8699a5');
  for (let i = 0; i < 6; i++) {
    line([[294 - i * 7, 550 + i * 5], [373 + i * 7, 550 + i * 5]], '#dbe5e5', 2);
  }
  for (const x of [178, 488]) {
    circle(x, 496, 14, '#b46947');
    circle(x, 496, 5, '#ffcf80');
    line([[x, 483], [x, 477]], '#ceaa71', 2);
    line([[x, 508], [x, 518]], '#ceaa71', 2);
  }

  for (let i = 0; i < 94; i++) {
    const x = 36 + ((i * 197 + i * i * 17) % 589);
    const y = 92 + ((i * 113 + i * i * 37) % 495);
    if (x < 484 && y < 304) continue;
    circle(x, y, 0.65 + (i % 6) * 0.20, i % 3 ? '#d4e2e48c' : '#eff4eddb');
  }

  const paper = ctx.createLinearGradient(640, 33, 981, 689);
  paper.addColorStop(0, '#f9eed9');
  paper.addColorStop(1, '#ecddba');
  ctx.fillStyle = paper;
  ctx.fillRect(640, 28, 332, 653);
  ctx.strokeStyle = '#baa178';
  ctx.strokeRect(654.5, 42.5, 303, 623);
  ctx.strokeStyle = '#baab8b';
  ctx.strokeRect(664.5, 52.5, 283, 603);

  ctx.strokeStyle = '#d5b883';
  ctx.strokeRect(23.5, 23.5, 953, 662);
  line([[70, 124], [116, 124]], '#d9b67f', 2);
  spaced('UNWRITTEN 2027', 70, 106, '#d9b67f');
  ink('2026 纪念馆', 67, 239, 'bold 82px ' + serif, '#f5e9d5');
  ink('雪镇参观纪念', 70, 292, '600 26px ' + serif, '#e4c58f');

  ctx.fillStyle = '#1f3449';
  ctx.fillRect(47, 606, 570, 54);
  spaced('2026  →  2027', 70, 639, '#e4c58f');
  ink('跨年雪镇', 515, 639, '600 15px ' + sans, '#e8ddc9');

  if (memory) {
    function wrap(value: string, y: number, font: string, tone: string, leading: number, limit: number) {
      ctx.font = font;
      let count = 0;
      for (const paragraph of value.split(/\r?\n/)) {
        let text = '';
        for (const glyph of paragraph) {
          if (text && ctx.measureText(text + glyph).width > 226) {
            if (count >= limit) return;
            ink(text, 689, y + leading * count++, font, tone);
            text = glyph;
          } else {
            text += glyph;
          }
        }
        if (count >= limit) return;
        ink(text, 689, y + leading * count++, font, tone);
      }
    }
    spaced('UNWRITTEN 2027', 689, 95, '#71543b');
    ink('展品回忆卡', 686, 153, 'bold 35px ' + serif, '#392b25');
    line([[688, 179], [923, 179]], '#bda580');
    ink(memory.date + ' · ' + memory.month + '月展', 689, 223, '600 17px ' + sans, '#895d46');
    wrap(memory.title, 258, 'bold 24px ' + serif, '#392b25', 29, 4);
    line([[688, 367], [923, 367]], '#bda580');
    ink('那天的我', 689, 394, '600 18px ' + serif, '#895d46');
    wrap(memory.note || '留给未来的自己。', 426, '400 18px ' + sans, '#4b382e', 21, 9);
    line([[688, 626], [923, 626]], '#bda580');
    ink('2026 纪念馆 · 雪镇来信', 689, 647, '600 13px ' + sans, '#895d46');
    return;
  }

  spaced('POSTCARD', 689, 104, '#71543b');
  ink('参观明信片', 687, 165, 'bold 35px ' + serif, '#392b25');
  line([[688, 181], [923, 181]], '#bda580', 1);
  ink('寄给未来的自己', 689, 234, '600 19px ' + serif, '#5d493a');
  for (const y of [295, 343, 391]) line([[690, y], [923, y]], '#baab8b');

  ctx.save();
  ctx.translate(830, 520);
  ctx.rotate(-0.13);
  ctx.strokeStyle = '#9f392b';
  ctx.lineWidth = 3;
  for (const radius of [77, 68]) {
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  line([[-50, -9], [50, -9]], '#b36250');
  line([[-50, 24], [50, 24]], '#b36250');
  ctx.textAlign = 'center';
  ink('参观纪念章', 0, -24, '600 16px ' + sans, '#9f392b');
  ink('2026', 0, 17, 'bold 28px ' + serif, '#9f392b');
  ink('跨年雪镇', 0, 48, '600 14px ' + sans, '#9f392b');
  ctx.restore();
}

function downloadCard(filename: string, memory?: MuseumMemory) {
  const canvas = document.createElement('canvas');
  canvas.width = 1748;
  canvas.height = 1240;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  paintPostcard(canvas, ctx, memory);
  canvas.toBlob(blob => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
}

export function downloadMuseumPostcard(): void {
  downloadCard('UNWRITTEN-2027-museum-postcard.png');
}

export function downloadMuseumMemoryCard(memory: MuseumMemory): void {
  downloadCard('UNWRITTEN-2027-museum-memory.png', memory);
}
