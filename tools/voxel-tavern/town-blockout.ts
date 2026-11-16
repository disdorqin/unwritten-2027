// UNWRITTEN 2027 小镇初搭 · 灰盒预览（任务书 A3）
// 读 tools/voxel-tavern/town-blockout/layout.json，按共享坐标表生成地形、道路、
// 桥梁、河湖与 12 个灰盒地块；俯瞰 + 第一人称双视角；河水可下水蹚过，桥也能走。
// 技术栈与酒馆样板一致：Vite + Three.js 0.183.2（本文件只用 three，不依赖 Voxelize）。
// 坐标：俯视北上右东；layout 用 [东, 北, 高]；Three.js 世界坐标 = [东 - 224, 高, 192 - 北]，每单位 1 米。
import * as THREE from 'three';
import layout from './town-blockout/layout.json';

type Plot = {
  id: string;
  origin: [number, number, number];
  footprint: [number, number];
  door: [number, number];
  connect: [number, number, number];
};
type Road = { id: string; width: number; points: [number, number, number][] };
type Bridge = { id: string; north: number; west: number; east: number; height: number };

const L = layout as unknown as {
  width: number; depth: number;
  plaza: { bounds: [number, number, number, number]; height: number; spawn: [number, number] };
  river: [number, number][];
  lake: { center: [number, number]; radius: [number, number]; height: number; inlet: [number, number][] };
  bridges: Bridge[];
  roads: Road[];
  plots: Plot[];
};

const MAP_W = L.width; // 448（东）
const MAP_D = L.depth; // 384（北）
const CX = MAP_W / 2; // 224
const CZ = MAP_D / 2; // 192
const wx = (e: number) => e - CX;
const wz = (n: number) => CZ - n;
const ex = (x: number) => x + CX;
const nz = (z: number) => CZ - z;

// ---- 假设（用户 2026-11-16 21:02 拍板：按合理默认值做，留给 GPT 验收时改） ----
// 1. 玻璃暖房门：layout.json 写的是 [362,96]，落在地块西边外 3.5 米；这里按 [365.5,96]（地块西边线）画，不改 layout.json。
// 2. 灯塔：不补正式支路，灯塔地块靠野地步行可达（用户要最大自由度，野地能走）。
const DOOR_OVERRIDE: Record<string, [number, number]> = { glasshouse: [365.5, 96] };
const doorOf = (p: Plot): [number, number] => DOOR_OVERRIDE[p.id] ?? p.door;

// 灰盒高度（米）：钟楼按任务书塔顶目标 96 米；其余按 B 组造型留体量占位。
const BOX_H: Record<string, number> = {
  clocktower: 96, memorial: 12, 'long-hall': 14, tavern: 10, 'post-office': 9,
  cabins: 7, 'lantern-workshop': 8, 'market-stalls': 5, carousel: 9,
  glasshouse: 8, lighthouse: 18, stage: 6,
};
// 分区灰度
const DISTRICT_COLOR: Record<string, number> = {
  clocktower: 0x8d8578, tavern: 0x8d8578, 'post-office': 0x8d8578, stage: 0x8d8578,
  cabins: 0x7e8a76, memorial: 0x8a7a68, 'long-hall': 0x8a7a68,
  'lantern-workshop': 0x94855c, 'market-stalls': 0x94855c,
  carousel: 0x6d7f8c, glasshouse: 0x6d7f8c, lighthouse: 0x6d7f8c,
};

