import {
  FRIEND3_CARD_DIFFICULTIES,
  createFriend3CardGame,
  formatFriend3CardTime,
  friend3CardDifficulty,
  type Friend3Card,
  type Friend3CardDifficultyId,
  type Friend3CardSnapshot,
} from './town-blockout/town-friend3-card-game';

const game = createFriend3CardGame();
let selectedDifficulty: Friend3CardDifficultyId = 'winter';
let mismatchTimer: number | undefined;
let lastTick = performance.now();

function node<T extends Element>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Missing element: ${selector}`);
  return found;
}

const startScreen = node<HTMLElement>('#start-screen');
const playScreen = node<HTMLElement>('#play-screen');
const winScreen = node<HTMLElement>('#win-screen');
const difficultyList = node<HTMLElement>('#difficulty-list');
const startButton = node<HTMLButtonElement>('#start-button');
const board = node<HTMLElement>('#board');
const boardStatus = node<HTMLParagraphElement>('#board-status');
const hudDifficulty = node<HTMLElement>('#hud-difficulty');
const hudTimer = node<HTMLElement>('#hud-timer');
const hudAttempts = node<HTMLElement>('#hud-attempts');
const hudPairs = node<HTMLElement>('#hud-pairs');
const winSummary = node<HTMLElement>('#win-summary');
const restartButton = node<HTMLButtonElement>('#restart-button');
const exitButton = node<HTMLButtonElement>('#exit-button');
const againButton = node<HTMLButtonElement>('#again-button');
const changeButton = node<HTMLButtonElement>('#change-button');
const winExitButton = node<HTMLButtonElement>('#win-exit-button');

const colors = {
  ink: '#2b211b',
  dark: '#6b4834',
  warm: '#e9a35a',
  snow: '#eef5fb',
  red: '#c05b4d',
  deepRed: '#8a3f36',
  gold: '#d9b36a',
  teal: '#7fd4c8',
  paleTeal: '#a7e4dc',
  blue: '#4f7f9b',
  stone: '#3b4046',
  steel: '#5a6068',
  paper: '#f2e6d2',
  paperShade: '#d8c19e',
  paperLight: '#fff4df',
} as const;

const pixel = 4;

function block(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x * pixel, y * pixel, width * pixel, height * pixel);
}

function drawIcon(ctx: CanvasRenderingContext2D, symbolId: string) {
  switch (symbolId) {
    case 'lantern':
      block(ctx, 7, 1, 2, 1, colors.dark);
      block(ctx, 6, 2, 4, 1, colors.dark);
      block(ctx, 5, 3, 6, 7, colors.red);
      block(ctx, 6, 4, 4, 5, colors.warm);
      block(ctx, 5, 3, 1, 7, colors.deepRed);
      block(ctx, 10, 3, 1, 7, colors.deepRed);
      block(ctx, 6, 10, 4, 1, colors.dark);
      block(ctx, 7, 11, 2, 2, colors.gold);
      break;
    case 'snowman':
      block(ctx, 6, 2, 4, 4, colors.snow);
      block(ctx, 5, 6, 6, 6, colors.snow);
      block(ctx, 4, 12, 8, 2, '#dbe8ee');
      block(ctx, 7, 3, 1, 1, colors.ink);
      block(ctx, 9, 3, 1, 1, colors.ink);
      block(ctx, 7, 4, 1, 1, colors.warm);
      block(ctx, 5, 7, 1, 3, colors.red);
      block(ctx, 10, 7, 1, 3, colors.red);
      block(ctx, 6, 9, 1, 1, colors.ink);
      block(ctx, 9, 9, 1, 1, colors.ink);
      break;
    case 'pine':
      block(ctx, 7, 1, 2, 2, '#2f5e42');
      block(ctx, 5, 4, 6, 3, '#2f5e42');
      block(ctx, 4, 7, 8, 3, '#2f5e42');
      block(ctx, 3, 10, 10, 3, '#2f5e42');
      block(ctx, 7, 13, 2, 2, colors.dark);
      block(ctx, 4, 4, 3, 1, colors.snow);
      block(ctx, 6, 7, 4, 1, colors.snow);
      block(ctx, 4, 10, 6, 1, colors.snow);
      break;
    case 'bell':
      block(ctx, 7, 1, 2, 2, colors.gold);
      block(ctx, 5, 4, 6, 6, colors.gold);
      block(ctx, 4, 10, 8, 2, '#c99c4e');
      block(ctx, 7, 12, 2, 2, '#c99c4e');
      block(ctx, 6, 5, 4, 3, '#f0d79a');
      block(ctx, 4, 11, 8, 1, '#8a5a2b');
      break;
    case 'stove':
      block(ctx, 3, 8, 10, 6, colors.stone);
      block(ctx, 4, 9, 8, 4, colors.steel);
      block(ctx, 5, 10, 2, 2, colors.warm);
      block(ctx, 8, 10, 2, 2, colors.red);
      block(ctx, 3, 6, 2, 6, colors.ink);
      block(ctx, 3, 5, 4, 2, colors.ink);
      block(ctx, 4, 13, 2, 1, colors.ink);
      block(ctx, 10, 13, 2, 1, colors.ink);
      break;
    case 'postbox':
      block(ctx, 7, 1, 2, 1, colors.red);
      block(ctx, 4, 3, 8, 7, colors.red);
      block(ctx, 5, 4, 6, 2, colors.ink);
      block(ctx, 5, 6, 6, 1, colors.deepRed);
      block(ctx, 5, 10, 2, 5, colors.dark);
      block(ctx, 9, 10, 2, 5, colors.dark);
      block(ctx, 3, 15, 10, 1, colors.dark);
      break;
    case 'sled':
      block(ctx, 3, 11, 10, 2, colors.dark);
      block(ctx, 2, 12, 2, 2, colors.dark);
      block(ctx, 4, 9, 2, 2, colors.red);
      block(ctx, 8, 9, 2, 2, colors.red);
      block(ctx, 3, 14, 2, 1, colors.stone);
      block(ctx, 8, 14, 2, 1, colors.stone);
      block(ctx, 11, 8, 2, 1, colors.dark);
      block(ctx, 12, 8, 1, 4, colors.dark);
      break;
    case 'scarf':
      block(ctx, 3, 5, 10, 3, colors.red);
      block(ctx, 4, 8, 3, 5, colors.red);
      block(ctx, 6, 6, 1, 1, colors.warm);
      block(ctx, 8, 6, 1, 1, colors.warm);
      block(ctx, 10, 6, 1, 1, colors.warm);
      block(ctx, 4, 13, 1, 2, colors.deepRed);
      block(ctx, 6, 13, 1, 2, colors.deepRed);
      break;
    case 'cocoa':
      block(ctx, 5, 7, 6, 6, colors.snow);
      block(ctx, 6, 8, 4, 2, colors.dark);
      block(ctx, 11, 8, 2, 3, colors.snow);
      block(ctx, 11, 9, 1, 1, colors.paperShade);
      block(ctx, 7, 1, 1, 2, colors.blue);
      block(ctx, 9, 2, 1, 3, colors.blue);
      block(ctx, 4, 13, 8, 2, colors.paperShade);
      break;
    case 'snowflake':
      block(ctx, 7, 1, 2, 14, colors.teal);
      block(ctx, 1, 7, 14, 2, colors.teal);
      block(ctx, 3, 3, 2, 2, colors.paleTeal);
      block(ctx, 11, 3, 2, 2, colors.paleTeal);
      block(ctx, 5, 5, 2, 2, colors.paleTeal);
      block(ctx, 9, 9, 2, 2, colors.paleTeal);
      block(ctx, 3, 11, 2, 2, colors.paleTeal);
      block(ctx, 11, 11, 2, 2, colors.paleTeal);
      block(ctx, 7, 7, 2, 2, colors.snow);
      break;
    default:
      block(ctx, 6, 6, 4, 4, colors.warm);
      break;
  }
}

function faceCanvas(symbolId: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = false;
  block(ctx, 0, 0, 16, 16, colors.paper);
  block(ctx, 1, 1, 14, 14, colors.paperShade);
  block(ctx, 2, 2, 12, 12, colors.paperLight);
  drawIcon(ctx, symbolId);
  canvas.setAttribute('aria-hidden', 'true');
  return canvas;
}

function createCard(card: Friend3Card): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'f3-card';
  button.dataset.index = String(card.index);
  button.dataset.symbol = card.symbolId;
  button.dataset.faceUp = 'false';
  button.dataset.matched = 'false';
  button.setAttribute('aria-label', `第 ${card.index + 1} 张牌，未翻开`);

  const inner = document.createElement('span');
  inner.className = 'f3-card-inner';
  const back = document.createElement('span');
  back.className = 'f3-card-face f3-card-back';
  back.setAttribute('aria-hidden', 'true');
  const front = document.createElement('span');
  front.className = 'f3-card-face f3-card-front';
  front.setAttribute('aria-hidden', 'true');
  front.append(faceCanvas(card.symbolId));
  inner.append(back, front);
  button.append(inner);
  button.addEventListener('click', () => handleFlip(card.index));
  return button;
}

function showScreen(name: 'start' | 'play' | 'win') {
  startScreen.hidden = name !== 'start';
  playScreen.hidden = name !== 'play';
  winScreen.hidden = name !== 'win';
}

function updateHud(snapshot: Friend3CardSnapshot) {
  hudDifficulty.textContent = snapshot.difficulty.label;
  hudTimer.textContent = formatFriend3CardTime(snapshot.elapsedMs);
  hudAttempts.textContent = `步数 ${snapshot.attempts}`;
  hudPairs.textContent = `配对 ${snapshot.pairsFound}/${snapshot.totalPairs}`;
}

function syncCards(snapshot: Friend3CardSnapshot) {
  const buttons = board.querySelectorAll<HTMLButtonElement>('.f3-card');
  for (const card of snapshot.cards) {
    const button = buttons[card.index];
    if (!button) continue;
    button.dataset.faceUp = String(card.faceUp);
    button.dataset.matched = String(card.matched);
    button.setAttribute(
      'aria-label',
      card.matched
        ? `第 ${card.index + 1} 张牌，${card.label}，已配对`
        : card.faceUp
          ? `第 ${card.index + 1} 张牌，${card.label}`
          : `第 ${card.index + 1} 张牌，未翻开`,
    );
  }
}

function sync() {
  const snapshot = game.snapshot();
  syncCards(snapshot);
  updateHud(snapshot);
  return snapshot;
}

function announce(message: string) {
  boardStatus.textContent = message;
}

function buildBoard(snapshot: Friend3CardSnapshot) {
  board.style.setProperty('--columns', String(snapshot.difficulty.columns));
  board.replaceChildren(...snapshot.cards.map(createCard));
  syncCards(snapshot);
}

function updateDifficultyButtons() {
  for (const button of difficultyList.querySelectorAll<HTMLButtonElement>('.f3-difficulty')) {
    button.setAttribute('aria-pressed', String(button.dataset.difficulty === selectedDifficulty));
  }
  const difficulty = friend3CardDifficulty(selectedDifficulty);
  startButton.textContent = `开始翻牌 · ${difficulty.label}（${difficulty.pairs} 对）`;
}

function renderDifficultyChoices() {
  const buttons = FRIEND3_CARD_DIFFICULTIES.map(difficulty => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'f3-difficulty';
    button.dataset.difficulty = difficulty.id;
    button.setAttribute('aria-pressed', String(difficulty.id === selectedDifficulty));
    const mini = document.createElement('span');
    mini.className = 'f3-mini-grid';
    mini.setAttribute('aria-hidden', 'true');
    for (let index = 0; index < difficulty.columns * difficulty.rows; index += 1) {
      mini.append(document.createElement('i'));
    }
    const strong = document.createElement('strong');
    strong.textContent = difficulty.label;
    const small = document.createElement('small');
    small.textContent = `${difficulty.note} · ${difficulty.columns}×${difficulty.rows}`;
    button.append(mini, strong, small);
    button.addEventListener('click', () => {
      selectedDifficulty = difficulty.id;
      updateDifficultyButtons();
    });
    return button;
  });
  difficultyList.replaceChildren(...buttons);
}

function clearMismatchTimer() {
  if (mismatchTimer !== undefined) {
    window.clearTimeout(mismatchTimer);
    mismatchTimer = undefined;
  }
  board.removeAttribute('aria-busy');
}

function startGame(difficultyId: Friend3CardDifficultyId = selectedDifficulty) {
  clearMismatchTimer();
  if (!game.start(difficultyId)) return;
  selectedDifficulty = difficultyId;
  lastTick = performance.now();
  const snapshot = game.snapshot();
  buildBoard(snapshot);
  sync();
  showScreen('play');
  updateDifficultyButtons();
  announce(`牌局开始：${snapshot.difficulty.label}，${snapshot.cards.length} 张牌。`);
  window.setTimeout(() => board.querySelector<HTMLButtonElement>('.f3-card')?.focus(), 0);
}

function restartGame() {
  clearMismatchTimer();
  if (!game.restart()) return;
  lastTick = performance.now();
  const snapshot = game.snapshot();
  buildBoard(snapshot);
  sync();
  showScreen('play');
  announce('本局已重开，牌序重新洗过。');
  window.setTimeout(() => board.querySelector<HTMLButtonElement>('.f3-card')?.focus(), 0);
}

function exitGame() {
  clearMismatchTimer();
  game.exit();
  board.replaceChildren();
  boardStatus.textContent = '';
  showScreen('start');
  updateDifficultyButtons();
  const snapshot = sync();
  updateHud(snapshot);
  startButton.focus();
}

function showWin(snapshot: Friend3CardSnapshot) {
  winSummary.textContent = `${snapshot.difficulty.label} · 用时 ${formatFriend3CardTime(snapshot.elapsedMs)} · ${snapshot.attempts} 步 · 配对 ${snapshot.pairsFound}/${snapshot.totalPairs}`;
  showScreen('win');
  window.setTimeout(() => againButton.focus(), 0);
}

function handleFlip(index: number) {
  const result = game.flip(index);
  if (result.kind === 'ignored') {
    if (result.reason === 'busy') announce('先记住这两张牌，稍等片刻。');
    else if (result.reason === 'face-up') announce('这张牌已经翻开了。');
    else if (result.reason === 'matched') announce('这张牌已经配对。');
    return;
  }
  if (result.kind === 'first') {
    sync();
    announce(`翻开了${result.label}。`);
    return;
  }
  if (result.kind === 'mismatch') {
    sync();
    announce(`${result.labels[0]}和${result.labels[1]}不是一对，记住它们。`);
    board.setAttribute('aria-busy', 'true');
    const delay = game.snapshot().difficulty.mismatchDelayMs;
    mismatchTimer = window.setTimeout(() => {
      mismatchTimer = undefined;
      game.resolveMismatch();
      board.removeAttribute('aria-busy');
      sync();
      announce('牌面已翻回，继续寻找。');
    }, delay);
    return;
  }
  if (result.kind === 'match') {
    const snapshot = sync();
    if (result.won) {
      announce(`全部配对完成！用时 ${formatFriend3CardTime(snapshot.elapsedMs)}，${snapshot.attempts} 步。`);
      showWin(snapshot);
    } else {
      announce(`配对成功：${result.label}。`);
    }
  }
}

startButton.addEventListener('click', () => startGame());
restartButton.addEventListener('click', restartGame);
exitButton.addEventListener('click', exitGame);
againButton.addEventListener('click', restartGame);
changeButton.addEventListener('click', exitGame);
winExitButton.addEventListener('click', exitGame);

window.setInterval(() => {
  const now = performance.now();
  const delta = Math.max(0, now - lastTick);
  lastTick = now;
  if (game.snapshot().status !== 'playing') return;
  game.tick(delta);
  hudTimer.textContent = formatFriend3CardTime(game.snapshot().elapsedMs);
}, 250);

renderDifficultyChoices();
updateDifficultyButtons();
sync();
showScreen('start');