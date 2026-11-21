import {
  AmbientLight, Color, DirectionalLight, FogExp2, Mesh, MeshStandardMaterial,
  PerspectiveCamera, PlaneGeometry, PointLight, Scene, Vector3, WebGLRenderer,
} from 'three';
import { mountWarriorStoneDistrict } from '../voxel-tavern/town-blockout/underground-warrior-stone-district';

// A strictly isolated artwork fixture, NOT registered in the town viewer or
// Presence world. Official underground Y=-165m and real player arrival are NOT
// faked by these review camera poses.
const site = { domainId: 'review-only/u10', east: 0, north: 0, height: 0, yaw: 0 };
const scene = new Scene();
scene.background = new Color(0x2c3648);
scene.fog = new FogExp2(0x2c3648, .005);
const ambient = new AmbientLight(0x8a8378, .38);
const directional = new DirectionalLight(0x7fd4c8, .64);
directional.position.set(-45, 36, 28);
scene.add(ambient, directional);
const floor = new Mesh(new PlaneGeometry(240, 130),
  new MeshStandardMaterial({ color: 0x5d4630, roughness: 1 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -.31;
scene.add(floor);

const renderer = new WebGLRenderer({ antialias: false, powerPreference: 'low-power' });
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x2c3648);
document.body.append(renderer.domElement);
const camera = new PerspectiveCamera(67, window.innerWidth / window.innerHeight, .09, 300);
// Review-only approximation of the accepted player's headlamp in U-13.
// It does not register a new light in the official city scene or circumvent
// the six real moonstone fixtures and server-selected budget of three.
const reviewHeadlamp = new PointLight(0xe8ecf0, 7.2, 17, 2);
reviewHeadlamp.position.set(0, 0, -.15);
camera.add(reviewHeadlamp);
scene.add(camera);
const views = {
  'home-street': {
    eye: [37.75, 1.67, 1.5] as const,
    target: [37.75, 1.67, -12.6] as const,
  },
  'home-interior': {
    eye: [37.75, 1.67, -10.9] as const,
    target: [37.75, 1.55, -15.5] as const,
  },
  'sealed-house': {
    eye: [46.5, 1.67, 1.5] as const,
    target: [46.5, 1.67, -12.6] as const,
  },
  'market-arcade': {
    eye: [141, 1.68, 18.8] as const,
    target: [158, 2.1, 22] as const,
  },
  'citywall-top': {
    eye: [101, 8.77, -27] as const,
    target: [155, 7.85, -27] as const,
  },
} as const;
type View = keyof typeof views;
let view: View = 'home-street';
const pressed = new Set<string>();
let walkedMeters = 0, rejectedSteps = 0, acceptedSteps = 0, trustedWEvents = 0;
const front = new Vector3(), right = new Vector3(), displacement = new Vector3();
const capsuleRadius = .27, bodyHeight = 1.8, eyeHeight = 1.67;
function setView(next: View) {
  if (!Object.hasOwn(views, next)) return false;
  pressed.clear();
  view = next;
  camera.position.set(...views[next].eye);
  camera.lookAt(...views[next].target);
  return true;
}
setView(view);

// Actual review-only player movement, not a camera teleport: physical 27cm
// capsule sweeps against the same U-10 solid boxes exported to the real host.
// Every 11cm interpolated step is checked, avoiding tunneling through doors.
function step(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 3) return false;
  camera.getWorldDirection(front);
  front.y = 0;
  if (front.lengthSq() < 1e-9) return false;
  front.normalize();
  right.set(-front.z, 0, front.x);
  displacement.set(0, 0, 0);
  if (pressed.has('w') || pressed.has('arrowup')) displacement.add(front);
  if (pressed.has('s') || pressed.has('arrowdown')) displacement.sub(front);
  if (pressed.has('d') || pressed.has('arrowright')) displacement.add(right);
  if (pressed.has('a') || pressed.has('arrowleft')) displacement.sub(right);
  if (displacement.lengthSq() < 1e-9) return false;
  displacement.normalize().multiplyScalar((pressed.has('shift') ? 5.5 : 3.0) * seconds);
  const chunks = Math.ceil(displacement.length() / .11);
  displacement.multiplyScalar(1 / chunks);
  let moved = false;
  for (let index = 0; index < chunks; index++) {
    const candidate = camera.position.clone().add(displacement);
    const footY = view === 'citywall-top' ? 7.12 : 0;
    if (!mounted.isClearLocal([candidate.x, footY, -candidate.z], capsuleRadius, bodyHeight)) {
      rejectedSteps++;
      break;
    }
    camera.position.copy(candidate);
    walkedMeters += displacement.length();
    acceptedSteps++;
    moved = true;
  }
  return moved;
}

const mounted = mountWarriorStoneDistrict({
  parent: scene,
  site,
  supportsDistrict: () => true,
  supportsFoot: () => true,
  acceptsSolidWorldBox: () => true,
  readViewer: () => undefined,
  canUse: () => false,
  readActionRevision: () => undefined,
  nextActionRequestId: () => undefined,
  dispatch: () => {},
  readLightBudget: () => 3,
});
if (mounted.kind !== 'ready') throw new Error('Review fixture cannot mount YS4/YS5: ' + mounted.kind);
let rendered = 0;
let running = true;
let lastFrameTime = performance.now();
function animate(now: number) {
  if (!running) return;
  const elapsed = Math.min(.04, Math.max(0, (now - lastFrameTime) / 1000));
  lastFrameTime = now;
  if (pressed.size) step(elapsed);
  renderer.render(scene, camera);
  rendered++;
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

function onKeyDown(event: KeyboardEvent) {
  if (event.key === '1') setView('home-street');
  if (event.key === '2') setView('home-interior');
  if (event.key === '3') setView('market-arcade');
  if (event.key === '4') setView('citywall-top');
  const key = event.key.toLowerCase();
  if (['w', 'a', 's', 'd', 'shift', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
    pressed.add(key);
    if (key === 'w' && event.isTrusted) trustedWEvents++;
    event.preventDefault();
  }
}
function onKeyUp(event: KeyboardEvent) { pressed.delete(event.key.toLowerCase()); }
function onBlur() { pressed.clear(); }
const onMouseMove = (event: MouseEvent) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  camera.rotation.order = 'YXZ';
  camera.rotation.y -= event.movementX * .0025;
  camera.rotation.x = Math.max(-1.35, Math.min(1.35, camera.rotation.x - event.movementY * .0025));
};
const onCanvasClick = () => renderer.domElement.requestPointerLock();
window.addEventListener('keydown', onKeyDown);
window.addEventListener('keyup', onKeyUp);
window.addEventListener('blur', onBlur);
document.addEventListener('mousemove', onMouseMove);
renderer.domElement.addEventListener('click', onCanvasClick);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
Object.assign(window, {
  warriorArchitectureReview: {
    setView,
    /** Called from a real keyboard event, not from a fake scripted walk flag. */
    step,
    inspect() {
      const info = renderer.info.render;
      return {
        kind: mounted.kind, view, frames: rendered, eyeHeight: camera.position.y,
        voxelCount: mounted.voxelCount,
        architecture: mounted.architecture,
        batches: mounted.batches,
        lights: mounted.lamps.length,
        visibleLights: mounted.lamps.filter(light => light.visible).length,
        triangles: info.triangles,
        drawCalls: info.calls,
        walk: { meters: walkedMeters, acceptedSteps, rejectedSteps, trustedWEvents,
          east: camera.position.x, north: -camera.position.z,
          footHeight: view === 'citywall-top' ? 7.12 : 0,
          clear: mounted.isClearLocal([camera.position.x,
            view === 'citywall-top' ? 7.12 : 0, -camera.position.z], capsuleRadius, bodyHeight) },
        renderedSize: [renderer.domElement.width, renderer.domElement.height],
      };
    },
    dispose() {
      running = false;
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('mousemove', onMouseMove);
      renderer.domElement.removeEventListener('click', onCanvasClick);
      mounted.dispose();
      floor.geometry.dispose();
      (floor.material as MeshStandardMaterial).dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  },
});
