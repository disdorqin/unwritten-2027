import {
  AmbientLight, BoxGeometry, BufferAttribute, BufferGeometry, Color, DirectionalLight, Fog, Group,
  Mesh, MeshBasicMaterial, MeshLambertMaterial, Object3D, PerspectiveCamera, PointLight, Scene, Vector3, WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { addScenery } from './scenery';
import { readWalkGeometry, type Box, type Ramp, type TownPlot } from './landmark-kit';
import { buildTowerLandmark } from './landmark-tower';
import { buildTavernLandmark } from './landmark-tavern';
import { buildPostLandmark } from './landmark-post';
import { buildCultureLandmark } from './landmark-culture';
import { buildMarketLandmark } from './landmark-market';
import { buildIcePlayProps, buildLakesideLandmark } from './landmark-lakeside';
import { buildVillageLandmark } from './landmark-village';
import { canEnter, createTerrainGrid, gridStep, layout, riverX, waterHeight } from './terrain';
import { addDistrictHousing } from './district-layout';
import { addForestDensity } from './forest-density';
import { addStreetscape } from './streetscape';
import { createSnowfall } from './snowfall';
import { createFestival } from './festival';
import { buildMuseumLandmark } from './landmark-museum';
import type { MuseumLight } from './museum-kit';
import { createMuseumVisit } from './museum-visit';
import { createTouchWalk } from './touch-walk';
import { terraceStop } from './museum-terrace';
import { createMuseumInspection } from './museum-inspection';
import { createMuseumLaunch } from './museum-launch';
import { createMuseumGuide } from './museum-guide';
import { museumHorizontalScale } from './museum-scale';
import { nearestTownActivity, type TownActivityContext, type TownSeat } from './town-activity';
import { createTavernActivity } from './tavern-activity';
import { createPostActivity } from './post-activity';
import { createStageActivity } from './stage-activity';
import { createMarketActivity } from './market-activity';
import { createIceActivity } from './ice-activity';
import { createWishActivity } from './wish-activity';

const element = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id)! as T;
const grid = createTerrainGrid();
const scene = new Scene();
scene.background = new Color('#adc2dd');
scene.fog = new Fog('#adc2dd', 360, 1300);
const camera = new PerspectiveCamera(58, innerWidth / innerHeight, .1, 1400);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
element('scene').append(renderer.domElement);
renderer.domElement.setAttribute('aria-label', '雪镇建模预览');
renderer.domElement.tabIndex = 0;
const ambient = new AmbientLight('#8aaee5', 1.02);
scene.add(ambient);
const sun = new DirectionalLight('#a9bde9', 1.45);
sun.position.set(-90, 150, 60);
scene.add(sun);
const landscape = new Group();
scene.add(landscape);
const scenery = addScenery(landscape, grid);
const districts = addDistrictHousing(landscape, grid, scenery.blocked);
const streetscape = addStreetscape(landscape, grid, districts.keepClear);
const forest = addForestDensity(landscape, grid, (east, north, radius) => districts.keepClear(east, north, radius) || streetscape.occupied(east, north, radius));
const snowfall = createSnowfall(scene);
const snowButton = element<HTMLButtonElement>('snow');
snowButton.onclick = () => {
  snowfall.setEnabled(!snowfall.enabled());
  snowButton.setAttribute('aria-pressed', String(snowfall.enabled()));
};
const timeOfDay = element<HTMLButtonElement>('lighting');
let nightMode = true;
function setNight(night: boolean) {
  nightMode = night;
  const sky = night ? '#182642' : '#acc2dd';
  (scene.background as Color).set(sky);
  scene.fog!.color.set(sky);
  ambient.color.set(night ? '#83a9e7' : '#e4edff');
  ambient.intensity = night ? .96 : 1.35;
  sun.color.set(night ? '#a6c0fd' : '#ffe6c5');
  sun.intensity = night ? 1.23 : 1.7;
  timeOfDay.textContent = night ? '雪夜' : '白昼';
  timeOfDay.setAttribute('aria-pressed', String(night));
  scenery.setNight(night);
}
setNight(true);
timeOfDay.onclick = () => setNight(timeOfDay.getAttribute('aria-pressed') !== 'true');

