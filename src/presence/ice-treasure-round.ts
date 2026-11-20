import { createIceTreasure } from '../shared/ice-treasure.js';

type Point = Readonly<{ east: number; north: number }>;
type TeamId = string | number;

type RoundHost<Team extends TeamId> = {
  pedestal: Point;
  pickupRadius: number;
  scoreRingRadius?: number;
  scoreRings: ReadonlyMap<Team, Point>;
  now(): number;
  // Only return a server-accepted skater on this rink, with their assigned team.
  acceptedSkater(id: number): (Point & { team: Team }) | undefined;
};

function finitePoint(point: Point) {
  return Number.isFinite(point.east) && Number.isFinite(point.north);
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.east - b.east, a.north - b.north);
}

export function createIceTreasureRound<Team extends TeamId>(host: RoundHost<Team>, mode: 'round' | 'free') {
  const { pedestal, pickupRadius, scoreRings, scoreRingRadius = 3 } = host;
  if (!finitePoint(pedestal) || !Number.isFinite(pickupRadius) || pickupRadius <= 0 ||
      !Number.isFinite(scoreRingRadius) || scoreRingRadius <= 0 ||
      [...scoreRings.values()].some(point => !finitePoint(point))) {
    throw new RangeError('Ice treasure requires finite rink anchors and a positive pickup radius');
  }
  const game = createIceTreasure<Team>(mode);
  let carrier: { id: number; team: Team; insideOwnRing: boolean } | undefined;

  function skater(id: number) {
    const accepted = host.acceptedSkater(id);
    if (!accepted || !finitePoint(accepted) || !scoreRings.has(accepted.team)) return;
    return accepted;
  }

  return {
    requestPickup(id: number) {
      const accepted = skater(id);
      const { treasure } = game.snapshot();
      if (!accepted || (treasure.phase !== 'available' && treasure.phase !== 'dropped')) return false;
      const pickupPoint = treasure.phase === 'available' ? pedestal : treasure.point;
      const time = host.now();
      if (distance(accepted, pickupPoint) > pickupRadius || !Number.isFinite(time) || !game.pickup(id, time)) {
        return false;
      }
      carrier = { id, team: accepted.team, insideOwnRing: distance(accepted, scoreRings.get(accepted.team)!) <= scoreRingRadius };
      return true;
    },

    // Invoke once after the presence server accepts and deduplicates a confirmed hit.
    confirmedSnowballHit(throwerId: number, targetId: number) {
      if (carrier?.id !== targetId || throwerId === targetId || !skater(throwerId)) return;
      const target = skater(targetId);
      const time = host.now();
      if (!target || target.team !== carrier.team || !Number.isFinite(time)) return;
      const hit = game.snowballHit(targetId, { east: target.east, north: target.north }, time);
      if (hit === 'drop') carrier = undefined;
      return hit;
    },

    // Invoke after a newly accepted move. The occupant must enter the circle while carrying.
    acceptedMove(id: number) {
      if (carrier?.id !== id) return;
      const accepted = skater(id);
      if (!accepted || accepted.team !== carrier.team) return;
      const insideNow = distance(accepted, scoreRings.get(carrier.team)!) <= scoreRingRadius;
      const crossed = !carrier.insideOwnRing && insideNow;
      carrier.insideOwnRing = insideNow;
      if (!crossed) return;
      const score = game.enterScoreRing(id, carrier.team, carrier.team);
      if (score) carrier = undefined;
      return score;
    },

    returnUnavailableCarrier(id: number) {
      if (carrier?.id !== id || !game.returnToPedestal(id)) return false;
      carrier = undefined;
      return true;
    },
    resetTreasureAfterScore: game.resetTreasure,
    snapshot: game.snapshot,
  };
}
