import {
  AmbientLight, CanvasTexture, Color, DirectionalLight, DoubleSide, Fog, Group, Mesh, MeshBasicMaterial,
  PerspectiveCamera, PlaneGeometry, Raycaster, Scene, Vector2, Vector3, WebGLRenderer,
} from 'three';
import { createMainSummitBlock, mainSummitLayout, mainSummitSpec } from './main-summit-block';
import { cloudPavilionDimensions } from './main-summit-pavilions';
import { cloudPavilionSites, createPlacedCloudPavilion } from './main-summit-pavilion-site';

type Site = (typeof cloudPavilionSites)[number];
type StationId = Site['id'];
type View = 'approach' | 'center';

const scene = new Scene();
scene.background = new Color('#c5d5e5');
scene.fog = new Fog('#c5d5e5', 260, 1700);
scene.add(new AmbientLight('#edf3ff', 1.8));
const sunlight = new DirectionalLight('#fff1db', 2.3);
sunlight.position.set(-20, 35, 7);
scene.add(sunlight);

const terrain = createMainSummitBlock(mainSummitLayout, 347, 45);
scene.add(terrain.coarse);
const cloudCanvas = document.createElement('canvas');
cloudCanvas.width = cloudCanvas.height = 512;
const pattern = cloudCanvas.getContext('2d')!;
pattern.fillStyle = '#e6edf5';
pattern.fillRect(0, 0, 512, 512);
for (let index = 0; index < 88; index++) {
  const x = index * 197 % 512, z = index * 109 % 512;
  const gradient = pattern.createRadialGradient(x, z, 4, x, z, 21 + index % 43);
  gradient.addColorStop(0, index % 3 ? 'rgba(255,255,255,.88)' : 'rgba(173,193,215,.34)');
  gradient.addColorStop(1, 'rgba(245,250,255,0)');
  pattern.fillStyle = gradient;
  pattern.fillRect(0, 0, 512, 512);
}
const cloudTexture = new CanvasTexture(cloudCanvas);
for (const [index, height] of [380, 398, 414].entries()) {
  const layer = new Mesh(new PlaneGeometry(4600 - 440 * index, 4000), new MeshBasicMaterial({
    map: cloudTexture, transparent: true, opacity: .40 - index * .075, depthWrite: false, side: DoubleSide,
  }));
  layer.name = 'preview-cloud-layer';
  layer.rotation.x = -Math.PI / 2;
  layer.rotation.z = index * .24;
  layer.position.set(0, height, -850);
  scene.add(layer);
}

const pavilion = new Group();
pavilion.name = 'active-pavilion';
scene.add(pavilion);
const renderer = new WebGLRenderer({ antialias: true });
const camera = new PerspectiveCamera(56, 1, .08, 2500);
document.querySelector('#scene')!.append(renderer.domElement);
const position = document.querySelector<HTMLOutputElement>('#position')!;
const raycaster = new Raycaster();
const center = new Vector2(0, 0);
const centerPitch = -Math.PI / 12;
const stations = new Map<StationId, { site: Site; model: Group }>();
const drawnMaterials = new Set<string>();
let modelDraws = 0;
let terrainDraws = 0;
let frame = 0;
let view: View = 'approach';
let yaw = 0;
let pitch = 0;

for (const site of cloudPavilionSites) {
  const model = createPlacedCloudPavilion(site, terrain.heightAt);
  model.traverse(object => {
    if (!(object instanceof Mesh)) return;
    object.onAfterRender = (_renderer, _scene, _camera, _geometry, material) => {
      modelDraws++;
      if (material.name) drawnMaterials.add(material.name);
    };
  });
  stations.set(site.id, { site, model });
}
terrain.coarse.onAfterRender = () => { terrainDraws++; };
let active = stations.get('lower-cloud')!;

function selectView(next: View) {
  view = next;
  yaw = pitch = 0;
  for (const name of ['approach', 'center']) {
    document.querySelector(`#${name}`)!.setAttribute('aria-pressed', String(view === name));
  }
}

function select(id: StationId) {
  active = stations.get(id)!;
  pavilion.clear();
  pavilion.add(active.model);
  for (const name of stations.keys()) {
    document.querySelector(`#${name}`)!.setAttribute('aria-pressed', String(id === name));
  }
  selectView('approach');
}

