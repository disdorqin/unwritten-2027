import { AmbientLight, Color, DirectionalLight, Group, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import { createMainSummitBlock, mainSummitLayout } from './main-summit-block';
import { createMainSummitCable, type SummitCablePoint } from './main-summit-cable';
import { mountMainSummitCable } from './main-summit-cable-scene';
import { mountMainSummitCableStations } from './main-summit-cable-stations';

const floor = 347;
const terrain = createMainSummitBlock(mainSummitLayout, floor, 16);
const cable = createMainSummitCable(0, 10_000, floor);
const scene = new Scene();
scene.background = new Color('#c1d7e8');
const owner = new Group();
scene.add(owner);
owner.add(terrain.coarse);
const stations = mountMainSummitCableStations(owner, cable, terrain);
const rides = mountMainSummitCable(owner, cable, terrain.heightAt);
rides.update(0);
scene.add(new AmbientLight('#dde9ff', 1.65));
const sun = new DirectionalLight('#fff3e0', 2.6);
sun.position.set(-60, 200, 90);
scene.add(sun);

const routes = new Map<string, { label: string; points: readonly SummitCablePoint[] }>([
  ['gate', { label: '云海台 → 山门', points: stations.gate.route }],
  ['guardroom', { label: '山门值守间', points: stations.gate.guardroom }],
  ['gate-to-station', { label: '山门 → 云海台站', points: stations.gate.stationWalk }],
]);
for (const [id, station] of Object.entries(stations.stations)) {
  for (const [index, route] of station.routes.entries()) {
    routes.set(`${id}-${index}`, {
      label: `${id === 'summit' ? '绝顶站' : '云海台站'} → ${index === 0 ? 'A' : 'B'} 厢登乘点`,
      points: [...route.path, route.board],
    });
  }
}
const select = document.querySelector<HTMLSelectElement>('#route')!;
for (const [id, { label }] of routes) select.add(new Option(label, id));
let route = routes.get('gate')!.points;
let row = 0, position = { ...route[0]! }, travelled = 0, blockedSteps = 0, ticks = 0, maxStep = 0;
const keys = new Set<string>();
const camera = new PerspectiveCamera(68, innerWidth / innerHeight, 0.08, 2600);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  draw();
});

function draw() {
  const ahead = route[Math.min(route.length - 1, row + 1)]!;
  const back = route[Math.max(0, row - 1)]!;
  const heading = new Vector3(ahead.east - back.east, -0.16, back.north - ahead.north);
  camera.position.set(position.east, position.height + 1.65, -position.north);
  camera.lookAt(camera.position.clone().add(heading.normalize()));
  renderer.render(scene, camera);
}

function snapshot() {
  return {
    route: select.value, row, position: { ...position }, destination: route.at(-1)!,
    arrived: row === route.length - 1, travelled, blockedSteps, ticks, maxStep,
    render: { draws: renderer.info.render.calls, triangles: renderer.info.render.triangles },
  };
}

function advance(ms: number, paint = true) {
  const forward = keys.has('KeyW'), backward = keys.has('KeyS');
  let remaining = 4.2 * ms / 1000;
  while (remaining > 1e-9 && forward !== backward) {
    const goal = route[forward ? row + 1 : row === route.length - 1 ? row - 1 : row];
    if (!goal || (!forward && row === 0 && position.east === route[0]!.east && position.north === route[0]!.north)) break;
    const distance = Math.hypot(goal.east - position.east, goal.north - position.north);
    if (distance <= 1e-9) {
      if (forward) row++;
      else if (row > 0) row--;
      else break;
      continue;
    }
    const step = Math.min(distance, remaining, 0.075);
    const east = position.east + (goal.east - position.east) * step / distance;
    const north = position.north + (goal.north - position.north) * step / distance;
    const height = stations.heightAt(east, north);
    ticks++;
    if (height === undefined || stations.blocked(east, north, height) || Math.abs(height - position.height) > 0.43) {
      blockedSteps++;
      break;
    }
    maxStep = Math.max(maxStep, Math.abs(height - position.height));
    position = { east, north, height };
    travelled += step;
    remaining -= step;
    if (distance - step < 1e-9 && forward) row++;
  }
  if (paint) draw();
  return snapshot();
}

select.addEventListener('change', () => {
  route = routes.get(select.value)!.points;
  rides.update(select.value === 'cloud-deck-1' || select.value === 'summit-0' ? cable.legMs : 0);
  position = { ...route[0]! };
  row = 0;
  travelled = 0;
  blockedSteps = 0;
  ticks = 0;
  maxStep = 0;
  keys.clear();
  draw();
});
addEventListener('keydown', event => { keys.add(event.code); });
addEventListener('keyup', event => { keys.delete(event.code); });
addEventListener('blur', () => keys.clear());
const proof = new URL(location.href).searchParams.get('proof') === '1';
if (proof) Object.assign(window, { p7: { advance, snapshot,
  jambBlocks: () => stations.blocked(2.2, -5, floor),
} });
draw();
if (!proof) {
  let last = performance.now();
  function frame(now: number) {
    advance(Math.min(100, now - last));
    last = now;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
