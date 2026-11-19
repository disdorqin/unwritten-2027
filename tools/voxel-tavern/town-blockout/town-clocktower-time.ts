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
  let previousHour: number | undefined;
  return function dailyChime(epochMs: number, ceremonyActive: boolean) {
    if (!Number.isFinite(epochMs)) return;
    const hourIndex = Math.floor((epochMs + beijingOffset) / msPerHour);
    if (previousHour !== undefined && hourIndex <= previousHour) return;
    previousHour = hourIndex;
    const at = hourIndex * msPerHour - beijingOffset;
    // A disconnected or suspended viewer only participates in the current strike.
    if (ceremonyActive || epochMs - at >= 1000) return;
    const hour = ((hourIndex % 24) + 24) % 24;
    return { type: 'hourly-chime' as const, at, strikes: 3 as const, audible: hour >= 7 && hour < 23, hour };
  };
}

export function isTowerCeremonyWindow(epochMs: number, midnight: number) {
  return epochMs >= midnight - 5 * msPerHour && epochMs < midnight + msPerHour;
}
