import { loadTownTimestampReceipt, saveTownTimestampReceipt } from './town-night-config.js';

/** Same atomically renamed timestamp file as the thirteenth-beacon receipt. */
export function readTownWeatherOptions(dawnEpoch: number, receiptPath: string) {
  if (!Number.isSafeInteger(dawnEpoch) || dawnEpoch < 0 || !receiptPath?.trim()) {
    throw new RangeError('Invalid town weather dawn anchor or receipt path');
  }
  return {
    dawnEpoch,
    restoredWarningAt: loadTownTimestampReceipt(receiptPath),
    saveWarning: (at: number) => saveTownTimestampReceipt(receiptPath, at),
    onSaveError: (error: unknown) => console.error('Town weather warning receipt could not be stored', error),
  };
}
