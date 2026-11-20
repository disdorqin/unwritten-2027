import {
  AmbientLight, BoxGeometry, Color, DirectionalLight, FogExp2, Group, Mesh,
  MeshLambertMaterial, PerspectiveCamera, Scene, Vector3, WebGLRenderer,
} from 'three';
import { createMainSummitBlock, mainSummitLayout } from './main-summit-block';
import { mountMainSummitOutlook } from './main-summit-outlook';
import {
  createMainSummitRegistration, createMainSummitRegistrationLandmarks, mountMainSummitRegistration,
} from './main-summit-registration';

type Area = 'cloud-deck' | 'summit';
type Position = { east: number; north: number; height: number };
type Action = 'cloud-stamp' | 'summit-stamp' | 'register-summit';
type Profile = ReturnType<ReturnType<typeof createMainSummitRegistration>['snapshot']>;

const previewCloudFloor = 347;
const profileKey = 'unwritten.main-summit-registration.review.v1';
const stepHeight = 0.43;
const personRadius = 0.27;
const personHeight = 1.76;
const walkingSpeed = 3.2;
const movementCodes = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowLeft', 'ArrowRight']);
const keys = new Set<string>();
const proofs = new URLSearchParams(location.search).get('proof') === '1';
const labels: Record<Action, string> = {
  'cloud-stamp': '盖云海台章',
  'summit-stamp': '盖绝顶章',
  'register-summit': '登顶登记',
};

const landmarks = createMainSummitRegistrationLandmarks(previewCloudFloor);
const terrain = createMainSummitBlock(mainSummitLayout, previewCloudFloor, 20);
terrain.coarse.material.color.set('#a5b4c1');
const scene = new Scene();
scene.background = new Color('#acc4db');
scene.fog = new FogExp2('#bed0e0', 0.009);
const cloudDeck = new Mesh(
  new BoxGeometry(24, 1.5, 21),
  new MeshLambertMaterial({ color: '#b4c2cc' }),
);
cloudDeck.position.set(landmarks.cloudDeck.stampPoint.east, previewCloudFloor - 0.75,
  -landmarks.cloudDeck.stampPoint.north);
scene.add(terrain.coarse, cloudDeck);

const navigation = [...document.querySelectorAll<HTMLButtonElement>('[data-p4-area]')];
const status = document.querySelector<HTMLOutputElement>('#status')!;
const button = document.querySelector<HTMLButtonElement>('#action')!;
const objects = new Group();
scene.add(objects, new AmbientLight('#dbefff', 1.4));
const sun = new DirectionalLight('#fff0cc', 2.25);
sun.position.set(1, 2.5, -1);
scene.add(sun);

const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.domElement.setAttribute('aria-label', '主峰第一人称预览');
document.body.append(renderer.domElement);
const camera = new PerspectiveCamera(66, 1, 0.06, 1800);
const view = new Vector3();

function readProfile(): Partial<Profile> | undefined {
  const encoded = localStorage.getItem(profileKey);
  if (!encoded) return;
  try {
    const profile: unknown = JSON.parse(encoded);
    if (!profile || typeof profile !== 'object') return;
    const read = (key: keyof Profile) => Object.hasOwn(profile, key) && (profile as Partial<Profile>)[key] === true;
    return {
      cloudStamped: read('cloudStamped'), summitStamped: read('summitStamped'),
      summitRegistered: read('summitRegistered'), snowWingEligible: read('snowWingEligible'),
    };
  } catch (error) {
    if (error instanceof SyntaxError) return;
    throw error;
  }
}

let session = createMainSummitRegistration(landmarks, readProfile());
let area: Area = 'cloud-deck';
let position: Position;
let mounted: ReturnType<typeof mountMainSummitRegistration>;
let outlook: ReturnType<typeof mountMainSummitOutlook> | undefined;
let outlookDraws = 0;
let arrived = false;
let insideHut = false;
let yaw = 0;
let mountCount = 0;
let collisions = 0;
let lastAction: Action | null = null;

function isNear(target: Position, distance: number) {
  return Math.hypot(position.east - target.east, position.north - target.north) <= distance &&
    Math.abs(position.height - target.height) <= stepHeight;
}

function actionAtFeet(): Action | undefined {
  const profile = session.snapshot();
  if (area === 'cloud-deck' && !profile.cloudStamped && isNear(landmarks.cloudDeck.stampPoint, 1.1)) return 'cloud-stamp';
  if (area === 'summit' && arrived) {
    if (!profile.summitStamped && isNear(landmarks.summit.stampPoint, 1.1)) return 'summit-stamp';
    if (!profile.summitRegistered && insideHut && isNear(landmarks.summit.registry, 1.1)) return 'register-summit';
  }
}

function syncHud() {
  const action = actionAtFeet();
  const profile = session.snapshot();
  button.hidden = action === undefined;
  button.textContent = action === undefined ? '' : labels[action];
  button.dataset.action = action ?? '';
  if (area === 'cloud-deck') status.value = profile.cloudStamped ? '云海台章已收录' : '前往云海台碑';
  else if (!arrived) status.value = '前往绝顶小屋入口';
  else if (profile.snowWingEligible) status.value = '登顶登记完成 · 可领取雪翼';
  else status.value = insideHut ? '前往登记台' : '已抵达绝顶台';
}

