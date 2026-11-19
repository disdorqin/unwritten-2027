import type { CeremonyPhase } from './town-ceremony';
import type { createDailyTowerChime } from './town-clocktower-time';

type DailyTowerChime = ReturnType<ReturnType<typeof createDailyTowerChime>>;

type AttendanceAtHour = {
  at: number;
  confirmedListenCount?: number;
};

type OrdinaryHookOneFrame = {
  phase: CeremonyPhase;
  dailyChime?: DailyTowerChime;
  attendance?: AttendanceAtHour;
  auroraAtHour: boolean;
};

export type OrdinaryHookOnePlan = {
  at: number;
  normalStrikesAt: readonly number[];
  ninth?: { at: number; stage: 'ordinary' | 'third-listen' };
};

const hourMs = 3_600_000;
const normalStrikes = 8;
const strikeSpacingMs = 2020;
const minNinthDelayMs = 7000;
const maxNinthDelayMs = 11_000;

export const ordinaryNinthSound = {
  lowpassHz: 1200,
  tailSeconds: 6,
  tailDetuneCents: -50,
  direction: 'west-above',
} as const;

function ninthDelayAt(at: number) {
  const hour = Math.floor(at / hourMs);
  const mixed = Math.imul(hour ^ 0x20270101, 0x045d9f3b);
  const hash = (mixed ^ (mixed >>> 16)) >>> 0;
  return minNinthDelayMs + hash % (maxNinthDelayMs - minNinthDelayMs + 1);
}

export function createOrdinaryHookOne() {
  let lastHourAt: number | undefined;
  let thirdListenClaimed = false;

  // Consume a fresh cue from createDailyTowerChime. That source already owns the
  // clock crossing and its 5 s allowance. The host supplies attendance at the cue.
  return function plan({ phase, dailyChime, attendance, auroraAtHour }: OrdinaryHookOneFrame): OrdinaryHookOnePlan | undefined {
    if (phase !== 'ordinary' || !dailyChime?.audible) return;
    const { at, hour } = dailyChime.cue;
    if (hour === 0 || !Number.isSafeInteger(at) || (lastHourAt !== undefined && at <= lastHourAt)) return;
    lastHourAt = at;
    // No retroactive replay for a late join or an attendance record for another hour.
    if (attendance?.at !== at) return;

    const normalStrikesAt = Array.from({ length: normalStrikes }, (_, index) => at + index * strikeSpacingMs);
    if (auroraAtHour) return { at, normalStrikesAt };

    const third = attendance.confirmedListenCount === 3 && !thirdListenClaimed;
    if (third) thirdListenClaimed = true;
    const lastNormalAt = at + (normalStrikes - 1) * strikeSpacingMs;
    return {
      at,
      normalStrikesAt,
      ninth: { at: lastNormalAt + ninthDelayAt(at), stage: third ? 'third-listen' : 'ordinary' },
    };
  };
}
