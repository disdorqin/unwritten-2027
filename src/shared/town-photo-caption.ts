const shanghaiPhotoDate = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
});

export const townPlazaPhotoLocation = '中央广场';

export function townPhotoCaption(location: string, capturedAt: number): string | undefined {
  if (!location || !Number.isSafeInteger(capturedAt) || capturedAt <= 0 ||
      !Number.isFinite(new Date(capturedAt).getTime())) return;
  const { year, month, day } = Object.fromEntries(shanghaiPhotoDate.formatToParts(capturedAt)
    .map(part => [part.type, part.value]));
  return `${location} · ${year}-${month}-${day}`;
}
