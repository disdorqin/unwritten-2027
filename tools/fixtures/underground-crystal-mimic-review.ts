import * as T from 'three';
import { mountUndergroundCrystalCave } from '@u9-scene';
import { crystalCaveCanStand, crystalCaveClusterClearance, crystalCaveDistanceToPath, crystalCaveFloorAt,
  crystalCaveMainPath, crystalCaveRegionAt, crystalCaveSites } from '@u9-layout';
import { createUndergroundCrystalMimic } from '../voxel-tavern/town-blockout/underground-crystal-mimic';

const scene = new T.Scene();
scene.background = new T.Color('#14212d');
scene.add(new T.HemisphereLight('#c6eaff', '#42455d', 1.3));
const cave = mountUndergroundCrystalCave(scene);
cave.update(6);
const site = [-1.65, 24] as const;
const floor = crystalCaveFloorAt(...site)!;
const eyeMap = [0, 23.10] as const;
const eye = new T.Vector3(eyeMap[0], crystalCaveFloorAt(...eyeMap)! + 1.65, -eyeMap[1]);
const originalSite = crystalCaveSites.find(site => site.id === 'hall-south-shelf')!;
const genuine = cave.group.getObjectByName(originalSite.id) as T.Group;
const originalRoot = new T.Vector3(originalSite.point[0], crystalCaveFloorAt(...originalSite.point)!, -originalSite.point[1]);
const spawn = new T.Vector3(site[0], floor, -site[1]);
const stock = new T.Group();
const suspect = new T.Group();
stock.name = 'reference-u9';
suspect.name = 'candidate-mimic';
for (const mount of [stock, suspect]) {
  mount.position.copy(spawn);
  scene.add(mount);
}
function copyShards(owner: T.Group, tint?: T.Color) {
  return genuine.children.map(child => {
    const input = child as T.Mesh<T.BufferGeometry, T.MeshLambertMaterial>;
    const clone = input.clone();
    clone.position.sub(originalRoot);
    if (tint) {
      clone.material = input.material.clone();
      clone.material.emissive.lerp(tint, .135);
    }
    owner.add(clone);
    return { clone, baseY: clone.position.y, scaleY: clone.scale.y };
  });
}
const stockShards = copyShards(stock);
const suspectShards = copyShards(suspect, new T.Color('#f3bb78'));
const contour = new T.RingGeometry(.454, .489, 42);
contour.rotateX(-Math.PI / 2);
const imprint = new T.Mesh(contour, new T.MeshBasicMaterial({ color: '#24394b', opacity: .26, transparent: true, depthWrite: false }));
imprint.position.y = .007;
suspect.add(imprint);

// This verifier attaches test articulation to the same U-9 prism. The animation sample comes from U-3.
const sourceGeometry = stockShards[0].clone.geometry;
const limbMaterial = new T.MeshLambertMaterial({ color: '#457c97', emissive: '#33728e', emissiveIntensity: .29, flatShading: true });
const limbs = [-1, 1].flatMap(side => ['arm','leg'].map(kind => {
  const piece = new T.Mesh(sourceGeometry, limbMaterial);
  piece.name = `preview-${kind}-${side}`;
  suspect.add(piece);
  return { side, kind, piece };
}));
const drop = new T.Group();
const dropMaterial = new T.MeshLambertMaterial({ color: '#59c6e4', emissive: '#7ecee2', transparent: true, flatShading: true });
for (const [index, dx] of [-.37,-.17,.1,.25,.39].entries()) {
  const shard = new T.Mesh(sourceGeometry, dropMaterial);
  shard.position.set(dx, .02, index % 2 ? .16 : -.09);
  shard.scale.set(.065, .16 + .022 * index, .065);
  shard.rotation.z = .6 - index * .22;
  drop.add(shard);
}
suspect.add(drop);

const width = 1120, height = 780;
const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(width, height);
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.setScissorTest(true);
document.querySelector('main')!.append(renderer.domElement);
const camera = new T.PerspectiveCamera(67, (width / 2) / height, .03, 45);
camera.position.copy(eye);
camera.lookAt(spawn.clone().add(new T.Vector3(0,.70,0)));
camera.updateMatrixWorld(true);
let milliseconds = 0;
const actor = 'loopback-viewer';
const mimic = createUndergroundCrystalMimic({ id: 'u3-west-of-hall-fixture', crystalKind: originalSite.mineral, wildGrade: 1, now: () => milliseconds });
const ray = new T.Raycaster();
const point = new T.Vector3();
const initialSites = crystalCaveSites.map(({ id }) => ({ id, matrix: cave.group.getObjectByName(id)!.children[0].matrixWorld.toArray() }));
scene.updateMatrixWorld(true);
for (const initial of initialSites) initial.matrix = cave.group.getObjectByName(initial.id)!.children[0].matrixWorld.toArray();

