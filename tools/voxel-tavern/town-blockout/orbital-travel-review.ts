import * as THREE from 'three';
import { orbitalAnchorIds, type OrbitalAnchorHost, type OrbitalAnchorId } from '../../../src/presence/orbital-anchor-registry.js';
import type { OrbitalGate, OrbitalGateHost, OrbitalGatePose } from '../../../src/presence/orbital-gates.js';
import {
  collectOrbitalAnchorVisits, orbitalDoorLockedLabel, orbitalFirstTour, readOrbitalHub, resolveOrbitalChapterDoor,
  resolveOrbitalDownlink, resolveOrbitalReturnToAirlock, resolveOrbitalTourStep,
  type OrbitalPosition, type OrbitalRoom,
} from '../../../src/presence/orbital-travel.js';
import { createOrbitalStationDeck } from './orbital-station-deck.js';

const deck = createOrbitalStationDeck();
const deckDomain = 'local-orbital-deck';
const names: Record<OrbitalAnchorId, string> = { starport: '星港', 'crater-bottom': '坑底', summit: '绝顶', plaza: '广场' };
const roomNames: Record<OrbitalRoom, string> = {
  airlock: '气闸舱', living: '生活舱', cockpit: '驾驶舱', observation: '观景舱', teleport: '传送室',
};
const localFloors: Record<OrbitalAnchorId, number> = { starport: 0, 'crater-bottom': -4, summit: 6, plaza: 2 };
type Fixture = OrbitalAnchorId | 'core';
const domainFor = (id: Fixture) => `local-fixture-${id}`;
const doorN = -2.7;
const position = (domain: string, east: number, north: number, height: number, yaw = 0): OrbitalPosition =>
  ({ domain, pose: { east, north, height, yaw } });
const groundPosition = (id: Fixture, north: number) => position(domainFor(id), 0, north, id === 'core' ? -7 : localFloors[id]);
const anchorSites: OrbitalAnchorHost = Object.fromEntries(orbitalAnchorIds.map(id => [id, {
  domain: domainFor(id), containsSupportedFootpoint: (pose: OrbitalGatePose) =>
    pose.height === localFloors[id] && Math.hypot(pose.east, pose.north) <= .48,
}]));
const deckPoint = (point: { x: number; n: number; ground: number }, yaw = 0) =>
  position(deckDomain, point.x, point.n, point.ground, yaw);
const airlock = deckPoint(deck.start, -Math.PI / 2);
const deckSupport = (pose: OrbitalGatePose) => deck.isWalkable(pose.east, pose.north, .22) &&
  Math.abs((deck.floorHeightAt(pose.east, pose.north) ?? Infinity) - pose.height) < .001;

const view = document.querySelector<HTMLElement>('#view')!;
const status = document.querySelector<HTMLOutputElement>('#current')!;
const result = document.querySelector<HTMLOutputElement>('#result')!;
const fixtures = document.querySelector<HTMLElement>('#fixtures')!;
const hubPanel = document.querySelector<HTMLElement>('#hub')!;
if (new URLSearchParams(location.search).has('proof')) status.dataset.route = JSON.stringify(deck.tourRoute);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
view.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x142735);
scene.add(deck.group, new THREE.HemisphereLight(0xd9ecff, 0x3b4a50, 2.1));
const light = new THREE.DirectionalLight(0xffe2af, 1.7);
light.position.set(-4, 7, 4);
scene.add(light);
const camera = new THREE.PerspectiveCamera(65, 1, .04, 95);

const ground = new THREE.Group();
const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x536476, roughness: .94 });
const floor = new THREE.Mesh(new THREE.BoxGeometry(9, .3, 10), floorMaterial);
floor.position.y = -.15;
const pad = new THREE.Mesh(new THREE.CylinderGeometry(.48, .48, .014, 24), new THREE.MeshStandardMaterial({ color: 0xbeab82 }));
pad.position.y = .009;
const door = new THREE.Mesh(new THREE.TorusGeometry(.86, .065, 6, 32, Math.PI * 16 / 9),
  new THREE.MeshStandardMaterial({ color: 0x68867e, roughness: .96 }));
door.position.set(0, 1.05, -doorN);
const doorSlab = new THREE.Mesh(new THREE.BoxGeometry(1.75, 2.1, .1), new THREE.MeshStandardMaterial({ color: 0x263746 }));
doorSlab.position.set(0, 1.05, -doorN + .06);
ground.add(floor, pad, door, doorSlab);
scene.add(ground);

