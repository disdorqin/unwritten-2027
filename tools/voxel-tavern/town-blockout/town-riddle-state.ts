import { townRiddleBank } from './riddle-bank';

export const riddleStorageKey = 'unwritten.riddles.v1';
const dayMillis = 86_400_000;
const maxAttempts = 3;
type RiddleRow = typeof townRiddleBank[number];
export type TownRiddleId = RiddleRow[0];
type Riddle = { id: TownRiddleId; question: string; answer: string; topic: string; easy: boolean };

const byId = new Map<TownRiddleId, Riddle>(townRiddleBank.map(([id, question, answer, topic], index) =>
  [id, { id, question, answer, topic, easy: index < 30 }]));

function shuffled<T>(values: readonly T[], seed: number) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const pick = seed % (i + 1);
    [result[i], result[pick]] = [result[pick], result[i]];
  }
  return result;
}

const easy = shuffled(townRiddleBank.slice(0, 30).map(([id]) => id), 0x2ace32da);
const medium = shuffled(townRiddleBank.slice(30, 50).map(([id]) => id), 0x5b4aa56c);
const hard = shuffled(townRiddleBank.slice(50).map(([id]) => id), 0xab10de7a);

function windowOf<T>(pool: readonly T[], first: number, count: number) {
  return Array.from({ length: count }, (_, offset) =>
    pool[((first + offset) % pool.length + pool.length) % pool.length]);
}

