import { Color, DirectionalLight, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import { createOrbitalEarlyRooms } from './orbital-early-rooms';
import { mountOrbitalStatusDisplay } from './orbital-status-display';

type View = 'airlock' | 'life-support' | 'cockpit';
const views: Record<View, { eye: Vector3; target: Vector3 }> = {
  airlock: { eye: new Vector3(0, 1.65, .42), target: new Vector3(0, 1.51, 3.51) },
  'life-support': { eye: new Vector3(2.55, 1.65, 1.44), target: new Vector3(2.95, 2.16, 3.51) },
  cockpit: { eye: new Vector3(1.43, 1.97, -8.46), target: new Vector3(.08, 1.32, -9.7) },
};

const viewport = document.querySelector<HTMLElement>('#status-viewport')!;
const message = document.querySelector<HTMLOutputElement>('#status-line')!;
const lastPage = document.querySelector<HTMLButtonElement>('#last-page')!;
const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button[data-room]'));
const rooms = createOrbitalEarlyRooms();
const status = mountOrbitalStatusDisplay(rooms.group);
const scene = new Scene();
scene.background = new Color(0x151f2b);
scene.add(rooms.group);
const fill = new DirectionalLight(0xffe8cc, 1.15);
fill.position.set(-3, 4, -1);
scene.add(fill);
const camera = new PerspectiveCamera(54, 16 / 9, .035, 35);
let renderer: WebGLRenderer | undefined;
try {
  renderer = new WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.4));
  renderer.domElement.setAttribute('aria-label', '轨道舱状态实景');
  viewport.append(renderer.domElement);
} catch {
  viewport.textContent = 'WebGL 未启用';
}
let view: View = 'airlock';

function draw() {
  const { eye, target } = views[view];
  camera.position.copy(eye);
  camera.lookAt(target);
  camera.aspect = viewport.clientWidth / Math.max(1, viewport.clientHeight);
  camera.updateProjectionMatrix();
  renderer?.setSize(viewport.clientWidth, viewport.clientHeight, false);
  renderer?.render(scene, camera);
  viewport.dataset.view = view;
  viewport.dataset.draws = String(renderer?.info.render.calls ?? 0);
  viewport.dataset.triangles = String(renderer?.info.render.triangles ?? 0);
  viewport.dataset.lastPage = String(status.pageReached);
  viewport.dataset.red = String(status.counts.red);
  viewport.dataset.green = String(status.counts.green);
  viewport.dataset.off = String(status.counts.off);
  for (const button of buttons) button.setAttribute('aria-pressed', String(view === button.dataset.room));
  lastPage.hidden = view !== 'cockpit';
  lastPage.setAttribute('aria-pressed', String(status.pageReached));
  message.value = view === 'airlock' ? '16 红 · 2 绿 · 1 灭' : view === 'life-support'
    ? '最低维生运行'
    : status.pageReached ? '航行日志终端与轨道保持运行 · 页灯已灭' : '航行日志终端与轨道保持运行 · 页灯亮';
}

for (const button of buttons) button.addEventListener('click', () => {
  const room = button.dataset.room as View;
  view = room;
  draw();
});
lastPage.addEventListener('click', () => {
  status.setLastLogPageReached(!status.pageReached);
  draw();
});
new ResizeObserver(draw).observe(viewport);
draw();
