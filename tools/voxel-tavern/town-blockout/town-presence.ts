import type { PerspectiveCamera, Scene } from 'three';
import {
  decodeSnowballEvents, encodeSnowballHit, encodeSnowballThrow, SNOWBALL_EVENT_PREFIX,
  type SnowballHit, type SnowballRelayEvent, type SnowballThrow,
} from '../../../src/presence/snowball-events';
import { createPresenceAvatars } from './town-presence-avatars';
import {
  presenceRecordBytes, pushPresenceSample, samplePresencePose, visitPresenceSnapshot, writePresencePose,
  type PresencePose, type PresenceSample,
} from './town-presence-motion';

import { isTownAvatarPose, type TownAvatarPose } from './town-presence-pose';

type Actor = PresencePose & {
  id: number; name: string; history: PresenceSample[]; seen: number; throwGestureStarted?: number;
  pose: TownAvatarPose; stepPhase: number; stride: number;
};

type TownNotice = { kind: 'announce'; message: string }
  | { kind: 'test-fireworks'; seed: number; startAt: number };
const queuedEventLimit = 128;
const eventFrameLimit = 20;
const eventFrameBudgetMs = 0.2;

const sampleInterval = .1;
const retryDelays = [1000, 2000, 5000, 10000, 30000] as const;
const maximumBufferedBytes = 1024;
const guestNameKey = 'unwritten.presence.name.v1';

