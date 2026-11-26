export type Friend2A11yTheme = 'night' | 'day' | 'contrast';
export type Friend2A11yTextScale = 1 | 1.15 | 1.3 | 1.5;
export type Friend2A11yTouchSize = 'normal' | 'large' | 'xlarge';

export type Friend2A11ySettings = {
  theme: Friend2A11yTheme;
  textScale: Friend2A11yTextScale;
  touchSize: Friend2A11yTouchSize;
};

export const FRIEND2_A11Y_THEMES = [
  { id: 'night', label: '雪夜' },
  { id: 'day', label: '日间' },
  { id: 'contrast', label: '高对比' },
] as const;

export const FRIEND2_A11Y_TEXT_SCALES = [
  { value: 1, label: '100%' },
  { value: 1.15, label: '115%' },
  { value: 1.3, label: '130%' },
  { value: 1.5, label: '150%' },
] as const;

export const FRIEND2_A11Y_TOUCH_SIZES = [
  { id: 'normal', label: '标准 44', px: 44 },
  { id: 'large', label: '大 52', px: 52 },
  { id: 'xlarge', label: '特大 60', px: 60 },
] as const;

export const FRIEND2_A11Y_DEFAULT_SETTINGS: Friend2A11ySettings = {
  theme: 'night',
  textScale: 1,
  touchSize: 'normal',
};

const themes: Record<Friend2A11yTheme, {
  bg: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  border: string;
  focus: string;
}> = {
  night: {
    bg: '#0a141f',
    surface: '#13263a',
    text: '#eaf3fa',
    muted: '#9bb2c6',
    accent: '#e9a35a',
    border: '#8fb3cf55',
    focus: '#ffd58d',
  },
  day: {
    bg: '#f2ede3',
    surface: '#fffaf0',
    text: '#2b211b',
    muted: '#6b5a4a',
    accent: '#b55b38',
    border: '#6b483455',
    focus: '#8a3f36',
  },
  contrast: {
    bg: '#000000',
    surface: '#0a0a0a',
    text: '#ffffff',
    muted: '#e0e0e0',
    accent: '#ffe600',
    border: '#ffffff99',
    focus: '#00ffff',
  },
};

export function normalizeFriend2A11ySettings(value: unknown): Friend2A11ySettings {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const theme =
    typeof record.theme === 'string' && FRIEND2_A11Y_THEMES.some(item => item.id === record.theme)
      ? (record.theme as Friend2A11yTheme)
      : FRIEND2_A11Y_DEFAULT_SETTINGS.theme;
  const textScale =
    typeof record.textScale === 'number' && FRIEND2_A11Y_TEXT_SCALES.some(item => item.value === record.textScale)
      ? (record.textScale as Friend2A11yTextScale)
      : FRIEND2_A11Y_DEFAULT_SETTINGS.textScale;
  const touchSize =
    typeof record.touchSize === 'string' && FRIEND2_A11Y_TOUCH_SIZES.some(item => item.id === record.touchSize)
      ? (record.touchSize as Friend2A11yTouchSize)
      : FRIEND2_A11Y_DEFAULT_SETTINGS.touchSize;
  return { theme, textScale, touchSize };
}

export function friend2A11yCssVars(settings: Friend2A11ySettings): Record<string, string> {
  const theme = themes[settings.theme];
  const touch = FRIEND2_A11Y_TOUCH_SIZES.find(item => item.id === settings.touchSize) ?? FRIEND2_A11Y_TOUCH_SIZES[0];
  return {
    '--a11y-bg': theme.bg,
    '--a11y-surface': theme.surface,
    '--a11y-text': theme.text,
    '--a11y-muted': theme.muted,
    '--a11y-accent': theme.accent,
    '--a11y-border': theme.border,
    '--a11y-focus': theme.focus,
    '--a11y-font-size': `${Math.round(14 * settings.textScale)}px`,
    '--a11y-touch': `${touch.px}px`,
  };
}

export function friend2A11yAttributes(settings: Friend2A11ySettings): Record<string, string> {
  return {
    'data-theme': settings.theme,
    'data-text': String(settings.textScale),
    'data-touch': settings.touchSize,
  };
}

export function friend2A11yTouchPx(settings: Friend2A11ySettings): number {
  return FRIEND2_A11Y_TOUCH_SIZES.find(item => item.id === settings.touchSize)?.px ?? 44;
}