const held = new Set<string>();
let current = groundPosition('starport', -3.5);
let fixture: Fixture = 'starport';
let chapterOpen = false;
let visited: readonly OrbitalAnchorId[] = [];
let completedRooms = 0;
let yaw = current.pose.yaw;
let pitch = 0;
let physicalSteps = 0;
const anchorButtons = new Map<OrbitalAnchorId, HTMLButtonElement>();

function button(parent: HTMLElement, label: string, action: () => void) {
  const entry = document.createElement('button');
  entry.type = 'button';
  entry.textContent = label;
  entry.onclick = action;
  parent.append(entry);
  return entry;
}

function setPosition(next: OrbitalPosition) {
  current = next;
  yaw = next.pose.yaw;
  pitch = 0;
  const selected = (Object.keys(localFloors) as OrbitalAnchorId[]).find(id => domainFor(id) === next.domain);
  if (selected) fixture = selected;
  ground.position.y = next.pose.height;
  floorMaterial.color.setHex(fixture === 'crater-bottom' || fixture === 'core' ? 0x655b60 : 0x536476);
  ground.visible = next.domain !== deckDomain;
  deck.group.visible = !ground.visible;
  pad.visible = fixture !== 'core';
  doorSlab.visible = !chapterOpen;
  refresh();
}

function enterFixture(next: Fixture) {
  fixture = next;
  setPosition(groundPosition(next, -3.5));
  result.value = '验收定位，亲临记录未改。';
}

button(fixtures, '试走太空章', () => {
  chapterOpen = !chapterOpen;
  doorSlab.visible = !chapterOpen;
  refresh();
});
for (const id of orbitalAnchorIds) button(fixtures, '验收定位 · ' + names[id], () => enterFixture(id));
button(fixtures, '验收定位 · 地宫门', () => enterFixture('core'));
const doorButton = button(fixtures, '使用门（E）', useDoor);
for (const id of orbitalAnchorIds) anchorButtons.set(id, button(hubPanel, names[id], () => downlink(id)));

function atDoor(pose: OrbitalGatePose) {
  return Math.hypot(pose.east, pose.north - doorN) < .95 && Math.abs(pose.height - ground.position.y) < .001;
}

const atHub = (pose: OrbitalGatePose) => Math.hypot(pose.east - deck.teleport.console.x, pose.north - deck.teleport.console.n) < 1.15 &&
  deckSupport(pose);

function refresh() {
  const orbit = current.domain === deckDomain;
  const room = orbit ? deck.roomAt(current.pose.east, current.pose.north) : undefined;
  const display = readOrbitalHub(visited);
  const visibleHub = orbit && atHub(current.pose) && completedRooms === orbitalFirstTour.length;
  hubPanel.hidden = !visibleHub;
  hubPanel.style.display = visibleHub ? '' : 'none';
  const description = `${orbit ? (room ? roomNames[room] : '连接廊') : fixture === 'core' ? '地宫门' : names[fixture]} · 已点亮 ${visited.length}/4`;
  if (status.value !== description) status.value = description;
  status.dataset.domain = current.domain;
  status.dataset.room = room ?? '';
  status.dataset.east = current.pose.east.toFixed(3);
  status.dataset.north = current.pose.north.toFixed(3);
  status.dataset.height = current.pose.height.toFixed(3);
  status.dataset.physicalSteps = String(physicalSteps);
  status.dataset.visited = visited.join(',');
  status.dataset.completedRooms = String(completedRooms);
  doorButton.disabled = orbit || !atDoor(current.pose);
  for (const [id, entry] of anchorButtons) {
    entry.disabled = !display.anchors[id] || !chapterOpen;
    entry.setAttribute('aria-pressed', String(display.anchors[id]));
  }
}

function downlink(id: OrbitalAnchorId) {
  const travel = resolveOrbitalDownlink(id, current, visited, {
    chapterOpen, completedRooms, hubDomain: deckDomain, anchorSites, isAtHub: atHub, landingAt: key => groundPosition(key, 0),
  });
  if (!travel.ok) return;
  setPosition(travel.position);
  result.value = `已抵达${names[id]}。`;
}

