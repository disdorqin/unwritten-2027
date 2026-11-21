import { createUndergroundWellBridge } from '../../../src/presence/underground-well-bridge';
import { createUndergroundMineLift, type UndergroundMineLiftTrip } from '../../../src/presence/underground-mine-lift';
import { createUndergroundLiftDomainHandoff } from '../../../src/presence/underground-lift-domain-handoff';
import type { resolveUndergroundShaftRegistration } from '../../../src/presence/underground-shaft-registration';
import type { UndergroundEntrySnapshot } from '../../../src/presence/underground-entry';

type Registration = ReturnType<typeof resolveUndergroundShaftRegistration>;
type Foot = Readonly<{ east: number; north: number; height: number }>;
type AcceptedFoot = Foot & Readonly<{ playerId: string; domainId: string }>;

export type DreamChainTrip = Readonly<{
  id: number; first: boolean; departedAt: number; travelMs: number; direction: 'down' | 'up';
}>;

export type DreamChainEvent =
  | Readonly<{ kind: 'well-opened' }>
  | Readonly<{ kind: 'trip-started'; trip: DreamChainTrip }>;

export type DreamChainHost = Readonly<{
  registration: Registration;
  now(): number;
  playerId: string;
  /** The local player's current world foot, from the viewer's own movement state. */
  readLocalFoot(): Foot | undefined;
  onEvent(event: DreamChainEvent): void;
}>;

const liftTravelMs = 25_000;
const shaftRadius = 55 / 30;

/**
 * Client-side composition of the certified underground authorities (winch
 * winding, well bridge, entry, lift, domain handoff) for the local player.
 * The composition owns no rendering and no movement: the viewer drives the
 * E-hold sample stream, presents trips, and applies accepted landings.
 * Server-side multiplayer authority for these machines is a separate,
 * deeper integration; trip IDs and entry snapshots here are session-local.
 */
