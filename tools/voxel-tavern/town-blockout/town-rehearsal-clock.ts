import type { CeremonyClock } from './town-ceremony';
import { createTownPresenceClock } from './town-presence-clock';

export async function loadRehearsalClock(): Promise<CeremonyClock | undefined> {
  const clock = createTownPresenceClock();
  const sentAt = performance.now();
  try {
    const response = await fetch('/presence/rehearsal-clock', {
      cache: 'no-store',
      signal: AbortSignal.timeout(1500),
    });
    if (response.ok) {
      const { ceremonyEpochMs }: { ceremonyEpochMs?: number } = await response.json();
      if (typeof ceremonyEpochMs === 'number' && Number.isSafeInteger(ceremonyEpochMs)) {
        clock.accept(ceremonyEpochMs, sentAt);
        return { now: clock.now, utcOffsetMinutes: 8 * 60 };
      }
    }
  } catch {
    // An unavailable rehearsal clock leaves the real ceremony clock in place.
  }
}
