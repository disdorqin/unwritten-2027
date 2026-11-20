import { AmbientLight, BoxGeometry, Color, DirectionalLight, Fog, Mesh, MeshStandardMaterial, PerspectiveCamera,
  PointLight, RingGeometry, Scene, WebGLRenderer } from 'three';
import { createBoosterForge, type BoosterForgeProfile, type BoosterForgeState } from '../../../src/presence/booster-forge';
import { createZodiacStarStones, zodiacStarStoneIds } from '../../../src/shared/zodiac-star-stones';
import { createFlightBoosterVisual } from './flight-equipment-visuals';
import { createTownPhysicsClock, townPhysicsDelta } from './town-physics-clock';
import { createUndergroundWarriorCity } from './underground-warrior-city';
import { createWarriorForgeHall } from './underground-warrior-forge-hall';

const scene = new Scene();
scene.background = new Color('#263443');
scene.fog = new Fog('#263443', 28, 105);
const city = createUndergroundWarriorCity();
const hall = createWarriorForgeHall();
scene.add(city.group, hall.group, new AmbientLight('#c4daee', 1.3));
const key = new DirectionalLight('#d4e5fa', 1.7);
key.position.set(15, 40, -12);
scene.add(key);

const block = new BoxGeometry();
const material = (color: number, emissive = 0) => new MeshStandardMaterial({ color, emissive });
const ice = new Mesh(block, material(0xa7deef, 0x386577));
const dust = new Mesh(block, material(0xeca93c, 0xa66427));
ice.position.set(139.76, -164.1, -10);
dust.position.set(140.24, -164.1, -10);
for (const mesh of [ice, dust]) mesh.scale.set(.27, .18, .22);
const coreStone = new Mesh(block, material(0x81aeb1, 0x487676));
coreStone.position.set(144.42, -164.48, -11.17);
coreStone.scale.set(.22, .27, .22);
const ring = new Mesh(new RingGeometry(.39, .44, 32), material(0xf1b754, 0xc98f3c));
ring.rotation.x = -Math.PI / 2;
ring.position.set(140, -164.193, -10);
const heat = new Mesh(block, material(0xffefa4, 0xffb751));
heat.position.set(143.96, -163.4, -11.28);
heat.scale.set(.20, .18, .15);
const light = new PointLight(0xff8c48, 0, 16, 2);
light.position.set(144, -163.6, -11.18);
const visual = createFlightBoosterVisual();
visual.group.scale.setScalar(.63);
visual.group.rotation.y = Math.PI;
scene.add(ice, dust, coreStone, ring, heat, light, visual.group);

const savedKey = 'warrior-forge-review:v2';
const reviewOptions = new URLSearchParams(location.search);
const playerId = reviewOptions.get('role') === 'installer' ? 'forge-installer' : 'forge-crafter';
const forgeId = 'warrior-city-forge';
const sockets = { 'install-core': 'core-stand', place: 'stone-table', stoke: 'bellows', collect: 'outlet', fuel: 'outlet' } as const;
// The stand-alone proof boots two authoritative ring snapshots and a test recipe, without touching the public town.
const installed = reviewOptions.get('stars') === '11' ? zodiacStarStoneIds.filter(id => id !== 'goat') : zodiacStarStoneIds;
const townRing = createZodiacStarStones({ origins: {}, installed });
const fixtureRecipe = { iceCrystalShards: 1, stardustOre: 1 } as const;
type Save = { forge?: BoosterForgeState; profiles: Record<string, BoosterForgeProfile> };
const initialProfile: BoosterForgeProfile = { iceCrystalShards: 1, stardustOre: 2, boosterOwned: false, fuelSeconds: 0 };
let saved: Save = { profiles: { [playerId]: initialProfile } };
try {
  const value = localStorage.getItem(savedKey);
  if (value) saved = JSON.parse(value) as Save;
} catch {} // The browser fixture can still be viewed without storage.
const profile = () => saved.profiles[playerId] ?? initialProfile;
const forge = createBoosterForge({
  forgeId, socketIds: sockets, now: () => Date.now(), initial: saved.forge,
  recipe: fixtureRecipe, readInstalledStones: () => townRing.ringProgress().installed,
  readProfile: id => id === playerId ? profile() : undefined,
  save(state, change, priorRevision) {
    const value = localStorage.getItem(savedKey);
    const latest = value ? JSON.parse(value) as Save : saved;
    if ((latest.forge?.revision ?? 0) !== priorRevision) return false;
    if (change && JSON.stringify(change.prior) !== JSON.stringify(latest.profiles[change.playerId] ?? initialProfile)) return false;
    const profiles = change ? { ...latest.profiles, [change.playerId]: change.next } : latest.profiles;
    const next = { forge: state, profiles };
    localStorage.setItem(savedKey, JSON.stringify(next));
    saved = next;
    return true;
  },
});

