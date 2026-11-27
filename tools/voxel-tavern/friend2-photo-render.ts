import {
  computeFriend2PhotoLayout,
  friend2PhotoWatermark,
  photoFrameById,
  type Friend2PhotoSettings,
} from './town-blockout/town-friend2-photo';

export function drawFriend2Photo(
  canvas: HTMLCanvasElement,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  settings: Friend2PhotoSettings,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;
  const frame = photoFrameById(settings.frameId);
  const width = canvas.width;
  const height = canvas.height;
  const layout = computeFriend2PhotoLayout(sourceWidth, sourceHeight, width, height, frame);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = frame.matColor;
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.beginPath();
  ctx.rect(layout.innerX, layout.innerY, layout.innerWidth, layout.innerHeight);
  ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(source, layout.drawX, layout.drawY, layout.drawWidth, layout.drawHeight);
  ctx.restore();

  const stroke = Math.max(2, Math.round(Math.min(width, height) * 0.006));
  ctx.strokeStyle = frame.borderColor;
  ctx.lineWidth = stroke;
  ctx.strokeRect(layout.innerX, layout.innerY, layout.innerWidth, layout.innerHeight);

  const corner = Math.max(10, Math.round(Math.min(width, height) * 0.034));
  ctx.fillStyle = frame.accentColor;
  if (frame.id === 'snow-night') {
    for (const [x, y] of [
      [layout.innerX, layout.innerY],
      [layout.innerX + layout.innerWidth - corner, layout.innerY],
      [layout.innerX, layout.innerY + layout.innerHeight - corner],
      [layout.innerX + layout.innerWidth - corner, layout.innerY + layout.innerHeight - corner],
    ] as const) {
      ctx.beginPath();
      ctx.arc(x + corner / 2, y + corner / 2, corner * 0.18, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    const line = Math.max(18, Math.round(Math.min(width, height) * 0.035));
    for (const [x, y, w, h] of [
      [layout.innerX, layout.innerY, line, stroke],
      [layout.innerX, layout.innerY, stroke, line],
      [layout.innerX + layout.innerWidth - line, layout.innerY, line, stroke],
      [layout.innerX + layout.innerWidth - stroke, layout.innerY, stroke, line],
      [layout.innerX, layout.innerY + layout.innerHeight - stroke, line, stroke],
      [layout.innerX, layout.innerY + layout.innerHeight - line, stroke, line],
      [layout.innerX + layout.innerWidth - line, layout.innerY + layout.innerHeight - stroke, line, stroke],
      [layout.innerX + layout.innerWidth - stroke, layout.innerY + layout.innerHeight - line, stroke, line],
    ] as const) {
      ctx.fillRect(x, y, w, h);
    }
  }

  const watermark = friend2PhotoWatermark(settings);
  if (!watermark.date && !watermark.nickname) return layout;
  const fontSize = Math.max(16, Math.round(width * 0.022));
  ctx.font = `600 ${fontSize}px "Microsoft YaHei", "PingFang SC", sans-serif`;
  ctx.textBaseline = 'bottom';
  const pad = Math.max(10, Math.round(fontSize * 0.45));
  const bottom = layout.innerY + layout.innerHeight - pad;
  for (const [text, align] of [
    [watermark.nickname, 'left'],
    [watermark.date, 'right'],
  ] as const) {
    if (!text) continue;
    const metrics = ctx.measureText(text);
    const textX =
      align === 'left'
        ? layout.innerX + pad
        : layout.innerX + layout.innerWidth - pad - metrics.width;
    const boxX = align === 'left' ? textX - pad * 0.45 : textX - pad * 0.45;
    const boxY = bottom - fontSize * 1.15;
    ctx.fillStyle = 'rgba(8, 14, 20, 0.55)';
    ctx.fillRect(boxX, boxY, metrics.width + pad * 0.9, fontSize * 1.45);
    ctx.fillStyle = frame.inkColor;
    ctx.fillText(text, textX, bottom);
  }
  return layout;
}