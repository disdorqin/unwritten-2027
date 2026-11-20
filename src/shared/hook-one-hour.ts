const hourMs = 3_600_000;
export const hookOneHourWindowMs = 5_000;

export type HookOneListenCount = 1 | 2 | 3 | 4;

export type HookOneHour = Readonly<{
  type: 'event';
  kind: 'hook-one-hour';
  at: number;
} & (
  | { auroraAtHour: true }
  | { auroraAtHour: false; confirmedListenCount: HookOneListenCount }
)>;

export function isAudibleHookOneHour(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 &&
    value % hourMs === 0 && (value / hourMs + 8) % 24 >= 7;
}

export function isHookOneListenCount(value: unknown): value is HookOneListenCount {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

export function readHookOneHour(value: unknown): HookOneHour | undefined {
  if (!value || typeof value !== 'object') return;
  const frame = value as Record<string, unknown>;
  if (frame.type !== 'event' || frame.kind !== 'hook-one-hour' || !isAudibleHookOneHour(frame.at)) return;
  const at = frame.at;
  if (frame.auroraAtHour === true) {
    return { type: 'event', kind: 'hook-one-hour', at, auroraAtHour: true };
  }
  const count = frame.confirmedListenCount;
  if (frame.auroraAtHour === false && isHookOneListenCount(count)) {
    return { type: 'event', kind: 'hook-one-hour', at, auroraAtHour: false, confirmedListenCount: count };
  }
}

type AudibleDailyCue = Readonly<{ audible: boolean; cue: Readonly<{ at: number }> }>;

/** Pairs the local clock crossing with a private receipt from the authenticated presence connection. */
export function createHookOneHourInbox<Cue extends AudibleDailyCue>() {
  let receipt: HookOneHour | undefined;
  let daily: Cue | undefined;
  let lastDeliveredAt = -Infinity;

  return {
    accept(value: unknown, now: number) {
      const event = readHookOneHour(value);
      if (!event || !Number.isFinite(now) ||
          Math.abs(now - event.at) > hookOneHourWindowMs || event.at <= lastDeliveredAt) return;
      receipt = event;
    },
    update(now: number, ordinary: boolean, cue?: Cue) {
      if (!Number.isFinite(now)) return;
      if (!ordinary) {
        receipt = daily = undefined;
        return;
      }
      if (daily && now - daily.cue.at > hookOneHourWindowMs) daily = undefined;
      if (receipt && now - receipt.at > hookOneHourWindowMs) receipt = undefined;
      if (cue?.audible && isAudibleHookOneHour(cue.cue.at) && cue.cue.at > lastDeliveredAt &&
          now >= cue.cue.at && now - cue.cue.at <= hookOneHourWindowMs) daily = cue;
      if (!daily || !receipt || daily.cue.at !== receipt.at || now < receipt.at) return;
      const { at, auroraAtHour } = receipt;
      const attendance = auroraAtHour ? { at } : { at, confirmedListenCount: receipt.confirmedListenCount };
      const planInput = { dailyChime: daily, attendance, auroraAtHour };
      lastDeliveredAt = at;
      receipt = daily = undefined;
      return planInput;
    },
  };
}
