import { Color, PerspectiveCamera, Raycaster, Scene, Vector3, WebGLRenderer } from 'three';
import { mountOrbitalCabinSignage, orbitalCabinSignPlacements } from './orbital-cabin-signage';
import { createOrbitalEarlyRooms } from './orbital-early-rooms';

type SignId = typeof orbitalCabinSignPlacements[number]['id'];
const stands = {
  'airlock-nameplate': [0, -1.65],
  'cockpit-nameplate': [3.55, 6.92],
  'to-cockpit': [0, 1.57],
  'to-airlock': [0, 5.73],
  teleport: [-1.05, -1.66],
  'life-support': [1.05, -1.66],
} as const satisfies Record<SignId, readonly [number, number]>;
const rooms = createOrbitalEarlyRooms();
const signage = mountOrbitalCabinSignage(rooms.group);
const scene = new Scene();
scene.background = new Color('#14202b');
scene.add(rooms.group);
const camera = new PerspectiveCamera(38, innerWidth / innerHeight, .035, 40);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const buttons = [...document.querySelectorAll<HTMLButtonElement>('button[data-sign]')];
let selected: SignId = 'airlock-nameplate';

function inspect() {
  const placement = signage.inventory.find(sign => sign.id === selected)!;
  const [x, n] = stands[selected];
  const ground = rooms.floorHeightAt(x, n);
  if (ground === undefined || !rooms.isWalkable(x, n, .27)) throw new Error(`Blocked camera stand ${selected}`);
  const aim = new Vector3(placement.x, placement.y, -placement.n);
  camera.position.set(x, ground + 1.65, -n);
  camera.lookAt(aim);
  scene.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  const direction = aim.clone().sub(camera.position).normalize();
  const hit = new Raycaster(camera.position, direction).intersectObject(rooms.group, true)[0];
  const expected = placement.origin === 's2-wall' ? 'orbital-status-wall' : `orbital-sign-${selected}`;
  if (hit?.object.name !== expected) throw new Error(`Sign sightline mismatch ${selected}`);
  const indicators = { red: 0, green: 0, chronicleRings: 0 };
  rooms.group.traverse(node => {
    if (node.name === 'status-red') indicators.red++;
    if (node.name === 'status-life-support' || node.name === 'status-teleport') indicators.green++;
    if (node.name === 'town-chronicle-ring') indicators.chronicleRings++;
  });
  renderer.render(scene, camera);
  return {
    placement, stand: { x, n, ground }, camera: { position: camera.position.toArray(), lookAt: aim.toArray(),
      quaternion: camera.quaternion.toArray(), fov: camera.fov, aspect: camera.aspect },
    firstHit: { name: hit.object.name, distance: hit.distance }, indicators,
    draws: renderer.info.render.calls, triangles: renderer.info.render.triangles,
  };
}

function select(id: SignId) {
  selected = id;
  for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.sign === id));
  inspect();
}
for (const button of buttons) button.addEventListener('click', () => select(button.dataset.sign as SignId));
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  inspect();
});
addEventListener('pagehide', () => {
  signage.dispose();
  renderer.dispose();
}, { once: true });
select(selected);
if (new URL(location.href).searchParams.get('proof') === '1') {
  Object.assign(window, { orbitalSignageReview: { inspect } });
}
