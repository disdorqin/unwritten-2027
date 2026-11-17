import {
  AmbientLight, Box3, BufferGeometry, Color, DirectionalLight, Group, InstancedMesh, Mesh,
  PerspectiveCamera, Scene, Spherical, Vector3, type WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createMuseumBuilder } from './museum-kit';
import { addMonthExhibit, monthModels, monthStops } from './museum-timeline';

export function createMuseumInspection(renderer: WebGLRenderer, aspect: number) {
  const canvas = renderer.domElement;
  const overlay = document.querySelector<HTMLElement>('#museum-inspection')!;
  const monthLabel = overlay.querySelector<HTMLElement>('#exhibit-month')!;
  const title = overlay.querySelector<HTMLElement>('#exhibit-title')!;
  const resetButton = overlay.querySelector<HTMLButtonElement>('#exhibit-reset')!;
  const scene = new Scene();
  scene.background = new Color('#182439');
  const key = new DirectionalLight('#ffebcf', 1.62);
  const fill = new DirectionalLight('#bdd6ff', 1.4);
  key.position.set(4, 7, 3);
  fill.position.set(-3, 4, -4);
  scene.add(new AmbientLight('#e9eefc', 1.05), key, fill);

  const camera = new PerspectiveCamera(44, aspect, .02, 60);
  const orbit = new OrbitControls(camera, canvas);
  orbit.enabled = false;
  orbit.enablePan = false;
  orbit.enableDamping = false;
  orbit.minPolarAngle = .12;
  orbit.maxPolarAngle = Math.PI * .74;
  const angle = new Spherical();

  let model: Group | undefined;
  let front = 1;
  let radius = 1;
  let fitDistance = 1;

  function frameDistance() {
    const halfHeight = camera.fov * Math.PI / 360;
    const halfWidth = Math.atan(Math.tan(halfHeight) * camera.aspect);
    return radius * 1.18 / Math.sin(Math.min(halfWidth, halfHeight));
  }

  function updateDistanceLimits() {
    fitDistance = frameDistance();
    orbit.minDistance = radius * 1.08;
    orbit.maxDistance = fitDistance * 2.15;
  }

  function reset() {
    orbit.target.set(0, 0, 0);
    camera.position.set(front, .35, -.16).setLength(fitDistance);
    orbit.update();
  }

  function close() {
    if (!model) return;
    const geometries = new Set<BufferGeometry>();
    model.traverse(object => {
      if (object instanceof Mesh) {
        geometries.add(object.geometry);
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach(material => material.dispose());
      }
      if (object instanceof InstancedMesh) object.dispose();
    });
    geometries.forEach(geometry => geometry.dispose());
    model.removeFromParent();
    model = undefined;
    orbit.enabled = false;
    overlay.hidden = true;
    document.body.classList.remove('museum-inspecting');
    canvas.setAttribute('aria-label', '雪镇建模预览');
    canvas.removeAttribute('aria-describedby');
  }

  function open(month: number) {
    const stop = monthStops[month - 1];
    if (!stop) return;
    close();
    const builder = createMuseumBuilder();
    addMonthExhibit(builder, stop);
    model = builder.finish();
    const bounds = new Box3().setFromObject(model);
    model.position.sub(bounds.getCenter(new Vector3()));
    radius = bounds.getSize(new Vector3()).length() / 2;
    scene.add(model);
    front = -Math.sign(stop.x);
    monthLabel.textContent = `2026 纪念馆 · ${month} 月展品`;
    title.textContent = monthModels[month - 1];
    canvas.setAttribute('aria-label', title.textContent + '三维模型');
    canvas.setAttribute('aria-describedby', 'exhibit-help');
    overlay.hidden = false;
    document.body.classList.add('museum-inspecting');
    orbit.enabled = true;
    updateDistanceLimits();
    reset();
  }

  function resize(nextAspect: number) {
    camera.aspect = nextAspect;
    camera.updateProjectionMatrix();
    if (!model) return;
    const previousFit = fitDistance;
    updateDistanceLimits();
    camera.position.multiplyScalar(fitDistance / previousFit);
    orbit.update();
  }

  function handleKey(event: KeyboardEvent) {
    if (!model) return;
    angle.setFromVector3(camera.position);
    const step = Math.PI / 18;
    switch (event.key) {
      case 'ArrowLeft': angle.theta -= step; break;
      case 'ArrowRight': angle.theta += step; break;
      case 'ArrowUp': angle.phi -= step; break;
      case 'ArrowDown': angle.phi += step; break;
      case '+': case '=': angle.radius *= .86; break;
      case '-': angle.radius /= .86; break;
      default: return;
    }
    camera.position.setFromSpherical(angle.makeSafe());
    orbit.update();
    event.preventDefault();
  }

  resetButton.onclick = reset;
  return {
    open, close, resize, handleKey,
    get active() { return model !== undefined; },
    render() { renderer.render(scene, camera); },
  };
}
