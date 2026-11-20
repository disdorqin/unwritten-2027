import {
  AmbientLight, Color, DirectionalLight, Fog, Group, PerspectiveCamera, Vector3, WebGLRenderer, Scene,
  type BufferGeometry, type Mesh, type MeshBasicMaterial,
} from 'three';
import { createDesktopLook } from './desktop-look';
import { createMainSummitBlock, mainSummitBounds, mainSummitLayout } from './main-summit-block';
import { createMainSummitCable } from './main-summit-cable';
import { mountMainSummitCable } from './main-summit-cable-scene';
import { createMainSummitCableTravel } from './main-summit-cable-travel';
import { createMainSummitCloudLayer, mainSummitCloudSpec } from './main-summit-cloud-layer';
import { createSkyCityReveal, type SkyCityDiscoveryStore } from './sky-city-reveal';
import { createSkyCityRevealEffects } from './sky-city-reveal-effects';
import { buildSkyCitySilhouette, updateSkyCitySilhouette } from './sky-city-silhouette';
import { createSkyCitySite } from './sky-city-site';

const dwellMs = 10_000;
const startMs = 66_000;
const endMs = 158_000;
const reviewSpeed = 8;
const seenStorageKey = 'unwritten-zd04-review-seen';
const lookKeys = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

const scene = new Scene();
const aboveCloud = new Color('#b0cddc');
const warmSky = new Color('#fae5c1');
const mist = new Color('#e5edf2');
const coldLight = new Color('#e6edf2');
const warmLight = new Color('#fff0c5');
const baseIsland = new Color('#f0f2f6');
const warmIsland = new Color('#ffebcc');
const sky = aboveCloud.clone();
const fog = new Fog(mist, 1, 16);
scene.background = sky;
scene.fog = fog;
const fill = new AmbientLight('#eaf2fd', 1.1);
const sun = new DirectionalLight(coldLight, 1.68);
sun.position.set(-130, 650, -170);
scene.add(fill, sun);

const summit = createMainSummitBlock(mainSummitLayout, 347, 48);
const cloud = createMainSummitCloudLayer({ bounds: mainSummitBounds, summit: mainSummitLayout.summit,
  shoulders: mainSummitLayout.shoulders, heightAt: summit.heightAt });
const cable = createMainSummitCable(0, dwellMs, 347);
const travel = createMainSummitCableTravel(cable);
// The review starts during ascent. Use a ride boarded at the registered Cloud Deck approach.
const ride = travel.attemptBoard(0, 0, cable.ropes[0].dock('cloud-deck').approach);
if (!ride) throw new Error('Cloud Deck review ride could not board');
const cableRoot = new Group();
const cars = mountMainSummitCable(cableRoot, cable, summit.heightAt);
scene.add(summit.coarse, cloud.group, cableRoot);

// This sightline is in the isolated P-1 review frame. The host owns the production island transform.
const islandSite = createSkyCitySite({ east: -420, north: 832, height: 689 });
const islandFrame = new Group();
islandSite.place(islandFrame);
const island = buildSkyCitySilhouette();
const islandCenter = new Vector3();
const islandMesh = island.children[0]! as Mesh<BufferGeometry, MeshBasicMaterial>;
island.visible = false;
islandFrame.add(island);
scene.add(islandFrame);
let cityDraws = 0;
islandMesh.onBeforeRender = () => { cityDraws++; };

const effects = createSkyCityRevealEffects();
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.domElement.tabIndex = 0;
renderer.domElement.setAttribute('aria-label', '缆车车厢内视角');
document.querySelector('#scene')!.append(renderer.domElement);
const camera = new PerspectiveCamera(61, 1, .07, 3_200);
const aim = new Vector3();
const projectedIsland = new Vector3();
const viewDirection = new Vector3();
const islandDirection = new Vector3();
const controls = document.querySelector<HTMLElement>('#review-controls')!;
const instructions = document.querySelector<HTMLElement>('#review-instructions')!;
const startButton = document.querySelector<HTMLButtonElement>('#start-reveal-ride')!;
const groundButton = document.querySelector<HTMLButtonElement>('#review-ground')!;
const mountainButton = document.querySelector<HTMLButtonElement>('#review-mountain')!;
const reticle = document.querySelector<HTMLElement>('#reticle')!;
const held = new Set<string>();

const discovery: SkyCityDiscoveryStore = {
  hasSeen: () => sessionStorage.getItem(seenStorageKey) === '1',
  markSeen: () => sessionStorage.setItem(seenStorageKey, '1'),
};

let source: 'mountain' | 'ground' = 'mountain';
let reveal = createSkyCityReveal(false, discovery);
let cueCount = 0;
let rideMs = startMs;
let running = false;
let yaw = 0, pitch = 0;
let previous: number | undefined;
const desktopLook = createDesktopLook(renderer.domElement, () => source === 'mountain', (horizontal, vertical) => {
  yaw += horizontal;
  pitch = Math.max(-1.12, Math.min(1.12, pitch + vertical));
});

function start() {
  if (source !== 'mountain' || running) return;
  void effects.unlockAudio();
  running = true;
  instructions.textContent = '鼠标或方向键转向，R 返回起点，G 查看地面。';
  renderer.domElement.focus();
}

