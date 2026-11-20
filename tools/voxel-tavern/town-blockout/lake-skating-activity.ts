import {
  BoxGeometry, Color, CylinderGeometry, Group, InstancedMesh, Mesh, MeshBasicMaterial, MeshLambertMaterial,
  Object3D, RingGeometry, SphereGeometry, TorusGeometry,
} from 'three';
import { iceTreasureDeliveryGateCount } from '../../../src/shared/ice-treasure';
import { lakeSkateGates, lakeSkateStation } from './lake-skate-course';
import { bellDeliveryGateHalfWidth, bellDeliveryReturnRadius, createLakeBellDelivery } from './lake-bell-delivery';
import type { TownActivity, TownActivityContext } from './town-activity';

const bestKey = 'unwritten:lake-skate-best:v1';
const bellBestKey = 'unwritten:ice-treasure-delivery-best:v1';
const gateRadius = 3;
const sessionLimit = 180;
const gold = new Color('#ffe1a2');
const cedar = new Color('#8a5647');
const frost = new Color('#b8d8ee');

type Lap = { next: number; elapsed: number; offCourse: number };

function bestSaved(key = bestKey, maximum = sessionLimit * 1000) {
  try {
    const ms = Number(localStorage.getItem(key));
    if (Number.isSafeInteger(ms) && ms > 0 && ms <= maximum) return ms;
  } catch { /* Scores remain available for the session. */ }
  return undefined;
}

function seconds(ms: number) { return (ms / 1000).toFixed(2); }

function gateAxis(index: number) {
  const gate = lakeSkateGates[index];
  const before = index === 0 ? lakeSkateStation : lakeSkateGates[index - 1];
  const dx = gate.x - before.x, dn = gate.n - before.n;
  const distance = Math.hypot(dx, dn) || 1;
  return { gate, east: -dn / distance, north: dx / distance };
}

