import { AmbientLight, DirectionalLight, Fog, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { createUndergroundPalaceShell } from './underground-palace-shell';

const palace = createUndergroundPalaceShell();
const scene = new Scene();
scene.fog = new Fog('#1c2737', 36, 96);
const renderer = new WebGLRenderer({ antialias: false });
renderer.setClearColor('#1c2737');
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
scene.add(palace.group, new AmbientLight('#d7dde5', 1.15));
const light = new DirectionalLight('#b9c9e0', 2);
light.position.set(-7, 11, 7);
scene.add(light);
const camera = new PerspectiveCamera(66, innerWidth / innerHeight, .04, 110);
const label = document.querySelector('output')!;
let east: number = palace.route[0][0];
let north: number = palace.route[0][1];
let target: readonly [number, number] | undefined;
let direction = [0, 1];
let held = false;
let previous = performance.now();
let maxLip = 0;
let blocked = 0;
let footsteps = 0;

function feetAt(e: number, n: number) {
  const height = palace.floorAt(e, n);
  if (height === undefined) throw new RangeError('The review camera left the palace floor.');
  return height;
}

const review = {
  route: palace.route,
  snapshot: () => ({ east, north, height: feetAt(east, north), maxLip, blocked, footsteps,
    calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, columns: palace.cover.length }),
  seek(e: number, n: number) {
    const distance = Math.hypot(e - east, n - north);
    if (distance > 0) direction = [(e - east) / distance, (n - north) / distance];
    target = [e, n];
  },
};
Object.assign(window, { palaceReview: review });

addEventListener('keydown', event => { if (event.code === 'KeyW') held = true; });
addEventListener('keyup', event => { if (event.code === 'KeyW') held = false; });

function tick(now: number) {
  let advance = Math.max(0, Math.min(.1, (now - previous) / 1000)) * 10.5;
  previous = now;
  if (held && target) while (advance > 0) {
    const distance = Math.hypot(target[0] - east, target[1] - north);
    if (distance < .00001) break;
    const step = Math.min(.12, advance, distance);
    const nextEast = east + (target[0] - east) * step / distance;
    const nextNorth = north + (target[1] - north) * step / distance;
    if (!palace.canStand(nextEast, nextNorth)) { blocked++; break; }
    const lip = Math.abs(feetAt(nextEast, nextNorth) - feetAt(east, north));
    if (lip > .43) { blocked++; break; }
    maxLip = Math.max(maxLip, lip);
    east = nextEast;
    north = nextNorth;
    footsteps++;
    advance -= step;
  }
  const feet = feetAt(east, north);
  const eyes = feet + 1.65;
  camera.position.set(east, eyes, -north);
  camera.lookAt(east + 3 * direction[0]!, eyes + .12, -north - 3 * direction[1]!);
  label.value = `地宫骨架走查（局部） E${east.toFixed(2)} / N${north.toFixed(2)} / Y${feet.toFixed(2)}`;
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
