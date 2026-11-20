import {
  ACESFilmicToneMapping, AmbientLight, Box3, Color, DirectionalLight, Group, HemisphereLight,
  InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, OrthographicCamera, Scene, SphereGeometry, Vector3, WebGLRenderer,
} from 'three';
import { createSnowWingVisual, createFlightBoosterVisual } from './flight-equipment-visuals';

const wing = createSnowWingVisual();
const looseBooster = createFlightBoosterVisual();
const mounted = createFlightBoosterVisual();
const wingOnly = createSnowWingVisual();
const bay = new Vector3().fromArray(wing.mounts.boosterBay.position);
const socket = new Vector3().fromArray(mounted.mounts.wingSocket.position);
mounted.group.position.copy(bay).sub(socket);
wing.group.add(mounted.group);

const rig = new Group();
rig.add(wing.group);
const solo = new Group();
solo.add(wingOnly.group);
const boosterRig = new Group();
boosterRig.add(looseBooster.group);
const scene = new Scene();
scene.background = new Color('#223745');
scene.add(rig, solo, boosterRig);
scene.add(new HemisphereLight('#f9fcff', '#687989', 1.25));
scene.add(new AmbientLight('#aabdd4', .2));
const key = new DirectionalLight('#fff4df', 2.1);
key.position.set(-3, 7, -3);
scene.add(key);
const fill = new DirectionalLight('#d1e9ff', .7);
fill.position.set(6, 3, 5);
scene.add(fill);

const camera = new OrthographicCamera(-3, 3, 2, -2, .025, 90);
const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.setPixelRatio(1);
const host = document.querySelector('#stage')!;
const label = document.querySelector('#view')!;
host.append(renderer.domElement);
const mountMarks = new Group();
mountMarks.name = 'temporary-evidence-markers';
rig.add(mountMarks);
const markShape = new SphereGeometry(.065, 10, 8);
function marker(markPosition: Vector3, color: string) {
  const mark = new Mesh(markShape, new MeshBasicMaterial({ color, depthTest: false }));
  mark.position.copy(markPosition);
  mark.renderOrder = 2;
  mountMarks.add(mark);
}
marker(new Vector3().fromArray(wing.mounts.leftHand.position), '#ffb762');
marker(new Vector3().fromArray(wing.mounts.rightHand.position), '#ffb762');
marker(bay, '#62fff0');
for (const exhaust of [mounted.mounts.leftExhaust, mounted.mounts.rightExhaust]) {
  marker(new Vector3().fromArray(exhaust.position).add(mounted.group.position), '#f98de5');
}
mountMarks.visible = false;

const views = {
  'wing-front': { rig: solo, dir: [0, .14, 1], label: '雪翼 · 正面' },
  'wing-top': { rig: solo, dir: [0, 1, .001], label: '雪翼 · 俯视' },
  'booster-side': { rig: boosterRig, dir: [1, .09, 0], label: '助推器 · 侧面' },
  'booster-rear': { rig: boosterRig, dir: [.14, .13, -1], label: '助推器 · 双喷口' },
  'assembly-rear': { rig, dir: [.19, .26, -1], label: '合体 · 后侧' },
  'assembly-side': { rig, dir: [1, .12, -.12], label: '合体 · 侧面' },
  'assembly-front': { rig, dir: [0, .10, 1], label: '合体 · 正面' },
  'mount-register': { rig, dir: [.61, .31, -1], label: '挂点 · 橙为双手，青为翼座，粉为双喷口' },
} as const;

const draws = new Map<string, { draws: number, instances: number, triangles: number }>();
for (const visual of [wing, wingOnly, mounted, looseBooster]) {
  visual.group.traverse(object => {
    if (!(object instanceof InstancedMesh)) return;
    object.onAfterRender = () => {
      const batch = draws.get(object.name) ?? { draws: 0, instances: 0, triangles: 0 };
      batch.draws++;
      batch.instances += object.count;
      const vertices = object.geometry.index?.count ?? object.geometry.getAttribute('position').count;
      batch.triangles += object.count * vertices / 3;
      draws.set(object.name, batch);
    };
  });
}

const rounded = (n: number) => Math.round(n * 1e7) / 1e7;
const v = (p: Vector3) => p.toArray().map(rounded);
function box(value: Box3) { return { min: v(value.min), max: v(value.max), size: v(value.getSize(new Vector3())) }; }
function projectBox(bounds: Box3) {
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    const point = new Vector3(x, y, z).project(camera);
    min.min(point);
    max.max(point);
  }
  return { min: v(min), max: v(max) };
}

