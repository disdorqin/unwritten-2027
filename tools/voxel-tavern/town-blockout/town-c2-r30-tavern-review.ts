import {
  AmbientLight, Color, DirectionalLight, Fog, PerspectiveCamera, Scene, Vector3, WebGLRenderer,
} from 'three';
import { createWarriorCityShell } from './underground-warrior-city-shell.js';
import { mountTownC2R30Tavern } from './town-c2-r30-tavern.js';

/**
 * C2-R02 local art review only. Renders the existing U10 tavern shell together
 * with the C2 dressing prefab at a certified fixture site. No production mount,
 * no authority, no registration. WASD walk, arrows turn, N toggles the warm pools.
 */
let night = true;
const scene = new Scene();
scene.name = 'c2-r30-tavern-art-review';
const shell = createWarriorCityShell();
scene.add(shell.group);
const tavern = mountTownC2R30Tavern({
  site: { domainId: 'review:c2-r30:tavern', east: 0, north: 0, height: 0, yaw: 0 },
  supportsSite: () => true,
  readNight: () => night,
  readLightBudget: () => (night ? 2 : 0),
});
scene.add(tavern.group);

const ambient = new AmbientLight(0xffffff, .62);
const moon = new DirectionalLight(0xbcd0e8, .35);
moon.position.set(20, 40, 10);
scene.add(ambient, moon);

const camera = new PerspectiveCamera(68, 1, .06, 400);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1);
document.querySelector('#scene')!.append(renderer.domElement);

// Three hand-placed review vantage points: the doorway, the bar and the rear wall.
const views = [
  { name: '门口', east: 125, north: 16.0, yaw: 0 },
  { name: '吧台', east: 125, north: 20.4, yaw: 0 },
  { name: '室内回望', east: 127.2, north: 21.4, yaw: Math.PI },
] as const;
let selected = 0, yaw = views[0]!.yaw;
let foot = { east: views[0]!.east, north: views[0]!.north, height: 0 };
const keys = new Set<string>();
let last = performance.now(), frames = 0, walked = 0;

function lighting() {
  scene.background = new Color(night ? 0x1c2027 : 0x3a4250);
  scene.fog = new Fog(night ? 0x1c2027 : 0x3a4250, 40, 190);
  ambient.intensity = night ? .34 : .78;
  moon.intensity = night ? .22 : .55;
}
function choose(index: number) {
  selected = index;
  const view = views[index]!;
  foot = { east: view.east, north: view.north, height: 0 };
  yaw = view.yaw;
}
addEventListener('keydown', event => {
  if (/^Digit[1-3]$/.test(event.code)) choose(Number(event.code.slice(-1)) - 1);
  else if (event.code === 'KeyN' && !event.repeat) { night = !night; lighting(); }
  else keys.add(event.code);
});
addEventListener('keyup', event => keys.delete(event.code));
addEventListener('blur', () => keys.clear());
function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
choose(0);
lighting();

function render(time: number) {
  const dt = Math.min(.05, (time - last) / 1000);
  last = time;
  frames++;
  if (keys.has('ArrowLeft')) yaw -= dt * 1.8;
  if (keys.has('ArrowRight')) yaw += dt * 1.8;
  const forward = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
  const side = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
  const dx = (Math.sin(yaw) * forward + Math.cos(yaw) * side) * dt * 2.6;
  const dn = (Math.cos(yaw) * forward - Math.sin(yaw) * side) * dt * 2.6;
  const east = foot.east + dx, north = foot.north + dn;
  if (tavern.canStand(east, north)) {
    foot = { ...foot, east, north };
    walked += Math.hypot(dx, dn);
  }
  camera.position.set(foot.east, foot.height + 1.65, -foot.north);
  camera.lookAt(new Vector3(foot.east + Math.sin(yaw), foot.height + 1.65, -foot.north - Math.cos(yaw)));
  renderer.render(scene, camera);
  document.querySelector('#hud')!.textContent =
    `${views[selected]!.name} · ${night ? '暖光夜' : '冷昼'} · ${foot.east.toFixed(2)}/${foot.north.toFixed(2)} · ` +
    `${renderer.info.render.calls} draws · ${tavern.stats().pieceCount} pieces`;
  requestAnimationFrame(render);
}
Object.defineProperty(window, '__tavernReview', {
  value: {
    state: () => ({
      frames, selected, night, foot, yaw, walked,
      draws: renderer.info.render.calls,
      tris: renderer.info.render.triangles,
      pieces: tavern.stats().pieceCount,
      siteCertified: tavern.stats().siteCertified,
      reviewOnly: true,
    }),
  },
});
requestAnimationFrame(render);
