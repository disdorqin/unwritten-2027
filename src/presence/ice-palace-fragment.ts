import {
  icePalaceFragmentId, icePalaceFragmentStand, icePalaceRiteHeightTolerance, icePalaceRiteReach,
} from '../shared/ice-palace-rites.js';
import { icePalaceBuildingOrigin } from './ice-throne-site.js';
import type { PresenceRecord } from './protocol.js';

type Pose = Readonly<Pick<PresenceRecord, 'east' | 'north' | 'height'>>;
type FragmentCommand = Readonly<{ requestId: string; id: string }>;

export type IcePalaceFragmentFrame = Readonly<{ type: 'ice-palace-fragment'; present: boolean }>;

export function readIcePalaceFragmentCommand(input: unknown): FragmentCommand | undefined {
  if (typeof input !== 'object' || input === null) return;
  if (!('id' in input) || input.id !== icePalaceFragmentId ||
      !('requestId' in input) || typeof input.requestId !== 'string' ||
      !/^[a-z0-9_-]{1,64}$/i.test(input.requestId)) return;
  return { requestId: input.requestId, id: icePalaceFragmentId };
}

function atFragmentStand(pose: Pose) {
  const [x, n, y] = icePalaceBuildingOrigin;
  const [localX, localY, localZ] = icePalaceFragmentStand;
  return Math.abs(pose.height / 100 - y - localY) <= icePalaceRiteHeightTolerance &&
    Math.hypot(pose.east / 100 - x - localX, pose.north / 100 - n + localZ) <= icePalaceRiteReach;
}

/** Room-local state for the palace wreckage fragment: one fragment per room,
 * consumed by the first admitted pickup. The ZB-22 bag admission itself stays
 * with the bag's owner; this state only owns presence and consumption. */
export function createIcePalaceFragment() {
  let present = true;
  const seen = new Set<string>();
  return {
    present: () => present,
    frame(): IcePalaceFragmentFrame {
      return { type: 'ice-palace-fragment', present };
    },
    request(peerId: number, pose: Pose | undefined, input: unknown): boolean {
      const command = readIcePalaceFragmentCommand(input);
      if (!command || !pose) return false;
      const key = peerId + ':' + command.requestId;
      if (seen.has(key)) return false;
      seen.add(key);
      if (!present || !atFragmentStand(pose)) return false;
      present = false;
      return true;
    },
  };
}
