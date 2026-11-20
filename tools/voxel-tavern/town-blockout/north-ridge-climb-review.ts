import {
  BoxGeometry, Color, DirectionalLight, Fog, Group, HemisphereLight, Mesh, MeshLambertMaterial, PerspectiveCamera,
  Scene, Vector3, WebGLRenderer,
} from 'three';
import { createNorthRidgeClimb, northRidgeClimbFaceAt } from './north-ridge-climb';
import { mountNorthRidgeClimb } from './north-ridge-climb-scene';

const mount = document.querySelector<HTMLElement>('#climb-scene')!;
const output = document.querySelector<HTMLOutputElement>('#climb-location')!;
const scene = new Scene();
scene.background = new Color('#b2c5d2');
scene.fog = new Fog('#b2c5d2', 42, 98);
scene.add(new HemisphereLight('#d8eeff', '#565363', 2.28));
const keyLight = new DirectionalLight('#f2ddd4', 1.56);
keyLight.position.set(380, 270, -783);
scene.add(keyLight);
const world = new Group();
scene.add(world);
const wall = mountNorthRidgeClimb(world);
const climb = createNorthRidgeClimb();
const camera = new PerspectiveCamera(51, 1, .06, 125);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.3));
const canvas = renderer.domElement;
canvas.tabIndex = 0;
canvas.setAttribute('aria-label', '北岭岩壁第三人称走查');
mount.prepend(canvas);

