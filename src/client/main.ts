import { detect, type NetworkConfig } from "../net/mode";
import type { Channel } from "../net/channel";
import { openSocket } from "../net/ws-client";
import { RoomClient } from "../net/peer";
import { startHosting, type Hosting } from "./hosting";
import "./style.css";
import { MovementSounds } from "./audio/movement";
import * as THREE from "three";
import { initPhysics, Simulation, type Character } from "../shared/simulation";
import { STEP, PALETTE, CHARACTER_PALETTE, WEAPON, MELEE, HORN, DOORS, propKind } from "../shared/level";
import {
  BUTTON,
  decodeSnapshot,
  encodeInputs,
  type Input,
  type Snapshot,
  type PropState,
} from "../shared/protocol";
import { GameScene } from "./rendering/scene";
import { Voice } from "./audio/voice";
import { TOWN_LAYOUT } from "../shared/town";
import { setupPostOffice } from "./post-office";
import { setupMuseum } from "./museum";
import { getStored, setStored, removeStored, readRoomSession } from "./storage";
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
$("app").innerHTML = `<div id="world"></div><div id="shade" class="shade"></div>
<header class="topbar"><button id="about-button" class="brand" aria-label="关于跨年小镇"><span class="brand-mark"><svg viewBox="0 0 192 192" aria-hidden="true"><rect x="17" y="17" width="158" height="158" rx="46" fill="#26382d" transform="rotate(-11 96 96)"/><g fill="#d5ec99"><path d="M53.5 34.5L65.95 54.43A23.5 23.5 0 1 1 76.87 36.96Z"/><path d="M4 114a49.5 49.5 0 0 1 99 0Z"/><path d="M140 87.5L126.02 66.77A25 25 0 1 1 115 87.5Z"/><path d="M89 170a50.5 50.5 0 0 1 101 0Z"/></g></svg></span><span class="brand-word">UNWRITTEN <b>2027</b></span><small></small></button><div id="top-actions" class="top-actions"><span id="net-mode" class="pill net-mode" hidden><i class="dot"></i> <span id="net-mode-text"></span></span><button id="help-button" class="icon-button" aria-label="操作与帮助">?</button></div></header>
<main id="lobby" class="lobby"><div class="eyebrow">2026 的回忆 · 2027 的相遇</div><h1><span class="line"><span>一起走进</span></span><span class="line"><span><em>新的一年。</em></span></span></h1><p class="intro">一座留住回忆的跨年小镇。<br>和朋友走进雪夜钟楼广场。</p><a class="github-button" href="https://github.com/disdorqin/unwritten-2027" target="_blank" rel="noopener noreferrer" aria-label="查看项目仓库">项目仓库 <span class="github-arrow" aria-hidden="true">↗</span></a><form id="entry" class="entry-card"><label for="name">你想叫什么名字？</label><div class="name-input"><div class="avatar-chip">✳</div><input id="name" aria-label="你的昵称" autocomplete="nickname" maxlength="20" placeholder="输入昵称" required value="访客"></div><button class="primary" id="create" type="submit">创建小镇 <span>↗</span></button><div class="separator">或加入朋友的小镇</div><div class="join-row"><input id="join-code" aria-label="小镇邀请码" placeholder="小镇邀请码" maxlength="6" autocomplete="off"><button id="join" type="button">加入 →</button></div><div class="entry-note">无需注册，分享邀请链接即可加入。</div><p id="entry-error" class="error" hidden></p></form><div class="lobby-foot"><span>第一人称探索</span><span>和朋友相遇</span><span>留下共同回忆</span></div><p class="mobile-notice">手机可使用方向按钮与滑动转向。</p></main>
<footer id="footer" class="footer"><span>在雪夜相聚，迎接新的一年。</span><span class="version">UNWRITTEN 2027 &nbsp; / &nbsp; 开发中</span></footer>
<div id="hud" class="hud" hidden><div class="room-bar"><div><small>小镇邀请码</small><span id="room-code" class="room-code">------</span></div><button id="copy-room" aria-label="复制小镇邀请">复制邀请 ↗</button><span id="player-count" class="count">1 人在线</span></div><div id="crosshair" class="crosshair"></div><div id="hitflash" class="hitflash"></div><div id="interact" class="interact" hidden></div><div class="bottom-left"><span class="zone-icon">⌂</span><div><div id="zone-name" class="zone-name">钟楼广场</div><div id="zone-desc" class="zone-desc">雪夜相遇 · 北京时间跨年</div></div></div><div class="voice-controls"><button id="enable-voice">Enable voice</button><button id="mute" hidden aria-label="Mute microphone">Mic on</button><select id="voice-mode" aria-label="Microphone mode"><option value="open">Open mic</option><option value="ptt">Push to talk</option></select><span id="speaking-light" class="speaking-light"></span></div><div class="bottom-right"><button id="friends-button">同行伙伴 <span id="friend-number">1</span></button><button id="debug-button">运行状态 <span>⌁</span></button></div><div id="pause" class="pause"><div class="eyebrow" style="justify-content:center">和朋友一起过年</div><h2>走进雪夜小镇。</h2><p>邀请朋友一起散步、聊天。<br>更多建筑和互动正在制作。</p><button id="resume" class="primary">进入广场 →</button><small>WASD 移动 · 鼠标转向 · E 阅读/写信 · Esc 暂停</small></div></div>
<aside id="friends" class="drawer" hidden><button class="close" data-close="friends" aria-label="关闭伙伴列表">×</button><h3>同行伙伴</h3><div id="member-list"></div><button id="solo-tab" class="primary">在新标签页加入 <span>↗</span></button><p class="debug-note">打开新标签页，可用另一个昵称加入同一座小镇。</p><button id="leave" class="primary" style="background:transparent;color:#637554;border-color:#c4d0b6">离开小镇</button></aside>
<aside id="debug" class="drawer" hidden><button class="close" data-close="debug" aria-label="关闭运行状态">×</button><h3>运行状态</h3><div id="metrics" class="metrics"></div><div id="peer-debug"></div><p id="codec-status" class="debug-note"></p><p id="net-detail" class="debug-note"></p></aside>
<aside id="help" class="drawer" hidden><button class="close" data-close="help" aria-label="关闭操作帮助">×</button><h3>小镇游览指南</h3><div class="help-grid"><div><kbd class="key">W A S D</kbd></div><span>移动</span><div><kbd class="key">鼠标</kbd></div><span>转向</span><div><kbd class="key">Tab</kbd></div><span>切换第一/第三人称</span><div><kbd class="key">Shift</kbd></div><span>奔跑</span><div><kbd class="key">Ctrl / C</kbd></div><span>蹲下</span><div><kbd class="key">Space</kbd></div><span>跳跃</span><div><kbd class="key">E</kbd></div><span>阅读展板 / 写信 / 物品互动</span><div><kbd class="key">Esc</kbd></div><span>关闭阅读窗口或暂停</span></div><p class="about-copy">手机：左下方向按钮移动，在场景中滑动转向，右下按钮跳跃；走近展板或书桌后点击阅读或写信。</p><p class="about-copy">广场左侧是2026纪念馆，当前开放导览样件；右侧是新年邮局，走到书桌旁写信。信件保存到服务器，不进入公共聊天。</p><p class="about-copy">在左侧聊天框和同一座小镇的朋友交流。首版暂不开放语音。</p></aside>
<aside id="about" class="drawer" hidden><button class="close" data-close="about" aria-label="关闭关于">×</button><h3>UNWRITTEN 2027 · 跨年小镇</h3><p class="about-copy">和朋友在雪夜小镇散步、聊天，走进纪念馆，写一封给2027的信。</p><p class="about-copy">基于 MIT 许可的 Friendslop Base 开发，保留上游代码与角色素材署名。</p><p class="debug-note">Three.js · Rapier · TypeScript<br>角色与底层音效基座：Friendslop Base</p></aside><div id="toast" class="toast" hidden></div><div id="loading" class="loading">正在打开雪夜小镇…</div>`;
const scene = (() => {
  try { return new GameScene($("world"), "town"); }
  catch (error) {
    const loading = $("loading");
    loading.setAttribute("role", "alert");
    loading.style.flexDirection = "column";
    loading.style.gap = "20px";
    loading.style.padding = "24px";
    loading.style.textAlign = "center";
    loading.textContent = "当前浏览器无法显示 3D 小镇。请使用支持 WebGL 2 的浏览器，并检查硬件加速是否开启。";
    const retry = document.createElement("button");
    retry.textContent = "重新打开小镇";
    retry.onclick = () => location.reload();
    loading.append(retry);
    throw error;
  }
})();
const museum = setupMuseum(() => { previewControls = true; keys.clear(); document.exitPointerLock(); $("pause").hidden = true; });
const postOffice = setupPostOffice({
  send,
  canSave: () => connected && network?.mode === "server",
  pauseForPanel: () => { previewControls = true; keys.clear(); document.exitPointerLock(); $("pause").hidden = true; },
});
$("hud").insertAdjacentHTML("beforeend", `<section id="town-chat" aria-label="小镇聊天"><div id="chat-messages" role="log" aria-live="polite"></div><form id="chat-form"><input id="chat-text" aria-label="聊天消息" maxlength="300" placeholder="和小镇里的朋友说句话…" autocomplete="off"><button type="submit">发送</button></form></section><div id="town-move"><button data-move="KeyW" aria-label="前进">↑</button><button data-move="KeyA" aria-label="左移">←</button><button data-move="KeyS" aria-label="后退">↓</button><button data-move="KeyD" aria-label="右移">→</button></div><button id="town-jump" data-move="Space">跳跃</button>`);
function appendChat(message: { name: string; text: string }) {
  if (typeof message?.name !== "string" || typeof message?.text !== "string") return;
  const row = document.createElement("p");
  row.textContent = `${message.name}：${message.text}`;
  $("chat-messages").append(row);
  while ($("chat-messages").childElementCount > 50) $("chat-messages").firstElementChild!.remove();
  $("chat-messages").scrollTop = $("chat-messages").scrollHeight;
}
let sim: Simulation | undefined,
  local: Character | undefined,
  socket: Channel | undefined,
  id = 0,
  code = "",
  token = "",
  name = "访客",
  seq = 0,
  baseline = 0,
  action = 0;
