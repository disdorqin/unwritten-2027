import { createRailTimetable } from './town-rail-timetable';

type DailyStage = 1 | 2 | 3;
type TrainStop = Parameters<typeof createRailTimetable>[0][number];
type TrainPhase = Parameters<ReturnType<typeof createRailTimetable>['sample']>[1];

/** V1/V2 select the evening and stage. These handlers describe one selected beat. */
export function createDailyRailTimetable<T extends TrainStop>(
  publicStops: readonly T[],
  routeLength: number,
  unlistedStop?: TrainStop,
) {
  if (unlistedStop && (
    !Number.isFinite(unlistedStop.distance) || unlistedStop.distance < 0 ||
    unlistedStop.distance >= routeLength || !Number.isFinite(unlistedStop.speed) ||
    unlistedStop.speed <= 0 || publicStops.some(stop =>
      stop.id === unlistedStop.id || stop.distance === unlistedStop.distance)
  )) throw new RangeError('invalid unlisted rail stop');

  const byPublicId = new Map(publicStops.map(stop => [stop.id, stop]));
  const stops = unlistedStop
    ? [...publicStops, unlistedStop].sort((a, b) => a.distance - b.distance)
    : publicStops;
  const physical = createRailTimetable(stops, routeLength);

  return {
    cycleSeconds: physical.cycleSeconds,
    sample: physical.sample,
    atUnlistedStop(phase: TrainPhase) {
      return !!unlistedStop && phase.stopped && physical.legs[phase.leg].from.id === unlistedStop.id;
    },
    currentPublicStop(phase: TrainPhase) {
      return phase.stopped ? byPublicId.get(physical.legs[phase.leg].from.id) : undefined;
    },
    nextPublicStop(phase: TrainPhase) {
      const next = physical.legs[phase.leg].to;
      return byPublicId.get(next.id) ?? byPublicId.get(physical.legs[(phase.leg + 1) % stops.length].to.id);
    },
    publicArrival(phase: TrainPhase, stopId: string) {
      return byPublicId.has(stopId) ? physical.arrival(phase, stopId) : undefined;
    },
  };
}

export function dailyUnlistedStopProps(stage: DailyStage) {
  return {
    flowers: stage === 1 ? 'placed' : 'fresh',
    luggage: stage === 3 ? 'optional-scenery' : 'absent',
    collectible: false,
  } as const;
}

type StageHistory = Readonly<{ sawFinale: boolean; sawBackstage: boolean }>;
type StageVisit = 'finale-completed' | 'backstage-visit';

export function dailyStageVisit(history: StageHistory, visit: StageVisit, performanceRunning: boolean) {
  if (visit === 'backstage-visit' && performanceRunning) return;
  const sawFinale = history.sawFinale || visit === 'finale-completed';
  const sawBackstage = history.sawBackstage || visit === 'backstage-visit';
  return {
    history: { sawFinale, sawBackstage },
    grantTicketStub: sawFinale && !history.sawFinale,
    unlockPhotoSpot: sawFinale && sawBackstage && !(history.sawFinale && history.sawBackstage),
  };
}

export function dailyFinaleCue(stage: DailyStage, personallyHeard: number) {
  return {
    includeLeaderAddendum: stage >= 2,
    subtitleAfterimageFrames: personallyHeard >= 6 ? 1 : 0,
  } as const;
}

const mailPaperSlots = ['list-fragment', 'star-map-fragment', 'courier-line-slot'] as const;

export function dailyMailErrand(stage: DailyStage, selectedByHost: boolean) {
  if (selectedByHost) return { id: 'daily-old-paper', paperSlot: mailPaperSlots[stage - 1] } as const;
}

type MeteorRegistration = Readonly<{ eventId: string; playerId: string }>;
type MeteorLanding = Readonly<{ id: string; landedAt: number; pickedBy?: string }>;

export function registerDailyMeteor(
  registrations: readonly MeteorRegistration[],
  landing: MeteorLanding,
  playerId: string,
  now: number,
  atLanding: boolean,
  stage: DailyStage,
) {
  const elapsed = now - landing.landedAt;
  if (!atLanding || !Number.isFinite(elapsed) || elapsed < 0 || elapsed >= 10 * 60_000 ||
      registrations.some(entry => entry.eventId === landing.id && entry.playerId === playerId)) return;

  const visitCount = registrations.filter(entry => entry.playerId === playerId).length + 1;
  return {
    registration: { eventId: landing.id, playerId },
    visitNumber: stage === 3 ? visitCount : undefined,
  };
}

export function mayHearDailyMarketAside(
  registrations: readonly MeteorRegistration[],
  landings: readonly MeteorLanding[],
  playerId: string,
) {
  return landings.some(landing => landing.pickedBy === playerId && registrations.some(entry =>
    entry.eventId === landing.id && entry.playerId === playerId));
}

export function dailyMascotWestCue(stage: DailyStage, nearMeteor: boolean, besideAndLookingWest: boolean) {
  return {
    usualWestLookMs: 20_000,
    longerLookAndPawing: stage >= 2 && nearMeteor,
    distantLight: stage === 3 && besideAndLookingWest,
    lightInteractable: false,
  } as const;
}

export function dailyNinthChimeAftermath(
  stage: DailyStage,
  personallyHeard: number,
  sinceExistingChimeMs: number,
  nearTower: boolean,
) {
  if (!nearTower || !Number.isFinite(sinceExistingChimeMs) || sinceExistingChimeMs < 0 ||
      sinceExistingChimeMs >= 60_000) return;
  if (stage === 3) return personallyHeard >= 8 ? 'silent-nod' : undefined;
  return stage === 2 ? 'mechanism-line-slot' : 'deflection-line-slot';
}

export function dailyOldWishCue(stage: DailyStage, approvedCardSlots: readonly [boolean, boolean]) {
  if (stage === 3) return { knotMotifOnly: true } as const;
  return approvedCardSlots[stage - 1] ? { cardSlot: stage } as const : undefined;
}

export function dailyHearthCue(stage: DailyStage, audienceHeardCounts: readonly number[]) {
  return {
    breakCount: Math.min(stage, 2),
    finalHalfLineSlot: stage === 3 && audienceHeardCounts.some(heard => heard >= 8),
  } as const;
}