export function createUndergroundDreamChain(host: DreamChainHost) {
  if (host.registration.kind !== 'ready') return { kind: 'unregistered' } as const;
  const { connection } = host.registration;
  const surfaceDomain = connection.shaftFoot.domainId;
  const mineDomain = connection.firstFallLanding.domainId;
  const shaftFoot: Foot = {
    east: connection.shaftFoot.east, north: connection.shaftFoot.north, height: connection.shaftFoot.height,
  };
  const mineLanding: Foot = {
    east: connection.firstFallLanding.east, north: connection.firstFallLanding.north,
    height: connection.firstFallLanding.height,
  };
  const playerId = host.playerId;

  let phase: 'surface' | 'mine' = 'surface';
  let dockedStop: 'crater-floor' | 'mine' = 'crater-floor';
  let savedSnapshot: UndergroundEntrySnapshot | undefined;
  let confirmedTransfer: { playerId: string; departure: AcceptedFoot; landing: AcceptedFoot } | undefined;
  let acceptedLanding: { tripId: number; foot: AcceptedFoot } | undefined;
  let lastTripId = 0;
  let firstFallDeparture: AcceptedFoot | undefined;
  let activeTrip: UndergroundMineLiftTrip | undefined;
  let pendingRide: 'down' | 'up' | undefined;
  const landingWaiters = new Map<number, (foot: Foot) => void>();

  const acceptedFoot = (): AcceptedFoot | undefined => {
    const foot = host.readLocalFoot();
    if (!foot) return undefined;
    return { playerId, domainId: phase === 'mine' ? mineDomain : surfaceDomain, ...foot };
  };
  const nearShaft = (foot: Foot) =>
    Math.hypot(foot.east - shaftFoot.east, foot.north - shaftFoot.north) <= shaftRadius + .4 &&
    Math.abs(foot.height - shaftFoot.height) <= 1.5;
  const nearMineLanding = (foot: Foot) =>
    Math.hypot(foot.east - mineLanding.east, foot.north - mineLanding.north) <= 3 &&
    Math.abs(foot.height - mineLanding.height) <= 1.5;

  const bridge = createUndergroundWellBridge({
    registration: host.registration,
    now: host.now,
    maxSampleGapMs: 200,
    readAcceptedFoot: acceptedFoot,
    readConfirmedFirstFallTransfer: () => confirmedTransfer,
    isFirstFallDeparture: (_id, point) => nearShaft(point),
    isDepthLineCrossing: (point) => {
      // The transfer segment runs from the bore axis to the pool landing
      // beside it; a crossing counts when it stays inside that corridor.
      const ax = shaftFoot.east, az = shaftFoot.north;
      const bx = mineLanding.east, bz = mineLanding.north;
      const dx = bx - ax, dz = bz - az;
      const lengthSq = dx * dx + dz * dz;
      const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1,
        ((point.east - ax) * dx + (point.north - az) * dz) / lengthSq));
      const px = ax + t * dx, pz = az + t * dz;
      return Math.hypot(point.east - px, point.north - pz) <= shaftRadius + .4;
    },
    isFirstFallPool: (point) => nearMineLanding(point) && point.height <= -85,
    canBoardCage: (_id, direction) => {
      const foot = host.readLocalFoot();
      if (!foot) return false;
      return direction === 'down' ? nearShaft(foot) : nearMineLanding(foot);
    },
    load: () => savedSnapshot,
    save: (snapshot) => { savedSnapshot = snapshot; },
  });
  if (bridge.kind !== 'ready') return { kind: 'unregistered' } as const;

  const lift = createUndergroundMineLift({
    travelMs: liftTravelMs,
    riderCapacity: 2,
    now: host.now,
    allocateTripId: () => ++lastTripId,
    requestCageRide: (id, direction) => bridge.requestCageRide(id, direction),
    readAcceptedFoot: acceptedFoot,
    isAtBoardingPlatform: (stop, foot) => stop === 'crater-floor' ? nearShaft(foot) : nearMineLanding(foot),
    // The host reports the physical dock: once a trip's travel has elapsed the
    // cage stands at its destination; before that it stands at the last dock.
    readDockedStop: () => activeTrip && host.now() - activeTrip.departedAt >= activeTrip.travelMs
      ? activeTrip.destination
      : dockedStop,
  });

  const handoff = createUndergroundLiftDomainHandoff({
    lift,
    domains: { 'crater-floor': surfaceDomain, mine: mineDomain },
    readAcceptedLanding: () => acceptedLanding,
    isAtAcceptedLanding: (stop, foot) => {
      const target = stop === 'mine' ? mineLanding : shaftFoot;
      return Math.abs(foot.east - target.east) <= .01 && Math.abs(foot.north - target.north) <= .01 &&
        Math.abs(foot.height - target.height) <= .01;
    },
  });

  function settleLanding(tripId: number, foot: Foot) {
    const waiter = landingWaiters.get(tripId);
    if (waiter) {
      landingWaiters.delete(tripId);
      waiter(foot);
    }
  }

  function departWithPlayer(direction: 'down' | 'up') {
    if (!lift.board(playerId, direction)) return undefined;
    const trip = lift.depart(playerId);
    if (!trip) return undefined;
    activeTrip = trip;
    const chainTrip: DreamChainTrip = {
      id: trip.id, first: false, departedAt: trip.departedAt, travelMs: trip.travelMs, direction,
    };
    host.onEvent({ kind: 'trip-started', trip: chainTrip });
    return chainTrip;
  }

  return {
    kind: 'ready',
    winchFoot: {
      east: connection.winch.east, north: connection.winch.north, height: connection.winch.height,
    } as Foot,
    shaftFoot,
    mineLanding,
    holdWinch() {
      const result = bridge.holdWinch(playerId);
      if (result.kind === 'opened') host.onEvent({ kind: 'well-opened' });
      return result;
    },
    releaseWinch() {
      bridge.releaseWinch(playerId);
    },
    coverOpen: () => !bridge.sceneState().coverVisible,
    cageAvailable: () => bridge.sceneState().cageAvailable,
    firstFallPending: () => {
      const well = bridge.snapshot().well;
      return well.kind === 'open' && well.firstFallPending;
    },
    phase: () => phase,
    pendingRide: () => pendingRide,

    /** The opener walks from the handle into the open bore; this issues the fall order. */
    requestFirstFall() {
      const foot = acceptedFoot();
      if (!foot) return undefined;
      const order = bridge.requestFirstFall(playerId);
      if (!order) return undefined;
      firstFallDeparture = foot;
      const trip: DreamChainTrip = {
        id: ++lastTripId, first: true, departedAt: host.now(), travelMs: liftTravelMs, direction: 'down',
      };
      host.onEvent({ kind: 'trip-started', trip });
      return { order, trip };
    },

    /**
     * Board and depart when the cage stands at the player's platform. When it
     * stands at the far platform (the case right after a first fall), the
     * empty cage is called first and the ride departs on its arrival; the
     * trip-started event fires at the actual departure either way.
     */
    requestCageRide(direction: 'down' | 'up') {
      if (activeTrip || pendingRide) return undefined;
      const boardingStop = direction === 'down' ? 'crater-floor' : 'mine';
      if (dockedStop !== boardingStop) {
        const empty = lift.callEmptyCage(playerId, boardingStop);
        if (!empty) return undefined;
        activeTrip = empty;
        pendingRide = direction;
        return undefined;
      }
      return departWithPlayer(direction);
    },

    /**
     * Resolve a trip's accepted landing foot. First falls confirm through the
     * well bridge immediately; cage trips resolve once the lift has arrived
     * and the domain handoff has issued its wake cue.
     */
    requestLanding(tripId: number): Promise<Foot | undefined> {
      if (firstFallDeparture && !activeTrip) {
        const landing: AcceptedFoot = { playerId, domainId: mineDomain, ...mineLanding };
        confirmedTransfer = { playerId, departure: firstFallDeparture, landing };
        const result = bridge.confirmFirstFall(playerId);
        firstFallDeparture = undefined;
        if (result?.kind !== 'first-fall-landed') return Promise.resolve(undefined);
        // The fall moves the player, not the cage: the lift stays docked at
        // the crater floor until the empty cage is called down.
        phase = 'mine';
        return Promise.resolve({ ...mineLanding });
      }
      if (activeTrip?.id === tripId) {
        return new Promise((resolve) => {
          landingWaiters.set(tripId, (foot) => resolve(foot));
        });
      }
      return Promise.resolve(undefined);
    },

    /** Per-frame drive: confirm lift arrivals and issue handoff wake cues. */
    update() {
      if (!activeTrip) return;
      const trip = activeTrip;
      if (host.now() - trip.departedAt < trip.travelMs) return;
      if (trip.riders.length === 0) {
        // An empty repositioning leg: confirm the dock, then depart with the
        // waiting rider if one is pending.
        if (!lift.confirmArrival(trip.id)) return;
        activeTrip = undefined;
        dockedStop = trip.destination;
        if (pendingRide) {
          const direction = pendingRide;
          pendingRide = undefined;
          departWithPlayer(direction);
        }
        return;
      }
      handoff.jolt(playerId, trip.id);
      if (!handoff.confirmDock(trip.id)) return;
      const toMine = trip.destination === 'mine';
      acceptedLanding = {
        tripId: trip.id,
        foot: { playerId, domainId: toMine ? mineDomain : surfaceDomain, ...(toMine ? mineLanding : shaftFoot) },
      };
      const wake = handoff.wake(playerId, trip.id);
      if (!wake) return;
      handoff.finishWake(playerId, trip.id);
      // The ride physically carried the player through the bore: submit the
      // crossing segment so the entry flips the player's mode (peace above
      // the depth line, survival below it) for the next boarding check.
      const originFoot = trip.origin === 'mine' ? mineLanding : shaftFoot;
      bridge.confirmDepthCrossing(playerId, originFoot, {
        east: wake.foot.east, north: wake.foot.north, height: wake.foot.height,
      });
      activeTrip = undefined;
      dockedStop = trip.destination;
      phase = toMine ? 'mine' : 'surface';
      settleLanding(trip.id, { east: wake.foot.east, north: wake.foot.north, height: wake.foot.height });
    },
  } as const;
}
