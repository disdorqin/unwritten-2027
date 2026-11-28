import {
  AmbientLight, Color, DirectionalLight, Fog, Group, PerspectiveCamera, Scene, WebGLRenderer,
} from 'three';
import { createTownD2R30ProductionHost } from './town-d2-r30-production-host';
import {
  createEastSectorInstaller, createSouthSectorInstaller, createWestSectorInstaller,
} from './town-d2-r30-sector-installers';

/**
 * Independent review page for the D31 host: one owner group carrying the D2
 * central massif plus A's southern and B's western sectors, mounted for real.
 * It exists so the four-sector host can be looked at and measured in a browser
 * without touching the public viewer (window A's file).
 */

const scene = new Scene();
scene.background = new Color('#adbbce');
scene.fog = new Fog('#adbbce', 260, 1_500);
scene.add(new AmbientLight('#dce5f2', 1.6));
const sun = new DirectionalLight('#fff0d6', 2.05);
sun.position.set(-15, 30, 18);
scene.add(sun);

const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
document.querySelector('#scene')!.append(renderer.domElement);
const camera = new PerspectiveCamera(52, 1, .1, 4_000);

const world = new Group();
scene.add(world);
const host = createTownD2R30ProductionHost();
world.add(host.group);

const settlements = [
  host.install('A', createSouthSectorInstaller()),
  host.install('B', createWestSectorInstaller()),
  host.install('C2', createEastSectorInstaller()),
];

type View = 'south' | 'west' | 'summit' | 'north' | 'east';
/** Survey coordinates (east, height, north); the renderer flips north to -z. */
const views: Record<View, Readonly<{
  position: readonly [number, number, number];
  target: readonly [number, number, number];
}>> = {
  // A's southern walkway climbs out of the arrival plaza into the south ridge.
  south: { position: [180, 540, 60], target: [-40, 400, 400] },
  // B's western road and pavilion sit on the west shoulder.
  west: { position: [-210, 640, 700], target: [-700, 520, 980] },
  // The 800 m summit, seen from its own plateau shoulder.
  summit: { position: [300, 910, 780], target: [50, 800, 1_000] },
  // The central north wall and the climb route from the north side.
  north: { position: [260, 760, 1_180], target: [30, 620, 1_520] },
  // C2's east sector: switchbacks, camp and cliff walkway on the east flank.
  east: { position: [520, 700, 900], target: [900, 560, 1_150] },
};

let view: View = 'south';
let night = false;

const position = document.querySelector<HTMLOutputElement>('#position')!;
const status = document.querySelector<HTMLElement>('#status')!;
const buttons = Object.fromEntries((['south', 'west', 'summit', 'north', 'east'] as View[]).map(name => [
  name, document.querySelector<HTMLButtonElement>(`#view-${name}`)!,
]));
const nightButton = document.querySelector<HTMLButtonElement>('#night')!;

function updateCamera() {
  const { position: eye, target } = views[view];
  camera.position.set(eye[0], eye[1], -eye[2]);
  camera.lookAt(target[0], target[1], -target[2]);
  camera.updateMatrixWorld(true);
  camera.near = .1;
  camera.far = 4_000;
  camera.updateProjectionMatrix();
  position.textContent = `视角 ${view} · 高度 ${eye[1].toFixed(0)}m`;
}

function select(next: View) {
  view = next;
  for (const [name, button] of Object.entries(buttons)) button.setAttribute('aria-pressed', String(name === next));
  updateCamera();
  status.textContent = `已就位：${next}`;
}

for (const [name, button] of Object.entries(buttons)) button.addEventListener('click', () => select(name as View));
nightButton.addEventListener('click', () => {
  night = !night;
  host.setNight(night);
  nightButton.setAttribute('aria-pressed', String(night));
  status.textContent = night ? '夜间' : '白天';
});

function resize() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

let frame = 0;
function animate() {
  frame++;
  host.update(0, 900, performance.now());
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function getState() {
  const { position: eye } = views[view];
  return {
    view, frame, night,
    draws: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    geometries: renderer.info.memory.geometries,
    camera: { position: camera.position.toArray(), far: camera.far, aspect: camera.aspect },
    eyeHeight: eye[1],
    settlements: settlements.map(settlement => ({ ...settlement })),
    host: host.stats(),
    live: host.sectorLiveCheck(96),
  };
}

select('south');
resize();
status.textContent = '四区宿主已装配：D2 中央 + A 南区 + B 西区 + C2 东区。';
Object.defineProperty(window, '__d2HostReview', { value: Object.freeze({ getState, select }) });
requestAnimationFrame(animate);
