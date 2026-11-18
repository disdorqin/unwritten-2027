import { Color, DynamicDrawUsage, Vector3, type Group, type InstancedMesh } from 'three';
import type { TownActivity, TownActivityContext } from './town-activity';
import type { PassportStamp } from './town-passport';

export const longHallRelayStart = [0, 1.1, 4.65] as const;
const relayRows = [
  { z: 3.12, name: '入口' }, { z: -1.08, name: '中列' }, { z: -5.48, name: '后排' },
];
export const longHallRelayLamps = relayRows.flatMap(({ z, name }) => [-1, 1].map(side => ({
  fixture: [side * 3.71, 4.42, z] as const,
  stand: [side * 2.83, 1.1, z] as const,
  name: `${name}${side < 0 ? '左' : '右'}灯`,
})));
export const longHallRelayStorageKey = 'unwritten:long-hall-relay:v1';
export const longHallRelayTimeMs = 30_000;
export const longHallRelayCelebrationMs = 60_000;
export const longHallRelayCueMs = 700;
const cueLightMs = 550;
const localBoardSize = 5;

export const longHallRelayStamp = {
  id: 'long-hall-lamp-relay', label: '长殿点灯接力', hint: '完成长殿的六灯接力。',
} as const satisfies PassportStamp;

type LampMode = 'idle' | 'cue' | 'lit' | 'full';
type RelayPhase = 'idle' | 'preview' | 'run' | 'celebration';
type RelayStorage = Pick<Storage, 'getItem' | 'setItem'>;
type PaintRelay = (modes: readonly LampMode[], hallLit: boolean) => void;
type RelayOptions = {
  now?: () => number;
  random?: () => number;
  storage?: RelayStorage;
  award?(): void;
  status?(text: string): void;
};

const colors = {
  idle: new Color('#855445'),
  cue: new Color('#fff6b4').multiplyScalar(1.5),
  lit: new Color('#ffc45e'),
  full: new Color('#ffdc88').multiplyScalar(1.35),
};

export function bindLongHallRelayLights(batch: InstancedMesh, lampSlots: readonly number[], fillSlots: readonly number[]) {
  if (lampSlots.length !== longHallRelayLamps.length) throw new Error('Long hall relay requires six lamp cores.');
  const fillColors = fillSlots.map(slot => {
    const color = new Color();
    batch.getColorAt(slot, color);
    return color;
  });
  const tint = new Color();
  batch.instanceColor!.setUsage(DynamicDrawUsage);
  const paint: PaintRelay = (modes, hallLit) => {
    lampSlots.forEach((slot, index) => batch.setColorAt(slot, colors[modes[index]]));
    fillSlots.forEach((slot, index) => batch.setColorAt(slot, tint.copy(fillColors[index]).multiplyScalar(hallLit ? 1.4 : 1)));
    batch.instanceColor!.needsUpdate = true;
  };
  return paint;
}

function browserStorage() {
  try { return globalThis.localStorage; } catch { return undefined; }
}

function readLocalBoard(storage: RelayStorage | undefined) {
  try {
    const data: unknown = JSON.parse(storage?.getItem(longHallRelayStorageKey) ?? '[]');
    return Array.isArray(data)
      ? data.filter((time): time is number => Number.isSafeInteger(time) && time > 0 && time <= longHallRelayTimeMs)
        .sort((a, b) => a - b).slice(0, localBoardSize)
      : [];
  } catch { return []; }
}

function saveRun(storage: RelayStorage | undefined, prior: readonly number[], elapsed: number) {
  // When another open tab changed the board, use its complete state before writing this result.
  const latest = readLocalBoard(storage);
  const records = [...(latest.length ? latest : prior), elapsed].sort((a, b) => a - b).slice(0, localBoardSize);
  try { storage?.setItem(longHallRelayStorageKey, JSON.stringify(records)); } catch { /* The board still works in this tab. */ }
  return records;
}

