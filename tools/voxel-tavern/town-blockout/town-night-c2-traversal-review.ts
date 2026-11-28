import {
  AmbientLight, BoxGeometry, BufferGeometry, Color, DirectionalLight, Fog,
  Float32BufferAttribute, Line, LineBasicMaterial, Mesh, MeshBasicMaterial,
  PerspectiveCamera, Scene, Vector3, WebGLRenderer,
} from 'three';
import { createC2EastCanonicalGround } from './town-night-c2-summit-canonical.js';
import { createTownD2R30Massif } from './town-d2-r30-massif.js';
import { c2EastWalkingStations } from './town-night-c2-trail-corridor.js';
import { c2EastSledSpec } from './town-night-c2-summit-east-sled.js';
import { mountC2EastLandform } from './town-night-c2-summit-east-landform.js';
import { mountC2EastCamp } from './town-night-c2-summit-east-camp.js';
import { mountC2EastVegetation } from './town-night-c2-summit-east-vegetation.js';
import { mountC2EastSled } from './town-night-c2-summit-east-sled.js';
import { mountC2EastBench } from './town-night-c2-summit-east-bench.js';
import { mountC2EastSwitchback } from './town-night-c2-summit-east-switchback.js';
import { mountC2EastCliffWalkway } from './town-night-c2-summit-east-cliff-walkway.js';
import { mountC2EastTrail } from './town-night-c2-summit-east-trail.js';

/** C33-3 scripted traversal review: an actual player-sized body walks the
 * 1692 stations forwards and back, then a sled avatar rides the authored
 * chute downhill. Review scene only; it does not mount into the game. */
const scene = new Scene();
scene.name = 'town-night-c2-traversal-review';
scene.fog = new Fog(0x9fb0c4, 900, 3000);

const ground = createC2EastCanonicalGround();
const heightAt = ground.heightAt;
const massif = createTownD2R30Massif();
const stations = c2EastWalkingStations();
const assets = [
  mountC2EastLandform(heightAt), mountC2EastCamp(heightAt), mountC2EastVegetation(heightAt),
  mountC2EastSled(heightAt), mountC2EastBench(heightAt), mountC2EastSwitchback(heightAt),
  mountC2EastCliffWalkway(heightAt), mountC2EastTrail(heightAt, stations),
];
scene.add(massif.group, ...assets.map(a => a.group));

function lineOf(
  points: readonly { east: number; north: number; height: number }[], color: string,
  heightFor: (p: { east: number; north: number; height: number }) => number,
) {
  const values: number[] = [];
  for (const p of points) values.push(p.east, heightFor(p) + 1.6, -p.north);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(values, 3));
  return new Line(geometry, new LineBasicMaterial({ color: new Color(color) }));
}
scene.add(lineOf(stations, '#31f7ff', p => heightAt(p.east, p.north) ?? p.height));

const s = c2EastSledSpec;
const rideLength = Math.hypot(s.chuteTo.east - s.chuteFrom.east, s.chuteTo.north - s.chuteFrom.north);
const rideSteps = Math.ceil(rideLength);
const ride: { east: number; north: number; height: number }[] = [];
for (let i = 0; i <= rideSteps; i++) {
  const t = i / rideSteps;
  const east = s.chuteFrom.east + (s.chuteTo.east - s.chuteFrom.east) * t;
  const north = s.chuteFrom.north + (s.chuteTo.north - s.chuteFrom.north) * t;
  ride.push({ east, north, height: heightAt(east, north) ?? 0 });
}
scene.add(lineOf(ride, '#ff8b3d', p => p.height));

const walker = new Mesh(new BoxGeometry(.6, 1.8, .6), new MeshBasicMaterial({ color: '#fff36a' }));
const sled = new Mesh(new BoxGeometry(1.2, .6, 2.2), new MeshBasicMaterial({ color: '#ff6b2b' }));
scene.add(walker, sled);

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
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setSize(innerWidth, innerHeight);
camera.aspect = innerWidth / innerHeight;
camera.updateProjectionMatrix();

const target = new Vector3();
let focus = { east: stations[0]!.east, north: stations[0]!.north, height: stations[0]!.height };
let mode = 'walk-forward', progress = 0, blocked = 0;
function blockerCount(east: number, north: number, feet: number) {
  let hits = 0;
  for (const asset of assets) if (asset.blocked(east, north, feet)) hits++;
  return hits;
}
function placeWalk(path: readonly { east: number; north: number; height: number }[], t: number) {
  const index = Math.max(0, Math.min(path.length - 1, Math.floor(t * (path.length - 1))));
  const p = path[index]!;
  const feet = heightAt(p.east, p.north) ?? p.height;
  walker.position.set(p.east, feet + .9, -p.north);
  focus = { east: p.east, north: p.north, height: feet };
  return { east: p.east, north: p.north, height: feet, index, blocked: blockerCount(p.east, p.north, feet + .05) };
}
function placeRide(t: number) {
  const index = Math.max(0, Math.min(ride.length - 1, Math.floor(t * (ride.length - 1))));
  const p = ride[index]!;
  sled.position.set(p.east, p.height + 1.1, -p.north);
  focus = { east: p.east, north: p.north, height: p.height };
  return { east: p.east, north: p.north, height: p.height, index, blocked: blockerCount(p.east, p.north, p.height + .05) };
}
const backward = [...stations].reverse();

function frame() {
  camera.position.set(focus.east + 14, focus.height + 10, -(focus.north + 18));
  target.set(focus.east, focus.height + 1, -focus.north);
  camera.lookAt(target);
  document.querySelector('#hud')!.textContent =
    `${mode} · ${(progress * 100).toFixed(1)}% · E${focus.east.toFixed(0)} N${focus.north.toFixed(0)} ` +
    `H${focus.height.toFixed(1)} · 当前碰撞 ${blocked} · draws ${renderer.info.render.calls}`;
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

declare global {
  interface Window {
    __c2TraversalReview?: {
      state: () => { mode: string; progress: number; east: number; north: number; height: number; blocked: number; draws: number; errors: readonly string[] };
      walk: (t: number, reverse?: boolean) => void;
      ride: (t: number) => void;
      run: () => { walkForward: number; walkReturn: number; ride: number; stations: number; rideStations: number };
    };
  }
}
const errors: string[] = [];
addEventListener('error', e => errors.push(String(e.message)));
window.__c2TraversalReview = {
  state: () => ({ mode, progress, east: focus.east, north: focus.north, height: focus.height,
    blocked, draws: renderer.info.render.calls, errors }),
  walk: (t, reverse = false) => {
    mode = reverse ? 'walk-return' : 'walk-forward'; progress = t;
    blocked = placeWalk(reverse ? backward : stations, t).blocked;
  },
  ride: t => { mode = 'sled-ride'; progress = t; blocked = placeRide(t).blocked; },
  run: () => {
    let walkForward = 0, walkReturn = 0, rideHits = 0;
    for (const p of stations) {
      const feet = heightAt(p.east, p.north) ?? p.height;
      if (blockerCount(p.east, p.north, feet + .05)) walkForward++;
    }
    for (let i = backward.length - 1; i >= 0; i--) {
      const p = backward[i]!;
      const feet = heightAt(p.east, p.north) ?? p.height;
      if (blockerCount(p.east, p.north, feet + .05)) walkReturn++;
    }
    for (const p of ride) if (blockerCount(p.east, p.north, p.height + .05)) rideHits++;
    return { walkForward, walkReturn, ride: rideHits, stations: stations.length, rideStations: ride.length };
  },
};
