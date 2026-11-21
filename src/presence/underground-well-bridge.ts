import {
  createUndergroundEntry, type UndergroundEntryDirection, type UndergroundEntryPoint,
  type UndergroundEntrySnapshot,
} from './underground-entry.js';
import type { resolveUndergroundShaftRegistration } from './underground-shaft-registration.js';
import {
  createUndergroundWinchAccess, createUndergroundWinchWinding,
  type UndergroundWinchAcceptedFoot,
} from './underground-winch.js';

type Registration = ReturnType<typeof resolveUndergroundShaftRegistration>;
type Foot = UndergroundWinchAcceptedFoot;
type AcceptedTransfer = Readonly<{ playerId: string; departure: Foot; landing: Foot }>;

type WellHost = Readonly<{
  registration: Registration;
  now(): number;
  maxSampleGapMs: number;
  /** The authenticated player's latest movement-authority accepted foot, never a client-proposed pose. */
  readAcceptedFoot(playerId: string): Foot | undefined;
  /** A single already-accepted surface departure and mine-pool landing from the domain handoff. */
  readConfirmedFirstFallTransfer(playerId: string): AcceptedTransfer | undefined;
  /** The surface collision host confirms the player actually left the uncovered physical bore. */
  isFirstFallDeparture(playerId: string, point: UndergroundEntryPoint): boolean;
  /** The domain host confirms a physical crossing through this registered bore. */
  isDepthLineCrossing(point: UndergroundEntryPoint, direction: UndergroundEntryDirection): boolean;
  isFirstFallPool(point: UndergroundEntryPoint): boolean;
  canBoardCage(playerId: string, direction: UndergroundEntryDirection): boolean;
  load(): UndergroundEntrySnapshot | undefined;
  save(snapshot: UndergroundEntrySnapshot): undefined;
}>;

function validFoot(playerId: string, foot: Foot | undefined, domainId: string): foot is Foot {
  return foot !== undefined && foot.playerId === playerId && foot.domainId === domainId &&
    [foot.east, foot.north, foot.height].every(Number.isFinite);
}

/**
 * Bridge B-01's certified shaft survey to the winch and entry authority.
 * Without a registered real mine receiving domain, no operation is constructed.
 * The caller owns the real E-hold stream, collision and domain handoff; this is not a teleport.
 */
export function createUndergroundWellBridge(host: WellHost) {
  if (host.registration.kind !== 'ready') return { kind: 'unregistered' } as const;
  const { connection } = host.registration;
  const surfaceDomain = connection.shaftFoot.domainId;
  const mineDomain = connection.firstFallLanding.domainId;
  const canUseWinch = createUndergroundWinchAccess(connection.winch, host.readAcceptedFoot);
  const winding = createUndergroundWinchWinding({
    canUseWinch, now: host.now, maxSampleGapMs: host.maxSampleGapMs,
  });
  const entry = createUndergroundEntry({
    depthLine: connection.depthLine,
    // Orders sent toward the client carry a location only; domain IDs and any host metadata stay server-side.
    firstFallLanding: {
      east: connection.firstFallLanding.east,
      north: connection.firstFallLanding.north,
      height: connection.firstFallLanding.height,
    },
    canUseWinch: winding.canOpenWell,
    canBoardCage: host.canBoardCage,
    isDepthLineCrossing: host.isDepthLineCrossing,
    isFirstFallPool: host.isFirstFallPool,
    isFirstFallDeparture: host.isFirstFallDeparture,
    initial: host.load(),
    save: host.save,
  });

  return {
    kind: 'ready',
    snapshot: entry.snapshot,
    sceneState: entry.sceneState,
    modeOf: entry.modeOf,
    /** This call must originate from one continuously held and movement-authorized E stream. */
    holdWinch(playerId: string) {
      if (!entry.sceneState().coverVisible) return { kind: 'already-open' } as const;
      const progress = winding.sample(playerId);
      if (progress.kind !== 'ready') return progress;
      const result = entry.openWell(playerId);
      if (result.kind === 'opened') {
        winding.cancel(playerId);
        // Opening only lifts the cover; the opener must walk from the handle into the shaft.
        return { kind: 'opened', turns: 3 } as const;
      }
      if (result.kind === 'denied') winding.cancel(playerId);
      return { kind: result.kind } as const;
    },
    releaseWinch: winding.cancel,
    /** No teleport order can be obtained while the opener is still standing at the handle. */
    requestFirstFall(playerId: string) {
      const foot = host.readAcceptedFoot(playerId);
      if (!validFoot(playerId, foot, surfaceDomain)) return;
      return entry.requestFirstFallFromShaft(playerId, foot);
    },
    /** A verified, cross-domain movement receipt is required; never accept a supplied client location. */
    confirmFirstFall(playerId: string) {
      const receipt = host.readConfirmedFirstFallTransfer(playerId);
      if (!receipt || receipt.playerId !== playerId ||
          !validFoot(playerId, receipt.departure, surfaceDomain) ||
          !validFoot(playerId, receipt.landing, mineDomain)) return;
      return entry.confirmFirstFallTransfer(playerId, receipt.departure, receipt.landing);
    },
    requestCageRide: entry.requestCageRide,
  } as const;
}
