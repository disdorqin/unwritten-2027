import {
  BoxGeometry, CanvasTexture, DataTexture, Group, InstancedMesh, Matrix4,
  Mesh, MeshBasicMaterial, MeshStandardMaterial, NearestFilter, Object3D, PlaneGeometry,
  PointLight, Quaternion, SRGBColorSpace, Vector3,
} from 'three';
import type { createUndergroundMainlineTrack, UndergroundMainlinePoint } from
  '../../../src/shared/underground-mainline-track.js';
import type { U19MineCartSnapshot } from '../../../src/presence/underground-mainline-cart.js';
import { createUndergroundMineCartModel } from './underground-mine-cart-model.js';

type Route = ReturnType<typeof createUndergroundMainlineTrack>;
type Role = 'repair' | 'board' | 'leave' | 'brake' | 'go' | 'turnout' |
  'rerail' | 'load' | 'unload' | 'winch';
const swatches = {
  stone: 0x8a8378, earth: 0xa98a56, wood: 0x5d4630, green: 0x44503c,
  night: 0x2c3648, rust: 0x8a4a34, ember: 0xe08a3c, crystal: 0x7fd4c8,
} as const;
export const undergroundMainlineWords = Object.freeze({
  title: '未写矿线 · 第六班常轨',
  camp: '营地站 · 双轨归仓 · 摇绞盘唤空车',
  gate: '矿门站 · 停车卸矿 · 清点方可折返',
  switch: '道岔：左通矿门，右见深巷。停车下车再扳。',
  repair: {
    sleepers: '塌枕段 · 搬换三根枕木',
    gauge: '偏轨段 · 撬正三记钢轨',
    'turnout-rust': '锈岔段 · 敲三记再上油',
  },
  car: '第六班矿车 · 载矿不载谎言',
  brake: '弯前握闸，车速高则翻；脱轨不卸人。',
  winch: '空车才能唤回；守住绞盘直至车归站。',
} as const);
type Viewer = Readonly<{ playerId: string; domainId: string; foot: UndergroundMainlinePoint }>;
type Options = Readonly<{
  parent: Group;
  route?: Route;
  /** Acceptance from exact U-15 world geometry, separate from review fixture foot. */
  supportsRoute(route: Route): boolean;
  readSnapshot(): U19MineCartSnapshot | undefined;
  readLightBudget(): number;
  readViewer(): Viewer | undefined;
  canSee(playerId: string, role: Role, foot: UndergroundMainlinePoint): boolean;
  dispatch(intent: Readonly<{ playerId: string; revision: number; role: Role;
    fault?: keyof U19MineCartSnapshot['faults']; verb?: string;
    held?: boolean; target?: string }>): void;
  onNoise?(kind: 'rolling'|'brake'|'derail'|'repair', at: UndergroundMainlinePoint): void;
}>;
const activities: readonly Role[] = ['repair', 'board', 'leave', 'brake', 'go',
  'turnout', 'rerail', 'load', 'unload', 'winch'];
const validPosition = (point: UndergroundMainlinePoint) =>
  [point.east, point.north, point.height].every(Number.isFinite);
const repairVerbs = {
  sleepers: ['carry-sleeper', 'carry-sleeper', 'carry-sleeper'],
  gauge: ['pry-gauge', 'pry-gauge', 'pry-gauge'],
  'turnout-rust': ['knock-rust', 'knock-rust', 'knock-rust', 'apply-oil'],
} as const;
const repairIds = ['sleepers', 'gauge', 'turnout-rust'] as const;
function validateSnapshot(s?: U19MineCartSnapshot): s is U19MineCartSnapshot {
  return !!s && Number.isSafeInteger(s.revision) && s.revision >= 0 &&
    Number.isFinite(s.chainage) && Number.isFinite(s.speed) &&
    ['repairing', 'stopped', 'rolling', 'derailed', 'recalling'].includes(s.mode);
}
function grain(a: number, b: number) {
  const pixels = new Uint8Array(16 * 16 * 4);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const shade = (y % 3 === 0 || (x * 11 + y * 29) % 31 < 3) ? b : a;
    pixels.set([shade >> 16, (shade >> 8) & 255, shade & 255, 255],
      (y * 16 + x) * 4);
  }
  const texture = new DataTexture(pixels, 16, 16);
  texture.minFilter = texture.magFilter = NearestFilter;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Four-round full mainline section. It shows an entire approved ~120m rail but is
 * not a teleport/movement host. Repair, cargo, switch and riding all require U-19 receipts.
 */
