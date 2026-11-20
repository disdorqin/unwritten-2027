import {
  AmbientLight, BoxGeometry, BufferGeometry, Color, DirectionalLight, DoubleSide, Float32BufferAttribute, FogExp2,
  Group, Mesh, MeshLambertMaterial, PerspectiveCamera, Scene, Vector3, WebGLRenderer,
} from 'three';
import { sledMaximumSpeed } from '../../../src/shared/sled-speed';
import { createMainSummitBlock, mainSummitLayout } from './main-summit-block';
import { createMainSummitSledRoute } from './main-summit-sled-route';
import { createSummitSledReplay } from './main-summit-sled-replay';
import { createMainSummitTrail } from './main-summit-trail';
import { mountMainSummitWreckage } from './main-summit-wreckage';

type Point = { east: number; north: number; height: number };
type Mode = 'walk' | 'wreckage' | 'sled-ready' | 'sled' | 'sled-finished';

const cloudDeckFloor = 347;
const terrain = createMainSummitBlock(mainSummitLayout, cloudDeckFloor, 8);
const trail = createMainSummitTrail(terrain.heightAt, cloudDeckFloor);
const sledRoute = createMainSummitSledRoute();
let replay = createSummitSledReplay(sledRoute);
const walkClock = makeWalkClock(trail.points);
const scene = new Scene();
const domain = new Group();
scene.add(domain);
domain.add(terrain.coarse);
terrain.enter(domain);
const daylight = new Color('#c7daeb');
const cloud = new Color('#e8eff2');
scene.add(new AmbientLight('#cfe5ff', 1.55));
const sun = new DirectionalLight('#fff1d9', 2.5);
sun.position.set(-250, 650, -1300);
scene.add(sun);
const camera = new PerspectiveCamera(68, innerWidth / innerHeight, 0.08, 2500);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  draw();
});

function makeWalkClock(points: readonly Point[]) {
  const chainage = [0];
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1]!;
    const b = points[index]!;
    chainage.push(chainage[index - 1]! + Math.hypot(a.east - b.east, a.north - b.north, a.height - b.height));
  }
  const length = chainage.at(-1)!;
  function sample(distance: number): Point {
    const distanceMetres = Math.max(0, Math.min(length, distance));
    let first = 0, last = chainage.length - 1;
    while (first + 1 < last) {
      const middle = (first + last) >>> 1;
      if (chainage[middle]! <= distanceMetres) first = middle;
      else last = middle;
    }
    const a = points[first]!, b = points[last]!;
    const fraction = (distanceMetres - chainage[first]!) / (chainage[last]! - chainage[first]!);
    return { east: a.east + (b.east - a.east) * fraction, north: a.north + (b.north - a.north) * fraction,
      height: a.height + (b.height - a.height) * fraction };
  }
  return { length, sample };
}

function buildRibbon(owner: Group, points: readonly Point[], halfWidth: number, material: MeshLambertMaterial,
    supportAt?: (east: number, north: number, height: number) => number | undefined) {
  const geometry = new BufferGeometry();
  const vertices: number[] = [];
  const index: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const position = points[i]!;
    const before = points[Math.max(0, i - 1)]!;
    const after = points[Math.min(points.length - 1, i + 1)]!;
    const dx = after.east - before.east, dn = after.north - before.north;
    const norm = Math.hypot(dx, dn);
    const sideEast = norm > 0 ? -dn / norm * halfWidth : 0;
    const sideNorth = norm > 0 ? dx / norm * halfWidth : halfWidth;
    for (const side of [-1, 1]) {
      const east = position.east + sideEast * side;
      const north = position.north + sideNorth * side;
      vertices.push(east, position.height + 0.06, -north);
      if (supportAt) vertices.push(east, supportAt(east, north, position.height) ?? position.height - 0.4, -north);
    }
    if (i + 1 < points.length) {
      const width = supportAt ? 4 : 2;
      const current = i * width, next = current + width, right = width / 2;
      index.push(current, current + right, next, next, current + right, next + right);
      if (supportAt) index.push(current, current + 1, next, next, current + 1, next + 1,
        current + right, next + right, current + right + 1, next + right, next + right + 1, current + right + 1);
    }
  }
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  const mesh = new Mesh(geometry, material);
  owner.add(mesh);
}

const trailMaterial = new MeshLambertMaterial({ color: '#a6a9a3', side: DoubleSide });
const sledMaterial = new MeshLambertMaterial({ color: '#f2f5f4', side: DoubleSide });
const walkInfrastructure = new Group();
const sledInfrastructure = new Group();
domain.add(walkInfrastructure, sledInfrastructure);
buildRibbon(walkInfrastructure, trail.points, 1.5, trailMaterial, terrain.heightAt);
const wreckage = mountMainSummitWreckage(walkInfrastructure, trail);
// The lower host is a route review fixture. Its bench only represents the isolated track.
buildRibbon(sledInfrastructure, sledRoute.points, 2.1, sledMaterial, (_east, _north, height) => height - 0.7);
const posts = new BoxGeometry(0.19, 2.5, 0.19);
const flag = new BoxGeometry(0.65, 0.6, 0.09);
const wood = new MeshLambertMaterial({ color: '#674c46' });
const red = new MeshLambertMaterial({ color: '#ab262b' });
for (const arc of sledRoute.arcs) {
  const spacing = arc.id === 'through-cloud' ? 24 : 90;
  for (let distance = arc.startMetres; distance < arc.endMetres; distance += spacing) {
    const point = sledRoute.sampleAtDistance(distance);
    const next = sledRoute.sampleAtDistance(distance + 1);
    const east = next.east - point.east, north = next.north - point.north;
    const scale = 2.25 / Math.hypot(east, north);
    const post = new Mesh(posts, wood);
    post.position.set(point.east - north * scale, point.height + 1.25, -point.north - east * scale);
    const marker = new Mesh(flag, red);
    marker.position.set(0.31, 0.80, 0);
    post.add(marker);
    sledInfrastructure.add(post);
  }
}

