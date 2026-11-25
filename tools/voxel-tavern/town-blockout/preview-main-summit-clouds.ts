import { AmbientLight, Color, DirectionalLight, Fog, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { createMainSummitBlock, mainSummitBounds, mainSummitLayout } from './main-summit-block';
import { createMainSummitCloudLayer, mainSummitCloudSpec } from './main-summit-cloud-layer';

const altitudeViews = { below: 350, bottom: 380, inside: 474, top: 560, above: 650 } as const;
const winds = {
  calm: { east: 0, north: 0 }, weak: { east: 4.99, north: 0 }, threshold: { east: 5, north: 0 },
  eastward: { east: 9, north: 0 }, westward: { east: -9, north: 0 }, northward: { east: 0, north: 9 },
  southward: { east: 0, north: -9 },
} as const;
type View = keyof typeof altitudeViews | 'overview' | 'west' | 'east';
type Wind = keyof typeof winds;

const scene = new Scene();
const p1 = createMainSummitBlock(mainSummitLayout, 347, 25);
const cloud = createMainSummitCloudLayer({ bounds: mainSummitBounds, summit: mainSummitLayout.summit,
  shoulders: mainSummitLayout.shoulders, heightAt: p1.heightAt });
const root = document.querySelector<HTMLElement>('#scene')!;
const readout = document.querySelector<HTMLOutputElement>('#readout')!;
const camera = new PerspectiveCamera(50, 1, 2, 4200);
const renderer = new WebGLRenderer({ antialias: true });
renderer.domElement.setAttribute('aria-label', 'P-1 主峰与 P-8 云海');
root.append(renderer.domElement);

const sky = new Color('#9ab7d2');
const fogColor = new Color('#d9e5ee');
scene.background = sky;
const fog = new Fog(fogColor, 1, 4200);
p1.coarse.material.fog = true;
const sun = new DirectionalLight('#e7f1ff', 1.7);
sun.position.set(-800, 1500, 1000);
scene.add(p1.coarse, cloud.group, new AmbientLight('#ecf6ff', 1.5), sun);

let view: View = 'overview';
let wind: Wind = 'eastward';
let epoch = 27000;
let frame = 0;
let lastTime = 0;
let playing = false;
let currentCloud = cloud.update(epoch, winds[wind], 1);
let currentSample = cloud.sample(0, 0, 0);
let webglError = 0;
let rendererStats = { calls: 0, triangles: 0, cloudCalls: 0 };
let cloudCalls = 0;
for (const mesh of cloud.group.children) mesh.onBeforeRender = () => { cloudCalls++; };

function moveCamera() {
  if (view === 'overview') {
    camera.position.set(-1430, 844, 240);
    camera.lookAt(40, 470, -970);
    return;
  }
  if (view === 'west' || view === 'east') {
    const mount = mainSummitLayout.shoulders[view === 'west' ? 0 : 1];
    camera.position.set(mount.east - 37, mount.height + 88, -mount.north + 290);
    camera.lookAt(mount.east, mount.height + 12, -mount.north);
    return;
  }
  const altitude = altitudeViews[view];
  camera.position.set(-900, altitude, -400);
  camera.lookAt(20, altitude + 12, -1010);
}

function render(time: number) {
  if (lastTime && playing) epoch += Math.min(time - lastTime, 100) * 2;
  lastTime = time;
  currentCloud = cloud.update(epoch, winds[wind], 1);
  currentSample = cloud.sample(camera.position.x, -camera.position.z, camera.position.y);
  scene.fog = currentSample.visibility === undefined ? null : fog;
  fog.far = currentSample.visibility ?? 4200;
  scene.background = scene.fog ? fogColor : sky;
  cloudCalls = 0;
  renderer.render(scene, camera);
  const { calls, triangles } = renderer.info.render;
  rendererStats = { calls, triangles, cloudCalls };
  webglError = renderer.getContext().getError();
  frame++;
  if (playing) requestAnimationFrame(render);
}

function draw() {
  if (playing) return;
  requestAnimationFrame(render);
}

function updateControls() {
  document.querySelectorAll<HTMLButtonElement>('[data-view], [data-wind]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.view === view || button.dataset.wind === wind));
  });
  const speed = Math.hypot(winds[wind].east, winds[wind].north);
  readout.textContent = `机位 ${camera.position.y.toFixed(0)} m · 风速 ${speed.toFixed(2)} m/s · ${speed < mainSummitCloudSpec.streamerWindThreshold ? '旗云未触发' : '旗云已触发'}`;
}

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-view]')) button.addEventListener('click', () => {
  view = button.dataset.view as View;
  moveCamera();
  updateControls();
  draw();
});
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-wind]')) button.addEventListener('click', () => {
  wind = button.dataset.wind as Wind;
  updateControls();
  draw();
});

const drift = document.querySelector<HTMLButtonElement>('#drift')!;
drift.setAttribute('aria-pressed', 'false');
drift.addEventListener('click', () => {
  playing = !playing;
  drift.setAttribute('aria-pressed', String(playing));
  lastTime = 0;
  if (playing) requestAnimationFrame(render);
});

function resize() {
  const width = root.clientWidth;
  const height = Math.max(320, root.clientHeight);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  draw();
}

moveCamera();
updateControls();
resize();
window.addEventListener('resize', resize);
Object.assign(window, { p8Review: {
  state: () => ({ frame, view, wind, epoch, playing, webglError, renderer: rendererStats,
    camera: { east: camera.position.x, north: -camera.position.z, height: camera.position.y }, sample: currentSample, cloud: currentCloud,
    terrain: mainSummitLayout.shoulders.map(({ east, north, height }) =>
      ({ east, north, surveyed: height, sampled: p1.heightAt(east, north), snowDepth: p1.snowDepthAt(east, north, 0) })),
  }),
  transect: () => [350, 379.99, 380, 400, 440, 474, 525, 548, 560, 560.01, 650, 800]
    .map(height => ({ height, ...cloud.sample(-900, 400, height) })),
} });
