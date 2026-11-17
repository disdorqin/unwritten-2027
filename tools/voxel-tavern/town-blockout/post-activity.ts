import { layout } from './terrain';
import type { TownActivity, TownActivityContext } from './town-activity';

const variants = ['clocktower', 'post-office'] as const;
type Variant = typeof variants[number];
const designs = {
  clocktower: { name: '雪夜钟楼', index: '01', upper: '#17233a', lower: '#547486', gold: '#e8ba7e', ink: '#5b5e57' },
  'post-office': { name: '灯火邮局', index: '02', upper: '#4b333a', lower: '#b58070', gold: '#f0c989', ink: '#a54535' },
};
const storageKey = 'unwritten:2027-post-office';
const serif = '"Noto Serif CJK SC", "Songti SC", SimSun, serif';
const sans = '"Noto Sans CJK SC", "Microsoft YaHei", sans-serif';

function validVariant(value: unknown): value is Variant {
  return value === 'clocktower' || value === 'post-office';
}

function readIssued(): { selected: Variant; stamps: Set<Variant> } {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    if (saved && validVariant(saved.selected) && Array.isArray(saved.stamps)) {
      return { selected: saved.selected, stamps: new Set(saved.stamps.filter(validVariant)) };
    }
  } catch { /* Local keepsakes may be unavailable in private browsers. */ }
  return { selected: 'clocktower', stamps: new Set() };
}

function paintCard(canvas: HTMLCanvasElement, variant: Variant, stamped: boolean) {
  const context = canvas.getContext('2d');
  if (!context) return;
  const ctx = context;
  const design = designs[variant];
  function block(x: number, y: number, width: number, height: number, fill: string) {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, width, height);
  }
  function path(points: [number, number][], fill: string) {
    ctx.beginPath();
    points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }
  function type(text: string, x: number, y: number, font: string, ink: string) {
    ctx.fillStyle = ink;
    ctx.font = font;
    ctx.fillText(text, x, y);
  }
  function ring(x: number, y: number, radius: number, ink: string, width = 2) {
    ctx.strokeStyle = ink;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  const sky = ctx.createLinearGradient(0, 0, 0, 800);
  sky.addColorStop(0, design.upper);
  sky.addColorStop(1, design.lower);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 1200, 800);
  path([[0,539],[149,385],[291,532],[482,354],[637,470],[767,410],[808,700],[0,700]], '#66777f');
  path([[0,607],[162,514],[310,570],[558,486],[729,556],[807,536],[807,800],[0,800]], '#92a2a8');
  path([[0,684],[174,635],[454,649],[608,609],[802,674],[802,800],[0,800]], '#c6d0cc');
  for (const [x, height] of [[47,165],[84,102],[124,130],[691,138],[726,174],[765,106]]) {
    const y = 656 - height;
    for (let i = 0; i < 3; i++) {
      const top = y + i * height * .21, wide = height * (.16 + i * .025);
      path([[x,top],[x - wide,top + height * .55],[x + wide,top + height * .55]], '#314950');
      path([[x,top],[x - wide * .79,top + height * .435],[x + wide * .70,top + height * .39]], '#b5c5c9');
    }
  }

  if (variant === 'clocktower') {
    path([[306,429],[427,297],[548,429]], '#2e3a4c');
    path([[306,425],[427,296],[548,425],[515,421],[427,319],[339,421]], '#dbe5e2');
    block(338, 426, 179, 199, '#704e45');
    block(363, 416, 129, 209, '#ad8066');
    block(381, 435, 93, 86, '#4c4245');
    ctx.fillStyle = design.gold;
    ctx.beginPath(); ctx.arc(427, 477, 35, 0, Math.PI * 2); ctx.fill();
    ring(427, 477, 27, '#573c3b', 2);
    block(425, 457, 4, 22, '#573c3b');
    block(425, 475, 18, 4, '#573c3b');
    block(405, 554, 44, 71, '#543f43');
    block(292, 624, 271, 18, '#52636b');
    block(256, 644, 342, 12, '#e1e5dc');
  } else {
    block(218, 488, 398, 153, '#693b35');
    block(241, 497, 348, 144, '#a35c4b');
    path([[192,488],[294,417],[546,417],[644,488]], '#413c49');
    path([[191,482],[291,410],[544,410],[643,482],[604,479],[534,429],[303,429],[234,481]], '#e2e1d8');
    for (const x of [266,340,465,540]) {
      block(x, 519, 39, 64, '#4a3840');
      block(x + 4, 523, 31, 55, '#e9b56d');
      block(x + 18, 523, 3, 55, '#94534b');
      block(x + 4, 543, 31, 3, '#94534b');
    }
    block(383, 542, 56, 99, '#48373c');
    block(391, 548, 40, 92, '#83634d');
    block(362, 505, 98, 23, '#e1b67b');
    type('邮 局', 385, 522, '600 15px ' + sans, '#553a39');
    block(604, 584, 39, 57, '#a54f41');
    block(611, 595, 23, 5, '#d4b594');
    block(209, 644, 445, 11, '#ede3d8');
  }

  for (let i = 0; i < 105; i++) {
    const x = 35 + ((i * 193 + i * i * 17) % 727);
    const y = 66 + ((i * 109 + i * i * 11) % 600);
    if (x <= 540 && y > 89 && y < 264) continue;
    const point = 1 + i % 4;
    block(x, y, point, point, i % 3 ? '#e6ede985' : '#fbefd7d5');
  }
  block(55, 125, 61, 2, design.gold);
  type('UNWRITTEN 2027', 55, 105, '600 22px ' + sans, design.gold);
  type(design.name, 54, 235, 'bold 103px ' + serif, '#fff0d7');
  type('跨年雪镇 · 新年邮局', 57, 288, '600 26px ' + serif, '#f5d9aa');

  block(799, 0, 401, 800, '#f4ecd8');
  block(799, 0, 6, 800, design.gold);
  ctx.strokeStyle = '#b69974';
  ctx.lineWidth = 2;
  ctx.strokeRect(827, 49, 329, 702);
  type('SNOW TOWN POST', 852, 114, '600 21px ' + sans, design.ink);
  type('新年明信片', 850, 196, 'bold 44px ' + serif, '#3d302d');
  type('寄给新一年', 852, 245, '600 22px ' + serif, '#765e4c');
  for (const y of [333,392,451]) block(853, y, 275, 2, '#ceba9c');
  type('纪念款 ' + design.index, 852, 695, '600 21px ' + sans, design.ink);

  if (stamped) {
    ctx.save();
    ctx.translate(1022, 564);
    ctx.rotate(-.14);
    ring(0, 0, 97, '#a03a31', 4);
    ring(0, 0, 84, '#a03a31', 2);
    ctx.textAlign = 'center';
    type('雪 镇 邮 局', 0, -28, '600 22px ' + sans, '#a03a31');
    type('2027', 0, 19, 'bold 44px ' + serif, '#a03a31');
    type('新 年 纪 念', 0, 56, '600 20px ' + sans, '#a03a31');
    ctx.restore();
  }
  ctx.strokeStyle = '#d6b180';
  ctx.lineWidth = 2;
  ctx.strokeRect(24,24,1152,752);
}