const color = ['#d8e1ef', '#9a887c', '#bcac97', '#c7b795', '#78b8d9'].map(value => new Color(value));
const length = (grid.gridWidth - 1) * (grid.gridDepth - 1) * 18;
const position = new Float32Array(length);
const terrainColors = new Float32Array(length);
let offset = 0;
for (let j = 0; j < grid.gridDepth - 1; j++) {
  for (let i = 0; i < grid.gridWidth - 1; i++) {
    const a = j * grid.gridWidth + i;
    const b = a + 1;
    const c = a + grid.gridWidth;
    const d = c + 1;
    for (const tri of [[a, b, c], [b, d, c]]) {
      const [s0, s1, s2] = tri.map(vertex => grid.surfaces[vertex]);
      const material = s0 === s1 || s0 === s2 ? s0 : s1 === s2 ? s1 : 0;
      const shade = 1 - (Math.sin(i * 83.01 + j * 39.17) + 1) * (material === 0 ? .027 : .018);
      for (const index of tri) {
        position[offset] = index % grid.gridWidth * gridStep;
        position[offset + 1] = grid.elevation[index];
        position[offset + 2] = -Math.floor(index / grid.gridWidth) * gridStep;
        terrainColors[offset] = color[material].r * shade;
        terrainColors[offset + 1] = color[material].g * shade;
        terrainColors[offset + 2] = color[material].b * shade;
        offset += 3;
      }
    }
  }
}
const mesh = new BufferGeometry();
mesh.setAttribute('position', new BufferAttribute(position, 3));
mesh.setAttribute('color', new BufferAttribute(terrainColors, 3));
mesh.computeVertexNormals();
scene.add(new Mesh(mesh, new MeshLambertMaterial({ vertexColors: true })));

const stone = new MeshLambertMaterial({ color: '#647382' });
const timber = new MeshLambertMaterial({ color: '#865f46' });
const water = new MeshBasicMaterial({ color: '#315975' });
function box(x: number, y: number, n: number, w: number, h: number, d: number, mat: MeshLambertMaterial) {
  const item = new Mesh(new BoxGeometry(w, h, d), mat);
  item.position.set(x, y, -n);
  scene.add(item);
  return item;
}

function waterStrip(points: { n: number; left: number; right: number }[]) {
  const vertices: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    vertices.push(a.left, waterHeight, -a.n, a.right, waterHeight, -a.n, b.left, waterHeight, -b.n,
      a.right, waterHeight, -a.n, b.right, waterHeight, -b.n, b.left, waterHeight, -b.n);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3));
  scene.add(new Mesh(geometry, water));
}
waterStrip(Array.from({ length: layout.depth + 1 }, (_, n) => ({ n, left: riverX(n) - 8.05, right: riverX(n) + 8.05 })));
const [[inletX, inletNorth], [lakeX, lakeNorth]] = layout.lake.inlet;
const inlet = new Mesh(new BoxGeometry(Math.hypot(lakeX - inletX, lakeNorth - inletNorth), .08, 7.9), water);
inlet.position.set((inletX + lakeX) / 2, waterHeight, -(inletNorth + lakeNorth) / 2);
inlet.rotation.y = Math.atan2(lakeNorth - inletNorth, lakeX - inletX);
scene.add(inlet);
for (const bridge of layout.bridges) {
  const center = (bridge.west + bridge.east) / 2;
  const length = bridge.east - bridge.west;
  box(center, bridge.height - .39, bridge.north, length, .64, 8, stone);
  for (let x = bridge.west + .25; x < bridge.east; x += .5) {
    box(x, bridge.height - .07, bridge.north, .48, .14, 7.7, timber);
  }
  for (const n of [bridge.north - 3.8, bridge.north + 3.8]) {
    box(center, bridge.height + 1.06, n, length, .18, .23, timber);
    for (let x = bridge.west; x <= bridge.east; x += 2) box(x, bridge.height + .55, n, .25, 1.1, .25, stone);
  }
  for (const x of [center - 5, center + 5]) box(x, (bridge.height + 3.5) / 2, bridge.north, 1.5, bridge.height - 3.5, 6.75, stone);
}

