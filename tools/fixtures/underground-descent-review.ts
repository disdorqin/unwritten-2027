import {
  BoxGeometry, BufferAttribute, BufferGeometry, Color, DoubleSide, Group, Mesh, MeshBasicMaterial,
  PerspectiveCamera, Scene, WebGLRenderer,
} from 'three';
import { createUndergroundEntry, type UndergroundEntryPoint } from '../../src/presence/underground-entry.js';
import { createUndergroundMineLift } from '../../src/presence/underground-mine-lift.js';
import { createUndergroundLiftDomainHandoff } from '../../src/presence/underground-lift-domain-handoff.js';
import { createUndergroundMineLayout } from '../voxel-tavern/town-blockout/underground-mine-layout.js';
import { mountUndergroundDescent } from '../voxel-tavern/town-blockout/underground-descent.js';

// B-01 review anchors. The shared C-01 host supplies the registered production transform.
const shaft: UndergroundEntryPoint = { east: 0, north: 0, height: -35 };
const walker = { radius: .27, standingHeight: 1.8, crouchingHeight: 1.1, maxGrade: .2 };
const mine = createUndergroundMineLayout({
  pool: { length: 4, width: 6, depth: 1.2, shaftAperture: { width: 2, length: 2 } },
  shoreLength: 8, gallery: { length: 20, drop: 1, railGauge: 1, railWidth: .08 },
  collapse: { length: 3, width: 1.2, height: 1.3 },
  camp: { length: 10, side: 'right', extension: 5 },
  walker,
});
const [poolEast, poolHeight, poolZ] = mine.anchors.poolLanding;
const pool: UndergroundEntryPoint = { east: poolEast, north: -poolZ, height: poolHeight };
const domains = { 'crater-floor': 'review/crater', mine: 'review/mine' };
type Stop = keyof typeof domains;
const playerId = 'review-player';
const renderer = new WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.querySelector('main')!.append(renderer.domElement);
const camera = new PerspectiveCamera(68, innerWidth / innerHeight, .02, 80);
const craterScene = new Scene();
craterScene.background = new Color('#182330');
const underScene = new Scene();
underScene.background = new Color('#171917');
const palette = { rock: '#646158', rail: '#776659', water: '#497782' };
for (const [surface, positions] of Object.entries(mine.mesh)) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  const material = new MeshBasicMaterial({
    color: palette[surface as keyof typeof palette], side: DoubleSide,
  });
  underScene.add(new Mesh(geometry, material));
}
const cage = new Group();
craterScene.add(cage);
function addProp(parent: Group | Scene, width: number, height: number, depth: number,
    color: string, x: number, y: number, z: number) {
  const mesh = new Mesh(new BoxGeometry(width, height, depth), new MeshBasicMaterial({ color }));
  mesh.position.set(x, y, z);
  parent.add(mesh);
}
addProp(cage, 2.05, .2, 2.05, '#786451', 0, -.1, 0);
addProp(cage, 2.05, .14, 2.05, '#505052', 0, 2.5, 0);
for (const x of [-1, 1]) {
  for (const z of [-1, 1]) addProp(cage, .12, 2.5, .12, '#8c8071', x, 1.25, z);
  for (const y of [.32, 1.1, 1.8]) addProp(cage, .08, .07, 2, '#7e6b58', x, y, 0);
}
for (const x of [-2, 2]) addProp(craterScene, .15, 30, 2.6, '#696b6d', x, -46, 2);
for (let y = -30; y >= -53; y -= 2) addProp(craterScene, 3.4, .12, .14, '#9d906f', 0, y, 3);

let clock = 0;
let sequence = 0;
let frame = 0;
let health = 100;
let locked = false;
let scene: Stop = 'crater-floor';
let dock: Stop | undefined = 'crater-floor';
let foot = { ...shaft };
let sound: AudioContext | undefined;
const getAudioContext = () => sound ??= new AudioContext();
let analyser: AnalyserNode | undefined;
const waveSamples = new Float32Array(2048);
const insidePool = (point: UndergroundEntryPoint) => point.east === pool.east &&
  point.north === pool.north && point.height === pool.height &&
  mine.queryPassage(point.east, -point.north, walker.radius, walker.standingHeight)?.zone === 'pool';
