import {
  icePalaceRiteHeightTolerance, icePalaceRiteReach, icePalaceRiteSites, isIcePalaceRite,
  type IcePalaceLakeConditions, type IcePalaceRite, type IcePalaceRiteSnapshot, type IcePalaceSolsticeRite,
} from '../shared/ice-palace-rites.js';
import { icePalaceBuildingOrigin } from './ice-throne-site.js';
import type { PresenceRecord } from './protocol.js';

type Pose = Readonly<Pick<PresenceRecord, 'east' | 'north' | 'height'>>;
type PalacePeer = Readonly<{ pose: Pose; profileKey?: string }>;
type PalaceCommand = Readonly<{ requestId: string; rite: IcePalaceRite }>;
type PeerCommit = Readonly<{ requestId: string; peerId: number }>;
type ProfileCommit = PeerCommit & Readonly<{ profileKey: string }>;

export type IcePalaceRiteAuthorityHost = Readonly<{
  /** Read the admitted ground-domain pose and only the opaque identity resolved by the host. */
  groundPeer(peerId: number): PalacePeer | undefined;
  iceWindow?: Readonly<{
    /** The same authoritative state consumed by the Mirror Lake scene and ice games. */
    read(): Readonly<{ conditions: IcePalaceLakeConditions; leverAvailable: boolean }> | undefined;
    operate(command: PeerCommit): Promise<boolean>;
  }>;
  forgeInventory?: Readonly<{
    canHarvest(profileKey: string): boolean;
    /** Grant only the authorized yield into the same iceCrystalShards field read by the forge. */
    harvest(command: ProfileCommit): Promise<boolean>;
  }>;
  solstice?: Readonly<{
    /** Use the scheduled event and this profile's authoritative participation receipt. */
    read(profileKey: string): IcePalaceSolsticeRite;
    complete(command: ProfileCommit): Promise<boolean>;
  }>;
}>;

export function readIcePalaceRiteCommand(input: unknown): PalaceCommand | undefined {
  if (typeof input !== 'object' || input === null) return;
  if (!('rite' in input) || !isIcePalaceRite(input.rite) ||
      !('requestId' in input) || typeof input.requestId !== 'string' ||
      !/^[a-z0-9_-]{1,64}$/i.test(input.requestId)) return;
  return { requestId: input.requestId, rite: input.rite };
}

function atAlcove(pose: Pose, rite: IcePalaceRite) {
  const [x, n, y] = icePalaceBuildingOrigin;
  const [localX, localY, localZ] = icePalaceRiteSites[rite].stand;
  return Math.abs(pose.height / 100 - y - localY) <= icePalaceRiteHeightTolerance &&
    Math.hypot(pose.east / 100 - x - localX, pose.north / 100 - n + localZ) <= icePalaceRiteReach;
}

/** Validate the interaction and delegate atomically to the existing policy stores.
 * The injected methods own eligibility, clock, persistence and request replay.
 */
export function createIcePalaceRiteAuthority(host: IcePalaceRiteAuthorityHost) {
  const lakeConditions = () => host.iceWindow?.read()?.conditions;
  return {
    lakeConditions,
    isIceOpen: () => lakeConditions()?.frozen === true,
    snapshot(peerId: number): IcePalaceRiteSnapshot {
      const window = host.iceWindow?.read();
      const peer = host.groundPeer(peerId);
      const profile = peer?.profileKey;
      return {
        lake: window?.conditions,
        rites: {
          frozen: window?.conditions.frozen === true,
          leverAvailable: !!peer && window?.leverAvailable === true,
          harvestAvailable: !!profile && host.forgeInventory?.canHarvest(profile) === true,
          solsticeRite: profile ? host.solstice?.read(profile) ?? 'closed' : 'closed',
        },
      };
    },
    async request(peerId: number, input: unknown): Promise<boolean> {
      const command = readIcePalaceRiteCommand(input);
      if (!command) return false;
      try {
        const peer = host.groundPeer(peerId);
        if (!peer || !atAlcove(peer.pose, command.rite)) return false;
        const request = { peerId, requestId: command.requestId };
        // Each authority validates live policy at commit even when the displayed state was cached.
        if (command.rite === 'lever') return await host.iceWindow?.operate(request) === true;
        if (!peer.profileKey) return false;
        const confirmed = { ...request, profileKey: peer.profileKey };
        return command.rite === 'harvest'
          ? await host.forgeInventory?.harvest(confirmed) === true
          : await host.solstice?.complete(confirmed) === true;
      } catch {
        return false;
      }
    },
  };
}
