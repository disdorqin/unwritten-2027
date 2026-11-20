import { AmbientLight, Color, DirectionalLight, Group, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import { createMainSummitBlock, mainSummitLayout } from './main-summit-block';
import { createMainSummitCable, type SummitCablePoint } from './main-summit-cable';
import { mountSummitCablePeer } from './main-summit-cable-peer-visual';
import { summitCableRiderPose, type SummitCableRider } from './main-summit-cable-ride-roster';
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
const coRide = new URLSearchParams(location.search).get('coRide') === '1';
const peer = coRide ? mountSummitCablePeer(owner) : undefined;
const rope = cable.ropes[0];
let nowMs = 0;
let ride: SummitCableRide | undefined;
let riders: readonly SummitCableRider[] = [];
let selfId: string | null = null;
let rejected = false;
let peerDraws = 0;
let lookYaw = 0;
let progress = 0;
let whiteout = false;
let settledStation: 'cloud-deck' | 'summit' = 'cloud-deck';

type Snapshot = {
  kind: 'snapshot';
  nowMs: number;
  selfId: string;
  riders: readonly SummitCableRider[];
  exit?: { feet: SummitCablePoint; station: typeof settledStation };
  rejected?: boolean;
};

peer?.group.traverse(object => {
  if ('isMesh' in object) object.onAfterRender = () => { peerDraws++; };
});
const socketUrl = new URL('/p2-co-ride', location.href);
socketUrl.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
const socket = coRide ? new WebSocket(socketUrl) : undefined;
if (socket) {
  socket.onmessage = event => {
    const update: Snapshot = JSON.parse(String(event.data));
    if (update.kind !== 'snapshot') return;
    nowMs = update.nowMs;
    selfId = update.selfId;
    riders = update.riders;
    rejected = update.rejected === true;
    const nextRide = riders.find(rider => rider.id === selfId);
    if (!!nextRide !== !!ride) lookYaw = 0;
    ride = nextRide;
    if (update.exit) {
      settledStation = update.exit.station;
      progress = 0;
    }
    render();
  };
  socket.onclose = () => {
    selfId = null;
    riders = [];
    ride = undefined;
    settledStation = 'cloud-deck';
    progress = lookYaw = 0;
    rejected = false;
    render();
  };
}

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
  const self = riders.find(rider => rider.id === selfId);
  const seat = self ? summitCableRiderPose(travel, nowMs, self) : undefined;
  if (peer) {
    const other = self && riders.find(rider => rider.id !== self.id && rider.cabinIndex === self.cabinIndex);
    peer.group.visible = !!other;
    if (other) {
      const pose = summitCableRiderPose(travel, nowMs, other);
      peer.positionAt(pose.feet, pose.heading);
    }
  }
  if (ride) {
    const { feet, heading, direction, whiteout: cabinWhiteout } = seat ?? travel.ridePose(nowMs, ride);
    camera.position.set(feet.east, feet.height + 1.43, -feet.north);
    if (coRide) {
      const aim = heading + (direction === 'down' ? Math.PI : 0) + lookYaw;
      camera.lookAt(camera.position.clone().add(new Vector3(Math.sin(aim), -0.18, -Math.cos(aim))));
    } else {
      camera.lookAt(camera.position.clone().add(new Vector3(Math.sin(heading), -0.18, -Math.cos(heading))
        .multiplyScalar(direction === 'up' ? 1 : -1)));
    }
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
  const stationLabel = (state.station ?? settledStation) === 'cloud-deck' ? '云海台' : '绝顶台';
  board.textContent = stationLabel + (coRide ? ' · 二线同乘 · E 上下车 · ←/→ 转身' : ' · 缆车二线');
  // The harness presents the ride phase as scene weather, with no status element during travel.
  peerDraws = 0;
  renderer.render(whiteout ? whiteoutScene : scene, camera);
  return { nowMs, station: state.station, direction: state.direction, phase: state.phase, rider: !!ride, progress,
    camera: camera.position.toArray(), hintsVisible: !board.hidden, whiteout, drawCalls: renderer.info.render.calls,
    ...(coRide && { coRide: { connected: selfId !== null, selfId, riders, seatFeet: seat?.feet ?? null, peerDraws, rejected } }) };
}

addEventListener('keydown', event => {
  const [state] = cable.cabinsAt(nowMs);
  if (!ride && state.station === settledStation) {
    if (event.code === 'KeyW') progress = Math.min(1, progress + 0.125);
    if (event.code === 'KeyS') progress = Math.max(0, progress - 0.125);
  }
  if (event.code === 'KeyE' && !event.repeat) {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(ride ? { kind: 'exit' } : { kind: 'board', cabinIndex: 0, feet: walkingFeet() }));
    } else if (!coRide && ride && state.station && travel.exit(nowMs, ride)) {
      ride = undefined;
      settledStation = state.station;
      progress = 0;
    } else if (!coRide && !ride) {
      ride = travel.attemptBoard(nowMs, 0, walkingFeet());
    }
  }
  if (coRide && ride && (event.code === 'ArrowLeft' || event.code === 'ArrowRight')) {
    lookYaw += (event.code === 'ArrowRight' ? 1 : -1) * Math.PI / 12;
  }
  render();
});

Object.assign(window, { p2: { render, travelMs: cable.rideMs, legMs: cable.legMs,
  time: (ms: number) => { if (!coRide) nowMs = ms; return render(); } } });
addEventListener('pagehide', event => {
  if (!event.persisted) {
    if (socket) { socket.onclose = null; socket.close(); }
    peer?.dispose();
  }
});
render();