function useDoor() {
  if (current.domain === deckDomain || !atDoor(current.pose)) return;
  if (fixture === 'starport' || fixture === 'core') {
    const gate: OrbitalGate = fixture;
    const gateHost: OrbitalGateHost = {
      isOpen: () => true, isAtOpening: (endpoint, pose) => endpoint === `${gate}-ground` && atDoor(pose),
      landingAt: endpoint => endpoint === `${gate}-airlock` ? { site: 'airlock', pose: airlock.pose } : undefined,
      isLegalLanding: (_, pose) => deckSupport(pose),
    };
    const travel = resolveOrbitalChapterDoor({ gate, direction: 'enter' }, { site: gate, pose: current.pose }, chapterOpen,
      { firstKeyLit: chapterOpen, flyerAssembled: chapterOpen }, gateHost);
    if (!travel.ok) { result.value = travel.reason === 'locked' ? orbitalDoorLockedLabel : '门口暂不可达'; return; }
    setPosition({ domain: deckDomain, pose: travel.state.pose });
  } else {
    const travel = resolveOrbitalReturnToAirlock(fixture, current, visited, {
      chapterOpen, anchorSites, airlockDomain: deckDomain, isAtReturnDoor: (_, pose) => atDoor(pose),
      isReturnDoorOpen: () => true, airlockLanding: () => airlock, isLegalAirlockLanding: deckSupport,
    });
    if (!travel.ok) { result.value = orbitalDoorLockedLabel; return; }
    setPosition(travel.position);
  }
  result.value = '已抵达气闸舱。';
}

function move(east: number, north: number) {
  const point = current.pose;
  if (current.domain === deckDomain) {
    const height = deck.floorHeightAt(east, north);
    if (height === undefined || !deck.isWalkable(east, north, .22) || Math.abs(point.height - height) > .24) return;
    const tour = resolveOrbitalTourStep(completedRooms, deck.roomAt(east, north), 'physical');
    if (!tour.ok) return;
    completedRooms = tour.completedRooms;
    current = position(deckDomain, east, north, height, yaw);
  } else {
    if (Math.abs(east) > 4.2 || Math.abs(north) > 4.7 ||
        (!chapterOpen && Math.abs(east) < 1.08 && Math.abs(north - doorN) < .29)) return;
    current = position(current.domain, east, north, point.height, yaw);
    const next = collectOrbitalAnchorVisits({ ...current, route: 'physical' }, visited, anchorSites);
    if (next !== visited) {
      visited = next;
      deck.teleport.setVisitedAnchors(visited);
      result.value = `${names[fixture as OrbitalAnchorId]}已点亮。`;
    }
  }
  physicalSteps++;
  refresh();
}

const keySet = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
window.addEventListener('keydown', event => {
  if (keySet.has(event.code)) { event.preventDefault(); held.add(event.code); }
  if (event.code === 'KeyE' && !event.repeat) useDoor();
});
window.addEventListener('keyup', event => held.delete(event.code));
window.addEventListener('blur', () => held.clear());
view.addEventListener('pointerdown', event => view.setPointerCapture(event.pointerId));
view.addEventListener('pointermove', event => {
  if (!view.hasPointerCapture(event.pointerId)) return;
  yaw -= event.movementX * .004;
  pitch = THREE.MathUtils.clamp(pitch - event.movementY * .004, -1.2, 1.2);
});
new ResizeObserver(() => {
  renderer.setSize(view.clientWidth, Math.max(1, view.clientHeight), false);
  camera.aspect = view.clientWidth / Math.max(1, view.clientHeight);
  camera.updateProjectionMatrix();
}).observe(view);

let previous = performance.now();
renderer.setAnimationLoop(now => {
  const dt = Math.min(.05, (now - previous) / 1000);
  previous = now;
  yaw += (Number(held.has('ArrowLeft')) - Number(held.has('ArrowRight'))) * 1.45 * dt;
  if (status.dataset.route) status.dataset.yaw = yaw.toFixed(4);
  const ahead = Number(held.has('KeyW') || held.has('ArrowUp')) - Number(held.has('KeyS') || held.has('ArrowDown'));
  const side = Number(held.has('KeyD')) - Number(held.has('KeyA'));
  if (ahead || side) {
    const step = 2.55 * dt / Math.max(1, Math.hypot(ahead, side));
    move(current.pose.east + (side * Math.cos(yaw) - ahead * Math.sin(yaw)) * step,
      current.pose.north + (ahead * Math.cos(yaw) + side * Math.sin(yaw)) * step);
  }
  camera.position.set(current.pose.east, current.pose.height + 1.58, -current.pose.north);
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
  renderer.render(scene, camera);
});
setPosition(current);