let east = hall.entry.east, north = 0, feet = hall.entry.height, yaw = 0;
let accepted = 0, blocked = 0, frames = 0, lastHeat = -1, outletStarted = 0;
let actionResult = '', audio: AudioContext | undefined;
const inventory = document.querySelector<HTMLOutputElement>('#inventory')!;
const action = document.querySelector<HTMLOutputElement>('#action')!;
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(1.5, devicePixelRatio));
document.body.prepend(renderer.domElement);
const camera = new PerspectiveCamera(60, 1, .08, 150);
const keys = new Set<string>();
const movement = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowLeft', 'ArrowRight']);
const clock = createTownPhysicsClock();

function walkable(e: number, n: number) {
  const cityFloor = city.floorHeightAt(e, n);
  const hallFloor = hall.floorHeightAt(e, n);
  if (hallFloor !== undefined && !hall.canStand(e, n)) return;
  if (cityFloor !== undefined && !city.isWalkable(e, n)) return;
  return hallFloor ?? cityFloor;
}

function standingNear(socket: typeof hall.stand.place) {
  if (Math.abs(feet - socket.height) > .15 || Math.hypot(socket.east - east, socket.north - north) > .85) return false;
  for (let i = 1; i <= 5; i++) {
    if (walkable(east + (socket.east - east) * i / 5, north + (socket.north - north) * i / 5) === undefined) return false;
  }
  return true;
}

function interact(fuel: boolean) {
  const state = forge.readForge();
  const atCore = standingNear(hall.stand.collect);
  const name = fuel ? 'fuel' : state.core === 'formed' && atCore ? 'install-core' :
    state.phase === 'materials' ? 'place' : state.phase === 'ready' ? 'stoke' : 'collect';
  if (!standingNear(hall.stand[name === 'fuel' || name === 'install-core' ? 'collect' : name])) {
    actionResult = '靠近对应的材台、风箱或炉口。';
    return;
  }
  if (name === 'collect' && (state.phase !== 'outlet' || performance.now() - outletStarted < 650)) return;
  if (!audio) audio = new AudioContext();
  void audio.resume().catch(() => undefined);
  const result = forge.submit({ playerId, requestId: crypto.randomUUID(), action: name,
    forgeId, socketId: sockets[name], expectedRevision: state.revision });
  actionResult = result.kind === 'accepted' ? '' : result.kind === 'owned' ? '助推器已在包内。' :
    result.kind === 'core-required' ? '尚未安放全镇炉芯。' :
    result.kind === 'materials-missing' ? '材料不足。' : result.kind === 'save-failed' ? '存档未写入，可重试。' : '炉位暂不可用。';
}

function lowNote() {
  if (!audio || audio.state !== 'running') return;
  const amplitude = Math.max(0, 1 - Math.hypot(east - 144, north - 11) / 70) * .11;
  if (!amplitude) return;
  const tone = audio.createOscillator(), gain = audio.createGain();
  tone.type = 'triangle';
  tone.frequency.value = 65;
  tone.connect(gain).connect(audio.destination);
  gain.gain.setValueAtTime(amplitude, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .65);
  tone.start();
  tone.stop(audio.currentTime + .66);
}

