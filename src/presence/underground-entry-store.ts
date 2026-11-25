import { randomUUID } from 'node:crypto';
import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { UndergroundEntrySnapshot } from './underground-entry.js';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPlayerId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isSnapshot(value: unknown): value is UndergroundEntrySnapshot {
  if (!isObject(value) || !isObject(value.well) || !Array.isArray(value.players)) return false;
  const { well } = value;
  if (well.kind !== 'covered' &&
      (well.kind !== 'open' || !isPlayerId(well.openedBy) || typeof well.firstFallPending !== 'boolean')) return false;

  const ids = new Set<string>();
  for (const player of value.players) {
    if (!isObject(player) || !isPlayerId(player.playerId) || ids.has(player.playerId) ||
        (player.mode !== 'peace' && player.mode !== 'survival') || typeof player.hasEntered !== 'boolean') return false;
    ids.add(player.playerId);
  }
  return true;
}

/** Optional backing for a single underground authority. The host supplies an existing writable directory. */
export function createUndergroundEntryStore(file: string) {
  return {
    load(): UndergroundEntrySnapshot | undefined {
      let data: string;
      try {
        data = readFileSync(file, 'utf8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw error;
      }

      let value: unknown;
      try {
        value = JSON.parse(data);
      } catch (cause) {
        throw new Error('Cannot parse underground entry snapshot', { cause });
      }
      if (!isObject(value) || value.version !== 1 || !isSnapshot(value.snapshot)) {
        throw new Error('Invalid underground entry snapshot');
      }
      return value.snapshot;
    },

    save(snapshot: UndergroundEntrySnapshot): undefined {
      const staging = join(dirname(file), `.u1-entry-${randomUUID()}.tmp`);
      try {
        // Flush the new content, then replace the old file in the same directory.
        writeFileSync(staging, `${JSON.stringify({ version: 1, snapshot })}\n`, {
          encoding: 'utf8', flag: 'wx', mode: 0o600, flush: true,
        });
        renameSync(staging, file);
      } catch (error) {
        try {
          rmSync(staging, { force: true });
        } catch {
          // Keep the original write error for the authority's retry.
        }
        throw error;
      }
    },
  };
}
