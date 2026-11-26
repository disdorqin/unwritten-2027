import {
  ACESFilmicToneMapping,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Clock,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  FogExp2,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  NearestFilter,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Points,
  PointsMaterial,
  Raycaster,
  RingGeometry,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Intersection,
  type Material,
  type Object3D,
} from 'three';
import {
  FRIEND3_DECOR_ANCHORS,
  FRIEND3_DECOR_VARIANT_COLORS,
  FRIEND3_DECOR_VARIANT_LABELS,
  createFriend3DecorBoard,
  type Friend3DecorAnchor,
  type Friend3DecorKind,
  type Friend3DecorPlacement,
  type Friend3DecorSnapshot,
  type Friend3DecorVariant,
} from './town-blockout/town-friend3-decor';

function node<T extends Element>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Missing element: ${selector}`);
  return found;
}

const stage = node<HTMLElement>('#decor-scene');
const kindList = node<HTMLElement>('#kind-list');
const variantList = node<HTMLElement>('#variant-list');
const anchorList = node<HTMLElement>('#anchor-list');
const counts = node<HTMLElement>('#decor-counts');
const status = node<HTMLElement>('#decor-status');
const undoButton = node<HTMLButtonElement>('#undo');
const clearButton = node<HTMLButtonElement>('#clear');
const zoomInButton = node<HTMLButtonElement>('#zoom-in');
const zoomOutButton = node<HTMLButtonElement>('#zoom-out');
const resetViewButton = node<HTMLButtonElement>('#reset-view');

const board = createFriend3DecorBoard();
const selectedVariants: Record<Friend3DecorKind, Friend3DecorVariant> = { lantern: 0, postcard: 0 };
const kindColors: Record<Friend3DecorKind, string> = { lantern: '#e9a35a', postcard: '#7fd4c8' };
const anchorButtons = new Map<string, HTMLButtonElement>();
const markerGroups = new Map<string, Group>();

let selectedKind: Friend3DecorKind = 'lantern';
let hoveredAnchorId: string | undefined;
let dragging = false;
let dragPointer = -1;
let dragStartX = 0;
let dragStartY = 0;
let dragLastX = 0;
let dragLastY = 0;
let dragMoved = false;
let frame = 0;

const scene = new Scene();
scene.background = new Color('#0a141f');
scene.fog = new FogExp2(0x0a141f, 0.052);

const camera = new PerspectiveCamera(42, 1, 0.1, 100);
const target = new Vector3(0, 1.45, 0);
let azimuth = 0;
let polar = 1.2;
let distance = 5.4;

const renderer = new WebGLRenderer({ antialias: true });
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.domElement.setAttribute('aria-label', '雪夜门廊装饰局部场景');
stage.append(renderer.domElement);

const raycaster = new Raycaster();
const pointer = new Vector2();
const decorRoot = new Group();
scene.add(decorRoot);

const woodDark = new MeshLambertMaterial({ color: '#4a3125' });
const wood = new MeshLambertMaterial({ color: '#6b4834' });
const woodLight = new MeshLambertMaterial({ color: '#8a5f40' });
const snowMaterial = new MeshLambertMaterial({ color: '#dbe6ef' });
const ironMaterial = new MeshLambertMaterial({ color: '#3b4046' });
const glowMaterial = new MeshStandardMaterial({
  color: new Color('#ffcf77'),
  emissive: new Color('#e9a35a'),
  emissiveIntensity: 1.15,
  roughness: 0.45,
});

const snowPositions = new Float32Array(120 * 3);
let snowGeometry: BufferGeometry;
const clock = new Clock();

function addBox(
  parent: Object3D,
  material: Material,
  width: number,
  height: number,
  depth: number,
  x: number,
  y: number,
  z: number,
): Mesh {
  const mesh = new Mesh(new BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function buildScene() {
  scene.add(new HemisphereLight(0x9fb8d0, 0x1a2430, 1.05));
  const directional = new DirectionalLight(0xdfe9f5, 1.15);
  directional.position.set(3.2, 5, 4);
  scene.add(directional);
  const warm = new PointLight(0xe9a35a, 0.75, 9);
  warm.position.set(0, 2.15, 2.2);
  scene.add(warm);

  addBox(scene, snowMaterial, 7.4, 0.18, 4.8, 0, -0.09, 1.1);
  addBox(scene, snowMaterial, 0.9, 0.14, 0.55, -2.9, 0.07, 1.0);
  addBox(scene, snowMaterial, 0.7, 0.1, 0.42, 2.95, 0.05, 1.35);

  for (let index = 0; index < 8; index += 1) {
    addBox(scene, index % 2 === 0 ? woodDark : wood, 0.68, 2.76, 0.18, -2.45 + index * 0.7, 1.38, 0);
  }
  addBox(scene, woodDark, 5.86, 0.18, 0.28, 0, 2.55, 0.06);
  addBox(scene, wood, 5.86, 0.16, 0.26, 0, 0.18, 0.06);
  addBox(scene, snowMaterial, 5.86, 0.05, 0.28, 0, 2.66, 0.06);
  addBox(scene, woodDark, 0.2, 2.8, 0.22, -2.68, 1.4, 0.14);
  addBox(scene, woodDark, 0.2, 2.8, 0.22, 2.68, 1.4, 0.14);
  addBox(scene, snowMaterial, 0.24, 0.05, 0.24, -2.68, 2.82, 0.14);
  addBox(scene, snowMaterial, 0.24, 0.05, 0.24, 2.68, 2.82, 0.14);

  const roof = addBox(scene, wood, 6.0, 0.12, 1.45, 0, 2.8, 0.55);
  roof.rotation.x = -0.06;
  const roofSnow = addBox(scene, snowMaterial, 6.0, 0.05, 1.45, 0, 2.87, 0.56);
  roofSnow.rotation.x = -0.06;

  addBox(scene, woodLight, 1.12, 1.34, 0.1, 0, 0.72, 0.14);
  addBox(scene, woodDark, 0.12, 1.5, 0.14, -0.62, 0.75, 0.14);
  addBox(scene, woodDark, 0.12, 1.5, 0.14, 0.62, 0.75, 0.14);
  addBox(scene, woodDark, 1.36, 0.12, 0.14, 0, 1.5, 0.14);
  addBox(scene, glowMaterial, 0.36, 0.36, 0.03, 0, 1.08, 0.205);
  addBox(scene, woodDark, 0.4, 0.035, 0.04, 0, 1.08, 0.225);
  addBox(scene, woodDark, 0.035, 0.4, 0.04, 0, 1.08, 0.225);
  addBox(scene, snowMaterial, 1.6, 0.08, 0.55, 0, 0.04, 0.38);

  const handle = new Mesh(
    new SphereGeometry(0.03, 10, 8),
    new MeshStandardMaterial({ color: '#d9b36a', metalness: 0.55, roughness: 0.35 }),
  );
  handle.position.set(0.42, 0.66, 0.22);
  scene.add(handle);

  addBox(scene, woodLight, 1.4, 0.08, 0.36, -1.95, 0.48, 0.36);
  addBox(scene, woodDark, 0.08, 0.48, 0.08, -2.55, 0.24, 0.36);
  addBox(scene, woodDark, 0.08, 0.48, 0.08, -1.35, 0.24, 0.36);

  for (const anchor of FRIEND3_DECOR_ANCHORS) {
    if (anchor.kind === 'lantern') {
      addBox(scene, ironMaterial, 0.022, 0.1, 0.022, anchor.x, 2.48, anchor.z);
    } else {
      const nail = new Mesh(new SphereGeometry(0.018, 8, 6), new MeshBasicMaterial({ color: '#d9b36a' }));
      nail.position.set(anchor.x, anchor.y + 0.14, anchor.z + 0.01);
      scene.add(nail);
    }
    const markerMaterial = new MeshBasicMaterial({
      color: kindColors[anchor.kind],
      transparent: true,
      opacity: 0.85,
      side: DoubleSide,
      depthWrite: false,
    });
    const marker = new Group();
    const ring = new Mesh(new RingGeometry(0.06, 0.095, 20), markerMaterial);
    const dot = new Mesh(new CircleGeometry(0.024, 12), markerMaterial);
    marker.add(ring, dot);
    marker.position.set(anchor.x, anchor.y, anchor.z + 0.01);
    marker.userData.anchorId = anchor.id;
    marker.renderOrder = 3;
    scene.add(marker);
    markerGroups.set(anchor.id, marker);
  }

  for (let index = 0; index < snowPositions.length; index += 3) {
    snowPositions[index] = (Math.random() - 0.5) * 7;
    snowPositions[index + 1] = Math.random() * 4.2;
    snowPositions[index + 2] = Math.random() * 3.2 - 0.5;
  }
  snowGeometry = new BufferGeometry();
  snowGeometry.setAttribute('position', new Float32BufferAttribute(snowPositions, 3));
  const snowPoints = new Points(
    snowGeometry,
    new PointsMaterial({
      color: '#eef5fb',
      size: 0.04,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    }),
  );
  scene.add(snowPoints);
}

function updateCamera() {
  const sinPolar = Math.sin(polar);
  camera.position.set(
    target.x + distance * sinPolar * Math.sin(azimuth),
    target.y + distance * Math.cos(polar),
    target.z + distance * sinPolar * Math.cos(azimuth),
  );
  camera.lookAt(target);
  camera.updateMatrixWorld();
}

function resize() {
  const width = stage.clientWidth;
  const height = stage.clientHeight;
  if (width < 2 || height < 2) return;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function disposeObject(object: Object3D) {
  object.traverse(child => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      const map = (material as unknown as { map?: { dispose(): void } }).map;
      map?.dispose();
      material.dispose();
    }
  });
}

function createLantern(anchor: Friend3DecorAnchor, variant: Friend3DecorVariant, order: number): Group {
  const group = new Group();
  const color = new Color(FRIEND3_DECOR_VARIANT_COLORS.lantern[variant]);
  const bodyMaterial = new MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.5,
    roughness: 0.55,
  });
  const capMaterial = new MeshLambertMaterial({ color: '#3b2a20' });
  const tasselMaterial = new MeshLambertMaterial({ color: '#c05b4d' });
  const hook = new Mesh(new CylinderGeometry(0.012, 0.012, 0.12, 6), capMaterial);
  hook.position.y = 0.06;
  const top = new Mesh(new CylinderGeometry(0.15, 0.15, 0.035, 8), capMaterial);
  top.position.y = -0.02;
  const body = new Mesh(new CylinderGeometry(0.13, 0.15, 0.26, 8), bodyMaterial);
  body.position.y = -0.2;
  const bottom = new Mesh(new CylinderGeometry(0.15, 0.15, 0.03, 8), capMaterial);
  bottom.position.y = -0.36;
  const tassel = new Mesh(new BoxGeometry(0.032, 0.12, 0.032), tasselMaterial);
  tassel.position.y = -0.44;
  group.add(hook, top, body, bottom, tassel);
  const light = new PointLight(color, 0.45, 2.4);
  light.position.set(0, -0.2, 0.16);
  group.add(light);
  group.position.set(anchor.x, anchor.y, anchor.z);
  group.userData = { anchorId: anchor.id, kind: 'lantern', variant, order, light };
  return group;
}

function postcardTexture(variant: Friend3DecorVariant): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 84;
  canvas.height = 60;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingEnabled = false;
    const palettes = [
      { sky: '#16283c', band: '#233d55', ground: '#dbe8ee', accent: '#eef5fb', warm: '#e9a35a' },
      { sky: '#2b1b2c', band: '#3b2a3a', ground: '#dbe8ee', accent: '#ffcf77', warm: '#c05b4d' },
      { sky: '#0d1723', band: '#1b3a52', ground: '#7fd4c8', accent: '#eef5fb', warm: '#e9a35a' },
    ] as const;
    const palette = palettes[variant];
    ctx.fillStyle = palette.sky;
    ctx.fillRect(0, 0, 84, 60);
    ctx.fillStyle = palette.band;
    ctx.fillRect(0, 28, 84, 32);
    ctx.fillStyle = palette.ground;
    ctx.fillRect(0, 44, 84, 16);
    if (variant === 0) {
      ctx.fillStyle = palette.accent;
      ctx.beginPath();
      ctx.arc(62, 13, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2f5e42';
      for (const [x, y, w] of [[10, 24, 18], [26, 20, 22], [44, 25, 16]] as const) {
        ctx.beginPath();
        ctx.moveTo(x + w / 2, y);
        ctx.lineTo(x, y + 24);
        ctx.lineTo(x + w, y + 24);
        ctx.closePath();
        ctx.fill();
      }
    } else if (variant === 1) {
      ctx.fillStyle = '#7a4b35';
      ctx.fillRect(24, 28, 36, 20);
      ctx.fillStyle = '#3b2a20';
      ctx.beginPath();
      ctx.moveTo(20, 29);
      ctx.lineTo(42, 16);
      ctx.lineTo(64, 29);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = palette.accent;
      ctx.fillRect(29, 34, 8, 8);
      ctx.fillRect(47, 34, 8, 8);
      ctx.fillStyle = palette.warm;
      ctx.fillRect(39, 38, 6, 10);
    } else {
      ctx.fillStyle = palette.accent;
      for (const [x, y] of [[12, 10], [24, 18], [38, 8], [52, 21], [70, 12], [66, 33]] as const) {
        ctx.fillRect(x, y, 2, 2);
      }
      ctx.fillStyle = palette.warm;
      ctx.fillRect(34, 8, 16, 16);
      ctx.fillStyle = '#eef5fb';
      ctx.fillRect(40, 4, 4, 24);
      ctx.fillRect(28, 14, 28, 4);
    }
    ctx.strokeStyle = '#f2e6d2';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, 80, 56);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  return texture;
}

function createPostcard(anchor: Friend3DecorAnchor, variant: Friend3DecorVariant, order: number): Group {
  const group = new Group();
  const backing = new Mesh(
    new PlaneGeometry(0.47, 0.34),
    new MeshBasicMaterial({ color: '#4a3125' }),
  );
  backing.position.z = -0.008;
  const paper = new Mesh(
    new PlaneGeometry(0.43, 0.3),
    new MeshBasicMaterial({ map: postcardTexture(variant) }),
  );
  const pin = new Mesh(new SphereGeometry(0.018, 8, 6), new MeshBasicMaterial({ color: '#d9b36a' }));
  pin.position.set(0, 0.15, 0.015);
  group.add(backing, paper, pin);
  group.position.set(anchor.x, anchor.y, anchor.z);
  group.rotation.y = anchor.rotationY;
  group.rotation.z = (variant - 1) * 0.018;
  group.userData = { anchorId: anchor.id, kind: 'postcard', variant, order };
  return group;
}

function updateMarkers() {
  for (const anchor of FRIEND3_DECOR_ANCHORS) {
    const marker = markerGroups.get(anchor.id);
    if (!marker) continue;
    const occupied = board.isOccupied(anchor.id);
    marker.visible = !occupied;
    const active = anchor.kind === selectedKind;
    const hovered = hoveredAnchorId === anchor.id;
    marker.scale.setScalar(hovered ? 1.35 : active ? 1.1 : 0.85);
    const color = active ? kindColors[anchor.kind] : '#8fa6b8';
    for (const child of marker.children) {
      const mesh = child as Mesh;
      const material = mesh.material as MeshBasicMaterial;
      material.color.set(color);
      material.opacity = hovered ? 1 : active ? 0.9 : 0.35;
    }
  }
}

function updateUi(snapshot: Friend3DecorSnapshot) {
  counts.textContent = `灯笼 ${snapshot.counts.lantern}/5 · 明信片 ${snapshot.counts.postcard}/5`;
  undoButton.disabled = snapshot.placements.length === 0;
  clearButton.disabled = snapshot.placements.length === 0;
  for (const anchor of FRIEND3_DECOR_ANCHORS) {
    const button = anchorButtons.get(anchor.id);
    if (!button) continue;
    const occupied = snapshot.occupied.includes(anchor.id);
    button.dataset.occupied = String(occupied);
    button.dataset.active = String(anchor.kind === selectedKind);
    button.setAttribute('aria-pressed', String(occupied));
    button.textContent = occupied ? `${anchor.label} · 已占用` : anchor.label;
  }
}

function refresh() {
  for (const child of [...decorRoot.children]) {
    decorRoot.remove(child);
    disposeObject(child);
  }
  const snapshot = board.snapshot();
  for (const placement of snapshot.placements) {
    const anchor = FRIEND3_DECOR_ANCHORS.find(item => item.id === placement.anchorId);
    if (!anchor) continue;
    const group =
      placement.kind === 'lantern'
        ? createLantern(anchor, placement.variant, placement.order)
        : createPostcard(anchor, placement.variant, placement.order);
    decorRoot.add(group);
  }
  updateMarkers();
  updateUi(snapshot);
}

function announce(message: string) {
  status.textContent = message;
}

function kindLabel(kind: Friend3DecorKind): string {
  return kind === 'lantern' ? '灯笼' : '明信片';
}

function anchorFor(id: string): Friend3DecorAnchor | undefined {
  return FRIEND3_DECOR_ANCHORS.find(anchor => anchor.id === id);
}

function rejectionText(reason: 'unknown-anchor' | 'kind-mismatch' | 'invalid-variant' | 'occupied'): string {
  switch (reason) {
    case 'unknown-anchor':
      return '这个挂点不存在。';
    case 'kind-mismatch':
      return '挂点类型不匹配。';
    case 'invalid-variant':
      return '这个款式不可用。';
    case 'occupied':
      return '这个挂点已经有装饰了。';
  }
}

function handleAnchor(anchor: Friend3DecorAnchor) {
  if (board.isOccupied(anchor.id)) {
    const removed = board.remove(anchor.id);
    if (removed) {
      refresh();
      announce(`已撤下${anchor.label}。`);
    }
    return;
  }
  if (anchor.kind !== selectedKind) {
    announce(`这里是${kindLabel(anchor.kind)}挂点，先把当前装饰切换为${kindLabel(anchor.kind)}。`);
    return;
  }
  const variant = selectedVariants[selectedKind];
  const result = board.place(anchor.id, selectedKind, variant);
  if (result.kind === 'rejected') {
    announce(rejectionText(result.reason));
    return;
  }
  refresh();
  const label = FRIEND3_DECOR_VARIANT_LABELS[selectedKind][variant];
  announce(`已${selectedKind === 'lantern' ? '挂上' : '摆上'}${label}${kindLabel(selectedKind)}。`);
  if (board.snapshot().placements.length === FRIEND3_DECOR_ANCHORS.length) {
    announce('10 个挂点已全部布置完成，可以截图或继续调整。');
  }
}

function selectKind(kind: Friend3DecorKind) {
  selectedKind = kind;
  for (const button of kindList.querySelectorAll<HTMLButtonElement>('[data-kind]')) {
    button.setAttribute('aria-pressed', String(button.dataset.kind === kind));
  }
  renderVariants();
  updateMarkers();
  updateUi(board.snapshot());
  announce(`当前装饰：${kindLabel(kind)}。点击发光挂点或下方挂点按钮放置。`);
}

function selectVariant(kind: Friend3DecorKind, variant: Friend3DecorVariant) {
  selectedVariants[kind] = variant;
  for (const button of variantList.querySelectorAll<HTMLButtonElement>('[data-variant]')) {
    button.setAttribute('aria-pressed', String(Number(button.dataset.variant) === variant));
  }
  announce(`款式：${FRIEND3_DECOR_VARIANT_LABELS[kind][variant]}${kindLabel(kind)}。`);
}

function renderVariants() {
  const labels = FRIEND3_DECOR_VARIANT_LABELS[selectedKind];
  const colors = FRIEND3_DECOR_VARIANT_COLORS[selectedKind];
  const buttons = labels.map((label, index) => {
    const variant = index as Friend3DecorVariant;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'f3-variant';
    button.dataset.variant = String(index);
    button.setAttribute('aria-pressed', String(selectedVariants[selectedKind] === variant));
    const swatch = document.createElement('span');
    swatch.className = 'f3-variant-swatch';
    swatch.style.background = colors[index];
    const text = document.createElement('span');
    text.textContent = label;
    button.append(swatch, text);
    button.addEventListener('click', () => selectVariant(selectedKind, variant));
    return button;
  });
  variantList.replaceChildren(...buttons);
}

function buildKindButtons() {
  for (const kind of ['lantern', 'postcard'] as const) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'f3-kind';
    button.dataset.kind = kind;
    button.setAttribute('aria-pressed', String(kind === selectedKind));
    button.textContent = kind === 'lantern' ? '挂灯笼' : '摆明信片';
    button.addEventListener('click', () => selectKind(kind));
    kindList.append(button);
  }
}

function buildAnchorButtons() {
  for (const anchor of FRIEND3_DECOR_ANCHORS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'f3-anchor';
    button.dataset.anchor = anchor.id;
    button.dataset.kind = anchor.kind;
    button.dataset.occupied = 'false';
    button.dataset.active = String(anchor.kind === selectedKind);
    button.setAttribute('aria-pressed', 'false');
    button.textContent = anchor.label;
    button.addEventListener('click', () => handleAnchor(anchor));
    anchorList.append(button);
    anchorButtons.set(anchor.id, button);
  }
}

function findAnchorId(object: Object3D): string | undefined {
  let current: Object3D | null = object;
  while (current) {
    const id = current.userData.anchorId;
    if (typeof id === 'string') return id;
    current = current.parent;
  }
  return undefined;
}

function raycastEvent(event: PointerEvent): Intersection | undefined {
  const rect = renderer.domElement.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return undefined;
  pointer.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  );
  raycaster.setFromCamera(pointer, camera);
  const markers = [...markerGroups.values()].filter(marker => marker.visible);
  return raycaster.intersectObjects([...markers, ...decorRoot.children], true)[0];
}

function hover(event: PointerEvent) {
  const hit = raycastEvent(event);
  const anchorId = hit ? findAnchorId(hit.object) : undefined;
  if (anchorId !== hoveredAnchorId) {
    hoveredAnchorId = anchorId;
    updateMarkers();
  }
  renderer.domElement.style.cursor = anchorId ? 'pointer' : dragging ? 'grabbing' : 'grab';
}

function handleCanvasClick(event: PointerEvent) {
  const hit = raycastEvent(event);
  if (!hit) return;
  const anchorId = findAnchorId(hit.object);
  if (!anchorId) return;
  const anchor = anchorFor(anchorId);
  if (anchor) handleAnchor(anchor);
}

renderer.domElement.addEventListener('pointerdown', event => {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  dragging = true;
  dragPointer = event.pointerId;
  dragStartX = event.clientX;
  dragStartY = event.clientY;
  dragLastX = event.clientX;
  dragLastY = event.clientY;
  dragMoved = false;
  renderer.domElement.setPointerCapture(event.pointerId);
  renderer.domElement.style.cursor = 'grabbing';
});

renderer.domElement.addEventListener('pointermove', event => {
  if (dragging && event.pointerId === dragPointer) {
    const dx = event.clientX - dragLastX;
    const dy = event.clientY - dragLastY;
    dragLastX = event.clientX;
    dragLastY = event.clientY;
    if (Math.hypot(event.clientX - dragStartX, event.clientY - dragStartY) > 4) dragMoved = true;
    if (dragMoved) {
      azimuth -= dx * 0.006;
      polar = Math.max(0.7, Math.min(1.48, polar + dy * 0.006));
      updateCamera();
    }
    return;
  }
  hover(event);
});

function endDrag(event: PointerEvent) {
  if (!dragging || event.pointerId !== dragPointer) return;
  const shouldClick = !dragMoved;
  dragging = false;
  dragPointer = -1;
  if (renderer.domElement.hasPointerCapture(event.pointerId)) {
    renderer.domElement.releasePointerCapture(event.pointerId);
  }
  renderer.domElement.style.cursor = 'grab';
  if (shouldClick) handleCanvasClick(event);
}

renderer.domElement.addEventListener('pointerup', endDrag);
renderer.domElement.addEventListener('pointercancel', event => {
  dragMoved = true;
  endDrag(event);
});
renderer.domElement.addEventListener('pointerleave', () => {
  if (dragging) return;
  hoveredAnchorId = undefined;
  updateMarkers();
  renderer.domElement.style.cursor = 'grab';
});
renderer.domElement.addEventListener(
  'wheel',
  event => {
    event.preventDefault();
    distance = Math.max(3.2, Math.min(7.2, distance + event.deltaY * 0.0015));
    updateCamera();
  },
  { passive: false },
);

undoButton.addEventListener('click', () => {
  const removed = board.undo();
  if (!removed) {
    announce('当前没有可撤回的装饰。');
    return;
  }
  refresh();
  const anchor = anchorFor(removed.anchorId);
  announce(anchor ? `已撤回${anchor.label}的装饰。` : '已撤回上一件装饰。');
});

clearButton.addEventListener('click', () => {
  const count = board.clear();
  refresh();
  announce(count > 0 ? `已撤回全部 ${count} 件装饰。` : '当前没有装饰。');
});

zoomInButton.addEventListener('click', () => {
  distance = Math.max(3.2, distance - 0.6);
  updateCamera();
});

zoomOutButton.addEventListener('click', () => {
  distance = Math.min(7.2, distance + 0.6);
  updateCamera();
});

resetViewButton.addEventListener('click', () => {
  azimuth = 0;
  polar = 1.2;
  distance = 5.4;
  updateCamera();
  announce('视角已重置。');
});

function animate() {
  frame = requestAnimationFrame(animate);
  const delta = Math.min(0.05, clock.getDelta());
  const elapsed = clock.elapsedTime;
  for (const child of decorRoot.children) {
    if (child.userData.kind !== 'lantern') continue;
    const order = Number(child.userData.order ?? 0);
    child.rotation.z = Math.sin(elapsed * 1.5 + order) * 0.03;
    const light = child.userData.light as PointLight | undefined;
    if (light) light.intensity = 0.42 + Math.sin(elapsed * 3.1 + order) * 0.04;
  }
  for (let index = 0; index < snowPositions.length; index += 3) {
    snowPositions[index + 1] -= delta * 0.18;
    if (snowPositions[index + 1] < 0) snowPositions[index + 1] = 4.2;
  }
  snowGeometry.attributes.position.needsUpdate = true;
  renderer.render(scene, camera);
}

function screenPoint(anchorId: string): { x: number; y: number } | undefined {
  const anchor = anchorFor(anchorId);
  if (!anchor) return undefined;
  camera.updateMatrixWorld();
  const point = new Vector3(anchor.x, anchor.y, anchor.z).project(camera);
  const rect = renderer.domElement.getBoundingClientRect();
  return {
    x: rect.left + (point.x * 0.5 + 0.5) * rect.width,
    y: rect.top + (-point.y * 0.5 + 0.5) * rect.height,
  };
}

Object.assign(window, {
  __friend3DecorPreview: { screenPoint },
});

buildScene();
buildKindButtons();
renderVariants();
buildAnchorButtons();
refresh();
updateCamera();
resize();
const observer = new ResizeObserver(resize);
observer.observe(stage);
animate();
announce('选择灯笼或明信片，然后点击场景中的发光挂点；已放置的装饰可点击撤下。');

window.addEventListener(
  'pagehide',
  () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    renderer.dispose();
  },
  { once: true },
);