import type { Group } from 'three';
import { resolveUndergroundShaftRegistration } from '../../../src/presence/underground-shaft-registration.js';
import { createUndergroundMineLayout, type UndergroundMineSpec } from './underground-mine-layout';
import { mountUndergroundMineDomain } from './underground-domain-scene';
import { surveyZa31CraterWinch } from './town-za31-crater-winch';
import type { mountWestCraterRoad } from './town-za22-crater-road';

type Road = ReturnType<typeof mountWestCraterRoad>;
type Mine = ReturnType<typeof createUndergroundMineLayout>;
type Point = Readonly<{ east: number; north: number; height: number }>;

/** The B-01 certified first-mine spec (worked fixture of the domain-scene suite). */
export const undergroundMineSpec: UndergroundMineSpec = {
  pool: { length: 4, width: 6, depth: 1.2, shaftAperture: { width: 2, length: 2 } },
  shoreLength: 8,
  gallery: { length: 20, drop: 1, railGauge: 1, railWidth: .08 },
  collapse: { length: 3, width: 1.2, height: 1.3 },
  camp: { length: 10, side: 'right', extension: 5, openBackForExpansion: true, crystalGate: true },
  walker: { radius: .27, standingHeight: 1.8, crouchingHeight: 1.1, maxGrade: .2 },
};

/** Certified B-01 registration values: the crater lives in the town's west domain,
 * the mine landing is its own domain, and the depth line sits between them. */
export const undergroundCraterDomainId = 'west';
export const undergroundMineLanding: Point & Readonly<{ domainId: string }> =
  { domainId: 'underground/mine', east: -119, north: 189, height: -90 };
const shaftDepthLine = -73;
const winchHorizontalReach = .7;
const winchVerticalReach = .3;
const craterDepth = 35;

/**
 * Build the shaft survey from the mounted west route: the road's live rim anchor,
 * its surveyed winch operation foot, and the certified mine landing. Returns
 * undefined when the mounted winch survey cannot be taken (nothing to register).
 */
export function buildUndergroundShaftSurvey(road: Road) {
  const winch = surveyZa31CraterWinch(road);
  if (!winch) return undefined;
  const { anchor } = road;
  return {
    crater: {
      domainId: undergroundCraterDomainId,
      fixtureRim: { east: 0, north: 0, height: 0, yaw: 0 },
      liveRim: { east: anchor.east, north: anchor.north, rimHeight: anchor.rimHeight, yaw: anchor.yaw },
    },
    fixtureShaftFoot: { east: 0, north: 0, height: -craterDepth, yaw: 0 },
    liveWinchFoot: {
      domainId: undergroundCraterDomainId, ...winch.useFoot,
      horizontalReach: winchHorizontalReach, verticalReach: winchVerticalReach,
    },
    mineLanding: undergroundMineLanding,
    depthLine: shaftDepthLine,
  } as const;
}

/**
 * Registration port backed by the mounted geometry itself: the shaft foot must
 * sit on the crater floor the surface reports, the winch foot must be the one
 * the mounted route surveyed, and the mine pool must be the certified landing
 * at the layout's own pool level. Anything else stays unregistered.
 */
