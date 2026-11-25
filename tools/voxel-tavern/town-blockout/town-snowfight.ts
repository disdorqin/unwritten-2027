import {
  AdditiveBlending, BoxGeometry, CircleGeometry, Color, CylinderGeometry, DoubleSide, DynamicDrawUsage, InstancedMesh,
  MeshBasicMaterial, MeshLambertMaterial, Object3D, RingGeometry, Vector3, type Scene,
} from 'three';
import {
  SNOWFIGHT_POINTS, WALL_MAX_LAYERS, WALL_TOWN_CAP, buildHalfAllows, classifyFreeWallSite, classifyWallSite,
  wallCellCentre, type SnowfightTeam, type WallSiteRejection,
} from '../../../src/presence/snowfight';
import { snowWallBuildLayers, snowWallCost, type SnowballStock } from '../../../src/shared/snow-stock';
import type { createTownPresence, SnowfightState } from './town-presence';
import type { TownSnowballTarget } from './town-snow-target';
import { createSnowfightAudio } from './snowfight-audio';
import { particleDensityScale, scaledParticleCount } from './town-quality';

export const DIG_CAP = 96;

/** 本地挖坑（纯表现）：深雪区掏雪留下浅坑，深雪回补（H2）落地后由统一场接管。 */
export class DigField {
  private pits = new Map<string, { east: number; north: number; depth: number }>();
  constructor(private readonly cap = DIG_CAP) {}
  dig(east: number, north: number): { east: number; north: number; depth: number } {
    const key = `${Math.round(east * 2)},${Math.round(north * 2)}`;
    let pit = this.pits.get(key);
    if (!pit) {
      if (this.pits.size >= this.cap) {
        const oldest = this.pits.keys().next().value as string;
        this.pits.delete(oldest);
      }
      pit = { east, north, depth: 0 };
      this.pits.set(key, pit);
    }
    pit.depth = Math.min(.12, pit.depth + .04);
    return pit;
  }
  list() { return [...this.pits.values()]; }
  get size() { return this.pits.size; }
}

type Presence = ReturnType<typeof createTownPresence>;
type WallCell = Readonly<{ gx: number; gy: number }>;

function validWallCell({ gx, gy }: WallCell) {
  return Number.isSafeInteger(gx) && Number.isSafeInteger(gy);
}
type WallView = { gx: number; gy: number; layer: number; hp: number; team: SnowfightTeam | 2; ground: number };
type Burst = { age: number; lifetime: number; size: number; at: Vector3; velocity: Vector3 };

const TEAM_COLORS = ['#e2543e', '#e9aa3d'] as const;
const REJECT_MESSAGES: Record<string, string> = {
  phase: '现在不能堆墙',
  half: '建造阶段只能在自家半场堆墙',
  road: '路中间不能堆墙',
  rail: '铁轨上不能堆墙',
  platform: '站台上不能堆墙',
  stage: '戏台上不能堆墙',
  door: '门口要留空',
  interior: '屋里不能堆墙',
  secret: '密室重地，不能堆墙',
  river: '河里堆不住墙',
  bounds: '这里堆不了墙',
  stack: '最高三层，堆不上了',
  cap: '全镇雪墙已达上限',
  pending: '等这一块雪墙确认',
  rate: '缓一缓再堆',
};