function step() {
  yaw += (Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft'))) * townPhysicsDelta * 1.8;
  const forward = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
  const right = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
  if (!forward && !right) return;
  const distance = townPhysicsDelta * 3.3 / Math.hypot(forward, right);
  const e = east + distance * (Math.sin(yaw) * forward + Math.cos(yaw) * right);
  const n = north + distance * (Math.cos(yaw) * forward - Math.sin(yaw) * right);
  const y = walkable(e, n);
  if (y === undefined || Math.abs(y - feet) > .43) { blocked++; return; }
  [east, north, feet] = [e, n, y];
  actionResult = '';
  accepted++;
}

function keyDown(event: KeyboardEvent) {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (movement.has(event.code)) { event.preventDefault(); keys.add(event.code); }
  if (!event.repeat && (event.code === 'KeyE' || event.code === 'KeyR')) interact(event.code === 'KeyR');
}
function keyUp(event: KeyboardEvent) { keys.delete(event.code); }
function blur() { keys.clear(); }
function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}

let previous = performance.now(), animation = 0;
let priorPhase = '';
function draw(now: number) {
  clock.advance(Math.min((now - previous) / 1000, .1), step);
  previous = now;
  const { phase, heat: progress, core } = forge.readForge();
  const placed = phase === 'ready';
  const firing = phase === 'heating' || phase === 'outlet';
  if (phase === 'outlet' && phase !== priorPhase) outletStarted = now;
  const slot = firing ? Math.floor(progress * 4) : -1;
  if (slot > lastHeat && slot > 0) lowNote();
  priorPhase = phase;
  lastHeat = slot;
  ice.visible = dust.visible = ring.visible = placed;
  coreStone.visible = core === 'installed';
  heat.visible = firing;
  heat.scale.y = .16 + progress * .56;
  light.intensity = firing ? 22 + 19 * progress : 0;
  light.color.set(firing ? 0xffe9c3 : 0xff8c48);
  visual.group.visible = phase === 'outlet';
  visual.group.position.set(144, -164.04, -11.49 + .67 * Math.min(1, (now - outletStarted) / 650));
  const { iceCrystalShards, stardustOre, boosterOwned, fuelSeconds } = profile();
  inventory.value = `冰晶片 ${iceCrystalShards} · 星尘矿 ${stardustOre} · 助推器 ${boosterOwned ? '已入包' : '未取得'} · 全推余量 ${fuelSeconds} 秒`;
  action.value = actionResult || (core === 'formed' ? 'E 在炉口安放原石' : core === 'unformed' ? '全镇炉芯未就绪' :
    phase === 'outlet' ? 'E 取下助推器 · R 补粉' :
    phase === 'ready' ? 'E 拉动风箱' : phase === 'heating' ? `火候 ${Math.floor(progress * 4)} / 4` : 'E 在石台交料');
  camera.position.set(east, feet + 1.64, -north);
  camera.lookAt(east + Math.sin(yaw), feet + 1.44, -north - Math.cos(yaw));
  renderer.render(scene, camera);
  frames++;
  animation = requestAnimationFrame(draw);
}

addEventListener('keydown', keyDown);
addEventListener('keyup', keyUp);
addEventListener('blur', blur);
addEventListener('resize', resize);
addEventListener('pagehide', () => {
  cancelAnimationFrame(animation);
  removeEventListener('keydown', keyDown);
  removeEventListener('keyup', keyUp);
  removeEventListener('blur', blur);
  removeEventListener('resize', resize);
  city.dispose();
  hall.dispose();
  visual.dispose();
  block.dispose();
  ring.geometry.dispose();
  for (const mesh of [ice, dust, coreStone, heat, ring]) mesh.material.dispose();
  void audio?.close();
  renderer.dispose();
}, { once: true });
Object.defineProperty(window, '__warriorForgeProof', { value: () => ({ east, north, feet, frames, accepted, blocked,
  ...forge.readForge(), playerId, inRing: townRing.ringProgress().installed, fixtureRecipe, profile: { ...profile() },
  coreVisible: coreStone.visible, result: actionResult, materialBlocks: ice.visible && dust.visible, outlet: visual.group.visible }) });
resize();
animation = requestAnimationFrame(draw);
