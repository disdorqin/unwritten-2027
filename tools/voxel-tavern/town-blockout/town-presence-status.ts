/**
 * 联机状态机（3.0 S1/S2 客户端）：把 presence 连接过程变成可见状态，
 * 取代旧的「失败静默退回单人模式」。纯逻辑、无 DOM，town-presence.ts 负责接线显示。
 *
 * 四步自检（S2）：1 页面（客户端发起连接）→ 2 握手（WebSocket 打开）
 * → 3 首帧（收到服务器入镇确认）→ 4 心跳（收到首个状态快照帧）。
 * 失败短码按「断在哪一步」给出：
 *   PG-1 页面步：连接尚未发起即失败（WebSocket 构造抛错等）
 *   WS-2 握手步：连接在打开前失败/超时（长连接被网络拦截的典型表现）
 *   FR-3 首帧步：连接已打开，但入镇确认未在超时内到达，或在此步断开
 *   HB-4 心跳步：已入镇，但首个状态帧到达前断开；或同步完成后连接中断
 * 'fallback' 相位为 S3 备用通道（HTTPS 轮询）预留，本版不进入。
 */

export type PresenceLinkPhase = 'off' | 'connecting' | 'online' | 'retrying' | 'fallback';

export interface PresenceLinkSnapshot {
  phase: PresenceLinkPhase;
  /** 已完成到的自检步（0–4）。 */
  step: number;
  /** 当前显示人数（含自己）；未入镇时为 0。 */
  people: number;
  /** 最近一次失败短码（PG-1 / WS-2 / FR-3 / HB-4）；无失败或已恢复时为 null。 */
  fault: string | null;
}

const faultByStep: readonly string[] = ['PG-1', 'WS-2', 'FR-3', 'HB-4', 'HB-4'];

export function faultCodeForStep(completedStep: number): string {
  return faultByStep[Math.max(0, Math.min(4, Math.floor(completedStep)))]!;
}

export function presenceLinkText(snapshot: PresenceLinkSnapshot): string {
  switch (snapshot.phase) {
    case 'online': return `已连接 · ${snapshot.people} 人`;
    case 'fallback': return `备用通道 · ${snapshot.people} 人`;
    case 'connecting': return '连接中…';
    case 'retrying': return snapshot.fault ? `未连接 · 自动重试中（${snapshot.fault}）` : '未连接 · 自动重试中';
    default: return '单人模式';
  }
}

export function createPresenceLinkStatus(onChange: (snapshot: PresenceLinkSnapshot) => void = () => {}) {
  let phase: PresenceLinkPhase = 'off';
  let step = 0;
  let people = 0;
  let fault: string | null = null;

  function snapshot(): PresenceLinkSnapshot {
    return { phase, step, people, fault };
  }
  function emit() { onChange(snapshot()); }

  return {
    snapshot,
    text: () => presenceLinkText(snapshot()),
    /** 进入小镇，开始一轮连接流程（步 0 → 等待发起）。 */
    enterTown() {
      if (phase !== 'off') return;
      phase = 'connecting';
      step = 0;
      fault = null;
      emit();
    },
    /** 离开小镇：回到单人模式，明示但不报错。 */
    leaveTown() {
      if (phase === 'off') return;
      phase = 'off';
      step = 0;
      people = 0;
      fault = null;
      emit();
    },
    /** 一次连接尝试已发起（WebSocket 已构造、正在拨号）→ 步 1 完成。 */
    attemptStarted() {
      phase = 'connecting';
      step = 1;
      fault = null;
      emit();
    },
    /** WebSocket 打开 → 步 2 完成。 */
    socketOpened() {
      if (phase !== 'connecting') return;
      step = Math.max(step, 2);
      emit();
    },
    /** 收到服务器入镇确认（首帧）→ 步 3 完成，进入已连接。 */
    joined(count: number) {
      phase = 'online';
      step = Math.max(step, 3);
      people = count;
      fault = null;
      emit();
    },
    /** 收到首个状态快照帧 → 步 4 完成（心跳建立）。 */
    firstFrame() {
      if (phase !== 'online' || step >= 4) return;
      step = 4;
      emit();
    },
    /** 在线人数变化（有人进/离镇）时刷新显示。 */
    setPeople(count: number) {
      if (count === people) return;
      people = count;
      if (phase === 'online' || phase === 'fallback') emit();
    },
    /**
     * 连接失败或中断：按已完成的步数定短码，转入「未连接 · 自动重试中」。
     * 已离开小镇（off）时不报错，保持单人模式。
     */
    failed() {
      if (phase === 'off') return;
      fault = faultCodeForStep(step);
      phase = 'retrying';
      people = 0;
      emit();
    },
    /** S3 预留：切到备用通道（HTTPS 轮询）后调用，本版无调用点。 */
    useFallback(count: number) {
      phase = 'fallback';
      people = count;
      fault = null;
      emit();
    },
  };
}

export type PresenceLinkStatus = ReturnType<typeof createPresenceLinkStatus>;