export function mountUndergroundMainlineScene(host: Options) {
  const candidateRoute = host.route;
  if (!candidateRoute) return { kind: 'unregistered' } as const;
  if (!candidateRoute.domainId.trim() || !Number.isFinite(candidateRoute.length) ||
      candidateRoute.length < 115 || candidateRoute.length > 125 ||
      host.supportsRoute(candidateRoute) !== true) {
    return { kind: 'unsupported-route' } as const;
  }
  const route: Route = candidateRoute;
  const root = new Group();
  root.name = 'u19-certified-120m-mainline';
  const blockGeo = new BoxGeometry();
  const materials: MeshStandardMaterial[] = [];
  const maps: DataTexture[] = [];
  const instances: InstancedMesh[] = [];
  const batches = new Map<string, { color: number; second: number; parts: Matrix4[] }>();
  const matrix = new Matrix4();
  const position = new Vector3();
  const scale = new Vector3();
  const orientation = new Quaternion();
  function piece(family: string, color: number, second: number,
    x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw = 0) {
    const row = batches.get(family) ?? { color, second, parts: [] };
    position.set(x, y, z);
    scale.set(sx, sy, sz);
    orientation.setFromAxisAngle(new Vector3(0, 1, 0), yaw);
    row.parts.push(matrix.compose(position, orientation, scale).clone());
    batches.set(family, row);
  }
  function at(m: number) {
    const pose = route.sample(m);
    const p = pose.position;
    return { ...pose, x: p.east, y: p.height, z: -p.north };
  }
  const gauge = route.gaugeMetres;
  const pose = new Object3D();
  const sleepers = route.sampleSleepers(.85);
  for (const s of sleepers) {
    const p = s.position;
    piece('rail-sleeper', swatches.wood, swatches.earth,
      p.east, p.height - .07, -p.north, gauge + .72, .16, .23, s.heading);
    piece('sleeper-iron-shoes', swatches.rust, swatches.night,
      p.east, p.height + .012, -p.north, gauge + .34, .07, .085, s.heading);
  }
  // The same host-certified spline supplies both visual rails and walking/vehicle sweeps.
  for (let m = 0; m < route.length; m += .8) {
    const start = route.sample(m);
    const end = route.sample(Math.min(route.length, m + .8));
    const middle = route.sample((m + Math.min(route.length, m + .8)) / 2);
    const center = middle.position;
    const length = Math.hypot(end.position.east - start.position.east,
      end.position.north - start.position.north,
      end.position.height - start.position.height);
    for (const side of [-1, 1]) {
      const x = center.east + Math.cos(middle.heading) * gauge * .5 * side;
      const z = -center.north - Math.sin(middle.heading) * gauge * .5 * side;
      piece('double-iron-running-rails', swatches.night, swatches.stone,
        x, center.height + .053, z, .105, .115, length + .02, middle.heading);
      if (Math.floor(m) % 7 === 0)
        piece('rusty-rail-clips', swatches.rust, swatches.earth,
          x, center.height + .11, z, .16, .04, .08, middle.heading);
    }
    if (Math.floor(m) % 3 === 0) {
      piece('ballast-stones', swatches.stone, swatches.earth, center.east + 1.5,
        center.height + .06, -center.north + .35, .27, .17, .34);
      piece('ballast-stones', swatches.stone, swatches.earth, center.east - 1.5,
        center.height + .03, -center.north - .32, .22, .13, .28);
    }
  }

  // Functional clusters: two station ends, three repair bays and a real turnout.
  const workRoles = [
    ['camp', 0], ['gate', route.length], ['turnout', route.turnoutMetres],
    ['sleepers', route.faults.sleepers], ['gauge', route.faults.gauge],
    ['turnout-rust', route.faults['turnout-rust']],
  ] as const;
  for (const [role, chainage] of workRoles) {
    const p = at(chainage);
    const isStation = role === 'camp' || role === 'gate';
    if (isStation) {
      for (let x = -3; x <= 3; x += .55)
        piece('station-slate-foundation', swatches.stone, swatches.night,
          p.x + x, p.y - .13, p.z - 1.0, .52, .20, 4.8, p.heading);
      for (let i = 0; i < 13; i++) {
        piece('station-wood-planks', swatches.wood, swatches.earth,
          p.x + (i % 4 - 1.5) * .92, p.y + .04,
          p.z + (Math.floor(i / 4) - 1) * .84, .77, .10, .60, p.heading);
      }
      for (const dx of [-2.65, 2.65]) {
        piece('station-board-supports', swatches.wood, swatches.earth,
          p.x + dx, p.y + .85, p.z - 1.4, .19, 1.7, .19);
        piece('station-copper-joints', swatches.earth, swatches.rust,
          p.x + dx, p.y + 1.78, p.z - 1.4, .22, .09, .2);
      }
      piece('station-board-signs', swatches.earth, swatches.wood,
        p.x, p.y + 2.0, p.z - 1.38, 3.5, .48, .17);
      // Distinct end winches, one active only when the cart is on the far end.
      piece('station-winch-iron', swatches.rust, swatches.night,
        p.x - 2.6, p.y + .42, p.z + 2, .85, .78, .78);
      piece('station-winch-wood-wheel', swatches.wood, swatches.earth,
        p.x - 2.6, p.y + .93, p.z + 2, 1.0, .14, .24);
      for (let i = 0; i < 9; i++)
        piece('station-wood-storage', swatches.wood, swatches.green,
          p.x + 2.0 + (i % 3) * .28, p.y + .16 + Math.floor(i / 3) * .18,
          p.z + 1.3, .26, .21, .83 - i % 3 * .08);
    } else {
      // Repair families read differently from afar; tool rack and permanent restored scar remain.
      piece('rail-repair-workdeck', swatches.wood, swatches.earth,
        p.x + 2.0, p.y + .09, p.z + .35, 2.0, .15, 1.6);
      piece('rail-repair-tool-wall', swatches.night, swatches.rust,
        p.x + 2.64, p.y + .95, p.z + .23, .25, 1.56, 1.6);
      for (let j = 0; j < 12; j++)
        piece('rail-repair-scattered-tools', j % 4 ? swatches.rust : swatches.stone, swatches.wood,
          p.x + 1.6 + (j % 4) * .31, p.y + .16 + j % 3 * .085,
          p.z + .55 - Math.floor(j / 4) * .26, .15, .09, .18);
      for (let j = 0; j < 11; j++)
        piece('rail-repair-ore-chips', j % 5 ? swatches.night : swatches.stone, swatches.rust,
          p.x - 1.5 + (j % 5) * .24, p.y + .05, p.z + .75 - Math.floor(j / 5) * .17,
          .11, .065, .17);
    }
  }
  for (let i = 0; i < 12; i++) {
    const p = at(route.turnoutMetres + i * .12);
    piece('turnout-adjustable-rusty-blades', swatches.rust, swatches.night,
      p.x + Math.sin(i * .13) * .29, p.y + .13, p.z, .13, .17, .28, p.heading);
  }
  // Hot lamps belong to their real metal cage and must stay inside the shared light budget.
  const lampPoints = [0, route.length, route.turnoutMetres,
    route.faults.sleepers, route.faults.gauge, route.faults['turnout-rust']];
  const lamps: PointLight[] = [];
  const lampMaterial = new MeshStandardMaterial({ color: swatches.earth, emissive: swatches.ember,
    emissiveIntensity: .9 });
  const lampGeometry = new BoxGeometry(.3, .38, .3);
  for (const m of lampPoints) {
    const p = at(m);
    piece('lamp-frame-rusted-iron', swatches.rust, swatches.night,
      p.x + 3.0, p.y + 1.3, p.z, .18, 2.6, .17);
    piece('lamp-frame-rusted-iron', swatches.rust, swatches.night,
      p.x + 3.0, p.y + 2.6, p.z, .55, .15, .55);
    const glass = new Mesh(lampGeometry, lampMaterial);
    glass.name = 'u19-source-lamp-glass';
    glass.position.set(p.x + 3, p.y + 2.25, p.z);
    root.add(glass);
    const light = new PointLight(swatches.ember, 5.6, 8, 2);
    light.name = 'u19-budgeted-station-lantern';
    light.visible = false;
    light.position.set(p.x + 3, p.y + 2.20, p.z);
    lamps.push(light);
    root.add(light);
  }
  for (const [family, row] of batches) {
    const map = grain(row.color, row.second);
    const mat = new MeshStandardMaterial({ map, flatShading: true,
      roughness: family.includes('rails') || family.includes('iron') ? .75 : .97 });
    const mesh = new InstancedMesh(blockGeo, mat, row.parts.length);
    mesh.name = 'u19/' + family;
    row.parts.forEach((p, i) => mesh.setMatrixAt(i, p));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    root.add(mesh);
    maps.push(map); materials.push(mat); instances.push(mesh);
  }
  // Written story signs are physical pixel text, never placeholders or HUD floating hints.
  const signMeshes: Array<Mesh<PlaneGeometry, MeshBasicMaterial>> = [];
  const signRecords = [
    [undergroundMainlineWords.camp, 0],
    [undergroundMainlineWords.gate, route.length],
    [undergroundMainlineWords.switch, route.turnoutMetres],
  ] as const;
  for (const [label, chainage] of signRecords) {
    if (typeof document === 'undefined') continue;
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 164;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    ctx.fillStyle = '#5d4630'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#a98a56'; ctx.lineWidth = 9; ctx.strokeRect(7, 6, 1010, 150);
    ctx.fillStyle = '#e8ecf0'; ctx.font = 'bold 55px "Microsoft YaHei", "Noto Sans CJK SC",sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, 512, 80, 980);
    const map = new CanvasTexture(canvas);
    map.minFilter = map.magFilter = NearestFilter;
    map.colorSpace = SRGBColorSpace;
    const mat = new MeshBasicMaterial({ map, transparent: false });
    const sign = new Mesh(new PlaneGeometry(3.75, .54), mat);
    sign.name = 'u19-authored-route-sign/' + chainage;
    const p = at(chainage);
    sign.position.set(p.x, p.y + 1.99, p.z - 1.28);
    root.add(sign); signMeshes.push(sign);
  }

  const cart = createUndergroundMineCartModel();
  cart.group.name = 'u19-shared-full-line-cart';
  cart.group.visible = false;
  root.add(cart.group);
  const faultMarkers = new Map<string, Group>();
  for (const key of repairIds) {
    const marker = new Group();
    marker.name = 'u19-unrepaired-workspot/' + key;
    const atFault = at(route.faults[key]);
    marker.position.set(atFault.x, atFault.y + .2, atFault.z);
    const material = new MeshStandardMaterial({ color: swatches.rust, roughness: 1 });
    const mesh = new Mesh(blockGeo, material);
    mesh.scale.set(.8, .14, .34);
    marker.add(mesh);
    marker.userData.material = material;
    root.add(marker); faultMarkers.set(key, marker);
  }
  host.parent.add(root);
  let disposed = false;
  let last: U19MineCartSnapshot | undefined;
  function sync(snapshot = host.readSnapshot()) {
    if (disposed || !validateSnapshot(snapshot) ||
        snapshot.chainage < 0 || snapshot.chainage > route.length) {
      cart.group.visible = false;
      lamps.forEach(lamp => lamp.visible = false);
      return false;
    }
    const p = at(snapshot.chainage);
    cart.group.visible = true;
    cart.group.position.set(p.x, p.y, p.z);
    cart.group.rotation.set(p.grade, p.heading, 0, 'YXZ');
    cart.setWheelTravel(snapshot.chainage);
    for (const [key, group] of faultMarkers)
      group.visible = snapshot.faults[key as keyof typeof snapshot.faults] <
        repairVerbs[key as keyof typeof repairVerbs].length;
    let remaining = Math.max(0, Math.floor(host.readLightBudget()));
    for (const light of lamps) {
      light.visible = remaining > 0;
      if (remaining > 0) remaining--;
    }
    if (last && snapshot.revision > last.revision && snapshot.chainage !== last.chainage) {
      if (snapshot.mode === 'derailed') host.onNoise?.('derail', p.position);
      else host.onNoise?.('rolling', p.position);
    }
    if (last && snapshot.revision > last.revision && snapshot.brakeHeld !== last.brakeHeld &&
        snapshot.brakeHeld) host.onNoise?.('brake', p.position);
    if (last && snapshot.revision > last.revision && repairIds.some(key =>
        snapshot.faults[key] !== last!.faults[key])) host.onNoise?.('repair', p.position);
    last = structuredClone(snapshot);
    return true;
  }
  sync();
  function prompt(requestedRole?: Role) {
    const viewer = host.readViewer();
    const snapshot = host.readSnapshot();
    if (disposed || !viewer || !viewer.playerId.trim() || viewer.domainId !== route.domainId ||
        !validPosition(viewer.foot) || !validateSnapshot(snapshot)) return;
    const candidate: Array<{ role: Role; pos: UndergroundMainlinePoint;
      label: string; fault?: keyof U19MineCartSnapshot['faults']; verb?: string }> = [];
    for (const fault of repairIds) {
      const progress = snapshot.faults[fault];
      if (snapshot.mode === 'repairing' && progress < repairVerbs[fault].length)
        candidate.push({ role: 'repair', pos: route.work[fault].position,
          label: undergroundMainlineWords.repair[fault], fault, verb: repairVerbs[fault][progress] });
    }
    const point = route.sample(snapshot.chainage).position;
    if (snapshot.mode === 'derailed' && !snapshot.riderId)
      candidate.push({ role: 'rerail', pos: point, label: '手扶车轮 · 扶正归轨' });
    if (snapshot.mode === 'stopped') {
      if (snapshot.riderId === viewer.playerId) {
        candidate.push({ role: 'leave', pos: point, label: '主动下矿车' });
        // Do not advertise a train into a decorative, unregistered branch.
        if (Math.abs(snapshot.chainage - route.turnoutMetres) >= 1 ||
            snapshot.turnout === 'gate') {
          candidate.push({ role: 'go', pos: point, label: '松闸滑行 · 盯紧岔口' });
        }
      }
      if (!snapshot.riderId)
        candidate.push({ role: 'board', pos: point, label: '进入旧矿车' });
      if (!snapshot.riderId && Math.abs(snapshot.chainage - route.turnoutMetres) < 1)
        candidate.push({ role: 'turnout', pos: route.work.turnout.position,
          label: undergroundMainlineWords.switch });
      if (!snapshot.riderId && (snapshot.chainage <= 2 ||
          snapshot.chainage >= route.length - 2))
        candidate.push({ role: 'load', pos: point, label: '码入矿石 · 车斗三倍背包容量' },
          { role: 'unload', pos: point, label: '卸矿入账 · 先检查背包' });
    }
    if (snapshot.mode === 'recalling' || snapshot.mode === 'stopped' &&
        snapshot.chainage > 2 && !snapshot.riderId)
      candidate.push({ role: 'winch', pos: route.work.camp.position,
        label: undergroundMainlineWords.winch });
    if (snapshot.riderId === viewer.playerId && snapshot.mode === 'rolling')
      candidate.push({ role: 'brake', pos: point, label: undergroundMainlineWords.brake });
    const nearest = candidate
      .filter(item => (!requestedRole || requestedRole === item.role) &&
        host.canSee(viewer.playerId, item.role, item.pos) &&
        Math.hypot(viewer.foot.east - item.pos.east, viewer.foot.north - item.pos.north,
          viewer.foot.height - item.pos.height) <= (item.role === 'brake' ? 3 : 1.7))
      .sort((a, b) => Math.hypot(viewer.foot.east - a.pos.east, viewer.foot.north - a.pos.north) -
        Math.hypot(viewer.foot.east - b.pos.east, viewer.foot.north - b.pos.north))[0];
    return nearest && { ...nearest, revision: snapshot.revision,
      id: 'u19/' + nearest.role + '/' + (nearest.fault ?? 'cart') };
  }
  function press(expectedRole: Role, held = false) {
    const viewer = host.readViewer();
    const available = prompt(expectedRole);
    if (!viewer || !available || available.role !== expectedRole) return false;
    host.dispatch({ playerId: viewer.playerId, revision: available.revision,
      role: expectedRole, fault: available.fault, verb: available.verb, held });
    return true;
  }
  return {
    kind: 'ready', group: root, cart: cart.group, sync, prompt, press,
    route, words: undergroundMainlineWords, sleepers: sleepers.length,
    batches: instances.length,
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      cart.dispose();
      for (const batch of instances) batch.dispose();
      for (const material of materials) material.dispose();
      for (const map of maps) map.dispose();
      for (const item of signMeshes) {
        item.material.map?.dispose(); item.material.dispose(); item.geometry.dispose();
      }
      for (const group of faultMarkers.values()) {
        const material = group.userData.material as MeshStandardMaterial;
        material.dispose();
      }
      blockGeo.dispose();
      lampGeometry.dispose(); lampMaterial.dispose();
      root.clear();
    },
  } as const;
}
