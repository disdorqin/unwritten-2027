import { BoxGeometry, Color, DirectionalLight, MathUtils, Mesh, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { createOrbitalEarlyRooms, type OrbitalRoomPoint } from './orbital-early-rooms';
import { mountOrbitalStatusDisplay } from './orbital-status-display';
import { initialOrbitalLogState, orbitalLogReviewSlots, readOrbitalLogReach, resolveOrbitalLogAction } from './orbital-status-log';

const viewport = document.querySelector<HTMLElement>('#status-viewport')!;
const message = document.querySelector<HTMLOutputElement>('#status-line')!;
const rooms = createOrbitalEarlyRooms();
const status = mountOrbitalStatusDisplay(rooms.group);
const scene = new Scene();
scene.background = new Color(0x151f2b);
scene.add(rooms.group);
const fill = new DirectionalLight(0xffe8cc, 1.15);
fill.position.set(-3, 4, -1);
scene.add(fill);
const camera = new PerspectiveCamera(54, 16 / 9, .035, 35);
camera.rotation.order = 'YXZ';
let renderer: WebGLRenderer | undefined;
try {
  renderer = new WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.4));
  renderer.domElement.setAttribute('aria-label', '轨道舱状态实景');
  viewport.append(renderer.domElement);
} catch {
  viewport.textContent = 'WebGL 未启用';
}

const book = rooms.group.getObjectByName('blank-log-bay')!;
const leaves = book.children.filter((child): child is Mesh<BoxGeometry> =>
  child instanceof Mesh && child.geometry instanceof BoxGeometry && child.geometry.parameters.height === .009);
const openingLeaf = leaves.find(leaf => leaf.position.x < 0)!;
const finalLeaf = leaves.find(leaf => leaf.position.x > 0)!;
const shortLeaf = finalLeaf.position.z;
const fullLeafScale = openingLeaf.geometry.parameters.depth / finalLeaf.geometry.parameters.depth;
const held = new Set<string>();
const movementKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);
let feet: OrbitalRoomPoint = { x: 0, n: -.42, ground: 0 };
let story = initialOrbitalLogState;
let yaw = Math.PI, pitch = -.04;
let physicalSteps = 0, blocked = 0, logKeyPresses = 0;

function move(x: number, n: number) {
  const ground = rooms.floorHeightAt(x, n);
  if (ground === undefined || !rooms.isWalkable(x, n, .22) || Math.abs(feet.ground - ground) > .15) {
    blocked++;
    return;
  }
  feet = { x, n, ground };
  physicalSteps++;
}

function draw() {
  const reach = readOrbitalLogReach(feet, rooms.cockpit);
  const { minN: cockpitStart } = rooms.rooms.cockpit;
  const view = feet.n >= cockpitStart ? 'cockpit' : feet.n > rooms.rooms.airlock.maxN ? 'passage' :
    feet.x >= 1.65 && feet.n <= -.75 ? 'life-support' : 'airlock';
  for (const leaf of leaves) leaf.visible = story.slot !== null;
  finalLeaf.position.z = story.lastReached ? shortLeaf : 0;
  finalLeaf.scale.z = story.lastReached ? 1 : fullLeafScale;
  if (story.lastReached !== status.pageReached) status.setLastLogPageReached(story.lastReached);

  camera.position.set(feet.x, feet.ground + 1.58, -feet.n);
  camera.rotation.set(pitch, yaw, 0);
  renderer?.render(scene, camera);
  Object.assign(viewport.dataset, {
    view, draws: String(renderer?.info.render.calls ?? 0), triangles: String(renderer?.info.render.triangles ?? 0),
    lastPage: String(status.pageReached), red: String(status.counts.red), green: String(status.counts.green), off: String(status.counts.off),
    x: feet.x.toFixed(4), n: feet.n.toFixed(4), ground: feet.ground.toFixed(4), yaw: yaw.toFixed(4), pitch: pitch.toFixed(4),
    leftReach: String(reach.left), rightReach: String(reach.right), steps: String(physicalSteps), blocked: String(blocked),
    logKeyPresses: String(logKeyPresses),
    slot: story.slot === null ? '' : String(story.slot + 1), slots: String(orbitalLogReviewSlots),
    pageText: rooms.cockpit.log.text, lastPageFill: story.lastReached ? String(rooms.cockpit.log.lastPageFill) : '',
  });
  const line = view === 'airlock' ? '16 红 · 2 绿 · 1 灭' : view === 'life-support' ? '最低维生运行' :
    view === 'passage' ? '通往驾驶舱' : story.lastReached ? '航行日志终端与轨道保持运行 · 页灯已灭' :
      story.slot !== null ? '空格翻阅 · 页灯亮' : reach.left && reach.right ? '同时按 Q 与 E 确认' : '走到控制台两手位之间';
  if (message.value !== line) message.value = line;
}

window.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  const hand = event.code === 'KeyQ' || event.code === 'KeyE';
  if (!hand && event.code !== 'Space' && !movementKeys.has(event.code)) return;
  event.preventDefault();
  held.add(event.code);
  if (event.repeat) return;
  if (hand || event.code === 'Space') logKeyPresses++;
  if (hand) story = resolveOrbitalLogAction(story, {
    type: 'confirm', leftHeld: held.has('KeyQ'), rightHeld: held.has('KeyE'),
  }, feet, rooms.cockpit);
  else if (event.code === 'Space') story = resolveOrbitalLogAction(story, { type: 'next' }, feet, rooms.cockpit);
});
window.addEventListener('keyup', event => held.delete(event.code));
window.addEventListener('blur', () => held.clear());
viewport.addEventListener('pointerdown', event => viewport.setPointerCapture(event.pointerId));
viewport.addEventListener('pointermove', event => {
  if (!viewport.hasPointerCapture(event.pointerId)) return;
  yaw -= event.movementX * .004;
  pitch = MathUtils.clamp(pitch - event.movementY * .004, -1.15, 1.15);
});
new ResizeObserver(() => {
  camera.aspect = viewport.clientWidth / Math.max(1, viewport.clientHeight);
  camera.updateProjectionMatrix();
  renderer?.setSize(viewport.clientWidth, viewport.clientHeight, false);
  draw();
}).observe(viewport);

let previous = performance.now();
renderer?.setAnimationLoop(now => {
  const dt = MathUtils.clamp((now - previous) / 1000, 0, .05);
  previous = now;
  yaw += (Number(held.has('ArrowLeft')) - Number(held.has('ArrowRight'))) * 1.45 * dt;
  pitch = MathUtils.clamp(pitch + (Number(held.has('ArrowUp')) - Number(held.has('ArrowDown'))) * dt, -1.15, 1.15);
  const ahead = Number(held.has('KeyW')) - Number(held.has('KeyS'));
  const side = Number(held.has('KeyD')) - Number(held.has('KeyA'));
  if (ahead || side) {
    const length = 2.35 * dt / Math.max(1, Math.hypot(ahead, side));
    move(feet.x + (side * Math.cos(yaw) - ahead * Math.sin(yaw)) * length,
      feet.n + (ahead * Math.cos(yaw) + side * Math.sin(yaw)) * length);
  }
  rooms.setWindowMotion(now / 1000);
  draw();
});
window.addEventListener('pagehide', () => {
  status.dispose();
  renderer?.setAnimationLoop(null);
  renderer?.dispose();
}, { once: true });
draw();
