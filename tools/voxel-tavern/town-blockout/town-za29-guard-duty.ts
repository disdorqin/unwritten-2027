type Foot = Readonly<{ east: number; north: number; height: number }>;
type GuardAnchors = Readonly<{ guard: Foot; approach: Foot }>;

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
const passageHalfWidth = 2;
const levelReach = 1.25;

export function createZa29GuardDuty(
  kind: keyof typeof guards,
  { guard, approach }: GuardAnchors,
  announce: (line: string) => void,
) {
  const post = guards[kind];
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
    return (point.east - approach.east) * post.east + (point.north - approach.north) * post.north;
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

  function blocksStep(from: Foot, to: Foot) {
    if (!present) return false;
    const before = along(from), after = along(to);
    if (before > 0 || after < 0 || after <= before) return false;
    const mix = -before / (after - before);
    const crossing = {
      east: from.east + (to.east - from.east) * mix,
      north: from.north + (to.north - from.north) * mix,
      height: from.height + (to.height - from.height) * mix,
    };
    // Check the real approach and guard at the swept crossing so a diagonal step
    // cannot mask a rush, while the rest of the domain needs no guard collision.
    if (!inReach(crossing, approach, passageHalfWidth) || !inReach(crossing, guard, guardReach)) return false;
    if (!stopped) {
      stopped = true;
      speak();
    }
    return true;
  }

  return { updateDuty, action, observeApproach, blocksStep };
}
