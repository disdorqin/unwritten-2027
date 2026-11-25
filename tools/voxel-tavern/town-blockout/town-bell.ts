import {
  AdditiveBlending, BoxGeometry, CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial,
  MeshLambertMaterial, OctahedronGeometry, RingGeometry, Vector3, type PerspectiveCamera, type Scene,
} from 'three';
import {
  bellSpatialParams, bellStealRadius, bellTitleText,
  type BellEvent, type BellStanding, type BellStateEvent,
} from '../../../src/presence/bell-game';
import './town-bell.css';

type BellPeer = { id: number; name: string; east: number; north: number; height: number };
type BellPresence = {
  serverNow: () => number;
  selfId: () => number | null;
  playerName: () => string;
  getSnowballPeers: () => readonly BellPeer[];
  bellSupported: () => boolean;
  requestBellStart: () => unknown;
  sendBellTouch: () => unknown;
  onBellEvent: (handler: (event: BellEvent) => void) => void;
  setBellHolder: (id: number | null) => void;
};

export type TownBellDeps = {
  scene: Scene;
  camera: PerspectiveCamera;
  presence: BellPresence;
  getAudioContext: () => AudioContext;
  announce: (message: string, gold?: boolean) => void;
  heightAt: (east: number, north: number) => number;
  localPosition: () => { east: number; north: number; height: number };
};

type Anchor = { east: number; north: number; height: number };

const bellPartials = [[1, .5, 1.5], [2.01, .27, 1.05], [2.74, .19, .75], [3.76, .11, .5], [5.43, .05, .3]] as const;
const bellBaseFrequency = 1567.98;

