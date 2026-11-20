import {
  Color, DirectionalLight, Fog, Group, HemisphereLight, Mesh, MeshLambertMaterial,
  PerspectiveCamera, PlaneGeometry, Raycaster, Scene, Vector3, WebGLRenderer,
} from 'three';
import { createMainSummitApproach, mountMainSummitApproachSigns } from './main-summit-approach';
import {
  cloudTerminal, cloudTerraceTurnNorth, mountMainSummitAssembly, summitAssemblyAnchor, summitWorldPoint, supportsCloudTerrace,
} from './main-summit-assembly';
import { mainSummitBounds, mainSummitSpec } from './main-summit-block';
import { cloudPavilionSites } from './main-summit-pavilion-site';
import { mountMainSummitPosts } from './main-summit-posts';
import { createMainSummitRegistrationLandmarks } from './main-summit-registration';
import { createMainSummitTrail } from './main-summit-trail';
import { createTownPhysicsClock, townPhysicsDelta } from './town-physics-clock';
import type { Box } from './landmark-kit';

const scene = new Scene();
const horizon = new Color('#a5bdd3');
scene.background = horizon;
scene.fog = new Fog(horizon, 48, 220);
scene.add(new HemisphereLight('#f3f7ff', '#728294', 2.15));
const sun = new DirectionalLight('#fff0cf', 2.1);
sun.position.set(-18, 32, 23);
scene.add(sun);

const worldRoot = new Group();
scene.add(worldRoot);
const assembly = mountMainSummitAssembly(worldRoot, Date.UTC(2026, 11, 31, 6));
const { summit, cloudDeck } = createMainSummitRegistrationLandmarks(assembly.arrivalHeight);
type DispatchReading = ReturnType<typeof assembly.timetableAt>;
const approach = createMainSummitApproach({
  terminal: cloudTerminal, terraceTurnNorth: cloudTerraceTurnNorth, gateArrival: assembly.stations.gate.to,
  frontStamp: { east: cloudDeck.stampPoint.east - summitAssemblyAnchor.east,
    north: cloudDeck.stampPoint.north - summitAssemblyAnchor.north },
  stampInteractionRadius: 1.1,
});
const site = cloudPavilionSites[1];
const galleryObject = assembly.group.getObjectByName('cloud-pavilion-upper-cloud');
if (!(galleryObject instanceof Group)) throw new Error('P-9 upper pavilion is missing.');
const gallery: Group = galleryObject;
const bridgeObject = gallery.getObjectByName('trail-approach');
if (!(bridgeObject instanceof Mesh)) throw new Error('P-9 upper bridge is missing.');
const bridge: Mesh = bridgeObject;
const posts = mountMainSummitPosts(assembly.group, {
  approach, gate: assembly.stations.gate, stations: assembly.stations.stations, summit,
  upperPavilion: { model: gallery, approach: { east: site.approachEast, north: site.approachNorth } },
});
const trail = createMainSummitTrail(assembly.block.heightAt, assembly.arrivalHeight);
const ray = new Raycaster(new Vector3(), new Vector3(0, -1, 0), 0, 5);
const deck = (gallery.userData.floors as Box[])[0]!;
const pavilionColliders = gallery.userData.colliders as Box[];

function frontFloor(east: number, north: number, radius = 0) {
  if (north < mainSummitBounds.south) {
    return supportsCloudTerrace(east, north, radius) ? assembly.frontRidgeAt(east, north) : undefined;
  }
  if (Math.abs(east) > mainSummitSpec.arrivalPlaza[0] / 2 || north > mainSummitSpec.arrivalPlaza[1]) return undefined;
  return assembly.block.heightAt(east, north);
}
const signs = mountMainSummitApproachSigns(assembly.group, approach, frontFloor);
const plazaWidth = mainSummitSpec.arrivalPlaza[0];
const plazaNorth = mainSummitSpec.arrivalPlaza[1], plazaDepth = plazaNorth - mainSummitBounds.south;
const plazaSurface = new Mesh(new PlaneGeometry(plazaWidth, plazaDepth), new MeshLambertMaterial({
  color: '#9cadbd', polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
}));
plazaSurface.rotation.x = -Math.PI / 2;
plazaSurface.position.set(0, assembly.arrivalHeight, -(plazaNorth + mainSummitBounds.south) / 2);
assembly.group.add(plazaSurface);
scene.updateMatrixWorld(true);

