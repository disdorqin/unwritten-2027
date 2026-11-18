import {
  BoxGeometry, CanvasTexture, Color, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial,
  MeshLambertMaterial, Object3D, PlaneGeometry, SRGBColorSpace,
} from 'three';
import { layout } from './terrain';
import type { TownActivity, TownActivityContext } from './town-activity';

const storageKey = 'unwritten:town-blessings';
const textLimit = 120;
const wishLimit = 20;
const { height: plazaHeight } = layout.plaza;
const anchorX = 201.4;
const anchorNorth = 210.65;
const paperColors = ['#de7466', '#edb66d', '#e5a18b', '#e5c697'];

function readWishes(): string[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
    if (Array.isArray(data)) {
      return data.filter((value): value is string =>
        typeof value === 'string' && value.length <= textLimit && Boolean(value.trim())).slice(0, wishLimit);
    }
  } catch { /* The wall can still be used when browser storage is unavailable. */ }
  return [];
}

export function createWishActivity(context: TownActivityContext): TownActivity & { latestWish(): string | undefined } {
  const group = new Group();
  group.name = 'Wish tree and town blessings';
  group.position.set(anchorX, plazaHeight, -anchorNorth);
  context.scene.add(group);

  const unitBox = new BoxGeometry();
  const transform = new Object3D();
  const solid: { matrix: Matrix4; tint: Color }[] = [];
  const luminous: typeof solid = [];
  const oak = '#644336', dark = '#3e2a2b', trim = '#a57250', gold = '#dbac66', snow = '#d5e3f1';

  function part(tint: string, x: number, y: number, z: number, w: number, h: number, d: number, roll = 0, glow = false) {
    transform.position.set(x, y, z);
    transform.scale.set(w, h, d);
    transform.rotation.set(0, 0, roll);
    transform.updateMatrix();
    (glow ? luminous : solid).push({ matrix: transform.matrix.clone(), tint: new Color(tint) });
  }

  // Plum trunk and branches shelter a board at the edge of the paving.
  part(dark, -2.25, 1.42, -.16, .40, 2.84, .43);
  part(oak, -2.18, 1.39, .052, .27, 2.78, .06);
  part(trim, -2.10, .98, .086, .038, 1.53, .023, -.023);
  for (const [x, y, w, h, roll] of [
    [-2.25, .17, .83, .22, 0], [-2.64, 1.37, .19, 1.14, .81], [-3.01, 1.94, .123, .61, -.10],
    [-3.24, 1.88, .113, .68, .98], [-1.94, 1.84, .185, 1.06, -.68], [-1.52, 2.33, .105, .67, -.48],
    [-2.54, 2.42, .158, .90, .76], [-2.86, 2.85, .091, .67, .28], [-1.94, 2.85, .12, .94, -.65],
  ]) {
    part(oak, x, y, -.12, w, h, w * .92, roll);
  }
  for (const [x, y] of [[-3.40, 2.05], [-3.00, 2.26], [-2.92, 3.11], [-1.55, 3.16], [-1.36, 2.60]]) {
    part(snow, x, y, -.12, .20, .075, .145);
  }
  part(snow, -2.3, .031, -.12, 1.29, .046, .91);
  part('#b9cddd', -2.09, .059, .09, .77, .035, .59);
  for (const [x, y] of [[-3.19, 1.71], [-2.95, 2.31], [-1.51, 2.42]]) {
    part(gold, x, y, .03, .024, .29, .022);
    part('#a24343', x, y - .23, .045, .24, .28, .20);
    part('#f7ab68', x, y - .23, .155, .173, .16, .021, 0, true);
    part(trim, x, y - .40, .05, .20, .041, .17);
    part('#ac4547', x, y - .47, .05, .031, .12, .036);
  }

  for (const x of [-.92, 2.81]) {
    part(dark, x, 1.45, -.31, .20, 2.9, .22);
    part(trim, x, 1.47, -.186, .076, 2.36, .036);
    part('#737886', x, .11, -.30, .37, .22, .39);
    part(gold, x, 2.28, -.158, .10, .033, .021);
  }
  for (let i = 0; i < 14; i++) {
    part(i % 3 === 0 ? '#694237' : '#75493b', -.75 + i * .261, 1.47, -.32, .251, 1.64, .102);
  }
  for (const y of [.63, 2.30]) part(dark, .944, y, -.245, 3.71, .113, .098);
  part(trim, .944, 1.95, -.211, 3.62, .028, .033);
  part(trim, .944, 1.36, -.212, 3.62, .026, .033);
  for (const [i, w] of [4.25, 4.04, 3.91].entries()) {
    part(dark, .944, 2.72 + i * .095, -.32, w, .098, 1.08 - i * .21);
    part(snow, .944, 2.78 + i * .095, -.32, w - .025, .058, 1.06 - i * .21);
  }
  part('#7f3c35', .944, 2.44, -.17, 2.24, .399, .12);
  part(gold, .944, 2.62, -.101, 2.11, .023, .020);
  part(gold, .944, 2.27, -.101, 2.11, .024, .020);

  for (const [parts, material] of [[solid, new MeshLambertMaterial()], [luminous, new MeshBasicMaterial()]] as const) {
    const mesh = new InstancedMesh(unitBox, material, parts.length);
    parts.forEach(({ matrix, tint }, index) => { mesh.setMatrixAt(index, matrix); mesh.setColorAt(index, tint); });
    mesh.computeBoundingSphere();
    group.add(mesh);
  }

  const plaqueCanvas = document.createElement('canvas');
  plaqueCanvas.width = 512;
  plaqueCanvas.height = 96;
  const lettering = plaqueCanvas.getContext('2d');
  if (lettering) {
    lettering.fillStyle = '#ffe0a5';
    lettering.font = 'bold 64px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
    lettering.textAlign = 'center';
    lettering.textBaseline = 'middle';
    lettering.fillText('匿名祝福', 256, 49, 448);
    const map = new CanvasTexture(plaqueCanvas);
    map.colorSpace = SRGBColorSpace;
    const plaque = new Mesh(new PlaneGeometry(2.09, .36), new MeshBasicMaterial({ map, transparent: true }));
    plaque.position.set(.944, 2.446, -.101);
    group.add(plaque);
  }

  const cordMaterial = new MeshLambertMaterial({ color: '#e7c38b' });
  const cardInk = new MeshLambertMaterial({ color: '#743531' });
  const cardMaterials = paperColors.map(color => new MeshLambertMaterial({ color }));
  const cards = Array.from({ length: 12 }, (_, index) => {
    const card = new Group();
    card.position.set(-.52 + (index % 6) * .585, index < 6 ? 1.94 : 1.35, -.176);
    function cardPart(material: MeshLambertMaterial, y: number, z: number, w: number, h: number, d: number) {
      const mesh = new Mesh(unitBox, material);
      mesh.position.set(0, y, z);
      mesh.scale.set(w, h, d);
      card.add(mesh);
    }
    cardPart(cordMaterial, -.067, 0, .035, .15, .02);
    cardPart(cardMaterials[index % cardMaterials.length], -.29, .017, .385, .35, .023);
    cardPart(cardInk, -.29, .032, .19, .022, .008);
    cardPart(cardInk, -.35, .032, .135, .013, .008);
    group.add(card);
    return card;
  });

  let wishes = readWishes();
  let elapsed = 0;
  function refreshCards() {
    cards.forEach((card, index) => { card.visible = index < wishes.length; });
  }
  refreshCards();

  function openWall() {
    context.face(anchorX + .94, anchorNorth, plazaHeight + 1.48);
    const content = context.open('匿名祝福墙', '给雪夜小镇留一句话。祝福在这台设备的当前浏览器内保存。');
    const form = document.createElement('form');
    const label = document.createElement('label');
    const input = document.createElement('textarea');
    const send = document.createElement('button');
    const feedback = document.createElement('output');
    const heading = document.createElement('h3');
    const list = document.createElement('ul');
    const blank = document.createElement('p');
    label.htmlFor = 'town-wish-entry';
    label.textContent = '写给来到小镇的人';
    input.id = label.htmlFor;
    input.rows = 3;
    input.required = true;
    input.maxLength = textLimit;
    input.placeholder = '愿你在新的一年遇见好事';
    input.style.cssText = 'display:block;width:100%;margin:6px 0 10px;padding:10px;resize:vertical;border:1px solid #6d819d;border-radius:5px;background:#101a2b;color:inherit;font:inherit';
    send.type = 'submit';
    send.textContent = '挂上祝福';
    feedback.setAttribute('aria-live', 'polite');
    feedback.style.cssText = 'display:block;margin-top:6px;color:#ffda9d';
    heading.textContent = '这面墙上的祝福';
    heading.style.marginBottom = '6px';
    list.style.cssText = 'margin:6px 0 0;padding-left:22px;max-height:28vh;overflow:auto;overflow-wrap:anywhere;line-height:1.56';
    blank.textContent = '这里还没有祝福。';
    form.append(label, input, send, feedback);
    content.append(form, heading, list, blank);

    function renderWishes() {
      const items = wishes.map(text => {
        const item = document.createElement('li');
        item.textContent = text;
        item.style.marginBottom = '6px';
        return item;
      });
      list.replaceChildren(...items);
      list.hidden = items.length === 0;
      blank.hidden = items.length > 0;
    }
    renderWishes();
    input.addEventListener('input', () => { input.setCustomValidity(''); });
    form.addEventListener('submit', event => {
      event.preventDefault();
      const text = input.value.trim();
      if (!text) {
        input.setCustomValidity('写下一句祝福再挂上吧。');
        input.reportValidity();
        return;
      }
      if (text.length > textLimit) return;
      wishes = [text, ...wishes].slice(0, wishLimit);
      let saved = false;
      try {
        localStorage.setItem(storageKey, JSON.stringify(wishes));
        saved = true;
      } catch { /* Retain the new card for this visit. */ }
      refreshCards();
      renderWishes();
      input.value = '';
      feedback.textContent = saved ? '已挂上祝福。' : '已挂上祝福，本次访问可见。';
      context.announce('祝福墙添了一张新卡片');
    });
  }

  return {
    latestWish: () => wishes[0],
    spots: [{ x: anchorX + .10, n: anchorNorth - 3.65, ground: plazaHeight, range: 2.15, label: '写匿名祝福', run: openWall }],
    blocked(x, n, ground) {
      if (Math.abs(ground - plazaHeight) > 1.65) return false;
      const dx = x - anchorX;
      const dz = anchorNorth - n;
      const trunk = Math.abs(dx + 2.25) < .49 && Math.abs(dz + .16) < .49;
      const board = dx > -1.34 && dx < 3.23 && dz > -.79 && dz < .11;
      return trunk || board;
    },
    update(dt) {
      elapsed += dt;
      cards.forEach((card, index) => {
        if (card.visible) card.rotation.z = .035 * Math.sin(elapsed * 1.6 + index);
      });
    },
  };
}
