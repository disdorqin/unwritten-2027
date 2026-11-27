import {
  AmbientLight, DirectionalLight, Fog, PerspectiveCamera, Scene, Vector3, WebGLRenderer,
} from 'three';
import { createMainSummitBlock, mainSummitLayout } from './main-summit-block.js';
import { mountC2EastLandform } from './town-night-c2-summit-east-landform.js';
import { mountC2EastBench } from './town-night-c2-summit-east-bench.js';

/** C2 east-sector hairpin bench review. Host is the one canonical D2 summit
 * block; the 8 m shell matches the sampler that seats every bench piece. */
const scene = new Scene();
scene.name = 'town-night-c2-summit-east-bench-review';
scene.fog = new Fog(0x9fb0c4, 900, 2600);

const block = createMainSummitBlock(mainSummitLayout, 348, 8);
scene.add(block.coarse);
const landform = mountC2EastLandform(block.heightAt);
scene.add(landform.group);
const bench = mountC2EastBench(block.heightAt);
scene.add(bench.group);

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
  { name: '发卡弯石凳俯瞰', eye: { e: 392, y: 770, n: 948 }, look: { e: 454, y: 628, n: 1037 } },
  { name: '石凳开口近景', eye: { e: 454, y: 648, n: 962 }, look: { e: 454, y: 632, n: 1036 } },
  { name: '背墙与弧形木凳', eye: { e: 398, y: 748, n: 1076 }, look: { e: 452, y: 632, n: 1040 } },
  { name: '山脊石阶关系', eye: { e: 556, y: 760, n: 1112 }, look: { e: 452, y: 630, n: 1032 } },
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
    const sampled = block.heightAt(foot.east, foot.north);
    const eye = Math.max(foot.height, sampled ?? foot.height) + 2.2;
    camera.position.set(foot.east, eye, -foot.north);
    forward.set(Math.sin(yaw), Math.tan(pitch), -Math.cos(yaw)).normalize();
    target.copy(camera.position).addScaledVector(forward, 100);
    camera.lookAt(target);
  }
  const hud = document.querySelector('#hud')!;
  hud.textContent = `${views[selected]!.name} · E${foot.east.toFixed(0)} N${foot.north.toFixed(0)} · ` +
    `${bench.stats().pieces} 件 / ${bench.stats().batches} 批 / ${bench.stats().lights} 灯 · ` +
    `draws ${renderer.info.render.calls} · frames ${++frames}`;
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

declare global {
  interface Window {
    __benchReview?: {
      state: () => { view: string; draws: number; pieces: number; errors: readonly string[] };
      setView: (index: number) => void;
    };
  }
}
const errors: string[] = [];
addEventListener('error', e => errors.push(String(e.message)));
window.__benchReview = {
  state: () => ({ view: views[selected]!.name, draws: renderer.info.render.calls,
    pieces: bench.stats().pieces, errors }),
  setView: index => { selected = Math.max(0, Math.min(views.length - 1, index)); },
};
