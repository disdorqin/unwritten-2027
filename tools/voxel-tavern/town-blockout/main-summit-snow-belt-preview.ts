import {
  AmbientLight, BoxGeometry, BufferGeometry, Color, DirectionalLight, DoubleSide, Float32BufferAttribute, FogExp2,
  InstancedMesh, Mesh, MeshLambertMaterial, Object3D, PerspectiveCamera, Scene, Vector3, WebGLRenderer,
} from 'three';
import surveyData from '../../fixtures/main-summit-snow-belt-survey.json';
import { createMainSummitBlock, mainSummitLayout } from './main-summit-block';
import { createMainSummitSnowBelt, type SnowBeltKnot } from './main-summit-snow-belt';
import { createSummitSnowTransition, surveyedSledConnection } from './main-summit-snow-transition';
import { buildMainSummitSnowMesh } from './main-summit-snow-mesh';
import { sledRadius } from './sled-motion';
import { createSledRide } from './sled-ride';
import { townPhysicsDelta } from './town-physics-clock';

const belt = createMainSummitSnowBelt(surveyData as unknown as readonly SnowBeltKnot[], -surveyedSledConnection.grade);
const tail = createSummitSnowTransition();
const summit = createMainSummitBlock(mainSummitLayout, 347, 16);
const width = belt.widthMetres / 2;
const heightAt = (east: number, north: number) => {
  const along = tail.along(east, north);
  if (along >= 0 && along < tail.planMetres + width && Math.abs(tail.lateral(east, north)) <= width) {
    return tail.heightAt(along);
  }
  return belt.sampleSurface(east, north);
};