export function createLakeSkatingActivity(
  context: TownActivityContext,
  heightAt: (x: number, n: number) => number,
  isNight: () => boolean = () => false,
): TownActivity & {
  enabled(): boolean;
  carryingTreasure(): boolean;
  deliveryStalled(): boolean;
  bestDelivery(): number | undefined;
  updateHeldBell(x: number, n: number, ground: number, yaw: number): void;
  onPosition(x: number, n: number, dt: number, ice: boolean, groundedSkating?: boolean): void;
  stop(): void;
} {
  const markers = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 7);
  markers.name = 'Lake skating checkpoint';
  markers.visible = false;
  context.scene.add(markers);
  const shape = new Object3D();
  const nightLights = new InstancedMesh(markers.geometry,
    new MeshBasicMaterial({ color: '#dbab76' }), lakeSkateGates.length * 6);
  nightLights.name = 'Lake skating night lights';
  let lightIndex = 0;
  for (let index = 0; index < lakeSkateGates.length; index++) {
    const { gate, east, north } = gateAxis(index);
    for (const side of [-1, 1]) {
      for (const along of [-.25, 0, .25]) {
        // Studs outside the posts frame the course without filling the skating lane.
        const gx = gate.x + east * side * 2.20 + north * along;
        const gn = gate.n + north * side * 2.20 - east * along;
        shape.position.set(gx, heightAt(gx, gn) + .046, -gn);
        shape.scale.set(.18, .04, .18);
        shape.updateMatrix();
        nightLights.setMatrixAt(lightIndex++, shape.matrix);
      }
    }
  }
  nightLights.computeBoundingSphere();
  nightLights.visible = isNight();
  context.scene.add(nightLights);

  const { x, n } = lakeSkateStation;
  const delivery = createLakeBellDelivery(() => performance.now());
  const bell = new Group();
  bell.name = 'Gold ice treasure bell';
  const bellMetal = new MeshLambertMaterial({ color: '#e3ae42' });
  const bellBody = new Mesh(new CylinderGeometry(.20, .39, .34, 12), bellMetal);
  const bellLip = new Mesh(new CylinderGeometry(.41, .41, .065, 12), bellMetal);
  const clapper = new Mesh(new SphereGeometry(.075, 8, 6), bellMetal);
  const handle = new Mesh(new TorusGeometry(.085, .024, 6, 12), bellMetal);
  bellLip.position.y = -.15;
  clapper.position.y = -.22;
  handle.position.y = .22;
  bell.add(bellBody, bellLip, clapper, handle);
  const returnRing = new Mesh(new RingGeometry(2.88, bellDeliveryReturnRadius, 40), new MeshBasicMaterial({ color: '#ffe1a2' }));
  returnRing.name = 'Ice treasure return ring';
  returnRing.rotation.x = -Math.PI / 2;
  returnRing.position.set(x, heightAt(x, n) + .04, -n);
  returnRing.visible = false;
  context.scene.add(bell, returnRing);
  function parkBell() { bell.position.set(x - 1.15, heightAt(x - 1.15, n) + .35, -n); }
  parkBell();
  let wearing = false;
  let best = bestSaved();
  let bestBell = bestSaved(bellBestKey, Number.MAX_SAFE_INTEGER);
  let deliveryOffIce = 0;
  let last: number | undefined;
  let lap: Lap | undefined;

  function revealGate(index: number, isDelivery = false) {
    const { gate, east, north } = gateAxis(index);
    let slot = 0;
    function cube(offset: number, dy: number, w: number, h: number, color: Color, depth = w, yaw = 0) {
      const gx = gate.x + east * offset;
      const gn = gate.n + north * offset;
      shape.position.set(gx, heightAt(gx, gn) + dy, -gn);
      shape.scale.set(w, h, depth);
      shape.rotation.y = yaw;
      shape.updateMatrix();
      markers.setMatrixAt(slot, shape.matrix);
      markers.setColorAt(slot++, color);
    }
    if (isDelivery) {
      for (const side of [-1, 1]) cube(side * (bellDeliveryGateHalfWidth + .1), 1.1, .2, 2.2, frost);
      cube(0, 2.27, 2.4, .14, gold, .2, Math.atan2(north, east));
    } else {
      for (const side of [-1, 1]) {
        cube(side * 1.8, .08, .42, .16, frost);
        cube(side * 1.8, .58, .115, 1.0, cedar);
        cube(side * 1.8, 1.16, .29, .25, gold);
      }
    }
    cube(0, .027, .32, .047, gold);
    markers.count = slot;
    markers.instanceMatrix.needsUpdate = true;
    markers.instanceColor!.needsUpdate = true;
    markers.computeBoundingSphere();
    markers.visible = true;
  }

  function endLap() {
    lap = undefined;
    markers.visible = false;
  }

  function endDelivery() {
    if (!delivery.active()) return;
    delivery.stop();
    deliveryOffIce = 0;
    markers.visible = returnRing.visible = false;
    parkBell();
  }

  function stop() {
    wearing = false;
    endLap();
    endDelivery();
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

  function bestDelivery() {
    const saved = bestSaved(bellBestKey, Number.MAX_SAFE_INTEGER);
    if (saved !== undefined && (bestBell === undefined || saved < bestBell)) bestBell = saved;
    return bestBell;
  }

  function onPosition(east: number, north: number, dt: number, ice: boolean, groundedSkating = false) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const atStation = (east - x) ** 2 + (north - n) ** 2 <= 6 ** 2;
    if (delivery.active()) {
      deliveryOffIce = ice || atStation ? 0 : deliveryOffIce + dt;
      if (deliveryOffIce > 1.2) {
        endDelivery();
        context.announce('已离开冰面，金铃回到起点。');
        return;
      }
      const event = delivery.onPosition(east, north, dt, groundedSkating);
      if (event?.kind === 'gate') {
        if (event.passed === iceTreasureDeliveryGateCount) {
          markers.visible = false;
          returnRing.visible = true;
          context.announce('五道冰门已过 · 把金铃带回起点金圈');
        } else {
          revealGate(event.passed, true);
          context.announce(`抱铃运送 · ${event.passed}/${iceTreasureDeliveryGateCount}`);
        }
      } else if (event?.kind === 'finish') {
        parkBell();
        markers.visible = returnRing.visible = false;
        const prior = bestDelivery();
        if (event.ms > 0 && (prior === undefined || event.ms < prior)) {
          bestBell = event.ms;
          try { localStorage.setItem(bellBestKey, String(event.ms)); } catch { /* Keep the current session best. */ }
        }
        context.announce(`金铃已送回 · ${seconds(event.ms)} 秒`);
      }
      return;
    }
    const run = lap;
    if (!run) return;
    run.elapsed += dt;
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
      endDelivery();
      wearing = true;
      context.announce('已穿冰鞋 · 松开方向仍会继续滑行');
    });
    if (lap) option('结束计时', () => {
      endLap();
      context.announce('计时已结束，可以继续自由滑行。');
    });
    else option('开始计时', () => {
      endDelivery();
      wearing = true;
      lap = { next: 0, elapsed: 0, offCourse: 0 };
      revealGate(0);
      context.announce('滑冰计时 · 滑向第一道金灯门');
    });
    if (delivery.active()) option('放回金铃', endDelivery);
    else option('冰上夺宝 · 单人运送', () => {
      endLap();
      wearing = true;
      deliveryOffIce = 0;
      if (!delivery.start()) return;
      revealGate(0, true);
      context.announce('抱起金铃 · 依次穿过五道冰门，再返回起点金圈');
    });
    if (wearing) option('脱下冰鞋', () => {
      stop();
      context.announce('已脱下冰鞋。');
    });
  }

  return {
    spots: [{ x, n, ground: heightAt(x, n), range: 2.6, label: '冰湖滑冰', run: menu }],
    enabled: () => wearing,
    carryingTreasure: delivery.active,
    deliveryStalled: delivery.stalled,
    bestDelivery,
    updateHeldBell(east, north, ground, yaw) {
      if (delivery.active()) bell.position.set(east + Math.sin(yaw) * .85, ground + .84, -north - Math.cos(yaw) * .85);
    },
    update() { nightLights.visible = isNight(); },
    onPosition,
    stop,
  };
}
