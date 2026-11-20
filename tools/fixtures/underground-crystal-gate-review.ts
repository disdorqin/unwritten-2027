import {
  AmbientLight, BufferAttribute, BufferGeometry, Color, DirectionalLight, DoubleSide, Mesh, MeshStandardMaterial,
  PerspectiveCamera, Scene, WebGLRenderer,
} from 'three';
import { createUndergroundMineGate } from '../../src/presence/underground-mine-gate.js';
import { createUndergroundCrystalGate } from '../voxel-tavern/town-blockout/underground-crystal-gate.js';
import { createUndergroundMineLayout } from '../voxel-tavern/town-blockout/underground-mine-layout.js';

const walker = { radius: .27, standingHeight: 1.8, crouchingHeight: 1.1, maxGrade: .2 };
const mine = createUndergroundMineLayout({
  pool: { length: 4, width: 6, depth: 1.2, shaftAperture: { width: 2, length: 2 } },
  shoreLength: 8, gallery: { length: 20, drop: 1, railGauge: 1, railWidth: .08 },
  collapse: { length: 3, width: 1.2, height: 1.3 },
  camp: { length: 10, side: 'right', extension: 5, openBackForExpansion: true, crystalGate: true },
  walker,
});
const site = mine.expansion?.gate;
if (!site) throw new Error('The mine layout did not register the review gate');
const visual = createUndergroundCrystalGate(site);
const coldAir = visual.group.getObjectByName('mine-crystal-gate-cold-air')!;
const fallingFrost = visual.group.getObjectByName('mine-crystal-gate-falling-frost')!;
const [gateX, floor, gateZ] = site.position;
const [winchX, winchY, winchZ] = visual.winchPosition;
let footZ = gateZ - 3.37;
let cleared = false;
let blocked = 0;
let trustedKeys = 0;
const playerId = 'mine-gate-review';
const domainId = 'mine-gate-review/mine';
const authority = createUndergroundMineGate({
  winch: { east: winchX, north: -winchZ, height: winchY, domainId, horizontalReach: 2.55, verticalReach: .2 },
  readAcceptedFoot: id => id === playerId
    ? { playerId, domainId, east: gateX, north: -footZ, height: floor }
    : undefined,
  encounter: { isSectionCleared: section => section === 'mine' && cleared },
  now: () => performance.now(),
  revealMs: 2_400,
});

const renderer = new WebGLRenderer({ antialias: true });
const scene = new Scene();
scene.background = new Color('#171f27');
const camera = new PerspectiveCamera(67, innerWidth / innerHeight, .025, 65);
renderer.setSize(innerWidth, innerHeight);
document.querySelector('main')!.append(renderer.domElement);
scene.add(visual.group, new AmbientLight(0xced9e6, 1.15));
const lamp = new DirectionalLight(0xffd0a1, 1.9);
lamp.position.set(gateX - 2, floor + 3, gateZ - 3);
lamp.target.position.set(gateX, floor + 1.55, gateZ);
scene.add(lamp, lamp.target);
const palette = { rock: 0x6c665f, rail: 0x655a51, water: 0x46636d };
for (const [surface, color] of Object.entries(palette) as [keyof typeof palette, number][]) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(mine.mesh[surface], 3));
  geometry.computeVertexNormals();
  scene.add(new Mesh(geometry, new MeshStandardMaterial({ color, side: DoubleSide, roughness: .92 })));
}
const note = document.querySelector<HTMLOutputElement>('output')!;
const decisionText = { unreachable: '请靠近绞盘', uncleared: '先完成矿一清段', 'clock-unavailable': '绞盘暂不可用' };
addEventListener('keydown', event => {
  if (!['KeyW', 'KeyS', 'KeyE', 'KeyF'].includes(event.code)) return;
  if (event.isTrusted) trustedKeys++;
  if (event.code === 'KeyF') {
    cleared = true;
    note.value = '评审：已模拟矿一清段';
  } else if (event.code === 'KeyE') {
    if (event.repeat) return;
    const result = authority.openFromMine(playerId);
    note.value = result in decisionText ? decisionText[result as keyof typeof decisionText] : '绞盘已受理';
  } else {
    const nextZ = footZ + (event.code === 'KeyW' ? .12 : -.12);
    if (mine.queryPassage(gateX, nextZ, walker.radius, walker.standingHeight, authority.state())) footZ = nextZ;
    else blocked++;
  }
});
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
let frame = 0;
let coldAirFrames = 0;
let frostFrames = 0;
function render(now: number) {
  visual.update(authority.state(), now);
  if (coldAir.visible) coldAirFrames++;
  if (fallingFrost.visible) frostFrames++;
  camera.position.set(gateX, floor + 1.56, footZ);
  const targetHeight = Math.abs(footZ - gateZ) > 2 ? 1.7 : 1.0;
  camera.lookAt(gateX, floor + targetHeight, footZ + (footZ > gateZ ? -2 : 2));
  renderer.render(scene, camera);
  frame++;
  requestAnimationFrame(render);
}
requestAnimationFrame(render);

Object.assign(window, { undergroundCrystalGateReview: {
  inspect: () => ({
    footZ, gateZ, cleared, stage: authority.state(), blocked, trustedKeys, status: note.value, frame,
    openingEffects: { coldAir: coldAir.visible, fallingFrost: fallingFrost.visible, coldAirFrames, frostFrames },
    draws: renderer.info.render.calls, triangles: renderer.info.render.triangles,
    webglError: renderer.getContext().getError(),
  }),
} });
