import {
  AmbientLight, Color, DirectionalLight, Fog, PerspectiveCamera, Scene, Vector3, WebGLRenderer,
} from 'three';
import { createSecondMineScene } from './underground-second-mine.js';
import { buildTownC2SecondMineBypassWall } from './town-c2-second-mine-bypass-wall.js';
import { buildC2SecondMineLightSources } from './town-c2-second-mine-light-sources.js';
import { mountTownC2R30RiverTerrace } from './town-c2-r30-river-terrace.js';
import type { MineRiverState } from '../../../src/shared/underground-second-mine-layout.js';

/**
 * C2-R07 local art review only. Renders the existing -140 second mine
 * together with the C2 bypass walls, lamp fixtures and the new water terrace
 * at a certified review site. No production mount, no authority, no
 * registration: the shared hydrology is only borrowed so the review shows the
 * three real water levels side by side.
 */
const scene = new Scene();
scene.name = 'c2-r30-river-terrace-review';

const mine = createSecondMineScene();
scene.add(mine.group);
const wall = buildTownC2SecondMineBypassWall();
scene.add(wall.group);
const lamps = buildC2SecondMineLightSources();
scene.add(lamps.group);

const terrace = mountTownC2R30RiverTerrace({
  site: { domainId: 'review:c2-r30:river-terrace', east: 0, north: 0, height: 0, yaw: 0 },
  supportsSite: () => true,
  readWaterState: () => mine.riverState,
});
scene.add(terrace.group);

const ambient = new AmbientLight(0xffffff, .52);
const moon = new DirectionalLight(0xbcd0e8, .26);
moon.position.set(20, 40, 10);
scene.add(ambient, moon);

const camera = new PerspectiveCamera(68, 1, .06, 400);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1);
document.querySelector('#scene')!.append(renderer.domElement);

// Review vantage points, in the shared -140 local frame (x=east, z=-north).
const views = [
  { name: '阶地俯瞰', east: -26, north: 121.5, height: 3.6, yaw: .12, pitch: -.38 },
  { name: '北岸水痕', east: 22, north: 138.5, height: -.24, yaw: .25, pitch: -.14 },
  { name: '南岸活线', east: -14, north: 134, height: -.24, yaw: Math.PI, pitch: -.1 },
  { name: '干绕道导引', east: 51.6, north: 112.2, height: 0, yaw: 0, pitch: -.03 },
] as const;
let selected = 0, yaw = views[0]!.yaw, pitch = views[0]!.pitch;
let foot = { east: views[0]!.east, north: views[0]!.north, height: views[0]!.height };
const keys = new Set<string>();
let last = performance.now(), frames = 0, walked = 0;

function lighting() {
  scene.background = new Color(0x1b2026);
  scene.fog = new Fog(0x1b2026, 40, 200);
  ambient.intensity = .52;
  moon.intensity = .26;
}
function choose(index: number) {
  selected = index;
  const view = views[index]!;
  foot = { east: view.east, north: view.north, height: view.height };
  yaw = view.yaw;
  pitch = view.pitch;
}
function setWater(state: MineRiverState) {
  mine.setRiverState(state);
  terrace.setWaterState(state);
}
addEventListener('keydown', event => {
  if (/^Digit[1-4]$/.test(event.code)) choose(Number(event.code.slice(-1)) - 1);
  else if (event.code === 'KeyL') setWater('low');
  else if (event.code === 'KeyM') setWater('middle');
  else if (event.code === 'KeyH') setWater('high');
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
  // The mine owns the ground; the terrace only adds its own markers.
  if (mine.canStand(east, north) && terrace.canStand(east, north, foot.height)) {
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
    `${terrace.stats().pieceCount} 件 · 水位 ${terrace.stats().waterState}`;
  requestAnimationFrame(render);
}
Object.defineProperty(window, '__terraceReview', {
  value: {
    state: () => ({
      frames, selected, foot, yaw, pitch, walked,
      draws: renderer.info.render.calls,
      tris: renderer.info.render.triangles,
      pieces: terrace.stats().pieceCount,
      batches: terrace.stats().drawBatchCount,
      waterState: terrace.stats().waterState,
      waterLevel: terrace.stats().waterLevel,
      siteCertified: terrace.stats().siteCertified,
      realLights: terrace.stats().realLightCount,
      reviewOnly: true,
    }),
    setWater,
  },
});
requestAnimationFrame(render);
