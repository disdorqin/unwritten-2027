export type Friend2PhotoFrameId = 'warm-wood' | 'snow-night' | 'lantern-glow';

export type Friend2PhotoFrame = {
  readonly id: Friend2PhotoFrameId;
  readonly label: string;
  readonly note: string;
  readonly matColor: string;
  readonly borderColor: string;
  readonly inkColor: string;
  readonly accentColor: string;
  readonly borderRatio: number;
};

export const FRIEND2_PHOTO_FRAMES = [
  {
    id: 'warm-wood',
    label: '暖木框',
    note: '旧木与雪镇的暖色相框',
    matColor: '#f2e6d2',
    borderColor: '#6b4834',
    inkColor: '#3b2a20',
    accentColor: '#e9a35a',
    borderRatio: 0.045,
  },
  {
    id: 'snow-night',
    label: '雪夜框',
    note: '冷蓝夜色与雪白留边',
    matColor: '#e8eef4',
    borderColor: '#4f7f9b',
    inkColor: '#1b3346',
    accentColor: '#7fd4c8',
    borderRatio: 0.04,
  },
  {
    id: 'lantern-glow',
    label: '灯火框',
    note: '深色纸边与暖橙灯火',
    matColor: '#2b2318',
    borderColor: '#c99c4e',
    inkColor: '#ffe6ba',
    accentColor: '#e9a35a',
    borderRatio: 0.05,
  },
] as const satisfies readonly Friend2PhotoFrame[];

export type Friend2PhotoSettings = {
  frameId: Friend2PhotoFrameId;
  showDate: boolean;
  showNickname: boolean;
  nickname: string;
  dateText: string;
};

export const FRIEND2_PHOTO_DEFAULT_SETTINGS: Friend2PhotoSettings = {
  frameId: 'warm-wood',
  showDate: true,
  showNickname: true,
  nickname: '未写镇旅人',
  dateText: '',
};

export function formatFriend2PhotoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}.${month}.${day}`;
}

export function photoFrameById(id: Friend2PhotoFrameId): Friend2PhotoFrame {
  return FRIEND2_PHOTO_FRAMES.find(frame => frame.id === id) ?? FRIEND2_PHOTO_FRAMES[0];
}

export function normalizeFriend2PhotoSettings(value: unknown, today = new Date()): Friend2PhotoSettings {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const frameId =
    typeof record.frameId === 'string' && FRIEND2_PHOTO_FRAMES.some(frame => frame.id === record.frameId)
      ? (record.frameId as Friend2PhotoFrameId)
      : FRIEND2_PHOTO_DEFAULT_SETTINGS.frameId;
  const rawNickname = typeof record.nickname === 'string' ? record.nickname.trim() : '';
  const nickname = (rawNickname || FRIEND2_PHOTO_DEFAULT_SETTINGS.nickname).slice(0, 20);
  const rawDate = typeof record.dateText === 'string' ? record.dateText.trim() : '';
  return {
    frameId,
    showDate: typeof record.showDate === 'boolean' ? record.showDate : FRIEND2_PHOTO_DEFAULT_SETTINGS.showDate,
    showNickname:
      typeof record.showNickname === 'boolean'
        ? record.showNickname
        : FRIEND2_PHOTO_DEFAULT_SETTINGS.showNickname,
    nickname,
    dateText: (rawDate || formatFriend2PhotoDate(today)).slice(0, 20),
  };
}

export type Friend2PhotoLayout = {
  canvasWidth: number;
  canvasHeight: number;
  innerX: number;
  innerY: number;
  innerWidth: number;
  innerHeight: number;
  drawX: number;
  drawY: number;
  drawWidth: number;
  drawHeight: number;
  scale: number;
};

export function computeFriend2PhotoLayout(
  sourceWidth: number,
  sourceHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  frame: Friend2PhotoFrame,
): Friend2PhotoLayout {
  const safeCanvasWidth = Math.max(1, Math.floor(canvasWidth));
  const safeCanvasHeight = Math.max(1, Math.floor(canvasHeight));
  const safeSourceWidth = Math.max(1, sourceWidth);
  const safeSourceHeight = Math.max(1, sourceHeight);
  const inset = Math.max(1, Math.round(Math.min(safeCanvasWidth, safeCanvasHeight) * frame.borderRatio));
  const innerX = inset;
  const innerY = inset;
  const innerWidth = Math.max(1, safeCanvasWidth - inset * 2);
  const innerHeight = Math.max(1, safeCanvasHeight - inset * 2);
  const scale = Math.max(innerWidth / safeSourceWidth, innerHeight / safeSourceHeight);
  const drawWidth = safeSourceWidth * scale;
  const drawHeight = safeSourceHeight * scale;
  return {
    canvasWidth: safeCanvasWidth,
    canvasHeight: safeCanvasHeight,
    innerX,
    innerY,
    innerWidth,
    innerHeight,
    drawX: innerX + (innerWidth - drawWidth) / 2,
    drawY: innerY + (innerHeight - drawHeight) / 2,
    drawWidth,
    drawHeight,
    scale,
  };
}

export type Friend2PhotoWatermark = {
  date: string;
  nickname: string;
};

export function friend2PhotoWatermark(settings: Friend2PhotoSettings): Friend2PhotoWatermark {
  return {
    date: settings.showDate ? settings.dateText : '',
    nickname: settings.showNickname ? settings.nickname : '',
  };
}