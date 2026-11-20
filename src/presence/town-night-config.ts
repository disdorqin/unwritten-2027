import { randomUUID } from 'node:crypto';
import { closeSync, fsyncSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createOrdinaryTownNightSchedule } from '../shared/town-night-window.js';
import type { PresenceTownNightOptions } from './server.js';

function loadReceipt(path: string): number | null {
  let contents: string;
  try {
    contents = readFileSync(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  const value: unknown = JSON.parse(contents);
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new RangeError('Invalid town night beacon receipt');
  }
  return value;
}

function saveReceipt(path: string, at: number) {
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  try {
    const fd = openSync(temporaryPath, 'wx', 0o600);
    try {
      writeFileSync(fd, JSON.stringify(at));
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temporaryPath, path);
  } catch (error) {
    try { rmSync(temporaryPath, { force: true }); }
    catch { /* Preserve the original write error. */ }
    throw error;
  }
}

export function readTownNightOptions(schedule: string | undefined, receiptPath: string | undefined): PresenceTownNightOptions | undefined {
  if (schedule === undefined && receiptPath === undefined) return;
  if (!schedule || !receiptPath?.trim()) {
    throw new Error('Set TOWN_NIGHT_SCHEDULE and TOWN_NIGHT_BEACON_RECEIPT together');
  }
  const config: unknown = JSON.parse(schedule);
  if (!config || typeof config !== 'object' ||
      !('dawnEpoch' in config) || typeof config.dawnEpoch !== 'number' ||
      !('beaconOffsetsAfterDusk' in config) || !Array.isArray(config.beaconOffsetsAfterDusk) ||
      !('cueFreshnessMs' in config) || typeof config.cueFreshnessMs !== 'number') {
    throw new RangeError('Invalid TOWN_NIGHT_SCHEDULE');
  }
  return {
    scheduleAt: createOrdinaryTownNightSchedule({
      dawnEpoch: config.dawnEpoch,
      beaconOffsetsAfterDusk: config.beaconOffsetsAfterDusk,
      cueFreshnessMs: config.cueFreshnessMs,
    }),
    restoredBeaconAt: loadReceipt(receiptPath),
    saveBeacon: at => saveReceipt(receiptPath, at),
    onSaveError: error => console.error('Town night beacon receipt could not be stored', error),
  };
}