// ---------- 地形高度 ----------
// 控制点：广场角点、全部道路高程点、各地块四角（地坪高）、河床采样、湖岸、地图外圈谷 rim。
type CP = { e: number; n: number; h: number };
const control: CP[] = [];
{
  const [x0, y0, x1, y1] = L.plaza.bounds;
  const ph = L.plaza.height;
  control.push({ e: x0, n: y0, h: ph }, { e: x1, n: y0, h: ph }, { e: x0, n: y1, h: ph }, { e: x1, n: y1, h: ph }, { e: (x0 + x1) / 2, n: (y0 + y1) / 2, h: ph });
  for (const r of L.roads) for (const p of r.points) control.push({ e: p[0], n: p[1], h: p[2] });
  for (const p of L.plots) {
    const [ox, oy, oh] = p.origin; const [w, d] = p.footprint;
    control.push({ e: ox - w / 2, n: oy - d / 2, h: oh }, { e: ox + w / 2, n: oy - d / 2, h: oh },
      { e: ox - w / 2, n: oy + d / 2, h: oh }, { e: ox + w / 2, n: oy + d / 2, h: oh });
  }
  // 河床：沿河道每约 6 米一个点，床高从北端 9.5 渐降到入湖口 4.5
  const riverLen = polyLen(L.river);
  for (let s = 0; s <= riverLen; s += 6) {
    const [e, n, t] = polyAt(L.river, s);
    control.push({ e, n, h: 9.5 - 5 * t });
  }
  // 湖岸
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    control.push({ e: L.lake.center[0] + Math.cos(a) * L.lake.radius[0], n: L.lake.center[1] + Math.sin(a) * L.lake.radius[1], h: 6.5 });
  }
  // 外圈谷 rim（高 24），河道南北出入口留缺口
  for (let e = 0; e <= MAP_W; e += 32) {
    if (e < 210 || e > 255) control.push({ e, n: MAP_D, h: 24 });
    if (e < 245 || e > 285) control.push({ e, n: 0, h: 24 });
  }
  for (let n = 0; n <= MAP_D; n += 32) {
    control.push({ e: 0, n, h: 24 }, { e: MAP_W, n, h: 24 });
  }
}

function polyLen(pts: [number, number][]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return s;
}
// 沿折线取弧长 s 处的点，返回 [东, 北, 归一化弧长]
function polyAt(pts: [number, number][], s: number): [number, number, number] {
  const total = polyLen(pts);
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (acc + seg >= s) {
      const t = seg === 0 ? 0 : (s - acc) / seg;
      return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t, Math.min(1, s / total)];
    }
    acc += seg;
  }
  const last = pts[pts.length - 1];
  return [last[0], last[1], 1];
}
// 到河道的最近距离与该处河床高
function riverInfo(e: number, n: number): { dist: number; bed: number } {
  let best = Infinity; let bestBed = 9.5;
  const total = polyLen(L.river);
  let acc = 0;
  for (let i = 1; i < L.river.length; i++) {
    const [ax, ay] = L.river[i - 1]; const [bx, by] = L.river[i];
    const dx = bx - ax; const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((e - ax) * dx + (n - ay) * dy) / len2));
    const px = ax + dx * t; const py = ay + dy * t;
    const d = Math.hypot(e - px, n - py);
    if (d < best) { best = d; bestBed = 9.5 - 5 * Math.min(1, (acc + Math.sqrt(len2) * t) / total); }
    acc += Math.sqrt(len2);
  }
  return { dist: best, bed: bestBed };
}
function inLake(e: number, n: number): number {
  const dx = (e - L.lake.center[0]) / L.lake.radius[0];
  const dy = (n - L.lake.center[1]) / L.lake.radius[1];
  return Math.hypot(dx, dy); // <1 在湖内
}
function plotAt(e: number, n: number): Plot | undefined {
  return L.plots.find((p) => {
    const [ox, oy] = p.origin; const [w, d] = p.footprint;
    return e >= ox - w / 2 && e <= ox + w / 2 && n >= oy - d / 2 && n <= oy + d / 2;
  });
}
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (a: number, b: number, v: number) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

function idwHeight(e: number, n: number): number {
  let num = 0; let den = 0;
  for (const c of control) {
    const d2 = (e - c.e) ** 2 + (n - c.n) ** 2;
    if (d2 < 0.01) return c.h;
    const wgt = 1 / d2;
    num += wgt * c.h; den += wgt;
  }
  return num / den;
}