const avatar = new Group();
world.add(avatar);
const clothing = new Group();
avatar.add(clothing);
const block = new BoxGeometry(1, 1, 1);
const pine = new MeshLambertMaterial({ color: '#39675d' });
const padded = new MeshLambertMaterial({ color: '#4c6b78' });
const trim = new MeshLambertMaterial({ color: '#2b3344' });
const cap = new MeshLambertMaterial({ color: '#a82f37' });
const warm = new MeshLambertMaterial({ color: '#e8c6a1' });
const boots = new MeshLambertMaterial({ color: '#342c34' });
function piece(parent: Group, material: MeshLambertMaterial, x: number, y: number, z: number, sx: number, sy: number, sz: number) {
  const mesh = new Mesh(block, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  parent.add(mesh);
  return mesh;
}
piece(clothing, pine, 0, 1.15, 0, .54, .57, .32);
piece(clothing, trim, 0, 1.14, -.21, .34, .42, .14);
piece(clothing, warm, 0, 1.65, .04, .31, .32, .32);
piece(clothing, cap, 0, 1.835, .05, .36, .11, .39);
const limbs = [-1, 1].map(side => ({
  side,
  arm: piece(clothing, padded, 0, 0, 0, .18, .3, .18),
  glove: piece(clothing, cap, 0, 0, 0, .19, .15, .18),
  leg: piece(clothing, trim, side * .14, .43, .03, .20, .72, .22),
  boot: piece(clothing, boots, side * .14, .12, .10, .22, .20, .30),
}));
const unit = new Vector3(0, 1, 0);
const span = new Vector3();
const handTarget = new Vector3();
function updateAvatar(state: ReturnType<typeof climb.state>) {
  avatar.position.set(state.position.east, state.position.y, -state.position.north);
  avatar.rotation.y = Math.PI - state.yaw;
  const wallMode = state.mode === 'climbing' || state.mode === 'slipping';
  clothing.rotation.x = wallMode ? .16 : 0;
  avatar.updateMatrixWorld(true);
  for (const { side, arm, glove, leg, boot } of limbs) {
    const lead = (state.gripHands.lead === 'left') === (side > 0);
    const handStroke = wallMode && state.gripHands.moving ? Math.sin(state.gripHands.phase * Math.PI) * (lead ? .24 : -.08) : 0;
    const tremor = state.iceWarning ? .035 * Math.sin(performance.now() / 50) : 0;
    const shoulder = new Vector3(side * .31, 1.34, .02);
    if (wallMode) {
      const reach = state.position.y + 1.55 + handStroke;
      const centre = northRidgeClimbFaceAt(reach);
      const contact = northRidgeClimbFaceAt(reach, state.position.east + side * .30 + tremor - centre.east);
      handTarget.set(contact.east, contact.y, -contact.north - .075 - Math.abs(handStroke) * .22);
      glove.position.copy(clothing.worldToLocal(handTarget));
    } else glove.position.set(side * .30, .88, .09);
    span.copy(glove.position).sub(shoulder);
    arm.position.copy(shoulder).lerp(glove.position, .50);
    arm.scale.y = span.length();
    arm.quaternion.setFromUnitVectors(unit, span.normalize());
    leg.position.y = .43 + handStroke * .26;
    boot.position.y = .12 + handStroke * .30;
    boot.position.z = wallMode ? .20 : .10;
  }
}

const resize = new ResizeObserver(() => {
  camera.aspect = mount.clientWidth / Math.max(1, mount.clientHeight);
  camera.updateProjectionMatrix();
  renderer.setSize(mount.clientWidth, mount.clientHeight, false);
});
resize.observe(mount);
const commands = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyG', 'KeyR', 'KeyQ']);
const keys = new Set<string>();
const controllers = new AbortController();
const signal = controllers.signal;
const modeCopy = { standing: '岩台', climbing: '攀爬', slipping: '滑落', flight: '滑翔动作门', sled: '雪橇动作门' };
let lastGrip: boolean | undefined;
let lastFlight: boolean | undefined;
let lastSled: boolean | undefined;
let lastRelease: boolean | undefined;
let yaw = climb.state().yaw;
let pointer: { id: number; x: number } | undefined;

canvas.addEventListener('pointerdown', event => {
  canvas.focus();
  pointer = { id: event.pointerId, x: event.clientX };
  canvas.setPointerCapture(event.pointerId);
}, { signal });
canvas.addEventListener('pointermove', event => {
  if (pointer?.id !== event.pointerId) return;
  yaw += (event.clientX - pointer.x) * .003;
  pointer.x = event.clientX;
}, { signal });
canvas.addEventListener('lostpointercapture', () => { pointer = undefined; }, { signal });
window.addEventListener('keydown', event => {
  if (!commands.has(event.code) || event.ctrlKey || event.altKey || event.metaKey) return;
  event.preventDefault();
  keys.add(event.code);
  if (event.repeat) return;
  if (event.code === 'KeyE') {
    if (climb.state().mode === 'climbing') lastRelease = climb.release();
    else { lastGrip = climb.grip(yaw); if (lastGrip) yaw = climb.state().yaw; }
  }
  if (event.code === 'KeyG') lastFlight = climb.startOther('flight');
  if (event.code === 'KeyR') lastSled = climb.startOther('sled');
  if (event.code === 'KeyQ') climb.endOther();
}, { signal });
window.addEventListener('keyup', event => { keys.delete(event.code); }, { signal });
window.addEventListener('blur', () => { keys.clear(); }, { signal });

let previous = performance.now();
let ticks = 0;
renderer.setAnimationLoop(now => {
  const elapsed = Math.max(0, Math.min(.2, (now - previous) / 1_000));
  previous = now;
  const up = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
  const right = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
  const subdivisions = Math.max(1, Math.ceil(elapsed / .024));
  const dt = elapsed / subdivisions;
  for (let i = 0; i < subdivisions; i++) {
    const state = climb.state();
    if (state.mode === 'standing' && (up || right)) {
      climb.walkOnShelf(state.position.east - right * 1.35 * dt, state.position.north - up * 1.35 * dt);
    } else climb.step({ up, right }, dt);
    ticks++;
  }
  const state = climb.state();
  const { east, north, y } = state.position;
  updateAvatar(state);
  // A shoulder view shows the hands against the real face and the supported rock platforms.
  const facing = Math.sin(yaw) * 1.45;
  camera.position.set(east + 4.2 + facing, y + 2.68, -north - 5.6);
  camera.lookAt(east, y + 1.70, -north + .35);
  const status = `岩台 ${state.shelf + 1} · ${modeCopy[state.mode]}`;
  if (output.value !== status) output.value = status;
  renderer.render(scene, camera);
  Object.assign(canvas.dataset, {
    mode: state.mode, shelf: state.shelf, east: east.toFixed(4), north: north.toFixed(4), height: y.toFixed(4),
    warning: state.iceWarning, settled: state.iceSettled, lead: state.gripHands.lead, moving: state.gripHands.moving,
    swaps: state.handSwaps, slips: state.slips, recoveries: state.recoveries, damage: state.damageTaken,
    lastGrip, lastRelease, lastFlight, lastSled, ticks,
    draws: renderer.info.render.calls, triangles: renderer.info.render.triangles,
  });
});
window.addEventListener('pagehide', () => {
  controllers.abort();
  resize.disconnect();
  renderer.setAnimationLoop(null);
  wall.dispose();
  block.dispose();
  for (const material of [pine, padded, trim, cap, warm, boots]) material.dispose();
  renderer.dispose();
}, { once: true });
