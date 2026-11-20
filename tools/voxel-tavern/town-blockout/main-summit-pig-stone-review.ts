import { Color, DirectionalLight, HemisphereLight, Mesh, MeshLambertMaterial, PerspectiveCamera,
  PlaneGeometry, Scene, WebGLRenderer } from 'three';
import { createZodiacStarStones } from '../../../src/shared/zodiac-star-stones';
import { createMainSummitBlock, mainSummitLayout } from './main-summit-block';
import { registerMainSummitPigStone } from './main-summit-pig-stone';
import { createMainSummitRegistrationLandmarks, mountMainSummitRegistration } from './main-summit-registration';
import { nearestTownActivity } from './town-activity';
import { createZodiacStarStoneActivity } from './zodiac-star-stone-activity';

const scene = new Scene();
scene.background = new Color('#c9d7df');
scene.add(new HemisphereLight('#fff9eb', '#4d505c', 2));
const sun = new DirectionalLight('#f6e6c6', 1.8);
sun.position.set(90, 832, -986);
scene.add(sun);
const floor = new Mesh(new PlaneGeometry(70, 50), new MeshLambertMaterial({ color: '#edf1eb' }));
floor.rotation.x = -Math.PI / 2;
floor.position.set(50, 799.995, -1000);
scene.add(floor);
const terrain = createMainSummitBlock(mainSummitLayout, 347, 100);
const landmarks = createMainSummitRegistrationLandmarks();
const hut = mountMainSummitRegistration(scene, landmarks);
const area = 'summit-pickup-preview';
const site = registerMainSummitPigStone(point => ({ ...point, layer: area }));
const model = createZodiacStarStones({ origins: { pig: site.origin } });
let at = { ...landmarks.summit.entry };
let steps = 0;
let rejectedSteps = 0;
let yaw = 0;

const mount = document.querySelector<HTMLElement>('#pig-review')!;
const status = document.querySelector<HTMLOutputElement>('#pig-status')!;
const camera = new PerspectiveCamera(62, 1, .05, 120);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.4));
mount.append(renderer.domElement);

const activity = createZodiacStarStoneActivity(scene, {
  range: 1.1,
  serverNow: () => Math.floor(performance.now()),
  submit(request) {
    if (request.kind !== 'pickup' || request.stoneId !== site.id ||
        Math.hypot(at.east - site.origin.east, at.north - site.origin.north) > 1.1) return;
    if (model.pickup(site.id, request.revision, 1, Math.floor(performance.now()), { ...at, layer: area })) sync();
  },
});

function sync() {
  const stone = model.snapshot(Math.floor(performance.now())).find(entry => entry.id === site.id)!;
  const held = stone.phase === 'carried';
  activity.sync({ area, progress: { ringCount: 0, stones: [{
    id: site.id, revision: stone.revision, phase: held ? 'held' : 'origin', origin: { ...site.origin, area },
  }] }, carriedStones: held ? [{ id: site.id, revision: stone.revision }] : [] });
  status.value = held ? '已拾取 · 空座留在原处' : '星石在座';
}
sync();

const keys = new Set<string>();
const controller = new AbortController();
const watched = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'ArrowLeft', 'ArrowRight']);
const listeners = { signal: controller.signal };
window.addEventListener('keydown', event => {
  if (!watched.has(event.code)) return;
  event.preventDefault();
  keys.add(event.code);
  if (event.code === 'KeyE' && !event.repeat) nearestTownActivity(activity.spots, at.east, at.north, at.height)?.run();
}, listeners);
window.addEventListener('keyup', event => keys.delete(event.code), listeners);
window.addEventListener('blur', () => keys.clear(), listeners);
function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
window.addEventListener('resize', resize, listeners);
resize();

let lastTime = performance.now();
renderer.setAnimationLoop(time => {
  const dt = Math.min(Math.max(0, (time - lastTime) / 1000), .032);
  lastTime = time;
  yaw += (Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft'))) * 1.8 * dt;
  const north = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
  const east = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
  if (north || east) {
    const speed = 3.25 * dt / Math.hypot(east, north);
    const x = at.east + east * speed, n = at.north + north * speed;
    const blocked = hut.colliders.some(({ min, max }) => max[1] > at.height && min[1] < at.height + 1.8 &&
      Math.hypot(Math.max(min[0] - x, x - max[0], 0), Math.max(min[2] + n, -n - max[2], 0)) < .27);
    if (!blocked && terrain.heightAt(x, n) === at.height) { at = { east: x, north: n, height: at.height }; steps++; }
    else rejectedSteps++;
  }
  camera.position.set(at.east, at.height + 1.65, -at.north);
  camera.lookAt(at.east + Math.sin(yaw), at.height + 1.3, -at.north - Math.cos(yaw));
  renderer.render(scene, camera);
  Object.assign(mount.dataset, { ...at, steps, rejectedSteps, held: model.hasHeld(1),
    occupied: Boolean(scene.getObjectByName('star-stone-occupied-seat')),
    empty: Boolean(scene.getObjectByName('star-stone-empty-seat')) });
});

window.addEventListener('pagehide', () => {
  controller.abort();
  renderer.setAnimationLoop(null);
  activity.dispose();
  hut.dispose();
  terrain.dispose();
  floor.geometry.dispose();
  floor.material.dispose();
  renderer.dispose();
}, { once: true });