// 地形高（不含桥面）：地块内铺平到地坪高，湖内为湖床 4.0，河道刻出河床
export function terrainHeight(e: number, n: number): number {
  const p = plotAt(e, n);
  if (p) return p.origin[2];
  const lk = inLake(e, n);
  const base = idwHeight(e, n);
  if (lk < 1) return 4.0;
  if (lk < 1.2) return 4.0 + (base - 4.0) * smooth(1, 1.2, lk);
  const rv = riverInfo(e, n);
  if (rv.dist < 7) return rv.bed;
  if (rv.dist < 12) return rv.bed + (base - rv.bed) * smooth(7, 12, rv.dist);
  return base;
}
// 水面高：湖 5.5；河道水面 = 河床 + 1.5；其余无水
export function waterLevelAt(e: number, n: number): number {
  if (inLake(e, n) < 1.05) return L.lake.height;
  const rv = riverInfo(e, n);
  if (rv.dist < 6) return rv.bed + 1.5;
  return -Infinity;
}
// 桥面高：落在桥矩形内时返回桥面高，否则 -Infinity
function bridgeHeightAt(e: number, n: number): number {
  for (const b of L.bridges) {
    if (e >= b.west - 2 && e <= b.east + 2 && Math.abs(n - b.north) <= 3.5) return b.height;
  }
  return -Infinity;
}
// 行走地面高：桥面优先，否则地形
export function groundHeight(e: number, n: number): number {
  return Math.max(terrainHeight(e, n), bridgeHeightAt(e, n));
}
// 是否在水中：按实际行走地面（桥面优先）判断，站在桥上不算涉水
export function inWater(e: number, n: number): boolean {
  return groundHeight(e, n) < waterLevelAt(e, n);
}

// ---------- 场景 ----------
const statusEl = document.querySelector('#status')!;
const errorEl = document.querySelector('#error')!;
const canvas = document.querySelector('#view') as HTMLCanvasElement;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
const scene = new THREE.Scene();
scene.background = new THREE.Color('#bfd4e6');
const sun = new THREE.DirectionalLight(0xfff2d8, 1.6);
sun.position.set(120, 180, 60);
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xdfeaf5, 0x8a94a0, 0.9));

const fpCamera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 1200);
const topCamera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 1, 2000);
let topHeight = 380; // 默认整图入镜：俯瞰可见高约 1.04×高度，384 米深需 ≥370
let topCenter = new THREE.Vector3(wx(224), 0, wz(192));

const plotsGroup = new THREE.Group();
const roadsGroup = new THREE.Group();
const waterGroup = new THREE.Group();
scene.add(plotsGroup, roadsGroup, waterGroup);

function mat(color: number, opts: Partial<THREE.MeshLambertMaterialParameters> = {}) {
  return new THREE.MeshLambertMaterial({ color, ...opts });
}

function buildTerrain() {
  const step = 2; const nx = MAP_W / step; const nz = MAP_D / step;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array((nx + 1) * (nz + 1) * 3);
  const col = new Float32Array((nx + 1) * (nz + 1) * 3);
  const snow = new THREE.Color('#dfe8f2'); const rock = new THREE.Color('#8f99a5'); const sand = new THREE.Color('#b3a486');
  const c = new THREE.Color();
  let k = 0;
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const e = i * step; const n = MAP_D - j * step;
      const h = terrainHeight(e, n);
      pos[k * 3] = wx(e); pos[k * 3 + 1] = h; pos[k * 3 + 2] = wz(n);
      const slope = Math.max(Math.abs(terrainHeight(e + 2, n) - h), Math.abs(terrainHeight(e, n + 2) - h)) / 2;
      c.copy(snow).lerp(rock, Math.min(1, slope * 0.9));
      const rv = riverInfo(e, n);
      if (rv.dist < 10) c.lerp(sand, 0.55 * (1 - rv.dist / 10));
      if (inLake(e, n) < 1.05) c.multiplyScalar(0.55);
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
      k++;
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i; const b = a + 1; const d = a + nx + 1; const e2 = d + 1;
    idx.push(a, d, b, b, d, e2);
  }
  geo.setIndex(idx);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  scene.add(mesh);
}

