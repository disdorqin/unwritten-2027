import { AmbientLight, Color, DirectionalLight, Group, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import { createMainSummitBlock, mainSummitLayout } from './main-summit-block';
import { createMainSummitCable, summitCableSpec } from './main-summit-cable';
import { mountMainSummitCable } from './main-summit-cable-scene';

const terrain = createMainSummitBlock(mainSummitLayout, 347, 9);
const cable = createMainSummitCable(0, 10_000, 347);
const scene = new Scene();
const owner = new Group();
const whiteoutScene = new Scene();
const sky = new Color('#c9deeb');
whiteoutScene.background = new Color('#edf3f6');
scene.background = sky;
scene.add(owner);
owner.add(terrain.coarse);
terrain.enter(owner);
scene.add(new AmbientLight('#d7e8ff', 1.45));
const sun = new DirectionalLight('#fff2db', 2.6);
sun.position.set(-200, 600, -500);
scene.add(sun);
const camera = new PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 2500);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const cableScene = mountMainSummitCable(owner, cable, terrain.heightAt);
const board = document.querySelector<HTMLDivElement>('#board')!;
const rope = cable.ropes[0];
let nowMs = 0;
let rider = false;
let progress = 0;
let whiteout = false;
let settledStation: 'cloud-deck' | 'summit' = 'cloud-deck';

function render() {
  const [state] = cableScene.update(nowMs);
  const { approach, board: anchor } = rope.dock(state.station ?? settledStation);
  const walkEast = approach.east + (anchor.east - approach.east) * progress;
  const walkNorth = approach.north + (anchor.north - approach.north) * progress;
  const yaw = state.ropePoint.heading;
  if (rider) {
    const p = state.ropePoint;
    camera.position.set(p.east, p.height - summitCableSpec.cabinFloorBelowRope + 1.43, -p.north);
    camera.lookAt(camera.position.clone().add(new Vector3(Math.sin(yaw), -0.18, -Math.cos(yaw))
      .multiplyScalar(state.direction === 'up' ? 1 : -1)));
  } else {
    const ground = terrain.heightAt(walkEast, walkNorth);
    if (ground !== anchor.height) throw new Error('Station walk left the approved flat terrain sample');
    camera.position.set(walkEast, ground + 1.60, -walkNorth);
    camera.lookAt(anchor.east + (anchor.east - approach.east) * 0.2, ground + 1.55,
      -anchor.north - (anchor.north - approach.north) * 0.2);
  }
  whiteout = rider && state.phase === 'whiteout';
  board.hidden = !state.canBoardOrExit;
  board.textContent = settledStation === 'cloud-deck' ? '云海台 · 缆车二线' : '绝顶台 · 缆车二线';
  // The harness presents the ride phase as scene weather, with no status element during travel.
  renderer.render(whiteout ? whiteoutScene : scene, camera);
  return { nowMs, station: state.station, direction: state.direction, phase: state.phase, rider, progress,
    camera: camera.position.toArray(), hintsVisible: !board.hidden, whiteout, drawCalls: renderer.info.render.calls };
}

addEventListener('keydown', event => {
  const [state] = cable.cabinsAt(nowMs);
  if (event.code === 'KeyW' && !rider && state.canBoardOrExit) progress = Math.min(1, progress + 0.125);
  if (event.code === 'KeyS' && !rider && state.canBoardOrExit) progress = Math.max(0, progress - 0.125);
  if (event.code === 'KeyE' && state.station && (rider || progress >= 0.875)) {
    rider = !rider;
    settledStation = state.station;
  }
  render();
});

Object.assign(window, { p2: { render, travelMs: cable.rideMs, legMs: cable.legMs,
  time: (ms: number) => { nowMs = ms; return render(); } } });
render();
