import { randomUUID } from 'node:crypto';
import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * A versioned counter for the ONE world authority that owns the underground lift.
 * Do not share this file across independent writer processes: the live host must
 * serialize allocations just as it serializes cabin movement and arrival.
 */
export function createUndergroundLiftTripIdStore(file: string) {
  function load(): number {
    let contents: string;
    try {
      contents = readFileSync(file, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
      throw error;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(contents);
    } catch (cause) {
      throw new Error('Cannot parse underground lift trip counter', { cause });
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) ||
        !('version' in parsed) || parsed.version !== 1 ||
        !('lastIssuedTripId' in parsed) ||
        !Number.isSafeInteger(parsed.lastIssuedTripId) ||
        (parsed.lastIssuedTripId as number) < 0) {
      throw new Error('Invalid underground lift trip counter');
    }
    return parsed.lastIssuedTripId as number;
  }

  function allocateTripId(): number {
    // Always read the saved count, including after a rejected write or a new store instance.
    const previous = load();
    if (previous >= Number.MAX_SAFE_INTEGER) throw new RangeError('Underground lift trip counter exhausted');
    const next = previous + 1;
    const staging = join(dirname(file), `.u7-trip-${randomUUID()}.tmp`);
    try {
      // Persist BEFORE publishing the ID to the movement authority.
      writeFileSync(staging, `${JSON.stringify({ version: 1, lastIssuedTripId: next })}\n`, {
        encoding: 'utf8', flag: 'wx', mode: 0o600, flush: true,
      });
      renameSync(staging, file);
    } catch (error) {
      try {
        rmSync(staging, { force: true });
      } catch {
        // Keep the original failed write or replace error; callers may retry.
      }
      throw error;
    }
    return next;
  }

  return { load, allocateTripId };
}
