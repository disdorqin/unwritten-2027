import type { MuseumBuilder } from './museum-kit';
import { chronicleEntryDate, readTownChronicleViews, type TownChronicleViews } from './town-chronicle-views';

export const mainChronicleStone = { east: 422.6, north: 333.85, name: '未写镇大事记碑' } as const;
export const stationChronicleStone = { x: 19.45, z: -6.36, height: .14, name: '站厅大事记碑' } as const;
export const museumChronicleStops = {
  founding: [-9.9, .28, -11.9],
  excerpts: [-6.5, .28, -11.9],
  book: [-8.2, .28, -12.2],
} as const;

type Face = 'main' | 'station' | 'excerpts' | 'founding';
const headings = {
  main: mainChronicleStone.name,
  station: stationChronicleStone.name,
  excerpts: '镇史廊 · 编年精选',
  founding: '镇史廊 · 建镇记',
} as const;

function faceLines(kind: Face, data: TownChronicleViews) {
  if (kind === 'founding') {
    return [data.entries.find(entry => entry.vol === 1 && !entry.reserved)?.body || '正文留白'];
  }
  const entries = kind === 'main' ? data.plaque : kind === 'station' ? data.latest : data.featured;
  return entries.map(entry => ((entry.pinned && kind !== 'station') ? '◆ ' : '') +
    entry.title + '  ' + chronicleEntryDate(entry) + (entry.local ? ' · ' + data.localScope : ''));
}

export function createChronicleFace(kind: Face) {
  if (typeof document === 'undefined') return undefined;
  const source = document.createElement('canvas');
  source.width = 512;
  source.height = kind === 'main' ? 272 : 178;
  const ctx = source.getContext('2d')!;
  let shown = '';
  const paint = (data: TownChronicleViews) => {
    const lines = faceLines(kind, data);
    const next = JSON.stringify(lines);
    if (next === shown) return false;
    shown = next;
    ctx.fillStyle = '#292e35';
    ctx.fillRect(0, 0, source.width, source.height);
    ctx.strokeStyle = '#c0a36c';
    ctx.lineWidth = 4;
    ctx.strokeRect(7, 7, source.width - 14, source.height - 14);
    ctx.fillStyle = '#ffe2a2';
    ctx.font = 'bold 31px "Microsoft YaHei", "Noto Sans SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(headings[kind], source.width / 2, 38, source.width - 38);
    ctx.fillRect(24, 60, source.width - 48, 2);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f5e9cf';
    ctx.font = '20px "Microsoft YaHei", "Noto Sans SC", sans-serif';
    for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], 24, 85 + i * 29, source.width - 48);
    return true;
  };
  paint(readTownChronicleViews());
  return { source, paint };
}

export function addChronicleGallery(m: MuseumBuilder) {
  // Zone-four north wall (ZA-06 relocation): faces flank the chronicle
  // cabinet, clear of the timeline rear cabinets on the same wall.
  for (const [kind, x] of [['founding', -9.9], ['excerpts', -6.5]] as const) {
    m.box('#5b3732', x, 2.05, -13.42, 2.2, 1.0, .18);
    m.box('#b88655', x, 2.62, -13.42, 2.36, .08, .24);
    m.chronicleFace(createChronicleFace(kind), x, 2.05, -13.31, 2.04, .71);
  }

  const z = -12.95;
  m.light(-8.2, 3.0, -11.9, '#ffe9c4', 25, 8);
  m.solid('#573a34', -8.2, .72, z, 1.62, .88, 1.13);
  m.box('#91704c', -8.2, 1.16, z, 1.72, .066, 1.23);
  m.box('#ead5a7', -8.2, 1.242, z, .68, .112, .49);
  for (const y of [1.18, 1.304]) m.box('#6d3531', -8.2, y, z, .73, .025, .545);
  m.box('#503332', -8.553, 1.242, z, .067, .153, .545);
  m.box('#d8ac6a', -8.2, 1.319, z, .39, .008, .043);
  m.box('#d8ac6a', -8.2, 1.319, z, .044, .008, .25);
  m.label('未写镇镇志', -8.2, .91, z + .574, 1.35, .29, 0, { background: '#553334', color: '#ffe2a2' });
}
