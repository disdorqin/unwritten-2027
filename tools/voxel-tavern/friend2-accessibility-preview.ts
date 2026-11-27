import {
  FRIEND2_A11Y_TEXT_SCALES,
  FRIEND2_A11Y_THEMES,
  FRIEND2_A11Y_TOUCH_SIZES,
  friend2A11yAttributes,
  friend2A11yCssVars,
  normalizeFriend2A11ySettings,
  type Friend2A11ySettings,
} from './town-blockout/town-friend2-accessibility';

function node<T extends Element>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Missing element: ${selector}`);
  return found;
}

const demo = node<HTMLElement>('#a11y-demo');
const themeList = node<HTMLElement>('#a11y-themes');
const textList = node<HTMLElement>('#a11y-texts');
const touchList = node<HTMLElement>('#a11y-touches');
const resetButton = node<HTMLButtonElement>('#a11y-reset');
const status = node<HTMLElement>('#a11y-status');
const clickCount = node<HTMLElement>('#a11y-click-count');
const primary = node<HTMLButtonElement>('#a11y-primary');
const secondary = node<HTMLButtonElement>('#a11y-secondary');

let settings: Friend2A11ySettings = normalizeFriend2A11ySettings({});
let clicks = 0;

function apply() {
  const root = demo;
  for (const [name, value] of Object.entries(friend2A11yCssVars(settings))) {
    root.style.setProperty(name, value);
  }
  for (const [name, value] of Object.entries(friend2A11yAttributes(settings))) {
    root.setAttribute(name, value);
  }
  for (const button of themeList.querySelectorAll<HTMLButtonElement>('[data-theme]')) {
    button.setAttribute('aria-pressed', String(button.dataset.theme === settings.theme));
  }
  for (const button of textList.querySelectorAll<HTMLButtonElement>('[data-scale]')) {
    button.setAttribute('aria-pressed', String(Number(button.dataset.scale) === settings.textScale));
  }
  for (const button of touchList.querySelectorAll<HTMLButtonElement>('[data-touch]')) {
    button.setAttribute('aria-pressed', String(button.dataset.touch === settings.touchSize));
  }
}

function buildOptions() {
  for (const theme of FRIEND2_A11Y_THEMES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'f2-a11y-option';
    button.dataset.theme = theme.id;
    button.textContent = theme.label;
    button.addEventListener('click', () => {
      settings = { ...settings, theme: theme.id };
      apply();
      status.textContent = `主题：${theme.label}。`;
    });
    themeList.append(button);
  }
  for (const scale of FRIEND2_A11Y_TEXT_SCALES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'f2-a11y-option';
    button.dataset.scale = String(scale.value);
    button.textContent = scale.label;
    button.addEventListener('click', () => {
      settings = { ...settings, textScale: scale.value };
      apply();
      status.textContent = `字号：${scale.label}。`;
    });
    textList.append(button);
  }
  for (const touch of FRIEND2_A11Y_TOUCH_SIZES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'f2-a11y-option';
    button.dataset.touch = touch.id;
    button.textContent = touch.label;
    button.addEventListener('click', () => {
      settings = { ...settings, touchSize: touch.id };
      apply();
      status.textContent = `触控尺寸：${touch.label}px。`;
    });
    touchList.append(button);
  }
}

function bump() {
  clicks += 1;
  clickCount.textContent = `${clicks} 次操作`;
  status.textContent = '操作已触发。';
}

primary.addEventListener('click', bump);
secondary.addEventListener('click', bump);
resetButton.addEventListener('click', () => {
  settings = normalizeFriend2A11ySettings({});
  clicks = 0;
  clickCount.textContent = '0 次操作';
  apply();
  status.textContent = '已恢复默认：雪夜 / 100% / 44px。';
});

buildOptions();
apply();
status.textContent = '切换主题、字号或触控尺寸，观察演示面板即时变化。';