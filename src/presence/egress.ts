const WINDOW_MS = 5000;
const BUCKET_MS = 100;
const BUCKET_COUNT = WINDOW_MS / BUCKET_MS;
const FRAME_OVERHEAD_BYTES = 74; // Estimated WS + TLS + TCP overhead in the load plan.
const DEMOTE_BYTES_PER_SECOND = 350_000;
const RECOVER_BYTES_PER_SECOND = 200_000;
const RECOVER_MS = 30_000;

export function createPresenceEgress() {
  const buckets = new Uint32Array(BUCKET_COUNT);
  let lastBucket: number | undefined;
  let bytes = 0;
  let forced = false;
  let belowSince: number | undefined;

  function advance(now: number) {
    const bucket = Math.floor(now / BUCKET_MS);
    if (lastBucket === undefined || bucket - lastBucket >= BUCKET_COUNT) {
      buckets.fill(0);
      bytes = 0;
    } else {
      for (let i = lastBucket + 1; i <= bucket; i++) {
        const index = i % BUCKET_COUNT;
        bytes -= buckets[index];
        buckets[index] = 0;
      }
    }
    lastBucket = bucket;
    return bucket % BUCKET_COUNT;
  }

  return {
    record(now: number, payloadBytes: number) {
      const index = advance(now);
      const estimated = payloadBytes + FRAME_OVERHEAD_BYTES;
      buckets[index] += estimated;
      bytes += estimated;
    },
    sample(now: number) {
      advance(now);
      const bytesPerSecond = bytes / (WINDOW_MS / 1000);
      if (bytesPerSecond > DEMOTE_BYTES_PER_SECOND) {
        forced = true;
        belowSince = undefined;
      } else if (forced) {
        if (bytesPerSecond < RECOVER_BYTES_PER_SECOND) {
          belowSince ??= now;
          if (now - belowSince >= RECOVER_MS) {
            forced = false;
            belowSince = undefined;
          }
        } else {
          belowSince = undefined;
        }
      }
      return { bytesPerSecond, forced };
    },
  };
}
