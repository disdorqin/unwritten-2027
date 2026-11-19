import { nearestTownActivity, type TownActivity, type TownActivityContext, type TownActivitySpot } from './town-activity';
import { townMailLimits, townMailTextLength } from './town-mail-store';

const material = [426, 172] as const;
const snowmanField = [415, 165] as const;
const caretaker = [421, 226] as const;
const grill = [419.3, 225] as const;
const clueSites = [
  { at: [399, 189], label: '林口木牌' },
  { at: [415, 227], label: '篝火旁石堆' },
  { at: material, label: '物料筐底木匣' },
  { at: [430, 320], label: '林深处宝点' },
] as const;
const field = { west: 404, east: 428, south: 152, north: 178 } as const;
const layersByShape = { 2: [1.2, .5], 3: [1.2, .8, .5] } as const;
const storageKey = 'unwritten:pine-camp.v1';

type LayerCount = 0 | 1 | 2 | 3;
type ClueProgress = 0 | 1 | 2 | 3 | 4;
type Shape = 2 | 3;
type Decorations = { carrot: boolean; branches: boolean };
type Snowman = { layers: Shape; name?: string; decorations: Decorations };
type StoredProgress = { snowman?: Snowman; clues: ClueProgress };
type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;

export type PineCampRollSample = { x: number; n: number; snow: 'shallow' | 'deep' | 'other' };

export const pineCampActivityAnchors = { material, snowmanField, caretaker, grill, clueSites, field } as const;

function validName(name: string) {
  return townMailTextLength(name) <= townMailLimits.signature && /[^\p{White_Space}\p{P}\p{Cf}]/u.test(name);
}

function browserStorage() {
  try { return globalThis.localStorage; } catch { return undefined; }
}

function readProgress(storage?: StoragePort): StoredProgress {
  let data: unknown;
  try { data = JSON.parse(storage?.getItem(storageKey) ?? 'null'); } catch { return { clues: 0 }; }
  if (!data || typeof data !== 'object') return { clues: 0 };
  const stored = data as { snowman?: Partial<Snowman>; clues?: unknown };
  const value = stored.clues;
  const clues: ClueProgress = value === 1 || value === 2 || value === 3 || value === 4 ? value : 0;
  const snowman = stored.snowman;
  if (snowman?.layers !== 2 && snowman?.layers !== 3) return { clues };
  const name = typeof snowman.name === 'string' && validName(snowman.name.trim()) ? snowman.name.trim() : undefined;
  return { clues, snowman: { layers: snowman.layers, name, decorations: {
    carrot: snowman.decorations?.carrot === true, branches: snowman.decorations?.branches === true,
  } } };
}

export function createPineCampProgress(options: {
  storage?: StoragePort;
  setFormation(layers: LayerCount, name?: string, decorations?: Decorations): void;
  setTreasureTrailVisible(visible: boolean): void;
  onSnowmanFormed?(): void;
  onTreasureFound?(): void;
}) {
  const storage = options.storage ?? browserStorage();
  const stored = readProgress(storage);
  let rolling: { shape: Shape; layers: 0 | 1 | 2; radius: number } | undefined;
  let previous: PineCampRollSample | undefined;
  let decorations = { carrot: false, branches: false };

  function persist() {
    try {
      if (!storage) return false;
      storage.setItem(storageKey, JSON.stringify(stored));
      return true;
    } catch { return false; }
  }

  function paint() {
    const snowman = stored.snowman;
    options.setFormation(snowman?.layers ?? rolling?.layers ?? 0, snowman?.name, snowman?.decorations);
  }
  paint();
  options.setTreasureTrailVisible(stored.clues >= 3);

  function roll(sample?: PineCampRollSample) {
    if (!rolling) return;
    if (!sample || !Number.isFinite(sample.x) || !Number.isFinite(sample.n) ||
        sample.x < field.west || sample.x > field.east || sample.n < field.south || sample.n > field.north) {
      previous = undefined;
      return;
    }
    const before = previous;
    previous = sample;
    if (!before || before.snow === 'other' || sample.snow === 'other') return;
    const grown = Math.hypot(sample.x - before.x, sample.n - before.n) * (.15 / 10) *
      (sample.snow === 'deep' ? 1.5 : 1);
    rolling.radius += grown;
    const radii = layersByShape[rolling.shape];
    const targetRadius = radii[rolling.layers];
    if (targetRadius === undefined || rolling.radius < targetRadius) return;
    const completed = rolling.layers + 1 as 1 | 2 | 3;
    if (completed === rolling.shape) {
      stored.snowman = { layers: rolling.shape, decorations: { ...decorations } };
      rolling = previous = undefined;
      persist();
      paint();
      options.onSnowmanFormed?.();
      return;
    }
    rolling.layers = completed as 1 | 2;
    rolling.radius = 0;
    paint();
  }

  return {
    start(shape: Shape) {
      if (stored.snowman || rolling || (shape !== 2 && shape !== 3)) return false;
      rolling = { shape, layers: 0, radius: 0 };
      previous = undefined;
      return true;
    },
    cancel() {
      rolling = previous = undefined;
      paint();
    },
    roll,
    take(kind: keyof Decorations) {
      if (decorations[kind] || (kind !== 'carrot' && kind !== 'branches')) return;
      decorations = { ...decorations, [kind]: true };
      if (stored.snowman) {
        stored.snowman = { ...stored.snowman, decorations: { ...stored.snowman.decorations, [kind]: true } };
        persist();
        paint();
      }
    },
    name(raw: string) {
      const name = raw.trim();
      if (!stored.snowman || !validName(name)) return 'invalid';
      stored.snowman = { ...stored.snowman, name };
      paint();
      return persist() ? 'saved' : 'session';
    },
    visit(index: 0 | 1 | 2 | 3) {
      if (stored.clues !== index) return false;
      stored.clues = (index + 1) as ClueProgress;
      persist();
      options.setTreasureTrailVisible(stored.clues >= 3);
      if (stored.clues === 4) options.onTreasureFound?.();
      return true;
    },
    isRolling: () => rolling !== undefined,
    clueProgress: () => stored.clues,
    state() {
      return { clues: stored.clues, snowman: stored.snowman ? {
        ...stored.snowman, decorations: { ...stored.snowman.decorations },
      } : undefined, rolling: rolling ? { ...rolling } : undefined };
    },
  };
}

