import { townDayMs } from './town-night-window.js';

/**
 * Underground river water level — the re-entry variation core (design:
 * 地下重入变化, 2026-11-22). One natural rhythm for the whole server:
 * the dark river under the -90/-140 layers rises and falls on a
 * three-night cycle keyed to the beacon night ordinal (the same single
 * source as the thirteenth bell — no randomness, fully predictable from
 * the hydrology sign at the lamp room). The pump-house fight is a
 * separate, temporary offset on tonight's level; dawn resets it.
 *
 * Progress red line, by construction: the form tables below describe
 * only path and ore-point REACHABILITY FORMS (shortcuts, detours,
 * wading). Key-progress sites — vault and its keeper, the forge, the
 * navigation core, star-stone points, the lift and the return cage, the
 * campfire chain — are not water-gated in any form, at any level, ever.
 */

export type WaterPhase = 'rise' | 'level' | 'fall';
export type WaterLevel = 'low' | 'mid' | 'high';

export const waterPhaseCycle: readonly WaterPhase[] = ['rise', 'level', 'fall'];

const levelByPhase: Readonly<Record<WaterPhase, WaterLevel>> = {
  rise: 'high', level: 'mid', fall: 'low',
};

const levelOrder: readonly WaterLevel[] = ['low', 'mid', 'high'];

/** Nights are counted from the server's dawn epoch (the night-window
 * schedule's anchor): ordinal 0 is the first night after that epoch and
 * is a rise night, per the design table's row order. */
export function nightOrdinalAt(now: number, dawnEpoch: number): number {
  return Math.floor((now - dawnEpoch) / townDayMs);
}

export function waterPhaseForNight(nightOrdinal: number): WaterPhase {
  const index = ((nightOrdinal % 3) + 3) % 3;
  return waterPhaseCycle[index]!;
}

export function baseLevelForPhase(phase: WaterPhase): WaterLevel {
  return levelByPhase[phase];
}

/** The pump house shifts tonight's level by whole steps, clamped at the
 * river's physical ends. The offset never survives dawn. */
export function applyPumpOffset(level: WaterLevel, offsetSteps: number): WaterLevel {
  const index = levelOrder.indexOf(level) + offsetSteps;
  return levelOrder[Math.min(2, Math.max(0, index))]!;
}

export type UndergroundLayer = -90 | -140;

export type WaterForm = Readonly<{
  /** Low passages are under knee-deep water (wading, slower, light shrinks). */
  floodedPassages: boolean;
  /** Rich ore points that exist only under water can be worked. */
  underwaterOre: boolean;
  /** The dry riverbed way is exposed: a shortcut, with its own ore points. */
  riverbedOpen: boolean;
  /** The -140 tributary ferry runs (mid water only; flooded or grounded otherwise). */
  ferryRunning: boolean;
}>;

export function waterFormFor(layer: UndergroundLayer, level: WaterLevel): WaterForm {
  if (layer === -90) {
    return {
      floodedPassages: level === 'high',
      underwaterOre: level === 'high',
      riverbedOpen: level === 'low',
      ferryRunning: false,
    };
  }
  return {
    floodedPassages: false,
    underwaterOre: false,
    riverbedOpen: level === 'low',
    ferryRunning: level === 'mid',
  };
}

/** Key-progress sites the water must never gate. Kept as data so the
 * acceptance test can assert the gated-form registry stays disjoint. */
export const keyProgressSites = Object.freeze([
  'vault', 'vault-keeper', 'forge', 'navigation-core',
  'star-stone:horse', 'star-stone:monkey', 'star-stone:rooster', 'star-stone:dog',
  'lift', 'return-cage', 'campfire-chain',
] as const);

/** The complete set of things water is allowed to change form for. */
export const waterGatedForms = Object.freeze([
  'path:low-passage', 'path:riverbed', 'path:upper-dry-road', 'path:tributary-bed',
  'ore:underwater', 'ore:riverbed', 'ferry:tributary',
] as const);

export function isWaterGated(id: string): boolean {
  return (waterGatedForms as readonly string[]).includes(id);
}

const phaseName: Readonly<Record<WaterPhase, string>> = {
  rise: '涨', level: '平', fall: '落',
};

/**
 * 石沉's water guide lines (text: 主窗口出稿， 批74) — he knows water
 * the way he knew the winch. Spoken at the -90 entry when he appears;
 * the presence water state picks the line by tonight's phase. His one
 * older line (the return-ascent warning) is unchanged and lives with
 * his own module; these are guidance, never truth-layer.
 */
export const stoneSinkWaterLines: Readonly<Record<WaterPhase, string>> = {
  rise: '今夜水涨。低洼道别久站，水底下的矿是好矿，就是得憋着劲儿挖——挖两下，抬头喘口气。',
  level: '今夜水平。路是平常的路，矿是平常的矿。平常日子最养人，慢慢走。',
  fall: '今夜水落。河床干出来了，那条近道只今晚有。脚步放轻，干河床上走路，声音传得远。',
};

/** Said when the player stays in the water too long — the soul-side
 * phrasing of "get to a campfire point". */
export const stoneSinkLongWadeLine =
  '水不咬人，水耗人。灯要是灭了，就往高处走，高处总有风，风能把灯再吹亮。';

export function stoneSinkGuideLine(phase: WaterPhase): string {
  return stoneSinkWaterLines[phase];
}
const levelName: Readonly<Record<WaterLevel, string>> = {
  high: '高', mid: '中', low: '低',
};

/** The lamp-room hydrology sign: tonight's water and tomorrow's
 * forecast, so a descent is planned, never gambled. Text is final
 * (design: the sign's wording ships with the lamp-room package). */
export function hydrologySignLines(tonightOrdinal: number): readonly string[] {
  const tonight = waterPhaseForNight(tonightOrdinal);
  const tomorrow = waterPhaseForNight(tonightOrdinal + 1);
  return [
    '暗河水文',
    `今夜水位：${phaseName[tonight]}（${levelName[baseLevelForPhase(tonight)]}）`,
    `明夜预告：${phaseName[tomorrow]}（${levelName[baseLevelForPhase(tomorrow)]}）`,
    '水涨走上道，水落走河床',
  ];
}
