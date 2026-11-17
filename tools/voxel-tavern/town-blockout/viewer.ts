import {
  AmbientLight, BoxGeometry, BufferAttribute, BufferGeometry, Color, DirectionalLight, Fog, Group,
  InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial, Object3D, PerspectiveCamera, PointLight, Scene, Vector3, WebGLRenderer,
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
import { canEnter, createTerrainGrid, layout, riverX, waterHeight, worldBounds } from './terrain';
import { addTerrainMeshes } from './terrain-mesh';
import { addDistrictHousing } from './district-layout';
import { addForestDensity } from './forest-density';
import { addStreetscape } from './streetscape';
import { createSnowfall } from './snowfall';
import { createFestival } from './festival';
import { buildMuseumLandmark } from './landmark-museum';
import type { MuseumLight } from './museum-kit';
import { createMuseumVisit } from './museum-visit';
import { createTouchWalk } from './touch-walk';
import { createTouchLook } from './touch-look';
import { createDesktopLook } from './desktop-look';
import { terraceStop } from './museum-terrace';
import { createMuseumInspection } from './museum-inspection';
import { createMuseumLaunch } from './museum-launch';
import { createMuseumGuide } from './museum-guide';
import { museumHorizontalScale } from './museum-scale';
import { nearestTownActivity, type TownActivity, type TownActivityContext, type TownActivitySpot, type TownSeat } from './town-activity';
import { createTavernActivity } from './tavern-activity';
import { createPostActivity } from './post-activity';
import { createStageActivity } from './stage-activity';
import { createMarketActivity } from './market-activity';
import { createIceActivity } from './ice-activity';
import { createWishActivity } from './wish-activity';
import { createRestActivity } from './town-rest-activity';
import { createWindowActivity } from './town-window';
import { extensionPlots, extensionRoadClearance } from './town-extension';
import { createTownRailway } from './town-railway';
import { createTownNpcActivity } from './town-npc';
import { createTownPassport } from './town-passport';
import { createTownLights } from './town-lights';

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
const railway = createTownRailway(grid);
scene.add(railway.group);
const scenery = addScenery(landscape, grid);
const districts = addDistrictHousing(landscape, grid, scenery.blocked);
const streetscape = addStreetscape(landscape, grid, (east, north, radius) =>
  districts.keepClear(east, north, radius) || extensionRoadClearance(east, north, radius));
const forest = addForestDensity(landscape, grid,
  (east, north, radius) => districts.keepClear(east, north, radius) || streetscape.occupied(east, north, radius),
  (east, north, radius) => extensionRoadClearance(east, north, radius) || railway.keepClear(east, north, radius));
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

const prepareTerrain = addTerrainMeshes(scene, grid);

const stone = new MeshLambertMaterial({ color: '#647382' });
const timber = new MeshLambertMaterial({ color: '#865f46' });
const water = new MeshBasicMaterial({ color: '#315975' });

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
waterStrip(Array.from({ length: worldBounds.depth + 1 }, (_, n) => ({ n, left: riverX(n) - 8.05, right: riverX(n) + 8.05 })));
const [[inletX, inletNorth], [lakeX, lakeNorth]] = layout.lake.inlet;
const inlet = new Mesh(new BoxGeometry(Math.hypot(lakeX - inletX, lakeNorth - inletNorth), .08, 7.9), water);
inlet.position.set((inletX + lakeX) / 2, waterHeight, -(inletNorth + lakeNorth) / 2);
inlet.rotation.y = Math.atan2(lakeNorth - inletNorth, lakeX - inletX);
scene.add(inlet);
const bridgeGeometry = new BoxGeometry();
const detailedBridges = new Group();
scene.add(detailedBridges);
let bridgePanorama: Group | undefined;
const bridgeMatrices = new Map([[stone, [] as Matrix4[]], [timber, [] as Matrix4[]]]);
function bridgeBatch(material: MeshLambertMaterial, transforms: Matrix4[], name: string) {
  const batch = new InstancedMesh(bridgeGeometry, material, transforms.length);
  batch.name = name;
  transforms.forEach((matrix, index) => batch.setMatrixAt(index, matrix));
  batch.computeBoundingSphere();
  return batch;
}
function showWideBridges(wide: boolean) {
  detailedBridges.visible = !wide;
  if (!bridgePanorama && wide) {
    bridgePanorama = new Group();
    for (const [material, matrices] of bridgeMatrices) {
      bridgePanorama.add(bridgeBatch(material, matrices, 'Bridge panorama'));
    }
    scene.add(bridgePanorama);
  }
  if (bridgePanorama) bridgePanorama.visible = wide;
}
for (const bridge of layout.bridges) {
  const parts = new Map([[stone, [] as Matrix4[]], [timber, [] as Matrix4[]]]);
  function box(x: number, y: number, n: number, w: number, h: number, d: number, material: MeshLambertMaterial) {
    parts.get(material)!.push(new Matrix4().makeScale(w, h, d).setPosition(x, y, -n));
  }
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
  for (const [material, transforms] of parts) {
    detailedBridges.add(bridgeBatch(material, transforms, `bridge-${bridge.id}-${material === stone ? 'stone' : 'timber'}`));
    bridgeMatrices.get(material)!.push(...transforms);
  }
}

type Builder = (plot: TownPlot) => Group;
const builders: Record<string, Builder> = {
  clocktower: buildTowerLandmark, tavern: buildTavernLandmark, 'post-office': buildPostLandmark,
  memorial: buildMuseumLandmark, 'long-hall': buildCultureLandmark, cabins: buildVillageLandmark,
  'lantern-workshop': buildMarketLandmark, 'market-stalls': buildMarketLandmark,
  glasshouse: buildLakesideLandmark,
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
function place(plot: Pick<TownPlot, 'id' | 'origin'>, group: Group) {
  const [x, n, y] = plot.origin;
  group.position.set(x, y, -n);
  group.name = plot.id;
  architecture.get(plot.id)?.removeFromParent();
  architecture.set(plot.id, group);
  scene.add(group);
}
for (const plot of layout.plots) {
  if (plot.id !== 'carousel') place(plot, builders[plot.id](plot));
}
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

const bodyRadius = .27;
const collisionCellSize = 16;
const collisionStride = 1 + Math.ceil(worldBounds.width / collisionCellSize);
const cellAt = (east: number, north: number) => Math.floor(east / collisionCellSize) +
  collisionStride * Math.floor(north / collisionCellSize);
type WalkGeometry = ReturnType<typeof readWalkGeometry>;
const emptyGeometry: WalkGeometry = { colliders: [], floors: [], ramps: [] };
let extensionStreets: ReturnType<typeof import('./extension-streets').buildExtensionStreets> | undefined;
let streetsRequested = false;

function geometry() {
  const cells = new Map<number, WalkGeometry>();
  function index<T extends Box>(boxes: T[], append: (cell: WalkGeometry, box: T) => void) {
    for (const box of boxes) {
      const x0 = Math.floor((box.min[0] - bodyRadius) / collisionCellSize);
      const x1 = Math.floor((box.max[0] + bodyRadius) / collisionCellSize);
      const n0 = Math.floor((-box.max[2] - bodyRadius) / collisionCellSize);
      const n1 = Math.floor((-box.min[2] + bodyRadius) / collisionCellSize);
      for (let n = n0; n <= n1; n++) {
        for (let x = x0; x <= x1; x++) {
          const id = n * collisionStride + x;
          let cell = cells.get(id);
          if (!cell) {
            cell = { colliders: [], floors: [], ramps: [] };
            cells.set(id, cell);
          }
          append(cell, box);
        }
      }
    }
  }
  const groups = [...architecture.values(), slide, railway.group];
  if (extensionStreets) groups.push(extensionStreets.group);
  for (const group of groups) {
    const { colliders, floors, ramps } = readWalkGeometry(group);
    index(colliders, (cell, box) => cell.colliders.push(box));
    index(floors, (cell, box) => cell.floors.push(box));
    index(ramps, (cell, ramp) => cell.ramps.push(ramp));
  }
  return cells;
}
let walkGeometry = geometry();
function geometryAt(east: number, north: number) {
  return walkGeometry.get(cellAt(east, north)) ?? emptyGeometry;
}
function describeTown() {
  const newBuildings = extensionStreets?.counts.buildings ?? 0;
  const newTrees = extensionStreets?.counts.trees ?? 0;
  status.textContent = `${architecture.size + districts.count + newBuildings} 处建筑与设施 · ${forest.count + newTrees} 株树`;
}
describeTown();

const extensionBuilders: Record<string, () => Promise<Group>> = {
  'railway-station': () => import('./landmark-station').then(module => module.buildRailwayStation()),
  'coaster-station': () => import('./landmark-station').then(module => module.buildCoasterStation()),
  'hot-spring': () => import('./landmark-hot-spring').then(module => module.buildHotSpring()),
  'ice-castle': () => import('./landmark-ice-castle').then(module => module.buildIceCastle()),
};
const requestedPlots = new Set<string>();
function prepareLandmarks(east: number, north: number, overview: boolean) {
  const plot = extensionPlots.find(({ id, origin }) => !requestedPlots.has(id) &&
    (overview || Math.hypot(east - origin[0], north - origin[1]) < 148));
  if (!plot) return;
  requestedPlots.add(plot.id);
  extensionBuilders[plot.id]().then(group => {
    place(plot, group);
    registerLandmarkActivities(plot.id, group);
    walkGeometry = geometry();
    describeTown();
  }).catch(error => {
    status.textContent = '新区建筑读取失败';
    console.error(`Loading ${plot.id}`, error);
  });
}
async function loadBuildings() {
  const response = await fetch(new URL('index.json', assetBase));
  if (!response.ok || !response.headers.get('content-type')?.includes('json')) return;
  const models: Model[] = await response.json();
  const loader = new GLTFLoader();
  const results = await Promise.allSettled(models.map(async model => {
    const plot = layout.plots.find(item => item.id === model.id);
    if (plot?.id === 'carousel') return;
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
  ['东侧扩建步道', [443, 221]],
  ['北侧森林街区', [93, 378]],
  ['火车站', [526, 305]],
  ['环镇列车站', [469, 224]],
  ['温泉浴场', [520, 156]],
  ['冰雪城堡', [454, 75]],
]);
const plotLabels = ['钟楼', '酒馆', '邮局', '纪念馆入口', '长殿', '木屋入口', '灯坊', '集市摊位', '旋转木马', '暖房', '灯塔', '舞台'];
layout.plots.forEach((plot, i) => {
  if (plot.id !== 'carousel') points.set(plotLabels[i], plot.id === 'tavern' ? [159, 219.5] : plot.connect);
});
for (const key of points.keys()) selector.add(new Option(key, key));

const eye = 1.65;
const keys = new Set<string>();
const touchWalk = createTouchWalk(element('touch-walk'));
const museumMapButton = element<HTMLButtonElement>('museum-map-button');
const crosshair = element('walk-crosshair');
const touchJump = element<HTMLButtonElement>('touch-jump');
let forwardPressedAt = -Infinity;
let doubleForward = false;
function stopTravel() {
  keys.clear();
  forwardPressedAt = -Infinity;
  doubleForward = false;
  touchWalk.reset();
}
function resetMovement() {
  stopTravel();
  touchLook.reset();
  desktopLook.release();
}
let walking = false;
let x = 0;
let n = 0;
let yaw = 0;
let pitch = 0;
let ground = 0;
let airHeight: number | undefined;
let riseSpeed = 0;
let boardingGround: { x: number; n: number; ground: number; yaw: number } | undefined;
let seated: (TownSeat & { pitch: number }) | undefined;
let rideYawOffset = 0;
let ridePitch = 0;
const lookAhead = new Vector3();
const placeCard = element<HTMLDialogElement>('place-card');
const activityPanel = element('town-activity-content');
const activityStatus = element('town-activity-status');
let activityMessageTimer: number | undefined;
const letterForm = element<HTMLFormElement>('letter-form');
const letterBody = element<HTMLTextAreaElement>('letter-body');
const letterReceipt = element('letter-receipt');
const letterKey = 'unwritten:snow-town-letter';
let photoFilename: string | undefined;
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
  airHeight = undefined;
  riseSpeed = 0;
  yaw = Math.atan2(226 - x, 223 - n);
  pitch = .22;
  photoFilename = 'UNWRITTEN-2027-museum-terrace.png';
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
  railway.disembark();
  ({ x, n, ground, yaw } = boardingGround);
  boardingGround = undefined;
  pitch = 0;
}
function leaveSeat() {
  if (!seated) return;
  seated = undefined;
  stopTravel();
}
const activityContext: Omit<TownActivityContext, 'announce'> = {
  scene,
  open: openPlace,
  sit(seat) {
    stopTravel();
    seated = { ...seat, pitch: 0 };
  },
  face(east, north, height) {
    stopTravel();
    yaw = Math.atan2(east - x, north - n);
    const distance = Math.hypot(east - x, north - n);
    pitch = height === undefined ? 0 : Math.max(-1.42, Math.min(1.42, Math.atan2(height - ground - eye, distance)));
  },
};
const lightsButton = element<HTMLButtonElement>('town-lights-button');
function showLightCount({ lit, total }: { lit: number; total: number }) {
  lightsButton.textContent = `点亮小镇 ${lit}/${total}`;
}
const townLights = createTownLights({ ...activityContext, announce: announceActivity }, grid, showLightCount);
showLightCount(townLights.getProgress());
lightsButton.onclick = townLights.openBook;
const activities: TownActivity[] = [
  createTavernActivity, createPostActivity, createStageActivity, createMarketActivity,
  createIceActivity, createWishActivity, createRestActivity,
  (context: TownActivityContext) => createTownNpcActivity(context, grid.heightAt, feature => {
    if (feature === 'spring') return architecture.has('hot-spring');
    if (feature === 'castle') return architecture.has('ice-castle');
    if (feature === 'rail' || feature === 'bell') return true;
    return feature !== 'mixing';
  }),
  (context: TownActivityContext) => createWindowActivity(context, architecture),
]
  .map(create => {
    const activity = create({
      ...activityContext,
      announce(message) {
        if (!walking || !activity.spots.some(spot =>
          Math.abs(ground - spot.ground) < 1 && Math.hypot(x - spot.x, n - spot.n) < spot.range + 5)) return;
        announceActivity(message);
      },
    });
    return activity;
  });
function announceActivity(message: string) {
  activityStatus.textContent = message;
  window.clearTimeout(activityMessageTimer);
  activityMessageTimer = window.setTimeout(() => { activityStatus.textContent = ''; }, 4200);
}
activities.push(townLights);
const activitySpots = activities.flatMap(activity => activity.spots);
const stampSites = [
  { id: 'plaza', label: '钟楼广场', hint: '从「广场南侧」沿广场向北几步。', x: 223, n: 184 },
  { id: 'tavern', label: '未写酒馆', hint: '在酒馆门外，找门口的盖戳牌。', x: 159, n: 221 },
  { id: 'post', label: '新年邮局', hint: '在邮局通往中央桥的路口南侧。', x: 263.5, n: 190 },
  { id: 'museum', label: '2026 纪念馆', hint: '从纪念馆入口的路口走向门厅。', x: 343, n: 255 },
  { id: 'station', label: '火车站', hint: '走进火车站正门，在站厅入口处盖章。', x: 526, n: 315.5 },
  { id: 'bath', label: '温泉浴场', hint: '在温泉浴场西门内侧。', x: 526, n: 159 },
  { id: 'castle', label: '冰雪城堡', hint: '在冰雪城堡西门内侧。', x: 462, n: 71 },
];
const passport = createTownPassport({ ...activityContext, announce: announceActivity }, stampSites);
const passportButton = element<HTMLButtonElement>('town-passport-button');
function showStampCount() {
  const { collected, total } = passport.getProgress();
  passportButton.textContent = `纪念戳册 ${collected}/${total}`;
}
showStampCount();
passportButton.onclick = () => {
  passport.open();
  showStampCount();
};

const stampGeometry = new BoxGeometry();
const stampMarkers = new InstancedMesh(stampGeometry, new MeshLambertMaterial(), stampSites.length * 2);
stampMarkers.name = '小镇盖戳牌';
stampMarkers.visible = false;
const stampTransform = new Matrix4();
const stampPaint = new Color();
function paintStamp(index: number, stamped: boolean) {
  stampMarkers.setColorAt(index * 2 + 1, stampPaint.set(stamped ? '#728eaa' : '#efba67'));
  stampMarkers.instanceColor!.needsUpdate = true;
}
stampSites.forEach((stamp, index) => {
  const { x, n } = stamp;
  const ground = grid.heightAt(x, n);
  const signX = x + .64;
  const signZ = -n;
  const signY = grid.heightAt(signX, n);
  stampMarkers.setMatrixAt(index * 2, stampTransform.makeScale(.19, .9, .2).setPosition(signX, signY + .44, signZ));
  stampMarkers.setColorAt(index * 2, stampPaint.set('#725045'));
  stampMarkers.setMatrixAt(index * 2 + 1, stampTransform.makeScale(.42, .31, .19).setPosition(signX, signY + .91, signZ));
  paintStamp(index, passport.has(stamp.id));
  activitySpots.push({
    x, n, ground, range: 1.4, label: `领取${stamp.label}印章`,
    available: () => !passport.has(stamp.id),
    run() {
      if (passport.collect(stamp.id)) {
        paintStamp(index, true);
        showStampCount();
      }
    },
  });
});
stampMarkers.computeBoundingSphere();
scene.add(stampMarkers);

function localSpot(group: Group, [east, height, z]: readonly number[], range: number, label: string,
  run: (x: number, n: number, ground: number) => void): TownActivitySpot {
  const x = group.position.x + east;
  const n = -group.position.z - z;
  const ground = group.position.y + height;
  return { x, n, ground, range, label, run: () => run(x, n, ground) };
}
const tower = architecture.get('clocktower')!;
const towerStops = tower.userData.stops as Record<'dial' | 'bell' | 'lookout', number[]>;
activitySpots.push(
  localSpot(tower, towerStops.dial, 1.75, '查看钟楼表盘', () => {
    const dialFocus = tower.userData.dialFocus as [number, number, number];
    const focus = tower.localToWorld(new Vector3(...dialFocus));
    activityContext.face(focus.x, -focus.z, focus.y);
    announceActivity('表盘层 · 黄铜指针与传动齿轮');
  }),
  localSpot(tower, towerStops.bell, 2, '拉绳敲钟', () => {
    if (festival.ringBell()) announceActivity('钟声已响');
  }),
  localSpot(tower, towerStops.lookout, 1.3, '保存钟楼取景', () => {
    const [, deck, opening] = towerStops.lookout;
    const center = tower.localToWorld(new Vector3(0, deck, opening));
    x = center.x;
    n = -center.z;
    ground = center.y;
    activityContext.face(223, 179, 75);
    photoFilename = 'UNWRITTEN-2027-clocktower.png';
  }),
);

function registerLandmarkActivities(id: string, group: Group) {
  if (id === 'hot-spring') {
    const seats = group.userData.seats as number[][];
    for (const [east, height, z] of seats) {
      activitySpots.push(localSpot(group, [east, .25, z - .85], 1.4, '在温泉馆就座', (x, n, ground) => {
        activityContext.sit({ x, n: n - .85, eyeY: ground + height + .98 - .25, yaw: 0 });
      }));
    }
  } else if (id === 'ice-castle') {
    activitySpots.push(localSpot(group, [15.8, .12, -.36], 1.75, '保存冰晶大殿取景', () => {
      activityContext.face(503.13, 76.92, 14.2);
      photoFilename = 'UNWRITTEN-2027-ice-castle.png';
    }));
  }
}
const tour = [
  { x: 262.1, n: 205.6, radius: 2.9, maxHeight: 15.6, label: '给 2027 写封信', run() {
    openPlace('写给 2027', '给未来的自己留一封信。寄存后可以在同一浏览器里回来读。', true);
  } },
];
function currentAction() {
  if (!walking || airHeight !== undefined || placeCard.open || museumVisit.dialog.open) return undefined;
  if (boardingGround) return { label: railway.atPlatform ? '下车' : '结束乘坐并回到站台', run: leaveRide };
  if (seated) return { label: '起身', run: leaveSeat };
  if (museumInspection.active) return { label: '返回展柜', run: museumInspection.close };
  if (museumLaunch.active) return { label: '返回展柜', run: museumLaunch.close };
  const local = museumPosition();
  const museumStop = museumVisit.near(local.x, local.y, local.z);
  if (museumStop) return museumStop;
  const platform = railway.boarding;
  if (architecture.has('coaster-station') && railway.atPlatform &&
    Math.abs(ground - platform.ground) < 1.4 && Math.hypot(x - platform.x, n - platform.n) < 3.4) {
    return { label: '乘坐环镇列车', run() {
      resetMovement();
      const platformFloor = supportAt(platform.x, platform.n, platform.ground + stepHeight);
      boardingGround = { x: platform.x, n: platform.n, ground: platformFloor, yaw };
      rideYawOffset = 0;
      ridePitch = 0;
      railway.board();
    } };
  }
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
  const destinations: Record<string, readonly [number, number]> = {
    '西南河畔街巷': [131, 141], '冰湖雪球场': [350, 79],
    '东侧扩建步道': [456, 222], '北侧森林街区': [104, 415],
    '火车站': [526, 312], '环镇列车站': [478, 224],
    '温泉浴场': [524, 158], '冰雪城堡': [460, 72],
  };
  const [east, north] = target?.door ?? destinations[selector.value] ?? [226, 223];
  yaw = Math.atan2(east - x, north - n);
  ground = grid.heightAt(x, n);
  airHeight = undefined;
  riseSpeed = 0;
  pitch = 0;
}
function mode(next: boolean) {
  leaveRide();
  leaveSeat();
  resetMovement();
  activityStatus.textContent = '';
  walking = next;
  museumInspection.close();
  museumLaunch.close();
  museumGuide.setActive(false);
  controls.enabled = !next;
  overview.setAttribute('aria-pressed', String(!next));
  walk.setAttribute('aria-pressed', String(next));
  element('help').textContent = next
    ? (touchWalk.active() ? '滑动转向，摇杆前推两次疾跑，点「跳跃」。' : '点击画面后移动鼠标转向，WASD 行走，双按 W 或 Shift+W 疾跑，空格跳跃，E 互动。')
    : (touchWalk.active() ? '拖动旋转，双指缩放。' : '拖动旋转，滚轮缩放。可前往街区或建筑入口。');
  if (next) jump();
  else {
    camera.position.set(540, 494, 177);
    controls.target.set(320, 20, -254);
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
const moveKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight']);
const forwardKey = (code: string) => code === 'KeyW' || code === 'ArrowUp';
const forwardHeld = () => keys.has('KeyW') || keys.has('ArrowUp');
function lookAllowed() {
  return walking && !museumOverlay() && !placeCard.open && !museumVisit.dialog.open;
}
function moveAllowed() { return lookAllowed() && !seated && !boardingGround; }
function turnView(horizontal: number, vertical: number) {
  if (boardingGround) {
    rideYawOffset += horizontal;
    ridePitch = Math.max(-1.42, Math.min(1.42, ridePitch + vertical));
  } else if (seated) {
    seated.yaw += horizontal;
    seated.pitch = Math.max(-1.42, Math.min(1.42, seated.pitch + vertical));
  } else {
    yaw += horizontal;
    pitch = Math.max(-1.42, Math.min(1.42, pitch + vertical));
  }
}
const desktopLook = createDesktopLook(renderer.domElement, lookAllowed, turnView);
const touchLook = createTouchLook(renderer.domElement, lookAllowed, turnView, () => boardingGround ? ridePitch : seated?.pitch ?? pitch);
function requestJump() {
  if (!moveAllowed() || airHeight !== undefined) return;
  airHeight = ground;
  riseSpeed = 5.4;
}
touchJump.addEventListener('pointerdown', event => {
  if (event.pointerType === 'touch') { event.preventDefault(); requestJump(); }
});
touchJump.addEventListener('click', requestJump);
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
  if ((seated || boardingGround) && e.code === 'Escape') {
    e.preventDefault();
    interact();
    return;
  }
  if (e.code === 'Escape' && document.pointerLockElement === renderer.domElement) {
    desktopLook.release();
    return;
  }
  if (walking && e.code === 'KeyE' && !e.repeat && currentAction()) {
    e.preventDefault();
    interact();
  }
  if (moveAllowed() && e.code === 'Space') {
    if (!e.repeat && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      requestJump();
    }
    return;
  }
  if (moveAllowed() && moveKeys.has(e.code)) {
    if (!e.repeat && forwardKey(e.code) && !forwardHeld()) {
      const now = performance.now();
      doubleForward = now - forwardPressedAt <= 330;
      forwardPressedAt = now;
    }
    keys.add(e.code);
    e.preventDefault();
  }
});
addEventListener('keyup', e => {
  keys.delete(e.code);
  if (!forwardHeld()) doubleForward = false;
});
addEventListener('blur', resetMovement);
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
let widePanorama = false;
function walkable(x: number, n: number) {
  return canEnter(x, n) && !scenery.blocked(x, n) && !districts.blocked(x, n)
    && !forest.blocked(x, n) && !streetscape.blocked(x, n);
}
const bodyHeight = 1.8;
const stepHeight = .43;
const surfaceEpsilon = .025;

function overlapsBody(east: number, north: number, { min, max }: Box) {
  const z = -north;
  const dx = Math.max(min[0] - east, east - max[0], 0);
  const dz = Math.max(min[2] - z, z - max[2], 0);
  return dx * dx + dz * dz < bodyRadius * bodyRadius;
}

function supportAt(east: number, north: number, limit: number, solidLimit = -Infinity) {
  const z = -north;
  let height = grid.heightAt(east, north);
  const { floors, ramps, colliders } = geometryAt(east, north);
  for (const floor of floors) {
    if (floor.max[1] <= limit && overlapsBody(east, north, floor)) height = Math.max(height, floor.max[1]);
  }
  for (const ramp of ramps) {
    if (east < ramp.min[0] || east > ramp.max[0] || z < ramp.min[2] || z > ramp.max[2]) continue;
    const axis = ramp.axis === 'x' ? 0 : 2;
    const fraction = ((axis === 0 ? east : z) - ramp.min[axis]) / (ramp.max[axis] - ramp.min[axis]);
    const top = ramp.min[1] + (ramp.max[1] - ramp.min[1]) * (ramp.ascending > 0 ? fraction : 1 - fraction);
    if (top <= limit) height = Math.max(height, top);
  }
  if (solidLimit > -Infinity) {
    for (const solid of colliders) {
      if (solid.max[1] <= solidLimit && overlapsBody(east, north, solid)) height = Math.max(height, solid.max[1]);
    }
  }
  return height;
}

function obstructed(east: number, north: number, feet: number) {
  const intersects = (box: Box) => feet + surfaceEpsilon < box.max[1] &&
    feet + bodyHeight - surfaceEpsilon > box.min[1] && overlapsBody(east, north, box);
  const { colliders, floors } = geometryAt(east, north);
  return activities.some(activity => activity.blocked?.(east, north, feet)) ||
    colliders.some(intersects) || floors.some(intersects);
}

function tryMove(nextX: number, nextN: number) {
  if (!walkable(nextX, nextN)) return false;
  const feet = airHeight ?? ground;
  const limit = feet + (airHeight === undefined ? stepHeight : surfaceEpsilon);
  const floor = supportAt(nextX, nextN, limit, airHeight === undefined ? ground + .03 : limit);
  const nextHeight = airHeight === undefined ? floor : feet;
  if (floor > limit || obstructed(nextX, nextN, nextHeight)) return false;
  [x, n] = [nextX, nextN];
  if (airHeight === undefined) {
    if (ground - nextHeight > stepHeight) {
      airHeight = ground;
      riseSpeed = 0;
    } else ground = nextHeight;
  }
  return true;
}

function stepJump(dt: number) {
  if (airHeight === undefined) return;
  const feet = airHeight;
  riseSpeed -= 16.5 * dt;
  const next = feet + riseSpeed * dt;
  if (riseSpeed > 0) {
    const head = feet + bodyHeight;
    let ceiling = next + bodyHeight;
    function checkCeiling(box: Box) {
      if (box.min[1] >= head - surfaceEpsilon && box.min[1] < ceiling && overlapsBody(x, n, box)) {
        ceiling = box.min[1];
      }
    }
    const { floors, colliders } = geometryAt(x, n);
    floors.forEach(checkCeiling);
    colliders.forEach(checkCeiling);
    if (ceiling < next + bodyHeight) {
      airHeight = Math.max(feet, ceiling - bodyHeight);
      riseSpeed = 0;
      return;
    }
    if (obstructed(x, n, next)) {
      riseSpeed = 0;
      return;
    }
  } else {
    const landing = supportAt(x, n, feet + surfaceEpsilon, feet + surfaceEpsilon);
    if (next <= landing) {
      ground = landing;
      airHeight = undefined;
      riseSpeed = 0;
      return;
    }
  }
  airHeight = next;
}
function faceFrom(east: number, north: number, height: number, heading: number, tilt: number) {
  camera.position.set(east, height, -north);
  camera.lookAt(east + Math.sin(heading) * Math.cos(tilt), height + Math.sin(tilt), -north - Math.cos(heading) * Math.cos(tilt));
}
renderer.setAnimationLoop(now => {
  const frameSeconds = Math.max(0, now - previous) / 1000;
  const dt = Math.min(.25, frameSeconds);
  previous = now;
  const beacon = architecture.get('lighthouse')?.userData.beaconPivot as Object3D | undefined;
  railway.update(dt);
  if (beacon) {
    beacon.visible = nightMode;
    if (nightMode) beacon.rotation.y = (beacon.rotation.y + .28 * dt) % (Math.PI * 2);
  }
  if (museumOverlay()) {
    element('position').textContent = '';
  } else if (walking && boardingGround) {
    railway.view.getWorldPosition(camera.position);
    railway.view.getWorldDirection(lookAhead);
    const heading = Math.atan2(lookAhead.x, -lookAhead.z);
    faceFrom(camera.position.x, -camera.position.z, camera.position.y, heading + rideYawOffset, ridePitch);
    element('position').textContent = railway.atPlatform ? '环镇列车 · 已到站' : '环镇列车 · 乘坐中';
  } else if (walking && seated) {
    faceFrom(seated.x, seated.n, seated.eyeY, seated.yaw, seated.pitch);
    element('position').textContent = '已就座';
  } else if (walking) {
    const forward = Number(forwardHeld()) - Number(keys.has('KeyS') || keys.has('ArrowDown')) + touchWalk.axes.forward;
    const right = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft')) + touchWalk.axes.right;
    const sprint = forward > .12 && (doubleForward || keys.has('ShiftLeft') || keys.has('ShiftRight') || touchWalk.sprinting);
    const steps = Math.max(1, Math.ceil(dt / .018));
    const stepTime = dt / steps;
    if (moveAllowed()) {
      const stride = (sprint ? 11.3 : 7.5) * stepTime / Math.max(1, Math.hypot(forward, right));
      const east = (Math.sin(yaw) * forward + Math.cos(yaw) * right) * stride;
      const north = (Math.cos(yaw) * forward - Math.sin(yaw) * right) * stride;
      for (let i = 0; i < steps; i++) {
        if (forward || right) {
          const nx = x + east;
          const nn = n + north;
          if (!tryMove(nx, nn) && !tryMove(nx, n)) tryMove(x, nn);
        }
        stepJump(stepTime);
      }
    }
    faceFrom(x, n, (airHeight ?? ground) + eye, yaw, pitch);
    element('position').textContent = `东 ${x.toFixed(1)} m · 北 ${n.toFixed(1)} m · ${airHeight !== undefined ? '腾空' : sprint ? '疾跑' : '行走'}`;
  } else {
    controls.update();
    element('position').textContent = '';
  }
  const wideView = !walking && camera.position.y > (widePanorama ? 232 : 248);
  widePanorama = wideView;
  prepareTerrain(camera.position.x, -camera.position.z, !walking, wideView);
  forest.setPanorama(wideView);
  districts.setPanorama(wideView);
  showWideBridges(wideView);
  railway.setPanorama(wideView);
  stampMarkers.visible = !wideView && stampSites.some(site =>
    Math.abs(camera.position.x - site.x) < 34 && Math.abs(camera.position.z + site.n) < 34 &&
    Math.abs(camera.position.y - grid.heightAt(site.x, site.n)) < 18);
  const towerInterior = architecture.get('clocktower')?.userData.detailInterior as Group | undefined;
  if (towerInterior) towerInterior.visible = !wideView && Math.hypot(camera.position.x - 226, camera.position.z + 223) < 45;
  prepareLandmarks(camera.position.x, -camera.position.z, !walking);
  if (!streetsRequested && (!walking || camera.position.x > 320 || -camera.position.z > 275)) {
    streetsRequested = true;
    import('./extension-streets').then(({ buildExtensionStreets }) => {
      extensionStreets = buildExtensionStreets(grid, railway.keepClear, districts.keepClear);
      scene.add(extensionStreets.group);
      walkGeometry = geometry();
      describeTown();
    }).catch(error => {
      status.textContent = '新区街景读取失败';
      console.error('Loading extension streets', error);
    });
  }
  extensionStreets?.update(camera, wideView);
  const baths = architecture.get('hot-spring');
  if (baths) baths.userData.updateSteam(dt, camera.position.distanceTo(baths.position));
  scenery.update(dt, walking, camera.position.x, camera.position.y, camera.position.z);
  const museum = architecture.get('memorial');
  const smallLabels = museum?.userData.smallLabels as Mesh[] | undefined;
  if (smallLabels) for (const label of smallLabels) label.visible = !wideView;
  const interior = museum?.userData.detailInterior as Group | undefined;
  if (interior && museum) {
    interior.visible = Math.abs(camera.position.x - museumEast) < 48 &&
      Math.abs(camera.position.z + museumNorth) < 43 &&
      camera.position.y - museumHeight < 16;
  }
  updateMuseumLights(dt, camera.position);
  const local = museumPosition();
  const sheltered = walking && Math.abs(local.x) < 19.55 && local.z > -13.7 && local.z < 12.85;
  snowfall.update(camera, dt, walking, sheltered);
  festival.update(dt);
  for (const activity of activities) activity.update?.(frameSeconds);
  rehearse.disabled = festival.active();
  const canControl = walking && !placeCard.open && !museumVisit.dialog.open;
  touchWalk.setAllowed(moveAllowed());
  crosshair.hidden = !lookAllowed() || touchWalk.active();
  touchJump.hidden = !moveAllowed() || !touchWalk.active();
  touchJump.disabled = airHeight !== undefined;
  museumMapButton.hidden = !canControl || museumOverlay() || Math.abs(local.x) > 29 || Math.abs(local.z) > 19;
  const action = currentAction();
  actionButton.hidden = !action;
  const label = action ? (touchWalk.active() ? action.label : `E · ${action.label}`) : '';
  if (label !== actionButton.textContent) actionButton.textContent = label;
  if (museumLaunch.active) { museumLaunch.update(frameSeconds); museumLaunch.render(); }
  else if (museumInspection.active) museumInspection.render();
  else renderer.render(scene, camera);
  if (photoFilename) {
    const filename = photoFilename;
    photoFilename = undefined;
    renderer.domElement.toBlob(blob => {
      if (!blob) return;
      const photo = document.createElement('a');
      const url = URL.createObjectURL(blob);
      photo.href = url;
      photo.download = filename;
      document.body.append(photo);
      photo.click();
      photo.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  }
});
