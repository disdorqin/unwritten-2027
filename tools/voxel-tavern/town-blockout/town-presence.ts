import type { PerspectiveCamera, Scene } from 'three';
import {
  decodeSnowballEvents, encodeSnowballHit, encodeSnowballThrow, SNOWBALL_EVENT_PREFIX,
  type SnowballHit, type SnowballRelayEvent, type SnowballThrow,
} from '../../../src/presence/snowball-events';
import {
  decodeSnowfightRelay, encodeSledSmash, encodeWallHit, encodeWallPlace,
  type SnowfightRelayEvent,
} from '../../../src/presence/snowfight-events';
import type { SnowfightPhase } from '../../../src/presence/snowfight';
import { MASCOT_ACTOR_ID } from '../../../src/presence/protocol';
import { createPresenceAvatars } from './town-presence-avatars';
import { isSharedHomePosition } from '../../../src/presence/shared-home-space';
import { readCeremonyArrival, type CeremonyArrival } from '../../../src/presence/ceremony-arrival';
import { createTownChat, parseTownChat, type TownChatMessage, type TownChatScope } from './town-chat';
import { createTownPresenceClock } from './town-presence-clock';
import { createTownPresenceNight } from './town-presence-night';
import { createTownPresenceWeather } from './town-presence-weather';
import { isFireworksSeed, isFireworksTheme, type FireworksTheme } from '../../../src/presence/firework-sites';
import { readPersonalFireworkRelay, type PersonalFireworkRelay, type PersonalFireworkRequest } from '../../../src/presence/personal-fireworks';
import { plazaPhotoLineup, readPlazaPhotoNotice, type PlazaPhotoNotice, type PlazaPhotoPerson } from '../../../src/presence/plaza-photo';
import {
  presenceRecordBytes, pushPresenceSample, samplePresencePose, visitPresenceSnapshot, writePresencePose,
  type PresencePose, type PresenceSample,
} from './town-presence-motion';

import { isTownAvatarPose, type TownAvatarPose } from './town-presence-pose';
import { createPresenceLinkStatus } from './town-presence-status';
import {
  POLL_JOIN_URL, POLL_LEAVE_URL, POLL_URL, base64ToArrayBuffer, buildPollBody, parsePollMessages,
  pollIntervalMs, pollSampleIntervalSeconds, pushPollEvent, requeuePollEvents,
} from './town-presence-poll';
import { readBellEvent, type BellEvent } from '../../../src/presence/bell-game';
import type {
  Za36CableRepairEvent, Za36CableRepairLine, Za36CableRepairState,
} from './town-za36-cable-repair';
import type { CableLineFlags } from '../../../src/presence/cable-line-authority';
import type { IcePalaceRite, IcePalaceRiteState } from '../../../src/shared/ice-palace-rites';
import { isGrandPrixResult, type GrandPrixResult } from './town-grand-prix';
import {
  readSummitPassportReply, type SummitPassportAction, type SummitPassportReply,
} from '../../../src/shared/summit-passport';
import {summitPresenceEndpoint,summitPresenceFrame,toSummitPresencePose,fromSummitPresencePose} from '../../../src/shared/za22-summit-presence-domain';
import {
  isMountainPresenceFoot, mountainPresenceNorthOrigin, mountainPresencePath,
} from '../../../src/shared/za22-mountain-domain';
import {
  isWestPresenceFoot, westPresenceEastOrigin, westPresenceHeightOrigin, westPresencePath,
} from '../../../src/shared/za22-west-domain';
import {
  skyCityPresenceEndpoint, toSkyCityPresencePose, fromSkyCityPresencePose,
} from '../../../src/shared/sky-city-presence-domain';
import {
  fromMinePresencePose, minePresenceEndpoint, toMinePresencePose,
} from '../../../src/shared/underground-mine-presence-domain';

type Actor = PresencePose & {
  id: number; name: string; history: PresenceSample[]; seen: number; throwGestureStarted?: number;
  pose: TownAvatarPose; stepPhase: number; stride: number;
};

type TownNotice = { kind: 'announce'; message: string }
  | { kind: 'test-fireworks'; seed: number; startAt: number };

export type SnowfightState = {
  phase: SnowfightPhase;
  endsInMs: number;
  scores: [number, number];
  teams: [number, number][];
  owners: number[];
  activePoint: number;
  captureTeam: number;
  captureProgress: number;
};
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