function galleryFloor(east: number, north: number) {
  const world = summitWorldPoint(east, north, site.height);
  const local = gallery.worldToLocal(new Vector3(world.east, world.height, -world.north));
  if (local.x >= deck.min[0] && local.x <= deck.max[0] && local.z >= deck.min[2] && local.z <= deck.max[2]) {
    return world.height + deck.max[1] - local.y;
  }
  ray.ray.origin.set(world.east, world.height + 2, -world.north);
  return ray.intersectObject(bridge, false)[0]?.point.y ?? trail.sampleSurface(east, north);
}

const radius = .27, bodyHeight = 1.8, eyeHeight = 1.65, speed = 3.4;
const footprint = Array.from({ length: 8 }, (_, i) => [
  Math.cos(i * Math.PI / 4) * radius, Math.sin(i * Math.PI / 4) * radius,
] as const);
const legalStep = .43;
const cases = {
  gatekeeper: posts.routes.gatekeeper.slice(-3),
  dispatcher: posts.routes.dispatcher.slice(-5),
  'pavilion-keeper': posts.routes.pavilionKeeper,
} as const;
type Case = keyof typeof cases;
type Move = 'KeyW' | 'KeyA' | 'KeyS' | 'KeyD';
const headingOffset = { KeyW: 0, KeyA: Math.PI / 2, KeyS: Math.PI, KeyD: -Math.PI / 2 };
const keys = new Set<string>();
const clock = createTownPhysicsClock();
let active: Case = 'gatekeeper';
let east = 0, north = 0, feet = 0, yaw = 0, pitch = 0;
let frame = 0, nextFrame = 0, lastTime = performance.now(), accepted = 0, rejected = 0, maxStep = 0, walked = 0, resets = 0;
let drawnParts = new Set<string>();
let activePointer: number | null = null;

const renderer = new WebGLRenderer({ antialias: true });
document.body.prepend(renderer.domElement);
const camera = new PerspectiveCamera(61, 1, .05, 2_300);
const position = document.querySelector<HTMLOutputElement>('#position')!;
const dispatchAction = document.querySelector<HTMLButtonElement>('#dispatch-action')!;
const dispatchOutput = document.querySelector<HTMLOutputElement>('#dispatch-reading')!;
const dispatcherPoint = posts.posts.find(post => post.id === 'dispatcher')!.visitor;
let dispatchOpen = false;
let dispatchReading: DispatchReading | null = null;
for (const post of posts.posts) {
  posts.group.getObjectByName(post.id)!.traverse(object => {
    if (object instanceof Mesh) object.onAfterRender = () => { drawnParts.add(post.id); };
  });
}

function floor(e: number, n: number) {
  return active === 'pavilion-keeper' ? galleryFloor(e, n) : frontFloor(e, n);
}

function blocked(e: number, n: number, height: number) {
  if (assembly.blocked(e, n, height, radius, bodyHeight) || signs.blocked(e, n, height, radius, bodyHeight) ||
      posts.blocked(e, n, height, radius, bodyHeight)) return true;
  if (active !== 'pavilion-keeper') return false;
  const world = summitWorldPoint(e, n, height);
  const local = gallery.worldToLocal(new Vector3(world.east, world.height, -world.north));
  return pavilionColliders.some(({ min, max }) => {
    if (local.y >= max[1] || local.y + bodyHeight <= min[1]) return false;
    return Math.hypot(Math.max(min[0] - local.x, local.x - max[0], 0),
      Math.max(min[2] - local.z, local.z - max[2], 0)) < radius;
  });
}

function move(seconds: number) {
  const forward = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
  const side = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
  const length = Math.hypot(forward, side);
  if (!length) return;
  const distance = speed * seconds / length;
  const e = east + (forward * Math.sin(yaw) + side * Math.cos(yaw)) * distance;
  const n = north + (forward * Math.cos(yaw) - side * Math.sin(yaw)) * distance;
  const next = floor(e, n);
  if (next === undefined || Math.abs(next - feet) > legalStep || blocked(e, n, next) ||
      footprint.some(([dx, dn]) => Math.abs((floor(e + dx, n + dn) ?? Infinity) - next) > legalStep)) {
    rejected++;
    return;
  }
  walked += Math.hypot(e - east, n - north);
  maxStep = Math.max(maxStep, Math.abs(next - feet));
  east = e; north = n; feet = next;
  accepted++;
}

function draw() {
  const now = Date.now();
  const world = summitWorldPoint(east, north, feet);
  camera.position.set(world.east, feet + eyeHeight, -world.north);
  camera.lookAt(world.east + Math.sin(yaw), feet + eyeHeight + Math.tan(pitch), -world.north - Math.cos(yaw));
  drawnParts = new Set();
  assembly.update(now);
  renderer.render(scene, camera);
  frame++;
  position.value = `E${east.toFixed(2)} N${north.toFixed(2)} Y${feet.toFixed(2)}`;
  updateDispatch(now);
}