let connected = false,
  intentional = false;
let cameraMode: "first" | "third" = "first";
let yaw = 0,
  pitch = 0,
  cameraYaw = 0,
  cameraPitch = 0,
  acc = 0,
  last = performance.now(),
  ping = 0,
  tickRate = 60,
  tickCost = 0,
  rx = 0,
  tx = 0,
  correction = 0,
  latestTick = 0;
let members: {
  id: number;
  color: number;
  name: string;
  connected: boolean;
  voiceReady: boolean;
}[] = [];
const keys = new Set<string>(),
  ballHeights = new Map<number, { y: number; dy: number }>(),
  pending: Input[] = [],
  outgoing: Input[] = [],
  baselines = new Map<number, PropState[]>(),
  snapshots: { s: Snapshot; time: number }[] = [];
const offset = new THREE.Vector3();
let noticeTimer: ReturnType<typeof setTimeout>,
  hitTimer: ReturnType<typeof setTimeout>,
  lastUse = 0;
function toast(message: string) {
  $("toast").textContent = message;
  $("toast").hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => ($("toast").hidden = true), 3500);
}
function send(data: unknown) {
  if (socket?.open) {
    socket.send(JSON.stringify(data));
    tx++;
  }
}
const voice = new Voice(
  send,
  (who, on) => {
    scene.speaking(who, on);
    if (who === id) $("speaking-light").classList.toggle("on", on);
  },
  () => {
    if (voice.enabled) {
      $("enable-voice").textContent = "Audio on";
      $("mute").hidden = false;
      $("mute").textContent = voice.muted
        ? "Mic muted"
        : voice.mode === "ptt"
          ? "Hold V to talk"
          : "Mic on";
      $("mute").classList.toggle("muted", voice.muted);
      $("mute").classList.toggle("active", voice.gate);
    }
    $("enable-voice").title = voice.status;
  },
);
const params = new URLSearchParams(location.search);
let network: NetworkConfig;
const networkReady = detect(params).then((config) => {
  network = config;
  voice.iceServers = config.iceServers;
  const server = config.mode === "server";
  const badge = $("net-mode");
  $("net-mode-text").textContent = server
    ? "小镇在线"
    : "浏览器临时小镇";
  badge.title = server
    ? "由小镇服务器同步玩家位置和互动。"
    : "当前由创建者的浏览器临时主持；请保持其页面打开。部分网络可能无法连接。";
  badge.dataset.mode = config.mode;
  badge.hidden = false;
  $("net-detail").innerHTML = server
    ? "Game /ws + voice /voice<br>One Node process. One HTTP port."
    : "Game + voice over WebRTC to the host<br>No server. The host's browser owns the room.";
});
$("join-code").setAttribute("value", params.get("room") ?? "");
const rememberedName = getStored("localStorage", "friendslop:name");
if (rememberedName) $("name").setAttribute("value", rememberedName);
if (params.get("name")) $("name").setAttribute("value", params.get("name")!);
if (params.has("fresh")) {
  removeStored("sessionStorage", "friendslop:session");
  const clean = new URL(location.href);
  clean.searchParams.delete("fresh");
  history.replaceState(null, "", clean);
}
const movementSounds = new MovementSounds((position, kind) => voice.spatial?.effect(position, kind));
function setPlaying(value: boolean) {
  if (!value) { postOffice.reset(); museum.reset(); }
  movementSounds.clear();
  document.body.classList.toggle("playing", value);
  for (const name of ["lobby", "shade", "footer", "top-actions"])
    $(name).hidden = value;
  $("hud").hidden = !value;
  scene.setPlaying(value);
  if (value) $("pause").hidden = false;
}
async function join(wanted: string) {
  if (connected) return;
  name = $<HTMLInputElement>("name").value.trim() || "访客";
  setStored("localStorage", "friendslop:name", name);
  $("entry-error").hidden = true;
  $<HTMLButtonElement>("create").disabled = true;
  intentional = false;
  code = wanted;
  token = "";
  const saved = readRoomSession();
  if (saved?.code === code) token = saved.token;
  await connect();
}
let hosting: Hosting | undefined;
let rooms: RoomClient | undefined;
/** In p2p mode an empty code means "create a room", which means host it. */
async function openChannel(kind: "game" | "voice") {
  if (network.mode === "server")
    return openSocket(kind === "game" ? "/ws" : "/voice");
  if (kind === "game" && !code) {
    hosting?.dispose();
    hosting = await startHosting(network.broker);
    code = hosting.code;
  }
  if (hosting && code === hosting.code) return hosting.local(kind);
  return (rooms ??= new RoomClient(network.broker)).open(code, kind);
}
async function connect() {
  await networkReady;
  let channel: Channel;
  try {
    channel = await openChannel("game");
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "暂时无法连接这座小镇，请稍后重试。";
    $("entry-error").textContent = message;
    $("entry-error").hidden = false;
    toast(message);
    $<HTMLButtonElement>("create").disabled = false;
    return;
  }
  socket = channel;
  voice.openTransport = () => openChannel("voice");
  send({ type: "join", code, name, token });
  channel.onmessage = (data) => {
    rx++;
    try {
      if (typeof data !== "string") {
        snapshot(decodeSnapshot(data));
        return;
      }
      const m = JSON.parse(data);
      if (m.type === "letter-saved" || m.type === "letter-error") { postOffice.message(m); return; }
      if (m.type === "chat") { appendChat(m.message); return; }
      if (m.type === "chat-error") { toast(m.message); return; }
      if (m.type === "welcome") {
        id = m.id;
        code = m.code;
        token = m.token;
        seq = m.seq;
        pending.length = outgoing.length = snapshots.length = 0;
        baselines.clear();
        baseline = 0;
        sim?.dispose();
        sim = new Simulation(true, m.world === "town" ? TOWN_LAYOUT : undefined);
        $("chat-messages").replaceChildren();
        for (const message of m.chat ?? []) appendChat(message);
        if (Array.isArray(m.doors)) sim.syncDoors(m.doors);
        local = sim.addPlayer(id);
        connected = true;
        setStored(
          "sessionStorage",
          "friendslop:session",
          JSON.stringify({ code, token }),
        );
        $("room-code").textContent = code;
        setPlaying(true);
        voice.configure(id, code, m.ticket);
        $<HTMLButtonElement>("create").disabled = false;
        if (import.meta.env.DEV)
          (window as any).__friendslop = {
            get state() {
              return local?.state;
            },
            get members() {
              return members;
            },
            get voice() {
              return voice;
            },
            get scene() {
              return scene;
            },
            get sim() {
              return sim;
            },
            get cameraMode() {
              return cameraMode;
            },
            input: (key: string, down: boolean) =>
              down ? keys.add(key) : keys.delete(key),
            action: interact,
            shoot: fire,
            get doors() {
              return sim?.doorStates();
            },
            look: (y: number, p: number) => {
              yaw = y;
              pitch = p;
              cameraYaw = y;
              cameraPitch = p;
            },
            join,
            send,
          };
      }
      if (m.type === "members") {
        members = m.members;
        $("player-count").textContent =
          `${members.filter((m) => m.connected).length} 人在线`;
        $("friend-number").textContent = String(members.length);
        for (const [pid] of scene.avatars)
          if (pid < 60000 && !members.some((m) => m.id === pid))
            scene.removePlayer(pid);
        voice.updateMembers(members);
        renderMembers();
      }
      if (m.type === "pong") {
        ping = Math.round(performance.now() - m.time);
        tickCost = Number.isFinite(m.cost) ? m.cost : 0;
        tickRate = Number.isFinite(m.rate) ? m.rate : 0;
      }
      if (m.type === "signal") voice.signal(m.peer, m.data);
      if (m.type === "route")
        voice.route(m.peer, m.relay, m.epoch, m.reason, m.forced);
      if (m.type === "speaking") voice.speakingFrom(m.id, m.active);
      if (m.type === "sound") {
        const s =
          m.id === id
            ? local?.state
            : snapshots.at(-1)?.s.players.find((p) => p.id === m.id);
        if (s) voice.spatial?.effect(s, m.kind);
        if (m.kind === "honk" && m.object) scene.useProp(m.object, "horn");
      }
      if (m.type === "shot") {
        // Our own shot was drawn the moment we pulled the trigger.
        if (m.id !== id) {
          scene.tracer(m, scene.muzzle(m.object));
          voice.spatial?.effect(m, "shoot");
        }
        if (m.hit) {
          const struck =
            m.hit === id
              ? local?.state
              : snapshots.at(-1)?.s.players.find((p) => p.id === m.hit);
          if (struck) voice.spatial?.effect(sim!.eye(struck), "hit");
          if (m.hit === id) {
            $("hitflash").classList.add("on");
            clearTimeout(hitTimer);
            hitTimer = setTimeout(
              () => $("hitflash").classList.remove("on"),
              260,
            );
          }
        }
      }
      if (m.type === "swing") {
        scene.useProp(m.object, "bat");
        const swinger =
          m.id === id
            ? local?.state
            : snapshots.at(-1)?.s.players.find((p) => p.id === m.id);
        if (swinger) voice.spatial?.effect(sim!.eye(swinger), "swing");
        if (m.hit) {
          const struck =
            m.hit === id
              ? local?.state
              : snapshots.at(-1)?.s.players.find((p) => p.id === m.hit);
          if (struck) voice.spatial?.effect(sim!.eye(struck), "hit");
          if (m.hit === id) {
            $("hitflash").classList.add("on");
            clearTimeout(hitTimer);
            hitTimer = setTimeout(() => $("hitflash").classList.remove("on"), 260);
          }
        }
      }
      if (m.type === "door") {
        sim?.setDoor(m.id, m.open);
        const door = DOORS.find((d) => d.id === m.id);
        if (door)
          voice.spatial?.effect(
            { x: door.p[0], y: door.p[1], z: door.p[2] },
            "door",
          );
      }
      if (m.type === "action-result" && !m.accepted)
        toast(
          ["shoot", "swing", "honk"].includes(m.action)
            ? "That item is not ready yet."
            : m.action === "door"
              ? "That door will not budge from here."
              : "That object is out of reach or already held.",
        );
      if (m.type === "error") {
        $("entry-error").textContent = m.message;
        $("entry-error").hidden = false;
        toast(m.message);
        $<HTMLButtonElement>("create").disabled = false;
        if (!connected) {
          intentional = true;
          removeStored("sessionStorage", "friendslop:session");
          voice.disconnect();
          setPlaying(false);
          document.exitPointerLock();
        }
      }
    } catch (err) {
      console.error(err);
    }
  };
  channel.onclose = () => {
    if (socket !== channel) return;
    connected = false;
    keys.clear();
    voice.disconnect();
    $<HTMLButtonElement>("create").disabled = false;
    if (intentional) return;
    toast("连接中断，正在尝试返回小镇…");
    setTimeout(() => {
      if (!intentional && socket === channel) void connect();
    }, 1500);
  };
}
function snapshot(s: Snapshot) {
  if (!sim || !local) return;
  latestTick = s.tick;
  let props: PropState[];
  if (s.full) {
    baselines.set(s.baseline, s.props);
    baseline = s.baseline;
    while (baselines.size > 5) baselines.delete(baselines.keys().next().value!);
    props = s.props;
  } else {
    const base = baselines.get(s.baseline);
    if (!base) {
      baseline = 0;
      return;
    }
    const changes = new Map(s.props.map((p) => [p.id, p]));
    props = base.map((p) => changes.get(p.id) ?? p);
  }
  // Balls announce themselves: a reversal in the authoritative height is a bounce.
  for (const p of props) {
    if (propKind(p.id) !== "ball") continue;
    const previous = ballHeights.get(p.id),
      dy = previous ? p.y - previous.y : 0;
    if (previous && !p.owner && previous.dy < -0.05 && dy > 0.015)
      voice.spatial?.effect(p, "bounce");
    ballHeights.set(p.id, { y: p.y, dy });
  }
  const full = { ...s, props };
  snapshots.push({ s: full, time: performance.now() });
  while (snapshots.length > 25) snapshots.shift();
  sim.syncProps(props);
  const own = s.players.find((p) => p.id === id);
  if (!own) return;
  const before = new THREE.Vector3(local.state.x, local.state.y, local.state.z);
  sim.restore(local, own);
  while (pending.length && pending[0].seq <= own.ack) pending.shift();
  for (const input of pending) {
    sim.motor(local, input);
    sim.step();
  }
  const after = new THREE.Vector3(local.state.x, local.state.y, local.state.z);
  correction = before.distanceTo(after);
  if (correction < 1) offset.add(before.sub(after));
  else offset.set(0, 0, 0);
}
function interact(throwing = false) {
  if (!local || !sim) return;
  const s = local.state;
  if (!s.held && !sim.target(s)) {
    const door = sim.doorTarget(s);
    if (door && !DOORS.find((d) => d.id === door)?.auto) {
      send({ type: "action", request: ++action, action: "door", object: door });
      return;
    }
  }
  send({
    type: "action",
    request: ++action,
    action: s.held ? (throwing ? "throw" : "drop") : "pickup",
    object: sim.target(s),
  });
}
/** Use the held tool immediately; the authority still decides hits and cooldowns. */
function fire() {
  if (!local || !sim) return;
  const held = local.state.held,
    kind = propKind(held);
  if (kind !== "gun" && kind !== "bat" && kind !== "horn") return;
  const now = performance.now();
  const cooldown =
    (kind === "gun" ? WEAPON.cooldown : kind === "bat" ? MELEE.cooldown : HORN.cooldown) *
    STEP * 1000;
  if (now - lastUse < cooldown) return;
  lastUse = now;
  send({
    type: "action",
    request: ++action,
    action: kind === "gun" ? "shoot" : kind === "bat" ? "swing" : "honk",
  });
  if (kind !== "gun") {
    scene.useProp(held, kind);
    return;
  }
  const s = local.state,
    eye = sim.eye(s),
    d = sim.direction(s),
    distance = sim.reach(s),
    end = new THREE.Vector3(
      eye.x + d.x * distance,
      eye.y + d.y * distance,
      eye.z + d.z * distance,
    ),
    muzzle = scene.muzzle(held) ?? sim.muzzle(s),
    direction = end.clone().sub(new THREE.Vector3(muzzle.x, muzzle.y, muzzle.z)),
    length = direction.length();
  direction.normalize();
  scene.tracer({
    ...muzzle,
    dx: direction.x,
    dy: direction.y,
    dz: direction.z,
    distance: length,
    hit: 0,
  });
  voice.spatial?.effect(muzzle, "shoot");
}
$("entry").addEventListener("submit", (e) => {
  e.preventDefault();
  void join("");
});
$("join").onclick = () => {
  const value = $<HTMLInputElement>("join-code").value.trim().toUpperCase();
  if (value.length !== 6) {
    $("entry-error").textContent = "请输入六位小镇邀请码。";
    $("entry-error").hidden = false;
    return;
  }
  void join(value);
};
let previewControls = false;
const canvas = scene.renderer.domElement;
$("chat-form").onsubmit = e => {
  e.preventDefault();
  const input = $<HTMLInputElement>("chat-text");
  if (connected && input.value.trim()) { send({ type: "chat", text: input.value.trim() }); input.value = ""; }
};
$("chat-text").onfocus = () => {
  previewControls = true; keys.clear(); document.exitPointerLock(); $("pause").hidden = true;
};
document.querySelectorAll<HTMLButtonElement>("[data-move]").forEach(button => {
  button.onpointerdown = e => {
    if (!connected || !$("pause").hidden) return;
    button.setPointerCapture(e.pointerId); keys.add(button.dataset.move!); e.preventDefault();
  };
  button.onpointerup = button.onpointercancel = button.onlostpointercapture = () => keys.delete(button.dataset.move!);
});
let finger: { id: number; x: number; y: number } | undefined;
canvas.addEventListener("pointerdown", e => {
  if (e.pointerType !== "mouse" && connected && $("pause").hidden) {
    finger = { id: e.pointerId, x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId);
  }
});
canvas.addEventListener("pointermove", e => {
  if (finger?.id !== e.pointerId) return;
  yaw -= (e.clientX - finger.x) * 0.003;
  pitch = Math.max(-1.5, Math.min(1.5, pitch + (e.clientY - finger.y) * 0.003));
  cameraYaw = yaw; cameraPitch = pitch; finger.x = e.clientX; finger.y = e.clientY;
});
for (const event of ["pointerup", "pointercancel"]) canvas.addEventListener(event, () => { finger = undefined; });
addEventListener("blur", () => { keys.clear(); finger = undefined; });
canvas.tabIndex = 0;
canvas.setAttribute("aria-label", "雪夜小镇：点击进入，WASD移动，鼠标或触屏转向");
function pauseControls() {
  previewControls = false;
  keys.clear();
  voice.setTalk(false);
  canvas.style.cursor = "";
  $("pause").hidden = false;
  document.exitPointerLock();
}
function previewFallback() {
  if (!connected) return;
  previewControls = true;
  canvas.focus({ preventScroll: true });
  canvas.style.cursor = "grab";
  $("pause").hidden = true;
  toast("自由操作：WASD或方向按钮移动 · 拖动转向 · Esc暂停");
}
async function lock() {
  if (!connected) return;
  void voice.prepareAudio().catch(() => toast("环境音暂未启动，可点击场景重试。"));
  canvas.focus({ preventScroll: true });
  if (matchMedia("(pointer: coarse)").matches || typeof canvas.requestPointerLock !== "function") {
    previewFallback();
    return;
  }
  try {
    await canvas.requestPointerLock();
  } catch {
    previewFallback();
  }
}
$("resume").onclick = () => void lock();
/**
 * The lobby's backdrop is a camera you can turn. Anywhere that is not a control is a drag
 * handle, and only before you join — once you are in a room the pointer belongs to the game.
 */
