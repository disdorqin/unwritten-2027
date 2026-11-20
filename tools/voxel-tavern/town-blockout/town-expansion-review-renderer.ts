import * as THREE from 'three';

export type ExpansionView = {
  group: THREE.Group;
  target: THREE.Vector3;
  span: number;
  location: string;
  status: string;
  actions: ReadonlyArray<readonly [label: string, run: () => void]>;
};

export function createExpansionReviewRenderer() {
  const viewport = document.querySelector<HTMLElement>('#review-viewport')!;
  const location = document.querySelector<HTMLElement>('#review-location')!;
  const status = document.querySelector<HTMLElement>('#review-status')!;
  const actions = document.querySelector<HTMLElement>('#review-actions')!;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d1622);
  scene.add(new THREE.HemisphereLight(0xe6f4ff, 0x444151, 2));
  const fill = new THREE.DirectionalLight(0xffeccb, 2);
  fill.position.set(-3, 7, 4);
  scene.add(fill);
  const camera = new THREE.OrthographicCamera();
  let view: ExpansionView | undefined;

  let renderer: THREE.WebGLRenderer | undefined;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    renderer.domElement.setAttribute('aria-label', '候选场景预览');
    viewport.append(renderer.domElement);
  } catch {
    viewport.textContent = '当前设备未启用 WebGL。下方路线操作仍可复核。';
  }

  function draw() {
    if (!renderer || !view || !viewport.clientWidth || !viewport.clientHeight) return;
    const { span, target } = view;
    const aspect = viewport.clientWidth / viewport.clientHeight;
    camera.left = -span * aspect / 2;
    camera.right = span * aspect / 2;
    camera.top = span / 2;
    camera.bottom = -span / 2;
    camera.near = 0.1;
    camera.far = span * 5;
    camera.position.copy(target).add(new THREE.Vector3(.55, .85, .95).multiplyScalar(span));
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    renderer.setSize(viewport.clientWidth, viewport.clientHeight, false);
    renderer.render(scene, camera);
    viewport.dataset.draws = String(renderer.info.render.calls);
    viewport.dataset.triangles = String(renderer.info.render.triangles);
  }
  new ResizeObserver(draw).observe(viewport);

  function show(next: ExpansionView) {
    if (view?.group !== next.group) {
      if (view) scene.remove(view.group);
      scene.add(next.group);
    }
    view = next;
    location.textContent = next.location;
    status.textContent = next.status;
    actions.replaceChildren();
    for (const [label, run] of next.actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', run);
      actions.append(button);
    }
    draw();
  }

  return { show };
}