function ribbonStrip(pts: [number, number][], width: number, yFn: (e: number, n: number) => number, color: number, opacity = 1): THREE.Mesh {
  const positions: number[] = []; const indices: number[] = [];
  const sampled: [number, number][] = [];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1]; const [bx, by] = pts[i];
    const len = Math.hypot(bx - ax, by - ay);
    const steps = Math.max(1, Math.round(len / 2));
    for (let s = 0; s < steps; s++) sampled.push([ax + ((bx - ax) * s) / steps, ay + ((by - ay) * s) / steps]);
  }
  sampled.push(pts[pts.length - 1]);
  sampled.forEach(([e, n], i) => {
    const next = sampled[Math.min(i + 1, sampled.length - 1)]; const prev = sampled[Math.max(i - 1, 0)];
    let dx = next[0] - prev[0]; let dz = next[1] - prev[1];
    const len = Math.hypot(dx, dz) || 1; dx /= len; dz /= len;
    const px = -dz * width / 2; const pz = dx * width / 2;
    const y = yFn(e, n);
    positions.push(wx(e + px), y, wz(n + pz), wx(e - px), y, wz(n - pz));
    if (i > 0) { const a = (i - 1) * 2; indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, transparent: opacity < 1, opacity, side: THREE.DoubleSide }));
}

function buildRoadsAndPlaza() {
  for (const r of L.roads) {
    const pts = r.points.map((p) => [p[0], p[1]] as [number, number]);
    roadsGroup.add(ribbonStrip(pts, r.width, (e, n) => terrainHeight(e, n) + 0.15, 0xc3c9d2));
  }
  const [x0, y0, x1, y1] = L.plaza.bounds;
  const plaza = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), mat(0xcfc4ae));
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(wx((x0 + x1) / 2), L.plaza.height + 0.08, wz((y0 + y1) / 2));
  roadsGroup.add(plaza);
  const spawn = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.3, 16), mat(0xe07840));
  spawn.position.set(wx(L.plaza.spawn[0]), L.plaza.height + 0.2, wz(L.plaza.spawn[1]));
  roadsGroup.add(spawn);
}

function buildWater() {
  const riverPts = L.river;
  const total = polyLen(riverPts);
  const samples: [number, number][] = [];
  for (let s = 0; s <= total; s += 4) { const [e, n] = polyAt(riverPts, s); samples.push([e, n]); }
  waterGroup.add(ribbonStrip(samples, 11, (e, n) => riverInfo(e, n).bed + 1.5, 0x4a7fa5, 0.8));
  const lake = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshLambertMaterial({ color: 0x4a7fa5, transparent: true, opacity: 0.8 }));
  lake.rotation.x = -Math.PI / 2;
  lake.scale.set(L.lake.radius[0], L.lake.radius[1], 1);
  lake.position.set(wx(L.lake.center[0]), L.lake.height, wz(L.lake.center[1]));
  waterGroup.add(lake);
}

function buildBridges() {
  for (const b of L.bridges) {
    const len = b.east - b.west + 4;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(len, 0.8, 7), mat(0xa08a68));
    deck.position.set(wx((b.west + b.east) / 2), b.height - 0.4, wz(b.north));
    scene.add(deck);
    for (const side of [-3.2, 3.2]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 1.0, 0.3), mat(0x7d6a4e));
      rail.position.set(wx((b.west + b.east) / 2), b.height + 0.5, wz(b.north) + side);
      scene.add(rail);
    }
  }
}

function textSprite(text: string, scale = 1): THREE.Sprite {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = 'rgba(20,28,38,0.75)'; ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = '#f4e6cb'; ctx.font = 'bold 30px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(cv);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sp.scale.set(16 * scale, 4 * scale, 1);
  return sp;
}