export function createTownPresence(
  scene: Scene, camera: PerspectiveCamera, announce: (message: string) => void, onChatFocus: () => void = () => {},
  heightAt: (east: number, north: number) => number = () => 0,
) {
  const getName = presenceName();
  const chat = createTownChat(sendChat, onChatFocus);
  const chatEvents: TownChatMessage[] = [];
  const status = document.getElementById('town-presence-status');
  const link = createPresenceLinkStatus(() => updateStatus());
  const clock = createTownPresenceClock();
  const townNight = createTownPresenceNight(clock.now);
  let undergroundWaterSnapshot: unknown;
  const townWeather = createTownPresenceWeather(clock.now);
  const ownerPanel = document.querySelector<HTMLDetailsElement>('#town-mascot-owner');
  const ownerInput = document.querySelector<HTMLInputElement>('#town-mascot-owner-key');
  const ownerSubmit = document.querySelector<HTMLButtonElement>('#town-mascot-owner-verify');
  const ownerStatus = document.getElementById('town-mascot-owner-status');
  const ownerFollow = document.querySelector<HTMLInputElement>('#town-mascot-follow');
  const mascotHistory: PresenceSample[] = [];
  const mascotWire = new DataView(new ArrayBuffer(presenceRecordBytes));
  const mascotPose: PresencePose = { east: 0, north: 0, height: 0, yaw: 0 };
  let ownerNonce: string | undefined;
  let ownerVerified = false;
  let mascotSeq = 0;
  let nextMascotSample = 0;
  let photoSupported = false;
  let summitPassportSupported = false;
  let onSummitPassport: ((reply: SummitPassportReply) => void) | undefined;
  let clockRequest: number | undefined;
  let nextClockSample = Infinity;
  let showPhoto: ((notice: PlazaPhotoNotice) => void) | undefined;
  let ceremonyArrival: CeremonyArrival | undefined;
  let ceremonyArrivalTimer: number | undefined;
  let onCeremonyArrival: ((landing: CeremonyArrival) => void) | undefined;
  let fireworksSupported = false;
  let firecrackersSupported = false;
  let playFirecracker: ((event: PersonalFireworkRelay, own: boolean) => void) | undefined;
  let rejectFirecracker: ((seed: number, position: boolean) => void) | undefined;
  let playFireworks: ((seed: number, theme: FireworksTheme, ageMs: number, own: boolean) => void) | undefined;
  let bellSupported = false;
  let iceThroneSupported = false;
  let cableLineSupported = false;
  const cableLineStates = new Map<Za36CableRepairLine, Za36CableRepairState>();
  const cableOpenedAt = new Map<Za36CableRepairLine,number>();
  const cableWokeAt = new Map<Za36CableRepairLine,number>();
  function clearCableFrames(){cableLineStates.clear();cableOpenedAt.clear();cableWokeAt.clear();cableLineFlags={cableLine1Open:false,cableLine2Open:false};}
  let cableLineFlags: CableLineFlags = { cableLine1Open: false, cableLine2Open: false };
  let icePalaceSupported = false;
  const icePalaceRiteClosed: IcePalaceRiteState = { frozen: false, leverAvailable: false, harvestAvailable: false, solsticeRite: 'closed' };
  let icePalaceRiteState: IcePalaceRiteState = icePalaceRiteClosed;
  let icePalaceFragmentPresent = true;
  const icePalacePending = new Map<string, (accepted: boolean) => void>();
  let icePalaceRequestSeq = 0;
  let crownedId: number | null = null;
  const bellEvents: BellEvent[] = [];
  let onBellEvent: ((event: BellEvent) => void) | undefined;
  let bellHolderId: number | null = null;
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
  const snowfightWallEvents: SnowfightRelayEvent[] = [];
  const notices: TownNotice[] = [];
  let onSnowballEvent: ((event: SnowballRelayEvent) => void) | undefined;
  let snowfightSupported = false;
  let freeSnowWallsSupported = false;
  let snowfightState: SnowfightState | undefined;
  let onSnowfightWallEvent: ((event: SnowfightRelayEvent) => void) | undefined;
  let onSnowfightState: ((state: SnowfightState) => void) | undefined;
  let onSnowfightRejected: ((reason: string) => void) | undefined;
  let onGrandPrixResult: ((result: GrandPrixResult) => void) | undefined;
  let onTestFireworks: ((seed: number, ageSeconds: number) => void) | undefined;
  let joinedId: number | null = null;
  let joinedName: string | undefined;
  let serverEpochOffset: number | undefined;
  let avatars: ReturnType<typeof createPresenceAvatars> | undefined;
  let avatarScene = scene;
  let socket: WebSocket | undefined;
  /** 当前 WS 尝试是否已完成入镇（用于区分「静默探测失败」与「在线掉线」）。 */
  let socketJoined = false;
  /** S3 备用通道：WS 不可用时以 HTTPS 轮询维持同一会话，WS 只作后台探测。 */
  type PollChannel = {
    session: string; timer: number; inFlight: boolean;
    outEvents: (string | Uint8Array)[]; pendingState?: ArrayBuffer;
  };
  let poll: PollChannel | undefined;
  let pollRetryTimer: number | undefined;
  /** receive() 正在处理哪条通道的帧（轮询帧与 WS 帧共用同一接收逻辑）。 */
  let receivingFrom: 'ws' | 'poll' = 'ws';
  let timeout: number | undefined;
  let retryTimer: number | undefined;
  let retryAt: number | undefined;
  let retryIndex = 0;
  let inTown = false;
  let domain: 'town' | 'mountain' | 'summit' | 'west' | 'sky' | 'mine' = 'town';
  function presencePath(path: string) {
    if (domain === 'town') return path;
    if (domain === 'sky') return skyCityPresenceEndpoint(path);
    if (domain === 'summit') return summitPresenceEndpoint(path);
    if (domain === 'mine') return minePresenceEndpoint(path);
    const room = domain === 'mountain' ? mountainPresencePath : westPresencePath;
    return room + path.slice('/presence'.length);
  }
  let show = false;
  let haveId = false;
  let cableClockReady=false;
  let insideSharedHome = false;
  let epoch = 0;
  let seq = 0;
  let remaining = 0;
  let lastPosition = -1;
  let lastHeightYaw = -1;
  let moving = false;

  function updateStatus() {
    if (!status) return;
    link.setPeople(roster.size + (haveId ? 1 : 0));
    const text = link.text();
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
    if (poll && !socketJoined) {
      // 备用通道在跑、这次只是后台 WS 探测失败：只收探测连接，不动轮询会话与名册。
      const active = socket;
      socket = undefined;
      if (timeout !== undefined) window.clearTimeout(timeout);
      timeout = undefined;
      if (active) { try { active.close(); } catch { /* 探测连接已断开。 */ } }
      retryAt = performance.now() + retryDelays[retryIndex];
      retryIndex = Math.min(retryIndex + 1, retryDelays.length - 1);
      scheduleConnection();
      return;
    }
    disconnect(false);
    link.failed();
    if (!inTown) return;
    retryAt = performance.now() + retryDelays[retryIndex];
    retryIndex = Math.min(retryIndex + 1, retryDelays.length - 1);
    scheduleConnection();
    void startPoll();
  }

  function stopPoll(sendLeave: boolean) {
    if (pollRetryTimer !== undefined) window.clearTimeout(pollRetryTimer);
    pollRetryTimer = undefined;
    const active = poll;
    poll = undefined;
    if (!active) return;
    window.clearInterval(active.timer);
    if (sendLeave && active.session) {
      void fetch(presencePath(POLL_LEAVE_URL), {
        method: 'POST', headers: { 'x-presence-session': active.session }, keepalive: true,
      }).catch(() => { /* 离线离开时服务端会按轮询超时回收会话。 */ });
    }
  }

  function retryPollLater() {
    if (pollRetryTimer !== undefined || !inTown) return;
    pollRetryTimer = window.setTimeout(() => {
      pollRetryTimer = undefined;
      if (inTown && !poll && !socketJoined) void startPoll();
    }, 2000);
  }

  function feedPollMessages(payload: unknown) {
    const messages = parsePollMessages(payload);
    if (!messages) return;
    receivingFrom = 'poll';
    try {
      for (const message of messages) {
        if (message.t === 'text') receive(message.d);
        else receive(base64ToArrayBuffer(message.d));
      }
    } finally { receivingFrom = 'ws'; }
  }

  async function pollJoin(channel: PollChannel): Promise<boolean> {
    try {
      const response = await fetch(presencePath(POLL_JOIN_URL), {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: getName() }),
      });
      if (!response.ok) return false;
      const data = await response.json() as { session?: unknown };
      if (typeof data.session !== 'string' || poll !== channel) return false;
      channel.session = data.session;
      feedPollMessages(data);
      link.useFallback(roster.size + (haveId ? 1 : 0));
      return haveId;
    } catch { return false; }
  }

  async function startPoll() {
    if (poll || !inTown) return;
    const channel: PollChannel = { session: '', timer: 0, inFlight: false, outEvents: [] };
    poll = channel;
    if (!await pollJoin(channel) || poll !== channel) {
      if (poll === channel) poll = undefined;
      retryPollLater();
      return;
    }
    channel.timer = window.setInterval(() => { void flushPoll(channel); }, pollIntervalMs);
  }

  async function flushPoll(channel: PollChannel) {
    if (channel.inFlight || poll !== channel || !channel.session) return;
    channel.inFlight = true;
    const state = channel.pendingState;
    channel.pendingState = undefined;
    const events = channel.outEvents;
    channel.outEvents = [];
    try {
      const response = await fetch(presencePath(POLL_URL), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-presence-session': channel.session },
        body: buildPollBody(state, events),
      });
      if (poll !== channel) return;
      if (response.status === 401 || response.status === 410) {
        // 会话已被服务端回收（超时/重启）：事件未被处理，塞回队列并重新入镇。
        requeuePollEvents(channel.outEvents, events);
        channel.session = '';
        townNight.disconnect();
        townWeather.disconnect();
        if (!await pollJoin(channel) && poll === channel) {
          stopPoll(false);
          retryPollLater();
        }
        return;
      }
      if (!response.ok) throw new Error('poll failed');
      const payload: unknown = await response.json();
      if (poll === channel) feedPollMessages(payload);
    } catch {
      // 往返失败：事件塞回队首下轮重发；状态帧只保最新，旧帧直接丢弃。
      if (poll === channel) requeuePollEvents(channel.outEvents, events);
    } finally { channel.inFlight = false; }
  }

  /** WS 探测成功入镇：把轮询会话退掉，正式切回 WS（状态由 WS 流重新同步）。 */
  function promoteFromPoll() {
    if (poll) stopPoll(true);
  }

  function resetOwnerSession() {
    ownerVerified = false;
    ownerNonce = undefined;
    mascotHistory.length = 0;
    if (ownerInput) { ownerInput.value = ''; ownerInput.hidden = false; }
    if (ownerSubmit) ownerSubmit.hidden = false;
    if (ownerStatus) ownerStatus.textContent = '未验证';
    if (ownerFollow?.parentElement) ownerFollow.parentElement.hidden = true;
    if (ownerPanel) ownerPanel.hidden = true;
  }

  function disconnect(graceful: boolean) {
    if (timeout !== undefined) window.clearTimeout(timeout);
    timeout = undefined;
    stopPoll(graceful);
    const active = socket;
    socket = undefined;
    socketJoined = false;
    haveId = false;
    cableClockReady=false;
    cableLineSupported=false;clearCableFrames();
    townNight.disconnect();
    townWeather.disconnect();
    resetOwnerSession();
    joinedId = null;
    joinedName = undefined;
    crownedId = null;
    if (graceful) iceThroneSupported = false;
    serverEpochOffset = undefined;
    snowballEvents.length = 0;
    snowfightWallEvents.length = 0;
    snowfightSupported = freeSnowWallsSupported = false;
    snowfightState = undefined;
    notices.length = 0;
    chatEvents.length = 0;
    ceremonyArrival = undefined;
    window.clearTimeout(ceremonyArrivalTimer);
    ceremonyArrivalTimer = undefined;
    chat.setConnected(false);
    photoSupported = false;
    summitPassportSupported = false;
    fireworksSupported = firecrackersSupported = false;
    bellSupported = false;
    bellEvents.length = 0;
    bellHolderId = null;
    avatars?.setHighlight(null);
    clockRequest = undefined;
    nextClockSample = Infinity;
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

  function switchDomain(next: typeof domain, nextScene = scene) {
    if (domain === next) return;
    resetRetry();
    disconnect(true);
    domain = next;
    avatarScene = nextScene;
    avatars?.setScene(avatarScene);
    lastPosition = lastHeightYaw = -1;
    remaining = 0;
    if (inTown) {
      link.enterTown();
      scheduleConnection();
    }
  }

  function scheduleCeremonyArrival() {
    window.clearTimeout(ceremonyArrivalTimer);
    if (!ceremonyArrival || !onCeremonyArrival) return;
    const wait = ceremonyArrival.edge ? 0 : Math.max(0, ceremonyArrival.startAt - clock.now());
    ceremonyArrivalTimer = window.setTimeout(() => {
      ceremonyArrivalTimer = undefined;
      const landing = ceremonyArrival;
      if (!landing) return;
      if (!landing.edge && clock.now() < landing.startAt) {
        scheduleCeremonyArrival();
        return;
      }
      ceremonyArrival = undefined;
      remaining = 0;
      onCeremonyArrival?.(landing);
      sendPose(0);
    }, wait);
  }

  function receive(data: unknown) {
    if (typeof data === 'string') {
      let message: {
        type?: string; id?: number; name?: string; self?: boolean; epochMs?: number;
        kind?: string; message?: string; seed?: number; startAt?: number; pose?: unknown; plazaPhoto?: boolean; sentAt?: number; reason?: string;
        fireworks?: boolean; firecrackers?: boolean; bell?: boolean; theme?: FireworksTheme; from?: number; waitMs?: number; totalMs?: unknown; at?: unknown;
        nonce?: string; accepted?: boolean; iceThrone?: boolean; crowned?: boolean; summitPassport?: boolean;
        cableLine?: boolean; line?: unknown; flags?: unknown; openedAt?: unknown; wokeAt?: unknown; presenceFrame?:unknown;
        icePalaceRites?: boolean; present?: unknown; requestId?: unknown;
        townNightWindow?: unknown; townOutdoorWeather?: unknown; townOutdoorWeatherDawnEpoch?: unknown; state?: unknown;
        undergroundWater?: unknown;
      };
      try { message = JSON.parse(data); } catch { return; }
      if (!message) return;
      if (message.type === 'event' && (message.kind === 'town-outdoor-weather' || message.kind === 'town-outdoor-weather-warning')) {
        if (haveId && (receivingFrom === 'ws' ? socketJoined : !socketJoined)) townWeather.accept(message);
        return;
      }
      if (message.type === 'event' && message.kind === 'underground-water') {
        if (haveId && (receivingFrom === 'ws' ? socketJoined : !socketJoined)) {
          undergroundWaterSnapshot = message.state;
        }
        return;
      }
      if (message.type === 'event' && (message.kind === 'town-night-window' || message.kind === 'town-night-beacon')) {
        if (haveId && (receivingFrom === 'ws' ? socketJoined : !socketJoined)) {
          if (message.kind === 'town-night-window') townNight.acceptWindow(message.state);
          else townNight.acceptBeacon(message);
        }
        return;
      }
      if (message.type === 'cable-line') {
        if(!haveId||!cableLineSupported||(receivingFrom==='ws'?!socketJoined:socketJoined))return;
        const line = message.line === 1 || message.line === 2 ? message.line : undefined;
        const state = message.state as Za36CableRepairState | undefined;
        if (line && state && typeof state === 'object' && state.line === line &&
          Number.isSafeInteger(state.version) && state.version>=0 && ['dormant','one-station','full-line'].includes(state.stage)) {
          if(state.version<(cableLineStates.get(line)?.version??-1))return;
          cableLineStates.set(line, state);
          if(state.stage==='full-line'&&typeof message.openedAt==='number'&&Number.isSafeInteger(message.openedAt)&&message.openedAt>=0)cableOpenedAt.set(line,message.openedAt);
          else cableOpenedAt.delete(line);
          if(state.stage!=='dormant'&&typeof message.wokeAt==='number'&&Number.isSafeInteger(message.wokeAt)&&message.wokeAt>=0)cableWokeAt.set(line,message.wokeAt);
          else cableWokeAt.delete(line);
          const flags = message.flags as CableLineFlags | undefined;
          if (flags && typeof flags.cableLine1Open === 'boolean' && typeof flags.cableLine2Open === 'boolean') {
            cableLineFlags = { cableLine1Open: flags.cableLine1Open, cableLine2Open: flags.cableLine2Open };
          }
        }
        return;
      }
      if (message.type === 'ice-palace-rite') {
        const state = message.state as IcePalaceRiteState | undefined;
        if (state && typeof state === 'object' && typeof state.frozen === 'boolean' &&
          typeof state.leverAvailable === 'boolean' && typeof state.harvestAvailable === 'boolean' &&
          (state.solsticeRite === 'closed' || state.solsticeRite === 'ready' || state.solsticeRite === 'completed')) {
          icePalaceRiteState = state;
        }
        return;
      }
      if (message.type === 'ice-palace-fragment') {
        if (typeof message.present === 'boolean') icePalaceFragmentPresent = message.present;
        return;
      }
      if (message.type === 'ice-palace-rite-result' || message.type === 'ice-palace-fragment-result') {
        if (typeof message.requestId === 'string') icePalacePending.get(message.requestId)?.(message.accepted === true);
        return;
      }
      if (message.type === 'event' && message.kind === 'summit-passport-result') {
        const reply = haveId && summitPassportSupported && readSummitPassportReply(message);
        if (reply) onSummitPassport?.(reply);
        return;
      }
      if (haveId && message.type === 'owner-challenge') {
        if (typeof message.nonce === 'string' && /^[0-9a-f]{48}$/.test(message.nonce)) {
          ownerNonce = message.nonce;
          if (ownerPanel && globalThis.crypto?.subtle) ownerPanel.hidden = false;
        }
        return;
      }
      if (haveId && message.type === 'owner-result') {
        ownerVerified = ownerVerified || message.accepted === true;
        if (ownerStatus) ownerStatus.textContent = ownerVerified ? '已验证' : '未验证';
        if (ownerInput) ownerInput.hidden = ownerVerified;
        if (ownerSubmit) ownerSubmit.hidden = ownerVerified;
        if (ownerFollow?.parentElement) ownerFollow.parentElement.hidden = !ownerVerified;
        return;
      }
      if (message.type === 'leave' && message.id === MASCOT_ACTOR_ID) {
        mascotHistory.length = 0;
        return;
      }
      if (message.type === 'event' && (message.kind === 'plaza-photo-invite' || message.kind === 'plaza-photo-lineup')) {
        const notice = haveId && readPlazaPhotoNotice(message);
        if (notice) showPhoto?.(notice);
        return;
      }
      if (message.type === 'plaza-photo-rejected' && haveId) {
        announce(message.reason === 'busy' ? '广场已有一场合影正在进行' : '请走上广场合影站位后再试');
        return;
      }
      if (message.type === 'event' && message.kind === 'fireworks') {
        if (haveId && isFireworksSeed(message.seed) && isFireworksTheme(message.theme) &&
            Number.isSafeInteger(message.startAt)) {
          playFireworks?.(message.seed, message.theme, clock.now() - message.startAt!, message.from === joinedId);
        }
        return;
      }
      if (haveId && message.type === 'event' && message.kind === 'personal-firework') {
        const event = readPersonalFireworkRelay(message);
        if (event) playFirecracker?.(event, event.from === joinedId);
        return;
      }
      if (haveId && message.type === 'personal-firework-rejected') {
        if (isFireworksSeed(message.seed)) rejectFirecracker?.(message.seed, message.reason === 'position');
        return;
      }
      if (message.type === 'fireworks-rejected') {
        if (!haveId) return;
        if (message.reason === 'cooldown' && Number.isFinite(message.waitMs)) {
          announce(`烟花师傅在装填 · ${Math.ceil(message.waitMs! / 1000)} 秒`);
        } else if (message.reason === 'position') announce('请靠近烟花燃放点再试');
        return;
      }
      if (message.type === 'bell-rejected') {
        if (!haveId) return;
        announce(message.reason === 'busy' ? '抢铃铛正在进行中' : '请到广场上再开启抢铃铛');
        return;
      }
      if (message.type === 'event' && typeof message.kind === 'string' && message.kind.startsWith('bell-')) {
        const event = haveId ? readBellEvent(message) : undefined;
        if (event && bellEvents.length < 8) bellEvents.push(event);
        return;
      }
      if (message.type === 'snowfight' && haveId) {
        snowfightState = message as unknown as SnowfightState;
        onSnowfightState?.(snowfightState);
        return;
      }
      if (message.type === 'snowfight-rejected' && haveId) {
        if (typeof message.reason === 'string') onSnowfightRejected?.(message.reason);
        return;
      }
      if (message.type === 'clock') {
        if (haveId && clockRequest !== undefined && message.sentAt === clockRequest && typeof message.epochMs === 'number') {
          clock.accept(message.epochMs, clockRequest);
          clockRequest = undefined;
          if (ceremonyArrival) scheduleCeremonyArrival();
        }
        return;
      }
      if (haveId && message.type === 'chat') {
        if (chatEvents.length < 24) {
          const event = parseTownChat(message);
          if (event && roster.has(event.id)) chatEvents.push(event);
        }
        return;
      }
      if (haveId && message.type === 'event') {
        if (message.kind === 'grand-prix') {
          const result = { id: String(message.id ?? ''), name: message.name, totalMs: message.totalMs, at: message.at };
          if (isGrandPrixResult(result)) onGrandPrixResult?.(result);
          return;
        }
        if (message.kind === 'ceremony-arrival') {
          const arrival = readCeremonyArrival(message);
          if (arrival) {
            ceremonyArrival = arrival;
            scheduleCeremonyArrival();
          }
          return;
        }
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
          if((domain==='summit')!==(message.presenceFrame===summitPresenceFrame)){connectionLost();return;}
          if (receivingFrom === 'ws') {
            socketJoined = true;
            if (poll) promoteFromPoll();
          }
          if (joinedId !== id) {
            resetOwnerSession();
            crownedId = null;
          }
          iceThroneSupported = message.iceThrone === true;
          cableLineSupported = message.cableLine === true;
          // A reconnect may be a restarted server; never reuse its prior opening epoch.
          clearCableFrames();
          icePalaceSupported = message.icePalaceRites === true;
          if (!icePalaceSupported) {
            icePalaceRiteState = icePalaceRiteClosed;
            icePalaceFragmentPresent = true;
            for (const settle of [...icePalacePending.values()]) settle(false);
          }
          haveId = true;
          cableClockReady=Number.isSafeInteger(message.epochMs)&&message.epochMs!>0;
          link.joined(roster.size + 1);
          joinedId = id;
          fireworksSupported = message.fireworks === true;
          bellSupported = message.bell === true;
          snowfightSupported = (message as { snowfight?: unknown }).snowfight === true;
          freeSnowWallsSupported = (message as { freeSnowWalls?: unknown }).freeSnowWalls === true;
          firecrackersSupported = message.firecrackers === true;
          photoSupported = message.plazaPhoto === true;
          summitPassportSupported = message.summitPassport === true;
          joinedName = message.name;
          chat.setConnected(true);
          if (typeof message.epochMs === 'number' && Number.isFinite(message.epochMs)) {
            serverEpochOffset = message.epochMs - performance.now();
            clock.accept(message.epochMs);
            if (photoSupported || message.townNightWindow !== undefined) nextClockSample = 0;
          }
          townNight.join(message.epochMs, message.townNightWindow);
          if (message.undergroundWater !== undefined) {
            undergroundWaterSnapshot = message.undergroundWater;
          }
          townWeather.join(message.townOutdoorWeather, message.townOutdoorWeatherDawnEpoch);
          if (receivingFrom === 'ws') {
            // 轮询入镇不算 WS 恢复：不清重试状态，后台探测要继续。
            resetRetry();
            if (timeout !== undefined) window.clearTimeout(timeout);
            timeout = undefined;
          }
          lastPosition = lastHeightYaw = -1;
          moving = false;
          remaining = 0;
        } else if (roster.has(id) || roster.size < 64) {
          if (message.crowned === true) crownedId = id;
          if (isTownAvatarPose(message.pose)) pendingActivityPoses.set(id, message.pose);
          if (!roster.has(id)) {
            roster.set(id, message.name);
            announce(`${message.name} 进镇了`);
          }
        }
      } else if (message.type === 'pose' && (id === joinedId || roster.has(id)) && isTownAvatarPose(message.pose)) {
        if (message.crowned === true) crownedId = id;
        else if (message.crowned === false && crownedId === id) crownedId = null;
        if (id !== joinedId) pendingActivityPoses.set(id, message.pose);
      } else if (message.type === 'leave') {
        if (crownedId === id) crownedId = null;
        const name = roster.get(id);
        pendingActivityPoses.delete(id);
        remoteActivityPoses.delete(id);
        roster.delete(id);
        actors.delete(id);
        chat.forget(id);
        if (name) announce(`${name} 离镇了`);
      }
      updateStatus();
      return;
    }
    if (!haveId || !(data instanceof ArrayBuffer)) return;
    if (new Uint8Array(data, 0, Math.min(1, data.byteLength))[0] === SNOWBALL_EVENT_PREFIX) {
      const wallEvents = decodeSnowfightRelay(data);
      if (wallEvents) {
        for (const event of wallEvents) {
          if (snowfightWallEvents.length >= 256) break;
          snowfightWallEvents.push(event);
        }
        return;
      }
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
    link.firstFrame();
    const stamp = ++epoch;
    const time = performance.now();
    let mascotSeen = false;
    const valid = visitPresenceSnapshot(data, (id, localEast, localNorth, localHeight, yaw, sequence) => {
      const received = domain === 'sky'
        ? fromSkyCityPresencePose({ east: localEast, north: localNorth, height: localHeight })
        : domain === 'summit'
          ? fromSummitPresencePose({east:localEast,north:localNorth,height:localHeight})
        : domain === 'mine'
          ? fromMinePresencePose({ east: localEast, north: localNorth, height: localHeight })
          : { east: localEast + (domain === 'west' ? westPresenceEastOrigin : 0),
              north: localNorth + (domain === 'mountain' ? mountainPresenceNorthOrigin : 0),
              height: localHeight + (domain === 'west' ? westPresenceHeightOrigin : 0) };
      if (!received) return; // Invalid sky-room record must not be painted in another domain.
      const { east, north, height } = received;
      if (isSharedHomePosition(east, north, height) !== insideSharedHome) return;
      if (id === MASCOT_ACTOR_ID) {
        mascotSeen = true;
        pushPresenceSample(mascotHistory, { east, north, height, yaw, seq: sequence, time });
        return;
      }
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
    if (valid && !mascotSeen) mascotHistory.length = 0;
    if (valid) for (const actor of actors.values()) if (actor.seen !== stamp) actors.delete(actor.id);
  }

  function connect() {
    try {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${location.host}${presencePath('/presence')}`);
      socket = ws;
      socketJoined = false;
      // 备用通道在跑时这是后台探测：不把 HUD 翻回「连接中」，探测成功才切回。
      if (!poll) link.attemptStarted();
      ws.binaryType = 'arraybuffer';
      updateStatus();
      timeout = window.setTimeout(() => { if (socket === ws) connectionLost(); }, 3000);
      ws.onopen = () => {
        if (socket === ws) {
          link.socketOpened();
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
    if (!haveId || (!poll && active?.readyState !== WebSocket.OPEN)) return;
    remaining -= dt;
    // 备用通道下状态上报降频：采样间隔由 0.1 s 放宽到 0.5 s（2 Hz），只发最新一帧。
    const interval = poll ? pollSampleIntervalSeconds : sampleInterval;
    if (remaining > 0 || (!poll && active!.bufferedAmount > maximumBufferedBytes)) return;
    remaining = remaining > -interval ? remaining + interval : interval;
    if (domain === 'mountain') {
      if (!isMountainPresenceFoot(local.east, local.north, local.height)) return;
      writePresencePose({ ...local, north: local.north - mountainPresenceNorthOrigin }, seq, outgoing);
    } else if (domain === 'summit') {
      const safe=toSummitPresencePose(local);if(!safe)return;
      writePresencePose(safe,seq,outgoing);
    } else if (domain === 'west') {
      if (!isWestPresenceFoot(local.east, local.north, local.height)) return;
      writePresencePose({
        ...local, east: local.east - westPresenceEastOrigin, height: local.height - westPresenceHeightOrigin,
      }, seq, outgoing);
    } else if (domain === 'sky') {
      const safe = toSkyCityPresencePose(local);
      if (!safe) return; // Never let the legacy uint16 centimetres clamp world Y750+.
      writePresencePose(safe, seq, outgoing);
    } else if (domain === 'mine') {
      const safe = toMinePresencePose(local);
      if (!safe) return; // Never let the legacy uint16 centimetres clamp world -90.
      writePresencePose(safe, seq, outgoing);
    } else writePresencePose(local, seq, outgoing);
    const position = outgoing.getUint32(2, true);
    const heightYaw = outgoing.getUint32(6, true);
    const changed = position !== lastPosition || heightYaw !== lastHeightYaw;
    if (!changed && !moving) return;
    // Send one terminal pose at the moving → stationary edge so peers stop extrapolating.
    if (poll) poll.pendingState = outgoing.buffer.slice(0);
    else {
      try { active!.send(outgoing.buffer); }
      catch { connectionLost(); return; }
    }
    seq = (seq + 1) & 65535;
    moving = changed && lastPosition !== -1;
    lastPosition = position;
    lastHeightYaw = heightYaw;
  }

  function sendChat(scope: TownChatScope, text: string) {
    if (joinedId === null || joinedName === undefined || !sendEvent(JSON.stringify({ type: 'chat', scope, text }))) return false;
    chat.receive({ id: joinedId, name: joinedName, scope, text }, true);
    return true;
  }
  function sendEvent(bytes: string | Uint8Array) {
    if (!haveId) return false;
    if (poll) {
      // 备用通道：事件先入队，随 2 Hz 轮询往返批量发出（失败自动重发）。
      pushPollEvent(poll.outEvents, bytes);
      return true;
    }
    const active = socket;
    if (active?.readyState !== WebSocket.OPEN || active.bufferedAmount > maximumBufferedBytes) return false;
    try { active.send(bytes); return true; }
    catch { connectionLost(); return false; }
  }

  /** One ice-palace request/response round trip: the server's result frame
   * (matched by requestId) is the only verdict; a missing reply settles
   * false after the timeout so the activity never hangs on a dead room. */
  function requestIcePalace(kind: 'ice-palace-rite' | 'ice-palace-fragment', payload: Readonly<Record<string, string>>): Promise<boolean> {
    if (!icePalaceSupported) return Promise.resolve(false);
    const requestId = 'ip' + (++icePalaceRequestSeq).toString(36) + Date.now().toString(36);
    return new Promise<boolean>(resolve => {
      const settle = (accepted: boolean) => { if (icePalacePending.delete(requestId)) resolve(accepted); };
      icePalacePending.set(requestId, settle);
      setTimeout(() => settle(false), 6_000);
      if (!sendEvent(JSON.stringify({ type: 'event', kind, requestId, ...payload }))) settle(false);
    });
  }

  function samplePhotoClock() {
    if (!haveId || (!photoSupported && !townNight.state())) return;
    const sentAt = performance.now();
    if (sentAt < nextClockSample || !sendEvent(JSON.stringify({ type: 'clock', sentAt }))) return;
    clockRequest = sentAt;
    nextClockSample = sentAt + 60_000;
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
    for (const event of bellEvents) onBellEvent?.(event);
    bellEvents.length = 0;
    for (let i = 0; i < 40 && snowfightWallEvents.length; i++) {
      const event = snowfightWallEvents.shift();
      if (event) onSnowfightWallEvent?.(event);
    }
    if (!snowballEvents.length && !chatEvents.length) return;
    const end = performance.now() + eventFrameBudgetMs;
    for (let i = 0; i < eventFrameLimit; i++) {
      const snowball = snowballEvents.shift();
      if (snowball) onSnowballEvent?.(snowball);
      else {
        const message = chatEvents.shift();
        if (!message) break;
        chat.receive(message);
      }
      if (performance.now() >= end) break;
    }
  }

  async function verifyOwner() {
    if (!ownerInput || ownerVerified || !haveId || joinedId === null) return;
    if (!ownerNonce) {
      sendEvent(JSON.stringify({ type: 'owner-challenge-request' }));
      return;
    }
    if ([...ownerInput.value].length < 10) return;
    const current = joinedId;
    const nonce = ownerNonce;
    ownerNonce = undefined;
    const bytes = new TextEncoder().encode(ownerInput.value + nonce);
    ownerInput.value = '';
    try {
      const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
      if (joinedId !== current || !haveId) return;
      const proof = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
      sendEvent(JSON.stringify({ type: 'owner-proof', proof }));
    } finally {
      bytes.fill(0);
    }
  }

  ownerSubmit?.addEventListener('click', () => { void verifyOwner().catch(() => {}); });
  ownerInput?.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.preventDefault();
      ownerSubmit?.click();
      ownerInput.blur();
    }
  });
  ownerFollow?.addEventListener('change', () => {
    if (ownerVerified && !ownerFollow.checked) sendEvent(JSON.stringify({ type: 'owner-mascot-stop' }));
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      scheduleConnection();
      if (ceremonyArrival) scheduleCeremonyArrival();
    } else cancelRetryTimer();
  });
  window.addEventListener('pagehide', () => {
    inTown = false;
    resetRetry();
    disconnect(true);
  });

  return {
    serverNow: clock.now,
    cableServerNow:()=>haveId&&cableLineSupported&&cableClockReady?clock.now():undefined,
    /** Latest server-authored cable repair state for a line, or undefined
     * when the room predates the cable authority or no frame arrived yet. */
    getCableLineState: (line: Za36CableRepairLine) => haveId&&cableLineSupported ? cableLineStates.get(line) : undefined,
    getCableLineOpenedAt: (line:Za36CableRepairLine)=>haveId&&cableLineSupported?cableOpenedAt.get(line):undefined,
    getCableLineWokeAt: (line:Za36CableRepairLine)=>haveId&&cableLineSupported?cableWokeAt.get(line):undefined,
    getCableLineFlags: (): CableLineFlags => haveId&&cableLineSupported?cableLineFlags:{cableLine1Open:false,cableLine2Open:false},
    /** Submit one repair event; the authority's broadcast frame is the
     * only state change a client ever applies. Returns false offline. */
    sendCableRepair: (line: Za36CableRepairLine, event: Za36CableRepairEvent) =>
      haveId && cableLineSupported && sendEvent(JSON.stringify({ type: 'event', kind: 'cable-repair', line, event })),
    sendSummitCableRelease:()=>domain==='summit'&&haveId&&cableLineSupported&&sendEvent(JSON.stringify({type:'event',kind:'cable-release-summit'})),
    /** Latest per-peer ice-palace rite snapshot from the room authority;
     * every rite reads unavailable until its policy store exists. */
    getIcePalaceRiteState: (): IcePalaceRiteState => icePalaceRiteState,
    requestIcePalaceRite: (rite: IcePalaceRite) => requestIcePalace('ice-palace-rite', { rite }),
    /** Whether the palace wreckage fragment is still unclaimed in this room. */
    icePalaceFragmentPresent: () => icePalaceFragmentPresent,
    requestIcePalaceFragment: (id: string) => requestIcePalace('ice-palace-fragment', { id }),
    getTownNightWindow: townNight.state,
    /** Latest underground river snapshot relayed by the mine room, or
     * undefined until one arrives. Raw on purpose: the certified port
     * (town-c-water-snapshot-port) validates it at consumption. */
    getUndergroundWater: () => undergroundWaterSnapshot as
      import('../../../src/shared/town-c-water-snapshot-port.js').AcceptedUndergroundWaterSnapshot | undefined,
    /** True server-authored weather state or undefined when a legacy room lacks G-09. */
    getTownOutdoorWeather: townWeather.state,
    getTownWeatherDawnEpoch: townWeather.dawnEpoch,
    onTownOutdoorWeatherWarning: townWeather.onWarning,
    townNightConnectedAt: townNight.connectedAt,
    onTownNightBeacon: townNight.onBeacon,
    northRidgeNightOpen: () => townNight.state()?.canEnterRestricted === true,
    setMountainDomain(enabled: boolean, mountainScene?: Scene) {
      if (enabled) switchDomain('mountain', mountainScene);
      else if (domain === 'mountain') switchDomain('town');
    },
    setSummitDomain(enabled:boolean,summitScene?:Scene){
      if(enabled&&summitScene)switchDomain('summit',summitScene);
      else if(!enabled&&domain==='summit')switchDomain('town');
    },
    setWestDomain(enabled: boolean) {
      if (enabled && domain !== 'mountain' && domain !== 'summit' && domain !== 'sky' && domain !== 'mine') switchDomain('west');
      else if (!enabled && domain === 'west') switchDomain('town');
    },
    /** Only the dream-chain transition may call this, at the descent blackout / return landing. */
    setMineDomain(enabled: boolean) {
      if (enabled) switchDomain('mine');
      else if (domain === 'mine') switchDomain('west');
    },
    /** Only the starport transition authority may call this after a successful transfer. */
    setSkyCityDomain(enabled: boolean, skyScene?: Scene, returnMountainScene?: Scene) {
      // Do not connect the sky room while painting avatars onto the town scene.
      if (enabled && skyScene) switchDomain('sky', skyScene);
      else if (!enabled && domain === 'sky' && returnMountainScene) switchDomain('mountain', returnMountainScene);
    },
    summitPassportAvailable: () => haveId && summitPassportSupported,
    requestSummitPassport(action: SummitPassportAction) {
      return summitPassportSupported && sendEvent(JSON.stringify({ type: 'event', kind: 'summit-passport', action }));
    },
    onSummitPassport(handler: (reply: SummitPassportReply) => void) { onSummitPassport = handler; },
    onCeremonyArrival(handler: (landing: CeremonyArrival) => void) {
      onCeremonyArrival = handler;
      if (ceremonyArrival) scheduleCeremonyArrival();
    },
    ownerFollowsMascot: () => ownerVerified && !!ownerFollow?.checked,
    sendMascot(pose: PresencePose) {
      const time = performance.now();
      if (domain==='summit'||!ownerVerified || !ownerFollow?.checked || time < nextMascotSample) return;
      writePresencePose(pose, mascotSeq, mascotWire);
      mascotWire.setUint16(0, MASCOT_ACTOR_ID, true);
      if (sendEvent(new Uint8Array(mascotWire.buffer))) {
        nextMascotSample = time + (poll ? pollIntervalMs : 100);
        mascotSeq = (mascotSeq + 1) & 65535;
      }
    },
    sampleRemoteMascot() {
      const last = mascotHistory.at(-1);
      const now = performance.now();
      if (!last || now - last.time > 2250) return;
      const previous = mascotHistory.at(-2);
      samplePresencePose(mascotHistory, now, mascotPose);
      const speed = previous && now - last.time < 300
        ? Math.min(7.5, Math.hypot(last.east - previous.east, last.north - previous.north) * 1000 /
          Math.max(1, last.time - previous.time)) : 0;
      return { x: mascotPose.east, n: mascotPose.north, yaw: mascotPose.yaw, ground: mascotPose.height, speed };
    },
    photoPlayerId: () => joinedId ?? 1,
    onPlazaPhoto(handler: (notice: PlazaPhotoNotice) => void) { showPhoto = handler; },
    requestPlazaPhoto() {
      return photoSupported && sendEvent(JSON.stringify({ type: 'event', kind: 'plaza-photo-request' }));
    },
    leavePlazaPhoto(id: number) {
      if (photoSupported) sendEvent(JSON.stringify({ type: 'event', kind: 'plaza-photo-opt-out', id }));
    },
    nearbyPhotoPeople() {
      return plazaPhotoLineup([{ id: joinedId ?? 1, name: joinedName ?? getName(), east: local.east, north: local.north, height: local.height }, ...actors.values()]);
    },
    renderPlazaPhoto(people: readonly PlazaPhotoPerson[], view: PerspectiveCamera, showNames: boolean) {
      avatars ??= createPresenceAvatars(avatarScene, camera, heightAt);
      avatars.render(people.map(person => ({ ...person, yaw: Math.PI })), undefined, view, showNames);
    },
    selfId: () => joinedId,
    playerName: () => joinedName ?? getName(),
    townRoster: (): readonly string[] | undefined => joinedId !== null && joinedName ? [joinedName, ...roster.values()] : undefined,
    onlineThroneOwned: () => iceThroneSupported ? crownedId !== null && crownedId === joinedId : undefined,
    remoteCrown: () => crownedId === null ? undefined : renderList.find(actor => actor.id === crownedId),
    setActivityPose(pose: TownAvatarPose) { activityPose = pose; },
    chatFocused: chat.focused,
    snowballName: (id: number) => joinedId === id ? joinedName : roster.get(id),
    getSnowballPeers: (): readonly (PresencePose & { id: number; name: string })[] => renderList,
    sendSnowballThrow: (event: SnowballThrow) => sendEvent(encodeSnowballThrow(event)),
    sendSnowballHit: (event: SnowballHit) => sendEvent(encodeSnowballHit(event)),
    snowfightAvailable: () => snowfightSupported,
    freeSnowWallsAvailable: () => freeSnowWallsSupported,
    requestSnowfightStart: () => sendEvent(JSON.stringify({ type: 'event', kind: 'snowfight-start' })),
    sendSnowfightPlace: (gx: number, gy: number) => sendEvent(encodeWallPlace(gx, gy)),
    sendSnowfightWallHit: (event: { gx: number; gy: number; layer: number; ballId: number; throwerId: number }) =>
      sendEvent(encodeWallHit(event)),
    sendSnowfightSledSmash: (gx: number, gy: number, speed: number) =>
      sendEvent(encodeSledSmash({ gx, gy, speed })),
    onSnowfightWallEvent(handler: (event: SnowfightRelayEvent) => void) { onSnowfightWallEvent = handler; },
    onSnowfightState(handler: (state: SnowfightState) => void) {
      onSnowfightState = handler;
      if (snowfightState) handler(snowfightState);
    },
    snowfightState: () => snowfightState,
    onSnowfightRejected(handler: (reason: string) => void) { onSnowfightRejected = handler; },
    animateSnowballThrow(id: number) {
      const actor = actors.get(id);
      if (actor) actor.throwGestureStarted = performance.now();
    },
    onSnowballEvent(handler: (event: SnowballRelayEvent) => void) { onSnowballEvent = handler; },
    sendGrandPrixResult: (totalMs: number) => sendEvent(JSON.stringify({ type: 'event', kind: 'grand-prix', totalMs })),
    onGrandPrixResult(handler: (result: GrandPrixResult) => void) { onGrandPrixResult = handler; },
    onTestFireworks(handler: (seed: number, ageSeconds: number) => void) { onTestFireworks = handler; },
    riderSlot: () => (Math.max(1, joinedId ?? 1) - 1) % 12,
    onFireworks(handler: (seed: number, theme: FireworksTheme, ageMs: number, own: boolean) => void) {
      playFireworks = handler;
    },
    onFirecracker(play: typeof playFirecracker, reject: typeof rejectFirecracker) {
      playFirecracker = play;
      rejectFirecracker = reject;
    },
    requestFirecracker(request: PersonalFireworkRequest): 'offline' | 'sent' | 'busy' {
      if (!haveId) return 'offline';
      if (!firecrackersSupported) return 'offline';
      return sendEvent(JSON.stringify({ ...request, type: 'event', kind: 'personal-firework' })) ? 'sent' : 'busy';
    },
    requestFireworks(seed: number, theme: FireworksTheme) {
      return fireworksSupported && sendEvent(JSON.stringify({ type: 'event', kind: 'fireworks', seed, theme }));
    },
    bellSupported: () => bellSupported,
    requestBellStart() {
      return bellSupported && sendEvent(JSON.stringify({ type: 'event', kind: 'bell-start' }));
    },
    sendBellTouch() {
      return sendEvent(JSON.stringify({ type: 'event', kind: 'bell-touch' }));
    },
    onBellEvent(handler: (event: BellEvent) => void) { onBellEvent = handler; },
    setBellHolder(id: number | null) {
      bellHolderId = id;
      avatars?.setHighlight(id);
    },
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
      if (active) {
        link.enterTown();
        scheduleConnection();
      } else {
        link.leaveTown();
        resetRetry();
        disconnect(true);
      }
    },
    update(dt: number) {
      if (!socket && !poll) return;
      townNight.tick();
      sendPose(dt);
      samplePhotoClock();
      syncActivityPoses();
      drainEvents();
      if (!show || !actors.size) { renderList.length = 0; avatars?.clear(); return; }
      avatars ??= createPresenceAvatars(avatarScene, camera, heightAt);
      avatars.setHighlight(bellHolderId);
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
      avatars.render(renderList, chat.bubble);
    },
  };
}
