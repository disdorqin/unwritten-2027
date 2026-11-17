import type { TownActivityContext } from './town-activity';

export type SnowballBoardRow = {
  id: string;
  label: string;
  throws: number;
  hits: number;
  bestStreak: number;
  received: number;
};

export type SnowballTitle = Pick<SnowballBoardRow, 'id' | 'label'> & { value: number };
type Score = Omit<SnowballBoardRow, 'id' | 'label'>;
type BoardOptions = {
  open: TownActivityContext['open'];
  announce?(message: string): void;
  label?(id: string): string;
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  storageKey?: string;
  now?: () => number;
};

const streakLabels = new Map([[3, '三'], [5, '五'], [8, '八']]);
const scoreKey = 'unwritten:snowbattle:scores:v1';
const emptyScore = () => ({ throws: 0, hits: 0, bestStreak: 0, received: 0 });
const byStanding = (a: SnowballBoardRow, b: SnowballBoardRow) =>
  b.hits - a.hits || b.bestStreak - a.bestStreak || a.received - b.received || a.id.localeCompare(b.id);

function canonicalId(id: string) {
  return id === 'local-player' ? 'local' : id;
}

function asCount(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function selectSnowballTitles(rows: readonly SnowballBoardRow[]) {
  function title(row: SnowballBoardRow | undefined, value: number | undefined): SnowballTitle | null {
    return row && value !== undefined && value > 0 ? { id: row.id, label: row.label, value } : null;
  }
  const standings = [...rows].sort(byStanding);
  const popular = [...standings].sort((a, b) => b.received - a.received || byStanding(a, b))[0];
  const accuracy = standings.filter(row => row.throws >= 30)
    .sort((a, b) => b.hits / b.throws - a.hits / a.throws || b.throws - a.throws || byStanding(a, b))[0];
  return {
    snowballKing: title(standings[0], standings[0]?.hits),
    sharpshooter: accuracy ? { id: accuracy.id, label: accuracy.label, value: accuracy.hits / accuracy.throws } : null,
    popularityKing: title(popular, popular?.received),
  };
}

export function createTownSnowballBoard({
  open: openPlace, announce, label = id => id === 'local' ? '我' : id.replace(/^npc:/, ''),
  storage, storageKey = scoreKey, now = Date.now,
}: BoardOptions) {
  const results = new Map<string, Score>();
  const streaks = new Map<string, { count: number; lastHit: number }>();
  let pending: ReturnType<typeof setTimeout> | undefined;
  let dirty = false;
  let tableBody: HTMLTableSectionElement | undefined;
  let titleList: HTMLDListElement | undefined;

  try {
    storage ??= globalThis.localStorage;
    const saved: unknown = JSON.parse(storage?.getItem(storageKey) ?? '[]');
    if (Array.isArray(saved)) for (const raw of saved) {
      if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id) continue;
      const id = canonicalId(raw.id);
      if (results.has(id)) continue;
      const hits = asCount(raw.hits);
      results.set(id, {
        throws: Math.max(asCount(raw.throws), hits), hits,
        bestStreak: Math.min(asCount(raw.bestStreak), hits), received: asCount(raw.received),
      });
    }
  } catch { /* Local scores still work when storage is unavailable. */ }

  function getRows(): SnowballBoardRow[] {
    return [...results].map(([id, score]) => ({ id, label: label(id), ...score })).sort(byStanding);
  }

  function getTitles() {
    return selectSnowballTitles(getRows());
  }

  function scoreFor(id: string) {
    let score = results.get(id);
    if (!score) {
      score = emptyScore();
      results.set(id, score);
    }
    return score;
  }

  function flush() {
    if (pending !== undefined) {
      clearTimeout(pending);
      pending = undefined;
    }
    if (!dirty) return;
    dirty = false;
    try {
      storage?.setItem(storageKey, JSON.stringify([...results].map(([id, score]) => ({ id, ...score }))));
    } catch { /* Keep the session scores if storing them fails. */ }
    paint();
  }
  if (typeof window !== 'undefined') window.addEventListener('pagehide', flush);

  function queueUpdate() {
    dirty = true;
    if (pending === undefined) pending = setTimeout(flush, 0);
  }

  function recordThrow(by: string) {
    const id = canonicalId(by);
    if (!id) return;
    scoreFor(id).throws++;
    queueUpdate();
  }

  function recordMiss(by: string) {
    streaks.delete(canonicalId(by));
  }

  function recordHit(by: string, targetId?: string, options: { announce?: boolean } = {}) {
    const id = canonicalId(by);
    const target = targetId && canonicalId(targetId);
    if (!id || id === target) return 0;
    const score = scoreFor(id);
    const time = now();
    const previous = streaks.get(id);
    const count = previous && time - previous.lastHit <= 5000 ? previous.count + 1 : 1;
    streaks.set(id, { count, lastHit: time });
    score.hits++;
    score.throws = Math.max(score.throws, score.hits);
    score.bestStreak = Math.max(score.bestStreak, count);
    if (target) {
      scoreFor(target).received++;
      streaks.delete(target);
    }
    queueUpdate();
    const milestone = streakLabels.get(count);
    if (options.announce && milestone) announce?.(`${label(id)}${milestone}连中！`);
    return count;
  }

  function paint() {
    if (!tableBody?.isConnected || !titleList) return;
    const rows = getRows();
    if (!rows.length) rows.push({ id: 'local', label: label('local'), ...emptyScore() });
    tableBody.replaceChildren();
    for (const { label: name, hits, bestStreak, received } of rows) {
      const row = tableBody.insertRow();
      const header = document.createElement('th');
      header.scope = 'row';
      header.textContent = name;
      header.style.cssText = 'text-align:left;font-weight:600;padding:9px 6px;overflow-wrap:anywhere';
      row.append(header);
      for (const count of [hits, bestStreak, received]) {
        const cell = row.insertCell();
        cell.textContent = String(count);
        cell.style.cssText = 'text-align:center;font-variant-numeric:tabular-nums;padding:9px 6px';
      }
      row.style.borderTop = '1px solid #3d4b62';
    }
    const { snowballKing, sharpshooter, popularityKing } = selectSnowballTitles(rows);
    titleList.replaceChildren();
    for (const [name, winner, empty] of [
      ['雪球王', snowballKing, '累计命中最多'],
      ['百发百中', sharpshooter, '投掷满 30 次后比命中率'],
      ['人气王', popularityKing, '累计被砸最多'],
    ] as const) {
      const title = document.createElement('dt');
      title.textContent = name;
      title.style.cssText = 'color:#f2cd83;font-weight:600';
      const person = document.createElement('dd');
      const value = winner && name === '百发百中' ? ` · ${Math.round(winner.value * 100)}%` : '';
      person.textContent = winner ? winner.label + value : empty;
      person.style.cssText = 'margin:0;color:#c9d4e5;overflow-wrap:anywhere';
      titleList.append(title, person);
    }
  }

  function open() {
    const panel = openPlace('雪仗榜', '在这台设备上累计的雪仗战绩。');
    const table = document.createElement('table');
    table.setAttribute('aria-label', '雪仗战绩');
    table.style.cssText = 'width:100%;border-collapse:collapse;font-size:13px;color:#eef5ff';
    const columns = table.createTHead().insertRow();
    for (const name of ['镇民', '命中数', '最高连中', '被砸数']) {
      const column = document.createElement('th');
      column.scope = 'col';
      column.textContent = name;
      column.style.cssText = 'padding:0 6px 9px;color:#bfcde0;text-align:center';
      if (name === '镇民') column.style.textAlign = 'left';
      columns.append(column);
    }
    tableBody = table.createTBody();

    const heading = document.createElement('h3');
    heading.textContent = '当前头衔领跑';
    heading.style.cssText = 'margin:4px 0 0;color:#e7f0ff;font-size:14px;font-weight:650';
    titleList = document.createElement('dl');
    titleList.style.cssText = 'margin:0;display:grid;grid-template-columns:max-content minmax(0,1fr);gap:8px 13px;padding:12px;border:1px solid #5b6171;border-radius:7px;font-size:13px;background:#1b273a';
    panel.append(table, heading, titleList);
    paint();
  }

  return {
    open, recordThrow, recordHit, recordMiss,
    resetStreaks: () => streaks.clear(), getRows, getTitles, flush,
  };
}