export function createUndergroundRegistrationPort(road: Road, mine: Mine) {
  const winch = surveyZa31CraterWinch(road);
  return {
    supportsFoot(role: 'shaft' | 'winch' | 'mine-pool', foot: Point & Readonly<{ domainId: string }>) {
      if (role === 'shaft') {
        if (foot.domainId !== undergroundCraterDomainId) return false;
        const height = road.heightAt(foot.east, foot.north);
        return height !== undefined && Math.abs(height - foot.height) < .01;
      }
      if (role === 'winch') {
        if (!winch || foot.domainId !== undergroundCraterDomainId) return false;
        return Math.abs(foot.east - winch.useFoot.east) < 1e-6 &&
          Math.abs(foot.north - winch.useFoot.north) < 1e-6 &&
          Math.abs(foot.height - winch.useFoot.height) < 1e-6;
      }
      return foot.domainId === undergroundMineLanding.domainId &&
        foot.east === undergroundMineLanding.east &&
        foot.north === undergroundMineLanding.north &&
        foot.height === undergroundMineLanding.height &&
        mine.anchors.poolLanding[1] === undergroundMineLanding.height;
    },
    acceptsShaftHandoff(connection: Readonly<{
      shaftFoot: Point; firstFallLanding: Point; depthLine: number;
    }>) {
      const { anchor } = road;
      return connection.depthLine === shaftDepthLine &&
        Math.abs(connection.shaftFoot.east - anchor.east) < 1e-6 &&
        Math.abs(connection.shaftFoot.north - anchor.north) < 1e-6 &&
        Math.abs(connection.shaftFoot.height - (anchor.rimHeight - craterDepth)) < 1e-6 &&
        connection.firstFallLanding.east === undergroundMineLanding.east &&
        connection.firstFallLanding.north === undergroundMineLanding.north &&
        connection.firstFallLanding.height === undergroundMineLanding.height;
    },
  };
}

/**
 * The underground domain host (branch window C, round 1): resolves the shaft
 * registration against the mounted west route and mounts the certified mine
 * domain scene. It owns no movement, E handling or teleport authority — entry
 * crossings stay with the descent driver and the presence handoff. When the
 * registration is not ready the mine stays unmounted and the result says why;
 * nothing is force-mounted. Light is never granted from render state: until
 * the U-13 recovery receipts are wired, the light reader reports no lit
 * niches and no budget, so camp lamps stay dark.
 */
export function mountUndergroundDomainHost(options: Readonly<{ parent: Group; road: Road }>) {
  const { parent, road } = options;
  const survey = buildUndergroundShaftSurvey(road);
  if (!survey) return { kind: 'unregistered', reason: 'winch-survey' } as const;
  const mine = createUndergroundMineLayout(undergroundMineSpec);
  const registration = resolveUndergroundShaftRegistration(
    survey, createUndergroundRegistrationPort(road, mine));
  if (registration.kind !== 'ready') return { kind: 'unregistered', reason: registration.kind } as const;
  const mounted = mountUndergroundMineDomain({
    parent, registration, mine,
    camp: undergroundMineSpec.camp, walker: undergroundMineSpec.walker,
    // The mine's local frame rides the crater fixture frame (the road anchor yaw);
    // no separate certified mine yaw exists in the registry yet.
    mineYaw: road.anchor.yaw,
    acceptsMineGeometry: placement =>
      placement.domainId === undergroundMineLanding.domainId &&
      placement.landing.height === undergroundMineLanding.height &&
      placement.localPool[1] === undergroundMineLanding.height,
    readLights: () => ({ litNicheIds: new Set<string>(), extraCampLightCount: 0, remainingBudget: 0 }),
  });
  if (mounted.kind !== 'ready') return { kind: 'unregistered', reason: mounted.kind } as const;
  // World -> mine-local passage query, for the movement host: the layout's own
  // queryPassage decides floor, clearance and crouch, never a guessed height.
  const originW = mounted.toWorld([0, 0, 0]);
  const basisXW = mounted.toWorld([1, 0, 0]);
  const basisZW = mounted.toWorld([0, 0, 1]);
  function passageAt(east: number, north: number) {
    if (!originW || !basisXW || !basisZW) return undefined;
    const dx = east - originW.east, dn = north - originW.north;
    const bxE = basisXW.east - originW.east, bxN = basisXW.north - originW.north;
    const bzE = basisZW.east - originW.east, bzN = basisZW.north - originW.north;
    const localX = dx * bxE + dn * bxN;
    const localZ = dx * bzE + dn * bzN;
    return mine.queryPassage(localX, localZ, undergroundMineSpec.walker.radius,
      undergroundMineSpec.walker.standingHeight);
  }
  return {
    kind: 'ready', registration, mounted, passageAt,
    floorAt: (east: number, north: number) => passageAt(east, north)?.floor,
  } as const;
}
