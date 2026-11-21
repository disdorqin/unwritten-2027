import {
  AmbientLight, Color, DirectionalLight, Fog, Group, InstancedMesh, Mesh,
  PerspectiveCamera, Scene, Vector3, WebGLRenderer,
} from 'three';
import { mountMainSummitAssembly, summitAssemblyAnchor } from './main-summit-assembly';
import { mainSummitCableWorkshopAnchor } from './main-summit-cable-workshop';
import type { SummitExpeditionSite } from './main-summit-expedition-sites';
import type { ExpeditionContact } from './main-summit-expedition-activities';

const scene = new Scene();
scene.background = new Color('#b4c6d7');
const fog = new Fog('#a9b7c9', 120, 1800);
scene.fog = fog;
const ambient = new AmbientLight('#dce7ef', 1.65);
scene.add(ambient);
const sunlight = new DirectionalLight('#fbe7c5', 2.2);
sunlight.position.set(-40, 380, 140);
scene.add(sunlight);
const summitOwner = new Group();
scene.add(summitOwner);
const mount = mountMainSummitAssembly(summitOwner, 0, undefined, { expeditionPreview: true });
if (!mount.expedition || !mount.workshop || !mount.cloudBells || !mount.plaques ||
    !mount.expeditionDynamics || !mount.expeditionActivities) {
  throw new Error('The seven-round preview must explicitly mount all five model families and actions');
}
const assembly = { ...mount, expedition: mount.expedition, workshop: mount.workshop,
  cloudBells: mount.cloudBells, plaques: mount.plaques,
  expeditionDynamics: mount.expeditionDynamics, expeditionActivities: mount.expeditionActivities };
const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
document.querySelector('#viewport')!.append(renderer.domElement);
const camera = new PerspectiveCamera(71, 1, .05, 2400);
const positionReading = document.querySelector<HTMLOutputElement>('#position')!;
const renderReading = document.querySelector<HTMLOutputElement>('#rendering')!;
const nameReading = document.querySelector<HTMLOutputElement>('#name')!;
const actionReading = document.querySelector<HTMLOutputElement>('#action')!;
const refPanel = document.querySelector<HTMLElement>('#reference')!;
const refImage = document.querySelector<HTMLImageElement>('#ref-image')!;
const refLabel = document.querySelector<HTMLElement>('#ref-label')!;
const options = new URLSearchParams(location.search);
const reviewProof = options.get('proof') === '1';

const workshopSite: SummitExpeditionSite = {
  id: 'expedition-cable-machine-room', kind: 'machine-hall',
  east: mainSummitCableWorkshopAnchor.east,
  north: mainSummitCableWorkshopAnchor.north,
  height: mainSummitCableWorkshopAnchor.floor,
  yaw: Math.PI / 2,
  trail: { east: 0, north: 7, height: 347 }, distanceToTrail: 21,
};
const approved = assembly.expedition.sites;
const firstBell = assembly.cloudBells.posts[0]!;
const bellSite: SummitExpeditionSite = {
  id: firstBell.id, kind: 'waymark', east: firstBell.east, north: firstBell.north,
  height: firstBell.height, yaw: firstBell.heading,
  trail: { east: firstBell.east, north: firstBell.north, height: firstBell.height },
  distanceToTrail: firstBell.baseClearanceMetres,
};
const select = (kind: SummitExpeditionSite['kind'], index = 0) =>
  approved.filter(site => site.kind === kind)[index]!;