type Builder = (plot: TownPlot) => Group;
const builders: Record<string, Builder> = {
  clocktower: buildTowerLandmark, tavern: buildTavernLandmark, 'post-office': buildPostLandmark,
  memorial: buildMuseumLandmark, 'long-hall': buildCultureLandmark, cabins: buildVillageLandmark,
  'lantern-workshop': buildMarketLandmark, 'market-stalls': buildMarketLandmark,
  carousel: buildLakesideLandmark, glasshouse: buildLakesideLandmark,
  lighthouse: buildLakesideLandmark, stage: buildVillageLandmark,
};
type Model = { id: string; file: string; colliders: Box[]; floors?: Box[]; ramps?: Ramp[] };
const architecture = new Map<string, Group>();
const status = element('load-status');
const festivalText = element('festival-status');
const rehearse = element<HTMLButtonElement>('rehearse');
const festival = createFestival(scene, message => { festivalText.textContent = message; });
const actionButton = element<HTMLButtonElement>('world-action');
const assetBase = new URL('./town-blockout/buildings/', document.baseURI);
function validBox({ min, max }: Box) {
  return [min, max].every(v => v.length === 3 && v.every(Number.isFinite)) && min.every((v, i) => v <= max[i]);
}
function place(plot: TownPlot, group: Group) {
  const [x, n, y] = plot.origin;
  group.position.set(x, y, -n);
  group.name = plot.id;
  architecture.get(plot.id)?.removeFromParent();
  architecture.set(plot.id, group);
  scene.add(group);
}
for (const plot of layout.plots) place(plot, builders[plot.id](plot));
const museumPlot = layout.plots.find(plot => plot.id === 'memorial')!;
const [museumEast, museumNorth, museumHeight] = museumPlot.origin;
function museumToWorld(localX: number, localY: number, localZ: number) {
  return [museumEast + localX * museumHorizontalScale, museumHeight + localY, -museumNorth + localZ * museumHorizontalScale] as const;
}
const museumLights = Array.from({ length: 3 }, () => new PointLight('#ffba76', 0, 16, 2));
scene.add(...museumLights);
let museumLightClock = 0;
function updateMuseumLights(dt: number, eyePosition: Vector3) {
  museumLightClock -= dt;
  if (museumLightClock > 0) return;
  museumLightClock = .15;
  const lights = architecture.get('memorial')?.userData.lights as MuseumLight[] | undefined;
  const nearby = (lights ?? []).map(light => ({ light, distance: Math.hypot(
    museumEast + light.position[0] - eyePosition.x,
    2.25 * (museumHeight + light.position[1] - eyePosition.y),
    -museumNorth + light.position[2] - eyePosition.z,
  ) })).filter(entry => entry.distance < 37).sort((a, b) => a.distance - b.distance);
  museumLights.forEach((light, index) => {
    const next = nearby[index]?.light;
    light.intensity = next?.power ?? 0;
    if (!next) return;
    light.position.set(museumEast + next.position[0], museumHeight + next.position[1], -museumNorth + next.position[2]);
    light.color.set(next.color);
    light.distance = next.distance;
  });
}
const slide = buildIcePlayProps();
scene.add(slide);

