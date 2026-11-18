export type MuseumLabelStyle = { background?: string; color?: string; accent?: string; border?: boolean };

export function createMuseumLabelCanvas(text: string, width: number, height: number, style: MuseumLabelStyle = {}) {
  const { background = '#341d18', color = '#ffe4a0', accent = '#a4783d', border = true } = style;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = Math.max(96, Math.min(400, Math.round(512 * height / width)));
  const ink = canvas.getContext('2d')!;
  const full = canvas.height;
  if (background !== 'transparent') {
    ink.fillStyle = background;
    ink.fillRect(0, 0, 512, full);
  }
  if (border) {
    ink.strokeStyle = accent;
    ink.lineWidth = 4;
    ink.strokeRect(8, 8, 496, full - 16);
    ink.strokeRect(15, 15, 482, full - 30);
  }
  const lines = text.split('\n');
  ink.fillStyle = color;
  ink.textAlign = 'center';
  ink.textBaseline = 'middle';
  ink.font = `700 ${Math.round(Math.min(94, full * .61 / lines.length))}px "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif`;
  lines.forEach((line, index) => ink.fillText(line, 256, full / 2 + (index - (lines.length - 1) / 2) * full * .7 / lines.length, 454));
  return canvas;
}
