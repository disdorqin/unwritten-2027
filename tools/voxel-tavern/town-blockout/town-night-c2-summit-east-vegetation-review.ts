import {
  AmbientLight, DirectionalLight, Fog, PerspectiveCamera, Scene, Vector3, WebGLRenderer,
} from 'three';
import { createC2EastCanonicalGround } from './town-night-c2-summit-canonical.js';
import { createTownD2R30Massif } from './town-d2-r30-massif.js';
import { mountC2EastLandform } from './town-night-c2-summit-east-landform.js';
import { mountC2EastCamp } from './town-night-c2-summit-east-camp.js';
import { mountC2EastVegetation } from './town-night-c2-summit-east-vegetation.js';

/**
 * C2 east-sector first-round landform review. Uses the one canonical summit
 * mesh, seated on its 8 m faces, as the host surface and adds only the new east landform. The coarse
 * summit mesh is the real D2-owned geometry, read-only here; the fill lights
 * are review-only and the landform itself adds none.
 */
const scene = new Scene();
scene.name = 'town-night-c2-summit-east-vegetation-review';
scene.fog = new Fog(0x9fb0c4, 900, 2600);

const ground = createC2EastCanonicalGround();
const massif = createTownD2R30Massif();
scene.add(massif.group);
const landform = mountC2EastLandform(ground.heightAt);
scene.add(landform.group);
const camp = mountC2EastCamp(ground.heightAt);
scene.add(camp.group);
const vegetation = mountC2EastVegetation(ground.heightAt);
scene.add(vegetation.group);

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

// (east, height, -north) is the three.js position. Each view is an explicit
// camera station plus a look-at point inside the piece group, so the reviewer
// sees the landform instead of standing inside the mountain shell.
const views = [
  { name: '东次峰俯瞰', eye: { e: 340, y: 900, n: 810 }, look: { e: 590, y: 596, n: 1060 } },
  { name: '背风营地俯瞰', eye: { e: 640, y: 620, n: 710 }, look: { e: 742, y: 466, n: 802 } },
  { name: '营地近景', eye: { e: 742, y: 480, n: 760 }, look: { e: 742, y: 468, n: 805 } },
  { name: '山脊石阶', eye: { e: 300, y: 820, n: 1140 }, look: { e: 430, y: 570, n: 1020 } },
  { name: '东南接缝', eye: { e: 240, y: 520, n: 360 }, look: { e: 380, y: 350, n: 560 } },
] as const;
let selected = 0;
let yaw = 0, pitch = 0;
let foot = { east: views[0]!.eye.e, north: views[0]!.eye.n, height: views[0]!.eye.y };
const keys = new Set<string>();
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

const forward = new Vector3(), target = new Vector3();
function frame(now: number) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  const speed = 90;
  if (keys.has('w')) { foot.east += Math.sin(yaw) * speed * dt; foot.north += Math.cos(yaw) * speed * dt; }
  if (keys.has('s')) { foot.east -= Math.sin(yaw) * speed * dt; foot.north -= Math.cos(yaw) * speed * dt; }
  if (keys.has('d')) { foot.east += Math.cos(yaw) * speed * dt; foot.north -= Math.sin(yaw) * speed * dt; }
  if (keys.has('a')) { foot.east -= Math.cos(yaw) * speed * dt; foot.north += Math.sin(yaw) * speed * dt; }
  if (keys.has('ArrowLeft')) yaw -= dt * 1.1;
  if (keys.has('ArrowRight')) yaw += dt * 1.1;
  if (keys.has('ArrowUp')) pitch = Math.min(1.2, pitch + dt * .8);
  if (keys.has('ArrowDown')) pitch = Math.max(-1.2, pitch - dt * .8);
  const sampled = ground.heightAt(foot.east, foot.north);
  // A station remains a fixed camera until the reviewer actually walks.
  if (keys.size === 0) {
    const v = views[selected]!;
    foot = { east: v.eye.e, north: v.eye.n, height: v.eye.y };
    camera.position.set(v.eye.e, v.eye.y, -v.eye.n);
    target.set(v.look.e, v.look.y, -v.look.n);
    camera.lookAt(target);
  } else {
    const eye = Math.max(foot.height, sampled ?? foot.height) + 2.2;
    camera.position.set(foot.east, eye, -foot.north);
    forward.set(Math.sin(yaw), Math.tan(pitch), -Math.cos(yaw)).normalize();
    target.copy(camera.position).addScaledVector(forward, 100);
    camera.lookAt(target);
  }
  const hud = document.querySelector('#hud')!;
  hud.textContent = `${views[selected]!.name} · E${foot.east.toFixed(0)} N${foot.north.toFixed(0)} · ` +
    `${landform.stats().pieces} 件 / ${landform.stats().batches} 批 / ${landform.stats().lights} 灯 · ` +
    `draws ${renderer.info.render.calls} · frames ${++frames}`;
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

declare global {
  interface Window {
    __eastReview?: {
      state: () => { view: string; draws: number; pieces: number; errors: readonly string[] };
      setView: (index: number) => void;
    };
  }
}
const errors: string[] = [];
addEventListener('error', e => errors.push(String(e.message)));
window.__eastReview = {
  state: () => ({ view: views[selected]!.name, draws: renderer.info.render.calls,
    pieces: landform.stats().pieces + camp.stats().pieces + vegetation.stats().pieces, errors }),
  setView: index => { selected = Math.max(0, Math.min(views.length - 1, index)); },
};
