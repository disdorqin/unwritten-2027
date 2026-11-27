import {
  AmbientLight, Color, DirectionalLight, Fog, PerspectiveCamera, Scene, Vector3, WebGLRenderer,
} from 'three';
import { createWarriorCityShell } from './underground-warrior-city-shell.js';
import { mountTownC2R30RoosterStarStone } from './town-c2-r30-rooster-star-stone.js';

/**
 * C2-R05 local art review only. Renders the existing U10 city shell together
 * with the C2 rooster star-stone court at a certified fixture site. No
 * production mount, no authority, no registration.
 */
const scene = new Scene();
scene.name = 'c2-r30-rooster-star-stone-review';
const shell = createWarriorCityShell();
scene.add(shell.group);
const court = mountTownC2R30RoosterStarStone({
  site: { domainId: 'review:c2-r30:rooster', east: 0, north: 0, height: 0, yaw: 0 },
  supportsSite: () => true,
});
scene.add(court.group);

const ambient = new AmbientLight(0xffffff, .58);
const moon = new DirectionalLight(0xbcd0e8, .3);
moon.position.set(20, 40, 10);
scene.add(ambient, moon);

const camera = new PerspectiveCamera(68, 1, .06, 400);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1);
document.querySelector('#scene')!.append(renderer.domElement);

// Three hand-placed review vantage points: the zodiac standing foot, the
// cold-flame court and the street approach.
const views = [
  { name: '星石正面', east: 98, north: -3.5, yaw: Math.PI },
  { name: '冷焰街心', east: 96.4, north: -9.6, yaw: 1.57 },
  { name: '石阶接近', east: 99.4, north: -4.2, yaw: 3.73 },
] as const;
let selected = 0, yaw = views[0]!.yaw;
let foot = { east: views[0]!.east, north: views[0]!.north, height: 0 };
const keys = new Set<string>();
let last = performance.now(), frames = 0, walked = 0;

function lighting() {
  scene.background = new Color(0x1b2026);
  scene.fog = new Fog(0x1b2026, 30, 170);
  ambient.intensity = .6;
  moon.intensity = .3;
}
function choose(index: number) {
  selected = index;
  const view = views[index]!;
  foot = { east: view.east, north: view.north, height: 0 };
  yaw = view.yaw;
}
addEventListener('keydown', event => {
  if (/^Digit[1-3]$/.test(event.code)) choose(Number(event.code.slice(-1)) - 1);
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
  if (court.canStand(east, north)) {
    foot = { ...foot, east, north };
    walked += Math.hypot(dx, dn);
  }
  camera.position.set(foot.east, foot.height + 1.65, -foot.north);
  camera.lookAt(new Vector3(foot.east + Math.sin(yaw), foot.height + 1.65, -foot.north - Math.cos(yaw)));
  renderer.render(scene, camera);
  document.querySelector('#hud')!.textContent =
    `${views[selected]!.name} · ${foot.east.toFixed(2)}/${foot.north.toFixed(2)} · ` +
    `${renderer.info.render.calls} draws · ${court.stats().pieceCount} pieces`;
  requestAnimationFrame(render);
}
Object.defineProperty(window, '__roosterReview', {
  value: {
    state: () => ({
      frames, selected, foot, yaw, walked,
      draws: renderer.info.render.calls,
      tris: renderer.info.render.triangles,
      pieces: court.stats().pieceCount,
      siteCertified: court.stats().siteCertified,
      realLights: court.stats().realLightCount,
      reviewOnly: true,
    }),
  },
});
requestAnimationFrame(render);
