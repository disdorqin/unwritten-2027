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
  /** Supported operation foot surveyed by the mounted west route, in world coordinates. */
  liveWinchFoot?: UndergroundWinchUsePoint;
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
  const { crater, fixtureShaftFoot, fixtureWinch, liveWinchFoot, mineLanding, depthLine } = survey;
  const winchFoot = liveWinchFoot ?? fixtureWinch;
  if (!crater?.fixtureRim || !crater.liveRim || !fixtureShaftFoot || !winchFoot || !mineLanding || depthLine === undefined) {
    return { kind: 'unregistered' } as const;
  }
  const { domainId, fixtureRim, liveRim } = crater;
  const liveRimPose = { east: liveRim.east, north: liveRim.north, height: liveRim.rimHeight, yaw: liveRim.yaw };
  if (!validDomain(domainId) || !validDomain(mineLanding.domainId) || domainId === mineLanding.domainId ||
      (liveWinchFoot && liveWinchFoot.domainId !== domainId)) {
    return { kind: 'invalid-domains' } as const;
  }
  const { horizontalReach, verticalReach } = winchFoot;
  if ((fixtureWinch && (liveWinchFoot || !finitePose(fixtureWinch))) ||
      ![fixtureRim, liveRimPose, fixtureShaftFoot].every(finitePose) || !finitePoint(winchFoot) || !finitePoint(mineLanding) ||
      ![horizontalReach, verticalReach].every(reach => Number.isFinite(reach) && reach >= 0)) {
    return { kind: 'invalid-points' } as const;
  }

  const transform = createExpansionAnchorTransform(fixtureRim, liveRimPose);
  let shaft: Pose;
  let operationFoot: Point;
  try {
    shaft = transform.toWorld(fixtureShaftFoot);
    operationFoot = fixtureWinch ? transform.toWorld(fixtureWinch) : winchFoot;
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return { kind: 'invalid-transform' } as const;
  }
  if (depthLine >= Math.min(shaft.height, operationFoot.height) ||
      auditFirstFallDepths(depthLine, mineLanding.height).length > 0) {
    return { kind: 'invalid-depth' } as const;
  }

  const shaftFoot = { domainId, east: shaft.east, north: shaft.north, height: shaft.height };
  const winch = { domainId, east: operationFoot.east, north: operationFoot.north, height: operationFoot.height,
    horizontalReach, verticalReach };
  const firstFallLanding = { ...mineLanding };
  if (port.supportsFoot('shaft', shaftFoot) !== true || port.supportsFoot('winch', winch) !== true ||
      port.supportsFoot('mine-pool', firstFallLanding) !== true) {
    return { kind: 'unsupported-foot' } as const;
  }
  const connection: ShaftRegistration = { shaftFoot, winch, firstFallLanding, depthLine };
  if (port.acceptsShaftHandoff(connection) !== true) return { kind: 'unregistered-handoff' } as const;
  return { kind: 'ready', connection } as const;
}
