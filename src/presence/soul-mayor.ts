import { soulMayorFloorTolerance, soulMayorTalkRange, type SoulMayorSite, type SoulMayorView } from '../shared/soul-mayor.js';
import { readStarStoneLocation, type StarStoneLocation } from '../shared/zodiac-star-stones.js';
import type { createZodiacStarStoneAuthority } from './zodiac-star-stone-authority.js';

type InvitationResult = 'received' | 'already-received' | 'retry';
export type SoulMayorInvitationStore = Readonly<{
  received(key: string): boolean;
  /** Commit atomically before returning received. An unsuccessful save returns retry. */
  grantOnce(key: string): InvitationResult;
}>;

type SoulMayorHost = Readonly<{
  /** Resolve a live connection at the authority. The key identifies the same protagonist after reconnect. */
  profile(peer: number): Readonly<{ key: string; protagonist: boolean }> | undefined;
  acceptedPosition(peer: number): StarStoneLocation | undefined;
  /** The approved encounter can follow the staging from the arrival platform to the plaza. */
  encounterSite(peer: number): SoulMayorSite | undefined;
  canTalk(peer: number, from: StarStoneLocation, site: SoulMayorSite): boolean;
  invitations: SoulMayorInvitationStore;
  stars: Pick<ReturnType<typeof createZodiacStarStoneAuthority>, 'snapshot'>;
}>;

export function createSoulMayorAuthority(host: SoulMayorHost) {
  function visibleEncounter(peer: number) {
    if (!Number.isSafeInteger(peer) || peer < 1) return;
    const profile = host.profile(peer);
    if (!profile || profile.protagonist !== true || !profile.key) return;
    const from = readStarStoneLocation(host.acceptedPosition(peer));
    const configured = host.encounterSite(peer);
    if (!from || !configured) return;
    const actor = readStarStoneLocation(configured.actor);
    const talk = readStarStoneLocation(configured.talk);
    if (!actor || !talk || actor.layer !== from.layer || talk.layer !== from.layer) return;
    return { profile, from, site: { actor, talk } };
  }

  return {
    /** Send this view only to the connection used to resolve it. */
    view(peer: number): SoulMayorView | undefined {
      const encounter = visibleEncounter(peer);
      if (!encounter) return;
      return {
        site: encounter.site,
        invited: host.invitations.received(encounter.profile.key),
        ringCount: host.stars.snapshot().ringCount,
      };
    },
    /** A client sends the action only. Identity, coordinates and progress come from the host. */
    receiveInvitation(peer: number): InvitationResult | 'denied' {
      const encounter = visibleEncounter(peer);
      if (!encounter) return 'denied';
      const { profile, from, site } = encounter;
      const { east, north, height } = site.talk;
      if (Math.abs(from.height - height) > soulMayorFloorTolerance ||
          Math.hypot(from.east - east, from.north - north) > soulMayorTalkRange ||
          host.canTalk(peer, from, site) !== true) return 'denied';
      return host.invitations.grantOnce(profile.key);
    },
  };
}
