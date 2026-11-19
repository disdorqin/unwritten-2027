// 3.0 D2 漂移（任务书 §1 D2）：侧倾+转向进入漂移，漂移攒加速，松开分段释放。
// 纯状态机：viewer 每帧喂 {grounded, speed, turn, lateral}，模块回当前应施加的
// 额外加速度 boost（m/s²），由 sled-motion 在地面分支叠加；17 m/s 硬顶仍由
// sled-motion 的 factor 钳制保证，本模块不直接改速度。
// 与 sled-motion 内置的「刹车漂移松开 ×1.1」并存：内置项是底盘手感，本模块是
// D2 的可读攒放（充能条/分段释放），数值表见车道回执。
export const sledDriftChargeRate = .45; // /s，满充 ≈ 2.22 s
export const sledDriftDecayRate = .35; // /s，宽限 .5 s 后衰减
export const sledDriftDecayGraceSeconds = .5;
export const sledDriftMinSpeed = 5;
export const sledDriftMinTurn = .5;
export const sledDriftMinLateral = 1.2;

type DriftStage = { accel: number; seconds: number };
// 释放分段：充能越高段数越多，最强段先行。
// ≥.30 → 一段 2.6×.8s；≥.60 → 追加 3.2×.8s；≥.95 → 再前置 3.9×1.2s。
const stageTable: { threshold: number; stage: DriftStage }[] = [
  { threshold: .95, stage: { accel: 3.9, seconds: 1.2 } },
  { threshold: .60, stage: { accel: 3.2, seconds: .8 } },
  { threshold: .30, stage: { accel: 2.6, seconds: .8 } },
];

export type SledDriftCue = {
  grounded: boolean;
  speed: number;
  turn: number;
  lateral: number;
};

export function createSledDrift() {
  let charge = 0;
  let drifting = false;
  let idleSeconds = 0;
  let stages: DriftStage[] = [];
  let stageLeft = 0;

  function release() {
    stages = stageTable.filter(row => charge >= row.threshold).map(row => ({ ...row.stage }));
    stageLeft = stages.length ? stages[0].seconds : 0;
    charge = 0;
    idleSeconds = 0;
  }

  return {
    update(dt: number, cue: SledDriftCue) {
      if (!(dt > 0)) return { drifting, charge, boost: stages.length ? stages[0].accel : 0 };
      const inDrift = cue.grounded && cue.speed >= sledDriftMinSpeed &&
        Math.abs(cue.turn) >= sledDriftMinTurn && Math.abs(cue.lateral) >= sledDriftMinLateral;
      if (inDrift) {
        if (!drifting) { stages = []; stageLeft = 0; } // 重新入漂移取消未放完的段
        drifting = true;
        idleSeconds = 0;
        charge = Math.min(1, charge + dt * sledDriftChargeRate);
        return { drifting, charge, boost: 0 };
      }
      if (drifting) {
        drifting = false;
        if (charge >= stageTable[stageTable.length - 1].threshold) release();
      }
      let boost = 0;
      if (stages.length) {
        boost = stages[0].accel;
        stageLeft -= dt;
        if (stageLeft <= 0) {
          stages.shift();
          stageLeft = stages.length ? stages[0].seconds : 0;
        }
      } else if (charge > 0) {
        idleSeconds += dt;
        if (idleSeconds > sledDriftDecayGraceSeconds) {
          charge = Math.max(0, charge - dt * sledDriftDecayRate);
        }
      }
      return { drifting, charge, boost };
    },
    /** 撞毁/打断：充能与未放完的段全部清零。 */
    reset() {
      charge = 0;
      drifting = false;
      idleSeconds = 0;
      stages = [];
      stageLeft = 0;
    },
    charge: () => charge,
    drifting: () => drifting,
    boosting: () => stages.length > 0,
    stageCount: () => stages.length,
  };
}

export type SledDrift = ReturnType<typeof createSledDrift>;