const stops = [
  { site: workshopSite, label: '二线检修机房', image: 'M03', startZ: 7.5 },
  { site: select('shelter', 0), label: '云海守山窝棚', image: 'M04', startZ: 10.5 },
  { site: select('shelter', 1), label: '冰瀑顶避风窝棚', image: 'M04', startZ: 10.5 },
  { site: select('observatory'), label: '南肩守天哨遗迹', image: 'M07', startZ: 10.1 },
  { site: select('icefall'), label: '四十米凝冰瀑', image: 'M05', startZ: 9.4 },
  { site: select('summit-flag'), label: '绝顶石圈与经幡', image: 'M04', startZ: 10.0 },
  { site: bellSite, label: '云海九铃阵 · 第一铃', image: 'M05', startZ: 4.48 },
] as const;
const references: Record<string, string> = {
  M03: new URL('../../../assets-source/concept-art/terrain/M03.png', import.meta.url).href,
  M04: new URL('../../../assets-source/concept-art/terrain/M04.png', import.meta.url).href,
  M05: new URL('../../../assets-source/concept-art/terrain/M05.png', import.meta.url).href,
  M07: new URL('../../../assets-source/concept-art/terrain/M07.png', import.meta.url).href,
};
let selectedIndex = Math.max(0, Math.min(stops.length - 1, Number(options.get('site') ?? 0) || 0));
let night = options.get('night') === '1';
let cameraHeading = 0;
let cameraPitch = -.03;
let previous = performance.now();
let elapsed = 0;
let frame = 0;
let renderCalls = 0;
let triangles = 0;
let walkedMetres = 0;
let rejectedWalk = 0;
let lastInteraction: unknown;
const events: string[] = [];
const keys = new Set<string>();
const player = { east: 0, north: 0, height: 0 };
let disposed = false;
const modelBudget = { draws: 0, triangles: 0 };
for (const part of [assembly.expedition.group, assembly.workshop.group,
  assembly.cloudBells.group, assembly.plaques.group, assembly.expeditionDynamics.group]) {
  part.traverse(object => {
    if (!(object instanceof Mesh)) return;
    const trianglesPerPiece = object.geometry.index ? object.geometry.index.count / 3 :
      object.geometry.attributes.position.count / 3;
    const multiplicity = object instanceof InstancedMesh ? object.count : 1;
    modelBudget.draws += Array.isArray(object.material) ? object.material.length : 1;
    modelBudget.triangles += trianglesPerPiece * multiplicity;
  });
}

