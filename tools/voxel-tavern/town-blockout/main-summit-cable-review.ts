import { AmbientLight, Color, DirectionalLight, Group, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import { createMainSummitBlock, mainSummitLayout } from './main-summit-block';
import { createMainSummitCable } from './main-summit-cable';
import { mountMainSummitCable } from './main-summit-cable-scene';
import { createMainSummitCableTravel, type SummitCableRide } from './main-summit-cable-travel';

const terrain = createMainSummitBlock(mainSummitLayout, 347, 9);
const cable = createMainSummitCable(0, 10_000, 347);
const travel = createMainSummitCableTravel(cable);
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
let ride: SummitCableRide | undefined;
let progress = 0;
let whiteout = false;
let settledStation: 'cloud-deck' | 'summit' = 'cloud-deck';

function walkingFeet() {
  const { approach, board: anchor } = rope.dock(settledStation);
  const east = approach.east + (anchor.east - approach.east) * progress;
  const north = approach.north + (anchor.north - approach.north) * progress;
  const height = terrain.heightAt(east, north);
  if (height !== anchor.height) throw new Error('Station walk left the approved flat terrain sample');
  return { east, north, height };
}

function render() {
  const [state] = cableScene.update(nowMs);
  if (ride) {
    const { feet, heading, direction, whiteout: cabinWhiteout } = travel.ridePose(nowMs, ride);
    camera.position.set(feet.east, feet.height + 1.43, -feet.north);
    camera.lookAt(camera.position.clone().add(new Vector3(Math.sin(heading), -0.18, -Math.cos(heading))
      .multiplyScalar(direction === 'up' ? 1 : -1)));
    whiteout = cabinWhiteout;
  } else {
    const { approach, board: anchor } = rope.dock(settledStation);
    const feet = walkingFeet();
    camera.position.set(feet.east, feet.height + 1.60, -feet.north);
    camera.lookAt(anchor.east + (anchor.east - approach.east) * 0.2, feet.height + 1.55,
      -anchor.north - (anchor.north - approach.north) * 0.2);
    whiteout = false;
  }
  board.hidden = !state.station || (!ride && state.station !== settledStation);
  board.textContent = (state.station ?? settledStation) === 'cloud-deck' ? '云海台 · 缆车二线' : '绝顶台 · 缆车二线';
  // The harness presents the ride phase as scene weather, with no status element during travel.
  renderer.render(whiteout ? whiteoutScene : scene, camera);
  return { nowMs, station: state.station, direction: state.direction, phase: state.phase, rider: !!ride, progress,
    camera: camera.position.toArray(), hintsVisible: !board.hidden, whiteout, drawCalls: renderer.info.render.calls };
}

addEventListener('keydown', event => {
  const [state] = cable.cabinsAt(nowMs);
  if (!ride && state.station === settledStation) {
    if (event.code === 'KeyW') progress = Math.min(1, progress + 0.125);
    if (event.code === 'KeyS') progress = Math.max(0, progress - 0.125);
  }
  if (event.code === 'KeyE' && !event.repeat) {
    if (ride && state.station && travel.exit(nowMs, ride)) {
      ride = undefined;
      settledStation = state.station;
      progress = 0;
    } else if (!ride) {
      ride = travel.attemptBoard(nowMs, 0, walkingFeet());
    }
  }
  render();
});

Object.assign(window, { p2: { render, travelMs: cable.rideMs, legMs: cable.legMs,
  time: (ms: number) => { nowMs = ms; return render(); } } });
render();
