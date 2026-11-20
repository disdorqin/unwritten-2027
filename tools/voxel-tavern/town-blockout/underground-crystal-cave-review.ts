import { AmbientLight, Color, Fog, Group, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { crystalCave, crystalCaveCanStand, crystalCaveFloorAt, crystalCaveRegionAt } from './underground-crystal-cave';
import { mountUndergroundCrystalCave } from './underground-crystal-cave-scene';

const scene = new Scene();
scene.background = new Color('#080d16');
scene.fog = new Fog('#080d16', 19, 58);
scene.add(new AmbientLight('#a5c4e9', .38));
const stage = new Group();
scene.add(stage);
const cave = mountUndergroundCrystalCave(stage);
const host = document.querySelector<HTMLElement>('#cave-scene')!;
const output = document.querySelector<HTMLOutputElement>('#cave-location')!;
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
const canvas = renderer.domElement;
canvas.tabIndex = 0;
canvas.setAttribute('aria-label', '水晶洞第一人称走查');
host.prepend(canvas);
const camera = new PerspectiveCamera(59, 1, .08, 85);
const directions = new Set(['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight']);
const keys = new Set<string>();
const zoneNames = {
  'crystal-forest': '晶簇林', 'crystal-hall': '水晶大厅', 'moonstone-vein': '月光石脉',
  'underground-pool': '地下水潭', 'dark-passage': '黑廊',
} as const;
let east: number = crystalCave.entrance[0], north: number = crystalCave.entrance[1];
let feet = crystalCaveFloorAt(east, north)!;
let yaw = 0, pitch = 0;
let pointer: { id: number; x: number; y: number } | undefined;

const listeners = new AbortController();
const signal = listeners.signal;
canvas.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  canvas.focus();
  pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
  canvas.setPointerCapture(event.pointerId);
}, { signal });
canvas.addEventListener('pointermove', event => {
  if (pointer?.id !== event.pointerId) return;
  yaw += (event.clientX - pointer.x) * .003;
  pitch = Math.max(-1.4, Math.min(1.4, pitch + (pointer.y - event.clientY) * .003));
  pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
}, { signal });
canvas.addEventListener('lostpointercapture', () => { pointer = undefined; }, { signal });
window.addEventListener('keydown', event => {
  if (!directions.has(event.code) || event.ctrlKey || event.metaKey || event.altKey) return;
  keys.add(event.code);
  event.preventDefault();
}, { signal });
window.addEventListener('keyup', event => { keys.delete(event.code); }, { signal });
window.addEventListener('blur', () => { keys.clear(); }, { signal });

function move(e: number, n: number) {
  const height = crystalCaveFloorAt(e, n);
  if (height === undefined || Math.abs(height - feet) > .43 || !crystalCaveCanStand(e, n)) return false;
  [east, north, feet] = [e, n, height];
  return true;
}

const resize = new ResizeObserver(() => {
  camera.aspect = host.clientWidth / Math.max(1, host.clientHeight);
  camera.updateProjectionMatrix();
  renderer.setSize(host.clientWidth, host.clientHeight, false);
});
resize.observe(host);

let previous = performance.now();
renderer.setAnimationLoop(now => {
  const dt = Math.min(.045, Math.max(0, (now - previous) / 1000));
  previous = now;
  yaw += 1.65 * dt * (Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft')));
  const forward = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
  const right = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
  if (forward || right) {
    const stride = 4 * dt / Math.hypot(forward, right);
    const dx = stride * (forward * Math.sin(yaw) + right * Math.cos(yaw));
    const dn = stride * (forward * Math.cos(yaw) - right * Math.sin(yaw));
    if (!move(east + dx, north + dn) && !move(east + dx, north)) move(east, north + dn);
  }
  const y = feet + 1.65;
  camera.position.set(east, y, -north);
  camera.lookAt(east + Math.sin(yaw) * Math.cos(pitch), y + Math.sin(pitch), -north - Math.cos(yaw) * Math.cos(pitch));
  cave.update(now / 1_000);
  const region = crystalCaveRegionAt(east, north)!;
  if (output.value !== zoneNames[region]) output.value = zoneNames[region];
  output.hidden = region === 'dark-passage';
  renderer.render(scene, camera);
  canvas.dataset.east = east.toFixed(3);
  canvas.dataset.north = north.toFixed(3);
  canvas.dataset.footHeight = feet.toFixed(3);
  canvas.dataset.yaw = yaw.toFixed(4);
  canvas.dataset.region = region;
  canvas.dataset.draws = String(renderer.info.render.calls);
  canvas.dataset.triangles = String(renderer.info.render.triangles);
});
window.addEventListener('pagehide', () => {
  listeners.abort();
  resize.disconnect();
  renderer.setAnimationLoop(null);
  cave.dispose();
  renderer.dispose();
}, { once: true });
