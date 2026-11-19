import {
  AmbientLight, Color, DirectionalLight, Fog, Group, Mesh, MeshLambertMaterial, PerspectiveCamera, PlaneGeometry, Scene, WebGLRenderer,
} from 'three';
import { createMainSummitBlock, mainSummitBounds, mainSummitLayout, mainSummitSpec } from './main-summit-block';
import { northRidgeSummit, sampleNorthRidge350 } from './north-ridge-350-terrain';
import { createTownPhysicsClock, townPhysicsDelta } from './town-physics-clock';

const scene = new Scene();
scene.background = new Color('#adbbce');
scene.fog = new Fog('#adbbce', 60, 220);
scene.add(new AmbientLight('#dce5f2', 1.5));
const sun = new DirectionalLight('#fff0d6', 2.05);
sun.position.set(-15, 30, 18);
scene.add(sun);
const stage = new Group();
scene.add(stage);

const renderer = new WebGLRenderer({ antialias: true });
const camera = new PerspectiveCamera(50, 1, .1, 2_400);
document.querySelector('#scene')!.append(renderer.domElement);

// Review alignment only. These sampled coordinates are not a host anchor.
const apronNorthRidgeEast = 300;
const apronNorthRidgeNorth = 676;
const frontRidgeAt = (east: number, north: number) =>
  sampleNorthRidge350(apronNorthRidgeEast + east, apronNorthRidgeNorth + north);
const arrivalHeight = 347;
const block = createMainSummitBlock(mainSummitLayout, arrivalHeight, 100);
stage.add(block.coarse);
const halfPlazaWidth = mainSummitSpec.arrivalPlaza[0] / 2;
const halfApronWidth = 6;
const apronSouth = -22;
const seamNorth = mainSummitBounds.south;
const plazaNorth = mainSummitSpec.arrivalPlaza[1];

const headings = {
  north: [0, -1_600], east: [1_600, 0], south: [0, 1_600], west: [-1_600, 0],
} as const;
type Heading = keyof typeof headings;
type View = Heading | 'gate';
type BlockReason = 'extent' | 'step' | 'gate' | 'aperture';
type DetailLayer = 'front-ridge' | 'main-summit';
type LayerChange = { from: DetailLayer; to: DetailLayer };
type LayerFrame = LayerChange & {
  frame: number;
  draws: number;
  triangles: number;
  coarsePresent: boolean;
  coarseRendered: boolean;
  activeDetailRendered: boolean;
  gateMounted: boolean;
  frontPresent: boolean;
  arrivalDetailPresent: boolean;
};

const buttons = Object.fromEntries((['gate', ...Object.keys(headings)] as View[]).map(name => [
  name, document.querySelector<HTMLButtonElement>(name === 'gate' ? '#gate' : `#view-${name}`)!,
])) as Record<View, HTMLButtonElement>;
const remountButton = document.querySelector<HTMLButtonElement>('#remount')!;
const disposeButton = document.querySelector<HTMLButtonElement>('#dispose')!;
const position = document.querySelector<HTMLOutputElement>('#position')!;
const status = document.querySelector<HTMLElement>('#status')!;

const startNorth = -14;
const arrivalNorth = 20;
const bodyRadius = .27;
const bodyHeight = 1.8;
const supportEpsilon = .025;
const stepHeight = .43;
const eyeHeight = 1.65;
const walkSpeed = 7.5;
const keys = new Set<string>();
const moveKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD']);
const clock = createTownPhysicsClock();

let view: View = 'gate';
let east = 0, north = startNorth, feet = frontRidgeAt(east, north);
let frontierReached = false, returned = false, disposed = false;
let accepted = 0, blocked = 0, seamCrossings = 0, maxAcceptedStep = 0;
let lastBlock: BlockReason | null = null;
let gate: ReturnType<typeof block.enter> | undefined;
let gateGeometryDisposals = 0, gateMaterialDisposals = 0;
let coarseGeometryDisposals = 0, coarseMaterialDisposals = 0;
let coarseRendered = false;
let activeDetailRendered = false;
let detail: { layer: DetailLayer; mesh: Mesh<PlaneGeometry, MeshLambertMaterial> } | undefined;
const frontFloorDisposals = { geometry: 0, material: 0 };
const arrivalFloorDisposals = { geometry: 0, material: 0 };
let pendingLayerChange: LayerChange | undefined;
const layerTransitions: LayerFrame[] = [];
let frame = 0, raf = 0, previousTime = performance.now();

block.coarse.geometry.addEventListener('dispose', () => coarseGeometryDisposals++);
block.coarse.material.addEventListener('dispose', () => coarseMaterialDisposals++);
block.coarse.onAfterRender = () => { coarseRendered = true; };

function removeDetail() {
  if (!detail) return;
  detail.mesh.removeFromParent();
  detail.mesh.geometry.dispose();
  detail.mesh.material.dispose();
  detail = undefined;
}

