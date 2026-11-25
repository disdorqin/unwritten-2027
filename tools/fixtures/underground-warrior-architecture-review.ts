import {
  AmbientLight, Color, DirectionalLight, FogExp2, Mesh, MeshStandardMaterial,
  PerspectiveCamera, PlaneGeometry, PointLight, Scene, WebGLRenderer,
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
    eye: [47, 1.67, 1.5] as const,
    target: [47, 2.2, -12.6] as const,
  },
  'home-interior': {
    eye: [37.75, 1.67, -10.9] as const,
    target: [37.75, 1.55, -15.5] as const,
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
function setView(next: View) {
  if (!Object.hasOwn(views, next)) return false;
  view = next;
  camera.position.set(...views[next].eye);
  camera.lookAt(...views[next].target);
  return true;
}
setView(view);

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
function animate() {
  if (!running) return;
  renderer.render(scene, camera);
  rendered++;
  requestAnimationFrame(animate);
}
animate();

function onKeyDown(event: KeyboardEvent) {
  if (event.key === '1') setView('home-street');
  if (event.key === '2') setView('home-interior');
  if (event.key === '3') setView('market-arcade');
  if (event.key === '4') setView('citywall-top');
}
window.addEventListener('keydown', onKeyDown);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
Object.assign(window, {
  warriorArchitectureReview: {
    setView,
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
        renderedSize: [renderer.domElement.width, renderer.domElement.height],
      };
    },
    dispose() {
      running = false;
      window.removeEventListener('keydown', onKeyDown);
      mounted.dispose();
      floor.geometry.dispose();
      (floor.material as MeshStandardMaterial).dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  },
});
