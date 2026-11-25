import {
  AmbientLight, Color, DirectionalLight, Fog, PerspectiveCamera, Scene, Vector3, WebGLRenderer,
} from 'three';
import { createWarriorCityShell } from './underground-warrior-city-shell.js';
import { mountTownC2R30CityVault } from './town-c2-r30-city-vault.js';

/**
 * C2-R06 local art review only. Renders the existing U10 city shell together
 * with the C2 cavern vault, overlook balcony and back-alley band at a
 * certified fixture site. No production mount, no authority, no registration.
 */
const scene = new Scene();
scene.name = 'c2-r30-city-vault-review';
const shell = createWarriorCityShell();
scene.add(shell.group);
const vault = mountTownC2R30CityVault({
  site: { domainId: 'review:c2-r30:vault', east: 0, north: 0, height: 0, yaw: 0 },
  supportsSite: () => true,
});
scene.add(vault.group);

const ambient = new AmbientLight(0xffffff, .6);
const moon = new DirectionalLight(0xbcd0e8, .3);
moon.position.set(20, 40, 10);
scene.add(ambient, moon);

const camera = new PerspectiveCamera(68, 1, .06, 400);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1);
document.querySelector('#scene')!.append(renderer.domElement);

// Review vantage points: the shared overlook foot, the street looking up at
// the vault, and the back-alley silhouette from the street.
const views = [
  { name: '远眺崖台', east: 147, north: 23.4, height: 7.12, yaw: Math.PI, pitch: -.12 },
  { name: '街面仰望', east: 125, north: 0, height: 0, yaw: Math.PI, pitch: .48 },
  { name: '后巷层景', east: 76, north: -10.5, height: 0, yaw: -1.5708, pitch: .12 },
] as const;
let selected = 0, yaw = views[0]!.yaw, pitch = views[0]!.pitch;
let foot = { east: views[0]!.east, north: views[0]!.north, height: views[0]!.height };
const keys = new Set<string>();
let last = performance.now(), frames = 0, walked = 0;

function lighting() {
  scene.background = new Color(0x1b2026);
  scene.fog = new Fog(0x1b2026, 40, 200);
  ambient.intensity = .6;
  moon.intensity = .3;
}
function choose(index: number) {
  selected = index;
  const view = views[index]!;
  foot = { east: view.east, north: view.north, height: view.height };
  yaw = view.yaw;
  pitch = view.pitch;
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
  if (keys.has('ArrowUp')) pitch = Math.min(1.2, pitch + dt * .8);
  if (keys.has('ArrowDown')) pitch = Math.max(-1.2, pitch - dt * .8);
  const forward = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
  const side = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
  const dx = (Math.sin(yaw) * forward + Math.cos(yaw) * side) * dt * 2.6;
  const dn = (Math.cos(yaw) * forward - Math.sin(yaw) * side) * dt * 2.6;
  const east = foot.east + dx, north = foot.north + dn;
  if (vault.canStand(east, north, foot.height)) {
    foot = { ...foot, east, north };
    walked += Math.hypot(dx, dn);
  }
  const eye = foot.height + 1.65;
  camera.position.set(foot.east, eye, -foot.north);
  camera.lookAt(new Vector3(
    foot.east + Math.sin(yaw) * Math.cos(pitch),
    eye + Math.sin(pitch),
    -foot.north - Math.cos(yaw) * Math.cos(pitch),
  ));
  renderer.render(scene, camera);
  document.querySelector('#hud')!.textContent =
    `${views[selected]!.name} · ${foot.east.toFixed(2)}/${foot.north.toFixed(2)}/` +
    `${foot.height.toFixed(2)} · ${renderer.info.render.calls} draws · ` +
    `${vault.stats().pieceCount} pieces`;
  requestAnimationFrame(render);
}
Object.defineProperty(window, '__vaultReview', {
  value: {
    state: () => ({
      frames, selected, foot, yaw, pitch, walked,
      draws: renderer.info.render.calls,
      tris: renderer.info.render.triangles,
      pieces: vault.stats().pieceCount,
      siteCertified: vault.stats().siteCertified,
      realLights: vault.stats().realLightCount,
      reviewOnly: true,
    }),
  },
});
requestAnimationFrame(render);
