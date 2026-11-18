export type MascotFollowPoint = { x: number; n: number; yaw: number; ground: number; speed: number };
type WalkSample = (east: number, north: number, around: number) => number | undefined;
type Leader = Omit<MascotFollowPoint, 'speed'> & {
  speed: number; indoor: boolean; wet: boolean; skating: boolean; bathing: boolean;
};

const rearAngle = Math.PI / 6;
const candidates = [0, -.5, .5, -1, 1, -1.5, 1.5, Math.PI] as const;

export function createMascotFollower(sampleGround: WalkSample) {
  let point: MascotFollowPoint | undefined;
  let indoor: boolean | undefined;
  let switchDelay = 0;
  let blockedSeconds = 0;

  function land(leader: Leader) {
    for (const turn of candidates) {
      const direction = leader.yaw + rearAngle + turn;
      const x = leader.x - 1.6 * Math.sin(direction);
      const n = leader.n - 1.6 * Math.cos(direction);
      const ground = sampleGround(x, n, leader.ground);
      if (ground !== undefined) return { x, n, ground, yaw: leader.yaw, speed: 0 };
    }
  }

  return {
    reset() {
      point = indoor = undefined;
      switchDelay = blockedSeconds = 0;
    },
    update(leader: Leader, dt: number, mounted?: Omit<MascotFollowPoint, 'speed'>) {
      if (mounted) {
        indoor = leader.indoor;
        switchDelay = blockedSeconds = 0;
        return point = { ...mounted, speed: 0 };
      }
      if (indoor !== leader.indoor) {
        switchDelay = indoor === undefined ? 0 : 1;
        indoor = leader.indoor;
        point = undefined;
        blockedSeconds = 0;
      }
      if (switchDelay > 0) {
        switchDelay -= dt;
        return;
      }
      if (leader.wet || leader.bathing) {
        if (point) point.speed = 0;
        else point = land(leader);
        return point;
      }
      const gap = point ? Math.hypot(point.x - leader.x, point.n - leader.n) : Infinity;
      if (!point || gap > 30 || blockedSeconds >= 4) {
        const next = land(leader);
        if (next) { point = next; blockedSeconds = 0; }
        return point;
      }
      const direction = leader.yaw + rearAngle;
      const targetX = leader.x - 1.6 * Math.sin(direction);
      const targetN = leader.n - 1.6 * Math.cos(direction);
      const remaining = Math.hypot(targetX - point.x, targetN - point.n);
      if (gap >= 1.2 && gap <= 2.5 && remaining <= .6) {
        blockedSeconds = 0;
        point.speed = 0;
        return point;
      }
      const speed = leader.skating ? Math.min(4, Math.max(1.5, leader.speed))
        : gap > 8 ? 7.5 : Math.min(5.6, Math.max(1.5, leader.speed));
      const step = Math.min(remaining, dt * speed, .20);
      const bearing = Math.atan2(targetX - point.x, targetN - point.n);
      for (const turn of candidates.slice(0, -1)) {
        const yaw = bearing + turn;
        const x = point.x + step * Math.sin(yaw);
        const n = point.n + step * Math.cos(yaw);
        const ground = sampleGround(x, n, point.ground);
        if (ground === undefined) continue;
        point = { x, n, ground, yaw, speed: step / Math.max(dt, .001) };
        blockedSeconds = turn === 0 ? 0 : blockedSeconds + dt;
        return point;
      }
      blockedSeconds += dt;
      point.speed = 0;
      return point;
    },
  };
}
