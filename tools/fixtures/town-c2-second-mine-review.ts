import {
  AmbientLight, Color, FogExp2, Group, PerspectiveCamera, PointLight, Scene, Vector3, WebGLRenderer,
} from 'three';
import { mountRegisteredSecondMineDomain } from '../voxel-tavern/town-blockout/town-c-second-mine-domain.js';
import { buildTownC2SecondMinePrefab } from '../voxel-tavern/town-blockout/town-c2-second-mine-prefab.js';
import { mountTownC2SecondMineWaterDifferential } from '../voxel-tavern/town-blockout/town-c2-second-mine-water-differential.js';
import { createUndergroundWaterState } from '../../src/presence/underground-water-state.js';
import { townDayMs } from '../../src/shared/town-night-window.js';
import { secondMineWorldFrame } from '../../src/shared/underground-second-mine-presence-domain.js';
import {
  secondMineAnchors, secondMineRoomAt, secondMineRooms,
  type MineLocalPoint, type MineRiverState,
} from '../../src/shared/underground-second-mine-layout.js';

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

const nearShore = secondMineRooms.find(room => room.id === 'near-shore');
const farShore = secondMineRooms.find(room => room.id === 'far-shore');
if (!nearShore || !farShore) throw new Error('C2 registered second-mine review surveyed shores are unavailable');
// Local camera sites only: anchors and surveyed room edges, never new world registration.
const views = {
  entry: [secondMineAnchors.entry.east, secondMineAnchors.entry.north, 0, 48],
  support: [secondMineAnchors.supportCamp.east, secondMineAnchors.supportCamp.north,
    secondMineAnchors.entry.east, secondMineAnchors.entry.north],
  upperWest: [-20, 47, -26, 47],
  upperEast: [20, 79, 30, 79],
  nearWest: [-40, 112, -45, 112],
  nearEast: [40, 112, 45, 112],
  nearBankEast: [nearShore.x1 - 8, secondMineAnchors.bypass[0]!.north,
    nearShore.x1 - 3, secondMineAnchors.bypass[0]!.north],
  farWest: [-40, 158, -45, 160],
  farEast: [40, 158, 45, 160],
  farBankEast: [farShore.x1 - 8, secondMineAnchors.bypass[2]!.north - 1,
    farShore.x1 - 3, secondMineAnchors.bypass[2]!.north + 1],
  bypass: [51.5, 120, 51.5, 150],
  collapse: [-52, 167, -64, 170],
  barracks: [55, 174, 63, 176],
  river: [0, 126, 0, 137],
} as const;
const walkRoute = Object.freeze([
  secondMineAnchors.entry, ...secondMineAnchors.bypass, secondMineAnchors.exit,
]);

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
// Orientation helper for the surveyed walk route; it grants no passage or movement.
function faceLocal(point: MineLocalPoint) {
  if (![point.east, point.north].every(Number.isFinite)) return false;
  const target = mine.toWorld({ east: point.east, north: point.north, height: 0 });
  const distance = Math.hypot(target.east - camera.position.x, -target.north - camera.position.z);
  if (distance < 1e-6) return true;
  camera.lookAt(target.east, camera.position.y, -target.north);
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
  const localEye = mine.registered.toLocal({
    east: camera.position.x, north: -camera.position.z, height: camera.position.y,
  });
  const localFoot = { east: localEye.east, north: localEye.north, height: localEye.height - eyeHeight };
  return {
    view,
    state: mine.getRiverState(),
    night,
    frames,
    fps: frames * 1000 / Math.max(1, performance.now() - fpsStart),
    eye: camera.position.toArray(),
    localEye: { east: localEye.east, north: localEye.north, height: localEye.height },
    localFoot,
    room: secondMineRoomAt(localFoot.east, localFoot.north)?.id,
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

const api = {
  setView, faceLocal, setRiverState, setNight, step, walkRoute,
  resetFPS() { frames = 0; fpsStart = performance.now(); }, inspect,
};
Object.assign(window, { townC2MineReview: api });
declare global {
  interface Window { townC2MineReview: typeof api }
}
