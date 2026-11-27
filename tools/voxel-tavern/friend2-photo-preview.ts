import {
  FRIEND2_PHOTO_FRAMES,
  FRIEND2_PHOTO_DEFAULT_SETTINGS,
  formatFriend2PhotoDate,
  normalizeFriend2PhotoSettings,
  type Friend2PhotoSettings,
} from './town-blockout/town-friend2-photo';
import { drawFriend2Photo } from './friend2-photo-render';

function node<T extends Element>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Missing element: ${selector}`);
  return found;
}

const photoInput = node<HTMLInputElement>('#photo-input');
const frameList = node<HTMLElement>('#frame-list');
const dateToggle = node<HTMLInputElement>('#date-toggle');
const nicknameToggle = node<HTMLInputElement>('#nickname-toggle');
const nicknameInput = node<HTMLInputElement>('#nickname-input');
const dateText = node<HTMLElement>('#date-text');
const canvas = node<HTMLCanvasElement>('#photo-canvas');
const saveButton = node<HTMLButtonElement>('#save-button');
const resetButton = node<HTMLButtonElement>('#reset-button');
const status = node<HTMLElement>('#photo-status');

const today = formatFriend2PhotoDate(new Date());
let settings: Friend2PhotoSettings = normalizeFriend2PhotoSettings({}, new Date());
let source: CanvasImageSource;
let sourceWidth = 1200;
let sourceHeight = 800;

function buildSample(): HTMLCanvasElement {
  const sample = document.createElement('canvas');
  sample.width = 1200;
  sample.height = 800;
  const ctx = sample.getContext('2d');
  if (ctx) {
    const sky = ctx.createLinearGradient(0, 0, 0, 800);
    sky.addColorStop(0, '#16283c');
    sky.addColorStop(0.62, '#3d5c78');
    sky.addColorStop(1, '#dbe8ee');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 1200, 800);
    ctx.fillStyle = '#eef5fb';
    ctx.beginPath();
    ctx.arc(960, 160, 52, 0, Math.PI * 2);
    ctx.fill();
    for (const [x, y, w, h] of [
      [0, 560, 1200, 240],
      [120, 500, 180, 100],
      [340, 455, 240, 145],
      [650, 490, 200, 110],
    ] as const) {
      ctx.fillStyle = h > 120 ? '#6b4834' : '#7a563c';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#eef5fb';
      ctx.fillRect(x - 8, y - 8, w + 16, 12);
      if (h > 120) {
        ctx.fillStyle = '#ffcf77';
        ctx.fillRect(x + 34, y + 40, 40, 36);
        ctx.fillRect(x + 130, y + 40, 40, 36);
        ctx.fillStyle = '#4a3125';
        ctx.fillRect(x + 92, y + 70, 54, 75);
      }
    }
    ctx.fillStyle = '#2f5e42';
    for (const [x, y, size] of [
      [72, 400, 110],
      [1010, 380, 130],
      [560, 430, 80],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - size * 0.45, y + size);
      ctx.lineTo(x + size * 0.45, y + size);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#eef5fb';
    ctx.fillRect(0, 720, 1200, 80);
  }
  return sample;
}

function render() {
  canvas.width = 1200;
  canvas.height = 800;
  drawFriend2Photo(canvas, source, sourceWidth, sourceHeight, settings);
  dateText.textContent = settings.dateText;
}

function syncControls() {
  for (const button of frameList.querySelectorAll<HTMLButtonElement>('[data-frame]')) {
    button.setAttribute('aria-pressed', String(button.dataset.frame === settings.frameId));
  }
  dateToggle.checked = settings.showDate;
  nicknameToggle.checked = settings.showNickname;
  nicknameInput.value = settings.nickname;
}

function selectFrame(frameId: Friend2PhotoSettings['frameId']) {
  settings = { ...settings, frameId };
  syncControls();
  render();
}

function buildFrameButtons() {
  for (const frame of FRIEND2_PHOTO_FRAMES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'f2-frame';
    button.dataset.frame = frame.id;
    button.setAttribute('aria-pressed', String(frame.id === settings.frameId));
    const swatch = document.createElement('span');
    swatch.className = 'f2-frame-swatch';
    swatch.style.background = `linear-gradient(135deg, ${frame.matColor} 0 52%, ${frame.borderColor} 52% 100%)`;
    const text = document.createElement('span');
    text.className = 'f2-frame-copy';
    const label = document.createElement('strong');
    label.textContent = frame.label;
    const note = document.createElement('small');
    note.textContent = frame.note;
    text.append(label, note);
    button.append(swatch, text);
    button.addEventListener('click', () => selectFrame(frame.id));
    frameList.append(button);
  }
}

photoInput.addEventListener('change', () => {
  const file = photoInput.files?.[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    source = image;
    sourceWidth = image.naturalWidth;
    sourceHeight = image.naturalHeight;
    render();
    status.textContent = `已载入 ${file.name} · 仅本地处理`;
    URL.revokeObjectURL(url);
  };
  image.onerror = () => {
    status.textContent = '这张图片无法读取，请换一张。';
    URL.revokeObjectURL(url);
  };
  image.src = url;
});

dateToggle.addEventListener('change', () => {
  settings = { ...settings, showDate: dateToggle.checked };
  render();
});
nicknameToggle.addEventListener('change', () => {
  settings = { ...settings, showNickname: nicknameToggle.checked };
  render();
});
nicknameInput.addEventListener('input', () => {
  settings = {
    ...settings,
    nickname: nicknameInput.value.trim().slice(0, 20) || FRIEND2_PHOTO_DEFAULT_SETTINGS.nickname,
  };
  render();
});

saveButton.addEventListener('click', () => {
  canvas.toBlob(blob => {
    if (!blob) {
      status.textContent = '导出失败，请重试。';
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `unwritten-photo-${Date.now()}.png`;
    link.click();
    status.textContent = '已生成 PNG · 未自动上传';
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
});

resetButton.addEventListener('click', () => {
  settings = normalizeFriend2PhotoSettings({ dateText: today }, new Date());
  source = buildSample();
  sourceWidth = 1200;
  sourceHeight = 800;
  syncControls();
  render();
  status.textContent = '已重置为默认样例。';
});

source = buildSample();
buildFrameButtons();
syncControls();
render();