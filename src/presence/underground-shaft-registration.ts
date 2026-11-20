import type { UndergroundWinchUsePoint } from './underground-winch.js';

type Point = Readonly<{ east: number; north: number; height: number }>;
type Pose = Point & Readonly<{ yaw: number }>;
type DomainPoint = Point & Readonly<{ domainId: string }>;
type Crater = Readonly<{
  domainId: string;
  fixtureRim: Pose;
  liveRim: Readonly<{ east: number; north: number; rimHeight: number; yaw: number }>;
}>;

type ShaftSurvey = Readonly<{
  crater?: Crater;
  fixtureShaftFoot?: Pose;
  fixtureWinch?: Pose & Pick<UndergroundWinchUsePoint, 'horizontalReach' | 'verticalReach'>;
  mineLanding?: DomainPoint;
  depthLine?: number;
}>;

type ShaftRegistration = Readonly<{
  shaftFoot: DomainPoint;
  winch: UndergroundWinchUsePoint;
  firstFallLanding: DomainPoint;
  depthLine: number;
}>;

type RegistrationPort = Readonly<{
  /** The approved B-01 anchor module. */
  createExpansionAnchorTransform(fixture: Pose, live: Pose): { toWorld(point: Pose): Pose };
  auditFirstFallDepths(crossingHeight: number, landingHeight: number): readonly unknown[];
  /** The mounted collision and domain host, reading its registered geometry. */
  supportsFoot(role: 'shaft' | 'winch' | 'mine-pool', foot: DomainPoint): boolean;
  /** Check that the registered shaft connects these two loaded rooms at this crossing. */
  acceptsShaftHandoff(connection: ShaftRegistration): boolean;
}>;

function finitePoint(point: Point | undefined) {
  return !!point && [point.east, point.north, point.height].every(Number.isFinite);
}

function finitePose(pose: Pose | undefined) {
  return !!pose && finitePoint(pose) && Number.isFinite(pose.yaw);
}

function validDomain(domain: string) {
  return typeof domain === 'string' && domain.length > 0 && domain.trim() === domain;
}

function sameRim(mapped: Pose, live: Pose) {
  const turn = mapped.yaw - live.yaw;
  return Math.hypot(mapped.east - live.east, mapped.north - live.north, mapped.height - live.height) <= 1e-6 &&
    Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn))) <= 1e-6;
}

/** Resolve surveyed placement only. Entry authority still owns crossing, the well save and arrival cues. */
export function resolveUndergroundShaftRegistration(survey: ShaftSurvey, port: RegistrationPort) {
  const { crater, fixtureShaftFoot, fixtureWinch, mineLanding, depthLine } = survey;
  if (!crater?.fixtureRim || !crater.liveRim || !fixtureShaftFoot || !fixtureWinch || !mineLanding || depthLine === undefined) {
    return { kind: 'unregistered' } as const;
  }
  const { domainId, fixtureRim, liveRim } = crater;
  const liveRimPose = { east: liveRim.east, north: liveRim.north, height: liveRim.rimHeight, yaw: liveRim.yaw };
  if (!validDomain(domainId) || !validDomain(mineLanding.domainId) || domainId === mineLanding.domainId) {
    return { kind: 'invalid-domains' } as const;
  }
  const { horizontalReach, verticalReach } = fixtureWinch;
  if (![fixtureRim, liveRimPose, fixtureShaftFoot, fixtureWinch].every(finitePose) || !finitePoint(mineLanding) ||
      ![horizontalReach, verticalReach].every(reach => Number.isFinite(reach) && reach >= 0)) {
    return { kind: 'invalid-points' } as const;
  }

  const transform = port.createExpansionAnchorTransform(fixtureRim, liveRimPose);
  const shaft = transform.toWorld(fixtureShaftFoot);
  const lever = transform.toWorld(fixtureWinch);
  const mappedRim = transform.toWorld(fixtureRim);
  if (![shaft, lever, mappedRim].every(finitePose) || !sameRim(mappedRim, liveRimPose)) {
    return { kind: 'invalid-transform' } as const;
  }
  if (!Number.isFinite(depthLine) || mineLanding.height >= depthLine ||
      depthLine >= Math.min(shaft.height, lever.height) ||
      port.auditFirstFallDepths(depthLine, mineLanding.height).length > 0) {
    return { kind: 'invalid-depth' } as const;
  }

  const shaftFoot = { domainId, east: shaft.east, north: shaft.north, height: shaft.height };
  const winch = { domainId, east: lever.east, north: lever.north, height: lever.height, horizontalReach, verticalReach };
  const firstFallLanding = { ...mineLanding };
  if (port.supportsFoot('shaft', shaftFoot) !== true || port.supportsFoot('winch', winch) !== true ||
      port.supportsFoot('mine-pool', firstFallLanding) !== true) {
    return { kind: 'unsupported-foot' } as const;
  }
  const connection: ShaftRegistration = { shaftFoot, winch, firstFallLanding, depthLine };
  if (port.acceptsShaftHandoff(connection) !== true) return { kind: 'unregistered-handoff' } as const;
  return { kind: 'ready', connection } as const;
}