function geometry() {
  return [...architecture.values(), slide].map(readWalkGeometry);
}
let walkGeometry = geometry();
status.textContent = `${architecture.size + districts.count} 处建筑与设施 · ${forest.count} 株树`;
async function loadBuildings() {
  const response = await fetch(new URL('index.json', assetBase));
  if (!response.ok || !response.headers.get('content-type')?.includes('json')) return;
  const models: Model[] = await response.json();
  const loader = new GLTFLoader();
  const results = await Promise.allSettled(models.map(async model => {
    const plot = layout.plots.find(item => item.id === model.id);
    if (!plot || !/^[a-z0-9-]+\.glb$/.test(model.file)) throw new Error('无效地块或文件名');
    if (![...model.colliders, ...(model.floors ?? []), ...(model.ramps ?? [])].every(validBox)) throw new Error('无效碰撞范围');
    const { scene: modelScene } = await loader.loadAsync(new URL(model.file, assetBase).href);
    const group = new Group();
    group.add(modelScene);
    group.userData = model;
    place(plot, group);
  }));
  walkGeometry = geometry();
  const failed = results.filter(result => result.status === 'rejected').length;
  if (failed) status.textContent = `${failed} 栋替换模型加载失败`;
}
if (location.protocol !== 'file:') loadBuildings().catch(() => { status.textContent = '建筑清单读取失败'; });

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * .48;
controls.target.set(220, 8, -195);
const overview = element<HTMLButtonElement>('overview');
const walk = element<HTMLButtonElement>('walk');
const selector = element<HTMLSelectElement>('jump');
const points = new Map<string, number[]>([
  ['广场南侧', layout.plaza.spawn],
  ['西北木屋', layout.roads[0].points.at(-1)!],
  ['东北纪念馆', layout.roads[1].points.at(-1)!],
  ['西南年集', layout.roads[2].points.at(-1)!],
  ['东南游乐区', layout.roads[3].points.at(-1)!],
  ['西南河畔街巷', [161.5, 165.5]],
  ['东北坡地街巷', [319, 221]],
  ['冰湖雪球场', [350, 92.5]],
]);
const plotLabels = ['钟楼', '酒馆', '邮局', '纪念馆入口', '长殿', '木屋入口', '灯坊', '集市摊位', '旋转木马', '暖房', '灯塔', '舞台'];
layout.plots.forEach((plot, i) => points.set(plotLabels[i], plot.id === 'tavern' ? [159, 219.5] : plot.connect));
for (const key of points.keys()) selector.add(new Option(key, key));

const eye = 1.65;
const keys = new Set<string>();
const touchWalk = createTouchWalk(element('touch-walk'));
const museumMapButton = element<HTMLButtonElement>('museum-map-button');
let looking: { id: number; x: number; y: number } | undefined;
function resetMovement() {
  keys.clear();
  touchWalk.reset();
  const previous = looking;
  looking = undefined;
  if (previous && renderer.domElement.hasPointerCapture(previous.id)) renderer.domElement.releasePointerCapture(previous.id);
}
let walking = false;
let x = 0;
let n = 0;
let yaw = 0;
let pitch = 0;
let ground = 0;
let boardingGround: { x: number; n: number; ground: number; yaw: number } | undefined;
let seated: (TownSeat & { pitch: number }) | undefined;
let rideSpeed = 0;
const lookAhead = new Vector3();
const placeCard = element<HTMLDialogElement>('place-card');
const activityPanel = element('town-activity-content');
const activityStatus = element('town-activity-status');
let activityMessageTimer: number | undefined;
const letterForm = element<HTMLFormElement>('letter-form');
const letterBody = element<HTMLTextAreaElement>('letter-body');
const letterReceipt = element('letter-receipt');
const letterKey = 'unwritten:snow-town-letter';
let captureTerrace = false;
const museumInspection = createMuseumInspection(renderer, camera.aspect);
const museumLaunch = createMuseumLaunch(renderer, camera.aspect);
const museumGuide = createMuseumGuide(scene, museumToWorld);
const museumOverlay = () => museumInspection.active || museumLaunch.active;
function inspectExhibit(month: number) {
  resetMovement();
  touchWalk.setAllowed(false);
  museumInspection.open(month);
  renderer.domElement.focus({ preventScroll: true });
}
function pauseForPanel() {
  resetMovement();
  touchWalk.setAllowed(false);
}
const museumVisit = createMuseumVisit(pauseForPanel, () => {
  const [viewX, viewY, viewZ] = museumToWorld(terraceStop.x, 5.65, terraceStop.z);
  x = viewX;
  n = -viewZ;
  ground = viewY;
  yaw = Math.atan2(226 - x, 223 - n);
  pitch = .22;
  captureTerrace = true;
}, inspectExhibit, museumGuide.setActive, complete => {
  pauseForPanel();
  museumLaunch.open(complete);
});
museumVisit.dialog.addEventListener('close', () => {
  if (!museumLaunch.active) renderer.domElement.focus();
});
function museumPosition() {
  return { x: (x - museumEast) / museumHorizontalScale, y: ground - museumHeight, z: (museumNorth - n) / museumHorizontalScale };
}
museumMapButton.onclick = () => museumVisit.openMap(museumPosition());