export function createPineCampActivity(
  context: Pick<TownActivityContext, 'open' | 'announce'>,
  options: Parameters<typeof createPineCampProgress>[0] & {
    heightAt(x: number, n: number): number;
    rollingAt(): PineCampRollSample | undefined;
    canStand(x: number, n: number, ground: number): boolean;
    treasureEndpointReady?(): boolean;
    openGrill?(): void;
  },
): TownActivity & { storyHint(): string | undefined } {
  const progress = createPineCampProgress({
    ...options,
    onSnowmanFormed() {
      context.announce('雪人已成型 · 到物料棚留名');
      options.onSnowmanFormed?.();
    },
  });

  function button(panel: HTMLElement, label: string, run: () => void) {
    const control = document.createElement('button');
    control.type = 'button';
    control.textContent = label;
    control.addEventListener('click', run);
    panel.append(control);
  }
  function spot(at: readonly [number, number], label: string,
    run: () => void, available?: () => boolean): TownActivitySpot {
    const [x, n] = at;
    const range = 1.55; // Existing ice-fishing interaction radius.
    const target: TownActivitySpot = { x, n, ground: options.heightAt(x, n), range, label, run };
    let hasSafeAccess: boolean | undefined;
    function accessible() {
      if (!Number.isFinite(target.ground)) return false;
      const safe = (px: number, pn: number) => {
        const ground = options.heightAt(px, pn);
        return options.canStand(px, pn, ground) && nearestTownActivity([target], px, pn, ground) === target;
      };
      if (safe(x, n)) return true;
      // The object itself may occupy the registered centre; retain its anchor while
      // checking accessible ground already inside the existing activity radius.
      for (const distance of [range / 2, range]) {
        for (const [dx, dn] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (safe(x + dx * distance, n + dn * distance)) return true;
        }
      }
      return false;
    }
    return { ...target, available: () => {
      if (available?.() === false) return false;
      return hasSafeAccess ??= accessible();
    } };
  }
  function openClue(index: 0 | 1 | 2 | 3) {
    if (!progress.visit(index) && index !== 0 && !(index === 3 && progress.clueProgress() === 4)) return;
    const { clues } = progress.state();
    const panel = context.open(clueSites[index].label, `寻宝 ${clues}/${clueSites.length}`);
    const next = document.createElement('p');
    next.textContent = clues === 4 ? '已完成' : clueSites[clues].label;
    panel.append(next);
  }
  function openMaterials() {
    const panel = context.open('物料棚', '取料与雪人留名');
    for (const [kind, label] of [['carrot', '取胡萝卜'], ['branches', '取树枝']] as const) {
      button(panel, label, () => progress.take(kind));
    }
    const { clues, snowman } = progress.state();
    if (clues === 2) button(panel, '查看物料筐底木匣', () => openClue(2));
    if (!snowman) return;
    const label = document.createElement('label');
    label.textContent = '留名牌';
    const name = document.createElement('input');
    name.value = snowman.name ?? '';
    name.autocomplete = 'off';
    label.append(name);
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    panel.append(label, status);
    button(panel, '立牌', () => {
      const result = progress.name(name.value);
      status.textContent = result === 'invalid' ? `请输入名字（${townMailLimits.signature} 字内）` :
        result === 'session' ? '留名保留在本次试玩' : '已留名';
    });
  }
  function openSnowmanField() {
    const { snowman, rolling } = progress.state();
    const panel = context.open('雪人场', '沿雪地步行滚雪，成型后可到物料棚留名。');
    if (snowman) return;
    if (rolling) {
      button(panel, '取消这次滚雪', () => progress.cancel());
      return;
    }
    for (const shape of [2, 3] as const) {
      button(panel, shape === 2 ? '滚两层雪人' : '滚三层雪人', () => {
        if (progress.start(shape)) panel.closest('dialog')?.close();
      });
    }
  }

  return {
    spots: [
      spot(clueSites[0].at, clueSites[0].label, () => openClue(0)),
      spot(clueSites[1].at, clueSites[1].label, () => openClue(1), () => progress.clueProgress() === 1),
      spot(material, '物料棚', openMaterials),
      spot(clueSites[3].at, clueSites[3].label, () => openClue(3), () => options.treasureEndpointReady?.() === true && progress.clueProgress() >= 3),
      spot(snowmanField, '雪人场', openSnowmanField),
      ...(options.openGrill ? [spot(grill, '查看松林烤架', options.openGrill)] : []),
    ],
    storyHint() {
      return clueSites.at(progress.clueProgress())?.label;
    },
    update(dt) {
      if (progress.isRolling() && Number.isFinite(dt) && dt > 0) progress.roll(options.rollingAt());
    },
  };
}
