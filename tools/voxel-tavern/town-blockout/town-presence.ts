import type { PerspectiveCamera, Scene } from 'three';
import { createPresenceAvatars } from './town-presence-avatars';
import { isSharedHomePosition } from '../../../src/presence/shared-home-space';
import {
  presenceRecordBytes, pushPresenceSample, samplePresencePose, visitPresenceSnapshot, writePresencePose,
  type PresencePose, type PresenceSample,
} from './town-presence-motion';

type Actor = PresencePose & { id: number; name: string; history: PresenceSample[]; seen: number };

const sampleInterval = .1;
const maximumBufferedBytes = 1024;
const guestNameKey = 'unwritten.presence.name.v1';

function guestName() {
  try {
    const stored = localStorage.getItem(guestNameKey)?.trim();
    if (stored && [...stored].length <= 24 && !/[\p{Cc}\p{Cf}\p{Cs}]/u.test(stored)) return stored;
  } catch { /* Private browsing can disable local storage. */ }
  return `小镇游客${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
}

export function createTownPresence(scene: Scene, camera: PerspectiveCamera, announce: (message: string) => void) {
  const label = guestName();
  const local: PresencePose = { east: 0, north: 0, height: 0, yaw: 0 };
  const outgoing = new DataView(new ArrayBuffer(presenceRecordBytes));
  const roster = new Map<number, string>();
  const actors = new Map<number, Actor>();
  const renderList: Actor[] = [];
  let avatars: ReturnType<typeof createPresenceAvatars> | undefined;
  let socket: WebSocket | undefined;
  let timeout: number | undefined;
  let inTown = false;
  let show = false;
  let haveId = false;
  let epoch = 0;
  let seq = 0;
  let remaining = 0;
  let lastPosition = -1;
  let lastHeightYaw = -1;
  let moving = false;
  let insideSharedHome = false;

  function disconnect(graceful: boolean) {
    if (timeout !== undefined) window.clearTimeout(timeout);
    timeout = undefined;
    const active = socket;
    socket = undefined;
    haveId = false;
    roster.clear();
    actors.clear();
    renderList.length = 0;
    avatars?.clear();
    if (active) {
      try {
        if (graceful && active.readyState === WebSocket.OPEN) active.send(JSON.stringify({ type: 'leave' }));
        active.close();
      } catch { /* A connection failure leaves the local viewer untouched. */ }
    }
  }

  function receive(data: unknown) {
    if (typeof data === 'string') {
      let message: { type?: string; id?: number; name?: string; self?: boolean };
      try { message = JSON.parse(data); } catch { return; }
      if (!message || !Number.isInteger(message.id) || message.id! < 1 || message.id! > 65535) return;
      const id = message.id!;
      if (message.type === 'join' && typeof message.name === 'string') {
        if (message.self) {
          haveId = true;
          if (timeout !== undefined) window.clearTimeout(timeout);
          timeout = undefined;
          lastPosition = lastHeightYaw = -1;
          moving = false;
          remaining = 0;
        } else if (!roster.has(id) && roster.size < 64) {
          roster.set(id, message.name);
          announce(`${message.name} 进镇了`);
        }
      } else if (message.type === 'leave') {
        const name = roster.get(id);
        roster.delete(id);
        actors.delete(id);
        if (name) announce(`${name} 离镇了`);
      }
      return;
    }
    if (!haveId || !(data instanceof ArrayBuffer)) return;
    const stamp = ++epoch;
    const time = performance.now();
    const valid = visitPresenceSnapshot(data, (id, east, north, height, yaw, sequence) => {
      const name = roster.get(id);
      if (name === undefined || isSharedHomePosition(east, north, height) !== insideSharedHome) return;
      let actor = actors.get(id);
      if (!actor) {
        actor = { id, name, east, north, height, yaw, history: [], seen: stamp };
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
      timeout = window.setTimeout(() => { if (socket === ws) disconnect(false); }, 3000);
      ws.onopen = () => {
        if (socket === ws) {
          try { ws.send(JSON.stringify({ type: 'join', name: label })); }
          catch { disconnect(false); }
        }
      };
      ws.onmessage = event => { if (socket === ws) receive(event.data); };
      ws.onerror = ws.onclose = () => { if (socket === ws) disconnect(false); };
    } catch { disconnect(false); }
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
    catch { disconnect(false); return; }
    seq = (seq + 1) & 65535;
    moving = changed && lastPosition !== -1;
    lastPosition = position;
    lastHeightYaw = heightYaw;
  }

  window.addEventListener('pagehide', () => {
    inTown = false;
    disconnect(true);
  });

  return {
    sample(active: boolean, east: number, north: number, height: number, yaw: number, visible = active) {
      show = visible;
      if (active) {
        local.east = east;
        local.north = north;
        local.height = height;
        local.yaw = yaw;
        const indoors = isSharedHomePosition(east, north, height);
        if (insideSharedHome !== indoors) {
          insideSharedHome = indoors;
          actors.clear();
          renderList.length = 0;
          avatars?.clear();
          remaining = 0;
        }
      }
      if (inTown === active) return;
      inTown = active;
      if (active) connect();
      else disconnect(true);
    },
    update(dt: number) {
      if (!socket) return;
      sendPose(dt);
      if (!show || !actors.size) { avatars?.clear(); return; }
      avatars ??= createPresenceAvatars(scene, camera);
      const now = performance.now();
      renderList.length = 0;
      for (const actor of actors.values()) {
        samplePresencePose(actor.history, now, actor);
        renderList.push(actor);
      }
      avatars.render(renderList);
    },
  };
}