function reset(next: typeof source) {
  source = next;
  rideMs = startMs;
  running = false;
  yaw = pitch = 0;
  held.clear();
  desktopLook.release();
  effects.reset();
  reveal = createSkyCityReveal(reveal.seen(), discovery);
  instructions.textContent = next === 'ground' ? 'R 返回缆车。' : '主峰线路实样，岛体为走查落位。鼠标或方向键转向，E 开始。';
  renderer.domElement.focus();
}

startButton.onclick = start;
groundButton.onclick = () => reset('ground');
mountainButton.onclick = () => reset('mountain');
renderer.domElement.addEventListener('pointerdown', () => { void effects.unlockAudio(); });
addEventListener('keydown', event => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (lookKeys.has(event.code)) {
    event.preventDefault();
    held.add(event.code);
    return;
  }
  if (event.repeat) return;
  if (event.code === 'KeyE') { event.preventDefault(); start(); }
  if (event.code === 'KeyG') reset('ground');
  if (event.code === 'KeyR') reset('mountain');
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

function looksAtIsland() {
  camera.getWorldDirection(viewDirection);
  if (islandDirection.subVectors(islandCenter, camera.position).dot(viewDirection) <= 0) return false;
  projectedIsland.copy(islandCenter).project(camera);
  if (projectedIsland.z < -1 || projectedIsland.z > 1 || Math.abs(projectedIsland.x) > .94 ||
      Math.abs(projectedIsland.y) > .91) return false;
  // The center must also clear the same P-1 terrain that supplies the rendered mountain.
  for (let part = 1; part < 16; part++) {
    const weight = part / 16;
    const east = camera.position.x + (islandCenter.x - camera.position.x) * weight;
    const north = -(camera.position.z + (islandCenter.z - camera.position.z) * weight);
    const sightHeight = camera.position.y + (islandCenter.y - camera.position.y) * weight;
    if ((summit.heightAt(east, north) ?? -Infinity) >= sightHeight) return false;
  }
  return true;
}

renderer.setAnimationLoop(now => {
  const dt = Math.min(.10, (now - (previous ?? now)) / 1000);
  previous = now;
  const seconds = now / 1000;
  if (running) rideMs = Math.min(endMs, rideMs + dt * reviewSpeed * 1000);
  const nowMs = dwellMs + Math.round(rideMs);
  cars.update(nowMs);
  const { phase, feet, heading: cabinHeading, whiteout: cabinWhiteout } = travel.ridePose(nowMs, ride);
  const mountain = source === 'mountain';
  const height = mountain ? feet.height : 12;
  const whiteout = mountain && cabinWhiteout;
  controls.hidden = running && whiteout;
  reticle.hidden = controls.hidden;
  startButton.hidden = !mountain || running;
  cableRoot.visible = mountain;

  if (mountain) {
    yaw += (Number(held.has('ArrowRight')) - Number(held.has('ArrowLeft'))) * 1.75 * dt;
    pitch = Math.max(-1.12, Math.min(1.12,
      pitch + (Number(held.has('ArrowUp')) - Number(held.has('ArrowDown'))) * dt));
    camera.position.set(feet.east, height + 1.65, -feet.north);
    const heading = cabinHeading + yaw;
    aim.set(Math.sin(heading) * Math.cos(pitch), Math.sin(pitch), -Math.cos(heading) * Math.cos(pitch));
    camera.lookAt(aim.add(camera.position));
  } else {
    camera.position.set(-23, 13.65, 120);
    camera.lookAt(0, 175, -1_000);
  }
  camera.updateMatrixWorld();

  updateSkyCitySilhouette(island, seconds);
  island.localToWorld(islandCenter.set(0, 3, 0));
  island.visible = mountain && !whiteout && height > mainSummitCloudSpec.top;
  const inView = island.visible && looksAtIsland();
  if (reveal.sample({ source, height, whiteout, inView })) {
    cueCount++;
    effects.reveal(seconds);
  }

  const glow = effects.update(seconds);
  cloud.update(Math.round(rideMs), { east: 4, north: 2.5 }, .96);
  const cloudSample = cloud.sample(camera.position.x, -camera.position.z, camera.position.y);
  const cloudy = mountain && (whiteout || height <= mainSummitCloudSpec.top);
  sky.copy(cloudy ? mist : aboveCloud).lerp(warmSky, glow * .27);
  fog.color.copy(sky);
  fog.near = whiteout ? .8 : 70;
  fog.far = whiteout ? 9 : (cloudy ? cloudSample.visibility ?? 320 : 1_550);
  sun.color.copy(coldLight).lerp(warmLight, glow);
  sun.intensity = 1.68 + glow * .64;
  islandMesh.material.color.copy(baseIsland).lerp(warmIsland, glow);
  cityDraws = 0;
  renderer.render(scene, camera);
  const { audioAvailable, audioPlaying } = effects.snapshot();
  document.dispatchEvent(new CustomEvent('sky-city-reveal-frame', { detail: {
    source, running, height, elapsedMs: Math.round(rideMs), phase, whiteout, inView, seen: reveal.seen(),
    cueCount, glow, audioAvailable, audioPlaying,
    silhouetteVisible: island.visible, yaw, pitch, cityDraws,
  } }));
});

addEventListener('pagehide', event => {
  if (event.persisted) return;
  renderer.setAnimationLoop(null);
  effects.dispose();
  cars.dispose();
  cloud.dispose();
  summit.dispose();
  islandMesh.geometry.dispose();
  islandMesh.material.dispose();
  renderer.dispose();
});
