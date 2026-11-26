export type Friend3CardDifficultyId = 'cozy' | 'winter' | 'blizzard';

export type Friend3CardDifficulty = {
  readonly id: Friend3CardDifficultyId;
  readonly label: string;
  readonly columns: number;
  readonly rows: number;
  readonly pairs: number;
  readonly mismatchDelayMs: number;
  readonly note: string;
};

export const FRIEND3_CARD_DIFFICULTIES = [
  { id: 'cozy', label: '暖炉小局', columns: 4, rows: 3, pairs: 6, mismatchDelayMs: 650, note: '6 对 · 初次上手' },
  { id: 'winter', label: '雪夜标准', columns: 4, rows: 4, pairs: 8, mismatchDelayMs: 700, note: '8 对 · 标准一局' },
  { id: 'blizzard', label: '暴雪挑战', columns: 4, rows: 5, pairs: 10, mismatchDelayMs: 750, note: '10 对 · 记忆挑战' },
] as const satisfies readonly Friend3CardDifficulty[];

export const FRIEND3_CARD_SYMBOLS = [
  { id: 'lantern', label: '灯笼' },
  { id: 'snowman', label: '雪人' },
  { id: 'pine', label: '松树' },
  { id: 'bell', label: '铃铛' },
  { id: 'stove', label: '火炉' },
  { id: 'postbox', label: '邮筒' },
  { id: 'sled', label: '雪橇' },
  { id: 'scarf', label: '围巾' },
  { id: 'cocoa', label: '热可可' },
  { id: 'snowflake', label: '窗花' },
] as const;

export type Friend3CardStatus = 'idle' | 'playing' | 'won';
export type Friend3CardIgnoreReason = 'idle' | 'won' | 'index' | 'matched' | 'face-up' | 'busy';

export type Friend3Card = {
  index: number;
  symbolId: string;
  label: string;
  faceUp: boolean;
  matched: boolean;
};

export type Friend3CardFlipResult =
  | { kind: 'ignored'; reason: Friend3CardIgnoreReason }
  | { kind: 'first'; index: number; symbolId: string; label: string }
  | {
      kind: 'match';
      indexes: [number, number];
      symbolId: string;
      label: string;
      pairsFound: number;
      totalPairs: number;
      won: boolean;
    }
  | {
      kind: 'mismatch';
      indexes: [number, number];
      symbols: [string, string];
      labels: [string, string];
    };

export type Friend3CardSnapshot = {
  status: Friend3CardStatus;
  difficulty: Friend3CardDifficulty;
  cards: Friend3Card[];
  flipped: number[];
  pairsFound: number;
  totalPairs: number;
  attempts: number;
  flips: number;
  elapsedMs: number;
  pendingMismatch: boolean;
};

export type Friend3CardGameOptions = {
  random?: () => number;
  seed?: number;
};

