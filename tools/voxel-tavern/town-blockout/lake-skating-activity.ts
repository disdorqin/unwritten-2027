import { BoxGeometry, Color, InstancedMesh, MeshBasicMaterial, Object3D } from 'three';
import { lakeSkateGates, lakeSkateStation } from './lake-skate-course';
import type { TownActivity, TownActivityContext } from './town-activity';

const bestKey = 'unwritten:lake-skate-best:v1';
const gateRadius = 3;
const sessionLimit = 180;
const gold = new Color('#ffe1a2');
const cedar = new Color('#8a5647');
const frost = new Color('#b8d8ee');

type Lap = { next: number; elapsed: number; offCourse: number };

function bestSaved() {
  try {
    const ms = Number(localStorage.getItem(bestKey));
    if (Number.isInteger(ms) && ms > 0 && ms <= sessionLimit * 1000) return ms;
  } catch { /* Scores remain available for the session. */ }
  return undefined;
}

function seconds(ms: number) { return (ms / 1000).toFixed(2); }

export function createLakeSkatingActivity(
  context: TownActivityContext,
  heightAt: (x: number, n: number) => number,
): TownActivity & {
  enabled(): boolean;
  onPosition(x: number, n: number, dt: number, ice: boolean): void;
  stop(): void;
} {
  const markers = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 7);
  markers.name = 'Lake skating checkpoint';
  markers.visible = false;
  context.scene.add(markers);
  const shape = new Object3D();
  const { x, n } = lakeSkateStation;
  let wearing = false;
  let best = bestSaved();
  let last: number | undefined;
  let lap: Lap | undefined;

  function revealGate(index: number) {
    const gate = lakeSkateGates[index];
    const before = index === 0 ? lakeSkateStation : lakeSkateGates[index - 1];
    const distance = Math.hypot(gate.x - before.x, gate.n - before.n) || 1;
    const east = -(gate.n - before.n) / distance;
    const north = (gate.x - before.x) / distance;
    let slot = 0;
    function cube(offset: number, dy: number, w: number, h: number, color: Color) {
      const gx = gate.x + east * offset;
      const gn = gate.n + north * offset;
      shape.position.set(gx, heightAt(gx, gn) + dy, -gn);
      shape.scale.set(w, h, w);
      shape.updateMatrix();
      markers.setMatrixAt(slot, shape.matrix);
      markers.setColorAt(slot++, color);
    }
    for (const side of [-1, 1]) {
      cube(side * 1.8, .08, .42, .16, frost);
      cube(side * 1.8, .58, .115, 1.0, cedar);
      cube(side * 1.8, 1.16, .29, .25, gold);
    }
    cube(0, .027, .32, .047, gold);
    markers.instanceMatrix.needsUpdate = true;
    markers.instanceColor!.needsUpdate = true;
    markers.computeBoundingSphere();
    markers.visible = true;
  }

  function endLap() {
    lap = undefined;
    markers.visible = false;
  }

  function stop() {
    wearing = false;
    endLap();
  }

  function refreshBest() {
    const saved = bestSaved();
    if (saved !== undefined && (best === undefined || saved < best)) best = saved;
  }

  function finish(run: Lap) {
    const ms = Math.round(run.elapsed * 1000);
    last = ms;
    refreshBest();
    const improved = best === undefined || ms < best;
    if (improved) {
      best = ms;
      try { localStorage.setItem(bestKey, String(ms)); } catch { /* Scores remain available for the session. */ }
    }
    endLap();
    context.announce(`滑冰完赛 · ${seconds(ms)} 秒${improved ? ' · 新纪录' : ''}`);
  }

  function onPosition(east: number, north: number, dt: number, ice: boolean) {
    const run = lap;
    if (!run || !Number.isFinite(dt) || dt <= 0) return;
    run.elapsed += dt;
    const atStation = (east - x) ** 2 + (north - n) ** 2 <= 6 ** 2;
    run.offCourse = ice || atStation ? 0 : run.offCourse + dt;
    if (run.offCourse > 1.2 || run.elapsed > sessionLimit) {
      endLap();
      context.announce('计时结束。回到换鞋点可以重新开始。');
      return;
    }
    const goal = lakeSkateGates[run.next];
    if (!goal || (east - goal.x) ** 2 + (north - goal.n) ** 2 > gateRadius ** 2) return;
    if (!ice && !(atStation && run.next === lakeSkateGates.length - 1)) return;
    run.next++;
    if (run.next === lakeSkateGates.length) {
      finish(run);
      return;
    }
    revealGate(run.next);
    context.announce(`滑冰计时 · 通过 ${run.next} / ${lakeSkateGates.length} 道门`);
  }

  function menu() {
    refreshBest();
    const panel = context.open('冰湖滑冰',
      '穿冰鞋后可以在湖面自由滑行。用方向键或摇杆转向，松手后还会滑一段，反向操作可以减速。');
    const route = document.createElement('p');
    route.textContent = `计时赛沿金灯依次穿过 ${lakeSkateGates.length} 道门，最后回到换鞋点。离开冰湖会结束计时。`;
    const result = document.createElement('p');
    result.textContent = best === undefined
      ? '完成一圈后会在本机记录最快用时。'
      : `最快 ${seconds(best)} 秒${last === undefined ? '' : ` · 上次 ${seconds(last)} 秒`}`;
    panel.append(route, result);
    function option(label: string, choose: () => void) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', () => {
        panel.closest('dialog')?.close();
        choose();
      });
      panel.append(button);
    }
    option('自由滑行', () => {
      endLap();
      wearing = true;
      context.announce('已穿冰鞋 · 松开方向仍会继续滑行');
    });
    if (lap) option('结束计时', () => {
      endLap();
      context.announce('计时已结束，可以继续自由滑行。');
    });
    else option('开始计时', () => {
      wearing = true;
      lap = { next: 0, elapsed: 0, offCourse: 0 };
      revealGate(0);
      context.announce('滑冰计时 · 滑向第一道金灯门');
    });
    if (wearing) option('脱下冰鞋', () => {
      stop();
      context.announce('已脱下冰鞋。');
    });
  }

  return {
    spots: [{ x, n, ground: heightAt(x, n), range: 2.6, label: '冰湖滑冰', run: menu }],
    enabled: () => wearing,
    onPosition,
    stop,
  };
}