function mountDetail(layer: DetailLayer) {
  const front = layer === 'front-ridge';
  const width = 2 * (front ? halfApronWidth : halfPlazaWidth);
  const south = front ? apronSouth : seamNorth;
  const north = front ? seamNorth : plazaNorth;
  const centre = (south + north) / 2;
  const geometry = new PlaneGeometry(width, north - south, width, north - south);
  const vertices = geometry.getAttribute('position');
  const heightAt = front ? frontRidgeAt : block.heightAt;
  for (let index = 0; index < vertices.count; index++) {
    const height = heightAt(vertices.getX(index), centre + vertices.getY(index));
    vertices.setZ(index, height! - arrivalHeight);
  }
  geometry.computeVertexNormals();
  const material = new MeshLambertMaterial(front ? { color: '#99a9b7' } : {
    color: '#a8b5c3', polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  const disposals = front ? frontFloorDisposals : arrivalFloorDisposals;
  geometry.addEventListener('dispose', () => disposals.geometry++);
  material.addEventListener('dispose', () => disposals.material++);
  const mesh = new Mesh(geometry, material);
  mesh.name = front ? 'fixture-cloud-terrace' : 'fixture-main-summit-detail';
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, arrivalHeight, -centre);
  mesh.onAfterRender = () => { activeDetailRendered = true; };
  stage.add(mesh);
  detail = { layer, mesh };
}

function changeDetail(to: DetailLayer) {
  const from = detail?.layer;
  if (!from || from === to) return;
  removeDetail();
  mountDetail(to);
  pendingLayerChange = { from, to };
}

function detailPresent(layer: DetailLayer) {
  return detail?.layer === layer && detail.mesh.parent === stage;
}

function mountGate() {
  if (gate || disposed) return;
  gate = block.enter(stage);
  const materials = new Set<Mesh['material']>();
  for (const object of gate.group.children) {
    if (!(object instanceof Mesh) || Array.isArray(object.material)) continue;
    object.geometry.addEventListener('dispose', () => gateGeometryDisposals++);
    if (!materials.has(object.material)) {
      materials.add(object.material);
      object.material.addEventListener('dispose', () => gateMaterialDisposals++);
    }
  }
  frontierReached = returned = false;
  lastBlock = null;
  remountButton.disabled = true;
  status.textContent = '局部山门已挂载。';
}

function updateCamera() {
  if (view === 'gate') {
    camera.position.set(east, feet + eyeHeight, -north);
    camera.lookAt(east, feet + eyeHeight, -north - 1);
    return;
  }
  const [offsetEast, offsetZ] = headings[view];
  const { east: summitEast, north: summitNorth } = mainSummitLayout.summit;
  const [plateauWidth, plateauDepth] = mainSummitSpec.summitPlateau;
  camera.position.set(summitEast + offsetEast, northRidgeSummit.height, -summitNorth + offsetZ);
  camera.lookAt(summitEast + Math.sign(offsetEast) * (plateauWidth / 2 - .1), mainSummitSpec.summitHeight,
    -summitNorth + Math.sign(offsetZ) * (plateauDepth / 2 - .1));
}

function selectView(next: View) {
  if (disposed) return;
  view = next;
  keys.clear();
  clock.reset();
  for (const name of Object.keys(buttons) as View[]) {
    buttons[name].setAttribute('aria-pressed', String(name === next));
  }
  updateCamera();
}

function floorAt(x: number, n: number) {
  const halfWidth = n < seamNorth ? halfApronWidth : halfPlazaWidth;
  if (Math.abs(x) > halfWidth - bodyRadius || n < apronSouth + bodyRadius ||
      n > plazaNorth - bodyRadius) return undefined;
  return n < seamNorth ? frontRidgeAt(x, n) : block.heightAt(x, n);
}

function gateClearance(x: number, n: number, y: number): number | null {
  let clearance = Infinity;
  for (const { min, max } of gate?.colliders ?? []) {
    if (y + bodyHeight - supportEpsilon <= min[1] || y + supportEpsilon >= max[1]) continue;
    const dx = Math.max(min[0] - x, x - max[0], 0);
    const dz = Math.max(min[2] + n, -n - max[2], 0);
    clearance = Math.min(clearance, Math.hypot(dx, dz) - bodyRadius);
  }
  return Number.isFinite(clearance) ? clearance : null;
}

function rejectMove(reason: BlockReason) {
  blocked++;
  lastBlock = reason;
  if (reason === 'aperture') status.textContent = '请从山门门洞穿过。';
  else status.textContent = reason === 'gate' ? '门框挡住了这一步。' : '已到局部试走范围边界。';
}

function move() {
  if (!gate) return;
  const lateral = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
  const forward = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
  if (lateral === 0 && forward === 0) return;
  const unit = walkSpeed * townPhysicsDelta / Math.hypot(lateral, forward);
  const nextEast = east + lateral * unit, nextNorth = north + forward * unit;
  const nextFeet = floorAt(nextEast, nextNorth);
  if (nextFeet === undefined) return rejectMove('extent');
  if (Math.abs(nextFeet - feet) > stepHeight) return rejectMove('step');
  if ((gateClearance(nextEast, nextNorth, nextFeet) ?? Infinity) < 0) return rejectMove('gate');

  const crossesSeam = (north < seamNorth) !== (nextNorth < seamNorth);
  if (crossesSeam) {
    const fraction = (seamNorth - north) / (nextNorth - north);
    const crossingEast = east + (nextEast - east) * fraction;
    const centreClearance = mainSummitLayout.gate.clearWidth / 2 - bodyRadius;
    if (Math.abs(crossingEast) > centreClearance) return rejectMove('aperture');
  }

  maxAcceptedStep = Math.max(maxAcceptedStep, Math.abs(nextFeet - feet));
  if (crossesSeam) {
    seamCrossings++;
    changeDetail(nextNorth < seamNorth ? 'front-ridge' : 'main-summit');
  }
  [east, north, feet] = [nextEast, nextNorth, nextFeet];
  accepted++;
  lastBlock = null;
  if (!frontierReached && north >= arrivalNorth) {
    frontierReached = true;
    status.textContent = '已抵达行前坪。';
  } else if (frontierReached && north <= startNorth) {
    returned = true;
    block.leave();
    gate = undefined;
    keys.clear();
    remountButton.disabled = false;
    status.textContent = '已回到外坪，门体已卸载。';
  }
}

function getState() {
  return {
    view, east, north, feet, frontierReached, returned, accepted, blocked, lastBlock, frame, seamCrossings, maxAcceptedStep,
    wallClearance: gateClearance(east, north, feet),
    draws: renderer.info.render.calls, triangles: renderer.info.render.triangles,
    geometries: renderer.info.memory.geometries,
    gateMounted: gate?.group.parent === stage, gateMeshes: gate?.group.children.length ?? 0,
    gateGeometryDisposals, gateMaterialDisposals,
    coarsePresent: block.coarse.parent === stage, coarseVisible: block.coarse.parent === stage && coarseRendered,
    coarseGeometryDisposals, coarseMaterialDisposals,
    apronPresent: detailPresent('front-ridge'), arrivalDetailPresent: detailPresent('main-summit'),
    detailLayer: detail?.layer ?? null, activeDetailRendered,
    frontFloorDisposals: { ...frontFloorDisposals }, arrivalFloorDisposals: { ...arrivalFloorDisposals },
    layerTransitions: layerTransitions.map(change => ({ ...change })), disposed,
    camera: { position: camera.position.toArray(), quaternion: camera.quaternion.toArray(),
      aspect: camera.aspect, fov: camera.fov, far: camera.far },
  };
}

function onKeyDown(event: KeyboardEvent) {
  if (disposed || view !== 'gate' || !moveKeys.has(event.code) || event.ctrlKey || event.metaKey || event.altKey) return;
  event.preventDefault();
  keys.add(event.code);
}

function onKeyUp(event: KeyboardEvent) { keys.delete(event.code); }
function onBlur() { keys.clear(); }

function resize() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}

