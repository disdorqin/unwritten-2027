import {
  AmbientLight, Color, FogExp2, Group, PerspectiveCamera, PointLight, Scene, Vector3, WebGLRenderer,
} from 'three';
import { mountRegisteredSecondMineDomain } from '../voxel-tavern/town-blockout/town-c-second-mine-domain.js';
import { buildTownC2SecondMinePrefab } from '../voxel-tavern/town-blockout/town-c2-second-mine-prefab.js';
import { mountTownC2SecondMineWaterDifferential } from '../voxel-tavern/town-blockout/town-c2-second-mine-water-differential.js';
import { createUndergroundWaterState } from '../../src/presence/underground-water-state.js';
import { townDayMs } from '../../src/shared/town-night-window.js';
import { secondMineWorldFrame } from '../../src/shared/underground-second-mine-presence-domain.js';
import type { MineRiverState } from '../../src/shared/underground-second-mine-layout.js';

let now = 0;
const authority = createUndergroundWaterState({ dawnEpoch: 0, now: () => now });
const parent = new Group();
const mine = mountRegisteredSecondMineDomain({ parent, readAcceptedWater: authority.tonight });
if (mine.kind !== 'ready') throw new Error('C2 registered second-mine review host is unavailable: ' + mine.kind);
const prefab = buildTownC2SecondMinePrefab(mine.group);
const water = mountTownC2SecondMineWaterDifferential({ parent: mine.group, readAcceptedWater: authority.tonight });
const scene = new Scene();
scene.background = new Color(0x10171e);
scene.fog = new FogExp2(0x10171e, .024);
scene.add(parent, new AmbientLight(0xa0b3c6, .62));
const camera = new PerspectiveCamera(65, innerWidth / innerHeight, .06, 320);
const headlamp = new PointLight(0xffd6ac, 26, 22, 2);
camera.add(headlamp);
scene.add(camera);
const renderer = new WebGLRenderer({ antialias: false, powerPreference: 'low-power' });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.domElement.setAttribute('aria-label', 'town-c2-registered-second-mine-first-person-review');
document.body.append(renderer.domElement);

const views = {
  entry: [0, 12, 0, 48],
  support: [0, 9, -5, 9],
  upperWest: [-20, 47, -26, 47],
  upperEast: [20, 79, 30, 79],
  nearWest: [-40, 112, -45, 112],
  nearEast: [40, 112, 45, 112],
  farWest: [-40, 158, -45, 160],
  farEast: [40, 158, 45, 160],
  bypass: [51.5, 120, 51.5, 150],
  collapse: [-52, 167, -64, 170],
  barracks: [55, 174, 63, 176],
  river: [0, 126, 0, 137],
} as const;

type ViewName = keyof typeof views;
let view: ViewName = 'entry';
let frames = 0;
let fpsStart = performance.now();
let walked = 0;
let rejected = 0;
let trustedW = 0;
let night = false;
const keys = new Set<string>();
const direction = new Vector3();
const eyeHeight = 1.67;

function setView(name: ViewName) {
  const [east, north, targetEast, targetNorth] = views[name];
  const world = mine.toWorld({ east, north, height: 0 });
  if (!world || !mine.passageAt(world.east, world.north)) return false;
  const target = mine.toWorld({ east: targetEast, north: targetNorth, height: 0 });
  if (!target) return false;
  view = name;
  camera.position.set(world.east, world.height + eyeHeight, -world.north);
  camera.lookAt(target.east, target.height + eyeHeight, -target.north);
  camera.updateMatrixWorld(true);
  return true;
}
function setRiverState(state: MineRiverState) {
  now = (state === 'high' ? 0 : state === 'middle' ? 1 : 2) * townDayMs;
  mine.sync();
  water.sync();
  return true;
}
function setNight(value: boolean) {
  night = value;
  prefab.setNight(value);
  water.setNight(value);
  headlamp.intensity = value ? 5 : 0;
  return true;
}
function step(seconds: number) {
  if (!keys.has('w') || !Number.isFinite(seconds) || seconds <= 0 || seconds > 3) return false;
  camera.getWorldDirection(direction);
  direction.y = 0;
  direction.normalize();
  const distance = seconds * 3;
  const count = Math.ceil(distance / .08);
  for (let index = 0; index < count; index++) {
    const next = camera.position.clone().addScaledVector(direction, distance / count);
    const floor = mine.passageAt(next.x, -next.z)?.floor;
    if (floor === undefined) {
      rejected++;
      return false;
    }
    next.y = floor + eyeHeight;
    camera.position.copy(next);
    walked += distance / count;
  }
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
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

function inspect() {
  const summary = prefab.stats();
  return {
    view,
    state: mine.getRiverState(),
    night,
    frames,
    fps: frames * 1000 / Math.max(1, performance.now() - fpsStart),
    eye: camera.position.toArray(),
    trustedW,
    walked,
    rejected,
    registered: true,
    worldFrame: secondMineWorldFrame,
    prefab: {
      moduleCount: summary.moduleCount,
      pieceCount: summary.pieceCount,
      realLightCount: summary.realLightCount,
      visualOnly: summary.visualOnly,
    },
    water: water.stats(),
    render: {
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
    },
    fixtureOnly: true,
    productionCertified: false,
  };
}

setRiverState('middle');
setNight(false);
if (!setView('entry')) throw new Error('C2 registered second-mine review initial standing point is blocked');
function frame() {
  mine.sync();
  water.sync();
  renderer.render(scene, camera);
  frames++;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

const api = { setView, setRiverState, setNight, step, resetFPS() { frames = 0; fpsStart = performance.now(); }, inspect };
Object.assign(window, { townC2MineReview: api });
declare global {
  interface Window { townC2MineReview: typeof api }
}