function render(id: keyof typeof views) {
  const view = views[id];
  const active = view.rig;
  label.textContent = view.label;
  for (const group of [rig, solo, boosterRig]) group.visible = group === active;
  mountMarks.visible = false;
  scene.updateMatrixWorld(true);
  const bound = active === rig ? new Box3().setFromObject(wing.group) : new Box3().setFromObject(active);
  const centroid = bound.getCenter(new Vector3());
  camera.position.copy(centroid).addScaledVector(new Vector3().fromArray(view.dir).normalize(), 9);
  camera.lookAt(centroid);
  camera.updateMatrixWorld(true);
  const cameraBox = new Box3().copy(bound).applyMatrix4(camera.matrixWorldInverse);
  const projected = cameraBox.getSize(new Vector3());
  const width = host.clientWidth;
  const height = window.innerHeight - 44;
  renderer.setSize(width, height, false);
  const aspect = width / height;
  const extent = Math.max(projected.y / 2, projected.x / (2 * aspect)) * 1.20;
  const projectedCenter = cameraBox.getCenter(new Vector3());
  camera.left = projectedCenter.x - extent * aspect;
  camera.right = projectedCenter.x + extent * aspect;
  camera.top = projectedCenter.y + extent;
  camera.bottom = projectedCenter.y - extent;
  camera.updateProjectionMatrix();
  mountMarks.visible = id === 'mount-register';
  draws.clear();
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  const samples = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, samples);
  const low = { x: width, y: height };
  const high = { x: -1, y: -1 };
  let imagePixels = 0;
  for (let y = 0; y < height; y += 2) for (let x = 0; x < width; x += 2) {
    const offset = (y * width + x) * 4;
    if (Math.abs(samples[offset] - samples[0]) + Math.abs(samples[offset + 1] - samples[1]) + Math.abs(samples[offset + 2] - samples[2]) < 23) continue;
    imagePixels++;
    low.x = Math.min(low.x, x); low.y = Math.min(low.y, y);
    high.x = Math.max(high.x, x); high.y = Math.max(high.y, y);
  }
  return { id, rendered: { ...renderer.info.render }, batches: Object.fromEntries(draws), bounds: box(bound),
    imagePixels, pixelBounds: { low, high }, glError: gl.getError(), ndc: projectBox(bound), width, height };
}

function voxelBoxes(group: Group) {
  const batch = group.getObjectByName(group.name + '-voxels');
  if (!(batch instanceof InstancedMesh)) throw new Error(`No instanced mesh found for ${group.name}.`);
  batch.geometry.computeBoundingBox();
  const unitBox = batch.geometry.boundingBox!;
  const transform = new Matrix4();
  return Array.from({ length: batch.count }, (_, index) => {
    batch.getMatrixAt(index, transform);
    return unitBox.clone().applyMatrix4(transform.premultiply(batch.matrixWorld));
  });
}

function inspect() {
  scene.updateMatrixWorld(true);
  const bayWorld = wing.group.getObjectByName('mount:boosterBay')!.getWorldPosition(new Vector3());
  const socketWorld = mounted.group.getObjectByName('mount:wingSocket')!.getWorldPosition(new Vector3());
  const gl = renderer.getContext();
  const gpu = gl.getExtension('WEBGL_debug_renderer_info');
  const exhausts = [mounted.mounts.leftExhaust, mounted.mounts.rightExhaust];
  const axesDot = new Vector3().fromArray(wing.mounts.boosterBay.forward).dot(new Vector3().fromArray(mounted.mounts.wingSocket.forward));
  const wingBoxes = voxelBoxes(wing.group);
  const boosterBoxes = voxelBoxes(mounted.group);
  let contactPairs = 0;
  let penetrationPairs = 0;
  for (const a of wingBoxes) for (const b of boosterBoxes) {
    const x = Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x);
    const y = Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y);
    const z = Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z);
    if (x <= 1e-6 || z <= 1e-6) continue;
    if (y > 1e-6) penetrationPairs++;
    else if (Math.abs(y) <= 1e-6) contactPairs++;
  }
  return {
    wing: { declared: box(wingOnly.bounds), measured: box(new Box3().setFromObject(wingOnly.group)), mounts: wing.mounts, name: wing.group.name },
    booster: { declared: box(looseBooster.bounds), measured: box(new Box3().setFromObject(looseBooster.group)), mounts: mounted.mounts, name: mounted.group.name },
    mating: { groupTranslation: v(mounted.group.position), parent: mounted.group.parent?.name, bayWorld: v(bayWorld), socketWorld: v(socketWorld),
      gap: bayWorld.distanceTo(socketWorld), axesDot, contactPairs, penetrationPairs,
      exhaustWorld: exhausts.map(exhaust => v(mounted.group.localToWorld(new Vector3().fromArray(exhaust.position)))),
      gripSpan: new Vector3().fromArray(wing.mounts.leftHand.position).distanceTo(new Vector3().fromArray(wing.mounts.rightHand.position)) },
    graphics: { renderer: gpu ? gl.getParameter(gpu.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), version: gl.getParameter(gl.VERSION) },
  };
}

Object.assign(window, { f7Probe: { render, inspect } });
render('assembly-rear');
