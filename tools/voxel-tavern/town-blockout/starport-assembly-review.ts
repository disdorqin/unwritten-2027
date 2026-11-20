import {
  AmbientLight, BoxGeometry, Color, DirectionalLight, Fog, IcosahedronGeometry, InstancedMesh, Matrix4, Mesh, MeshLambertMaterial,
  PerspectiveCamera, Ray, Scene, Vector3, WebGLRenderer,
} from 'three';
import { createStarportAssembly, starportAssemblyParts, type StarportAssemblyPart } from '../../../src/shared/starport-assembly';
import { buildStarportAssemblyRack } from './starport-assembly-rack';
import { createDesktopLook } from './desktop-look';

const scene = new Scene();
scene.background = new Color('#aabec9');
scene.fog = new Fog(scene.background, 15, 97);
scene.add(new AmbientLight('#e5f0fb', 1.38));
const sun = new DirectionalLight('#fff2d0', 2.3);
sun.position.set(8, 13, 7);
scene.add(sun);
function box(colour: string, dimensions: readonly [number, number, number], at: readonly [number, number, number]) {
  const mesh = new Mesh(new BoxGeometry(...dimensions), new MeshLambertMaterial({ color: colour }));
  mesh.position.set(...at);
  scene.add(mesh);
  return mesh;
}
box('#8d999b', [16, .34, 14], [0, -.17, 1]);
const tiles = new InstancedMesh(new BoxGeometry(.95, .035, .95), new MeshLambertMaterial({ color: '#ffffff' }), 195);
const tileTransform = new Matrix4();
const coolStone = new Color('#a6b1ad');
const grayStone = new Color('#9ca7a5');
let tileCount = 0;
for (let x = -7; x <= 7; x++) {
  for (let z = -5; z <= 7; z++) {
    if (x % 2 === 0 || z <= -2) {
      tiles.setMatrixAt(tileCount, tileTransform.makeTranslation(x, -.012, z));
      tiles.setColorAt(tileCount++, (x + z) % 3 === 0 ? coolStone : grayStone);
    }
  }
}
tiles.count = tileCount;
scene.add(tiles);
for (const x of [-5, 5]) box('#ba9a54', [.09, .025, 8], [x, .02, 1]);
const rocks = new IcosahedronGeometry(1, 1);
for (let index = 0; index < 11; index++) {
  const rock = new Mesh(rocks, new MeshLambertMaterial({ color: index % 3 ? '#83939e' : '#afb8ba' }));
  rock.position.set(-35 + index * 7, -4, -23 - (index % 3) * 6);
  rock.scale.set(5 + index % 4 * 2, 5 + index % 7, 7);
  scene.add(rock);
}

const rack = buildStarportAssemblyRack();
scene.add(rack.group);
const ignition = { x: 0, y: 2.04, z: .36 };
box('#414e4d', [.56, .29, .19], [0, 2.04, .29]);
const indicator = box('#b8794f', [.23, .075, .025], [0, 2.04, .4]);

const status = document.querySelector<HTMLElement>('#status')!;
const prompt = document.querySelector<HTMLElement>('#aim')!;
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.domElement.tabIndex = 0;
document.querySelector('#scene')!.append(renderer.domElement);
const camera = new PerspectiveCamera(58, 1, .08, 105);
const eyeHeight = 1.65;
const aim = new Vector3();
const sight = new Ray();
const foot = { x: 0, y: 0, z: 2.25 };
let yaw = 0, pitch = -.19;
let previous: number | undefined;
let attempts = 0;
let lastResult = '';
let keyOne = false, layersOverlap = false;
const player = 'starport-review';
const held = new Set<string>();
const moveKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);
const partLabels: Record<StarportAssemblyPart, string> = { 'snow-wing': '雪翼', booster: '助推器', 'navigation-core': '导航芯' };
type Target = StarportAssemblyPart | 'ignition';

const acceptedPoint = ({ x, z }: { x: number; z: number }) => ({ east: x, north: -z, height: 0 });
const sockets = {
  'snow-wing': acceptedPoint(rack.sockets['snow-wing']),
  booster: acceptedPoint(rack.sockets.booster),
  'navigation-core': acceptedPoint(rack.sockets['navigation-core']),
};
const positions = [...starportAssemblyParts, 'ignition'] as const;
const targets = Object.fromEntries(positions.map(target => {
  const { x, y, z } = target === 'ignition' ? ignition : rack.sockets[target];
  return [target, new Vector3(x, y, z)];
})) as Record<Target, Vector3>;

// The review drives the same transactional API through an isolated store.
// The production host supplies real ownership, accepted feet, and beacon state.
let profile = { carried: ['snow-wing', 'booster'] as readonly StarportAssemblyPart[],
  installed: [] as readonly StarportAssemblyPart[], ignited: false, revision: 0 };
