import type { TownNightWindowState } from '../../../src/shared/town-night-window';
import { summitAssemblyAnchor } from './main-summit-assembly';
import { mainSummitLayout } from './main-summit-block';
import { za22GateSeamNorth } from './town-za22-mountain-gate';
import type { Za29GuardDuty } from './town-za29-guard-scenes';

type Foot = Readonly<{ east: number; north: number; height: number }>;
type GuardAnchors = Readonly<{ guard: Foot; approach: Foot }>;

const mountainAperture = {
  east: summitAssemblyAnchor.east,
  north: za22GateSeamNorth,
  halfWidth: mainSummitLayout.gate.clearWidth / 2,
  heightReach: 1.4,
};

// ZB-28 rewrite (branch window B, against the current trunk API): the
// crater post's interception window is the REAL fence opening, not a
// generic disc. The fence stands at lip.east + 1 (town-za22-crater-road:
// fenceEast, measured on this trunk as east −70.5335 at the seam), its
// two rails sit at lip.north ± 3.25 and each covers 1.18 of half-length
// (fenceBlocks), leaving a clear opening of half-width 3.25 − 1.18 =
// 2.07 centred on the seam north — the same north the scene's approach
// anchor sits on (za29GuardSurvey.crater.approach). The guard still
// intercepts in person at his approach line; the opening only bounds
// where he can be doing it.
const craterOpeningHalfWidth = 3.25 - 1.18;
const craterHeightReach = 1.4;

const guards = {
  mountain: {
    label: '与赵满仓交谈',
    line: '吃点，吃点再走，山上风大。',
    east: 0,
    north: 1,
  },
  crater: {
    label: '与石九斤交谈',
    line: '井口的规矩，比命大。',
    east: -1,
    north: 0,
  },
} as const;

const guardReach = 4.5;
const approachReach = 3.5;
const levelReach = 1.25;

/**
 * ZB-28 phase mapping — the single source both posts share (the viewer
 * must not re-derive this inline). Day, or no window known yet: guard
 * on post, no night signs. Awaiting-beacon (dusk, the thirteenth bell
 * not yet heard): the guard has gone home — empty post, and the night
 * signs (empty-post scuffs, soul footprints) are NOT up yet. Night
 * window: empty post plus night signs. Entry is never blocked by the
 * phase itself — only by a present guard (拦截一律由人执行).
 */
export function za29GuardDutyForPhase(
  phase: TownNightWindowState['phase'] | undefined,
): Za29GuardDuty {
  return {
    guardPresent: phase === undefined || phase === 'day',
    showNightSigns: phase === 'night-window',
  };
}

export function createZa29GuardDuty(
  kind: keyof typeof guards,
  { guard, approach }: GuardAnchors,
  announce: (line: string) => void,
) {
  const post = guards[kind];
  const aperture = kind === 'mountain' ? mountainAperture : undefined;
  const approachLine = aperture ?? approach;
  let present = false;
  let greeted = false;
  let stopped = false;

  function updateDuty(guardPresent: boolean) {
    if (present === guardPresent) return;
    present = guardPresent;
    greeted = stopped = false;
  }

  function inReach(point: Foot, anchor: Foot, reach: number) {
    return Math.abs(point.height - anchor.height) <= levelReach &&
      Math.hypot(point.east - anchor.east, point.north - anchor.north) <= reach;
  }

  function along(point: Foot) {
    return (point.east - approachLine.east) * post.east + (point.north - approachLine.north) * post.north;
  }

  const speak = () => { if (present) announce(post.line); };
  const conversation = { label: post.label, run: speak };

  function action(position: Foot) {
    if (present && inReach(position, guard, guardReach)) return conversation;
  }

  function observeApproach(position: Foot) {
    const nearApproach = present && along(position) <= 0 &&
      inReach(position, approach, approachReach) && inReach(position, guard, guardReach);
    if (!nearApproach) {
      greeted = stopped = false;
    } else if (!greeted) {
      greeted = true;
      speak();
    }
  }

  function interceptsStep(from: Foot, to: Foot) {
    if (!present) return false;
    const before = along(from), after = along(to);
    if (before > 0 || after < 0 || after <= before) return false;
    const mix = -before / (after - before);
    const crossing = {
      east: from.east + (to.east - from.east) * mix,
      north: from.north + (to.north - from.north) * mix,
      height: from.height + (to.height - from.height) * mix,
    };
    if (!aperture) {
      // Crater: the crossing must fall inside the fence opening's slot
      // (centred on the approach/seam north) within the jump envelope.
      const lateral = Math.abs(crossing.north - approach.north);
      return lateral <= craterOpeningHalfWidth &&
        Math.abs(crossing.height - approach.height) <= craterHeightReach &&
        inReach(crossing, guard, guardReach);
    }
    // The gate width and ordinary jump envelope bound a real crossing; nearby levels stay open.
    const lateral = (crossing.east - aperture.east) * post.north - (crossing.north - aperture.north) * post.east;
    return Math.abs(lateral) <= aperture.halfWidth && Math.abs(crossing.height - approach.height) <= aperture.heightReach;
  }

  function blocksStep(from: Foot, to: Foot) {
    if (!interceptsStep(from, to)) return false;
    if (!stopped) {
      stopped = true;
      speak();
    }
    return true;
  }

  return { updateDuty, action, observeApproach, interceptsStep, blocksStep };
}
