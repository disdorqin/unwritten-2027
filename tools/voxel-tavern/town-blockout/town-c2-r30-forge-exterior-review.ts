import {
  AmbientLight, Color, DirectionalLight, FogExp2, Group, PerspectiveCamera,
  PointLight, Scene, Vector3, WebGLRenderer,
} from 'three';
import { createWarriorCityCandidate } from './underground-warrior-city-candidate.js';
import { mountTownC2R30ForgeExterior } from './town-c2-r30-forge-exterior.js';

const city = createWarriorCityCandidate();
const exterior = mountTownC2R30ForgeExterior({
  parent: city.group,
  site: { domainId: 'review:c2-r30:forge-exterior', east: 0, north: 0, height: 0, yaw: 0 },
  supportsSite: () => true,
});
const scene = new Scene();
scene.name = 'c2-r30-forge-exterior-review';
scene.background = new Color(0x151a20);
scene.fog = new FogExp2(0x151a20, .012);
scene.add(city.group);

const ambient = new AmbientLight(0xaebdca, .5);
const moon = new DirectionalLight(0xbcd0e8, .32);
moon.position.set(-30, 40, -20);
const warm = new DirectionalLight(0xffb277, .38);
warm.position.set(142, 12, 2);
scene.add(ambient, moon, warm);

const camera = new PerspectiveCamera(68, innerWidth / innerHeight, .06, 260);
const headlamp = new PointLight(0xffd6ac, 0, 18, 2);
camera.add(headlamp);
scene.add(camera);
const renderer = new WebGLRenderer({ antialias: false, powerPreference: 'low-power' });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.domElement.setAttribute('aria-label', 'town-c2-r30-forge-exterior-first-person-review');
document.body.append(renderer.domElement);

const views = [
  { name: 'gate-front', east: 142, north: .35, targetEast: 142, targetNorth: 4.0, pitch: .08 },
  { name: 'anvil-yard', east: 139.75, north: 1.65, targetEast: 140.35, targetNorth: 2.62, pitch: .04 },
  { name: 'quench-edge', east: 144.75, north: 1.7, targetEast: 143.52, targetNorth: 3.02, pitch: .08 },
  { name: 'street-seam', east: 142, north: .25, targetEast: 142, targetNorth: 4.0, pitch: .12 },
] as const;
type ViewName = typeof views[number]['name'];
let view: ViewName = 'gate-front';
let yaw = 0;
let pitch = .08;
let foot = { east: 142, north: .35, height: 0 };
let night = false;
let frames = 0;
let fpsStart = performance.now();
let walked = 0;
let rejected = 0;
let trustedW = 0;
const keys = new Set<string>();
const direction = new Vector3();
const eyeHeight = 1.65;

function choose(name: ViewName) {
  const next = views.find(item => item.name === name);
  if (!next) return false;
  view = name;
  foot = { east: next.east, north: next.north, height: 0 };
  yaw = Math.atan2(next.targetEast - next.east, next.targetNorth - next.north);
  pitch = next.pitch;
  camera.position.set(foot.east, eyeHeight, -foot.north);
  camera.lookAt(
    foot.east + Math.sin(yaw) * Math.cos(pitch),
    eyeHeight + Math.sin(pitch),
    -foot.north - Math.cos(yaw) * Math.cos(pitch),
  );
  camera.updateMatrixWorld(true);
  return true;
}
function setNight(value: boolean) {
  if (typeof value !== 'boolean') return false;
  night = value;
  ambient.intensity = night ? .24 : .5;
  moon.intensity = night ? .16 : .32;
  warm.intensity = night ? .5 : .38;
  headlamp.intensity = night ? 5 : 0;
  scene.background = new Color(night ? 0x0b1016 : 0x151a20);
  scene.fog = new FogExp2(night ? 0x0b1016 : 0x151a20, .012);
  return true;
}
function canStand(east: number, north: number) {
  if (!city.canStand(east, north, 0, .27)) return false;
  const foot = exterior.stats().datum.footprint;
  const inside = east >= foot.minE && east <= foot.maxE && north >= foot.minN && north <= foot.maxN;
  return !inside || !exterior.blocks(east, north, 0, .27);
}
function step(seconds: number) {
  if (!keys.has('w') || !Number.isFinite(seconds) || seconds <= 0 || seconds > 3) return false;
  camera.getWorldDirection(direction);
  direction.y = 0;
  direction.normalize();
  const distance = seconds * 2.6;
  const count = Math.ceil(distance / .08);
  for (let index = 0; index < count; index++) {
    const east = foot.east + direction.x * distance / count;
    const north = foot.north - direction.z * distance / count;
    if (!canStand(east, north)) {
      rejected++;
      return false;
    }
    foot = { ...foot, east, north };
    walked += distance / count;
  }
  camera.position.set(foot.east, eyeHeight, -foot.north);
  camera.updateMatrixWorld(true);
  return true;
}
addEventListener('keydown', event => {
  if (event.key.toLowerCase() === 'w') {
    keys.add('w');
    if (event.isTrusted) trustedW++;
    event.preventDefault();
  }
});
addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
addEventListener('blur', () => keys.clear());
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

function inspect() {
  const stats = exterior.stats();
  return {
    view, night, frames,
    fps: frames * 1000 / Math.max(1, performance.now() - fpsStart),
    foot: { ...foot },
    walked, rejected, trustedW,
    pieces: stats.pieceCount,
    batches: stats.drawBatchCount,
    colliders: stats.colliderCount,
    siteCertified: stats.siteCertified,
    realLights: stats.realLightCount,
    interactionSockets: stats.interactionSockets,
    worldAnchor: stats.worldAnchor,
    render: { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles },
    fixtureOnly: true,
    productionCertified: false,
  };
}
function frame() {
  renderer.render(scene, camera);
  frames++;
  requestAnimationFrame(frame);
}
choose('gate-front');
requestAnimationFrame(frame);
Object.assign(window, { __forgeExteriorReview: {
  choose, setNight, step, inspect,
  resetFPS() { frames = 0; fpsStart = performance.now(); },
  resetWalk() { walked = 0; rejected = 0; trustedW = 0; },
} });
