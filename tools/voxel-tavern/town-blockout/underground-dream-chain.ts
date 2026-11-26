import { createUndergroundWellBridge } from '../../../src/presence/underground-well-bridge';
import { createWinch } from './town-winch';
import { createUndergroundMineLift, type UndergroundMineLiftTrip } from '../../../src/presence/underground-mine-lift';
import { createUndergroundLiftDomainHandoff } from '../../../src/presence/underground-lift-domain-handoff';
import type { resolveUndergroundShaftRegistration } from '../../../src/presence/underground-shaft-registration';
import type { UndergroundEntrySnapshot } from '../../../src/presence/underground-entry';
import type { R30ReturnRidePort,R30ReturnRidePath } from './town-c-r30-return-ride';

type Registration = ReturnType<typeof resolveUndergroundShaftRegistration>;
type Foot = Readonly<{ east: number; north: number; height: number }>;
type AcceptedFoot = Foot & Readonly<{ playerId: string; domainId: string }>;

export type DreamChainTrip = Readonly<{
  id: number; first: boolean; departedAt: number; travelMs: number; direction: 'down' | 'up';
  ridePath?:R30ReturnRidePath;
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
  /** True while another player stands at the steady-rope stay (duo crank). */
  readRopeHeld?(): boolean;
  /** Optional relocated route; if supplied but uncertified, deny cage rides
   * rather than silently falling back to the retired station. */
  returnRide?:R30ReturnRidePort;
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
  const relocated=host.returnRide;
  if(relocated&&(relocated.domains['crater-floor']!==surfaceDomain||relocated.domains.mine!==mineDomain||
    Math.abs(relocated.path.shaft.height-shaftFoot.height)>.025||relocated.path.shaft.height<=connection.depthLine||relocated.path.landing.height>=connection.depthLine))return {kind:'unregistered'} as const;
  const ridePath=relocated?.path;
  const rideDock=(stop:'crater-floor'|'mine')=>stop==='mine'?ridePath?.landing??mineLanding:ridePath?.shaft??shaftFoot;
  let rideRevision:string|undefined,callingEmpty=false,confirmedDockId:number|undefined;
  const rideCertified=()=>!relocated||!!rideRevision&&relocated.revision()===rideRevision;

  let phase: 'surface' | 'mine' = 'surface';
  let dockedStop: 'crater-floor' | 'mine' = 'crater-floor';
  let savedSnapshot: UndergroundEntrySnapshot | undefined;
  let confirmedTransfer: { playerId: string; departure: AcceptedFoot; landing: AcceptedFoot } | undefined;
  let acceptedLanding: { tripId: number; foot: AcceptedFoot } | undefined;
  let lastTripId = 0;
  let firstFall: {trip: DreamChainTrip; departure: AcceptedFoot} | undefined;
  // Retain the most recent completed landing until the next departure. The
  // cinematic can ask after the dock tick or retry after a lost response.
  let lastLanding: {tripId:number;foot:Foot} | undefined;
  let activeTrip: UndergroundMineLiftTrip | undefined;
  let pendingRide: 'down' | 'up' | undefined;
  const landingWaiters = new Map<number, {promise:Promise<Foot|undefined>;resolve:(foot:Foot|undefined)=>void}>();

  const acceptedFoot = (): AcceptedFoot | undefined => {
    const foot = host.readLocalFoot();
    if (!foot || ![foot.east,foot.north,foot.height].every(Number.isFinite)) return undefined;
    return { playerId, domainId: phase === 'mine' ? mineDomain : surfaceDomain, ...foot };
  };
  const nearShaft = (foot: Foot) =>
    Math.hypot(foot.east - shaftFoot.east, foot.north - shaftFoot.north) <= shaftRadius + .4 &&
    Math.abs(foot.height - shaftFoot.height) <= 1.5;
  const nearMineLanding = (foot: Foot) =>
    Math.hypot(foot.east - mineLanding.east, foot.north - mineLanding.north) <= 3 &&
    Math.abs(foot.height - mineLanding.height) <= 1.5;

  const winchLeaf = createWinch();
  const bridge = createUndergroundWellBridge({
    registration: host.registration,
    now: host.now,
    maxSampleGapMs: 300,
    readAcceptedFoot: acceptedFoot,
    readConfirmedFirstFallTransfer: () => confirmedTransfer,
    isFirstFallDeparture: (_id, point) => nearShaft(point),
    isDepthLineCrossing: (point) => {
      // Repeated cage rides use the relocated vertical bore only after its
      // live certificate. The original first-fall crossing stays unchanged.
      if(relocated&&!firstFall)return rideCertified()&&relocated.crossing(point);
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
      const foot = acceptedFoot();
      if (!foot) return false;
      if(relocated)return rideCertified()&&relocated.check(direction==='down'?'crater-floor':'mine',callingEmpty?'call':'board',foot);
      return direction === 'down' ? nearShaft(foot) : nearMineLanding(foot);
    },
    load: () => savedSnapshot,
    save: (snapshot) => { savedSnapshot = snapshot; },
    // 乙案: the town-winch leaf paces the crank (40 s solo, duo rope x1.8);
    // the bridge/entry still issue the opening credential.
    winchExternal: {
      isComplete: () => winchLeaf.open,
      progress: () => winchLeaf.progress,
    },
  });
  if (bridge.kind !== 'ready') return { kind: 'unregistered' } as const;

  const lift = createUndergroundMineLift({
    travelMs: liftTravelMs,
    riderCapacity: 2,
    now: host.now,
    allocateTripId: () => ++lastTripId,
    requestCageRide: (id, direction) => bridge.requestCageRide(id, direction),
    readAcceptedFoot: acceptedFoot,
    isAtBoardingPlatform: (stop, foot) => relocated?rideCertified()&&relocated.check(stop,callingEmpty?'call':'board',foot):stop === 'crater-floor' ? nearShaft(foot) : nearMineLanding(foot),
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
      if(relocated)return rideCertified()&&relocated.check(stop,'landing',foot);
      const target = rideDock(stop);
      return Math.abs(foot.east - target.east) <= .01 && Math.abs(foot.north - target.north) <= .01 &&
        Math.abs(foot.height - target.height) <= .01;
    },
  });

  function settleLanding(tripId: number, foot: Foot) {
    lastLanding={tripId,foot:{...foot}};
    const waiter = landingWaiters.get(tripId);
    if (waiter) {
      landingWaiters.delete(tripId);
      waiter.resolve({...foot});
    }
  }

  function waitForLanding(tripId:number):Promise<Foot|undefined>{
    const existing=landingWaiters.get(tripId);
    if(existing)return existing.promise;
    let resolve!:(foot:Foot|undefined)=>void;
    const promise=new Promise<Foot|undefined>(done=>{resolve=done});
    landingWaiters.set(tripId,{promise,resolve});
    return promise;
  }

  function departWithPlayer(direction: 'down' | 'up') {
    if (!lift.board(playerId, direction)) return undefined;
    const trip = lift.depart(playerId);
    if (!trip) return undefined;
    activeTrip = trip;
    confirmedDockId=undefined;
    lastLanding=undefined;
    const chainTrip: DreamChainTrip = {
      id: trip.id, first: false, departedAt: trip.departedAt, travelMs: trip.travelMs, direction,...(ridePath?{ridePath}:{})
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
    /**
     * 乙案 crank: one viewer frame of held E. The leaf ticks first (pace,
     * duo rope, no regress), then the bridge's external stream carries the
     * credential. Returns leaf progress for the HUD either way.
     */
    crankWinch(dtSeconds: number) {
      if (!bridge.sceneState().coverVisible) return { kind: 'already-open', progress: 1 } as const;
      const foot=acceptedFoot();
      const reach=connection.winch;
      if(!foot||foot.domainId!==surfaceDomain||Math.hypot(foot.east-reach.east,foot.north-reach.north)>reach.horizontalReach||Math.abs(foot.height-reach.height)>reach.verticalReach){
        bridge.releaseWinch(playerId);
        return {kind:'unreachable',progress:winchLeaf.progress} as const;
      }
      // The feel model may advance only from a reachable held frame; large
      // resume deltas are not continuous cranking samples.
      winchLeaf.tick(Math.min(dtSeconds,.3), { cranking: true, ropeHeld: host.readRopeHeld?.() ?? false });
      const result = bridge.holdWinchExternal(playerId);
      if (result.kind === 'opened') host.onEvent({ kind: 'well-opened' });
      return { ...result, progress: winchLeaf.progress } as const;
    },
    winchProgress: () => winchLeaf.progress,
    /** Cage sway for the descent presentation, from the leaf. */
    swayRoll(elapsedSeconds: number) {
      return winchLeaf.swayAt(elapsedSeconds, host.readRopeHeld?.() ?? false);
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
    /** Read-only cue for the existing viewer renderer. Empty repositioning
     * is not a player camera ride; no second motion authority is created. */
    presentationTrip():DreamChainTrip|undefined{
      if(firstFall)return {...firstFall.trip};
      if(activeTrip?.riders.includes(playerId))return {id:activeTrip.id,first:false,departedAt:activeTrip.departedAt,travelMs:activeTrip.travelMs,direction:activeTrip.direction,...(ridePath?{ridePath}:{})};
    },

    /** The opener walks from the handle into the open bore; this issues the fall order. */
    requestFirstFall() {
      if(firstFall||activeTrip||pendingRide||phase!=='surface')return undefined;
      const foot = acceptedFoot();
      if (!foot) return undefined;
      const order = bridge.requestFirstFall(playerId);
      if (!order) return undefined;
      const trip: DreamChainTrip = {
        id: ++lastTripId, first: true, departedAt: host.now(), travelMs: liftTravelMs, direction: 'down',
      };
      firstFall={trip,departure:foot};
      lastLanding=undefined;
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
      if (firstFall || activeTrip || pendingRide) return undefined;
      rideRevision=relocated?.revision();
      if(!rideCertified())return undefined;
      const boardingStop = direction === 'down' ? 'crater-floor' : 'mine';
      if (dockedStop !== boardingStop) {
        callingEmpty=true;
        let empty:UndergroundMineLiftTrip|undefined;
        try{empty=lift.callEmptyCage(playerId, boardingStop)}finally{callingEmpty=false;}
        if (!empty) return undefined;
        activeTrip = empty;
        confirmedDockId=undefined;
        lastLanding=undefined;
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
      if(lastLanding?.tripId===tripId)return Promise.resolve({...lastLanding.foot});
      if (firstFall?.trip.id===tripId) {
        const now=host.now();
        if(!Number.isFinite(now)||now-firstFall.trip.departedAt<firstFall.trip.travelMs)return Promise.resolve(undefined);
        const landing: AcceptedFoot = { playerId, domainId: mineDomain, ...mineLanding };
        confirmedTransfer = { playerId, departure: firstFall.departure, landing };
        const result = bridge.confirmFirstFall(playerId);
        confirmedTransfer=undefined;
        if (result?.kind !== 'first-fall-landed') return Promise.resolve(undefined);
        firstFall=undefined;
        // The fall moves the player, not the cage: the lift stays docked at
        // the crater floor until the empty cage is called down.
        phase = 'mine';
        settleLanding(tripId,mineLanding);
        return Promise.resolve({ ...mineLanding });
      }
      if (activeTrip?.id === tripId && activeTrip.riders.includes(playerId)) {
        return waitForLanding(tripId);
      }
      return Promise.resolve(undefined);
    },

    /** Per-frame drive: confirm lift arrivals and issue handoff wake cues. */
    update() {
      if (!activeTrip) return;
      const trip = activeTrip;
      if (!Number.isFinite(host.now())||host.now() - trip.departedAt < trip.travelMs||!rideCertified()) return;
      if (trip.riders.length === 0) {
        // An empty repositioning leg: confirm the dock, then depart with the
        // waiting rider if one is pending.
        if (!lift.confirmArrival(trip.id)) return;
        activeTrip = undefined;
        dockedStop = trip.destination;
        if (pendingRide) {
          const direction = pendingRide;
          pendingRide = undefined;
          // A call foot is outside the cage: wait for a second, explicit
          // boarding request at the physical dock on the relocated route.
          if(!relocated)departWithPlayer(direction);
        }
        return;
      }
      if(confirmedDockId!==trip.id){
        handoff.jolt(playerId, trip.id);
        if (!handoff.confirmDock(trip.id)) return;
        confirmedDockId=trip.id;
      }
      const toMine = trip.destination === 'mine';
      acceptedLanding = {
        tripId: trip.id,
        foot: { playerId, domainId: toMine ? mineDomain : surfaceDomain, ...rideDock(trip.destination) },
      };
      if(relocated&&(!rideCertified()||!relocated.check(trip.destination,'landing',acceptedLanding.foot)))return;
      const wake = handoff.wake(playerId, trip.id);
      if (!wake) return;
      // The ride physically carried the player through the bore: submit the
      // crossing segment so the entry flips the player's mode (peace above
      // the depth line, survival below it) for the next boarding check.
      const originFoot = rideDock(trip.origin);
      const crossing=bridge.confirmDepthCrossing(playerId, originFoot, {
        east: wake.foot.east, north: wake.foot.north, height: wake.foot.height,
      });
      if(!crossing){
        // Never announce an unaccepted mode change. The cage is physically
        // docked; report failure rather than leave an immortal pending promise.
        if(relocated)return; // retain the docked cue for a certified retry
        handoff.finishWake(playerId,trip.id);
        activeTrip=undefined;dockedStop=trip.destination;acceptedLanding=undefined;
        landingWaiters.get(trip.id)?.resolve(undefined);landingWaiters.delete(trip.id);
        return;
      }
      handoff.finishWake(playerId,trip.id);
      activeTrip = undefined;
      dockedStop = trip.destination;
      phase = toMine ? 'mine' : 'surface';
      settleLanding(trip.id, { east: wake.foot.east, north: wake.foot.north, height: wake.foot.height });
    },
  } as const;
}
