type HorizontalFoot = Readonly<{ layer: string; east: number; north: number }>;

const travelByWeight = { light: .22, medium: .46, heavy: .86 } as const;
const maxStep = .05;
export type UndergroundKnockbackWeight = keyof typeof travelByWeight;

/** Send an accepted impact through the active body's ordinary movement and collision checks. */
export function applyUndergroundKnockback(options: Readonly<{
  from: HorizontalFoot;
  weight: UndergroundKnockbackWeight;
  /** An unavailable or immovable body has no eligible foot. */
  readFoot(): HorizontalFoot | undefined;
  /** Accept and commit this horizontal step using the body's existing shape and support. */
  tryMove(next: HorizontalFoot): boolean;
}>) {
  const { from, weight, readFoot, tryMove } = options;
  const foot = readFoot();
  if (!foot?.layer || foot.layer !== from.layer || !Object.hasOwn(travelByWeight, weight) ||
      ![foot.east, foot.north, from.east, from.north].every(Number.isFinite)) return;
  const { east, north, layer } = foot;
  const dx = east - from.east;
  const dn = north - from.north;
  const length = Math.hypot(dx, dn);
  if (!Number.isFinite(length) || length <= 1e-6) return;

  const travel = travelByWeight[weight];
  const count = Math.ceil(travel / maxStep);
  const step = travel / count;
  for (let index = 1; index <= count; index++) {
    const distance = index * step;
    if (!tryMove({ layer, east: east + distance * (dx / length), north: north + distance * (dn / length) })) {
      return { distance: (index - 1) * step, blocked: true };
    }
  }
  return { distance: travel, blocked: false };
}