const CONTROLS = "input, button, select, textarea, a, .entry-card, .drawer";
let drag: { id: number; x: number; y: number; time: number } | undefined;
const inLobby = (e: PointerEvent) =>
  !connected && !(e.target as Element | null)?.closest?.(CONTROLS);
addEventListener("pointerdown", (e) => {
  if (e.button !== 0 || !inLobby(e)) return;
  // Claim the gesture so a drag that starts over the headline turns the room, not the text.
  e.preventDefault();
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY, time: e.timeStamp };
  scene.grab();
  document.body.classList.add("turning");
});
addEventListener("pointermove", (e) => {
  if (!drag || e.pointerId !== drag.id) {
    if (!connected)
      scene.aim(
        (e.clientX / innerWidth) * 2 - 1,
        (e.clientY / innerHeight) * 2 - 1,
      );
    return;
  }
  if (!(e.buttons & 1)) return stopTurning();
  scene.orbitBy(
    e.clientX - drag.x,
    e.clientY - drag.y,
    (e.timeStamp - drag.time) / 1000,
  );
  drag = { id: drag.id, x: e.clientX, y: e.clientY, time: e.timeStamp };
});
function stopTurning() {
  if (!drag) return;
  drag = undefined;
  scene.letGo();
  document.body.classList.remove("turning");
}
// A button released outside the window never reaches us, so a move with nothing held ends it.
for (const end of ["pointerup", "pointercancel", "blur"])
  addEventListener(end, stopTurning);