function presenceName() {
  const input = document.querySelector<HTMLInputElement>('#town-presence-name');
  const guest = `小镇游客${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
  const normalize = (value: string) => [...value.replace(/[\p{Cc}\p{Cf}\p{Cs}]/gu, '').trim()].slice(0, 24).join('');
  let name = '';
  try { name = normalize(localStorage.getItem(guestNameKey) ?? ''); } catch { /* Storage is optional. */ }
  if (input) {
    input.value = name;
    const save = () => {
      const cleaned = input.value.replace(/[\p{Cc}\p{Cf}\p{Cs}]/gu, '');
      const chars = [...cleaned];
      if (chars.length > 24 || cleaned !== input.value) input.value = chars.slice(0, 24).join('');
      name = normalize(input.value);
      try {
        if (name) localStorage.setItem(guestNameKey, name);
        else localStorage.removeItem(guestNameKey);
      } catch { /* Keep using the current page's name. */ }
    };
    input.addEventListener('input', event => { if (!(event as InputEvent).isComposing) save(); });
    input.addEventListener('compositionend', save);
    input.addEventListener('change', () => { save(); input.value = name; });
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.isComposing) input.blur();
    });
  }
  return () => name || guest;
}

export function createTownPresence(scene: Scene, camera: PerspectiveCamera, announce: (message: string) => void) {
  const getName = presenceName();
  const status = document.getElementById('town-presence-status');
  const local: PresencePose = { east: 0, north: 0, height: 0, yaw: 0 };
  const outgoing = new DataView(new ArrayBuffer(presenceRecordBytes));
  const roster = new Map<number, string>();
  const actors = new Map<number, Actor>();
  const renderList: Actor[] = [];
  const remoteActivityPoses = new Map<number, TownAvatarPose>();
  const pendingActivityPoses = new Map<number, TownAvatarPose>();
  let activityPose: TownAvatarPose = 0;
  let sentActivityPose: TownAvatarPose | undefined;
  const snowballEvents: SnowballRelayEvent[] = [];
  const notices: TownNotice[] = [];
  let onSnowballEvent: ((event: SnowballRelayEvent) => void) | undefined;
  let onTestFireworks: ((seed: number, ageSeconds: number) => void) | undefined;
  let joinedId: number | null = null;
  let joinedName: string | undefined;
  let serverEpochOffset: number | undefined;
  let avatars: ReturnType<typeof createPresenceAvatars> | undefined;
  let socket: WebSocket | undefined;
  let timeout: number | undefined;
  let retryTimer: number | undefined;
  let retryAt: number | undefined;
  let retryIndex = 0;
  let inTown = false;
  let show = false;
  let haveId = false;
  let epoch = 0;
  let seq = 0;
  let remaining = 0;
  let lastPosition = -1;
  let lastHeightYaw = -1;
  let moving = false;

  function updateStatus() {
    if (!status) return;
    const text = haveId ? `同镇 ${roster.size + 1} 人` : socket ? '连接中…' : '单人模式';
    if (status.textContent !== text) status.textContent = text;
  }

  function cancelRetryTimer() {
    if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    retryTimer = undefined;
  }

  function resetRetry() {
    cancelRetryTimer();
    retryAt = undefined;
    retryIndex = 0;
  }

  function scheduleConnection() {
    if (!inTown || socket || retryTimer !== undefined || document.visibilityState !== 'visible') return;
    if (retryAt === undefined) {
      connect();
      return;
    }
    retryTimer = window.setTimeout(() => {
      retryTimer = undefined;
      if (!inTown || socket || document.visibilityState !== 'visible') return;
      retryAt = undefined;
      connect();
    }, Math.max(0, retryAt - performance.now()));
  }

  function connectionLost() {
    disconnect(false);
    if (!inTown) return;
    retryAt = performance.now() + retryDelays[retryIndex];
    retryIndex = Math.min(retryIndex + 1, retryDelays.length - 1);
    scheduleConnection();
  }

  function disconnect(graceful: boolean) {
    if (timeout !== undefined) window.clearTimeout(timeout);
    timeout = undefined;
    const active = socket;
    socket = undefined;
    haveId = false;
    joinedId = null;
    joinedName = undefined;
    serverEpochOffset = undefined;
    snowballEvents.length = 0;
    notices.length = 0;
    roster.clear();
    actors.clear();
    renderList.length = 0;
    sentActivityPose = undefined;
    remoteActivityPoses.clear();
    pendingActivityPoses.clear();
    avatars?.clear();
    updateStatus();
    if (active) {
      try {
        if (graceful && active.readyState === WebSocket.OPEN) active.send(JSON.stringify({ type: 'leave' }));
        active.close();
      } catch { /* A connection failure leaves the local viewer untouched. */ }
    }
  }

  function receive(data: unknown) {
    if (typeof data === 'string') {
      let message: {
        type?: string; id?: number; name?: string; self?: boolean; epochMs?: number;
        kind?: string; message?: string; seed?: number; startAt?: number; pose?: unknown;
      };
      try { message = JSON.parse(data); } catch { return; }
      if (!message) return;
      if (haveId && message.type === 'event') {
        if (notices.length >= 8) return;
        if (message.kind === 'announce' && typeof message.message === 'string') {
          notices.push({ kind: 'announce', message: message.message });
        } else if (message.kind === 'test-fireworks' && Number.isInteger(message.seed) &&
          typeof message.startAt === 'number' && Number.isFinite(message.startAt)) {
          notices.push({ kind: 'test-fireworks', seed: message.seed!, startAt: message.startAt });
        }
        return;
      }
      if (!Number.isInteger(message.id) || message.id! < 1 || message.id! > 65535) return;
      const id = message.id!;
      if (message.type === 'join' && typeof message.name === 'string') {
        if (message.self) {
          haveId = true;
          joinedId = id;
          joinedName = message.name;
          if (typeof message.epochMs === 'number' && Number.isFinite(message.epochMs)) {
            serverEpochOffset = message.epochMs - performance.now();
          }
          resetRetry();
          if (timeout !== undefined) window.clearTimeout(timeout);
          timeout = undefined;
          lastPosition = lastHeightYaw = -1;
          moving = false;
          remaining = 0;
        } else if (!roster.has(id) && roster.size < 64) {
          roster.set(id, message.name);
          if (isTownAvatarPose(message.pose)) pendingActivityPoses.set(id, message.pose);
          announce(`${message.name} 进镇了`);
        }
      } else if (message.type === 'pose' && roster.has(id) && isTownAvatarPose(message.pose)) {
        pendingActivityPoses.set(id, message.pose);
      } else if (message.type === 'leave') {
        const name = roster.get(id);
        pendingActivityPoses.delete(id);
        remoteActivityPoses.delete(id);
        roster.delete(id);
        actors.delete(id);
        if (name) announce(`${name} 离镇了`);
      }
      updateStatus();
      return;
    }
    if (!haveId || !(data instanceof ArrayBuffer)) return;
    if (new Uint8Array(data, 0, Math.min(1, data.byteLength))[0] === SNOWBALL_EVENT_PREFIX) {
      if (snowballEvents.length >= queuedEventLimit) return;
      const events = decodeSnowballEvents(data);
      if (events) {
        for (const event of events) {
          if (snowballEvents.length >= queuedEventLimit) break;
          snowballEvents.push(event);
        }
      }
      return;
    }
    const stamp = ++epoch;
    const time = performance.now();
    const valid = visitPresenceSnapshot(data, (id, east, north, height, yaw, sequence) => {
      const name = roster.get(id);
      if (name === undefined) return;
      let actor = actors.get(id);
      if (!actor) {
        actor = { id, name, east, north, height, yaw, history: [], seen: stamp,
          pose: remoteActivityPoses.get(id) ?? 0, stepPhase: 0, stride: 0 };
        actors.set(id, actor);
      }
      actor.seen = stamp;
      pushPresenceSample(actor.history, { east, north, height, yaw, seq: sequence, time });
    });
    if (valid) for (const actor of actors.values()) if (actor.seen !== stamp) actors.delete(actor.id);
  }

  function connect() {
    try {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${location.host}/presence`);
      socket = ws;
      ws.binaryType = 'arraybuffer';
      updateStatus();
      timeout = window.setTimeout(() => { if (socket === ws) connectionLost(); }, 3000);
      ws.onopen = () => {
        if (socket === ws) {
          try { ws.send(JSON.stringify({ type: 'join', name: getName() })); }
          catch { connectionLost(); }
        }
      };
      ws.onmessage = event => { if (socket === ws) receive(event.data); };
      ws.onerror = ws.onclose = () => { if (socket === ws) connectionLost(); };
    } catch { connectionLost(); }
  }

  function sendPose(dt: number) {
    const active = socket;
    if (!haveId || active?.readyState !== WebSocket.OPEN) return;
    remaining -= dt;
    if (remaining > 0 || active.bufferedAmount > maximumBufferedBytes) return;
    remaining = remaining > -sampleInterval ? remaining + sampleInterval : sampleInterval;
    writePresencePose(local, seq, outgoing);
    const position = outgoing.getUint32(2, true);
    const heightYaw = outgoing.getUint32(6, true);
    const changed = position !== lastPosition || heightYaw !== lastHeightYaw;
    if (!changed && !moving) return;
    // Send one terminal pose at the moving → stationary edge so peers stop extrapolating.
    try { active.send(outgoing.buffer); }
    catch { connectionLost(); return; }
    seq = (seq + 1) & 65535;
    moving = changed && lastPosition !== -1;
    lastPosition = position;
    lastHeightYaw = heightYaw;
  }

  function sendEvent(bytes: string | Uint8Array) {
    const active = socket;
    if (!haveId || active?.readyState !== WebSocket.OPEN || active.bufferedAmount > maximumBufferedBytes) return false;
    try { active.send(bytes); return true; }
    catch { connectionLost(); return false; }
  }

  function syncActivityPoses() {
    if (haveId && sentActivityPose !== activityPose && sendEvent(JSON.stringify({ type: 'pose', pose: activityPose }))) {
      sentActivityPose = activityPose;
    }
    for (const [id, pose] of pendingActivityPoses) {
      remoteActivityPoses.set(id, pose);
      const actor = actors.get(id);
      if (actor) actor.pose = pose;
    }
    pendingActivityPoses.clear();
  }

  function drainEvents() {
    for (const notice of notices) {
      if (notice.kind === 'announce') announce(notice.message);
      else if (serverEpochOffset !== undefined) {
        onTestFireworks?.(notice.seed, (performance.now() + serverEpochOffset - notice.startAt) / 1000);
      }
    }
    notices.length = 0;
    if (!snowballEvents.length) return;
    const end = performance.now() + eventFrameBudgetMs;
    for (let i = 0; i < eventFrameLimit && snowballEvents.length; i++) {
      onSnowballEvent?.(snowballEvents.shift()!);
      if (performance.now() >= end) break;
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleConnection();
    else cancelRetryTimer();
  });
  window.addEventListener('pagehide', () => {
    inTown = false;
    resetRetry();
    disconnect(true);
  });

  return {
    selfId: () => joinedId,
    setActivityPose(pose: TownAvatarPose) { activityPose = pose; },
    snowballName: (id: number) => joinedId === id ? joinedName : roster.get(id),
    getSnowballPeers: (): readonly (PresencePose & { id: number; name: string })[] => renderList,
    sendSnowballThrow: (event: SnowballThrow) => sendEvent(encodeSnowballThrow(event)),
    sendSnowballHit: (event: SnowballHit) => sendEvent(encodeSnowballHit(event)),
    animateSnowballThrow(id: number) {
      const actor = actors.get(id);
      if (actor) actor.throwGestureStarted = performance.now();
    },
    onSnowballEvent(handler: (event: SnowballRelayEvent) => void) { onSnowballEvent = handler; },
    onTestFireworks(handler: (seed: number, ageSeconds: number) => void) { onTestFireworks = handler; },
    sample(active: boolean, east: number, north: number, height: number, yaw: number, visible = active) {
      show = visible;
      if (active) {
        local.east = east;
        local.north = north;
        local.height = height;
        local.yaw = yaw;
      }
      if (inTown === active) return;
      inTown = active;
      if (active) scheduleConnection();
      else {
        resetRetry();
        disconnect(true);
      }
    },
    update(dt: number) {
      if (!socket) return;
      sendPose(dt);
      syncActivityPoses();
      drainEvents();
      if (!show || !actors.size) { renderList.length = 0; avatars?.clear(); return; }
      avatars ??= createPresenceAvatars(scene, camera);
      const now = performance.now();
      renderList.length = 0;
      for (const actor of actors.values()) {
        const east = actor.east, north = actor.north;
        samplePresencePose(actor.history, now, actor);
        if (actor.pose === 0 || actor.pose === 3) {
          const distance = Math.hypot(actor.east - east, actor.north - north);
          if (distance > .001 && distance < 2 && dt > 0) {
            actor.stepPhase = (actor.stepPhase + distance * 4.4) % (2 * Math.PI);
            actor.stride = Math.sin(actor.stepPhase) * Math.min(1, distance / (dt * 2.8));
          } else actor.stride = 0;
        } else actor.stride = 0;
        renderList.push(actor);
      }
      avatars.render(renderList);
    },
  };
}