function openPlace(title: string, description: string, writing = false) {
  pauseForPanel();
  element('place-title').textContent = title;
  element('place-text').textContent = description;
  letterForm.hidden = !writing;
  activityPanel.hidden = writing;
  activityPanel.replaceChildren();
  if (writing) {
    letterReceipt.textContent = '';
    try { letterBody.value = localStorage.getItem(letterKey) ?? ''; }
    catch { letterBody.value = ''; }
  }
  if (!placeCard.open) placeCard.showModal();
  return activityPanel;
}
letterForm.onsubmit = event => {
  event.preventDefault();
  const value = letterBody.value.trim();
  if (!value) return;
  try {
    localStorage.setItem(letterKey, value);
    letterReceipt.textContent = '已寄存在这台设备上';
  } catch {
    letterReceipt.textContent = '浏览器未允许本地保存';
  }
};
placeCard.addEventListener('close', () => renderer.domElement.focus());

function leaveRide() {
  if (!boardingGround) return;
  ({ x, n, ground, yaw } = boardingGround);
  boardingGround = undefined;
  pitch = 0;
}
function leaveSeat() {
  if (!seated) return;
  seated = undefined;
  resetMovement();
}
const activityContext: Omit<TownActivityContext, 'announce'> = {
  scene,
  open: openPlace,
  sit(seat) {
    resetMovement();
    seated = { ...seat, pitch: 0 };
  },
  face(east, north, height) {
    resetMovement();
    yaw = Math.atan2(east - x, north - n);
    const distance = Math.hypot(east - x, north - n);
    pitch = height === undefined ? 0 : Math.max(-1.42, Math.min(1.42, Math.atan2(height - ground - eye, distance)));
  },
};
const activities = [createTavernActivity, createPostActivity, createStageActivity, createMarketActivity, createIceActivity, createWishActivity]
  .map(create => {
    const activity = create({
      ...activityContext,
      announce(message) {
        if (!walking || !activity.spots.some(spot =>
          Math.abs(ground - spot.ground) < 1 && Math.hypot(x - spot.x, n - spot.n) < spot.range + 5)) return;
        activityStatus.textContent = message;
        window.clearTimeout(activityMessageTimer);
        activityMessageTimer = window.setTimeout(() => { activityStatus.textContent = ''; }, 4200);
      },
    });
    return activity;
  });
