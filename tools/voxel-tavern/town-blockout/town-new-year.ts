import { Group, type Object3D } from 'three';
import { tavernModelToPlot } from './landmark-tavern';
import { addOpaqueMuseumLabels, type OpaqueMuseumLabel } from './museum-label-atlas';
import { layout } from './terrain';

const dayMilliseconds = 86_400_000;
const beijingOffset = 8 * 3_600_000;
// The opening night handbook sets 20:00 Beijing time, four hours before the ceremony.
export const townOpeningAt = Date.UTC(2026, 11, 31, 12);
const openingDay = Math.floor((townOpeningAt + beijingOffset) / dayMilliseconds) * dayMilliseconds;

export function daysUntilTownOpening(now: number) {
  const beijingDay = Math.floor((now + beijingOffset) / dayMilliseconds) * dayMilliseconds;
  return (openingDay - beijingDay) / dayMilliseconds;
}

function openingBoardText(now: number) {
  const days = daysUntilTownOpening(now);
  if (days > 0) return `还有 ${days} 天`;
  if (days < 0) return '雪镇纪念';
  return now < townOpeningAt ? '今日 20:00 开镇' : '今日开镇';
}

const scriptFont = '"KaiTi", "STKaiti", "Noto Serif CJK SC", "Microsoft YaHei", serif';
const labelFont = '"Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif';

function makePaper(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function couplet(text: string) {
  const canvas = makePaper(144, 660);
  const ink = canvas.getContext('2d')!;
  const paper = ink.createLinearGradient(0, 0, 144, 660);
  paper.addColorStop(0, '#c64a36');
  paper.addColorStop(.53, '#ad312c');
  paper.addColorStop(1, '#872729');
  ink.fillStyle = paper;
  ink.fillRect(0, 0, 144, 660);
  ink.strokeStyle = '#f1bc73';
  ink.lineWidth = 3;
  ink.strokeRect(11, 12, 122, 636);
  for (const y of [29, 628]) {
    ink.fillStyle = '#f1bc73';
    for (const x of [25, 113]) ink.fillRect(x, y, 6, 7);
  }
  ink.textAlign = 'center';
  ink.textBaseline = 'middle';
  ink.font = `bold 103px ${scriptFont}`;
  for (const [index, letter] of Array.from(text).entries()) {
    const y = 104 + index * 113;
    ink.fillStyle = '#f9cb80';
    ink.fillText(letter, 73, y + 2);
    ink.fillStyle = '#281a24';
    ink.fillText(letter, 71, y);
  }
  return canvas;
}

function paintOpeningBoard(canvas: HTMLCanvasElement, text: string) {
  const ink = canvas.getContext('2d')!;
  const paper = ink.createLinearGradient(0, 0, 0, canvas.height);
  paper.addColorStop(0, '#581f2c');
  paper.addColorStop(1, '#351622');
  ink.fillStyle = paper;
  ink.fillRect(0, 0, canvas.width, canvas.height);
  ink.lineWidth = 7;
  ink.strokeStyle = '#cf955b';
  ink.strokeRect(11, 11, canvas.width - 22, canvas.height - 22);
  ink.lineWidth = 2;
  ink.strokeRect(23, 23, canvas.width - 46, canvas.height - 46);
  for (const x of [35, canvas.width - 35]) {
    ink.fillStyle = '#d16342';
    ink.fillRect(x - 6, 30, 12, canvas.height - 60);
  }
  ink.textAlign = 'center';
  ink.textBaseline = 'middle';
  ink.fillStyle = '#f5ca8a';
  ink.font = `bold 29px ${labelFont}`;
  ink.fillText('开镇日 · 2026.12.31 20:00', 256, 55);
  ink.fillStyle = '#ffe8ad';
  ink.font = `bold 57px ${labelFont}`;
  ink.fillText(text, 256, 116, 410);
}

export function addNewYearDecor(parent: Object3D, initialEpochMs?: number) {
  const signs = new Group();
  signs.name = 'New Year doorway couplets and opening date';
  parent.add(signs);
  const eastCouplet = couplet('瑞雪迎新岁');
  const westCouplet = couplet('华灯照福门');
  const board = makePaper(512, 166);
  const items: OpaqueMuseumLabel[] = [];
  function add(source: HTMLCanvasElement, origin: readonly number[], [x, y, z]: readonly number[],
    width: number, height: number, yaw = 0) {
    items.push({ source, parent: signs, x: origin[0] + x, y: origin[2] + y, z: -origin[1] + z, width, height, yaw });
  }

  const tower = layout.plots.find(plot => plot.id === 'clocktower')!;
  const post = layout.plots.find(plot => plot.id === 'post-office')!;
  const tavern = layout.plots.find(plot => plot.id === 'tavern')!;
  const workshop = layout.plots.find(plot => plot.id === 'lantern-workshop')!;
  const transformTavern = tavernModelToPlot(tavern);
  for (const side of [-1, 1]) {
    const source = side > 0 ? eastCouplet : westCouplet;
    add(source, tower.origin, [side * 3.25, 4.94, 6.672], .49, 2.24);
    add(source, post.origin, [side * 1.52, 1.76, 7.582], .37, 1.7);
    add(source, tavern.origin, transformTavern(side * 1.30, 4.55, 6.20), .35, 1.60);
    // The workshop entrance faces west. Those timber posts already carry the porch roof.
    add(source, workshop.origin, [-7.56, 2.55, 2.12 * side], .40, 1.83, -Math.PI / 2);
  }
  add(board, tower.origin, [0, 7.42, 6.858], 4.10, 1.33);
  const initialTime = initialEpochMs ?? Date.now();
  let rendered = openingBoardText(initialTime);
  paintOpeningBoard(board, rendered);
  const refresh = addOpaqueMuseumLabels(items, []);
  function updateOpeningBoard(now: number) {
    if (!Number.isFinite(now)) return;
    const text = openingBoardText(now);
    if (text === rendered) return;
    rendered = text;
    paintOpeningBoard(board, text);
    refresh(board);
  }

  // Older hosts can still use the board without passing their own clock into the scene.
  function scheduleLocalUpdate(now: number) {
    const days = daysUntilTownOpening(now);
    if (days < 0) return;
    const midnight = (Math.floor((now + beijingOffset) / dayMilliseconds) + 1) * dayMilliseconds - beijingOffset;
    const boundary = days === 0 && now < townOpeningAt ? townOpeningAt : midnight;
    window.setTimeout(() => {
      const next = Date.now();
      updateOpeningBoard(next);
      scheduleLocalUpdate(next);
    }, boundary - now);
  }
  if (initialEpochMs === undefined) scheduleLocalUpdate(initialTime);
  return Object.assign(signs, { updateOpeningBoard });
}
