export function createTownPresenceClock(
  wallNow: () => number = Date.now,
  monotonicNow: () => number = () => performance.now(),
) {
  let anchor: { epoch: number; at: number } | undefined;
  return {
    now() {
      return anchor ? anchor.epoch + monotonicNow() - anchor.at : wallNow();
    },
    accept(epochMs: number, sentAt?: number) {
      if (!Number.isSafeInteger(epochMs) || epochMs <= 0) return;
      const receivedAt = monotonicNow();
      const roundTrip = sentAt === undefined ? 0 : receivedAt - sentAt;
      if (!Number.isFinite(roundTrip) || roundTrip < 0 || roundTrip > 2_000) return;
      anchor = { epoch: epochMs + roundTrip / 2, at: receivedAt };
    },
  };
}
