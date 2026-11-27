import {
  AmbientLight, DirectionalLight, Fog, PerspectiveCamera, Scene, Vector3, WebGLRenderer,
} from 'three';
import { createC2EastCanonicalGround } from './town-night-c2-summit-canonical.js';
import { createTownD2R30Massif } from './town-d2-r30-massif.js';
import { mountC2EastLandform } from './town-night-c2-summit-east-landform.js';
import { mountC2EastCamp } from './town-night-c2-summit-east-camp.js';
import { mountC2EastSled } from './town-night-c2-summit-east-sled.js';

/**
 * C2 east-sector sled-start review. Host surface is the one canonical D2
 * summit mesh, seated on its 8 m faces; only the new east packages are mounted. Fill lights are
 * review-only and the sled package itself adds none.
 */
const scene = new Scene();
scene.name = 'town-night-c2-summit-east-sled-review';
scene.fog = new Fog(0x9fb0c4, 900, 2600);

// 8 m surface matches the sampler used to seat every piece; a 24 m coarse
// shell made the chute appear to float above the visible ground.
const ground = createC2EastCanonicalGround();
const massif = createTownD2R30Massif();
scene.add(massif.group);
const landform = mountC2EastLandform(ground.heightAt);
scene.add(landform.group);
const camp = mountC2EastCamp(ground.heightAt);
scene.add(camp.group);
const sled = mountC2EastSled(ground.heightAt);
scene.add(sled.group);

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
// station plus a look-at inside the piece group, so the reviewer sees the
// sled furniture instead of standing inside the mountain shell.
const views = [
  { name: '起跳台俯瞰', eye: { e: 585, y: 630, n: 982 }, look: { e: 648, y: 524, n: 1041 } },
  { name: '起跳台近景', eye: { e: 648, y: 560, n: 988 }, look: { e: 648, y: 528, n: 1046 } },
  { name: '雪槽下坡', eye: { e: 700, y: 560, n: 1040 }, look: { e: 748, y: 458, n: 900 } },
  { name: '风袋杆与铭文碑', eye: { e: 672, y: 646, n: 1100 }, look: { e: 620, y: 552, n: 1058 } },
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
  if (keys.size === 0) {
    const v = views[selected]!;
    foot = { east: v.eye.e, north: v.eye.n, height: v.eye.y };
    camera.position.set(v.eye.e, v.eye.y, -v.eye.n);
    target.set(v.look.e, v.look.y, -v.look.n);
    camera.lookAt(target);
  } else {
    const sampled = ground.heightAt(foot.east, foot.north);
    const eye = Math.max(foot.height, sampled ?? foot.height) + 2.2;
    camera.position.set(foot.east, eye, -foot.north);
    forward.set(Math.sin(yaw), Math.tan(pitch), -Math.cos(yaw)).normalize();
    target.copy(camera.position).addScaledVector(forward, 100);
    camera.lookAt(target);
  }
  const hud = document.querySelector('#hud')!;
  hud.textContent = `${views[selected]!.name} · E${foot.east.toFixed(0)} N${foot.north.toFixed(0)} · ` +
    `${sled.stats().pieces} 件 / ${sled.stats().batches} 批 / ${sled.stats().lights} 灯 · ` +
    `draws ${renderer.info.render.calls} · frames ${++frames}`;
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

declare global {
  interface Window {
    __sledReview?: {
      state: () => { view: string; draws: number; pieces: number; errors: readonly string[] };
      setView: (index: number) => void;
    };
  }
}
const errors: string[] = [];
addEventListener('error', e => errors.push(String(e.message)));
window.__sledReview = {
  state: () => ({ view: views[selected]!.name, draws: renderer.info.render.calls,
    pieces: sled.stats().pieces, errors }),
  setView: index => { selected = Math.max(0, Math.min(views.length - 1, index)); },
};
