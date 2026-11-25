export type ExpansionAnchorPose = Readonly<{
  east: number;
  north: number;
  height: number;
  yaw: number;
}>;

export const undergroundDepths = Object.freeze({
  mine: -90,
  crystalCave: -140,
  warriorCity: -165,
  vault: -190,
} as const);

export type UndergroundSegment = keyof typeof undergroundDepths;
export type UndergroundDepthSurvey = Readonly<Partial<Record<UndergroundSegment, number>>>;
type HeightIssue =
  | { reason: 'missing' }
  | { reason: 'non-finite'; observed: number };
type DatumIssue =
  | HeightIssue
  | { reason: 'datum-mismatch'; observed: number; difference: number };

export type UndergroundDepthIssue = DatumIssue & {
  segment: UndergroundSegment;
  expected: number;
};

export type FirstFallDepthIssue =
  | (HeightIssue & { field: 'crossing' })
  | (DatumIssue & { field: 'landing'; expected: number })
  | { reason: 'landing-not-below-crossing'; crossingHeight: number; landingHeight: number };

function heightIssue(observed: number | undefined): HeightIssue | undefined {
  if (observed === undefined) return { reason: 'missing' };
  if (!Number.isFinite(observed)) return { reason: 'non-finite', observed };
}

function compareDatum(expected: number, observed: number | undefined): DatumIssue | undefined {
  const invalid = heightIssue(observed);
  if (invalid) return invalid;
  if (observed !== undefined && observed !== expected) {
    return { reason: 'datum-mismatch', observed, difference: observed - expected };
  }
}

/** Keep absent or discrepant absolute levels visible for the B-01 freeze register. */
export function auditUndergroundDepths(survey: UndergroundDepthSurvey): UndergroundDepthIssue[] {
  const issues: UndergroundDepthIssue[] = [];
  for (const segment of Object.keys(undergroundDepths) as UndergroundSegment[]) {
    const expected = undergroundDepths[segment];
    const issue = compareDatum(expected, survey[segment]);
    if (issue) issues.push({ segment, expected, ...issue });
  }
  return issues;
}

/** The measured shaft crossing is separate from the mine landing datum. */
export function auditFirstFallDepths(
  crossingHeight: number | undefined,
  landingHeight: number | undefined,
): FirstFallDepthIssue[] {
  const issues: FirstFallDepthIssue[] = [];
  const crossingIssue = heightIssue(crossingHeight);
  const landingIssue = compareDatum(undergroundDepths.mine, landingHeight);
  if (crossingIssue) issues.push({ field: 'crossing', ...crossingIssue });
  if (landingIssue) issues.push({ field: 'landing', expected: undergroundDepths.mine, ...landingIssue });
  if (crossingHeight !== undefined && landingHeight !== undefined &&
      Number.isFinite(crossingHeight) && Number.isFinite(landingHeight) && landingHeight >= crossingHeight) {
    issues.push({ reason: 'landing-not-below-crossing', crossingHeight, landingHeight });
  }
  return issues;
}

function checkPose(pose: ExpansionAnchorPose) {
  if (![pose.east, pose.north, pose.height, pose.yaw].every(Number.isFinite)) {
    throw new RangeError('Expansion anchor coordinates and yaw must be finite');
  }
}

function wrapYaw(yaw: number) {
  return Math.atan2(Math.sin(yaw), Math.cos(yaw));
}

function convertPose(
  pose: ExpansionAnchorPose, from: ExpansionAnchorPose, to: ExpansionAnchorPose, turn: number,
): ExpansionAnchorPose {
  checkPose(pose);
  const east = pose.east - from.east;
  const north = pose.north - from.north;
  const cosine = Math.cos(turn);
  const sine = Math.sin(turn);
  const converted = {
    east: to.east + east * cosine + north * sine,
    north: to.north - east * sine + north * cosine,
    height: to.height + (pose.height - from.height),
    yaw: wrapYaw(wrapYaw(pose.yaw) + turn),
  };
  checkPose(converted);
  return converted;
}

/** The caller supplies both measured anchors. Yaw is clockwise from north. */
export function createExpansionAnchorTransform(
  fixtureAnchor: ExpansionAnchorPose, worldAnchor: ExpansionAnchorPose,
) {
  checkPose(fixtureAnchor);
  checkPose(worldAnchor);
  const fixture = { ...fixtureAnchor };
  const world = { ...worldAnchor };
  const turn = wrapYaw(wrapYaw(world.yaw) - wrapYaw(fixture.yaw));
  return {
    toWorld: (pose: ExpansionAnchorPose) => convertPose(pose, fixture, world, turn),
    toFixture: (pose: ExpansionAnchorPose) => convertPose(pose, world, fixture, -turn),
  };
}
