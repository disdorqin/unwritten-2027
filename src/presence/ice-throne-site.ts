import type { PresenceRecord } from './protocol.js';

export const icePalaceBuildingOrigin = [484, 72, 12] as const;
/** Local east, eye height and z of the rendered seat. */
export const icePalaceThroneSeat = [18.96, 2.05, -4.92] as const;
export const icePalaceThroneSeatTop = 1.07;

export function isIcePalaceThroneRecord(record: PresenceRecord) {
  const [x, n, ground] = icePalaceBuildingOrigin;
  const [seatX, , seatZ] = icePalaceThroneSeat;
  return Math.abs(record.height / 100 - ground - icePalaceThroneSeatTop) <= .3 &&
    Math.hypot(record.east / 100 - x - seatX, record.north / 100 - n + seatZ) <= .4;
}