function formatClock(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function box(parent: Group, size: [number, number, number], at: [number, number, number], material: MeshLambertMaterial) {
  const mesh = new Mesh(new BoxGeometry(...size), material);
  mesh.position.set(...at);
  parent.add(mesh);
  return mesh;
}

export function createTownBellGame(deps: TownBellDeps) {
  const { scene, camera, presence } = deps;
  const controls = document.getElementById('bell-controls');
  const status = document.getElementById('bell-status');
  const startButton = document.getElementById('bell-start') as HTMLButtonElement | null;
  const title = document.getElementById('bell-title');
  if (!controls || !status || !startButton || !title) return { update(_dt: number) {} };

  // ---- 3D 表现：金铃本体 + 持铃光柱 + 穿墙标记 + 地面光环 ----
  const gold = new MeshLambertMaterial({ color: 0xdca845, emissive: 0x5a3d0c });
  const darkGold = new MeshLambertMaterial({ color: 0x6e5626, emissive: 0x1c1304 });
  const ribbon = new MeshLambertMaterial({ color: 0xb03a2e, emissive: 0x2a0503 });
  const bellMesh = new Group();
  bellMesh.name = '抢铃铛 · 金铃';
  box(bellMesh, [.05, .14, .05], [0, .4, 0], ribbon);
  box(bellMesh, [.1, .08, .1], [0, .31, 0], darkGold);
  box(bellMesh, [.18, .07, .18], [0, .245, 0], gold);
  box(bellMesh, [.26, .12, .26], [0, .155, 0], gold);
  box(bellMesh, [.34, .09, .34], [0, .05, 0], gold);
  box(bellMesh, [.07, .07, .07], [0, -.03, 0], darkGold);
  const pillar = new Mesh(
    new CylinderGeometry(.5, .78, 26, 12, 1, true),
    new MeshBasicMaterial({
      color: 0xffcf6e, transparent: true, opacity: .15,
      blending: AdditiveBlending, depthWrite: false, side: DoubleSide,
    }));
  pillar.name = '抢铃铛 · 光柱';
  const marker = new Mesh(
    new OctahedronGeometry(.24),
    new MeshBasicMaterial({ color: 0xffd97a, transparent: true, opacity: .95, depthTest: false }));
  marker.name = '抢铃铛 · 穿墙标记';
  marker.renderOrder = 999;
  const holderRing = new Mesh(
    new RingGeometry(.48, .68, 28),
    new MeshBasicMaterial({ color: 0xffcf6e, transparent: true, opacity: .85, depthTest: false, side: DoubleSide }));
  holderRing.rotation.x = -Math.PI / 2;
  holderRing.renderOrder = 998;
  const looseRing = new Mesh(
    new RingGeometry(.5, .7, 28),
    new MeshBasicMaterial({ color: 0xffcf6e, transparent: true, opacity: .55, side: DoubleSide }));
  looseRing.rotation.x = -Math.PI / 2;
  for (const part of [bellMesh, pillar, marker, holderRing, looseRing]) {
    part.visible = false;
    scene.add(part);
  }

  // ---- 铃声：WebAudio 合成小铃，分频泛音 + 距离/方位空间化 ----
  let master: GainNode | undefined;
  function strike(at: Anchor, strength: number, pitch = 1, delay = 0) {
    let context: AudioContext;
    try { context = deps.getAudioContext(); } catch { return; }
    if (context.state !== 'running') return;
    master ??= context.createGain();
    master.gain.value = .9;
    master.connect(context.destination);
    const local = new Vector3(at.east, at.height, -at.north).applyMatrix4(camera.matrixWorldInverse);
    const { gain, pan, cutoff } = bellSpatialParams(local.length(), Math.atan2(local.x, -local.z));
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const panner = context.createStereoPanner();
    panner.pan.value = pan;
    const level = context.createGain();
    level.gain.value = gain * strength;
    filter.connect(panner).connect(level).connect(master);
    const start = context.currentTime + .02 + delay;
    for (const [ratio, weight, decay] of bellPartials) {
      const tone = context.createOscillator();
      tone.type = 'sine';
      tone.frequency.value = bellBaseFrequency * pitch * ratio;
      const envelope = context.createGain();
      envelope.gain.setValueAtTime(.0001, start);
      envelope.gain.exponentialRampToValueAtTime(weight, start + .005);
      envelope.gain.exponentialRampToValueAtTime(.0001, start + decay);
      tone.connect(envelope).connect(filter);
      tone.start(start);
      tone.stop(start + decay + .03);
    }
    window.setTimeout(() => { filter.disconnect(); panner.disconnect(); level.disconnect(); }, (delay + 2.2) * 1000);
  }
  const jingle = (at: Anchor, strength: number) => { strike(at, strength * .55); strike(at, strength * .5, 1.01, .07); };
  const pickupSound = (at: Anchor) => strike(at, .9);
  const stealSound = (at: Anchor) => { strike(at, .8); strike(at, .8, 1.12, .06); strike(at, .85, 1.26, .12); };
  const dropSound = (at: Anchor) => { strike(at, .9, .8); strike(at, .6, .55, .18); };
  const titleSound = (at: Anchor) => { strike(at, .7); strike(at, .7, 1.26, .09); strike(at, .75, 1.5, .18); };
  const endSound = (at: Anchor) => { strike(at, .8); strike(at, .8, .15); strike(at, .85, 1.26, .3); strike(at, .9, 1.5, .45); };

  // ---- 对局状态 ----
  let state: BellStateEvent | undefined;
  let endStandings: BellStanding[] | undefined;
  let endShownUntil = 0;
  let dropAnim: { from: Anchor; to: Anchor; startedAt: number } | undefined;
  let lastAnchor: Anchor | undefined;
  let travel = 0;
  let urgentAt = 0;
  let looseChimeAt = 0;
  let touchAt = 0;
  let hudAt = 0;
  const names = new Map<number, string>();

  function showTitle(text: string) {
    title!.textContent = text;
    title!.hidden = false;
    title!.getAnimations().forEach(animation => animation.cancel());
    const animation = title!.animate([
      { opacity: 0, transform: 'translateX(-50%) scale(.82)' },
      { opacity: 1, transform: 'translateX(-50%) scale(1.04)', offset: .16 },
      { opacity: 1, transform: 'translateX(-50%) scale(1)', offset: .3 },
      { opacity: 1, transform: 'translateX(-50%) scale(1)', offset: .78 },
      { opacity: 0, transform: 'translateX(-50%) scale(1.02)' },
    ], { duration: 2600, easing: 'ease-out' });
    void animation.finished.then(() => { title!.hidden = true; }, () => {});
  }

  function holderAnchor(event: BellStateEvent): Anchor | undefined {
    if (!event.holder) return undefined;
    if (event.holder.id === presence.selfId()) return deps.localPosition();
    const peer = presence.getSnowballPeers().find(candidate => candidate.id === event.holder!.id);
    return peer
      ? { east: peer.east, north: peer.north, height: peer.height }
      : { east: event.holder.east, north: event.holder.north, height: event.holder.height };
  }

  presence.onBellEvent(event => {
    if (event.kind === 'bell-title') {
      showTitle(bellTitleText(event.name, event.tier));
      if (state) {
        const anchor = holderAnchor(state);
        if (anchor) titleSound(anchor);
      }
      return;
    }
    if (event.kind === 'bell-end') {
      endStandings = event.standings;
      endShownUntil = performance.now() + 15_000;
      presence.setBellHolder(null);
      const anchor = deps.localPosition();
      endSound(anchor);
      deps.announce(event.winner
        ? `抢铃铛结算 · ${event.winner.name} 持铃 ${formatClock(event.winner.ms)} 夺冠`
        : '抢铃铛结算 · 本局无人持铃', true);
      return;
    }
    // bell-state
    const previous = state;
    const previousHolder = previous?.holder?.id ?? null;
    const nextHolder = event.holder?.id ?? null;
    if (event.phase === 'running' && previous?.phase !== 'running') {
      deps.announce('抢铃铛开始 · 铃在广场徽记处，先到先得！');
      endStandings = undefined;
    }
    if (event.holder) names.set(event.holder.id, event.holder.name);
    if (previousHolder !== null && nextHolder === null && event.loose && lastAnchor) {
      dropAnim = {
        from: lastAnchor,
        to: { east: event.loose.east, north: event.loose.north, height: deps.heightAt(event.loose.east, event.loose.north) },
        startedAt: performance.now(),
      };
      dropSound(dropAnim.to);
    } else if (nextHolder !== null && previousHolder !== nextHolder) {
      const anchor = holderAnchor(event);
      if (anchor) {
        if (previousHolder === null) pickupSound(anchor);
        else stealSound(anchor);
      }
    }
    state = event;
    presence.setBellHolder(event.phase === 'running' ? nextHolder : null);
  });

  startButton.addEventListener('click', () => {
    if (!presence.requestBellStart()) deps.announce('联机后才能开启抢铃铛');
  });

  function hideVisuals() {
    bellMesh.visible = pillar.visible = marker.visible = holderRing.visible = looseRing.visible = false;
  }

  function update(_dt: number) {
    const supported = presence.bellSupported();
    controls!.hidden = !supported;
    if (!supported) {
      if (state) {
        state = undefined;
        presence.setBellHolder(null);
      }
      hideVisuals();
      return;
    }
    const now = presence.serverNow();
    const perf = performance.now();
    const running = state?.phase === 'running';
    startButton!.hidden = !!running;
    const showEnd = !running && endStandings !== undefined && perf < endShownUntil;
    status!.hidden = !running && !showEnd;

    if (!running || !state) {
      hideVisuals();
      lastAnchor = undefined;
      if (showEnd && perf - hudAt > 200) {
        hudAt = perf;
        status!.textContent = '结算 · ' + endStandings!
          .map(entry => `${entry.name} ${formatClock(entry.ms)}`).join(' · ');
      }
      return;
    }

    // 锚点：持铃人实时位置（本人/同伴/状态快照回退）或散铃落点。
    let anchor: Anchor | undefined;
    let held = false;
    if (state.holder) {
      anchor = holderAnchor(state);
      held = anchor !== undefined;
    } else if (state.loose) {
      anchor = {
        east: state.loose.east, north: state.loose.north,
        height: deps.heightAt(state.loose.east, state.loose.north),
      };
    }
    if (!anchor) {
      hideVisuals();
      return;
    }

    // ---- 表现 ----
    const bob = Math.sin(perf / 300) * .06;
    if (held) {
      pillar.visible = marker.visible = holderRing.visible = bellMesh.visible = true;
      looseRing.visible = false;
      pillar.position.set(anchor.east, anchor.height + 13, -anchor.north);
      marker.position.set(anchor.east, anchor.height + 3.15 + bob, -anchor.north);
      marker.rotation.y = perf / 500;
      holderRing.position.set(anchor.east, anchor.height + .06, -anchor.north);
      bellMesh.position.set(anchor.east, anchor.height + 2.5 + bob, -anchor.north);
      bellMesh.rotation.set(0, perf / 700, Math.sin(perf / 340) * .12);
      bellMesh.scale.setScalar(1);
    } else {
      pillar.visible = marker.visible = holderRing.visible = false;
      bellMesh.visible = looseRing.visible = true;
      looseRing.position.set(anchor.east, anchor.height + .05, -anchor.north);
      (looseRing.material as MeshBasicMaterial).opacity = .35 + .25 * Math.sin(perf / 280);
      if (dropAnim && perf - dropAnim.startedAt < 550) {
        const t = (perf - dropAnim.startedAt) / 550;
        bellMesh.position.set(
          dropAnim.from.east + (dropAnim.to.east - dropAnim.from.east) * t,
          dropAnim.from.height + (dropAnim.to.height - dropAnim.from.height) * t + Math.sin(t * Math.PI) * .5 + .3,
          -(dropAnim.from.north + (dropAnim.to.north - dropAnim.from.north) * t));
        bellMesh.rotation.set(t * 5, 0, t * 3);
      } else {
        dropAnim = undefined;
        const ready = now >= state.pickableAt;
        const lift = ready ? .34 + bob : .3;
        bellMesh.position.set(anchor.east, anchor.height + lift, -anchor.north);
        bellMesh.rotation.set(0, perf / 900, 0);
        const scale = ready ? 1 + .05 * Math.sin(perf / 200) : 1;
        bellMesh.scale.setScalar(scale);
      }
    }
    // ---- 铃声：持铃移动轻响、追逐急响、散铃远吟 ----
    if (lastAnchor && held && state.holder) {
      const holderId = state.holder.id;
      const moved = Math.hypot(anchor.east - lastAnchor.east, anchor.north - lastAnchor.north);
      if (moved < 5) travel += moved;
      if (travel > 2.4) {
        travel = 0;
        jingle(anchor, .8);
      }
      const me = presence.selfId();
      let chaser = Infinity;
      const consider = (point: Anchor) => {
        chaser = Math.min(chaser, Math.hypot(point.east - anchor.east, point.north - anchor.north));
      };
      if (me !== null && holderId !== me) consider(deps.localPosition());
      for (const peer of presence.getSnowballPeers()) if (peer.id !== holderId) consider(peer);
      if (chaser < 8 && perf - urgentAt > 1100) {
        urgentAt = perf;
        jingle(anchor, 1);
      }
    } else if (!held && perf - looseChimeAt > 2800) {
      looseChimeAt = perf;
      strike(anchor, .5);
    }
    lastAnchor = anchor;

    // ---- 触碰夺铃/拾铃（服务端权威复核） ----
    const me = presence.selfId();
    if (me !== null && state.holder?.id !== me && perf - touchAt > 350) {
      const target = state.holder ? anchor : (now >= state.pickableAt ? anchor : undefined);
      if (target) {
        const local = deps.localPosition();
        if (Math.hypot(local.east - target.east, local.north - target.north) <= bellStealRadius) {
          touchAt = perf;
          presence.sendBellTouch();
        }
      }
    }

    // ---- HUD ----
    if (perf - hudAt > 120) {
      hudAt = perf;
      for (const peer of presence.getSnowballPeers()) names.set(peer.id, peer.name);
      const totals = new Map(state.totals);
      if (state.holder) {
        totals.set(state.holder.id, (totals.get(state.holder.id) ?? 0) + Math.max(0, now - state.holderSince));
      }
      const top = [...totals.entries()].sort((a, b) => b[1] - a[1])[0];
      const mine = me !== null ? totals.get(me) ?? 0 : 0;
      const holderText = state.holder
        ? `持铃 ${state.holder.name}（连持 ${Math.max(0, Math.floor((now - state.holderSince) / 1000))} 秒）`
        : '铃在地上';
      const topText = top && top[0] !== me ? ` · 领先 ${names.get(top[0]) ?? '对手'} ${formatClock(top[1])}` : '';
      status!.textContent = `抢铃铛 ${formatClock(state.endsAt - now)} · ${holderText} · 我 ${formatClock(mine)}${topText}`;
    }
  }

  return { update };
}