export function createLongHallRelay(
  group: Group, context: Pick<TownActivityContext, 'announce'>, options: RelayOptions = {},
) {
  const now = options.now ?? (() => performance.now());
  const random = options.random ?? Math.random;
  const storage = options.storage ?? browserStorage();
  const paint = group.userData.longHallRelayLights as PaintRelay | undefined;
  const lampCount = longHallRelayLamps.length;
  let records = readLocalBoard(storage);
  let phase: RelayPhase = 'idle';
  let order: number[] = [];
  let accepted = 0;
  let cue = -1;
  let previewAt = 0;
  let runAt = 0;
  let celebrateUntil = 0;
  let lastStatus = '';

  function paintLamps() {
    if (!paint) return;
    const lit = order.slice(0, accepted);
    const full = phase === 'celebration';
    paint(Array.from({ length: lampCount }, (_, index) =>
      full ? 'full' : cue === index ? 'cue' : lit.includes(index) ? 'lit' : 'idle'), full);
  }

  function report(time: number) {
    if (!options.status) return;
    const seconds = (until: number) => Math.max(0, Math.ceil((until - time) / 1000));
    const best = records[0] === undefined ? '' : ` · 个人最佳 ${(records[0] / 1000).toFixed(1)} 秒`;
    let text = '';
    if (phase === 'preview') text = cue < 0
      ? '面向殿内，记住六盏灯的顺序'
      : `记住灯序 · ${order.indexOf(cue) + 1}/${lampCount} · ${longHallRelayLamps[cue].name}`;
    if (phase === 'run') text = `长殿点灯接力 · ${accepted}/${lampCount} · 剩余 ${seconds(runAt + longHallRelayTimeMs)} 秒`;
    if (phase === 'celebration') text = `长殿全亮 · ${seconds(celebrateUntil)} 秒${best}`;
    if (text === lastStatus) return;
    lastStatus = text;
    options.status(text);
  }

  function stop() {
    phase = 'idle';
    accepted = 0;
    cue = -1;
    paintLamps();
  }

  function update() {
    if (phase === 'idle') { if (lastStatus) report(now()); return; }
    const time = now();
    if (phase === 'preview') {
      const elapsed = time - previewAt;
      const index = Math.floor(elapsed / longHallRelayCueMs);
      if (index >= lampCount) {
        phase = 'run';
        cue = -1;
        paintLamps();
        context.announce('现在按刚才的次序点亮六盏灯');
      } else {
        const nextCue = elapsed % longHallRelayCueMs < cueLightMs ? order[index] : -1;
        if (cue !== nextCue) {
          cue = nextCue;
          paintLamps();
        }
      }
    }
    if (phase === 'run' && time >= runAt + longHallRelayTimeMs) {
      stop();
      context.announce('时间到了，回起点重新接力');
    }
    if (phase === 'celebration' && time >= celebrateUntil) stop();
    report(time);
  }

  function start() {
    update();
    if (phase !== 'idle') return;
    order = Array.from({ length: lampCount }, (_, index) => index);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    previewAt = now();
    runAt = previewAt + lampCount * longHallRelayCueMs;
    phase = 'preview';
    accepted = 0;
    update();
  }

  function light(index: number) {
    update();
    if (phase !== 'run') return;
    const time = now();
    if (index !== order[accepted]) {
      stop();
      context.announce('点灯次序有误，回起点重新接力');
      report(time);
      return;
    }
    accepted++;
    if (accepted === lampCount) {
      const elapsed = Math.max(1, Math.round(time - runAt));
      records = saveRun(storage, records, elapsed);
      phase = 'celebration';
      celebrateUntil = time + longHallRelayCelebrationMs;
      options.award?.();
      context.announce(`六盏灯全亮 · 用时 ${(elapsed / 1000).toFixed(1)} 秒 · 长殿亮灯六十秒`);
    }
    paintLamps();
    report(time);
  }

  function place([x, y, z]: readonly [number, number, number]) {
    const position = group.localToWorld(new Vector3(x, y, z));
    return { x: position.x, n: -position.z, ground: position.y };
  }

  const activity = {
    spots: [
      { ...place(longHallRelayStart), range: .95, label: '开始长殿点灯接力', available: () => phase === 'idle', run: start },
      ...longHallRelayLamps.map(({ stand, name }, index) => ({
        ...place(stand), range: .95, label: `点亮${name}`,
        available: () => phase === 'run' && !order.slice(0, accepted).includes(index), run: () => light(index),
      })),
    ],
    update,
    state() { return { phase, accepted, bestMs: records[0], records: [...records] }; },
  } satisfies TownActivity & { state(): { phase: RelayPhase; accepted: number; bestMs?: number; records: number[] } };
  paintLamps();
  return activity;
}