function buildPlots() {
  for (const p of L.plots) {
    const [ox, oy, oh] = p.origin; const [w, d] = p.footprint;
    const h = BOX_H[p.id] ?? 8;
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(DISTRICT_COLOR[p.id] ?? 0x888888));
    box.position.set(wx(ox), oh + h / 2, wz(oy));
    box.userData.plotId = p.id;
    plotsGroup.add(box);
    const label = textSprite(p.id);
    label.position.set(wx(ox), oh + h + 4, wz(oy));
    plotsGroup.add(label);
    const [dx, dy] = doorOf(p);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.6, 0.4), mat(0xe07840));
    door.position.set(wx(dx), oh + 1.3, wz(dy));
    plotsGroup.add(door);
  }
  const plazaLabel = textSprite('中央广场', 1.2);
  plazaLabel.position.set(wx(221), L.plaza.height + 5, wz(190.5));
  plotsGroup.add(plazaLabel);
}

// ---------- 行走 ----------
const player = {
  pos: new THREE.Vector3(wx(L.plaza.spawn[0]), L.plaza.height + 1.65, wz(L.plaza.spawn[1])),
  yaw: Math.PI, // 面向北（钟楼）
  pitch: 0,
  vy: 0, grounded: true,
};
const keys = new Set<string>();
let autoPath: [number, number][] = [];
let autoResolve: ((v: { reached: boolean; samples: { e: number; n: number; h: number; water: boolean }[] }) => void) | null = null;
let autoDeadline = 0;

function plotAABBs(): { x0: number; x1: number; z0: number; z1: number }[] {
  return L.plots.map((p) => {
    const [ox, oy] = p.origin; const [w, d] = p.footprint;
    return { x0: wx(ox - w / 2) - 0.4, x1: wx(ox + w / 2) + 0.4, z0: wz(oy + d / 2) - 0.4, z1: wz(oy - d / 2) + 0.4 };
  });
}
const aabbs = plotAABBs();
function blocked(x: number, z: number): boolean {
  return aabbs.some((b) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1);
}
function tryMove(dx: number, dz: number) {
  const nx = player.pos.x + dx; const nz = player.pos.z + dz;
  if (!blocked(nx, nz)) { player.pos.x = nx; player.pos.z = nz; return; }
  if (!blocked(nx, player.pos.z)) { player.pos.x = nx; return; }
  if (!blocked(player.pos.x, nz)) { player.pos.z = nz; }
}

function updatePlayer(dt: number) {
  const e = ex(player.pos.x); const n = nz(player.pos.z);
  const water = inWater(e, n);
  let speed = 4;
  if (autoPath.length > 0) speed = 8; // 自动行走（验收代驾）用 8 米/秒；手动仍是 4 米/秒
  if (keys.has('shift')) speed = 7;
  if (water) speed *= 0.55;
  let mx = 0; let mz = 0;
  const sin = Math.sin(player.yaw); const cos = Math.cos(player.yaw);
  if (keys.has('w') || keys.has('arrowup')) { mx -= sin; mz -= cos; }
  if (keys.has('s') || keys.has('arrowdown')) { mx += sin; mz += cos; }
  if (keys.has('a') || keys.has('arrowleft')) { mx -= cos; mz += sin; }
  if (keys.has('d') || keys.has('arrowright')) { mx += cos; mz -= sin; }
  if (autoPath.length > 0) {
    const [te, tn] = autoPath[0];
    const dx = wx(te) - player.pos.x; const dz = wz(tn) - player.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1.2) { autoPath.shift(); }
    else {
      player.yaw = Math.atan2(-dx, -dz);
      mx = dx / dist; mz = dz / dist;
      // 自动行走按朝向移动：把世界方向直接用作位移方向
      tryMove(mx * speed * dt, mz * speed * dt);
      if (autoResolve && performance.now() > autoDeadline) { const r = autoResolve; autoResolve = null; autoPath = []; r({ reached: false, samples: lastSamples }); }
      updateVertical(dt);
      return;
    }
    if (autoPath.length === 0 && autoResolve) { const r = autoResolve; autoResolve = null; r({ reached: true, samples: lastSamples }); }
  }
  const len = Math.hypot(mx, mz);
  if (len > 0) tryMove((mx / len) * speed * dt, (mz / len) * speed * dt);
  updateVertical(dt);
  player.pos.x = Math.max(wx(0), Math.min(wx(MAP_W), player.pos.x));
  player.pos.z = Math.max(wz(MAP_D), Math.min(wz(0), player.pos.z));
}
let lastSamples: { e: number; n: number; h: number; water: boolean }[] = [];
function updateVertical(dt: number) {
  const e = ex(player.pos.x); const n = nz(player.pos.z);
  const g = groundHeight(e, n) + 1.65;
  if (player.grounded) {
    player.vy = 0;
    player.pos.y += (g - player.pos.y) * Math.min(1, dt * 12);
    if (keys.has(' ')) { player.vy = 6; player.grounded = false; }
  } else {
    player.vy -= 18 * dt;
    player.pos.y += player.vy * dt;
    if (player.pos.y <= g) { player.pos.y = g; player.grounded = true; player.vy = 0; }
  }
}