const scene = new Scene();
const camera = new PerspectiveCamera(69, innerWidth / innerHeight, 0.09, 3300);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(1.5, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
scene.add(new AmbientLight('#d2e1f1', 1.8));
const sun = new DirectionalLight('#fff3db', 2.6);
sun.position.set(-240, 680, -1200);
scene.add(sun);
const daylight = new Color('#bdd3e5');
const cloud = new Color('#e8eff4');
const mountain = buildMainSummitSnowMesh(summit.coarse.geometry, { points: belt.points, sampleSurface: heightAt });
scene.add(new Mesh(mountain.geometry, new MeshLambertMaterial({ vertexColors: true, side: DoubleSide })));

const lower = [...tail.samplePolyline(3), tail.sample(tail.planMetres + width)];
const lowerVertices: number[] = [], lowerIndices: number[] = [];
for (const [index, sample] of lower.entries()) {
  for (const side of [-1, 1]) lowerVertices.push(sample.east + side * Math.cos(tail.entry.heading) * width,
    sample.height, -sample.north + side * Math.sin(tail.entry.heading) * width);
  if (index) lowerIndices.push(index * 2 - 2, index * 2 - 1, index * 2,
    index * 2, index * 2 - 1, index * 2 + 1);
}
const lowerGeometry = new BufferGeometry();
lowerGeometry.setAttribute('position', new Float32BufferAttribute(lowerVertices, 3));
lowerGeometry.setIndex(lowerIndices);
lowerGeometry.computeVertexNormals();
scene.add(new Mesh(lowerGeometry, new MeshLambertMaterial({ color: '#b7c0cc', side: DoubleSide })));

const markers = belt.points.filter(({ metres }, index, points) => index === 0 ||
  Math.floor(metres / 24) > Math.floor(points[index - 1]!.metres / 24));
const posts = new InstancedMesh(new BoxGeometry(0.14, 2.15, 0.14),
  new MeshLambertMaterial({ color: '#74574b' }), markers.length);
const flags = new InstancedMesh(new BoxGeometry(0.46, 0.51, 0.12),
  new MeshLambertMaterial({ color: '#b62932' }), markers.length);
const marker = new Object3D();
for (const [index, { east, north, height, headingFromEast }] of markers.entries()) {
  const sideEast = Math.sin(headingFromEast) * 1.99;
  const sideNorth = -Math.cos(headingFromEast) * 1.99;
  marker.position.set(east + sideEast, height + 1, -north - sideNorth);
  marker.updateMatrix();
  posts.setMatrixAt(index, marker.matrix);
  marker.position.y += 0.76;
  marker.updateMatrix();
  flags.setMatrixAt(index, marker.matrix);
}
scene.add(posts, flags);

const pressed = new Set<string>();
const status = document.querySelector<HTMLOutputElement>('#status')!;
let lowerPreview = false, finished = false, started = false;
let ticks = 0, elapsed = 0;
const footprint = [[sledRadius, 0], [-sledRadius, 0], [0, sledRadius], [0, -sledRadius]] as const;
const ride = createSledRide({
  height(east, north) { return heightAt(east, north) ?? summit.heightAt(east, north) ?? tail.heightAt(tail.along(east, north)); },
  surface(east, north) { return { surface: 0, deepSnow: (summit.snowDepthAt(east, north, 0.6) ?? 0) >= 0.6 }; },
  blocked(east, north) {
    return heightAt(east, north) === undefined || footprint.some(([x, n]) => heightAt(east + x, north + n) === undefined);
  },
  snow() {},
  stopped() {},
});

function launch(lowerLaunch: boolean) {
  ride.interrupt();
  const start = lowerLaunch ? belt.sampleAt(belt.horizontalMetres - 35) : belt.entrance;
  const yaw = Math.PI / 2 - start.headingFromEast;
  const floor = heightAt(start.east, start.north);
  if (floor === undefined || !ride.mount(start.east, start.north, floor, yaw)) throw new Error('试滑起点缺少雪带支撑');
  lowerPreview = lowerLaunch;
  finished = false;
  started = true;
  ticks = 0;
  elapsed = 0;
  pressed.clear();
}

document.querySelector('#summit')!.addEventListener('click', () => launch(false));
document.querySelector('#seam')!.addEventListener('click', () => launch(true));
addEventListener('keydown', event => {
  if (event.code === 'KeyE' && !event.repeat) launch(lowerPreview);
  pressed.add(event.code);
});
addEventListener('keyup', event => pressed.delete(event.code));
addEventListener('blur', () => pressed.clear());
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

function step() {
  if (!ride.active()) return;
  ride.step(townPhysicsDelta, { forward: Number(pressed.has('KeyW')) - Number(pressed.has('KeyS')),
    turn: Number(pressed.has('KeyD')) - Number(pressed.has('KeyA')) });
  ticks++;
  if (ride.active() && tail.along(ride.spot.x, ride.spot.n) >= tail.planMetres &&
      Math.abs(tail.lateral(ride.spot.x, ride.spot.n)) <= width) {
    finished = true;
    ride.interrupt();
  }
}

function advance(ms: number) {
  if (!Number.isFinite(ms) || ms < 0 || ms > 60_000) throw new RangeError('Invalid snow preview duration');
  elapsed += ms / 1000;
  while (elapsed >= townPhysicsDelta) {
    step();
    elapsed -= townPhysicsDelta;
  }
  draw();
  return snapshot();
}

function snapshot() {
  const { x: east, n: north, y: height, yaw } = started ? ride.spot : {
    x: belt.entrance.east, n: belt.entrance.north, y: belt.entrance.height, yaw: Math.PI / 2 - belt.entrance.headingFromEast,
  };
  return { east, north, height, yaw, ticks, started, finished, lowerPreview,
    active: ride.active(), airborne: ride.airborne(), speed: ride.speed(),
    seamOffset: tail.along(east, north), draws: renderer.info.render.calls, triangles: renderer.info.render.triangles };
}

function draw() {
  const { east, north, height, yaw, seamOffset } = snapshot();
  const insideCloud = height <= 560 && height >= 380;
  const inTail = seamOffset >= 0 && Math.abs(tail.lateral(east, north)) <= width;
  scene.background = insideCloud ? cloud : daylight;
  scene.fog = new FogExp2(scene.background, insideCloud ? 0.022 : 0.0012);
  camera.position.set(east, height + 1.17, -north);
  camera.lookAt(camera.position.clone().add(new Vector3(Math.sin(yaw), -0.19, -Math.cos(yaw))));
  const region = inTail || lowerPreview ? '下段预览 · 未接前山 R2' : insideCloud ? '穿云段' : height > 560 ? '云上段' : '云下段';
  const reading = `${ride.speed().toFixed(1)} m/s · ${(ticks * townPhysicsDelta).toFixed(1)} s`;
  status.value = `${region} · ${ride.active() ? reading : finished ? '已到达预览终点' : started ? '已停滑，按 E 重试' : '按 E 上车'}`;
  renderer.render(scene, camera);
}

draw();
if (new URL(location.href).searchParams.get('proof') === '1') Object.assign(window, { p3Snow: { advance, snapshot } });
else {
  let previous = performance.now();
  function frame(now: number) {
    advance(Math.min(now - previous, 60));
    previous = now;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