function draw() {
  camera.position.set(position.east, position.height + 1.62, -position.north);
  view.set(Math.sin(yaw), -0.075, -Math.cos(yaw)).add(camera.position);
  camera.lookAt(view);
  outlookDraws = 0;
  renderer.render(scene, camera);
}

function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  draw();
}

function mountArea(next: Area) {
  mounted?.dispose();
  outlook?.dispose();
  outlook = undefined;
  keys.clear();
  area = next;
  session = createMainSummitRegistration(landmarks, readProfile());
  mounted = mountMainSummitRegistration(objects, landmarks, area);
  if (area === 'summit') {
    outlook = mountMainSummitOutlook(objects, terrain.heightAt);
    outlook.group.traverse(object => {
      if ((object as Mesh).isMesh) object.onAfterRender = () => { outlookDraws++; };
    });
  }
  position = next === 'summit'
    ? { ...landmarks.summit.routes.fromTrail[0]! }
    : { ...landmarks.cloudDeck.stampPoint, north: landmarks.cloudDeck.stampPoint.north - 5 };
  terrain.coarse.visible = next === 'summit';
  cloudDeck.visible = next === 'cloud-deck';
  arrived = false;
  insideHut = false;
  yaw = 0;
  lastAction = null;
  mountCount++;
  for (const item of navigation) item.setAttribute('aria-pressed', String(item.dataset.p4Area === area));
  syncHud();
  draw();
}

function floorAt(east: number, north: number) {
  if (area === 'summit') {
    const ground = terrain.heightAt(east, north);
    return ground === undefined || ground < 800 - stepHeight ? undefined : ground;
  }
  if (Math.abs(east - landmarks.cloudDeck.stampPoint.east) >= 12 - personRadius ||
    Math.abs(north - landmarks.cloudDeck.stampPoint.north) >= 10.5 - personRadius) return;
  return previewCloudFloor;
}

function move(east: number, north: number) {
  const height = floorAt(east, north);
  if (height === undefined || Math.abs(position.height - height) > stepHeight) return false;
  const z = -north;
  const blocked = outlook?.blocked(east, north, height, personRadius, personHeight) || mounted.colliders.some(({ min, max }) =>
    height < max[1] - 0.01 && height + personHeight > min[1] &&
    Math.hypot(Math.max(min[0] - east, east - max[0], 0), Math.max(min[2] - z, z - max[2], 0)) < personRadius,
  );
  if (blocked) {
    collisions++;
    return false;
  }
  position = { east, north, height };
  return true;
}

function advance(elapsedMs: number, paint = true) {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs > 15_000) throw new RangeError('Invalid preview delta.');
  const elapsed = elapsedMs / 1000;
  const turn = Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft'));
  yaw += turn * 2 * elapsed;
  const forward = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
  const side = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
  const vectorLength = Math.hypot(forward, side);
  if (vectorLength > 0 && elapsed > 0) {
    const distance = walkingSpeed * elapsed / vectorLength;
    const deltaEast = (Math.sin(yaw) * forward + Math.cos(yaw) * side) * distance;
    const deltaNorth = (Math.cos(yaw) * forward - Math.sin(yaw) * side) * distance;
    const steps = Math.max(1, Math.ceil(Math.hypot(deltaEast, deltaNorth) / 0.12));
    for (let index = 0; index < steps; index++) {
      const east = position.east + deltaEast / steps;
      const north = position.north + deltaNorth / steps;
      move(east, north);
      if (area === 'summit' && isNear(landmarks.summit.entry, 1.15)) arrived = true;
    }
  }
  const hut = landmarks.summit.hut;
  insideHut = area === 'summit' && arrived && position.east > hut.west + personRadius &&
    position.east < hut.east - personRadius && position.north > hut.south + personRadius &&
    position.north < hut.north - personRadius;
  syncHud();
  if (paint) draw();
}

function act() {
  const available = actionAtFeet();
  if (available === undefined) return;
  const result = session.interact(area, position);
  if (result.action === available && result.changed) {
    localStorage.setItem(profileKey, JSON.stringify(result.profile));
    lastAction = available;
  }
  syncHud();
  draw();
}

for (const item of navigation) item.addEventListener('click', () => {
  if (item.dataset.p4Area === 'summit' || item.dataset.p4Area === 'cloud-deck') mountArea(item.dataset.p4Area);
});
button.addEventListener('click', act);
addEventListener('keydown', event => {
  if (movementCodes.has(event.code)) {
    event.preventDefault();
    keys.add(event.code);
  }
  if (event.code === 'KeyE' && !event.repeat) act();
});
addEventListener('keyup', event => keys.delete(event.code));
addEventListener('blur', () => keys.clear());
addEventListener('resize', resize);

function snapshot() {
  return {
    area, position: { ...position }, arrived, insideHut, profile: session.snapshot(),
    action: actionAtFeet() ?? null, lastAction, mountCount, collisions,
    yaw, outlook: outlook ? { stand: outlook.stand, draws: outlookDraws } : null,
    render: { draws: renderer.info.render.calls, triangles: renderer.info.render.triangles },
  };
}

mountArea('cloud-deck');
resize();
if (proofs) Object.assign(window, { p4: { snapshot, advance } });
else {
  let previous = performance.now();
  const update = (now: number) => {
    advance(Math.min(now - previous, 50));
    previous = now;
    requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
}