function localPoint(site: SummitExpeditionSite, x: number, z: number) {
  return {
    east: site.east + x * Math.cos(site.yaw) + z * Math.sin(site.yaw),
    north: site.north + x * Math.sin(site.yaw) - z * Math.cos(site.yaw),
  };
}
function certifiedFloor(east: number, north: number) {
  return assembly.trailSurfaceAt(east, north, .27) ??
    assembly.block.heightAt(east, north);
}
function choose(index: number) {
  selectedIndex = index;
  const { site, label, image, startZ } = stops[index]!;
  const start = localPoint(site, 0, startZ);
  player.east = start.east;
  player.north = start.north;
  player.height = certifiedFloor(start.east, start.north) ?? site.height;
  cameraHeading = -site.yaw;
  cameraPitch = index === 6 ? .20 : -.025;
  walkedMetres = 0;
  rejectedWalk = 0;
  nameReading.value = label + ' · 主峰域 E/N 原测绘点';
  refImage.src = references[image]!;
  refLabel.textContent = '仓库素材 ' + image + '.png · 仅作为建模对照';
  actionReading.value = '请走进场景，查看模型内饰、通行与真实灯光。';
  events.push('choose:' + site.id);
}
function nearestActivitySite() {
  const ids = [workshopSite, ...approved.filter(site =>
    site.kind === 'shelter' || site.kind === 'observatory' ||
    site.kind === 'icefall' || site.kind === 'summit-flag')];
  return ids.reduce((best, site) => {
    const d = Math.hypot(player.east - site.east, player.north - site.north);
    return d < best.dist ? { site, dist: d } : best;
  }, { site: ids[0]!, dist: Infinity });
}
function action(type: ExpeditionContact) {
  if (selectedIndex === 6) {
    const playerPoint = { ...player };
    if (type === 'touch') {
      const atMs = Math.round(performance.now());
      const answer = assembly.cloudBells.strike({ player: playerPoint, authorized: true, atMs });
      lastInteraction = answer.accepted
        ? { accepted: true, siteId: bellSite.id, action: type, copy: answer.message,
          progress: answer.progress, complete: answer.progress === 4 }
        : { accepted: false, reason: answer.reason };
      actionReading.value = answer.accepted ? answer.message : '站近第一铃，照旧谱敲四声。';
      events.push('touch:cloud-bell-1:' + (answer.accepted ? 'yes' : answer.reason));
    } else {
      const copy = type === 'view'
        ? '九座木铃桩每隔约三十米，青白铜铃浮在云线里。'
        : '首铃响过，才有人走得出这片云。请照日志敲四声：短、长、短。';
      const reached = Math.hypot(player.east - bellSite.east, player.north - bellSite.north) < 4.2;
      lastInteraction = reached ? { accepted: true, siteId: bellSite.id, action: type,
        copy, progress: assembly.cloudBells.snapshot().progress, complete: assembly.cloudBells.snapshot().finished }
        : { accepted: false, reason: 'out-of-reach' };
      actionReading.value = reached ? copy : '靠近第一铃再看与听。';
      events.push(type + ':cloud-bell-1:' + (reached ? 'yes' : 'out-of-reach'));
    }
    return;
  }
  const nearest = nearestActivitySite();
  const result = assembly.expeditionActivities.interact({
    siteId: nearest.site.id, action: type, authorized: true,
    player: { ...player },
  });
  lastInteraction = result;
  actionReading.value = result.accepted ? result.copy :
    result.reason === 'out-of-reach' ? '离故事点还远，请继续靠近。' : '本地体验未接受此操作。';
  events.push(type + ':' + nearest.site.id + ':' + (result.accepted ? 'yes' : result.reason));
  if (result.accepted && type === 'touch') {
    assembly.expeditionDynamics.apply(result.siteId, result.progress);
    const from = scene.getObjectByName(nearest.site.id + '-source-lamp');
    if (from && 'intensity' in from && typeof from.intensity === 'number') {
      from.intensity = Math.min(5.4, from.intensity + .25);
    }
  }
}
function setLight() {
  scene.background = new Color(night ? '#18263d' : '#b4c6d7');
  fog.color.set(night ? '#26384b' : '#a9b7c9');
  ambient.intensity = night ? .62 : 1.65;
  sunlight.intensity = night ? .32 : 2.2;
}
function step(dt: number) {
  const turn = Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft'));
  cameraHeading += turn * dt * 1.55;
  const tilt = Number(keys.has('ArrowUp')) - Number(keys.has('ArrowDown'));
  cameraPitch = Math.max(-1.08, Math.min(.95, cameraPitch + tilt * dt));
  const forward = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
  const sideways = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
  if (!forward && !sideways) return;
  const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 6 : 2.6) /
    Math.hypot(forward, sideways);
  const de = Math.sin(cameraHeading) * forward + Math.cos(cameraHeading) * sideways;
  const dn = Math.cos(cameraHeading) * forward - Math.sin(cameraHeading) * sideways;
  const east = player.east + de * dt * speed;
  const north = player.north + dn * dt * speed;
  const candidate = certifiedFloor(east, north);
  const fail = candidate === undefined || Math.abs(candidate - player.height) > .43 ||
    assembly.blocked(east, north, candidate, .27, 1.8);
  if (fail) {
    rejectedWalk++;
    return;
  }
  const distance = Math.hypot(east - player.east, north - player.north);
  Object.assign(player, { east, north, height: candidate });
  walkedMetres += distance;
}
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
function draw() {
  // All P-1/P-3 collision surveys are local to the mountain, while the
  // mounted assembly is translated into town world E300/N676. The reviewer
  // must render the same transformed coordinates, not point at empty space.
  camera.position.set(summitAssemblyAnchor.east + player.east,
    player.height + 1.64, -(summitAssemblyAnchor.north + player.north));
  const forward = new Vector3(Math.sin(cameraHeading) * Math.cos(cameraPitch),
    Math.sin(cameraPitch), -Math.cos(cameraHeading) * Math.cos(cameraPitch));
  camera.lookAt(camera.position.clone().add(forward));
  assembly.cloudBells.tick(Math.round(performance.now()));
  renderer.render(scene, camera);
  renderCalls = renderer.info.render.calls;
  triangles = renderer.info.render.triangles;
  frame++;
  positionReading.value = 'E ' + player.east.toFixed(2) + ' · N ' + player.north.toFixed(2) +
    ' · Y ' + player.height.toFixed(2) + ' · 实走 ' + walkedMetres.toFixed(1) + 'm';
  renderReading.value = 'Draws ' + renderCalls + ' · Tris ' + triangles + ' · ' + (night ? '夜' : '昼');
}
function animate(now: number) {
  const dt = Math.min(.05, Math.max(0, (now - previous) / 1000));
  previous = now;
  elapsed += dt;
  if (!disposed) {
    step(dt);
    draw();
    requestAnimationFrame(animate);
  }
}

