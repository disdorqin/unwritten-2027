import { AmbientLight, BufferGeometry, Color, DirectionalLight, Float32BufferAttribute, Fog, Group,
  IcosahedronGeometry, Mesh, MeshBasicMaterial, MeshLambertMaterial, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import { createDesktopLook } from './desktop-look';
import { mountSkyCity, skyCityTier, type SkyCityFoot } from './sky-city';
import { createSkyCityApproach, skyCityApproachSite, skyCityDeparture, skyCityDepartureBounds, skyCityDepartureFloorAt } from './sky-city-approach';
import type { AircraftThrottle } from '../../../src/shared/aircraft-flight';

const scene = new Scene();
const sky = new Color('#a6c6ca');
scene.background = sky;
const fog = new Fog(sky, 95, 570);
scene.fog = fog;
const ambient=new AmbientLight('#e3eff2',1.38);
scene.add(ambient);
let reviewNight=false;
const sunlight = new DirectionalLight('#fff1ca', 2.6);
sunlight.position.set(-42, 130, 65);
scene.add(sunlight);

const islandFrame = new Group();
skyCityApproachSite.place(islandFrame);
scene.add(islandFrame);
const city = mountSkyCity(islandFrame);
const departure = new Group();
const ledgeTop = skyCityDeparture.height;
const { xMin, xMax, zMin, zLip, zMax } = skyCityDepartureBounds;
const ledgeSamples: number[] = [];
for (const z of [zMin, zLip, zMax]) {
  ledgeSamples.push(xMin, skyCityDepartureFloorAt(xMin, -z) ?? ledgeTop, z,
    xMax, skyCityDepartureFloorAt(xMax, -z) ?? ledgeTop, z);
}
const ledgeMesh = new BufferGeometry();
ledgeMesh.setAttribute('position', new Float32BufferAttribute(ledgeSamples, 3));
ledgeMesh.setIndex([0, 2, 1, 2, 3, 1, 2, 4, 3, 4, 5, 3]);
ledgeMesh.computeVertexNormals();
departure.add(new Mesh(ledgeMesh, new MeshLambertMaterial({ color: '#dae8e9' })));
scene.add(departure);

const clouds = new Group();
const cloudGeometry = new IcosahedronGeometry(1, 1);
const cloudFinish = new MeshBasicMaterial({ color: '#e8efee' });
for (let index = 0; index < 26; index++) {
  const angle = index * 2.399963;
  const span = 62 + index * 4.5;
  const cloud = new Mesh(cloudGeometry, cloudFinish);
  const cloudAt = skyCityApproachSite.toWorld({ x: Math.cos(angle) * span, y: -47 + Math.sin(index * 3.1) * 10,
    z: Math.sin(angle) * span + 23 });
  cloud.position.set(cloudAt.east, cloudAt.height, -cloudAt.north);
  cloud.scale.set(18 + index % 4 * 11, 2.2 + index % 3, 11 + index % 6 * 4);
  clouds.add(cloud);
}
scene.add(clouds);

const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.domElement.tabIndex = 0;
renderer.domElement.setAttribute('aria-label', '第一人称天空之城');
document.querySelector('#scene')!.append(renderer.domElement);
const camera = new PerspectiveCamera(63, 1, .09, 850);
const aim = new Vector3();
const status = document.querySelector<HTMLElement>('#status')!;
const controls = document.querySelector<HTMLElement>('#controls')!;
const groundButton = document.querySelector<HTMLButtonElement>('#ground')!;
const summitButton = document.querySelector<HTMLButtonElement>('#summit')!;

type View = 'ground' | 'summit' | 'aircraft' | 'city';
let view: View = 'summit';
let yaw = 0, pitch = 0;
let foot: SkyCityFoot | undefined;
let throttle: AircraftThrottle = 'off';
let previous: number | undefined;
const held = new Set<string>();
const keys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Digit1', 'Digit2', 'Digit3']);

const newApproach = () => createSkyCityApproach({
  site: skyCityApproachSite,
  islandFloorAt: (x, z) => city.footModel()?.floorAt(x, z),
  islandBlocked: (x, z, y, radius) => city.footModel()?.obstructs(x, z, y, radius) ?? false,
});
let approach = newApproach();
const desktopLook = createDesktopLook(renderer.domElement, () => view === 'city' || view === 'summit', (horizontal, vertical) => {
  yaw += horizontal;
  pitch = Math.max(-1.29, Math.min(1.29, pitch + vertical));
});

function setView(next: View) {
  if (view !== next) held.clear();
  view = next;
  groundButton.setAttribute('aria-pressed', String(view === 'ground'));
  summitButton.setAttribute('aria-pressed', String(view === 'summit'));
  departure.visible = view === 'summit' || view === 'aircraft' || view === 'ground';
  clouds.visible = view !== 'ground';
  if (view === 'ground') {
    status.textContent = '雪镇地面';
    controls.textContent = '';
    city.show('hidden');
  } else if (view === 'summit') {
    status.textContent = '绝顶 · 云上海拔线';
    controls.textContent = 'E 起飞';
    city.show('silhouette');
  } else if (view === 'aircraft') {
    status.textContent = '飞行中';
    controls.textContent = 'W / S 抬头或俯冲，A / D 转向，1 / 2 / 3 调推力';
  } else {
    departure.visible = false;
    status.textContent = '天空之城 · 观测站';
    controls.textContent = 'WASD 行走，鼠标或方向键转身 · N 切换空城昼夜';
    city.show('full');
  }
}

function reset(next: 'ground' | 'summit') {
  desktopLook.release();
  approach = newApproach();
  foot = undefined;
  yaw = pitch = 0;
  throttle = 'off';
  setView(next);
  renderer.domElement.focus();
}
groundButton.onclick = () => reset('ground');
summitButton.onclick = () => reset('summit');
addEventListener('keydown', event => {
  if(event.code==='KeyN'&&!event.repeat&&!event.altKey&&!event.ctrlKey&&!event.metaKey){
    reviewNight=!reviewNight;sky.set(reviewNight?'#243343':'#a6c6ca');fog.color.copy(sky);
    ambient.color.set(reviewNight?'#9dc8ce':'#e3eff2');ambient.intensity=reviewNight?.55:1.38;
    sunlight.intensity=reviewNight?.25:2.6;return;
  }
  if (!keys.has(event.code) || event.altKey || event.ctrlKey || event.metaKey) return;
  event.preventDefault();
  held.add(event.code);
  if (event.code === 'KeyE' && !event.repeat && view === 'summit' && approach.launch()) {
    desktopLook.release();
    throttle = 'off';
    setView('aircraft');
  }
  if (view === 'aircraft') {
    if (event.code === 'Digit1') throttle = 'off';
    if (event.code === 'Digit2') throttle = 'cruise';
    if (event.code === 'Digit3') throttle = 'full';
  }
});
addEventListener('keyup', event => held.delete(event.code));
addEventListener('blur', () => held.clear());

function lookFrom(x: number, y: number, z: number, heading: number, tilt: number) {
  camera.position.set(x, y, z);
  aim.set(Math.sin(heading) * Math.cos(tilt), Math.sin(tilt), -Math.cos(heading) * Math.cos(tilt));
  camera.lookAt(aim.add(camera.position));
}

function walk(dt: number) {
  const model = city.footModel();
  if (!model || !foot) return;
  yaw += (Number(held.has('ArrowRight')) - Number(held.has('ArrowLeft'))) * dt * 1.65;
  pitch = Math.max(-1.29, Math.min(1.29, pitch + (Number(held.has('ArrowUp')) - Number(held.has('ArrowDown'))) * dt));
  const forward = Number(held.has('KeyW')) - Number(held.has('KeyS'));
  const right = Number(held.has('KeyD')) - Number(held.has('KeyA'));
  const movement = dt * 6.8 / Math.max(1, Math.hypot(forward, right));
  const dx = (Math.sin(yaw) * forward + Math.cos(yaw) * right) * movement;
  const dz = (-Math.cos(yaw) * forward + Math.sin(yaw) * right) * movement;
  const { x, z } = foot;
  foot = model.step(foot, x + dx, z + dz) ?? model.step(foot, x + dx, z) ?? model.step(foot, x, z + dz) ?? foot;
  const [gx, gy, gz] = model.gate;
  status.textContent = Math.hypot(gx - foot.x, gy - foot.y, gz - foot.z) < 4 ? '未央门 · 锁闭' : '天空之城 · 观测站';
  const eye = skyCityApproachSite.toWorld({ ...foot, y: foot.y + 1.65 });
  lookFrom(eye.east, eye.height, -eye.north, yaw + skyCityApproachSite.yaw, pitch);
}

function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
addEventListener('resize', resize);
resize();
setView('summit');
renderer.setAnimationLoop(now => {
  const dt = Math.min(.064, (now - (previous ?? now)) / 1000);
  previous = now;
  const elapsed = now / 1000;
  if (view === 'ground') {
    fog.near = 100;
    fog.far = 490;
    lookFrom(skyCityDeparture.east, 650, zMax + 45, 0, .65);
  } else if (view === 'summit') {
    fog.near = 110;
    fog.far = 560;
    lookFrom(skyCityDeparture.east, ledgeTop + 1.7, -skyCityDeparture.north, yaw, pitch - .09);
  } else if (view === 'aircraft') {
    const state = approach.snapshot();
    const origin = skyCityApproachSite.origin;
    const distance = Math.hypot(state.feet.east - origin.east, state.feet.north - origin.north);
    const tier = skyCityTier('aircraft', distance);
    city.show(tier);
    if (tier === 'full') departure.visible = false;
    approach.advance(dt, { throttle,
      turn: Number(held.has('KeyD')) - Number(held.has('KeyA')),
      pitch: Number(held.has('KeyW')) - Number(held.has('KeyS')),
    });
    const next = approach.snapshot();
    fog.near = tier === 'full' ? 65 : 110;
    fog.far = tier === 'full' ? 290 : 550;
    lookFrom(next.feet.east, next.feet.height + 1.55, -next.feet.north, next.heading, -.13);
    if (next.stage === 'walking') {
      yaw = next.heading - skyCityApproachSite.yaw;
      pitch = 0;
      foot = skyCityApproachSite.toLocal(next.feet);
      setView('city');
    } else if (next.stage === 'departure') reset('summit');
  } else walk(dt);

  city.update(elapsed);
  renderer.render(scene, camera);
  document.dispatchEvent(new CustomEvent('sky-city-frame', { detail: {
    view, tier: city.current(), foot, yaw, night:reviewNight, fps:dt>0?Math.round(1/dt):0, drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles, flight: approach.snapshot().flight,
  } }));
});
addEventListener('pagehide', event => {
  if (event.persisted) return;
  city.dispose();
  renderer.dispose();
});