export function createTeamSnowfight(options: {
  scene: Scene;
  presence: Presence;
  stock: SnowballStock;
  heightAt(east: number, north: number): number;
  announce(message: string): void;
  playerPose(): { east: number; north: number };
  snowDepthLevel(): number;
  freeBuildAvailable?(): boolean;
  freeWallSite?(east: number, north: number): WallSiteRejection | undefined;
}) {
  const { scene, presence, stock, heightAt, announce } = options;
  const classifyFreeSite = options.freeWallSite ?? classifyFreeWallSite;
  const audio = createSnowfightAudio();
  const digs = new DigField();
  const walls = new Map<string, WallView>();
  const groundCache = new Map<string, number>();
  const targets: TownSnowballTarget[] = [];
  const pose = new Object3D();
  const color = new Color();
  let state: SnowfightState | undefined;
  let stateAt = 0;
  let pendingWall: { gx: number; gy: number; ownerId: number; settle(accepted: boolean): void } | undefined;
  let explainedFreeBuild = false;
  let lastRejectAt = -Infinity;
  let prevPhase: string | undefined;
  let prevOwners: number[] = [];

  const key = (gx: number, gy: number, layer: number) => `${gx},${gy},${layer}`;
  const columnKey = (gx: number, gy: number) => `${gx},${gy}`;

  function groundAt(gx: number, gy: number): number {
    const k = columnKey(gx, gy);
    let ground = groundCache.get(k);
    if (ground === undefined) {
      ground = heightAt(wallCellCentre(gx), wallCellCentre(gy));
      if (Number.isFinite(ground)) groundCache.set(k, ground);
    }
    return ground;
  }

  function columnHeight(gx: number, gy: number): number {
    let height = 0;
    for (let layer = 0; layer < WALL_MAX_LAYERS; layer++) if (walls.has(key(gx, gy, layer))) height++;
    return height;
  }

  // ---- 雪墙渲染：全镇一块 InstancedMesh（1 个绘制批次） ----
  const wallMesh = new InstancedMesh(
    new BoxGeometry(.5, .5, .5),
    new MeshLambertMaterial({ color: '#ffffff' }),
    WALL_TOWN_CAP,
  );
  wallMesh.name = 'Town snowfight walls';
  wallMesh.count = 0;
  wallMesh.visible = false;
  wallMesh.frustumCulled = false;
  wallMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  scene.add(wallMesh);

  function refreshWalls() {
    let i = 0;
    targets.length = 0;
    for (const wall of walls.values()) {
      const east = wallCellCentre(wall.gx);
      const north = wallCellCentre(wall.gy);
      const shrink = wall.hp === 3 ? 1 : wall.hp === 2 ? .96 : .92;
      pose.position.set(east, wall.ground + wall.layer * .5 + .25, -north);
      pose.scale.setScalar(shrink);
      pose.rotation.set(0, 0, 0);
      pose.updateMatrix();
      wallMesh.setMatrixAt(i, pose.matrix);
      color.set('#eef6ff');
      if (wall.team !== 2) color.lerp(new Color(TEAM_COLORS[wall.team]), .25);
      color.multiplyScalar(wall.hp === 3 ? 1 : wall.hp === 2 ? .82 : .6);
      wallMesh.setColorAt(i, color);
      i++;
      targets.push({
        id: `wall:${wall.gx}:${wall.gy}:${wall.layer}`,
        label: '雪墙',
        x: east, y: wall.ground + wall.layer * .5, z: -north,
        radius: .25, height: .5, shape: 'box',
        onHit() {},
      });
    }
    wallMesh.count = i;
    wallMesh.visible = i > 0;
    wallMesh.instanceMatrix.needsUpdate = true;
    if (wallMesh.instanceColor) wallMesh.instanceColor.needsUpdate = true;
  }

  // ---- 挖坑表现 ----
  const digMesh = new InstancedMesh(
    new CircleGeometry(.55, 20),
    new MeshBasicMaterial({ color: '#b9d2e8', transparent: true, opacity: .55, depthWrite: false }),
    DIG_CAP,
  );
  digMesh.name = 'Town snowfight dig pits';
  digMesh.count = 0;
  digMesh.visible = false;
  digMesh.frustumCulled = false;
  digMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  scene.add(digMesh);

  function refreshDigs() {
    const list = digs.list();
    list.forEach((pit, i) => {
      pose.position.set(pit.east, heightAt(pit.east, pit.north) + .02, -pit.north);
      pose.rotation.set(-Math.PI / 2, 0, 0);
      pose.scale.setScalar(.6 + pit.depth * 3);
      pose.updateMatrix();
      digMesh.setMatrixAt(i, pose.matrix);
    });
    digMesh.count = list.length;
    digMesh.visible = list.length > 0;
    digMesh.instanceMatrix.needsUpdate = true;
  }

  // ---- 虚影预览 ----
  const ghostMesh = new InstancedMesh(new BoxGeometry(.5, .5, .5),
    new MeshBasicMaterial({ color: '#9fe8ff', transparent: true, opacity: .45, depthWrite: false }), 1);
  ghostMesh.name = 'Town snowfight wall ghost';
  ghostMesh.count = 0;
  ghostMesh.visible = false;
  ghostMesh.frustumCulled = false;
  scene.add(ghostMesh);
  const ghostMaterial = ghostMesh.material as MeshBasicMaterial;

  // ---- 占点光圈 ----
  const pointViews = SNOWFIGHT_POINTS.map(point => {
    const ground = heightAt(point.east, point.north);
    const ring = new InstancedMesh(new RingGeometry(4.6, 5, 48),
      new MeshBasicMaterial({ color: '#8fa8bd', transparent: true, opacity: .5, side: DoubleSide, depthWrite: false }), 1);
    ring.name = `Town snowfight point ${point.id}`;
    ring.count = 1;
    ring.visible = false;
    ring.frustumCulled = false;
    pose.position.set(point.east, ground + .07, -point.north);
    pose.rotation.set(-Math.PI / 2, 0, 0);
    pose.scale.setScalar(1);
    pose.updateMatrix();
    ring.setMatrixAt(0, pose.matrix);
    scene.add(ring);
    const pillar = new InstancedMesh(new CylinderGeometry(.18, .18, 8, 10, 1, true),
      new MeshBasicMaterial({
        color: '#ffffff', transparent: true, opacity: .3, blending: AdditiveBlending, side: DoubleSide, depthWrite: false,
      }), 1);
    pillar.name = `Town snowfight pillar ${point.id}`;
    pillar.count = 1;
    pillar.visible = false;
    pillar.frustumCulled = false;
    pose.position.set(point.east, ground + 4, -point.north);
    pose.rotation.set(0, 0, 0);
    pose.updateMatrix();
    pillar.setMatrixAt(0, pose.matrix);
    scene.add(pillar);
    return { ring, pillar, material: ring.material as MeshBasicMaterial };
  });

  // ---- 放大雪雾团（团队模式命中/塌墙） ----
  const burstMesh = new InstancedMesh(new BoxGeometry(1, 1, 1),
    new MeshBasicMaterial({ color: '#f4faff' }), 96);
  burstMesh.name = 'Town snowfight bursts';
  burstMesh.count = 0;
  burstMesh.visible = false;
  burstMesh.frustumCulled = false;
  burstMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  scene.add(burstMesh);
  const bursts: Burst[] = Array.from({ length: 96 }, () => ({
    age: 0, lifetime: 0, size: 0, at: new Vector3(), velocity: new Vector3(),
  }));
  let burstCursor = 0;

  function burst(at: Vector3, big = false) {
    // Quality tiers (M5) scale how many sparks a burst spends from the ring
    // pool; sizes, lifetimes and velocities are unchanged.
    const count = scaledParticleCount(big ? 22 : 18, particleDensityScale());
    for (let i = 0; i < count; i++) {
      const spark = bursts[burstCursor];
      burstCursor = (burstCursor + 1) % bursts.length;
      const angle = burstCursor * 1.71 + i * 2.13;
      const speed = 1.7 + (i % 5) * .62;
      spark.age = 0;
      spark.lifetime = .45 + (i % 3) * .1;
      spark.size = .07 + (i % 4) * .02;
      spark.at.copy(at);
      spark.velocity.set(Math.cos(angle) * speed, .9 + (i % 5) * .55, Math.sin(angle) * speed);
    }
  }

  // ---- HUD ----
  const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T | null;
  for (const id of ['snowfight-start', 'snowfight-build']) {
    const button = el<HTMLButtonElement>(id);
    if (button) button.hidden = true;
  }
  const materialOut = el('snowfight-material');
  const panel = el('snowfight-panel');
  const phaseOut = el('snowfight-phase');
  const scoreOut = el('snowfight-score');
  const captureBar = el<HTMLProgressElement>('snowfight-capture');
  const popOut = el('snowfight-pop');
  const hitFlash = el('snowfight-hit-flash');

  function myTeam(): SnowfightTeam | undefined {
    const me = presence.selfId();
    if (me === null || !state) return undefined;
    const entry = state.teams.find(([id]) => id === me);
    return entry ? (entry[1] as SnowfightTeam) : undefined;
  }

  function active(): boolean {
    return state?.phase === 'build' || state?.phase === 'battle';
  }

  function mayBuildFree(): boolean {
    return !active() && presence.snowfightAvailable() && presence.selfId() !== null &&
      options.freeBuildAvailable?.() === true;
  }

  function canBuild(): boolean {
    return active() || mayBuildFree();
  }

  function placeRejection(gx: number, gy: number): string | undefined {
    if (!canBuild()) return 'phase';
    if (!validWallCell({ gx, gy })) return 'bounds';
    const team = myTeam();
    if (active() && team === undefined) return 'phase';
    const east = wallCellCentre(gx);
    const north = wallCellCentre(gy);
    if (state?.phase === 'build' && team !== undefined && !buildHalfAllows(team, east)) return 'half';
    const site = active() ? classifyWallSite(east, north) : classifyFreeSite(east, north);
    if (site) return site;
    if (!Number.isFinite(groundAt(gx, gy))) return 'bounds';
    if (columnHeight(gx, gy) >= snowWallBuildLayers) return 'stack';
    if (active() && walls.size >= WALL_TOWN_CAP && ![...walls.values()].some(wall => wall.team === 2)) return 'cap';
    if (pendingWall) return 'pending';
    if (stock.available() < snowWallCost) return 'empty';
    return undefined;
  }

  function noteReject(reason: string) {
    const now = performance.now();
    if (now - lastRejectAt < 1200) return;
    lastRejectAt = now;
    announce(reason === 'empty' ? '堆一块墙要 3 个雪团' : (REJECT_MESSAGES[reason] ?? '这里堆不了墙'));
  }

  function tryPlace(cell: WallCell): boolean {
    const rejection = placeRejection(cell.gx, cell.gy);
    if (rejection) {
      noteReject(rejection);
      return true;
    }
    const ownerId = presence.selfId();
    if (ownerId === null) return false;
    const settle = stock.reserveWall();
    if (!settle) return false;
    pendingWall = { gx: cell.gx, gy: cell.gy, ownerId, settle };
    if (!presence.sendSnowfightPlace(cell.gx, cell.gy)) finishWall(false);
    return true;
  }

  function finishWall(accepted: boolean) {
    const request = pendingWall;
    pendingWall = undefined;
    request?.settle(accepted);
  }

  function updateHud() {
    const buildingAvailable = canBuild();
    if (materialOut) {
      materialOut.hidden = !buildingAvailable;
      const text = `雪团 ${stock.amount()}`;
      if (buildingAvailable && materialOut.textContent !== text) materialOut.textContent = text;
    }
    if (panel) panel.hidden = !active() && state?.phase !== 'done';
    if (!state) return;
    const current = state;
    const remain = Math.max(0, current.endsInMs - (performance.now() - stateAt));
    const mm = Math.floor(remain / 60000);
    const ss = String(Math.floor(remain % 60000 / 1000)).padStart(2, '0');
    const team = myTeam();
    if (phaseOut) {
      let text = current.phase === 'build' ? `建造 ${mm}:${ss}` :
        current.phase === 'battle' ? `对战 ${mm}:${ss}` :
        current.phase === 'done' ? '已结束' : '团队雪仗';
      if (team !== undefined) text += team === 0 ? ' · 你在红围巾队' : ' · 你在金铃队';
      if (phaseOut.textContent !== text) phaseOut.textContent = text;
    }
    if (scoreOut) {
      const text = `红围巾 ${current.scores[0]} : ${current.scores[1]} 金铃`;
      if (scoreOut.textContent !== text) scoreOut.textContent = text;
    }
    if (captureBar) {
      const capturing = current.phase === 'battle' && current.activePoint >= 0 && current.captureTeam >= 0;
      captureBar.hidden = !capturing;
      if (capturing) captureBar.value = current.captureProgress;
    }
    SNOWFIGHT_POINTS.forEach((point, i) => {
      const view = pointViews[i];
      const isActive = current.phase === 'battle' && current.activePoint === i;
      view.ring.visible = active();
      view.pillar.visible = isActive;
      const owner = current.owners[i];
      view.material.color.set(isActive ? '#ffffff' : owner >= 0 ? TEAM_COLORS[owner as SnowfightTeam] : '#8fa8bd');
      view.material.opacity = isActive ? .95 : owner >= 0 ? .8 : .45;
    });
  }

  presence.onSnowfightState(next => {
    const phaseChanged = next.phase !== prevPhase;
    const captured = next.owners.some((owner, i) => owner >= 0 && prevOwners[i] !== owner && prevPhase === 'battle');
    state = next;
    stateAt = performance.now();
    prevPhase = next.phase;
    prevOwners = [...next.owners];
    if (phaseChanged && next.phase === 'battle') audio.start();
    if (phaseChanged && next.phase === 'done') audio.finish();
    if (captured) audio.capture();
    updateHud();
  });
  presence.onSnowfightRejected(reason => {
    finishWall(false);
    noteReject(reason);
  });
  presence.onSnowfightWallEvent(event => {
    if (event.kind === 'wall-set') {
      const k = key(event.gx, event.gy, event.layer);
      const existed = walls.has(k);
      const previous = walls.get(k);
      walls.set(k, {
        gx: event.gx, gy: event.gy, layer: event.layer, hp: event.hp, team: event.team,
        ground: groundAt(event.gx, event.gy),
      });
      refreshWalls();
      const request = pendingWall;
      if (!existed && request && event.ownerId === request.ownerId && event.gx === request.gx && event.gy === request.gy) {
        finishWall(true);
        audio.place();
      } else if (existed && previous && event.hp < previous.hp) {
        audio.crack();
      }
      return;
    }
    let destroyedAt: Vector3 | undefined;
    for (const block of event.blocks) {
      const wall = walls.get(key(block.gx, block.gy, block.layer));
      if (wall) destroyedAt = new Vector3(
        wallCellCentre(wall.gx), wall.ground + wall.layer * .5 + .25, -wallCellCentre(wall.gy));
      walls.delete(key(block.gx, block.gy, block.layer));
    }
    refreshWalls();
    if (destroyedAt) {
      burst(destroyedAt, true);
      audio.destroy();
    }
  });

  return {
    active,
    canBuild,
    tryPlace,
    wallTargets: () => targets,
    /** 本地镜像中的墙列（雪橇交叉判定用）：无墙返回 undefined；ground 为该列基座地面高。 */
    wallColumnAt(gx: number, gy: number) {
      const height = columnHeight(gx, gy);
      if (!height) return undefined;
      const base = walls.get(key(gx, gy, 0));
      return { height, ground: base ? base.ground : groundAt(gx, gy) };
    },
    material: stock.amount,
    onGatherTick() {
      const level = options.snowDepthLevel();
      if (level >= 2) {
        const poseNow = options.playerPose();
        digs.dig(poseNow.east, poseNow.north);
        refreshDigs();
      }
      if (!explainedFreeBuild && mayBuildFree() && stock.available() >= snowWallCost) {
        explainedFreeBuild = true;
        announce('瞄准地面可堆雪墙，每块消耗 3 个雪团');
      }
      updateHud();
    },
    onThrowHeard(origin: Vector3) {
      const poseNow = options.playerPose();
      const distance = Math.hypot(origin.x - poseNow.east, -origin.z - poseNow.north);
      if (distance > 1.2) audio.whoosh(1 - Math.min(1, distance / 24));
    },
    onWallImpact(at: Vector3) {
      burst(at);
    },
    victimFlash() {
      if (!hitFlash) return;
      hitFlash.getAnimations().forEach(animation => animation.cancel());
      hitFlash.animate(
        [{ opacity: .55 }, { opacity: 0 }],
        { duration: 480, easing: 'ease-out' },
      );
    },
    popScore(text: string) {
      if (!popOut) return;
      popOut.textContent = text;
      popOut.getAnimations().forEach(animation => animation.cancel());
      popOut.animate(
        [{ opacity: 1, transform: 'translate(-50%, 0)' }, { opacity: 0, transform: 'translate(-50%, -34px)' }],
        { duration: 700, easing: 'ease-out' },
      );
    },
    update(dt: number, cell?: WallCell) {
      if (pendingWall && (presence.selfId() !== pendingWall.ownerId || !presence.snowfightAvailable())) finishWall(false);
      ghostMesh.visible = false;
      if (cell && validWallCell(cell) && canBuild()) {
        const { gx, gy } = cell;
        const ground = groundAt(gx, gy);
        if (Number.isFinite(ground)) {
          const layer = columnHeight(gx, gy);
          pose.position.set(wallCellCentre(gx), ground + layer * .5 + .25, -wallCellCentre(gy));
          pose.rotation.set(0, 0, 0);
          pose.scale.setScalar(1);
          pose.updateMatrix();
          ghostMesh.setMatrixAt(0, pose.matrix);
          ghostMesh.count = 1;
          ghostMesh.visible = true;
          ghostMesh.instanceMatrix.needsUpdate = true;
          ghostMaterial.color.set(placeRejection(gx, gy) ? '#ff7a6b' : '#9fe8ff');
        }
      }
      // 雪雾团
      let visible = 0;
      for (const spark of bursts) {
        if (spark.age >= spark.lifetime) continue;
        spark.age += dt;
        spark.at.addScaledVector(spark.velocity, dt);
        spark.velocity.y -= 6.6 * dt;
        pose.position.copy(spark.at);
        pose.rotation.set(0, 0, 0);
        pose.scale.setScalar(Math.max(.001, spark.size * (1 - .8 * spark.age / spark.lifetime)));
        pose.updateMatrix();
        burstMesh.setMatrixAt(visible++, pose.matrix);
      }
      burstMesh.count = visible;
      burstMesh.visible = visible > 0;
      if (burstMesh.visible) burstMesh.instanceMatrix.needsUpdate = true;
      if (state || options.freeBuildAvailable) updateHud();
    },
  };
}