const entry = createUndergroundEntry({
  depthLine: (shaft.height + pool.height) / 2,
  firstFallLanding: pool,
  canUseWinch: id => id === playerId && scene === 'crater-floor' && foot.height === shaft.height,
  canBoardCage: (id, direction) => id === playerId && scene === (direction === 'down' ? 'crater-floor' : 'mine'),
  isDepthLineCrossing: point => Math.hypot(point.east, point.north) <= 2,
  isFirstFallPool: insidePool,
  save: () => undefined,
});
const acceptedFoot = (id: string) => id === playerId ? { ...foot, playerId, domainId: domains[scene] } : undefined;
const lift = createUndergroundMineLift({
  travelMs: 20_000,
  riderCapacity: 1,
  now: () => clock,
  requestCageRide: entry.requestCageRide,
  readAcceptedFoot: acceptedFoot,
  isAtBoardingPlatform: (stop, point) => point.domainId === domains[stop] &&
    (stop === 'mine' ? insidePool(point) : point.height === shaft.height),
  readDockedStop: () => dock,
});
const handoff = createUndergroundLiftDomainHandoff({
  lift, domains, readAcceptedFoot: acceptedFoot,
  isAtAcceptedLanding: (stop, point) => stop === 'mine' ? insidePool(point) : point.height === shaft.height,
});

type Trip = Readonly<{ id: number; first: boolean; departedAt: number; travelMs: number; liftId?: number }>;
let active: Trip | undefined;
type Landing = Readonly<{ tripId: number; destination: 'mine'; fallDamage: 0 }>;
let pending: { tripId: number; resolve(landing: Landing | undefined): void } | undefined;
let motion: { yaw?: number; pitch?: number; roll?: number; wakeProgress?: number } = {};
const phases: { phase: string; at: number; frame: number; yaw: number; pitch: number; roll: number }[] = [];
const events: { code: string; trusted: boolean; at: number }[] = [];
const transfers: { tripId: number; first: boolean; wasBlack: boolean; fallDamage: number;
  foot: UndergroundEntryPoint; healthBefore: number; healthAfter: number }[] = [];
const requests: { tripId: number; frame: number; at: number }[] = [];
let blackoutFrame = -1;
let audioPeak = 0;
let swayPeak = 0;
let flashPeak = 0;

const effects = () => document.querySelector<HTMLElement>('[data-underground-lift-cinematic]')!;
const skipButton = () => document.querySelector<HTMLButtonElement>('[data-underground-lift-skip]')!;
function visible(element: HTMLElement | undefined) {
  return Boolean(element && !element.hidden && element.getClientRects().length);
}
function blackFrame() {
  const element = effects();
  if (!visible(element)) return false;
  const style = getComputedStyle(element);
  return Number(style.opacity) >= .999 && style.backgroundColor === 'rgb(0, 0, 0)';
}

const descent = mountUndergroundDescent({
  parent: document.body,
  setControlsLocked(value) { locked = value; },
  cameraMotion(value) { motion = value ?? {}; },
  getAudioContext,
  audioOutput(context) {
    if (!analyser) {
      analyser = context.createAnalyser();
      analyser.fftSize = waveSamples.length;
      analyser.connect(context.destination);
    }
    return analyser;
  },
  requestMineLanding(tripId) {
    if (tripId !== active?.id || pending || !blackFrame()) return;
    if (active.liftId !== undefined && !handoff.jolt(playerId, active.liftId)) return;
    requests.push({ tripId, frame, at: clock });
    return new Promise(resolve => { pending = { tripId, resolve }; });
  },
  reducedMotion: () => false,
});

function beginDescent() {
  if (scene !== 'crater-floor' || locked) return;
  phases.length = requests.length = transfers.length = 0;
  blackoutFrame = -1;
  audioPeak = swayPeak = flashPeak = 0;
  motion = {};
  if (entry.sceneState().coverVisible) {
    const order = entry.openWell(playerId);
    if (order.kind !== 'opened' || order.firstFall.fallDamage !== 0 || !insidePool(order.firstFall.destination)) {
      throw new Error('First descent did not receive the accepted B-01 pool order');
    }
    active = { id: ++sequence, first: true, departedAt: clock, travelMs: 12_000 };
  } else {
    if (!lift.board(playerId, 'down')) throw new Error('The repeat rider lacked an actual cage boarding');
    const trip = lift.depart(playerId);
    if (!trip) throw new Error('The cage failed to depart with the accepted rider');
    dock = undefined;
    active = { id: ++sequence, first: false, departedAt: clock, travelMs: trip.travelMs, liftId: trip.id };
  }
  void getAudioContext().resume();
  if (!descent.start(active, clock)) throw new Error('The accepted trip did not start its presentation');
  update();
}

function returnToShaft() {
  // This fixture covers down-cage presentation. Use the original accepted return to repeat it in the same profile.
  if (entry.requestCageRide(playerId, 'up').kind !== 'ride-cage' ||
      !entry.confirmDepthCrossing(playerId, foot, shaft)) {
    throw new Error('The original return gate did not accept the depth crossing');
  }
  foot = { ...shaft };
  scene = 'crater-floor';
  dock = scene;
  active = undefined;
  motion = {};
}