// ---------- 视角 ----------
let mode: 'fp' | 'top' = 'top';
function setView(m: 'fp' | 'top') {
  mode = m;
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) => { b.style.outline = b.dataset.view === m ? '2px solid #e07840' : ''; });
}
canvas.addEventListener('click', () => {
  if (mode === 'fp' && document.pointerLockElement !== canvas) canvas.requestPointerLock();
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== canvas) { /* 保持第一人称朝向 */ }
});
document.addEventListener('mousemove', (ev) => {
  if (document.pointerLockElement === canvas && mode === 'fp') {
    player.yaw -= ev.movementX * 0.0025;
    player.pitch = Math.max(-1.4, Math.min(1.4, player.pitch - ev.movementY * 0.0025));
  }
});
// 俯瞰拖动平移 + 滚轮缩放
let dragging = false; let lastX = 0; let lastY = 0;
canvas.addEventListener('pointerdown', (ev) => { if (mode === 'top') { dragging = true; lastX = ev.clientX; lastY = ev.clientY; } });
addEventListener('pointerup', () => { dragging = false; });
addEventListener('pointermove', (ev) => {
  if (dragging && mode === 'top') {
    const scale = topHeight / 500;
    topCenter.x -= (ev.clientX - lastX) * scale;
    topCenter.z -= (ev.clientY - lastY) * scale;
    topCenter.x = Math.max(wx(0), Math.min(wx(MAP_W), topCenter.x));
    topCenter.z = Math.max(wz(MAP_D), Math.min(wz(0), topCenter.z));
    lastX = ev.clientX; lastY = ev.clientY;
  }
});
canvas.addEventListener('wheel', (ev) => {
  if (mode === 'top') { ev.preventDefault(); topHeight = Math.max(120, Math.min(420, topHeight + ev.deltaY * 0.3)); }
}, { passive: false });
addEventListener('keydown', (ev) => {
  const k = ev.key.toLowerCase();
  if (k === 'v') setView(mode === 'fp' ? 'top' : 'fp');
  if (k === ' ') ev.preventDefault();
  keys.add(k);
});
addEventListener('keyup', (ev) => keys.delete(ev.key.toLowerCase()));

// 点击地块传送到门口（仅非锁定状态）
const ray = new THREE.Raycaster();
canvas.addEventListener('dblclick', (ev) => {
  if (document.pointerLockElement === canvas) return;
  const rect = canvas.getBoundingClientRect();
  const mouse = new THREE.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
  const cam = mode === 'fp' ? fpCamera : topCamera;
  ray.setFromCamera(mouse, cam);
  const hit = ray.intersectObjects(plotsGroup.children, false).find((h) => h.object.userData.plotId);
  if (hit) {
    const p = L.plots.find((x) => x.id === hit.object.userData.plotId)!;
    teleport(...doorOf(p));
    setView('fp');
  }
});