const activitySpots = activities.flatMap(activity => activity.spots);
const tour = [
  { x: 341, n: 106.3, radius: 4.25, maxHeight: 14, label: '坐上旋转木马', run() {
    if (architecture.get('carousel')?.userData.rideSeat) boardingGround = { x, n, ground, yaw };
  } },
  { x: 262.1, n: 205.6, radius: 2.9, maxHeight: 15.6, label: '给 2027 写封信', run() {
    openPlace('写给 2027', '给未来的自己留一封信。寄存后可以在同一浏览器里回来读。', true);
  } },
];
function currentAction() {
  if (!walking || placeCard.open || museumVisit.dialog.open) return undefined;
  if (boardingGround) return { label: '离开旋转木马', run: leaveRide };
  if (seated) return { label: '起身', run: leaveSeat };
  if (museumInspection.active) return { label: '返回展柜', run: museumInspection.close };
  if (museumLaunch.active) return { label: '返回展柜', run: museumLaunch.close };
  const local = museumPosition();
  const museumStop = museumVisit.near(local.x, local.y, local.z);
  if (museumStop) return museumStop;
  return nearestTownActivity(activitySpots, x, n, ground)
    ?? tour.find(spot => ground <= spot.maxHeight && Math.hypot(x - spot.x, n - spot.n) < spot.radius);
}
function interact() {
  currentAction()?.run();
  if (!placeCard.open && !museumVisit.dialog.open) renderer.domElement.focus();
}
actionButton.onclick = interact;
function jump() {
  [x, n] = points.get(selector.value)!;
  const target = layout.plots[plotLabels.indexOf(selector.value)];
  const destinations: Record<string, readonly [number, number]> = { '西南河畔街巷': [131, 141], '冰湖雪球场': [350, 79] };
  const [east, north] = target?.door ?? destinations[selector.value] ?? [226, 223];
  yaw = Math.atan2(east - x, north - n);
  ground = grid.heightAt(x, n);
  pitch = 0;
}
function mode(next: boolean) {
  leaveRide();
  leaveSeat();
  activityStatus.textContent = '';
  walking = next;
  museumInspection.close();
  museumLaunch.close();
  museumGuide.setActive(false);
  controls.enabled = !next;
  overview.setAttribute('aria-pressed', String(!next));
  walk.setAttribute('aria-pressed', String(next));
  element('help').textContent = next
    ? (touchWalk.active() ? '左下摇杆移动，拖动画面转向。' : 'WASD / 方向键移动，拖动转向。靠近互动点后按 E。')
    : (touchWalk.active() ? '拖动旋转，双指缩放。' : '拖动旋转，滚轮缩放。可前往街区或建筑入口。');
  if (next) jump();
  else {
    camera.position.set(465, 305, 122);
    controls.target.set(220, 8, -195);
    controls.update();
  }
}
overview.onclick = () => mode(false);
element('view-valley').onclick = () => {
  mode(false);
  camera.position.set(386, 177, 15);
  controls.target.set(215, 24, -198);
  controls.update();
};
element('view-museum').onclick = () => {
  mode(false);
  camera.position.set(museumEast - 41, museumHeight + 29, -museumNorth + 62);
  controls.target.set(museumEast, museumHeight + 7.0, -museumNorth + 1);
  controls.update();
};
rehearse.onclick = () => {
  if (!festival.start()) return;
  mode(false);
  setNight(true);
  camera.position.set(283, 33, -108);
  controls.target.set(225, 54, -207);
  controls.update();
};
walk.onclick = () => mode(true);
selector.onchange = () => mode(true);
const moveKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
addEventListener('keydown', e => {
  if (placeCard.open || museumVisit.dialog.open || e.altKey || e.ctrlKey || e.metaKey || e.target instanceof HTMLSelectElement) return;
  if (museumOverlay()) {
    if (e.code === 'Escape' || (e.code === 'KeyE' && !e.repeat)) {
      e.preventDefault();
      interact();
    } else {
      museumInspection.handleKey(e);
    }
    return;
  }
  if (seated && e.code === 'Escape') {
    e.preventDefault();
    interact();
    return;
  }
  if (walking && e.code === 'KeyE' && !e.repeat && currentAction()) {
    e.preventDefault();
    interact();
  }
  if (walking && !boardingGround && !seated && moveKeys.has(e.code)) {
    keys.add(e.code);
    e.preventDefault();
  }
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', resetMovement);
renderer.domElement.addEventListener('pointerdown', e => {
  if (!walking || looking || museumOverlay() || placeCard.open || museumVisit.dialog.open || e.button !== 0) return;
  looking = { id: e.pointerId, x: e.clientX, y: e.clientY };
  renderer.domElement.focus({ preventScroll: true });
  renderer.domElement.setPointerCapture(e.pointerId);
});
renderer.domElement.addEventListener('pointermove', e => {
  if (!walking || looking?.id !== e.pointerId) return;
  const scale = e.pointerType === 'touch' ? .007 : .004;
  const turn = (e.clientX - looking.x) * scale;
  const tilt = (e.clientY - looking.y) * scale;
  if (seated) {
    seated.yaw += turn;
    seated.pitch = Math.max(-1.42, Math.min(1.42, seated.pitch - tilt));
  } else {
    yaw += turn;
    pitch = Math.max(-1.42, Math.min(1.42, pitch - tilt));
  }
  looking.x = e.clientX;
  looking.y = e.clientY;
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  renderer.domElement.addEventListener(type, event => {
    if ((event as PointerEvent).pointerId === looking?.id) looking = undefined;
  });
}
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  museumInspection.resize(camera.aspect);
  museumLaunch.resize(camera.aspect);
  renderer.setSize(innerWidth, innerHeight);
});
const startInMuseum = document.body.dataset.start === 'museum' || new URLSearchParams(location.search).get('visit') === 'museum';
if (startInMuseum) selector.value = '纪念馆入口';
mode(startInMuseum);
let previous = performance.now();
function nextGround(nextX: number, nextN: number) {
  if (!canEnter(nextX, nextN) || scenery.blocked(nextX, nextN) || districts.blocked(nextX, nextN)
    || forest.blocked(nextX, nextN) || streetscape.blocked(nextX, nextN)) return null;
  const z = -nextN;
  const contains = ({ min, max }: Box) => nextX >= min[0] && nextX <= max[0] && z >= min[2] && z <= max[2];
  const terrain = grid.heightAt(nextX, nextN);
  let height = terrain;
  for (const { floors, ramps } of walkGeometry) {
    for (const floor of floors) {
      if (contains(floor) && floor.max[1] <= ground + .43) height = Math.max(height, floor.max[1]);
    }
    for (const ramp of ramps) {
      if (!contains(ramp)) continue;
      const axis = ramp.axis === 'x' ? 0 : 2;
      const fraction = ((axis === 0 ? nextX : z) - ramp.min[axis]) / (ramp.max[axis] - ramp.min[axis]);
      const top = ramp.min[1] + (ramp.max[1] - ramp.min[1]) * (ramp.ascending > 0 ? fraction : 1 - fraction);
      if (top <= ground + .43) height = Math.max(height, top);
    }
  }
  if (Math.abs(height - ground) > .43 || activities.some(activity => activity.blocked?.(nextX, nextN, height))) return null;
  for (const { colliders } of walkGeometry) {
    if (colliders.some(({ min, max }) => nextX + .27 >= min[0] && nextX - .27 <= max[0]
      && z + .27 >= min[2] && z - .27 <= max[2] && height + .14 < max[1] && height + 1.8 > min[1])) return null;
  }
  return height;
}
function tryMove(nextX: number, nextN: number) {
  const height = nextGround(nextX, nextN);
  if (height === null) return false;
  [x, n, ground] = [nextX, nextN, height];
  return true;
}
function faceFrom(east: number, north: number, height: number, heading: number, tilt: number) {
  camera.position.set(east, height, -north);
  camera.lookAt(east + Math.sin(heading) * Math.cos(tilt), height + Math.sin(tilt), -north - Math.cos(heading) * Math.cos(tilt));
}
renderer.setAnimationLoop(now => {
  const frameSeconds = Math.max(0, now - previous) / 1000;
  const dt = Math.min(.25, frameSeconds);
  previous = now;
  const carousel = architecture.get('carousel');
  const pivot = carousel?.userData.ridePivot as Object3D | undefined;
  const seat = carousel?.userData.rideSeat as Object3D | undefined;
  const beacon = architecture.get('lighthouse')?.userData.beaconPivot as Object3D | undefined;
  if (boardingGround && !seat) leaveRide();
  rideSpeed += Math.min(1, dt * 1.8) * ((boardingGround ? .51 : 0) - rideSpeed);
  if (pivot) pivot.rotation.y = (pivot.rotation.y + rideSpeed * dt) % (Math.PI * 2);
  if (beacon) {
    beacon.visible = nightMode;
    if (nightMode) beacon.rotation.y = (beacon.rotation.y + .28 * dt) % (Math.PI * 2);
  }
  if (museumOverlay()) {
    element('position').textContent = '';
  } else if (walking && boardingGround && seat) {
    seat.getWorldPosition(camera.position);
    seat.getWorldDirection(lookAhead);
    camera.lookAt(lookAhead.negate().add(camera.position));
    element('position').textContent = '旋转木马 · 乘坐中';
  } else if (walking && seated) {
    faceFrom(seated.x, seated.n, seated.eyeY, seated.yaw, seated.pitch);
    element('position').textContent = '酒馆 · 已就座';
  } else if (walking) {
    const forward = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown')) + touchWalk.axes.forward;
    const right = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft')) + touchWalk.axes.right;
    if (!placeCard.open && !museumVisit.dialog.open && (forward || right)) {
      const steps = Math.max(1, Math.ceil(dt / .025));
      const stride = 7.5 * dt / (steps * Math.max(1, Math.hypot(forward, right)));
      const east = (Math.sin(yaw) * forward + Math.cos(yaw) * right) * stride;
      const north = (Math.cos(yaw) * forward - Math.sin(yaw) * right) * stride;
      for (let i = 0; i < steps; i++) {
        const nx = x + east;
        const nn = n + north;
        if (!tryMove(nx, nn) && !tryMove(nx, n)) tryMove(x, nn);
      }
    }
    faceFrom(x, n, ground + eye, yaw, pitch);
    element('position').textContent = `东 ${x.toFixed(1)} m · 北 ${n.toFixed(1)} m · 地面 ${ground.toFixed(1)} m`;
  } else {
    controls.update();
    element('position').textContent = '';
  }
  scenery.update(dt, walking, camera.position.x, camera.position.y, camera.position.z);
  updateMuseumLights(dt, camera.position);
  const local = museumPosition();
  const sheltered = walking && Math.abs(local.x) < 19.55 && local.z > -13.7 && local.z < 12.85;
  snowfall.update(camera, dt, walking, sheltered);
  festival.update(dt);
  for (const activity of activities) activity.update?.(frameSeconds);
  rehearse.disabled = festival.active();
  const canControl = walking && !placeCard.open && !museumVisit.dialog.open;
  touchWalk.setAllowed(canControl && !boardingGround && !seated && !museumOverlay());
  museumMapButton.hidden = !canControl || museumOverlay() || Math.abs(local.x) > 29 || Math.abs(local.z) > 19;
  const action = currentAction();
  actionButton.hidden = !action;
  const label = action ? (touchWalk.active() ? action.label : `E · ${action.label}`) : '';
  if (label !== actionButton.textContent) actionButton.textContent = label;
  if (museumLaunch.active) { museumLaunch.update(frameSeconds); museumLaunch.render(); }
  else if (museumInspection.active) museumInspection.render();
  else renderer.render(scene, camera);
  if (captureTerrace) {
    captureTerrace = false;
    renderer.domElement.toBlob(blob => {
      if (!blob) return;
      const photo = document.createElement('a');
      const url = URL.createObjectURL(blob);
      photo.href = url;
      photo.download = 'UNWRITTEN-2027-museum-terrace.png';
      document.body.append(photo);
      photo.click();
      photo.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  }
});
