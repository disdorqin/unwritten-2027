import { Color, DirectionalLight, HemisphereLight, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { createOrbitalLivingCabin } from './orbital-living-cabin';
import { createOrbitalObservationCabin } from './orbital-observation-cabin';

type RoomId = 'observation' | 'living';
const scene = new Scene();
scene.background = new Color('#14202b');
scene.add(new HemisphereLight('#d5dde3', '#6b5a4b', 1.15));
const fill = new DirectionalLight('#f3d5b4', 1.4);
fill.position.set(-3, 3.1, -3.8);
scene.add(fill);
const eye = 1.65;
const tick = 1 / 120;
const speed = 2.6;
const turnRate = 1.5;
const camera = new PerspectiveCamera(63, innerWidth / innerHeight, .035, 30);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(1.5, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);

const keys = new Set<string>();
const supportedKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);
const roomButtons = [...document.querySelectorAll<HTMLButtonElement>('button[data-room]')];
const mode = (id: RoomId) => id === 'living' ? { id, cabin: createOrbitalLivingCabin() } as const
  : { id, cabin: createOrbitalObservationCabin() } as const;
let current = mode('observation');
let { x, n, ground } = current.cabin.port.approach;
let yaw = 0, pitch = 0, remainder = 0, steps = 0, blocked = 0;

function switchRoom(id: RoomId) {
  current.cabin.dispose();
  current = mode(id);
  ({ x, n, ground } = current.cabin.port.approach);
  yaw = pitch = remainder = steps = blocked = 0;
  keys.clear();
  scene.add(current.cabin.group);
  for (const button of roomButtons) button.setAttribute('aria-pressed', String(button.dataset.room === id));
  draw();
}

function step() {
  const axis = (positive: string, negative: string) => Number(keys.has(positive)) - Number(keys.has(negative));
  yaw += axis('ArrowRight', 'ArrowLeft') * tick * turnRate;
  yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
  pitch = Math.min(1.15, Math.max(-1.15, pitch + axis('ArrowUp', 'ArrowDown') * tick * turnRate));
  const forward = axis('KeyW', 'KeyS');
  const strafe = axis('KeyD', 'KeyA');
  if (!forward && !strafe) return;
  const travel = speed * tick / Math.hypot(forward, strafe);
  const nextX = x + travel * (Math.sin(yaw) * forward + Math.cos(yaw) * strafe);
  const nextN = n + travel * (Math.cos(yaw) * forward - Math.sin(yaw) * strafe);
  if (current.cabin.isWalkable(nextX, nextN)) {
    x = nextX;
    n = nextN;
    ground = current.cabin.floorHeightAt(x, n)!;
    steps++;
  } else blocked++;
}

function draw() {
  camera.position.set(x, ground + eye, -n);
  camera.lookAt(x + Math.sin(yaw) * Math.cos(pitch), ground + eye + Math.sin(pitch),
    -n - Math.cos(yaw) * Math.cos(pitch));
  renderer.render(scene, camera);
}

function snapshot() {
  const { cabin } = current;
  const living = current.id === 'living' ? current.cabin : undefined;
  const observation = current.id === 'observation' ? current.cabin : undefined;
  return {
    id: current.id, pose: { x, n, ground, yaw, pitch }, eye, speed, turnRate, tick,
    port: cabin.port, route: living?.walkRoute, privateItem: living?.privateItem,
    windowView: observation?.viewPoint, bench: observation?.bench,
    steps, blocked, draws: renderer.info.render.calls, triangles: renderer.info.render.triangles,
  };
}

function advance(ms: number) {
  if (!Number.isFinite(ms) || ms < 0 || ms > 10_000) throw new RangeError('Invalid room review step');
  remainder += ms / 1000;
  const steps = Math.floor((remainder + 1e-10) / tick);
  for (let i = 0; i < steps; i++) step();
  remainder = Math.max(0, remainder - steps * tick);
  draw();
  return snapshot();
}

for (const button of roomButtons) button.addEventListener('click', () => switchRoom(button.dataset.room as RoomId));
addEventListener('keydown', event => {
  if (!supportedKeys.has(event.code) || event.altKey || event.ctrlKey || event.metaKey) return;
  event.preventDefault();
  keys.add(event.code);
});
addEventListener('keyup', event => keys.delete(event.code));
addEventListener('blur', () => keys.clear());
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  draw();
});

scene.add(current.cabin.group);
roomButtons[0]?.setAttribute('aria-pressed', 'true');
roomButtons[1]?.setAttribute('aria-pressed', 'false');
draw();
let nextFrame = 0;
if (new URL(location.href).searchParams.get('proof') === '1') {
  Object.assign(window, { orbitalCabinReview: { snapshot, advance } });
} else {
  let previous = performance.now();
  function frame(now: number) {
    advance(Math.min(50, now - previous));
    previous = now;
    nextFrame = requestAnimationFrame(frame);
  }
  nextFrame = requestAnimationFrame(frame);
}
addEventListener('pagehide', () => {
  cancelAnimationFrame(nextFrame);
  current.cabin.dispose();
  renderer.dispose();
}, { once: true });
