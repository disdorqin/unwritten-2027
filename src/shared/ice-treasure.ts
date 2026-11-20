// 镜湖 §2。事件由调用方确认，状态只处理玩法，不解析在线消息或场地坐标。
export const iceTreasureHitsToDrop = 2;
export const iceTreasurePickupDelayMs = 3_000;
export const iceTreasurePointsToWin = 3;
export const iceTreasureTurnRadiusMultiplier = 1.5;
export const iceTreasureDeliveryGateCount = 5;

type PlayerId = number;
type TeamId = string | number;
type IcePoint = { east: number; north: number };

type Treasure =
  | { phase: 'available' }
  | { phase: 'carried'; player: PlayerId; snowballHits: number }
  | { phase: 'dropped'; point: IcePoint; pickableAt: number }
  | { phase: 'awaiting-reset' };

export function treasureTurnRadius(baseRadius: number, carrying: boolean) {
  return carrying ? baseRadius * iceTreasureTurnRadiusMultiplier : baseRadius;
}

export function createIceTreasure<Team extends TeamId>(mode: 'round' | 'free') {
  let treasure: Treasure = { phase: 'available' };
  let winner: Team | undefined;
  const scores = new Map<Team, number>();

  return {
    /** 距离与场地检查由拾取入口完成。 */
    pickup(player: PlayerId, now: number) {
      const canPickUp = treasure.phase === 'available' ||
        (treasure.phase === 'dropped' && now >= treasure.pickableAt);
      if (!canPickUp || winner !== undefined) return false;
      treasure = { phase: 'carried', player, snowballHits: 0 };
      return true;
    },
    /** 只接既有权威链已确认、去重的雪球命中。 */
    snowballHit(target: PlayerId, point: IcePoint, now: number) {
      if (treasure.phase !== 'carried' || treasure.player !== target) return undefined;
      const snowballHits = treasure.snowballHits + 1;
      if (snowballHits < iceTreasureHitsToDrop) {
        treasure = { ...treasure, snowballHits };
        return 'hit';
      }
      treasure = { phase: 'dropped', point: { ...point }, pickableAt: now + iceTreasurePickupDelayMs };
      return 'drop';
    },
    /** 队员归属与冰面圈进入事实由调用方确认。 */
    enterScoreRing(player: PlayerId, playerTeam: Team | undefined, ringTeam: Team) {
      if (winner !== undefined || treasure.phase !== 'carried' ||
          treasure.player !== player || playerTeam !== ringTeam) return undefined;
      const score = (scores.get(ringTeam) ?? 0) + 1;
      scores.set(ringTeam, score);
      treasure = { phase: 'awaiting-reset' };
      if (mode === 'round' && score === iceTreasurePointsToWin) winner = ringTeam;
      return { score, winner };
    },
    /** 结算后等待调用方完成复位，避免留在圈内重复得分。 */
    resetTreasure() {
      if (winner !== undefined || treasure.phase !== 'awaiting-reset') return false;
      treasure = { phase: 'available' };
      return true;
    },
    snapshot() {
      return {
        treasure: treasure.phase === 'dropped' ? { ...treasure, point: { ...treasure.point } } : { ...treasure },
        scores: new Map(scores),
        winner,
      };
    },
  };
}

export function createIceTreasureDelivery(now: () => number) {
  let startedAt: number | undefined;
  let passedGates = 0;

  return {
    /** 起计由接到抱宝物状态的调用方触发。 */
    start(carrying: boolean) {
      if (startedAt !== undefined || !carrying) return false;
      startedAt = now();
      passedGates = 0;
      return true;
    },
    passGate(gate: number, carrying: boolean) {
      if (startedAt === undefined || !carrying ||
          passedGates >= iceTreasureDeliveryGateCount || gate !== passedGates + 1) return false;
      passedGates++;
      return true;
    },
    returnToRing(carrying: boolean) {
      if (startedAt === undefined || !carrying || passedGates !== iceTreasureDeliveryGateCount) return undefined;
      const elapsedMs = Math.round(now() - startedAt);
      startedAt = undefined;
      return elapsedMs;
    },
    cancel() { startedAt = undefined; passedGates = 0; },
    passedGates: () => passedGates,
  };
}
