import {
  AmbientLight, DirectionalLight, Fog, PerspectiveCamera, Scene, Vector3, WebGLRenderer,
} from 'three';
import { createMainSummitBlock, mainSummitLayout } from './main-summit-block.js';
import { mountC2EastGullyDrop } from './town-night-c2-summit-east-gully-drop.js';

/**
 * C2 east-sector third-round east-gully downstream drop and steps review.
 * Uses the one canonical summit block as the host surface and adds only the
 * new stone dropway. The coarse summit mesh is the real D2-owned geometry,
 * read-only here; the fill lights are review-only and the drop itself adds
 * none.
 */
const scene = new Scene();
scene.name = 'town-night-c2-summit-east-gully-drop-review';
scene.fog = new Fog(0x9fb0c4, 900, 2600);

const block = createMainSummitBlock(mainSummitLayout, 348, 24);
scene.add(block.coarse);
const drop = mountC2EastGullyDrop(block.heightAt);
scene.add(drop.group);

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
  { name: '跌水俯瞰', eye: { e: 810, y: 690, n: 570 }, look: { e: 772, y: 540, n: 560 } },
  { name: '沟底近景', eye: { e: 768, y: 548, n: 552 }, look: { e: 776, y: 542, n: 544 } },
  { name: '护岸侧景', eye: { e: 772, y: 550, n: 578 }, look: { e: 776, y: 544, n: 556 } },
  { name: '跌水潭末端', eye: { e: 798, y: 542, n: 536 }, look: { e: 784, y: 536, n: 532 } },
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
  const sampled = block.heightAt(foot.east, foot.north);
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
    `${drop.stats().pieces} 件 / ${drop.stats().batches} 批 / ${drop.stats().lights} 灯 · ` +
    `draws ${renderer.info.render.calls} · frames ${++frames}`;
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

declare global {
  interface Window {
    __gullyDropReview?: {
      state: () => { view: string; draws: number; pieces: number; errors: readonly string[] };
      setView: (index: number) => void;
    };
  }
}
const errors: string[] = [];
addEventListener('error', e => errors.push(String(e.message)));
window.__gullyDropReview = {
  state: () => ({ view: views[selected]!.name, draws: renderer.info.render.calls,
    pieces: drop.stats().pieces, errors }),
  setView: index => { selected = Math.max(0, Math.min(views.length - 1, index)); },
};
