/**
 * FR-16 R3 3D 验收：真实 snowfall 粒子 + R1 夜空调色 + R2 空间场。
 * 独立预览，不接生产 viewer；相机在五个取样点之间切换，同一天气状态下
 * 直接对比小镇 / 山脚 / 高山区 / 主峰 / 陨石坑的雪势、雾、风和粒子预算。
 */
import { AmbientLight, BoxGeometry, Color, ConeGeometry, CylinderGeometry, DirectionalLight, Fog, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, PointLight, Scene, SphereGeometry, WebGLRenderer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { townNightWeatherAt } from '../../../src/shared/town-night-weather-cycle';
import { townOutdoorWeatherFieldAt } from './town-weather-field-outdoor';
import { createTownWeatherVisualDriver } from './town-weather-visual-budget';
import { createSnowfall } from './snowfall';
import type { TownOutdoorWeatherState } from '../../../src/shared/town-outdoor-weather';

type Zone = 'town' | 'foothill' | 'alpine' | 'summit' | 'crater';
type Weather = 'clear-snow' | 'wind' | 'whiteout';

const zones: Record<Zone, { label: string; east: number; north: number; elevation: number }> = {
  town: { label: '小镇广场', east: 206, north: 182, elevation: 30 },
  foothill: { label: '山脚', east: 300, north: 430, elevation: 150 },
  alpine: { label: '高山区', east: 300, north: 560, elevation: 420 },
  summit: { label: '主峰', east: 350, north: 676, elevation: 800 },
  crater: { label: '陨石坑', east: -120, north: 185, elevation: 60 },
};

const weathers: Record<Weather, { label: string; state: TownOutdoorWeatherState }> = {
  'clear-snow': {
    label: '晴雪',
    state: { weather: 'clear-snow', startedAt: 0, nextChangeAt: 1, windEast: 1, windNorth: 0, windStrength: .04 },
  },
  wind: {
    label: '飞雪',
    state: { weather: 'wind', startedAt: 0, nextChangeAt: 1, windEast: .8, windNorth: -.6, windStrength: .5 },
  },
  whiteout: {
    label: '暴雪',
    state: { weather: 'whiteout', startedAt: 0, nextChangeAt: 1, windEast: .6, windNorth: -.8, windStrength: 1 },
  },
};

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

function terrainHeight(east: number, north: number): number {
  let height = 0;
  if (north > 384) {
    const t = Math.min(1, (north - 384) / 292);
    const lateral = 1 - .45 * smoothstep(220, 520, Math.abs(east - 300));
    height = 770 * t * lateral;
  }
  const crater = Math.hypot(east + 120, north - 185);
  height -= 35 * (1 - smoothstep(20, 55, crater));
  // The preview compresses 1.2 km of real slope into 900 m; scale the visual
  // relief so the fog and stakes are legible. Field elevation stays true.
  return height * .3;
}

const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.prepend(renderer.domElement);

const scene = new Scene();
const camera = new PerspectiveCamera(58, window.innerWidth / window.innerHeight, .1, 2400);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = .08;
controls.maxPolarAngle = Math.PI * .62;
controls.minDistance = 2;
controls.maxDistance = 1600;

const dawnEpoch = Date.UTC(2026, 0, 1);
const duskNow = dawnEpoch + 10 * 60_000 * .78;
const nightSample = townNightWeatherAt(duskNow, dawnEpoch);
const ambient = new AmbientLight(nightSample.ambientColor, nightSample.ambientIntensity);
const moon = new DirectionalLight(nightSample.sunColor, nightSample.sunIntensity);
moon.position.set(nightSample.sunDirection[0] * 300, nightSample.sunDirection[1] * 300, -nightSample.sunDirection[2] * 300);
scene.add(ambient, moon);
scene.background = new Color(nightSample.skyColor);
const fog = new Fog(nightSample.fogColor, 60, 1200);
scene.fog = fog;

// A lightweight heightfield for the preview only; production passes real terrain samples.
const groundGeometry = new PlaneGeometry(920, 820, 100, 90);
groundGeometry.rotateX(-Math.PI / 2);
const groundPosition = groundGeometry.getAttribute('position');
for (let index = 0; index < groundPosition.count; index += 1) {
  const east = groundPosition.getX(index) + 320;
  const north = -groundPosition.getZ(index) + 400;
  groundPosition.setY(index, terrainHeight(east, north));
}
groundGeometry.computeVertexNormals();
const ground = new Mesh(groundGeometry, new MeshStandardMaterial({ color: '#dfe9f5', roughness: .96, metalness: 0 }));
ground.position.set(320, 0, -400);
scene.add(ground);

// Six lamp posts around the plaza give the night frame a scale reference.
const lamps = new Group();
for (let index = 0; index < 6; index += 1) {
  const east = 170 + (index % 3) * 36;
  const north = 150 + Math.floor(index / 3) * 34;
  const post = new Group();
  const pole = new Mesh(new CylinderGeometry(.18, .22, 3.6, 6), new MeshStandardMaterial({ color: '#2b3442' }));
  pole.position.y = 1.8;
  const bulb = new Mesh(new SphereGeometry(.38, 10, 8), new MeshStandardMaterial({
    color: '#fff2c9', emissive: '#ffd27a', emissiveIntensity: 1.6,
  }));
  bulb.position.y = 3.7;
  post.add(pole, bulb);
  post.position.set(east, terrainHeight(east, north), -north);
  lamps.add(post);
}
scene.add(lamps);

// A handful of block houses give the town frame a readable scale under the snow.
const houses = new Group();
for (let index = 0; index < 6; index += 1) {
  const east = 150 + (index % 3) * 46;
  const north = 142 + Math.floor(index / 3) * 44;
  const base = terrainHeight(east, north);
  const house = new Group();
  const body = new Mesh(new BoxGeometry(13, 7, 10), new MeshStandardMaterial({ color: '#7b6656', roughness: .9 }));
  body.position.y = 3.5;
  const cap = new Mesh(new BoxGeometry(14.4, 1.2, 11.2), new MeshStandardMaterial({ color: '#e6eef7', roughness: .95 }));
  cap.position.y = 7.6;
  const window = new Mesh(new BoxGeometry(1.9, 2.1, .16), new MeshStandardMaterial({
    color: '#ffd99a', emissive: '#ffb85c', emissiveIntensity: 1.5, roughness: .4,
  }));
  window.position.set(-3, 3.1, 5.08);
  const windowB = window.clone();
  windowB.position.x = 3;
  house.add(body, cap, window, windowB);
  house.position.set(east, base, -north);
  houses.add(house);
}
scene.add(houses);

// Distance stakes every 10/20/40/80 m from each sample point: their tips are the
// easiest way to read the visibility number in the fog.
const stakes = new Group();
for (const spot of Object.values(zones)) {
  for (const distance of [10, 20, 40, 80]) {
    const north = spot.north + distance;
    if (north > 800) continue;
    const base = terrainHeight(spot.east, north);
    const pole = new Mesh(new CylinderGeometry(.09, .12, 2.6, 5), new MeshStandardMaterial({ color: '#38485c' }));
    pole.position.set(spot.east, base + 1.3, -north);
    const tip = new Mesh(new SphereGeometry(.24, 8, 6), new MeshStandardMaterial({
      color: '#c9ecff', emissive: '#7cc9ff', emissiveIntensity: 1.2,
    }));
    tip.position.set(spot.east, base + 2.7, -north);
    stakes.add(pole, tip);
  }
}
scene.add(stakes);

// Deterministic pine silhouettes give the fog a readable depth cue.
const pines = new Group();
const pineMaterial = new MeshStandardMaterial({ color: '#23342f', roughness: 1 });
const snowCapMaterial = new MeshStandardMaterial({ color: '#dbe7f4', roughness: 1 });
for (let index = 0; index < 90; index += 1) {
  const east = 120 + ((index * 137) % 420);
  const north = 250 + ((index * 89) % 510);
  const base = terrainHeight(east, north);
  const size = .65 + ((index * 37) % 55) / 100;
  const trunk = new Mesh(new CylinderGeometry(.5 * size, .65 * size, 3 * size, 5), new MeshStandardMaterial({ color: '#2c2621' }));
  trunk.position.set(east, base + 1.5 * size, -north);
  const crown = new Mesh(new ConeGeometry(2.7 * size, 7.5 * size, 7), pineMaterial);
  crown.position.set(east, base + 5 * size, -north);
  const cap = new Mesh(new ConeGeometry(1.6 * size, 3.2 * size, 7), snowCapMaterial);
  cap.position.set(east, base + 8.6 * size, -north);
  pines.add(trunk, crown, cap);
}
scene.add(pines);

for (const [east, north] of [[170, 150], [242, 184]]) {
  const glow = new PointLight('#ffd79a', 2200 * nightSample.lampLevel, 46, 2);
  glow.position.set(east, terrainHeight(east, north) + 3.4, -north);
  scene.add(glow);
}

const snowfall = createSnowfall(scene);
const driver = createTownWeatherVisualDriver(snowfall, { qualityScale: () => 1 });

const hud = {
  zone: document.querySelector<HTMLElement>('#zone')!,
  weather: document.querySelector<HTMLElement>('#weather')!,
  intensity: document.querySelector<HTMLElement>('#intensity')!,
  visibility: document.querySelector<HTMLElement>('#visibility')!,
  wind: document.querySelector<HTMLElement>('#wind')!,
  density: document.querySelector<HTMLElement>('#density')!,
  fog: document.querySelector<HTMLElement>('#fog')!,
  elevation: document.querySelector<HTMLElement>('#elevation')!,
};

let zone: Zone = 'town';
let weather: Weather = 'whiteout';
let paused = false;
let field = townOutdoorWeatherFieldAt(weathers[weather].state, zones[zone], { exposure: 1, nightFogFar: Infinity });

function placeCamera(next: Zone) {
  zone = next;
  const spot = zones[zone];
  const groundY = terrainHeight(spot.east, spot.north);
  const lift = zone === 'town' ? 2.4 : 25;
  camera.position.set(spot.east, groundY + lift, -spot.north + (zone === 'town' ? 86 : 0));
  const target = { east: spot.east, north: spot.north + (zone === 'town' ? 70 : 46) };
  controls.target.set(target.east, camera.position.y - (zone === 'town' ? 1.5 : 6), -target.north);
  controls.update();
}

function zoneElevation(): number {
  return zones[zone].elevation;
}

function applyWeather() {
  field = townOutdoorWeatherFieldAt(weathers[weather].state, {
    east: camera.position.x,
    north: -camera.position.z,
    elevation: zoneElevation(),
  }, { exposure: 1, nightFogFar: Infinity });
  hud.zone.textContent = zones[zone].label;
  hud.weather.textContent = weathers[weather].label;
  hud.elevation.textContent = `${Math.round(zones[zone].elevation)} m`;
  hud.intensity.textContent = field.intensity.toFixed(2);
  hud.visibility.textContent = `${Math.round(field.visibilityMeters)} m`;
  hud.wind.textContent = field.windStrength.toFixed(2);
  hud.density.textContent = driver.current().density.toFixed(2);
  hud.fog.textContent = `${Math.round(field.fogNear)}–${Math.round(field.fogFar)} m`;
  document.querySelectorAll('[data-zone]').forEach((button) => {
    button.classList.toggle('active', (button as HTMLElement).dataset.zone === zone);
  });
  document.querySelectorAll('[data-weather]').forEach((button) => {
    button.classList.toggle('active', (button as HTMLElement).dataset.weather === weather);
  });
}

document.querySelectorAll<HTMLButtonElement>('[data-zone]').forEach((button) => {
  button.onclick = () => { placeCamera(button.dataset.zone as Zone); applyWeather(); };
});
document.querySelectorAll<HTMLButtonElement>('[data-weather]').forEach((button) => {
  button.onclick = () => { weather = button.dataset.weather as Weather; applyWeather(); };
});

placeCamera('town');
applyWeather();

const clock = { last: performance.now() };
function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = clamp((now - clock.last) / 1000, 0, .1);
  clock.last = now;
  if (!paused) {
    const position = {
      east: camera.position.x,
      north: -camera.position.z,
      elevation: zoneElevation(),
    };
    field = townOutdoorWeatherFieldAt(weathers[weather].state, position, { exposure: 1, nightFogFar: Infinity });
    driver.update(field, dt, now, 1);
    snowfall.update(camera, dt, true, false);
    controls.update();
    const whiteoutBlend = 1 - smoothstep(60, 220, field.visibilityMeters);
    const sky = new Color(nightSample.skyColor).lerp(new Color(field.skyColor ?? '#d8e2e9'), whiteoutBlend * .55);
    scene.background = sky;
    fog.color.copy(sky);
    fog.far = Math.max(18, field.visibilityMeters * 1.2);
    fog.near = Math.max(.2, fog.far * .04);
    hud.intensity.textContent = field.intensity.toFixed(2);
    hud.visibility.textContent = `${Math.round(field.visibilityMeters)} m`;
    hud.wind.textContent = field.windStrength.toFixed(2);
    hud.density.textContent = driver.current().density.toFixed(2);
    hud.fog.textContent = `${Math.round(fog.near)}–${Math.round(fog.far)} m`;
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

let frames = 0;
const readyPoll = window.setInterval(() => {
  frames += 1;
  if (frames >= 3) {
    window.clearInterval(readyPoll);
    (window as unknown as { __FR16_PREVIEW__?: unknown }).__FR16_PREVIEW__ = {
      ready: true,
      setZone: (next: Zone) => { placeCamera(next); applyWeather(); },
      setWeather: (next: Weather) => { weather = next; applyWeather(); },
      pause: () => { paused = true; },
      play: () => { paused = false; },
      state: () => ({
        zone, weather,
        field: {
          intensity: field.intensity,
          severity: field.severity,
          visibilityMeters: field.visibilityMeters,
          windEast: field.windEast,
          windNorth: field.windNorth,
          windStrength: field.windStrength,
          fogNear: field.fogNear,
          fogFar: field.fogFar,
          region: field.region,
        },
        density: driver.current().density,
        camera: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      }),
    };
  }
}, 120);