addEventListener(
  "wheel",
  (e) => {
    if (!connected) scene.zoomBy(e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY);
  },
  { passive: true },
);
canvas.onclick = () => {
  if (connected && !document.pointerLockElement && !previewControls)
    void lock();
};
document.addEventListener("pointerlockchange", () => {
  if (document.pointerLockElement) {
    previewControls = false;
    $("pause").hidden = true;
  } else if (!previewControls) {
    keys.clear();
    voice.setTalk(false);
    $("pause").hidden = false;
  }
});
addEventListener("mousemove", (e) => {
  if (document.pointerLockElement || (previewControls && e.buttons === 1)) {
    if (cameraMode === "third") {
      cameraYaw -= e.movementX * 0.002;
      cameraPitch = Math.max(
        -1.5,
        Math.min(1.5, cameraPitch + e.movementY * 0.002),
      );
    } else {
      yaw -= e.movementX * 0.002;
      pitch = Math.max(-1.5, Math.min(1.5, pitch + e.movementY * 0.002));
    }
  }
});
addEventListener("keydown", (e) => {
  if (
    e.target instanceof HTMLInputElement ||
    e.target instanceof HTMLSelectElement ||
    e.target instanceof HTMLTextAreaElement
  )
    return;
  if (e.code === "Escape" && previewControls) {
    pauseControls();
    return;
  }
  if (e.code === "KeyV") voice.setTalk(true);
  if (e.code === "KeyM" && !e.repeat) voice.setMuted(!voice.muted);
  if (
    !document.pointerLockElement &&
    !previewControls &&
    !(import.meta.env.DEV && params.has("test"))
  )
    return;
  if (e.code === "Tab") {
    e.preventDefault();
    if (!e.repeat) {
      cameraMode = cameraMode === "first" ? "third" : "first";
      if (cameraMode === "third") {
        cameraYaw = yaw;
        cameraPitch = pitch;
      } else {
        yaw = cameraYaw;
        pitch = cameraPitch;
        scene.removePlayer(id);
      }
      toast(cameraMode === "third" ? "第三人称视角" : "第一人称视角");
    }
    return;
  }
  keys.add(e.code);
  if (["Space", "ControlLeft", "Tab"].includes(e.code)) e.preventDefault();
  if (!e.repeat && e.code === "KeyE") {
    keys.delete(e.code);
    if (!museum.open() && !postOffice.open()) interact();
  }
  if (!e.repeat && e.code === "KeyQ") interact(true);
  if (!e.repeat && e.code === "KeyF") fire();
});
addEventListener("mousedown", (e) => {
  if (e.button === 0 && connected && document.pointerLockElement) fire();
});
addEventListener("keyup", (e) => {
  keys.delete(e.code);
  if (e.code === "KeyV") voice.setTalk(false);
});
addEventListener("blur", () => {
  keys.clear();
  voice.setTalk(false);
});
// Voice is deferred for the first release. Never request microphone access.
document.querySelector<HTMLElement>(".voice-controls")!.style.display = "none";
$("enable-voice").onclick = () => toast("首版暂不开放语音");
$("mute").onclick = () => voice.setMuted(!voice.muted);
$("voice-mode").onchange = () =>
  voice.setMode($<HTMLSelectElement>("voice-mode").value as "open" | "ptt");