function updateCamera() {
  const { site, model } = active;
  const dimensions = cloudPavilionDimensions[site.id];
  const forward = new Vector3(site.viewEast, 0, -site.viewNorth).normalize();
  if (view === 'approach') {
    const side = new Vector3(forward.z, 0, -forward.x);
    camera.position.set(site.approachEast, site.height + 2.8, -site.approachNorth)
      .addScaledVector(forward, -7.3)
      .addScaledVector(side, dimensions.width * .56);
    const ground = terrain.heightAt(camera.position.x, -camera.position.z);
    if (ground !== undefined) camera.position.y = Math.max(camera.position.y, ground + 2.35);
    camera.lookAt(site.east, site.height + 1.7, -site.north);
    return;
  }
  camera.position.set(site.east, site.height + dimensions.eyeY, -site.north)
    .addScaledVector(forward, dimensions.depth / 2 - .22);
  const bearing = model.rotation.y + yaw;
  const direction = new Vector3(Math.sin(bearing), Math.tan(centerPitch + pitch), Math.cos(bearing));
  camera.lookAt(camera.position.clone().add(direction));
}

function describeView() {
  const { site, model } = active;
  raycaster.setFromCamera(center, camera);
  raycaster.near = .035;
  const windowDistance = site.visibilityMetres;
  raycaster.far = windowDistance / Math.hypot(raycaster.ray.direction.x, raycaster.ray.direction.z);
  const pavilionHits = raycaster.intersectObject(model, true);
  const terrainHits = raycaster.intersectObject(terrain.coarse, false);
  let terrainClearance = Infinity;
  let terrainSamples = 0;
  if (view === 'center') {
    const point = new Vector3();
    for (let distance = .25; distance <= raycaster.far; distance += .5) {
      raycaster.ray.at(distance, point);
      const ground = terrain.heightAt(point.x, -point.z);
      if (ground !== undefined) {
        terrainClearance = Math.min(terrainClearance, point.y - ground);
        terrainSamples++;
      }
    }
  }
  return {
    windowDistance,
    rayDirection: raycaster.ray.direction.toArray(),
    pavilionHit: pavilionHits[0]?.distance ?? null,
    terrainHit: terrainHits[0]?.distance ?? null,
    terrainSamples,
    terrainClearance: terrainSamples ? terrainClearance : null,
  };
}

function sample() {
  const { site } = active;
  return {
    site, view, yaw, pitch, frame, centerPitch,
    inCloudBand: site.height >= mainSummitSpec.cloudBand[0] && site.height <= mainSummitSpec.cloudBand[1],
    pedestalGround: terrain.heightAt(site.east, site.north),
    approachGround: terrain.heightAt(site.approachEast, site.approachNorth),
    draws: renderer.info.render.calls, triangles: renderer.info.render.triangles,
    pavilionDraws: modelDraws, terrainDraws, materials: [...drawnMaterials].sort(),
    camera: { position: camera.position.toArray(), quaternion: camera.quaternion.toArray() },
    sightline: describeView(),
  };
}

function render() {
  updateCamera();
  modelDraws = terrainDraws = 0;
  drawnMaterials.clear();
  renderer.render(scene, camera);
  frame++;
  position.value = `E ${active.site.east.toFixed(2)} · N ${active.site.north.toFixed(2)} · Y ${active.site.height.toFixed(2)} 米`;
}

function resize() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  render();
}

window.addEventListener('keydown', event => {
  if (view !== 'center') return;
  const turn = Math.PI / 12;
  const look = Math.PI / 24;
  if (event.key === 'ArrowLeft') yaw += turn;
  else if (event.key === 'ArrowRight') yaw -= turn;
  else if (event.key === 'ArrowUp') pitch = Math.min(Math.PI / 4, pitch + look);
  else if (event.key === 'ArrowDown') pitch = Math.max(-Math.PI / 4, pitch - look);
  else if (event.key === 'Home') yaw = pitch = 0;
  else return;
  event.preventDefault();
  render();
});
window.addEventListener('resize', resize);
for (const id of stations.keys()) {
  document.querySelector<HTMLButtonElement>(`#${id}`)!.onclick = () => { select(id); render(); };
}
for (const id of ['approach', 'center'] as const) {
  document.querySelector<HTMLButtonElement>(`#${id}`)!.onclick = () => { selectView(id); render(); };
}
Object.defineProperty(window, '__p9Review', { value: Object.freeze({ sample }) });
select('lower-cloud');
resize();
