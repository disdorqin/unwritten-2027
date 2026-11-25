export type MineCartPoint = Readonly<{ east: number; north: number; height: number }>;
export type MineCartStep = 0 | 1 | 2;
export type MineCartDirection = -1 | 1;
export type MineCartSnapshot = Readonly<{ step: MineCartStep; revision: number }>;
export type MineCartPush = Readonly<{ direction: MineCartDirection; revision: number }>;

type TrackOptions = Readonly<{ start: MineCartPoint; end: MineCartPoint; approachOffset: number }>;

/** Surveyed on the original mine geometry. Registration in the live domain still needs its transform. */
export const undergroundMineCartLocalTrack = {
  start: { east: 0, north: -16, height: -90.20 },
  end: { east: 0, north: -17.4, height: -90.27 },
  approachOffset: 1.12,
} as const satisfies TrackOptions;

/** Two short pushes along a surveyed straight stretch. Coordinates use the host's ENY frame. */
export function createUndergroundMineCartTrack({ start, end, approachOffset }: TrackOptions) {
  const first = { ...start };
  const east = end.east - first.east;
  const north = end.north - first.north;
  const rise = end.height - first.height;
  const horizontal = Math.hypot(east, north);
  const length = Math.hypot(horizontal, rise);
  if (![first.east, first.north, first.height, length, approachOffset].every(Number.isFinite) ||
      horizontal === 0 || approachOffset <= 0) {
    throw new RangeError('The mine cart needs a finite, straight rail and accessible approach offset');
  }

  function localPoint(fraction: number): MineCartPoint {
    return {
      east: first.east + east * fraction,
      north: first.north + north * fraction,
      height: first.height + rise * fraction,
    };
  }
  return {
    length,
    heading: Math.atan2(-east, north),
    slope: Math.atan2(rise, horizontal),
    point: (step: number) => localPoint(step / 2),
    approach: (step: MineCartStep, direction: MineCartDirection) =>
      localPoint(step / 2 - direction * approachOffset / horizontal),
  };
}

export type UndergroundMineCartTrack = ReturnType<typeof createUndergroundMineCartTrack>;

export function nextMineCartStep(step: MineCartStep, direction: MineCartDirection): MineCartStep | undefined {
  const next = step + direction;
  if ((direction === 1 || direction === -1) && (next === 0 || next === 1 || next === 2)) return next;
}

export function isMineCartSnapshot(state: MineCartSnapshot): boolean {
  return (state.step === 0 || state.step === 1 || state.step === 2) &&
    Number.isSafeInteger(state.revision) && state.revision >= 0;
}