function clearSight() {
  const focus = spawn.clone().add(new T.Vector3(-.09,.62,0));
  scene.updateMatrixWorld(true);
  ray.set(eye, focus.sub(eye).normalize());
  const first = ray.intersectObjects([cave.group, suspect], true)[0];
  let owner: T.Object3D | null | undefined = first?.object;
  while (owner && owner !== suspect) owner = owner.parent;
  return { clear: owner === suspect, first: first?.object.name, rayDistance: first?.distance };
}
function update(ms: number, gaze = false, label?: string) {
  milliseconds = ms;
  const sight = gaze ? clearSight() : undefined;
  const result = sight ? mimic.observeSight(actor, sight.clear) : undefined;
  const state = mimic.sample(eye.distanceTo(spawn));
  const open = state.unfoldProgress;
  const defeated = state.phase === 'defeated';
  suspectShards.forEach(({ clone, scaleY, baseY }) => {
    clone.visible = !defeated;
    clone.scale.y = scaleY * state.breathScale;
    clone.position.y = baseY + .62 * open;
  });
  for (const { side, kind, piece } of limbs) {
    const arm = kind === 'arm';
    piece.visible = open > 0 && !defeated;
    piece.position.set(side * (arm ? .32 + .21 * open : .15 + .10 * open), arm ? .34 + .42 * open : 0, arm ? .01 : -.05);
    piece.scale.set((arm ? .12 : .16) * open, (arm ? .47 : .66) * open, (arm ? .105 : .15) * open);
    piece.rotation.z = side * (arm ? -.64 : -.23) * open;
  }
  imprint.visible = state.phase === 'disguised';
  drop.visible = state.glowOpacity > 0;
  dropMaterial.opacity = state.glowOpacity;
  document.querySelector('header span')!.textContent = label ?? `${ms / 1000} 秒 · ${state.phase}`;
  const draws = [];
  for (const [index, mount] of [stock, suspect].entries()) {
    stock.visible = mount === stock;
    suspect.visible = mount === suspect;
    renderer.setViewport(index * width / 2 + 2, 0, width / 2 - 4, height);
    renderer.setScissor(index * width / 2 + 2, 0, width / 2 - 4, height);
    renderer.render(scene, camera);
    draws.push({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles });
  }
  const originalDrift = Math.max(...initialSites.map(({ id, matrix }) => Math.max(...cave.group.getObjectByName(id)!.children[0].matrixWorld.elements.map((v,i)=>Math.abs(v - matrix[i])))));
  point.set(.08, 1, .035).applyMatrix4(suspectShards[0].clone.matrixWorld);
  return { ms, state, sight, result, draws, tip: point.toArray(), root: suspect.position.toArray(), rootDrift: suspect.position.distanceTo(spawn),
    originalDrift, glError: renderer.getContext().getError() };
}
async function range(start: number, end: number, step: number, gaze: boolean) {
  const frames = [];
  for (let ms = start; ms <= end; ms += step) {
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    frames.push(update(ms, gaze));
  }
  return frames;
}
function inspection() {
  return { site, floor, region: crystalCaveRegionAt(...site), pathOffset: crystalCaveDistanceToPath(site, crystalCaveMainPath),
    camera: eye.toArray(), standable: crystalCaveCanStand(...eyeMap), gapToRoute: crystalCaveDistanceToPath(site, crystalCaveMainPath) - crystalCaveClusterClearance(originalSite) - .27,
    source: originalSite.id, originalPosition: originalRoot.toArray(), originalSites: crystalCaveSites.length,
    sameGeometry: stockShards.every((shard, index) => shard.clone.geometry === suspectShards[index].clone.geometry),
    beforeAxes: stockShards.map(({ clone, scaleY }) => ({ position: clone.position.toArray(), scale: [clone.scale.x, scaleY, clone.scale.z], orientation: clone.rotation.toArray() })),
    clearSight: clearSight() };
}
function hit(ms: number, attackId: string, weapon: 'snowball' | 'pickaxe') {
  milliseconds = ms;
  return mimic.hit({ actorId: actor, attackId, weapon });
}
Object.assign(window, { mimicProbe: { update, range, inspection, hit } });
update(0, false, '同模型对照 · 静止');
