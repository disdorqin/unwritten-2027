import { AmbientLight, Color, DirectionalLight, Fog, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import { createWarriorCityShell } from './underground-warrior-city-shell.js';
import { mountTownC2R30Domestic } from './town-c2-r30-warrior-domestic.js';

/** C2-R02 domestic narrative art review only, not a production mount. */
const scene = new Scene();
scene.name = 'c2-r30-domestic-art-review';
const shell = createWarriorCityShell();
scene.add(shell.group);
const domestic = mountTownC2R30Domestic({
  site: { domainId: 'review:c2-r30:domestic', east: 0, north: 0, height: 0, yaw: 0 },
  supportsSite: () => true,
});
scene.add(domestic.group);

scene.add(new AmbientLight(0xffffff, .7));
const moon = new DirectionalLight(0xbcd0e8, .4);
moon.position.set(20, 40, 10);
scene.add(moon);

const camera = new PerspectiveCamera(64, 1, .06, 400);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1);
document.querySelector('#scene')!.append(renderer.domElement);

// Three interior vantage points, one per household story.
const views = [
  { name: '02 餐桌双筷', east: 38.15, north: 14.4, height: 1.0 },
  { name: '05 童鞋与冷炉', east: 62.9, north: 15.2, height: .8 },
  { name: '08 未织完的布', east: 38.05, north: -10.6, height: 1.2 },
] as const;
let selected = 0;
const keys = new Set<string>();
let last = performance.now(), frames = 0;
function choose(index: number) {
  selected = index;
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
scene.background = new Color(0x242b33);
scene.fog = new Fog(0x242b33, 60, 220);

function render(time: number) {
  const dt = Math.min(.05, (time - last) / 1000);
  last = time;
  frames++;
  const view = views[selected]!;
  camera.position.set(view.east, view.height, -view.north);
  camera.lookAt(new Vector3(view.east, .35, -view.north + 2));
  renderer.render(scene, camera);
  document.querySelector('#hud')!.textContent =
    `${view.name} · ${renderer.info.render.calls} draws · ${domestic.stats().pieceCount} domestic pieces`;
  requestAnimationFrame(render);
}
Object.defineProperty(window, '__domesticReview', {
  value: { state: () => ({ frames, selected, draws: renderer.info.render.calls,
    pieces: domestic.stats().pieceCount, siteCertified: domestic.stats().siteCertified, reviewOnly: true }) },
});
requestAnimationFrame(render);