export function createFriend3CardRandom(seed: number): () => number {
  let state = (Number.isFinite(seed) ? Math.floor(seed) : 0) >>> 0;
  if (state === 0) state = 0x9e3779b9;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function friend3CardDifficulty(id: Friend3CardDifficultyId): Friend3CardDifficulty {
  return FRIEND3_CARD_DIFFICULTIES.find(item => item.id === id) ?? FRIEND3_CARD_DIFFICULTIES[1];
}

export function formatFriend3CardTime(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor((Number.isFinite(elapsedMs) ? elapsedMs : 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function shuffle<T>(values: T[], random: () => number): void {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const raw = random();
    const unit = Number.isFinite(raw) ? Math.max(0, Math.min(0.999999999, raw)) : 0;
    const swap = Math.floor(unit * (index + 1));
    const value = values[index];
    values[index] = values[swap];
    values[swap] = value;
  }
}

function ignored(reason: Friend3CardIgnoreReason): Friend3CardFlipResult {
  return { kind: 'ignored', reason };
}

export function createFriend3CardGame(options: Friend3CardGameOptions = {}) {
  let random = options.random ?? (options.seed === undefined ? Math.random : createFriend3CardRandom(options.seed));
  let difficulty = friend3CardDifficulty('winter');
  let status: Friend3CardStatus = 'idle';
  let cards: Friend3Card[] = [];
  let flipped: number[] = [];
  let pairsFound = 0;
  let attempts = 0;
  let flips = 0;
  let elapsedMs = 0;
  let pendingMismatch = false;

  function start(id: Friend3CardDifficultyId = difficulty.id, seed?: number): boolean {
    const next = FRIEND3_CARD_DIFFICULTIES.find(item => item.id === id);
    if (!next) return false;
    if (seed !== undefined) random = createFriend3CardRandom(seed);
    difficulty = next;
    const deck: Friend3Card[] = [];
    for (let pair = 0; pair < next.pairs; pair += 1) {
      const symbol = FRIEND3_CARD_SYMBOLS[pair % FRIEND3_CARD_SYMBOLS.length];
      for (let copy = 0; copy < 2; copy += 1) {
        deck.push({
          index: deck.length,
          symbolId: symbol.id,
          label: symbol.label,
          faceUp: false,
          matched: false,
        });
      }
    }
    shuffle(deck, random);
    deck.forEach((card, index) => {
      card.index = index;
    });
    cards = deck;
    status = 'playing';
    flipped = [];
    pairsFound = 0;
    attempts = 0;
    flips = 0;
    elapsedMs = 0;
    pendingMismatch = false;
    return true;
  }

  function flip(index: number): Friend3CardFlipResult {
    if (status === 'idle') return ignored('idle');
    if (status === 'won') return ignored('won');
    if (pendingMismatch) return ignored('busy');
    if (!Number.isInteger(index) || index < 0 || index >= cards.length) return ignored('index');
    const card = cards[index];
    if (card.matched) return ignored('matched');
    if (card.faceUp) return ignored('face-up');
    card.faceUp = true;
    flips += 1;
    if (flipped.length === 0) {
      flipped = [index];
      return { kind: 'first', index, symbolId: card.symbolId, label: card.label };
    }
    const first = cards[flipped[0]];
    flipped.push(index);
    attempts += 1;
    if (first.symbolId === card.symbolId) {
      first.matched = true;
      card.matched = true;
      flipped = [];
      pairsFound += 1;
      const won = pairsFound === difficulty.pairs;
      if (won) status = 'won';
      return {
        kind: 'match',
        indexes: [first.index, card.index],
        symbolId: card.symbolId,
        label: card.label,
        pairsFound,
        totalPairs: difficulty.pairs,
        won,
      };
    }
    pendingMismatch = true;
    return {
      kind: 'mismatch',
      indexes: [first.index, card.index],
      symbols: [first.symbolId, card.symbolId],
      labels: [first.label, card.label],
    };
  }

  function resolveMismatch(): boolean {
    if (!pendingMismatch || status !== 'playing') return false;
    for (const index of flipped) cards[index].faceUp = false;
    flipped = [];
    pendingMismatch = false;
    return true;
  }

  function tick(ms: number): number {
    if (status !== 'playing' || !Number.isFinite(ms) || ms <= 0) return elapsedMs;
    elapsedMs += Math.floor(ms);
    return elapsedMs;
  }

  function restart(seed?: number): boolean {
    return start(difficulty.id, seed);
  }

  function exit(): void {
    status = 'idle';
    cards = [];
    flipped = [];
    pairsFound = 0;
    attempts = 0;
    flips = 0;
    elapsedMs = 0;
    pendingMismatch = false;
  }

  function snapshot(): Friend3CardSnapshot {
    return {
      status,
      difficulty,
      cards: cards.map(card => ({ ...card })),
      flipped: [...flipped],
      pairsFound,
      totalPairs: difficulty.pairs,
      attempts,
      flips,
      elapsedMs,
      pendingMismatch,
    };
  }

  return { start, flip, resolveMismatch, tick, restart, exit, snapshot };
}

export type Friend3CardGame = ReturnType<typeof createFriend3CardGame>;