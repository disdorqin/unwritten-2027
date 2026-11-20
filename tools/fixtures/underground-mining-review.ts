import {
  AmbientLight, BoxGeometry, Color, Group, HemisphereLight, IcosahedronGeometry, Mesh, MeshLambertMaterial,
  PerspectiveCamera, Raycaster, Scene, Vector2, Vector3, WebGLRenderer,
} from 'three';
import type { UndergroundMiningCore, UndergroundMiningReceipt, UndergroundMiningTargetView } from '../../src/shared/underground-mining';
import { mountUndergroundMiningActivity } from '../voxel-tavern/town-blockout/underground-mining-activity';
import { createUndergroundOreVein } from '../voxel-tavern/town-blockout/underground-ore-vein';

type Intent = { action: 'strike' | 'pickup'; targetId: string };
type Snapshot = { targets: UndergroundMiningTargetView[]; cores: UndergroundMiningCore[] };

const scene = new Scene();
scene.background = new Color('#292627');
scene.add(new AmbientLight('#ffe6cd', 1.33), new HemisphereLight('#dfd3cb', '#493c30', .77));
const camera = new PerspectiveCamera(59, 720 / 480, .01, 20);
camera.position.set(0, -88.35, 2.30);
const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(720, 480);
document.querySelector('main')!.prepend(renderer.domElement);
function block(size: [number, number, number], xyz: [number, number, number], color: string) {
  const mesh = new Mesh(new BoxGeometry(...size), new MeshLambertMaterial({ color, flatShading: true }));
  mesh.position.set(...xyz);
  scene.add(mesh);
}
block([5, .20, 6], [0, -90.10, 1.2], '#5b4a42');
block([5, 3, .22], [0, -88.5, .89], '#685b56');
block([.24, 3, 5], [-2.45, -88.5, 3.35], '#534a49');
block([.24, 3, 5], [2.45, -88.5, 3.35], '#534a49');

const centre = new Vector2(0, 0);
const ray = new Raycaster();
const veins = new Map<string, ReturnType<typeof createUndergroundOreVein>>();
const cores = new Map<string, Mesh>();
const rendered = new Map<string, UndergroundMiningTargetView>();
const targetFocus = new Vector3(0, -89.3, 1.033);
const coreFocus = new Vector3(0, -89.89, 1.55);
let selectedTool = true;
let shownLayer = 'test-mine';
let pending: Promise<unknown> | undefined;
let sent = 0;
let received = 0;
let sounds = 0;
let backpack = 0;
let trustedClicks = 0;
let trustedPicks = 0;
let lastRay: string | undefined;

function aimed() {
  scene.updateMatrixWorld(true);
  camera.updateMatrixWorld();
  ray.setFromCamera(centre, camera);
  for (const hit of ray.intersectObject(scene, true)) {
    let current = hit.object;
    let id: string | undefined;
    let visible = true;
    while (current) {
      if (!current.visible) { visible = false; break; }
      id ??= current.userData.miningId;
      if (!current.parent) break;
      current = current.parent;
    }
    if (visible) return id;
  }
}

async function api(path: string, body?: unknown) {
  const reply = await fetch('/u8-api/' + path, body === undefined ? undefined : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!reply.ok) throw new Error(path + ' rejected HTTP ' + reply.status);
  return reply.json();
}

const activities = mountUndergroundMiningActivity({
  aimedTarget() { lastRay = aimed(); return lastRay; },
  heldPickaxe: () => selectedTool,
  request(intent: Intent) {
    if (pending) return;
    sent++;
    pending = api('action', intent).then((reply: { receipt?: UndergroundMiningReceipt; backpack: number }) => {
      if (reply.receipt && activities.receive(reply.receipt)) received++;
      backpack = reply.backpack;
    }).finally(() => { pending = undefined; });
    void pending.catch(error => setTimeout(() => { throw error; }));
  },
  showTarget(target) {
    let vein = veins.get(target.id);
    if (!vein) {
      vein = createUndergroundOreVein({
        id: target.id, face: new Vector3(target.at.east, target.at.height, -target.at.north + .033),
        normal: new Vector3(0, 0, 1), ore: 'ordinary',
      });
      vein.group.userData.miningId = target.id;
      veins.set(target.id, vein);
      scene.add(vein.group);
    }
    vein.sync(target);
    rendered.set(target.id, target);
  },
  hideTarget(id) { veins.get(id)?.dispose(); veins.delete(id); rendered.delete(id); },
  showCore(core) {
    if (cores.has(core.id)) return;
    const mesh = new Mesh(new IcosahedronGeometry(.15), new MeshLambertMaterial({ color: '#9a805c' }));
    mesh.position.set(core.at.east, core.at.height + .11, -core.at.north);
    mesh.userData.miningId = core.id;
    cores.set(core.id, mesh);
    scene.add(mesh);
  },
  hideCore(id) {
    const mesh = cores.get(id);
    if (!mesh) return;
    mesh.removeFromParent();
    mesh.geometry.dispose();
    mesh.material.dispose();
    cores.delete(id);
  },
  onStrike() { sounds++; },
});

renderer.domElement.addEventListener('pointerdown', event => {
  if (!event.isTrusted || event.button !== 0) return;
  trustedClicks++;
  activities.primaryInput();
});
document.addEventListener('keydown', event => {
  if (!event.isTrusted || event.code !== 'KeyE' || event.repeat) return;
  trustedPicks++;
  lastRay = aimed();
  if (lastRay) activities.pickup(lastRay);
});
camera.lookAt(targetFocus);
activities.setLayer(shownLayer);
const { snapshot } = await api('snapshot') as { snapshot: Snapshot };
activities.sync(snapshot);
renderer.setAnimationLoop(() => renderer.render(scene, camera));

Object.assign(window, { undergroundMiningProbe: {
  async authority(config: { held?: 'pickaxe' | 'other'; layer?: string }) { await api('setup', config); },
  localTool(held: boolean) { selectedTool = held; },
  async layer(layer?: string) {
    shownLayer = layer ?? '';
    activities.setLayer(layer);
    if (layer) activities.sync((await api('snapshot')).snapshot);
  },
  look(at: 'ore' | 'core') { camera.lookAt(at === 'ore' ? targetFocus : coreFocus); },
  settled: () => pending === undefined,
  inspect() {
    const vein = [...veins.values()][0];
    const cracks = vein?.group.getObjectByName('ore-cracks');
    return {
      shownLayer, sent, received, sounds, backpack, trustedClicks, trustedPicks, lastRay, ray: aimed(),
      hits: [...rendered.values()][0]?.hits,
      cluster: vein?.group.getObjectByName('ore-cluster')?.visible ?? false,
      cracks: cracks?.visible ?? false,
      scar: vein?.group.getObjectByName('ore-scar')?.visible ?? false,
      cores: [...cores.keys()], drawings: renderer.info.render.calls,
      isVeinGroup: vein?.group instanceof Group,
    };
  },
} });
