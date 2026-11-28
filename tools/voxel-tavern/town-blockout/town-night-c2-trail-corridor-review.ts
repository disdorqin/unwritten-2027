import {
  AmbientLight, BufferGeometry, Color, DirectionalLight, Float32BufferAttribute,
  Fog, Line, LineBasicMaterial, PerspectiveCamera, Scene, Vector3, WebGLRenderer,
} from 'three';
import { createC2EastCanonicalGround } from './town-night-c2-summit-canonical.js';
import { createTownD2R30Massif } from './town-d2-r30-massif.js';
import { mountC2EastLandform } from './town-night-c2-summit-east-landform.js';
import { mountC2EastSwitchback } from './town-night-c2-summit-east-switchback.js';
import { mountC2EastTrail } from './town-night-c2-summit-east-trail.js';
import { c2EastWalkingStations } from './town-night-c2-trail-corridor.js';

/** C33-2 visual audit: the 1692 walking stations vs the east-sector solids.
 * Review scene only, not a production mount. The cyan line is the actual
 * physical trail centreline the player walks, including the clipped chord. */
const scene = new Scene();
scene.name = 'town-night-c2-trail-corridor-review';
scene.fog = new Fog(0x9fb0c4, 900, 3000);

const ground = createC2EastCanonicalGround();
const massif = createTownD2R30Massif();
const landform = mountC2EastLandform(ground.heightAt);
const switchback = mountC2EastSwitchback(ground.heightAt);
const stations = c2EastWalkingStations();
const trail = mountC2EastTrail(ground.heightAt, stations);
scene.add(massif.group, landform.group, switchback.group, trail.group);

const points: number[] = [];
for (const p of stations) points.push(p.east, p.height + 1.4, -p.north);
const lineGeometry = new BufferGeometry();
lineGeometry.setAttribute('position', new Float32BufferAttribute(points, 3));
const line = new Line(lineGeometry, new LineBasicMaterial({ color: new Color('#31f7ff') }));
line.name = 'c2-walking-centreline';
scene.add(line);

let blockedStations = 0;
for (const p of stations) {
  if (landform.blocked(p.east, p.north, p.height + .05) ||
      switchback.blocked(p.east, p.north, p.height + .05)) blockedStations++;
}

scene.add(new AmbientLight(0xffffff, .62));
const sun = new DirectionalLight(0xffd0a0, .9);
sun.position.set(900, 1400, -600);
scene.add(sun);
const cold = new DirectionalLight(0xa9c4e0, .35);
cold.position.set(-400, 700, -1200);
scene.add(cold);

const camera = new PerspectiveCamera(68, 1, .5, 4200);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1);
document.querySelector('#scene')!.append(renderer.domElement);

const views = [
  { name: '被裁剪的 356.9m 弦 · E509/N526', eye: { e: 570, y: 690, n: 462 }, look: { e: 509, y: 500, n: 526 } },
  { name: '东坡折返与护栏', eye: { e: 800, y: 850, n: 520 }, look: { e: 520, y: 520, n: 720 } },
  { name: '东区步行线全景', eye: { e: 1000, y: 1200, n: 380 }, look: { e: 540, y: 600, n: 760 } },
  { name: '地表近景 · 步道与石砌', eye: { e: 470, y: 585, n: 455 }, look: { e: 509, y: 502, n: 526 } },
] as const;
let selected = 0;
const keys = new Set<string>();
let foot = { east: views[0]!.eye.e, north: views[0]!.eye.n, height: views[0]!.eye.y };
let last = performance.now(), frames = 0;
addEventListener('keydown', e => {
  if (e.key >= '1' && e.key <= '4') {
    selected = Number(e.key) - 1;
    const v = views[selected]!;
    foot = { east: v.eye.e, north: v.eye.n, height: v.eye.y };
  }
  keys.add(e.key);
});
addEventListener('keyup', e => keys.delete(e.key));
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setSize(innerWidth, innerHeight);
camera.aspect = innerWidth / innerHeight;
camera.updateProjectionMatrix();

const target = new Vector3();
function frame(now: number) {
  if (keys.size === 0) {
    const v = views[selected]!;
    camera.position.set(v.eye.e, v.eye.y, -v.eye.n);
    target.set(v.look.e, v.look.y, -v.look.n);
    camera.lookAt(target);
  }
  document.querySelector('#hud')!.textContent =
    `${views[selected]!.name} · ${stations.length} 站 / 堵塞 ${blockedStations} · ` +
    `landform ${landform.stats().pieces} / switchback ${switchback.stats().pieces} 件 · ` +
    `draws ${renderer.info.render.calls} · frames ${++frames}`;
  renderer.render(scene, camera);
  last = now;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

declare global {
  interface Window {
    __c2CorridorReview?: {
      state: () => { view: string; draws: number; stations: number; blocked: number; errors: readonly string[] };
      setView: (index: number) => void;
    };
  }
}
const errors: string[] = [];
addEventListener('error', e => errors.push(String(e.message)));
window.__c2CorridorReview = {
  state: () => ({ view: views[selected]!.name, draws: renderer.info.render.calls,
    stations: stations.length, blocked: blockedStations, errors }),
  setView: index => { selected = Math.max(0, Math.min(views.length - 1, index)); },
};
