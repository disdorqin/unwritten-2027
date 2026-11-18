export const testFireworksPlayers = 5;
export const testFireworksDwellMs = 15 * 60_000;
export const testFireworksNoticeMs = 10_000;
export const testFireworksLeadMs = 250;
export const testFireworksShowMs = 36_000;
export const testFireworksRearmMs = 30 * 60_000;
export const testFireworksAnnouncement = '人齐了，10 秒后广场放烟花！';

export type TestFireworksBroadcast =
  | { type: 'event'; kind: 'announce'; message: typeof testFireworksAnnouncement }
  | { type: 'event'; kind: 'test-fireworks'; seed: number; startAt: number };

export function createTestFireworksSchedule() {
  let onlineSince: number | undefined;
  let plannedStart: number | undefined;
  let showEnd: number | undefined;

  return {
    update(online: number, now: number, epochNow: number, nextSeed: () => number): TestFireworksBroadcast | undefined {
      if (showEnd !== undefined) {
        if (now < showEnd || (online >= testFireworksPlayers && now < showEnd + testFireworksRearmMs)) return;
        showEnd = undefined;
      }

      if (online < testFireworksPlayers) {
        onlineSince = undefined;
        plannedStart = undefined;
        return;
      }
      onlineSince ??= now;

      if (plannedStart === undefined) {
        if (now - onlineSince < testFireworksDwellMs) return;
        plannedStart = now + testFireworksNoticeMs;
        return { type: 'event', kind: 'announce', message: testFireworksAnnouncement };
      }

      if (now < plannedStart - testFireworksLeadMs) return;
      const start = Math.max(now, plannedStart);
      const startAt = epochNow + Math.round(start - now);
      showEnd = start + testFireworksShowMs;
      plannedStart = undefined;
      onlineSince = undefined;
      return { type: 'event', kind: 'test-fireworks', seed: nextSeed() >>> 0, startAt };
    },
  };
}
