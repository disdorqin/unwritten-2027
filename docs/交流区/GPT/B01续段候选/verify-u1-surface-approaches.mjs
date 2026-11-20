import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const bodyRadius = .27;
const bodyHeight = 1.8;
const stepHeight = .43;
const maximumWalkingStride = 11.3 / 60;
const surfaceTolerance = .025;
const kinds = ['westSlide', 'eastSideCorridor'];
const coverStates = ['covered', 'opened'];

const finite = point => point && [point.east, point.north, point.y].every(Number.isFinite);
const length = (a, b) => Math.hypot(a.east - b.east, a.north - b.north);
const inShaft = (frame, point) => length(frame.shaft, point) < frame.shaft.radius + bodyRadius;

function verifyRoute(frame, kind, cover, run, issues) {
  const reported = new Map();
  const fail = (code, sample) => {
    const existing = reported.get(code);
    if (existing) existing.count++;
    else {
      const issue = { route: kind, cover, code, count: 1, ...(sample === undefined ? {} : { sample }) };
      reported.set(code, issue);
      issues.push(issue);
    }
  };
  if (!run || !Array.isArray(run.feet) || run.feet.length < 2 || run.feet.some(point => !finite(point))) {
    fail('missing-or-invalid-foot-samples');
    return;
  }
  const slide = kind === 'westSlide';
  const { feet } = run;
  const first = feet[0], last = feet.at(-1);
  if (first.y <= frame.floorY + stepHeight || length(frame.center, first) <= frame.floorRadius) fail('start-not-above-floor');
  if (length(frame.center, last) > frame.floorRadius + bodyRadius ||
      last.y < frame.floorY - surfaceTolerance || last.y > frame.floorY + stepHeight) {
    fail('arrival-outside-pit-floor');
  }
  if (slide) {
    if (first.east >= frame.center.east || last.support !== 'dry-surface-gravel') fail('wrong-slide-entry-or-gravel-exit');
  } else {
    if (last.east <= frame.center.east) fail('arrival-not-on-east-side');
    if (run.blastDoor !== 'half-open') fail('half-open-gate-not-observed');
  }

  let horizontal = 0, maxRun = 0, peakGrade = 0, peakRise = 0, peakDrop = 0;
  let steepestEdge;
  let minWidth = Infinity, minHeadroom = Infinity, minLeft = Infinity, minRight = Infinity;
  const squeezes = new Set();
  const seenSideSteps = new Set();
  let previousSection;
  for (const [index, point] of feet.entries()) {
    if (point.cover !== cover || point.mode !== 'peace') fail('underground-or-wrong-well-state', index);
    if (inShaft(frame, point)) fail('route-enters-shaft-footprint', index);
    if (!Number.isFinite(point.supportY) || !Number.isFinite(point.renderY) ||
        Math.abs(point.y - point.supportY) > surfaceTolerance ||
        Math.abs(point.supportY - point.renderY) > surfaceTolerance) fail('unverified-visible-support', index);
    if (point.sweptClear !== true || point.relocated !== false) fail('obstructed-or-relocated', index);
    if (!Number.isInteger(point.tick) || !Number.isFinite(point.timeMs)) fail('invalid-step-clock', index);
    if (!slide) {
      if (![point.left, point.right, point.headroom].every(Number.isFinite) ||
          Math.min(point.left, point.right) <= bodyRadius || point.headroom <= bodyHeight - surfaceTolerance) {
        fail('insufficient-body-clearance', index);
      }
      minWidth = Math.min(minWidth, point.left + point.right);
      minLeft = Math.min(minLeft, point.left);
      minRight = Math.min(minRight, point.right);
      minHeadroom = Math.min(minHeadroom, point.headroom);
      const section = point.constriction;
      if (section !== undefined && !['string', 'number'].includes(typeof section)) fail('invalid-constriction', index);
      if (section !== undefined && section !== previousSection) {
        if (squeezes.has(section)) fail('noncontiguous-constriction', index);
        squeezes.add(section);
      }
      if (section !== undefined && point.movement === 'sidestep' && Number.isFinite(point.yaw) && index > 0) {
        const before = feet[index - 1];
        const east = point.east - before.east, north = point.north - before.north;
        const cosine = Math.cos(point.yaw), sine = Math.sin(point.yaw);
        const lateral = east * cosine - north * sine;
        const forward = east * sine + north * cosine;
        if (Math.abs(lateral) > Math.abs(forward)) seenSideSteps.add(section);
      }
      previousSection = section;
    }
    if (index === 0) continue;
    const previous = feet[index - 1];
    if (point.tick !== previous.tick + 1 || point.timeMs <= previous.timeMs) fail('nonconsecutive-step-clock', index);
    const span = length(previous, point);
    const dy = point.y - previous.y;
    horizontal += span;
    maxRun = Math.max(maxRun, span);
    peakRise = Math.max(peakRise, dy);
    peakDrop = Math.max(peakDrop, -dy);
    if (span === 0 && Math.abs(dy) > surfaceTolerance) fail('vertical-position-discontinuity', index);
    if (span > 0 && Math.abs(dy) / span > peakGrade) {
      peakGrade = Math.abs(dy) / span;
      steepestEdge = index;
    }
    if (slide && dy > surfaceTolerance) fail('slide-ascends', index);
    if (!slide && Math.abs(dy) > stepHeight) fail('corridor-exceeds-native-step', index);
    if (!slide && span > maximumWalkingStride + 1e-9) fail('corridor-exceeds-native-stride', index);
  }

  if (slide) {
    const reverse = run.reverseProbe;
    if (!reverse?.attempted || reverse.accepted !== false || !finite(reverse.from) || !finite(reverse.to) ||
        reverse.from.east >= frame.center.east || length(frame.center, reverse.from) > frame.floorRadius + bodyRadius ||
        length(reverse.from, last) > bodyRadius || Math.abs(reverse.from.y - last.y) > surfaceTolerance ||
        reverse.from.support !== 'dry-surface-gravel' ||
        reverse.from.cover !== cover || reverse.to.cover !== cover ||
        reverse.from.mode !== 'peace' || reverse.to.mode !== 'peace' ||
        length(reverse.from, reverse.to) > surfaceTolerance || Math.abs(reverse.from.y - reverse.to.y) > surfaceTolerance) {
      fail('one-way-return-not-proven');
    }
  } else if (squeezes.size !== 2 || seenSideSteps.size !== 2) {
    fail('two-distinct-sidesteps-not-proven');
  }
  return {
    route: kind, cover, samples: feet.length, startRadius: length(frame.center, first), endRadius: length(frame.center, last),
    horizontal, maxRun, peakGradePercent: 100 * peakGrade, steepestEdge, peakRise, peakDrop,
    elapsedMs: last.timeMs - first.timeMs,
    ...(!slide && { minWidth, minLeft, minRight, minHeadroom, constrictions: [...squeezes] }),
  };
}

export function auditU1SurfaceApproaches(evidence) {
  const { frame, routes } = evidence ?? {};
  if (!frame || !routes || !finite({ ...frame.center, y: frame.floorY }) ||
      !finite({ ...frame.shaft, y: frame.floorY }) ||
      !Number.isFinite(frame.floorRadius) || frame.floorRadius <= 0 ||
      !Number.isFinite(frame.shaft.radius) || frame.shaft.radius <= 0) {
    throw new TypeError('The measured crater-floor centre, radius, elevation and excluded shaft are required.');
  }
  const issues = [], measured = [];
  for (const kind of kinds) for (const cover of coverStates) {
    const result = verifyRoute(frame, kind, cover, routes[kind]?.[cover], issues);
    if (result) measured.push(result);
  }
  return { acceptanceReady: issues.length === 0, measured, issues };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const result = auditU1SurfaceApproaches(JSON.parse(await readFile(process.argv[2], 'utf8')));
    console.log(JSON.stringify(result, null, 2));
    if (!result.acceptanceReady) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
