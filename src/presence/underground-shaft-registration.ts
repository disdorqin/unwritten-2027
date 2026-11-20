import { auditFirstFallDepths, createExpansionAnchorTransform, type ExpansionAnchorPose as Pose } from './expansion-anchors.js';
import type { UndergroundWinchUsePoint } from './underground-winch.js';

type Point = Readonly<{ east: number; north: number; height: number }>;
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

  const transform = createExpansionAnchorTransform(fixtureRim, liveRimPose);
  let shaft: Pose;
  let lever: Pose;
  try {
    shaft = transform.toWorld(fixtureShaftFoot);
    lever = transform.toWorld(fixtureWinch);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return { kind: 'invalid-transform' } as const;
  }
  if (depthLine >= Math.min(shaft.height, lever.height) ||
      auditFirstFallDepths(depthLine, mineLanding.height).length > 0) {
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
