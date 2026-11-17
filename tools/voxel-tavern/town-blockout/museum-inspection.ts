import {
  Box3, BufferGeometry, CanvasTexture, DirectionalLight, Group, HemisphereLight, InstancedMesh,
  Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry, Scene, Spherical, SRGBColorSpace,
  Vector3, type WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createMuseumBuilder } from './museum-kit';
import { addMonthExhibit, monthModels, monthStops } from './museum-timeline';

function radialTexture(stops: ReadonlyArray<readonly [number, string]>) {
  const surface = document.createElement('canvas');
  surface.width = surface.height = 128;
  const ctx = surface.getContext('2d')!;
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  stops.forEach(([offset, color]) => gradient.addColorStop(offset, color));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, surface.width, surface.height);
  const texture = new CanvasTexture(surface);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export function createMuseumInspection(renderer: WebGLRenderer, aspect: number) {
  const canvas = renderer.domElement;
  const overlay = document.querySelector<HTMLElement>('#museum-inspection')!;
  const monthLabel = overlay.querySelector<HTMLElement>('#exhibit-month')!;
  const title = overlay.querySelector<HTMLElement>('#exhibit-title')!;
  const resetButton = overlay.querySelector<HTMLButtonElement>('#exhibit-reset')!;
  const header = overlay.querySelector('header')!;
  const instructions = overlay.querySelector<HTMLElement>('#exhibit-help')!;
  const scene = new Scene();
  scene.background = radialTexture([[0, '#31445a'], [.57, '#25374c'], [1, '#132135']]);
  const key = new DirectionalLight('#ffecd2', 1.85);
  const rim = new DirectionalLight('#b6d9ff', 1.22);
  key.position.set(3, 6, 4);
  rim.position.set(-4, 3, -5);
  scene.add(new HemisphereLight('#e2ecfc', '#7d6964', .98), key, rim);

  const shadow = new Mesh(new PlaneGeometry(), new MeshBasicMaterial({
    map: radialTexture([[0, '#09131ec4'], [.52, '#09131e81'], [1, '#09131e00']]),
    transparent: true,
    depthWrite: false,
  }));
  shadow.rotation.x = -Math.PI / 2;
  scene.add(shadow);

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
  let previousCursor = '';

  function updateDistanceLimits() {
    const { clientWidth: width, clientHeight: height } = overlay;
    const safeTop = Math.min(height * .42, header.getBoundingClientRect().bottom + 16);
    const safeBottom = Math.max(height * .62, instructions.getBoundingClientRect().top - 19);
    const verticalSpace = safeBottom - safeTop;
    // Offset the optical centre so the orbit stays centred between the title and controls.
    camera.setViewOffset(width, height, 0, (height - safeTop - safeBottom) / 2, width, height);
    const halfHeightTan = Math.tan(camera.fov * Math.PI / 360);
    const halfAngle = Math.atan(halfHeightTan * Math.min(verticalSpace / height, camera.aspect * .9));
    fitDistance = radius * 1.03 / Math.sin(halfAngle);
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
    canvas.style.cursor = previousCursor;
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
    const size = bounds.getSize(new Vector3());
    radius = size.length() / 2;
    shadow.position.y = -size.y / 2 - .02;
    shadow.scale.set(size.x * 1.9, size.z * 1.48, 1);
    scene.add(model);
    front = -Math.sign(stop.x);
    monthLabel.textContent = `2026 纪念馆 · ${month} 月展品`;
    title.textContent = monthModels[month - 1];
    canvas.setAttribute('aria-label', title.textContent + '三维模型');
    canvas.setAttribute('aria-describedby', 'exhibit-help');
    overlay.hidden = false;
    document.body.classList.add('museum-inspecting');
    previousCursor = canvas.style.cursor;
    canvas.style.cursor = 'grab';
    orbit.enabled = true;
    updateDistanceLimits();
    reset();
  }

  function resize(nextAspect: number) {
    if (!model) {
      camera.aspect = nextAspect;
      camera.clearViewOffset();
      return;
    }
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