export function createPostActivity(context: TownActivityContext): TownActivity {
  const plot = layout.plots.find(entry => entry.id === 'post-office')!;
  const [east, north, elevation] = plot.origin;
  const souvenir = readIssued();
  const save = () => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ selected: souvenir.selected, stamps: [...souvenir.stamps] }));
    } catch { /* The drawer stays available until the page closes. */ }
  };

  function openCounter() {
    const content = context.open('新年邮局 · 纪念戳台', '选一款雪镇明信片，盖上新年纪念戳后下载。');
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 800;
    canvas.style.cssText = 'display:block;width:100%;height:auto;touch-action:auto;border-radius:6px;border:1px solid #af9775';
    canvas.setAttribute('role', 'img');
    const options = document.createElement('div');
    options.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin:10px 0';
    const controls = document.createElement('div');
    controls.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-top:12px';
    const status = document.createElement('p');
    status.setAttribute('role', 'status');

    function action(label: string, parent: HTMLElement, handler: () => void) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.onclick = handler;
      parent.append(button);
      return button;
    }
    function redraw() {
      const selected = souvenir.selected;
      const stamped = souvenir.stamps.has(selected);
      choices.forEach((button, i) => button.setAttribute('aria-pressed', String(variants[i] === selected)));
      canvas.setAttribute('aria-label', designs[selected].name + (stamped ? '，已盖新年纪念戳' : '，待盖章'));
      paintCard(canvas, selected, stamped);
      stamp.disabled = stamped;
      download.disabled = !stamped;
      status.textContent = stamped ? '已加盖新年纪念戳，可以下载。' : '这张明信片还没盖章。';
    }
    const choices = variants.map(variant => action(designs[variant].name, options, () => {
      souvenir.selected = variant;
      save();
      redraw();
    }));
    const stamp = action('盖新年纪念戳', controls, () => {
      souvenir.stamps.add(souvenir.selected);
      save();
      redraw();
      context.announce('邮局明信片已盖章');
    });
    const download = action('下载明信片 PNG', controls, () => {
      const edition = souvenir.selected;
      canvas.toBlob(blob => {
        if (!blob) { status.textContent = '暂时无法导出，请再试一次。'; return; }
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'UNWRITTEN-2027-' + edition + '-postcard.png';
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
      }, 'image/png');
    });
    content.append(options, canvas, controls, status);
    redraw();
  }
  return { spots: [{
    x: east + .5, n: north - .5, ground: elevation + .3,
    range: 1.28, label: '领取邮局明信片', run: openCounter,
  }] };
}
