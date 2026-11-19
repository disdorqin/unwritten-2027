import type { TownActivityContext } from './town-activity';
import { npcAddedDialogue } from './town-npc-added-dialogue';
import { npcPeriod } from './town-npc-dialogue';

export const regionalCarryKey = 'unwritten.regional-carry.v1';
export const regionalCarryCapacity = 3;
export const pineRoastMs = 30_000;

type Item = 'fresh-fish' | 'roast-fish' | 'bamboo' | 'ridge-snow' | 'lantern';
type Save = { items: Item[]; roastReadyAt?: number };
type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;
const items = new Set<Item>(['fresh-fish', 'roast-fish', 'bamboo', 'ridge-snow', 'lantern']);

function browserStorage() {
  try { return globalThis.localStorage; }
  catch { return undefined; }
}

export function createRegionalCarry({
  storage = browserStorage(), now = Date.now,
}: { storage?: StoragePort; now?: () => number } = {}) {
  let save: Save = { items: [] };
  function load(storage?: StoragePort): Save {
    try {
      const value = JSON.parse(storage?.getItem(regionalCarryKey) ?? 'null') as Partial<Save> | null;
      const clean = Array.isArray(value?.items)
        ? value.items.filter(item => items.has(item)).slice(0, regionalCarryCapacity) : [];
      const readyAt = value?.roastReadyAt;
      const roastReadyAt = clean.includes('fresh-fish') && typeof readyAt === 'number' &&
        Number.isFinite(readyAt) && readyAt > 0 ? readyAt : undefined;
      return { items: clean, roastReadyAt };
    } catch {
      return save;
    }
  }
  save = load(storage);

  function persist() {
    try { storage?.setItem(regionalCarryKey, JSON.stringify(save)); }
    catch { /* Keep the bag usable during this visit. */ }
  }

  function snapshot() {
    if (save.roastReadyAt !== undefined && now() >= save.roastReadyAt) {
      const index = save.items.indexOf('fresh-fish');
      if (index !== -1) save.items[index] = 'roast-fish';
      delete save.roastReadyAt;
      persist();
    }
    return {
      used: save.items.length,
      fresh: save.items.filter(item => item === 'fresh-fish').length,
      roast: save.items.filter(item => item === 'roast-fish').length,
      roastReadyAt: save.roastReadyAt,
    };
  }

  return {
    snapshot,
    collectFish() {
      if (snapshot().used === regionalCarryCapacity) return false;
      save.items.push('fresh-fish');
      persist();
      return true;
    },
    startRoasting(lit: boolean) {
      const state = snapshot();
      if (state.roastReadyAt !== undefined) return 'busy';
      if (!lit) return 'unlit';
      if (!state.fresh) return 'empty';
      save.roastReadyAt = now() + pineRoastMs;
      persist();
      return 'started';
    },
    eatRoast() {
      snapshot();
      const index = save.items.indexOf('roast-fish');
      if (index === -1) return false;
      save.items.splice(index, 1);
      persist();
      return true;
    },
  };
}

export function isPineStoryTime(now: number, isDaytime: boolean) {
  const period = npcPeriod(new Date(now), isDaytime);
  return period === '夜里' || period === '跨年夜';
}

export const pineStoryLines = [
  npcAddedDialogue.樊樵.familiar.再访[1],
  npcAddedDialogue.樊樵.guides[3],
] as const;

export function createPineFireActivities(
  context: Pick<TownActivityContext, 'open' | 'announce'>,
  carry: ReturnType<typeof createRegionalCarry>,
  options: {
    lighted(): boolean;
    warmFromRoast(): void;
    storyHint(): string | undefined;
    leaveSeat(): void;
    now?: () => number;
  },
) {
  const now = options.now ?? Date.now;
  let grillPanel: { panel: HTMLElement; dialog: HTMLDialogElement | null; status: HTMLElement; begin: HTMLButtonElement; eat: HTMLButtonElement } | undefined;

  function button(panel: HTMLElement, label: string, run: () => void) {
    const control = document.createElement('button');
    control.type = 'button';
    control.textContent = label;
    control.onclick = run;
    panel.append(control);
    return control;
  }

  function refresh() {
    if (!grillPanel) return;
    const { panel, dialog, status, begin, eat } = grillPanel;
    if (!panel.isConnected || dialog?.open === false) {
      grillPanel = undefined;
      return;
    }
    const state = carry.snapshot();
    const remaining = state.roastReadyAt === undefined ? undefined : Math.max(0, Math.ceil((state.roastReadyAt - now()) / 1000));
    const fire = options.lighted() ? '' : ' · 先给火塘添柴';
    const cooking = remaining === undefined ? '' : ` · 烤制还需 ${remaining} 秒`;
    const label = `随身格 ${state.used}/${regionalCarryCapacity} · 鲜鱼 ${state.fresh} · 烤鱼 ${state.roast}${fire}${cooking}`;
    if (status.textContent !== label) status.textContent = label;
    begin.disabled = !options.lighted() || state.fresh === 0 || remaining !== undefined;
    eat.disabled = state.roast === 0;
  }

  return {
    openGrill() {
      const panel = context.open('松林烤架', '把冰钓收获的鲜鱼挂到火塘，围坐时烤鱼会继续熟。');
      const status = document.createElement('p');
      status.setAttribute('role', 'status');
      panel.append(status);
      const begin = button(panel, '挂上鲜鱼', () => {
        if (carry.startRoasting(options.lighted()) === 'started') context.announce('鲜鱼已挂上烤架');
        refresh();
      });
      const eat = button(panel, '吃一份烤鱼', () => {
        if (carry.eatRoast()) {
          options.warmFromRoast();
          context.announce('吃了一份烤鱼 · 暖意入身');
        }
        refresh();
      });
      grillPanel = { panel, dialog: panel.closest('dialog'), status, begin, eat };
      refresh();
    },
    openStory() {
      const panel = context.open('松林火塘故事会', '守林人樊樵的篝火话。');
      for (const line of pineStoryLines) {
        const paragraph = document.createElement('p');
        paragraph.textContent = line;
        panel.append(paragraph);
      }
      const hint = options.storyHint();
      if (hint) {
        const paragraph = document.createElement('p');
        paragraph.textContent = `寻宝线索 · ${hint}`;
        panel.append(paragraph);
      }
      button(panel, '起身', () => {
        panel.closest('dialog')?.close();
        options.leaveSeat();
      });
    },
    update: refresh,
  };
}