export function localRiddleDate(now: Date) {
  return [String(now.getFullYear()).padStart(4, '0'), String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')].join('-');
}

export function selectRiddles(now: Date): TownRiddleId[] {
  const month = now.getMonth();
  const day = now.getDate();
  // UTC is used only to convert local calendar components to a day index, so daylight saving
  // changes do not skip or duplicate days. Midnight and the opening date themselves are local.
  const ordinal = Math.floor(Date.UTC(now.getFullYear(), month, day) / dayMillis);
  if (month === 11 && day === 31) return townRiddleBank.slice(50).map(([id]) => id);

  const weekday = now.getDay();
  const weekend = weekday === 0 || weekday === 6;
  const newYearsDay = month === 0 && day === 1;
  const holiday = weekend || newYearsDay;
  // Steps of four and two leave the preceding three days out of the candidate windows.
  const selected = [
    ...windowOf(easy, ordinal * 4, holiday ? 3 : 4),
    ...windowOf(medium, ordinal * 2, 2),
  ];
  if (holiday) {
    // Weekends walk the ten hard riddles in order. A weekday Jan 1 has its own slot;
    // repeating one hard riddle from the all-hard Dec 31 special is unavoidable.
    const weekendSlot = Math.floor((ordinal + 3) / 7) * 2;
    selected.push(...windowOf(hard, weekendSlot + (weekday === 0 ? 1 : weekend ? 0 : 4), 1));
  }
  return selected;
}

export type RiddleSave = {
  date: string;
  groupIds: TownRiddleId[];
  solvedIds: TownRiddleId[];
  attempts: Partial<Record<TownRiddleId, number>>;
  totalSolved: number;
  fullLightDays: string[];
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
type SolveEvent = {
  type: 'riddle.solve';
  actor: 'player:local';
  target: 'lantern-workshop.wall';
  payload: { riddleId: TownRiddleId };
  t: number;
};

type RiddleAnswer =
  | { kind: 'stale' | 'unavailable' | 'empty' | 'already-solved' | 'locked' }
  | { kind: 'wrong'; attempts: number }
  | { kind: 'solved'; fullLight: boolean; event: SolveEvent };

function normalizeSaved(raw: unknown, now: Date): RiddleSave {
  const date = localRiddleDate(now);
  const groupIds = selectRiddles(now);
  const source = raw && typeof raw === 'object' ? raw as Partial<RiddleSave> : {};
  const current = source.date === date && Array.isArray(source.groupIds) &&
    source.groupIds.length === groupIds.length && groupIds.every((id, i) => source.groupIds?.[i] === id);
  const solvedIds = current && Array.isArray(source.solvedIds) ? groupIds.filter(id => source.solvedIds?.includes(id)) : [];
  const attempts: RiddleSave['attempts'] = {};
  if (current && source.attempts && typeof source.attempts === 'object') {
    for (const id of groupIds) {
      const value = source.attempts[id];
      if (typeof value === 'number' && Number.isInteger(value) && value > 0) attempts[id] = Math.min(maxAttempts, value);
    }
  }
  const fullLightDays = Array.isArray(source.fullLightDays)
    ? [...new Set(source.fullLightDays.filter(day => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day)))] : [];
  const totalSolved = typeof source.totalSolved === 'number' && Number.isSafeInteger(source.totalSolved) && source.totalSolved >= 0
    ? Math.max(solvedIds.length, source.totalSolved) : solvedIds.length;
  return { date, groupIds, solvedIds, attempts, totalSolved, fullLightDays };
}

function choicesFor(riddle: Riddle, date: string) {
  if (!riddle.easy) return undefined;
  const seed = Number(date.replaceAll('-', '')) * 67 + Number(riddle.id.slice(1));
  const candidates = [...new Set(townRiddleBank.slice(0, 30)
    .map(([, , answer]) => answer)
    .filter(answer => !answer.includes(riddle.answer) && !riddle.answer.includes(answer)))];
  return shuffled([riddle.answer, ...shuffled(candidates, seed).slice(0, 2)], seed ^ 0xc4cefe1a);
}

export function directionalRiddleHint(riddle: Pick<Riddle, 'question' | 'topic'>) {
  if (riddle.question.includes('打一食物')) return '往吃的上想';
  if (riddle.question.includes('打一植物')) return '往植物上想';
  if (riddle.question.includes('打一活动')) return '往大家一起做的事上想';
  if (riddle.topic === '字谜') return '想想字的笔画和部件';
  if (riddle.topic === '冬日') return '往冬天见得到的东西上想';
  if (riddle.topic === '新年') return '往过年会用到的东西上想';
  if (riddle.topic === '小镇') return '想想镇上平常能见到的物件';
  return '往自然景物上想';
}

export function createRiddleGame(storage: StorageLike | undefined, clock: () => Date = () => new Date()) {
  let stored = read();
  let record = normalizeSaved(parse(stored), clock());
  if (stored !== JSON.stringify(record)) save();

  function read() {
    try { return storage?.getItem(riddleStorageKey); }
    catch { return undefined; }
  }

  function parse(raw: string | null | undefined) {
    try { return raw ? JSON.parse(raw) as unknown : undefined; }
    catch { return undefined; }
  }

  function save() {
    if (!storage) return;
    try {
      const next = JSON.stringify(record);
      storage.setItem(riddleStorageKey, next);
      stored = next;
    } catch { /* Keep the session playable with denied or unavailable storage. */ }
  }

  function sync(now = clock()) {
    if (localRiddleDate(now) !== record.date) {
      record = normalizeSaved(record, now);
      save();
    }
    return record;
  }

  function refresh(now = clock()) {
    const raw = read();
    if (raw && raw !== stored) {
      stored = raw;
      const candidate = normalizeSaved(parse(raw), now);
      if (candidate.totalSolved >= record.totalSolved) {
        record = candidate;
        if (stored !== JSON.stringify(record)) save();
      }
    }
    return sync(now);
  }

  function view(slot: number) {
    const day = sync();
    const riddle = byId.get(day.groupIds[slot]);
    if (!riddle) return undefined;
    return {
      date: day.date, id: riddle.id, question: riddle.question,
      options: choicesFor(riddle, day.date), solvedAnswer: day.solvedIds.includes(riddle.id) ? riddle.answer : undefined,
      hint: (day.attempts[riddle.id] ?? 0) === 2 && !day.solvedIds.includes(riddle.id) ? directionalRiddleHint(riddle) : undefined,
      attempts: day.attempts[riddle.id] ?? 0,
    };
  }

  function answer(slot: number, input: string, expected: { date: string; id: TownRiddleId }): RiddleAnswer {
    const now = clock();
    const day = refresh(now);
    if (day.date !== expected.date || day.groupIds[slot] !== expected.id) return { kind: 'stale' };

    const riddle = byId.get(expected.id);
    if (!riddle) return { kind: 'unavailable' };
    if (day.solvedIds.includes(riddle.id)) return { kind: 'already-solved' };
    const used = day.attempts[riddle.id] ?? 0;
    if (used >= maxAttempts) return { kind: 'locked' };
    const guess = input.trim();
    if (!guess) return { kind: 'empty' };
    if (guess !== riddle.answer) {
      day.attempts[riddle.id] = used + 1;
      save();
      return { kind: 'wrong', attempts: used + 1 };
    }

    day.solvedIds.push(riddle.id);
    day.totalSolved++;
    const fullLight = day.solvedIds.length === day.groupIds.length && !day.fullLightDays.includes(day.date);
    if (fullLight) day.fullLightDays.push(day.date);
    save();
    return {
      kind: 'solved', fullLight,
      event: { type: 'riddle.solve', actor: 'player:local', target: 'lantern-workshop.wall',
        payload: { riddleId: riddle.id }, t: now.getTime() },
    };
  }

  function getProgress() {
    const day = refresh();
    return {
      totalSolved: day.totalSolved, fullLightDays: [...day.fullLightDays],
      fullLightToday: day.fullLightDays.includes(day.date),
    };
  }

  return { sync, refresh, view, answer, getProgress };
}