function animate(now: number) {
  if (view === 'gate') clock.advance(Math.min((now - previousTime) / 1_000, .1), move);
  previousTime = now;
  updateCamera();
  coarseRendered = false;
  activeDetailRendered = false;
  renderer.render(scene, camera);
  frame++;
  if (pendingLayerChange) {
    layerTransitions.push({ ...pendingLayerChange, frame, draws: renderer.info.render.calls, triangles: renderer.info.render.triangles,
      coarsePresent: block.coarse.parent === stage, coarseRendered, activeDetailRendered, gateMounted: gate?.group.parent === stage,
      frontPresent: detailPresent('front-ridge'), arrivalDetailPresent: detailPresent('main-summit') });
    pendingLayerChange = undefined;
  }
  position.value = `${view} · E ${east.toFixed(3)} / N ${north.toFixed(3)} / Y ${feet.toFixed(3)}`;
  raf = requestAnimationFrame(animate);
}

function dispose() {
  if (disposed) return;
  disposed = true;
  cancelAnimationFrame(raf);
  keys.clear();
  block.dispose();
  gate = undefined;
  removeDetail();
  coarseRendered = activeDetailRendered = false;
  stage.removeFromParent();
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
  window.removeEventListener('blur', onBlur);
  window.removeEventListener('resize', resize);
  renderer.dispose();
  renderer.domElement.remove();
  for (const button of Object.values(buttons)) button.disabled = true;
  remountButton.disabled = disposeButton.disabled = true;
  status.textContent = '试览已释放。';
}

for (const name of Object.keys(buttons) as View[]) buttons[name].onclick = () => selectView(name);
remountButton.onclick = () => { mountGate(); selectView('gate'); };
disposeButton.onclick = dispose;
window.addEventListener('keydown', onKeyDown);
window.addEventListener('keyup', onKeyUp);
window.addEventListener('blur', onBlur);
window.addEventListener('resize', resize);
window.addEventListener('pagehide', dispose, { once: true });
Object.defineProperty(window, '__p1Review', { value: Object.freeze({ getState }) });
mountDetail('front-ridge');
mountGate();
resize();
updateCamera();
raf = requestAnimationFrame(animate);