function canReadDispatch() {
  return active === 'dispatcher' && Math.hypot(east - dispatcherPoint.east, north - dispatcherPoint.north) <= .9 &&
    Math.abs(feet - dispatcherPoint.height) <= legalStep;
}

function timeText(ms: number) {
  const seconds = Math.ceil(ms / 1_000);
  return seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}

function updateDispatch(now: number) {
  const available = canReadDispatch();
  if (!available) dispatchOpen = false;
  dispatchAction.hidden = !available;
  dispatchAction.setAttribute('aria-expanded', String(dispatchOpen));
  dispatchReading = dispatchOpen ? assembly.timetableAt(now, 'cloud-deck') : null;
  dispatchOutput.hidden = dispatchReading === null;
  if (!dispatchReading) {
    dispatchOutput.value = '';
    return;
  }
  const cabin = dispatchReading.cabinIndex === 0 ? 'A 厢' : 'B 厢';
  const status = dispatchReading.boarding ? `正在登车 · ${timeText(dispatchReading.untilDepartureMs)}后发车`
    : `${timeText(dispatchReading.untilBoardingMs)}后可登车`;
  dispatchOutput.value = `${cabin} · ${status} · 开往绝顶台`;
}

function toggleDispatch() {
  if (!canReadDispatch()) return;
  dispatchOpen = !dispatchOpen;
  draw();
}

function aim(e: number, n: number, moveKey: Move = 'KeyW', elevation = 0) {
  yaw = Math.atan2(e - east, n - north) + headingOffset[moveKey];
  pitch = elevation;
  draw();
}

function select(id: Case) {
  active = id;
  dispatchOpen = false;
  const [start, next] = cases[active];
  east = start!.east; north = start!.north;
  const height = floor(east, north);
  if (height === undefined) throw new Error('Missing physical support at the chapter start.');
  feet = height;
  keys.clear();
  accepted = rejected = maxStep = walked = 0;
  resets++;
  for (const name of Object.keys(cases)) document.getElementById(name)!.setAttribute('aria-pressed', String(name === active));
  aim(next!.east, next!.north);
}

function getState() {
  return { active, east, north, feet, frame, accepted, rejected, maxStep, walked, resets,
    dispatch: { available: canReadDispatch(), reading: dispatchReading },
    draws: renderer.info.render.calls, triangles: renderer.info.render.triangles, drawnParts: [...drawnParts] };
}

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  draw();
}

function keydown(event: KeyboardEvent) {
  if (event.code === 'KeyE' && !event.repeat) {
    event.preventDefault();
    toggleDispatch();
    return;
  }
  if (!(event.code in headingOffset)) return;
  event.preventDefault();
  keys.add(event.code);
}

window.addEventListener('resize', resize);
window.addEventListener('keydown', keydown);
window.addEventListener('keyup', event => keys.delete(event.code));
window.addEventListener('blur', () => keys.clear());
renderer.domElement.onpointerdown = event => {
  activePointer = event.pointerId;
  renderer.domElement.setPointerCapture(event.pointerId);
};
renderer.domElement.onlostpointercapture = () => { activePointer = null; };
renderer.domElement.onpointermove = event => {
  if (event.pointerId !== activePointer) return;
  yaw += event.movementX * .004;
  pitch = Math.min(1.01, Math.max(-1.01, pitch - event.movementY * .004));
  draw();
};
for (const id of Object.keys(cases) as Case[]) document.getElementById(id)!.onclick = () => select(id);
dispatchAction.onclick = toggleDispatch;

function tick(time: number) {
  clock.advance((time - lastTime) / 1_000, () => move(townPhysicsDelta));
  lastTime = time;
  draw();
  nextFrame = requestAnimationFrame(tick);
}

const proof = new URLSearchParams(location.search).get('proof') === '1';
select('gatekeeper');
resize();
if (proof) {
  Object.defineProperty(window, '__p5Review', { value: Object.freeze({
    getState, aim, speed,
    route: () => cases[active],
    post: () => posts.posts.find(post => post.id === active),
    advance(seconds: number) {
      if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 5) throw new RangeError('Invalid input duration.');
      const steps = Math.ceil(seconds / townPhysicsDelta);
      for (let step = 0; step < steps; step++) move(seconds / steps);
      draw();
      return getState();
    },
  }) });
} else nextFrame = requestAnimationFrame(tick);
window.addEventListener('beforeunload', () => {
  cancelAnimationFrame(nextFrame);
  plazaSurface.geometry.dispose();
  plazaSurface.material.dispose();
  posts.dispose();
  signs.dispose();
  assembly.dispose();
  renderer.dispose();
});