function teleport(e: number, n: number) {
  player.pos.set(wx(e), groundHeight(e, n) + 1.65, wz(n));
  player.yaw = Math.PI; player.pitch = 0; player.grounded = true; player.vy = 0;
  autoPath = [];
}
function walkTo(pts: [number, number][]): Promise<{ reached: boolean; samples: { e: number; n: number; h: number; water: boolean }[] }> {
  return new Promise((resolve) => {
    lastSamples = [];
    autoPath = [...pts];
    autoResolve = resolve;
    autoDeadline = performance.now() + 180000;
    const t0 = performance.now();
    const iv = setInterval(() => {
      lastSamples.push({ e: +ex(player.pos.x).toFixed(1), n: +nz(player.pos.z).toFixed(1), h: +player.pos.y.toFixed(2), water: inWater(ex(player.pos.x), nz(player.pos.z)) });
      if (!autoResolve || performance.now() - t0 > 185000) {
        clearInterval(iv);
        if (autoResolve) { const r = autoResolve; autoResolve = null; autoPath = []; r({ reached: false, samples: lastSamples }); }
      }
      if (autoResolve === null) clearInterval(iv);
    }, 500);
  });
}

// ---------- UI ----------
function bindUI() {
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) => { b.onclick = () => setView(b.dataset.view as 'fp' | 'top'); });
  document.querySelector('#spawn')!.addEventListener('click', () => { teleport(...L.plaza.spawn); setView('fp'); });
  document.querySelector('#daynight')!.addEventListener('click', () => {
    const night = (scene.background as THREE.Color).getHex() !== 0x0e1a2a;
    (scene.background as THREE.Color).set(night ? 0x0e1a2a : 0xbfd4e6);
    sun.intensity = night ? 0.5 : 1.6;
  });
  const sel = document.querySelector('#plot') as HTMLSelectElement;
  for (const p of L.plots) { const o = document.createElement('option'); o.value = p.id; o.textContent = p.id; sel.appendChild(o); }
  document.querySelector('#goto')!.addEventListener('click', () => {
    const p = L.plots.find((x) => x.id === sel.value)!;
    teleport(...doorOf(p)); setView('fp');
  });
}

// ---------- 启动 ----------
function start() {
  buildTerrain();
  buildRoadsAndPlaza();
  buildWater();
  buildBridges();
  buildPlots();
  bindUI();
  setView('top');
  teleport(...L.plaza.spawn);
  setView('top');
  let frames = 0;
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(0.05, clock.getDelta());
    updatePlayer(dt);
    if (mode === 'fp') {
      fpCamera.position.copy(player.pos);
      fpCamera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
      renderer.render(scene, fpCamera);
    } else {
      topCamera.position.set(topCenter.x, topHeight, topCenter.z + 0.01);
      topCamera.lookAt(topCenter.x, 0, topCenter.z);
      renderer.render(scene, topCamera);
    }
    if (++frames % 10 === 0) {
      const e = ex(player.pos.x); const n = nz(player.pos.z);
      statusEl.textContent = `${mode === 'fp' ? '第一人称' : '俯瞰'} · 东 ${e.toFixed(0)} 北 ${n.toFixed(0)} 高 ${player.pos.y.toFixed(1)} 米${inWater(e, n) ? ' · 涉水中（走得慢）' : ''} · 12 地块 · 9 条路 · 4 座桥`;
    }
  });
  addEventListener('resize', () => {
    fpCamera.aspect = innerWidth / innerHeight; fpCamera.updateProjectionMatrix();
    topCamera.aspect = innerWidth / innerHeight; topCamera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
  Object.assign(window, {
    townBlockout: {
      layout: L, terrainHeight, waterLevelAt, groundHeight, inWater,
      teleport, walkTo, setView,
      setLayerVisible: (name: string, v: boolean) => {
        if (name === 'plots') plotsGroup.visible = v;
        if (name === 'roads') roadsGroup.visible = v;
        if (name === 'water') waterGroup.visible = v;
      },
      getState: () => ({ mode, east: +ex(player.pos.x).toFixed(1), north: +nz(player.pos.z).toFixed(1), height: +player.pos.y.toFixed(2), water: inWater(ex(player.pos.x), nz(player.pos.z)), yaw: +player.yaw.toFixed(2) }),
    },
  });
  statusEl.textContent = '灰盒已载入 · 俯瞰模式 · 按 V 切换第一人称';
}
try { start(); } catch (e) { (errorEl as HTMLElement).textContent = String(e); console.error(e); }