function allowLanding() {
  const trip = active;
  const request = pending;
  if (!trip || !request || request.tripId !== trip.id ||
      clock - trip.departedAt < trip.travelMs || !blackFrame() || !insidePool(pool)) return false;

  if (trip.liftId !== undefined) {
    dock = 'mine';
    if (!handoff.confirmDock(trip.liftId)) throw new Error('Repeat descent ended before the physical lift dock');
  }
  if (entry.confirmDepthCrossing(playerId, foot, pool)?.mode !== 'survival') {
    throw new Error('The official depth-line authority refused the fixture route');
  }
  const healthBefore = health;
  if (trip.first) {
    const result = entry.confirmFirstFallLanding(playerId, pool);
    if (!result || result.fallDamage !== 0) throw new Error('The original authority refused a zero-damage pool landing');
    health -= result.fallDamage;
  }
  foot = { ...pool };
  scene = 'mine';
  if (trip.liftId !== undefined && !handoff.wake(playerId, trip.liftId)) {
    throw new Error('Repeat descent did not receive the accepted underground landing');
  }
  pending = undefined;
  transfers.push({ tripId: trip.id, first: trip.first, wasBlack: blackFrame(), fallDamage: 0,
    foot: { ...foot }, healthBefore, healthAfter: health });
  request.resolve({ tripId: trip.id, destination: 'mine', fallDamage: 0 });
  return true;
}

document.addEventListener('keydown', event => {
  if (!['KeyE', 'KeyW', 'Escape'].includes(event.code) || event.repeat) return;
  events.push({ code: event.code, trusted: event.isTrusted, at: clock });
  if (locked) return;
  if (event.code === 'KeyE') {
    if (scene === 'mine') returnToShaft();
    else beginDescent();
  } else if (event.code === 'KeyW' && scene === 'mine') {
    const north = foot.north - .24;
    const floor = mine.queryPassage(foot.east, -north, walker.radius, walker.standingHeight);
    if (floor) foot = { ...foot, north, height: floor.waterDepth ? pool.height : floor.floor };
  }
});
document.addEventListener('click', event => {
  if (event.target instanceof Element && event.target.closest('[data-underground-lift-skip]')) {
    events.push({ code: 'skip', trusted: event.isTrusted, at: clock });
  }
}, true);

function update() {
  const state = descent.update(clock);
  const phase = state?.phase ?? effects()?.dataset.phase;
  if (phase && phases.at(-1)?.phase !== phase) {
    phases.push({ phase, at: clock, frame, yaw: motion.yaw ?? 0, pitch: motion.pitch ?? 0, roll: motion.roll ?? 0 });
  }
  if (phase === 'sway') swayPeak = Math.max(swayPeak, Math.abs(motion.roll ?? 0));
  if (phase === 'flash') flashPeak = Math.max(flashPeak, Number(effects().style.opacity));
  if (blackoutFrame < 0 && blackFrame()) blackoutFrame = frame;
}

function render() {
  frame++;
  update();
  if (analyser && phases.at(-1)?.phase === 'screech') {
    analyser.getFloatTimeDomainData(waveSamples);
    for (const sample of waveSamples) audioPeak = Math.max(audioPeak, Math.abs(sample));
  }
  const progress = active ? Math.min(1, (clock - active.departedAt) / active.travelMs) : 0;
  cage.position.y = shaft.height - 18 * progress;
  const posture = scene === 'mine' ? motion.wakeProgress ?? 1 : 1;
  const height = .25 + 1.39 * posture;
  camera.position.set(foot.east, (scene === 'mine' ? foot.height : cage.position.y) + height, -foot.north);
  camera.rotation.set((motion.pitch ?? 0) + (1 - posture) * .86,
    Math.PI + (motion.yaw ?? 0), motion.roll ?? 0, 'YXZ');
  renderer.render(scene === 'mine' ? underScene : craterScene, camera);
  requestAnimationFrame(render);
}
requestAnimationFrame(render);

function inspect() {
  return {
    tripId: active?.id, first: active?.first, travelMs: active?.travelMs,
    elapsed: active ? clock - active.departedAt : 0,
    scene: scene === 'mine' ? scene : 'crater', foot: { ...foot }, locked, mode: entry.modeOf(playerId),
    health, cageAvailable: entry.sceneState().cageAvailable.down,
    overlayOpaque: blackFrame(), blackoutFrame, skipVisible: visible(skipButton()), wakeProgress: motion.wakeProgress,
    phase: phases.at(-1)?.phase, audioPeak, swayPeak, flashPeak,
    camera: { eyeY: camera.position.y, pitch: camera.rotation.x },
    phases: [...phases], events: [...events], requests: [...requests], transfers: [...transfers],
  };
}

Object.assign(window, {
  undergroundDescentReview: {
    inspect,
    advance(elapsed: number) { clock += elapsed; update(); return inspect(); },
    askSkip() { return descent.skip(); },
    allowLanding,
  },
});
