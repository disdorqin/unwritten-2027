import { Color, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import type { OrbitalAnchorId } from '../../../src/presence/orbital-anchor-registry.js';
import { createOrbitalStationDeck, type OrbitalStationRoom } from './orbital-station-deck.js';
import { orbitalAnchorLabels } from './orbital-teleport-cabin.js';

const roomNames: Readonly<Record<OrbitalStationRoom, string>> = {
  airlock: '气闸舱', living: '生活舱', cockpit: '驾驶舱', observation: '观景舱', teleport: '传送室',
};

const station = createOrbitalStationDeck();
const scene = new Scene();
scene.background = new Color('#15212c');
scene.add(station.group);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
document.body.append(renderer.domElement);
const camera = new PerspectiveCamera(63, innerWidth / innerHeight, .035, 40);
const roomLabel = document.querySelector<HTMLOutputElement>('#room')!;
const terminal = document.querySelector<HTMLElement>('#terminal')!;
const terminalList = terminal.querySelector('dl')!;
let { x, n, ground, yaw } = station.start;
let pitch = 0;
const terminals = new Map<string, HTMLElement>();

function makeCell(id: string, name: string) {
  const label = document.createElement('dt');
  const value = document.createElement('dd');
  label.textContent = name;
  terminalList.append(label, value);
  terminals.set(id, value);
}
makeCell('hub', '轨道舱');
for (const { id } of station.teleport.readState().anchors) makeCell(id, orbitalAnchorLabels[id]);

function setCell(id: string, lit: boolean) {
  const cell = terminals.get(id)!;
  if (cell.dataset.lit === String(lit)) return;
  cell.dataset.lit = String(lit);
  cell.textContent = lit ? '已点亮' : '未到访';
}

const supportedKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);
const keys = new Set<string>();
const speed = 2.6, turnRate = 1.5, tick = 1 / 120, eye = 1.65;
let remainder = 0, walked = 0, blocked = 0;

function step() {
  const axis = (positive: string, negative: string) => Number(keys.has(positive)) - Number(keys.has(negative));
  yaw += axis('ArrowRight', 'ArrowLeft') * tick * turnRate;
  yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
  pitch = Math.min(1.15, Math.max(-1.15, pitch + axis('ArrowUp', 'ArrowDown') * tick * turnRate));
  const forward = axis('KeyW', 'KeyS');
  const strafe = axis('KeyD', 'KeyA');
  if (!forward && !strafe) return;
  const travel = speed * tick / Math.hypot(forward, strafe);
  const nextX = x + travel * (Math.sin(yaw) * forward + Math.cos(yaw) * strafe);
  const nextN = n + travel * (Math.cos(yaw) * forward - Math.sin(yaw) * strafe);
  const nextGround = station.floorHeightAt(nextX, nextN);
  if (nextGround === undefined || Math.abs(nextGround - ground) > .43 || !station.isWalkable(nextX, nextN)) {
    blocked++;
    return;
  }
  x = nextX;
  n = nextN;
  ground = nextGround;
  walked++;
}

function draw() {
  camera.position.set(x, ground + eye, -n);
  camera.lookAt(x + Math.sin(yaw) * Math.cos(pitch), ground + eye + Math.sin(pitch),
    -n - Math.cos(yaw) * Math.cos(pitch));
  renderer.render(scene, camera);
  const room = station.roomAt(x, n);
  const label = room ? roomNames[room] : '舱间通道';
  if (roomLabel.value !== label) roomLabel.value = label;
  terminal.hidden = room !== 'teleport';
  if (terminal.hidden) return;
  const display = station.teleport.readState();
  setCell('hub', display.hubLit);
  for (const { id, lit } of display.anchors) setCell(id, lit);
}

function snapshot() {
  return {
    pose: { x, n, ground, yaw, pitch }, room: station.roomAt(x, n),
    tourRoute: station.tourRoute, rooms: station.rooms, hub: station.teleport.readState(),
    walked, blocked, draws: renderer.info.render.calls, triangles: renderer.info.render.triangles,
    speed, turnRate, tick,
  };
}

function advance(ms: number) {
  if (!Number.isFinite(ms) || ms < 0 || ms > 10_000) throw new RangeError('Invalid orbital walkthrough interval');
  remainder += ms / 1000;
  const frames = Math.floor((remainder + 1e-10) / tick);
  for (let index = 0; index < frames; index++) step();
  remainder = Math.max(0, remainder - frames * tick);
  draw();
  return snapshot();
}

function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  draw();
}

addEventListener('resize', resize);
addEventListener('keydown', event => {
  if (!supportedKeys.has(event.code) || event.altKey || event.ctrlKey || event.metaKey) return;
  event.preventDefault();
  keys.add(event.code);
});
addEventListener('keyup', event => keys.delete(event.code));
addEventListener('blur', () => keys.clear());
resize();

let frameId = 0;
if (new URL(location.href).searchParams.get('proof') === '1') {
  Object.assign(window, { orbitalStationReview: {
    advance, snapshot,
    setVisitedAnchors(ids: readonly OrbitalAnchorId[]) { station.teleport.setVisitedAnchors(ids); draw(); },
  } });
} else {
  let previous = performance.now();
  function frame(now: number) {
    advance(Math.min(50, now - previous));
    previous = now;
    frameId = requestAnimationFrame(frame);
  }
  frameId = requestAnimationFrame(frame);
}

addEventListener('pagehide', () => {
  cancelAnimationFrame(frameId);
  station.dispose();
  renderer.dispose();
}, { once: true });
