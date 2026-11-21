import {
  AmbientLight, Color, DirectionalLight, FogExp2, PerspectiveCamera, PointLight,
  Scene, WebGLRenderer,
} from 'three';
import {
  crystalCavernTrailHeight, mountUndergroundCrystalCavern,
} from '../voxel-tavern/town-blockout/underground-crystal-cavern.js';

const scene = new Scene();
scene.background = new Color(0x2c3648);
scene.fog = new FogExp2(0x2c3648, .004);
scene.add(new AmbientLight(0x8a8378, .28));
const fill = new DirectionalLight(0x7fd4c8, .7);
fill.position.set(13, 32, 17);
scene.add(fill);
const camera = new PerspectiveCamera(70, innerWidth / innerHeight, .09, 280);
const fixtureHeadlamp = new PointLight(0xe8ecf0, 7, 15, 2);
fixtureHeadlamp.position.set(0, 0, -.1);
camera.add(fixtureHeadlamp);
scene.add(camera);
const renderer = new WebGLRenderer({ antialias: false, powerPreference: 'low-power' });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);

const views = {
  entrance: {
    eye: [0, crystalCavernTrailHeight(1) + 1.67, -1] as const,
    target: [3, crystalCavernTrailHeight(28) + 1.7, -28] as const,
  },
  grove: {
    eye: [-20, crystalCavernTrailHeight(41) + 1.67, -41] as const,
    target: [-39, crystalCavernTrailHeight(54) + 1.80, -54] as const,
  },
  overlook: {
    eye: [10.3, crystalCavernTrailHeight(55) + 1.67, -55] as const,
    target: [30, crystalCavernTrailHeight(74) + 2.8, -74] as const,
  },
  quay: {
    eye: [24.5, crystalCavernTrailHeight(76) + 1.67, -76] as const,
    target: [49, crystalCavernTrailHeight(87) + 1.6, -87] as const,
  },
} as const;
type ViewName = keyof typeof views;
let current: ViewName = 'entrance';
function setView(view: ViewName) {
  if (!Object.hasOwn(views, view)) return false;
  current = view;
  const { eye, target } = views[view];
  camera.position.set(...eye);
  camera.lookAt(...target);
  return true;
}
setView('entrance');
const mounted = mountUndergroundCrystalCavern({
  parent: scene,
  frame: {domainId:'review-only/crystal',east:0,north:0,height:0,yaw:0},
  acceptsCavern: () => true, supportsFoot: () => true,
  acceptsCollider: () => true, readLightBudget: () => 4,
});
if (mounted.kind !== 'ready') throw new Error('Cavern review fixture blocked: ' + mounted.kind);
let frames = 0, running = true;
function draw() {
  if (!running) return;
  renderer.render(scene, camera);
  frames++;
  requestAnimationFrame(draw);
}
draw();
const keyboard = (event: KeyboardEvent) => {
  const keys: readonly ViewName[] = ['entrance', 'grove', 'overlook', 'quay'];
  const idx = ['1','2','3','4'].indexOf(event.key);
  if (idx >= 0) setView(keys[idx]);
};
window.addEventListener('keydown', keyboard);
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
Object.assign(window, {
  cavernReview: {
    setView,
    inspect() {
      return {
        view: current, kind: mounted.kind, frames,
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        groups: mounted.meshes.length,
        voxelCount: mounted.architecture.cuboids,
        visibleLights: mounted.lights.filter(light => light.visible).length,
        eye: camera.position.toArray(),
        isFootClear: mounted.isClearLocal([
          views[current].eye[0], crystalCavernTrailHeight(
            -views[current].eye[2]), -views[current].eye[2],
        ]),
      };
    },
    dispose() {
      running = false;
      window.removeEventListener('keydown', keyboard);
      mounted.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  },
});
