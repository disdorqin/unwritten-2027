import type { CeremonyPhase } from './town-ceremony';

const beijingOffset = 8 * 60 * 60 * 1000;
const msPerHour = 60 * 60 * 1000;
const turn = Math.PI * 2;

const fields = (hours: number, minutes: number, seconds: number) =>
  [hours, minutes, seconds].map(value => String(value).padStart(2, '0')).join(':');

export function towerTime(epochMs: number, secondsToMidnight: number | null, climax: boolean) {
  const beijing = new Date(epochMs + beijingOffset);
  const hours = beijing.getUTCHours(), minutes = beijing.getUTCMinutes(), seconds = beijing.getUTCSeconds();
  const countdown = climax ? 0 : secondsToMidnight === null ? null : Math.max(0, Math.ceil(secondsToMidnight));
  return {
    hour: (hours % 12 + minutes / 60) * turn / 12,
    minute: (minutes + seconds / 60) * turn / 60,
    plate: countdown === null ? fields(hours, minutes, seconds)
      : fields(Math.floor(countdown / 3600), Math.floor(countdown / 60) % 60, countdown % 60),
  };
}

export function createDailyTowerChime() {
  let lastTickMs: number | undefined;
  return function dailyChime(epochMs: number, phase: CeremonyPhase) {
    if (!Number.isFinite(epochMs) || (lastTickMs !== undefined && epochMs <= lastTickMs)) return;
    const previous = lastTickMs;
    lastTickMs = epochMs;
    if (previous === undefined || phase !== 'ordinary') return;

    const hourIndex = Math.floor((previous + beijingOffset) / msPerHour) + 1;
    const at = hourIndex * msPerHour - beijingOffset;
    if (at > epochMs || epochMs - at > 5000) return;

    const hour = ((hourIndex % 24) + 24) % 24;
    const cue = { type: 'hourly-chime' as const, at, hour, strikes: 3 as const };
    return { cue, audible: hour >= 7 };
  };
}
