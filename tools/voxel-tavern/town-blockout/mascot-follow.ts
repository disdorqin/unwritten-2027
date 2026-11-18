export type MascotFollowPoint = { x: number; n: number; yaw: number; ground: number; speed: number; seated?: boolean; sliding?: boolean };
export type MascotAnchor = Pick<MascotFollowPoint, 'x' | 'n' | 'ground'>;
type WalkSample = (east: number, north: number, around: number) => number | undefined;
type Leader = Omit<MascotFollowPoint, 'seated' | 'sliding'> & {
  indoor: boolean; wet: boolean; skating: boolean; bathing: boolean; sitting?: boolean;
};
type Breadcrumb = MascotAnchor & { order: number };
type Mounted = MascotAnchor & Pick<MascotFollowPoint, 'yaw'>;

const rearAngle = Math.PI / 6;
const straight = [0] as const;
const steeringTurns = [-.5, .5, -1, 1, -1.5, 1.5] as const;
const landingTurns = [0, ...steeringTurns, Math.PI] as const;
const sampleStep = .2;

export function createMascotFollower(sampleGround: WalkSample) {
  let point: MascotFollowPoint | undefined;
  let indoor: boolean | undefined;
  let switchDelay = 0;
  let blockedSeconds = 0;
  let stillSeconds = 0;
  let aboard = false;
  const trail: Breadcrumb[] = [];
  let order = 0;
  let reached = 0;
  let waypoint: Breadcrumb | undefined;

  function clearTrail() {
    trail.length = 0;
    waypoint = undefined;
    reached = order;
  }

  function remember(leader: MascotAnchor) {
    const last = trail.at(-1);
    if (last && Math.hypot(last.x - leader.x, last.n - leader.n, last.ground - leader.ground) < .42) return;
    trail.push({ x: leader.x, n: leader.n, ground: leader.ground, order: ++order });
    if (trail.length > 80) trail.shift();
  }

  function land(leader: Leader) {
    for (const turn of landingTurns) {
      const direction = leader.yaw + rearAngle + turn;
      const x = leader.x - 1.6 * Math.sin(direction);
      const n = leader.n - 1.6 * Math.cos(direction);
      const ground = sampleGround(x, n, leader.ground);
      if (ground !== undefined) return { x, n, ground, yaw: leader.yaw, speed: 0 };
    }
  }

  function trace(from: MascotAnchor, to: MascotAnchor) {
    const distance = Math.hypot(to.x - from.x, to.n - from.n);
    if (distance > 4 || distance < .24) return false;
    const steps = Math.ceil(distance / sampleStep);
    let height = from.ground;
    for (let i = 1; i <= steps; i++) {
      const next = sampleGround(from.x + (to.x - from.x) * i / steps,
        from.n + (to.n - from.n) * i / steps, height);
      if (next === undefined) return false;
      height = next;
    }
    return Math.abs(height - to.ground) <= .43;
  }

  function hold(dt: number, maySit: boolean) {
    stillSeconds += dt;
    if (point) {
      point.speed = 0;
      if (maySit && stillSeconds >= 5) point.seated = true;
      else delete point.seated;
      delete point.sliding;
    }
    return point;
  }

  return {
    reset() {
      point = indoor = undefined;
      switchDelay = blockedSeconds = stillSeconds = 0;
      aboard = false;
      clearTrail();
    },
    update(leader: Leader, dt: number, mounted?: Mounted, bathEdge?: MascotAnchor) {
      if (mounted) {
        if (!aboard) clearTrail();
        aboard = true;
        indoor = leader.indoor;
        switchDelay = blockedSeconds = stillSeconds = 0;
        return point = { ...mounted, speed: 0, seated: true };
      }
      if (aboard) {
        aboard = false;
        point = undefined;
        clearTrail();
      }
      if (indoor !== leader.indoor) {
        switchDelay = indoor === undefined ? 0 : 1;
        indoor = leader.indoor;
        point = undefined;
        blockedSeconds = stillSeconds = 0;
        clearTrail();
      }
      if (switchDelay > 0) {
        switchDelay -= dt;
        return;
      }
      if (leader.wet || (leader.bathing && !bathEdge)) {
        point ??= land(leader);
        return hold(dt, true);
      }

      const dryLeader = bathEdge ?? leader;
      remember(dryLeader);
      const gap = point ? Math.hypot(point.x - dryLeader.x, point.n - dryLeader.n) : Infinity;
      if (!point || gap > 30 || blockedSeconds >= 4) {
        const next = bathEdge ? { ...bathEdge, yaw: leader.yaw, speed: 0 } : land(leader);
        if (next) {
          point = next;
          blockedSeconds = stillSeconds = 0;
          clearTrail();
          remember(dryLeader);
        }
        return point;
      }
      const direction = leader.yaw + rearAngle;
      const targetX = bathEdge?.x ?? leader.x - 1.6 * Math.sin(direction);
      const targetN = bathEdge?.n ?? leader.n - 1.6 * Math.cos(direction);
      if (bathEdge ? gap <= .22 : gap >= 1.2 && gap <= 2.5 && Math.hypot(targetX - point.x, targetN - point.n) <= .6) {
        blockedSeconds = 0;
        waypoint = undefined;
        return hold(dt, leader.bathing || leader.sitting === true);
      }
      const speed = leader.skating ? Math.min(4, Math.max(1.5, leader.speed))
        : gap > 8 ? 7.5 : Math.min(5.6, Math.max(1.5, leader.speed));
      const move = (x: number, n: number, turns: readonly number[]) => {
        if (!point) return false;
        let cursor = point;
        let travelled = 0;
        const budget = Math.min(Math.hypot(x - cursor.x, n - cursor.n), Math.max(0, dt * speed));
        // Keep the collision sampling interval fixed without slowing the actor on longer render frames.
        while (budget - travelled > .00001) {
          const distance = Math.min(budget - travelled, sampleStep, Math.hypot(x - cursor.x, n - cursor.n));
          if (distance < .00001) break;
          const bearing = Math.atan2(x - cursor.x, n - cursor.n);
          let moved = false;
          for (const turn of turns) {
            const yaw = bearing + turn;
            const nextX = cursor.x + distance * Math.sin(yaw);
            const nextN = cursor.n + distance * Math.cos(yaw);
            const ground = sampleGround(nextX, nextN, cursor.ground);
            if (ground === undefined) continue;
            cursor = { x: nextX, n: nextN, ground, yaw, speed: 0 };
            travelled += distance;
            moved = true;
            break;
          }
          if (!moved) break;
        }
        if (!travelled) return false;
        point = { ...cursor, speed: travelled / Math.max(dt, .001) };
        if (leader.skating) point.sliding = true;
        stillSeconds = 0;
        return true;
      };
      if (waypoint && Math.hypot(waypoint.x - point.x, waypoint.n - point.n) < .16) {
        reached = waypoint.order;
        waypoint = undefined;
      }
      if (!waypoint && move(targetX, targetN, straight)) {
        blockedSeconds = 0;
        return point;
      }
      if (!waypoint) {
        // When the preferred point is behind a wall, take the latest visible part of the owner's real path.
        for (let i = trail.length - 1; i >= 0 && trail[i].order > reached; i--) {
          if (!trace(point, trail[i])) continue;
          waypoint = trail[i];
          break;
        }
      }
      if (waypoint && move(waypoint.x, waypoint.n, straight)) {
        blockedSeconds = 0;
        return point;
      }
      waypoint = undefined;
      blockedSeconds += dt;
      return move(targetX, targetN, steeringTurns) ? point : hold(dt, false);
    },
  };
}