for (const name of ["friends", "debug", "help", "about"]) {
  $(`${name}-button`).onclick = () => {
    const open = $(name).hidden;
    for (const n of ["friends", "debug", "help", "about"]) $(n).hidden = true;
    $(name).hidden = !open;
    pauseControls();
  };
}
document
  .querySelectorAll<HTMLElement>("[data-close]")
  .forEach((b) => (b.onclick = () => ($(b.dataset.close!).hidden = true)));
$("copy-room").onclick = async () => {
  try {
    await navigator.clipboard.writeText(
      new URL(`?room=${code}`, document.baseURI).href,
    );
    toast("邀请链接已复制，发给朋友一起进入。");
  } catch {
    toast(`小镇邀请码：${code}`);
  }
};
$("solo-tab").onclick = () =>
  window.open(
    new URL(
      `?room=${code}&name=Guest%20${members.length + 1}&fresh=1`,
      document.baseURI,
    ).href,
    "_blank",
    "noopener",
  );
$("leave").onclick = () => {
  intentional = true;
  send({ type: "leave" });
  socket?.close();
  hosting?.dispose();
  hosting = undefined;
  rooms?.dispose();
  rooms = undefined;
  code = "";
  voice.disconnect();
  connected = false;
  cameraMode = "first";
  removeStored("sessionStorage", "friendslop:session");
  pauseControls();
  for (const [pid] of scene.avatars) if (pid < 60000) scene.removePlayer(pid);
  sim?.dispose();
  sim = undefined;
  local = undefined;
  setPlaying(false);
  $("friends").hidden = true;
};
function renderMembers() {
  const list = $("member-list");
  list.replaceChildren();
  for (const m of members) {
    const row = document.createElement("div");
    row.className = "member";
    const dot = document.createElement("i");
    dot.className = "member-dot";
    dot.style.background = CHARACTER_PALETTE[m.color];
    const info = document.createElement("div"),
      label = document.createElement("div"),
      status = document.createElement("small");
    label.textContent = m.name + (m.id === id ? "（你）" : "");
    status.textContent = !m.connected
      ? "正在重连…"
      : m.voiceReady
        ? "已连接"
        : "正在探索小镇";
    info.append(label, status);
    row.append(dot, info);
    list.append(row);
  }
}
/** Where you are, in the words the HUD uses. Mirrors the acoustics regions. */
function zone(s: { x: number; y: number; z: number }): [string, string] {
  if (sim && s.x > 11.4 && s.x < 22.6 && s.z > -24.6 && s.z < -13.8) return s.y > 3.7
    ? ["雪夜酒馆 · 二楼", "围坐休息 · 阳台看雪"]
    : ["雪夜酒馆", "围坐聊天 · 小舞台与吧台"];
  if (sim && s.x > -23 && s.x < -13 && s.z < 0 && s.z > -10) return ["2026 纪念馆", "走近展板 · 点击阅读"];
  if (sim && s.x > 13 && s.x < 21 && s.z < -0.5 && s.z > -7.5) return ["新年邮局", "走近书桌 · 写给2027"];
  if (sim) return ["钟楼广场", "雪夜相遇 · 北京时间跨年"];
  if (s.z < -11)
    return s.x < -6.9 && s.z < -19.9
      ? ["The shed", "TIGHT AND DUSTY"]
      : ["The yard", "OUTDOORS · OPEN SKY"];
  if (s.x > 14)
    return s.x > 24 && s.z < -2
      ? ["The back room", "STORES · KEEP IT TIDY"]
      : ["The workshop", "BIG ROOM · HARD SURFACES"];
  if (s.x > 5)
    return s.y > 2.4
      ? ["The mezzanine", "ABOVE THE HALL · MIND THE EDGE"]
      : ["The hall", "LARGE HALL · LONG REFLECTIONS"];
  return ["钟楼广场", "雪夜相遇 · 北京时间跨年"];
}
let debugTime = 0;
function debug(now: number) {
  if (now - debugTime < 500) return;
  debugTime = now;
  $("metrics").innerHTML =
    `<div>ROUND TRIP<strong>${ping} <small>ms</small></strong></div><div>SERVER TICK<strong>${tickRate.toFixed(0)} <small>Hz</small></strong></div><div>TICK WORK<strong>${tickCost.toFixed(1)} <small>ms</small></strong></div><div>CORRECTION<strong>${(correction * 100).toFixed(1)} <small>cm</small></strong></div><div>GAME PACKETS<strong>${tx} ↑ ${rx} ↓</strong></div><div>VOICE PACKETS<strong>${voice.sent} ↑ ${voice.received} ↓</strong></div>`;
  $("codec-status").textContent =
    `${voice.codec} · ${voice.dropped} expired frames · ${voice.status}`;
  const peers = $("peer-debug");
  peers.replaceChildren();
  for (const p of voice.peers.values()) {
    const row = document.createElement("div");
    row.className = "debug-peer";
    const title = document.createElement("b");
    title.textContent =
      members.find((m) => m.id === p.id)?.name ?? `Player ${p.id}`;
    const button = document.createElement("button");
    button.textContent = p.forced ? "Allow P2P" : "Force relay";
    button.onclick = () => voice.force(p.id, !p.forced);
    const text = document.createElement("div");
    text.textContent = `${p.relay ? "Relayed" : "P2P"} · ${p.state}`;
    const detail = document.createElement("small");
    detail.textContent = `${p.bufferMs.toFixed(0)} ms buffered · ${p.packets} RTP packets · ${p.reason}`;
    row.append(button, title, text, detail);
    peers.append(row);
  }
}
function frame(now: number) {
  const dt = Math.min(0.08, (now - last) / 1000);
  last = now;
  acc += dt;
  if (connected && sim && local) {
    postOffice.update(local.state);
    museum.update(local.state);
    let steps = 0;
    while (acc >= STEP && steps++ < 5) {
      acc -= STEP;
      if (
        cameraMode === "third" &&
        ["KeyW", "KeyA", "KeyS", "KeyD"].some((key) => keys.has(key))
      ) {
        yaw = cameraYaw;
        pitch = cameraPitch;
      }
      const input: Input = {
        seq: ++seq,
        x: Number(keys.has("KeyD")) - Number(keys.has("KeyA")),
        z: Number(keys.has("KeyW")) - Number(keys.has("KeyS")),
        yaw,
        pitch,
        buttons:
          (keys.has("Space") ? BUTTON.JUMP : 0) |
          (keys.has("ShiftLeft") || keys.has("ShiftRight")
            ? BUTTON.SPRINT
            : 0) |
          (keys.has("ControlLeft") || keys.has("KeyC") ? BUTTON.CROUCH : 0),
      };
      pending.push(input);
      outgoing.push(input);
      sim.motor(local, input);
      sim.step();
      if (pending.length > 120) pending.shift();
      if (outgoing.length >= 2 && socket?.open) {
        socket.send(encodeInputs(outgoing.splice(0), baseline));
        tx++;
      }
    }
    offset.multiplyScalar(Math.exp(-dt * 16));
    const s = local.state,
      eye = sim.eye(s);
    movementSounds.update(s, now);
    if (cameraMode === "third") {
      scene.updatePlayer(
        s,
        name,
        dt,
        members.find((m) => m.id === id)?.color,
        false,
      );
      scene.thirdPersonCamera(
        { x: s.x + offset.x, y: s.y + offset.y, z: s.z + offset.z },
        cameraYaw,
        cameraPitch,
      );
    } else {
      scene.camera.position.set(
        eye.x + offset.x,
        eye.y + offset.y,
        eye.z + offset.z,
      );
      scene.camera.rotation.set(-pitch, yaw, 0, "YXZ");
    }
    const targetTime = now - 100;
    let a = snapshots[0],
      b = snapshots.at(-1);
    for (let i = 1; i < snapshots.length; i++) {
      if (snapshots[i].time >= targetTime) {
        a = snapshots[i - 1];
        b = snapshots[i];
        break;
      }
    }
    if (a && b) {
      const t = Math.max(
        0,
        Math.min(1, (targetTime - a.time) / Math.max(1, b.time - a.time)),
      );
      for (const remote of b.s.players) {
        if (remote.id === id) continue;
        const prev = a.s.players.find((p) => p.id === remote.id) ?? remote;
        const r = {
          ...remote,
          x: THREE.MathUtils.lerp(prev.x, remote.x, t),
          y: THREE.MathUtils.lerp(prev.y, remote.y, t),
          z: THREE.MathUtils.lerp(prev.z, remote.z, t),
          yaw:
            prev.yaw +
            Math.atan2(
              Math.sin(remote.yaw - prev.yaw),
              Math.cos(remote.yaw - prev.yaw),
            ) *
              t,
          pitch: THREE.MathUtils.lerp(prev.pitch, remote.pitch, t),
        };
        scene.updatePlayer(
          r,
          members.find((m) => m.id === r.id)?.name ?? "访客",
          dt,
          members.find((m) => m.id === r.id)?.color,
        );
        scene.setMouth(r.id, voice.loudness(r.id));
        voice.updatePosition(r.id, { x: r.x, y: r.y + 0.65, z: r.z });
        movementSounds.update(r, now);
      }
      const props = b.s.props.map((p) => {
        if (p.owner === id)
          return sim!.propStates().find((x) => x.id === p.id) ?? p;
        const prev = a.s.props.find((x) => x.id === p.id) ?? p;
        const q = new THREE.Quaternion(prev.qx, prev.qy, prev.qz, prev.qw)
          .normalize()
          .slerp(new THREE.Quaternion(p.qx, p.qy, p.qz, p.qw).normalize(), t);
        return {
          ...p,
          x: THREE.MathUtils.lerp(prev.x, p.x, t),
          y: THREE.MathUtils.lerp(prev.y, p.y, t),
          z: THREE.MathUtils.lerp(prev.z, p.z, t),
          qx: q.x,
          qy: q.y,
          qz: q.z,
          qw: q.w,
        };
      });
      scene.updateProps(props);
    }
    scene.updateDoors(sim.doorStates());
    const target = s.held ? 0 : sim.target(s);
    const door = s.held || target ? 0 : sim.doorTarget(s);
    scene.setHighlight(target);
    $("crosshair").classList.toggle("target", !!target || !!door);
    $("crosshair").classList.toggle(
      "armed",
      ["gun", "bat", "horn"].includes(propKind(s.held) ?? ""),
    );
    $("interact").hidden =
      (!target && !door && !s.held) ||
      (!document.pointerLockElement && !previewControls);
    $("interact").innerHTML = s.held
      ? `<kbd class="key">E</kbd> Drop <span style="margin-left:10px"><kbd class="key">Q</kbd> Throw</span>${
          ["gun", "bat", "horn"].includes(propKind(s.held) ?? "")
            ? `<span style="margin-left:10px"><kbd class="key">Click</kbd> ${
                propKind(s.held) === "gun"
                  ? "Fire"
                  : propKind(s.held) === "bat"
                    ? "Swing"
                    : "Honk"
              }</span>`
            : ""
        }`
      : door
        ? DOORS.find((d) => d.id === door)?.auto
          ? "Opens by itself"
          : `<kbd class="key">E</kbd> ${DOORS.find((d) => d.id === door)!.zone}`
        : `<kbd class="key">E</kbd> Pick up the ${propKind(target) ?? "thing"}`;
    const [zoneName, zoneDesc] = zone(s);
    $("zone-name").textContent = zoneName;
    $("zone-desc").textContent = zoneDesc;
    voice.spatial?.update(
      scene.camera.position,
      cameraMode === "third" ? cameraYaw : yaw,
      cameraMode === "third" ? cameraPitch : pitch,
    );
  } else {
    acc = 0;
    scene.overview(dt);
  }
  scene.render(dt);
  debug(now);
  requestAnimationFrame(frame);
}
try {
  await Promise.all([initPhysics(), scene.loaded, networkReady]);
  $("loading").hidden = true;
  // The copy is held back until the world behind it is ready, then arrives with the camera.
  document.body.classList.add("ready");
  requestAnimationFrame(frame);
} catch (e) {
  $("loading").textContent = `小镇暂时无法打开：${String(e)}`;
  console.error(e);
}
setInterval(() => {
  if (connected) send({ type: "ping", time: performance.now() });
}, 1000);
addEventListener("beforeunload", () => voice.dispose());
