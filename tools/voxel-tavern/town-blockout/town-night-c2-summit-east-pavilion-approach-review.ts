import {
  AmbientLight, DirectionalLight, Fog, PerspectiveCamera, Scene, Vector3, WebGLRenderer,
} from 'three';
import { createC2EastCanonicalGround } from './town-night-c2-summit-canonical.js';
import { createTownD2R30Massif } from './town-d2-r30-massif.js';
import { mountC2SummitEastPavilionApproach } from './town-night-c2-summit-east-pavilion-approach.js';

/**
 * C2 east-sector cloud-pavilion approach review. Uses the one canonical
 * summit mesh, seated on its 8 m faces, as the host surface and adds only the new pavilion approach
 * landform. The coarse summit mesh is the real D2-owned geometry, read-only
 * here; the fill lights are review-only and the approach itself adds none.
 */
const scene = new Scene();
scene.name = 'town-night-c2-summit-east-pavilion-approach-review';
scene.fog = new Fog(0x9fb0c4, 900, 2600);

const ground = createC2EastCanonicalGround();
const massif = createTownD2R30Massif();
scene.add(massif.group);
const approach = mountC2SummitEastPavilionApproach(ground.heightAt);
scene.add(approach.group);

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
  { name: '观云亭地貌俯瞰', eye: { e: 800, y: 540, n: 785 }, look: { e: 773, y: 442, n: 761 } },
  { name: '亭前石阶', eye: { e: 778, y: 446, n: 762 }, look: { e: 773, y: 441.5, n: 758 } },
  { name: '观景平台', eye: { e: 782, y: 447, n: 762 }, look: { e: 773, y: 442, n: 761 } },
  { name: '观景石栏', eye: { e: 769, y: 446, n: 759 }, look: { e: 775, y: 443, n: 757.5 } },
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
    `${approach.stats().pieces} 件 / ${approach.stats().batches} 批 / ${approach.stats().lights} 灯 · ` +
    `draws ${renderer.info.render.calls} · frames ${++frames}`;
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

declare global {
  interface Window {
    __pavilionApproachReview?: {
      state: () => { view: string; draws: number; pieces: number; errors: readonly string[] };
      setView: (index: number) => void;
    };
  }
}
const errors: string[] = [];
addEventListener('error', e => errors.push(String(e.message)));
window.__pavilionApproachReview = {
  state: () => ({ view: views[selected]!.name, draws: renderer.info.render.calls,
    pieces: approach.stats().pieces, errors }),
  setView: index => { selected = Math.max(0, Math.min(views.length - 1, index)); },
};