addEventListener('keydown', event => {
  if (event.code.startsWith('Digit') && event.code.length === 6) {
    const target = Number(event.code.at(-1)) - 1;
    if (target >= 0 && target < stops.length) choose(target);
  }
  if (event.code === 'KeyN' && !event.repeat) { night = !night; setLight(); }
  if (event.code === 'KeyR' && !event.repeat) refPanel.hidden = !refPanel.hidden;
  if (event.code === 'KeyE' && !event.repeat) action('touch');
  if (event.code === 'KeyV' && !event.repeat) action('view');
  if (event.code === 'KeyL' && !event.repeat) action('listen');
  if (!['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight',
    'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.code)) return;
  event.preventDefault();
  keys.add(event.code);
});
addEventListener('keyup', event => keys.delete(event.code));
addEventListener('blur', () => keys.clear());
addEventListener('resize', resize);
addEventListener('pagehide', () => {
  disposed = true;
  assembly.dispose();
  renderer.dispose();
}, { once: true });

Object.defineProperty(window, '__expeditionReview', {
  value: Object.freeze({ getState: () => ({
    frame, elapsed, selectedIndex, selectedId: stops[selectedIndex]!.site.id,
    player: { ...player }, walkedMetres, rejectedWalk, night,
    cameraHeading, cameraPitch, renderCalls, triangles,
    sceneName: assembly.expedition.group.name,
    modelBudget: { ...modelBudget },
    cameraWorld: { east: camera.position.x, north: -camera.position.z, height: camera.position.y },
    assemblyAnchor: { ...summitAssemblyAnchor },
    mainParts: assembly.mountedParts(), voxelDrawBudget: assembly.expedition.drawBudget +
      assembly.workshop.drawBudget + assembly.cloudBells.drawBudget,
    voxelCount: assembly.expedition.pieceCount + assembly.workshop.pieceCount + assembly.cloudBells.pieceCount,
    bellCount: assembly.cloudBells.posts.length,
    bellState: assembly.cloudBells.snapshot(),
    siteCount: assembly.expedition.sites.length,
    signs: assembly.plaques.plaques.map(p => ({ id: p.id, title: p.heading })),
    realSignTextures: assembly.plaques.hasRealTextures,
    lights: assembly.expedition.lights.length + assembly.workshop.lights.length + assembly.cloudBells.lamps.length,
    lastInteraction, interactions: assembly.expeditionActivities.snapshot(),
    physicalStory: assembly.expeditionDynamics.snapshot(),
    playableProps: assembly.expeditionDynamics.visuals,
    reference: { src: refImage.src, complete: refImage.complete,
      naturalWidth: refImage.naturalWidth, hidden: refPanel.hidden },
    events: [...events],
  }) }),
});
choose(selectedIndex);
setLight();
resize();
requestAnimationFrame(animate);