const assembly = createStarportAssembly({ sockets, ignitionPoint: acceptedPoint(ignition), reach: 2.12 }, {
  read: id => id === player ? profile : undefined,
  pose: id => id === player ? acceptedPoint(foot) : undefined,
  readIgnition: () => ({ keyOne, layersOverlap }),
  commit(id, expected, next, guard) {
    if (id !== player || profile.revision !== expected || !guard()) return false;
    profile = next;
    return true;
  },
});

let aimedSlot: Target | null = null;
function selectedTarget() {
  sight.set(camera.position, aim);
  let closest = Infinity;
  let selected: Target | null = null;
  for (const target of positions) {
    const point = targets[target];
    const distance = sight.distanceSqToPoint(point);
    if (point.distanceToSquared(camera.position) > 20 || distance > .32 ** 2 || distance >= closest) continue;
    if ((point.z - camera.position.z) * aim.z + (point.x - camera.position.x) * aim.x < 0) continue;
    selected = target;
    closest = distance;
  }
  return selected;
}

const descriptions: Record<string, string> = {
  'select-component': '对准零件槽或点火面板。', 'not-carried': '身上没有这件零件。',
  'already-installed': '这件零件已经装好。', 'missing-key': '需要讲古钥一。', 'window-closed': '等到信标首分钟再点火。',
  incomplete: '三件装齐后才能点火。', 'out-of-reach': '往装配架靠近一点。',
  placed: '零件已装入架体。', ignited: '飞行器已获点火许可。', 'already-ignited': '飞行器已获点火许可。',
};
async function interact() {
  attempts++;
  if (!aimedSlot) lastResult = 'select-component';
  else {
    const result = aimedSlot === 'ignition' ? await assembly.ignite(player) : await assembly.place(player, aimedSlot);
    lastResult = result.kind;
  }
  status.textContent = descriptions[lastResult] ?? '当前动作未提交。';
}

function fixture(id: string, supply: () => void) {
  const button = document.querySelector<HTMLButtonElement>(`#${id}`)!;
  button.onclick = () => { supply(); button.disabled = true; renderer.domElement.focus(); };
}
fixture('review-nav', () => { profile = { ...profile, carried: [...profile.carried, 'navigation-core'], revision: profile.revision + 1 }; });
fixture('review-key', () => { keyOne = true; });
fixture('review-night', () => { layersOverlap = true; });
createDesktopLook(renderer.domElement, () => true, (horizontal, vertical) => {
  yaw += horizontal;
  pitch = Math.max(-1.29, Math.min(1.29, pitch + vertical));
});
addEventListener('keydown', event => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (moveKeys.has(event.code)) { held.add(event.code); event.preventDefault(); }
  if (event.code === 'KeyE' && !event.repeat) { event.preventDefault(); void interact(); }
});
addEventListener('keyup', event => held.delete(event.code));
addEventListener('blur', () => held.clear());

function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
addEventListener('resize', resize);
resize();
renderer.setAnimationLoop(now => {
  const dt = Math.min(.06, (now - (previous ?? now)) / 1000);
  previous = now;
  yaw += (Number(held.has('ArrowRight')) - Number(held.has('ArrowLeft'))) * 1.6 * dt;
  pitch = Math.max(-1.29, Math.min(1.29, pitch + (Number(held.has('ArrowUp')) - Number(held.has('ArrowDown'))) * 1.6 * dt));
  const right = Number(held.has('KeyD')) - Number(held.has('KeyA'));
  const forward = Number(held.has('KeyW')) - Number(held.has('KeyS'));
  const speed = 3.2 * dt / Math.max(1, Math.hypot(right, forward));
  foot.x = Math.max(-3.6, Math.min(3.6, foot.x + (Math.cos(yaw) * right + Math.sin(yaw) * forward) * speed));
  foot.z = Math.max(1.28, Math.min(5, foot.z + (Math.sin(yaw) * right - Math.cos(yaw) * forward) * speed));
  camera.position.set(foot.x, eyeHeight, foot.z);
  aim.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  camera.lookAt(camera.position.x + aim.x, camera.position.y + aim.y, camera.position.z + aim.z);
  aimedSlot = selectedTarget();
  prompt.hidden = !aimedSlot;
  prompt.textContent = aimedSlot === 'ignition' ? 'E · 点火' : aimedSlot ? `E · ${partLabels[aimedSlot]}槽` : '';
  rack.showParts(profile.installed);
  indicator.material.color.set(profile.ignited ? '#a1cc81' : '#b8794f');
  renderer.render(scene, camera);
  document.dispatchEvent(new CustomEvent('starport-assembly-review-frame', { detail: {
    foot: { ...foot }, yaw, pitch, eyeHeight, aimedSlot, installed: profile.installed, carried: profile.carried,
    assembled: profile.installed.length === starportAssemblyParts.length, ignited: profile.ignited, attempts, lastResult,
  } }));
});

addEventListener('pagehide', event => {
  if (event.persisted) return;
  renderer.setAnimationLoop(null);
  rack.dispose();
  renderer.dispose();
});
