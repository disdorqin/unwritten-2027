import { AmbientLight, Color, DirectionalLight, Fog, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { createUndergroundWarriorCity } from './underground-warrior-city';
import { createTownPhysicsClock, townPhysicsDelta } from './town-physics-clock';

const city = createUndergroundWarriorCity();
const scene = new Scene();
scene.background = new Color('#212c39');
scene.fog = new Fog('#212c39', 22, 122);
scene.add(city.group, new AmbientLight('#c1d8ee', 1.4));
const keyLight = new DirectionalLight('#dbf1f4', 2.4);
keyLight.position.set(2, 7, 9);
scene.add(keyLight);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio));
document.body.prepend(renderer.domElement);
const camera = new PerspectiveCamera(60, 1, .08, 190);
const positions = {
  street: [1.3, 0, 0], house: [city.houses[0]!.door.east, 5.2, Math.PI / 2],
  market: [126.3, -11.4, 0], wall: [93.4, 13, Math.PI / 2],
} as const;
const controls = [...document.querySelectorAll<HTMLButtonElement>('[data-view]')];
const display = document.querySelector<HTMLOutputElement>('#position')!;
const keys = new Set<string>();
const movement = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowLeft', 'ArrowRight']);
const clock = createTownPhysicsClock();
const walkSpeed = 9.5;
let east = 0, north = 0, feet = 0, yaw = 0, accepted = 0, blocked = 0, maxStep = 0;
let view: keyof typeof positions = 'street';
let frames = 0, previous = performance.now(), animation = 0;

function select(next: keyof typeof positions) {
  view = next;
  [east, north, yaw] = positions[next];
  feet = city.floorHeightAt(east, north)!;
  accepted = blocked = maxStep = 0;
  keys.clear();
  clock.reset();
  for (const button of controls) button.setAttribute('aria-pressed', String(button.dataset.view === view));
}

function update() {
  yaw += (Number(keys.has('ArrowLeft')) - Number(keys.has('ArrowRight'))) * townPhysicsDelta * 1.8;
  const forward = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
  const right = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
  if (!forward && !right) return;
  const length = townPhysicsDelta * walkSpeed / Math.hypot(forward, right);
  const e = east + length * (Math.cos(yaw) * forward + Math.sin(yaw) * right);
  const n = north + length * (Math.sin(yaw) * forward - Math.cos(yaw) * right);
  const y = city.floorHeightAt(e, n);
  if (y === undefined || Math.abs(y - feet) > .43 || !city.isWalkable(e, n)) {
    blocked++;
    return;
  }
  maxStep = Math.max(maxStep, Math.abs(y - feet));
  [east, north, feet] = [e, n, y];
  accepted++;
}

function keyDown(event: KeyboardEvent) {
  if (event.code === 'KeyE' && view === 'wall') yaw = 0;
  if (!movement.has(event.code) || event.ctrlKey || event.metaKey || event.altKey) return;
  event.preventDefault();
  keys.add(event.code);
}

function keyUp(event: KeyboardEvent) { keys.delete(event.code); }
function blur() { keys.clear(); }
function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}

function draw(now: number) {
  clock.advance(Math.min((now - previous) / 1000, .1), update);
  previous = now;
  camera.position.set(east, feet + 1.63, -north);
  camera.lookAt(east + Math.cos(yaw), feet + 1.57, -north - Math.sin(yaw));
  renderer.render(scene, camera);
  frames++;
  display.value = `E ${east.toFixed(2)}  N ${north.toFixed(2)}  Y ${feet.toFixed(2)}`;
  animation = requestAnimationFrame(draw);
}

for (const button of controls) button.onclick = () => select(button.dataset.view as keyof typeof positions);
addEventListener('keydown', keyDown);
addEventListener('keyup', keyUp);
addEventListener('blur', blur);
addEventListener('resize', resize);
addEventListener('pagehide', () => {
  cancelAnimationFrame(animation);
  city.dispose();
  renderer.dispose();
  removeEventListener('keydown', keyDown);
  removeEventListener('keyup', keyUp);
  removeEventListener('blur', blur);
  removeEventListener('resize', resize);
}, { once: true });
Object.defineProperty(window, '__warriorCityReview', { value: () => ({ view, east, north, feet, accepted, blocked, maxStep, frames,
  draws: renderer.info.render.calls, triangles: renderer.info.render.triangles }) });
select('street');
resize();
animation = requestAnimationFrame(draw);