const controls = [...document.querySelectorAll<HTMLButtonElement>('[data-p3-action]')];
const instructions = document.querySelector<HTMLDivElement>('#instructions')!;
const wreckageChoices = document.querySelector<HTMLDivElement>('#wreckage-sites')!;
let wreckageSite = wreckage.sites[0]!;
let mode: Mode = 'walk';
let walkDistance = 0;
let forwards = false;
const walkSpeed = 4.2;

function selectWreckage(site: typeof wreckageSite) {
  wreckageSite = site;
  for (const button of wreckageChoices.querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(button.dataset.site === site.id));
  }
  instructions.textContent = site.label;
  draw();
}
for (const site of wreckage.sites) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.site = site.id;
  button.textContent = site.label;
  button.onclick = () => selectWreckage(site);
  wreckageChoices.append(button);
}
for (const control of controls) {
  control.addEventListener('click', () => {
    mode = control.dataset.p3Action === 'wreckage' ? 'wreckage' : control.dataset.p3Action === 'walk' ? 'walk' : 'sled-ready';
    for (const button of controls) button.setAttribute('aria-pressed', String(button === control));
    wreckageChoices.hidden = mode !== 'wreckage';
    forwards = false;
    walkDistance = 0;
    replay = createSummitSledReplay(sledRoute);
    if (mode === 'wreckage') selectWreckage(wreckageSite);
    else {
      instructions.textContent = mode === 'walk' ? '按 W 沿步道前进' : '按 E 启动雪橇';
      draw();
    }
  });
}
addEventListener('keydown', event => {
  if (event.code === 'KeyW') forwards = true;
  if (event.code === 'KeyE' && mode === 'sled-ready') {
    mode = 'sled';
    instructions.textContent = '';
    draw();
  }
});
addEventListener('keyup', event => { if (event.code === 'KeyW') forwards = false; });
addEventListener('blur', () => { forwards = false; });

function snapshot() {
  const sled = replay.snapshot();
  const position = mode === 'wreckage' ? wreckageSite.stand : mode === 'walk' ? walkClock.sample(walkDistance)
    : { east: sled.east, north: sled.north, height: sled.height };
  return {
    mode, position, wreckageSite: mode === 'wreckage' ? wreckageSite.id : null,
    walk: { distance: walkDistance, totalDistance: walkClock.length, maxGrade: trail.metrics.maxGrade,
      pavilionAnchors: trail.pavilionAnchors },
    sled: { distance: sled.distanceMetres, totalDistance: replay.totalDistanceMetres,
      section: sled.stage, speed: sled.speed, maxSpeed: replay.maximumSpeed(), cap: sledMaximumSpeed,
      elapsedMs: sled.elapsedSeconds * 1000, finished: mode === 'sled-finished' },
    render: { draws: renderer.info.render.calls, triangles: renderer.info.render.triangles },
  };
}

function draw() {
  const state = snapshot();
  const { position, sled } = state;
  const station = mode === 'walk' ? walkDistance : sled.distance;
  const length = mode === 'walk' ? walkClock.length : sledRoute.lengthMetres;
  const sample = mode === 'walk' ? walkClock.sample : sledRoute.sampleAtDistance;
  const from = sample(Math.max(0, station - 2));
  const to = sample(Math.min(length, station + 5));
  const look = new Vector3(to.east - from.east, 0, from.north - to.north).normalize();
  const walking = mode === 'walk' || mode === 'wreckage';
  const fogged = !walking && sled.section === 'through-cloud';
  walkInfrastructure.visible = walking;
  sledInfrastructure.visible = !walking;
  terrain.coarse.visible = walking;
  scene.background = fogged ? cloud : daylight;
  scene.fog = new FogExp2(fogged ? cloud : daylight, fogged ? 0.028 : 0.0009);
  camera.position.set(position.east, position.height + (walking ? 1.65 : 1.17), -position.north);
  if (mode === 'wreckage') {
    const model = wreckageSite.model;
    camera.lookAt(model.east, model.height + .16, -model.north);
  } else camera.lookAt(camera.position.clone().add(look).add(new Vector3(0, -0.13, 0)));
  renderer.render(scene, camera);
}

function advance(elapsedMs: number, paint = true) {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs > 60_000) throw new RangeError('Review step outside 0–60 s.');
  if (mode === 'walk' && forwards) {
    walkDistance = Math.min(walkClock.length, walkDistance + walkSpeed * elapsedMs / 1000);
    const point = walkClock.sample(walkDistance);
    const height = trail.sampleSurface(point.east, point.north);
    if (height === undefined || Math.abs(height - point.height) > 0.12) {
      throw new Error('The P-3 walk left the built trail surface.');
    }
  }
  if (mode === 'sled' && replay.advance(elapsedMs / 1000).status === 'finished') {
    mode = 'sled-finished';
    instructions.textContent = '已抵达山脚样点';
  }
  instructions.hidden = mode === 'sled';
  if (paint) draw();
  return snapshot();
}

Object.assign(window, { p3: { snapshot, advance } });
addEventListener('pagehide', event => { if (!event.persisted) wreckage.dispose(); });
draw();
if (new URL(location.href).searchParams.get('proof') !== '1') {
  let last = performance.now();
  function frame(now: number) {
    advance(Math.min(now - last, 100));
    last = now;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
