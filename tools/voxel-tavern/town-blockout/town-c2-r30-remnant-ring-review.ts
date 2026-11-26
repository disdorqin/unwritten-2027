import {
  AmbientLight, BoxGeometry, Color, CylinderGeometry, DirectionalLight, Fog,
  Mesh, MeshLambertMaterial, PerspectiveCamera, Scene, Vector3, WebGLRenderer,
} from 'three';
import { mountUndergroundPalaceDressing } from './underground-palace-dressing.js';
import { mountTownC2R30RemnantRing } from './town-c2-r30-remnant-ring.js';

/**
 * C2-R08 local art review only. Renders the existing Window D palace dressing
 * together with the new remnant ring and its inscription band, so the ring can
 * be judged in the forecourt it closes. The palace shell itself is not in this
 * lane, so a plain floor stands in; the fill lights are review-only and the
 * module adds none.
 */
const scene = new Scene();
scene.name = 'c2-r30-remnant-ring-review';

const FLOOR = -2.4;
// Stand-in floor: the shell owns the real one, this only gives the court a
// surface to read against.
const ground = new Mesh(
  new CylinderGeometry(27, 27, .3, 40),
  new MeshLambertMaterial({ color: 0x4a4a4e }),
);
ground.position.set(0, FLOOR - .15, -126);
scene.add(ground);

const dressing = mountUndergroundPalaceDressing(scene, false);
scene.add(dressing.group);

const ring = mountTownC2R30RemnantRing({
  site: { domainId: 'review:c2-r30:remnant-ring', east: 0, north: 0, height: FLOOR, yaw: 0 },
  supportsSite: () => true,
});
scene.add(ring.group);

const ambient = new AmbientLight(0xffffff, .46);
const moon = new DirectionalLight(0xbcd0e8, .3);
moon.position.set(-30, 40, -90);
scene.add(ambient, moon);
// Review-only fill: two warm pools so the court reads at night.
const fill = new DirectionalLight(0xffb277, .34);
fill.position.set(0, 14, -118);
scene.add(fill);

const camera = new PerspectiveCamera(68, 1, .06, 400);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1);
document.querySelector('#scene')!.append(renderer.domElement);

const views = [
  { name: '外环全景', east: 0, north: 97.5, height: FLOOR, yaw: 0, pitch: .04 },
  { name: '铭文特写', east: 17.1, north: 113.6, height: FLOOR, yaw: 0, pitch: .12 },
  { name: '断环缺口', east: 3.5, north: 101.5, height: FLOOR, yaw: .2, pitch: .02 },
  { name: '门轴正视', east: 0, north: 112, height: FLOOR, yaw: 0, pitch: .06 },
] as const;
let selected = 0, yaw = views[0]!.yaw, pitch = views[0]!.pitch;
let foot = { east: views[0]!.east, north: views[0]!.north, height: views[0]!.height };
const keys = new Set<string>();
let last = performance.now(), frames = 0, walked = 0;

function lighting() {
  scene.background = new Color(0x1a1e24);
  scene.fog = new Fog(0x1a1e24, 30, 150);
  ambient.intensity = .46;
  moon.intensity = .3;
  fill.intensity = .34;
}
function choose(index: number) {
  selected = index;
  const view = views[index]!;
  foot = { east: view.east, north: view.north, height: view.height };
  yaw = view.yaw;
  pitch = view.pitch;
}
addEventListener('keydown', event => {
  if (/^Digit[1-4]$/.test(event.code)) choose(Number(event.code.slice(-1)) - 1);
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
  if (ring.canStand(east, north, foot.height)) {
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
    `${views[selected]!.name} · ${foot.east.toFixed(2)}/${foot.north.toFixed(2)} · ` +
    `${renderer.info.render.calls} draws · ${ring.stats().pieceCount} 件`;
  requestAnimationFrame(render);
}
Object.defineProperty(window, '__ringReview', {
  value: {
    state: () => ({
      frames, selected, foot, yaw, pitch, walked,
      draws: renderer.info.render.calls,
      tris: renderer.info.render.triangles,
      pieces: ring.stats().pieceCount,
      batches: ring.stats().drawBatchCount,
      dressingPieces: dressing.visualPieceCount,
      siteCertified: ring.stats().siteCertified,
      realLights: ring.stats().realLightCount,
      reviewOnly: true,
    }),
  },
});
requestAnimationFrame(render);
