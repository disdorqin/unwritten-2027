import {
  AmbientLight, BufferAttribute, BufferGeometry, Color, DoubleSide, Group, Mesh, MeshLambertMaterial,
  PerspectiveCamera, PointLight, Raycaster, Scene, Vector2, Vector3, WebGLRenderer,
} from 'three';
import { createUndergroundMineLayout } from '@first-mine';
import { createUndergroundCampPickaxeAuthority } from '../../src/presence/underground-camp-pickaxe';
import { resolveUndergroundCampPickaxeSite } from '../../src/shared/underground-camp-pickaxe';
import { createUndergroundCampOfferings } from '../voxel-tavern/town-blockout/underground-camp-offerings';
import { mountUndergroundCampControls } from '../voxel-tavern/town-blockout/underground-camp-controls';
import { mountUndergroundCampScene } from '../voxel-tavern/town-blockout/underground-camp-scene';

const spec = {
  pool: { length: 4, width: 6, depth: 1.2, shaftAperture: { width: 2, length: 2 } },
  shoreLength: 8, gallery: { length: 20, drop: 1, railGauge: 1, railWidth: .08 },
  collapse: { length: 3, width: 1.2, height: 1.3 },
  camp: { length: 10, side: 'right' as const, extension: 5 },
  walker: { radius: .27, standingHeight: 1.8, crouchingHeight: 1.1, maxGrade: .2 },
};
const mine = createUndergroundMineLayout(spec);
const scene = new Scene();
scene.background = new Color('#282925');
const headLamp = new PointLight('#fff1db', 14, 6, 2);
const campParent = new Group();
scene.add(new AmbientLight('#ebdfcb', .62), campParent, headLamp);
for (const [surface, positions] of Object.entries(mine.mesh)) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  const color = surface === 'rock' ? '#77726a' : surface === 'rail' ? '#4c4238' : '#425f65';
  scene.add(new Mesh(geometry, new MeshLambertMaterial({ color, side: DoubleSide })));
}
const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(740, 500);
document.querySelector('main')!.append(renderer.domElement);
const camera = new PerspectiveCamera(61, 740 / 500, .025, 40);
const sound = new AudioContext();
const roomGain = sound.createGain();
const hearthGain = sound.createGain();
roomGain.gain.value = 1;
hearthGain.gain.value = .2;
const errors: string[] = [];
const relics = new Set<string>();
const pickaxeReceipts = new Set<string>();
const pickaxeNotices: string[] = [];
const attemptedProfiles: string[] = [];
const raycaster = new Raycaster();
const reticle = new Vector2(0, 0);
type Foot = readonly [number, number, number];
type CampScene = ReturnType<typeof mountUndergroundCampScene>;
type Camp = CampScene['camp'];
let foot: Foot | undefined;
let looking: Foot = [2.6, -89.7, 44.3];
let eye: Foot | undefined;
let seat: string | undefined;
let lanterns = 3;
let tookLamp = 0;
let clock = 0;
let rested = false;
let profile = 'review-a';
let offerings: ReturnType<typeof createUndergroundCampOfferings>;
const domainId = 'review/underground-mine';

const actions = {
  readFooting: () => foot,
  now: () => clock,
  restAfterMs: 2500,
  promptRange: 1.15,
  sit(room: Camp['rooms'][number]) {
    const [x, y, z] = room.sit.position;
    eye = [x, y + .84, z];
    looking = [x - 1, y + .83, z];
    seat = room.id;
    rested = false;
    return true;
  },
  stand() { eye = undefined; seat = undefined; rested = false; return true; },
  onRested() { rested = true; },
  setSeatedAmbience(active: boolean) {
    void sound.resume();
    // Independent gains are the host ports used by this isolated browser fixture.
    roomGain.gain.value = active ? .63 : 1;
    hearthGain.gain.value = active ? .38 : .2;
  },
  lookAtBowl(bowl: Camp['dining']['bowl']) { looking = bowl.position; return true; },
  recordRelic(entry: Readonly<{category: string; id: string; label: string}>) {
    if (entry.category !== 'relic') throw new Error('Expected a relic field-guide entry');
    const key = entry.id + ':' + entry.label;
    if (relics.has(key)) return 'already-recorded' as const;
    relics.add(key);
    return 'recorded' as const;
  },
  canOfferLamp(id: string) {
    return lanterns > 0 && !offerings.snapshot().litNicheIds.includes(id);
  },
  offerLamp(id: string) {
    return offerings.offerLamp(id, () => {
      if (lanterns < 1) return false;
      lanterns--;
      tookLamp++;
      return true;
    }).kind === 'offered';
  },
};
function createCampScene(): CampScene {
  return mountUndergroundCampScene({
    parent: campParent, mine, camp: spec.camp, walker: spec.walker, actions,
    readLights() {
      const state = offerings?.snapshot();
      return {
        litNicheIds: new Set(state?.litNicheIds), extraCampLightCount: state?.extraCampLightCount ?? 0,
        remainingBudget: 5 - Number(headLamp.visible),
      };
    },
    pickaxe: {
      available: () => !pickaxeReceipts.has(profile),
      aimedAt: () => firstHit()?.object.name === mounted.pickaxeSite.id,
      claim(siteId) {
        attemptedProfiles.push(profile);
        return claimPickaxe(profile, siteId);
      },
      showPickupNotice() { pickaxeNotices.push(profile); },
    },
  });
}

let mounted = createCampScene();
offerings = createUndergroundCampOfferings(mounted.camp.memorial.niches);
const registeredSite = resolveUndergroundCampPickaxeSite(mine, spec.camp);
if (!registeredSite) throw new Error('The mine could not register the camp pickaxe');
const { aim, approach } = registeredSite;
const claimPickaxe = createUndergroundCampPickaxeAuthority({
  site: { domainId, east: aim[0], north: -aim[2], height: approach[1] },
  readAcceptedFoot(id) {
    if (id !== profile || !foot) return;
    const [east, height, z] = foot;
    return { playerId: id, domainId, east, north: -z, height };
  },
  hasAcceptedMineArrival: id => id === profile && !!foot,
  hasAcceptedPickaxeSight: (id, siteId) => id === profile && firstHit()?.object.name === siteId,
  async grantToolOnce(id, pickup) {
    if (pickup.tool !== 'pickaxe') throw new Error('Expected the original pickaxe slot');
    if (pickaxeReceipts.has(id)) return 'already-granted';
    pickaxeReceipts.add(id);
    return 'granted';
  },
});

const controls = mountUndergroundCampControls(document.querySelector('output')!, document,
  {
    prompt: () => mounted.prompt(),
    press: id => mounted.press(id),
    update: () => mounted.update(),
    cancelSeat: () => mounted.dispose(),
  }, error => errors.push(String(error)));

function focusCamera() {
  const standingEye = foot ? [foot[0], foot[1] + 1.65, foot[2]] as const : [2.5, -89.35, 40] as const;
  camera.position.fromArray(eye ?? standingEye);
  headLamp.position.copy(camera.position).y += .14;
  camera.lookAt(new Vector3().fromArray(looking));
  camera.updateMatrixWorld(true);
}

function firstHit() {
  mounted.camp.group.updateMatrixWorld(true);
  raycaster.setFromCamera(reticle, camera);
  return raycaster.intersectObject(mounted.camp.group, true).find(hit => hit.object.visible);
}

function render() {
  focusCamera();
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}
render();

Object.assign(window, {
  campInteractionsProbe: {
    go(id: string) {
      const camp = mounted.camp;
      const room = camp.rooms.find(item => item.id === id);
      const stations: Record<string, { foot: Foot; look: Foot }> = {
        bowl: { foot: camp.dining.bowl.approach, look: camp.dining.bowl.position },
        memorial: { foot: camp.memorial.approach, look: camp.memorial.position },
        'memorial-wide': { foot: [2.6, -91, 40.4], look: [2.6, -90.5, 44.1] },
        'dorm-five-detail': { foot: [3.5, -91, 42.33], look: [5.19, -90.8, 42.52] },
      };
      const station = stations[id];
      foot = room?.approach ?? station?.foot;
      if (foot && mounted.queryPassage(foot[0], foot[2], spec.walker.radius, spec.walker.standingHeight)?.floor !== foot[1]) {
        throw new Error('Review station is not walkable in the camp host');
      }
      if (station) looking = station.look;
      else if (room) looking = room.sit.position;
      focusCamera();
      controls.update();
    },
    enterPickaxe(id: string) {
      if (id !== 'review-a' && id !== 'review-b') throw new Error('Expected one of two stable fixture profiles');
      foot = undefined;
      mounted.dispose();
      profile = id;
      mounted = createCampScene();
      foot = mounted.pickaxeSite.approach;
      if (mounted.queryPassage(foot[0], foot[2], spec.walker.radius, spec.walker.standingHeight)?.floor !== foot[1]) {
        throw new Error('The registered pickaxe approach is blocked');
      }
      eye = undefined;
      this.aimAtPickaxe(true);
    },
    aimAtPickaxe(on: boolean) {
      const [x, y, z] = mounted.pickaxeSite.aim;
      looking = on ? [x, y, z] : [x - 2, y, z];
      focusCamera();
      controls.update();
    },
    headlamp(active: boolean) { headLamp.visible = active; },
    tick(ms: number) { clock += ms; },
    clear() { offerings.clear(); },
    inspect() {
      const visible: string[] = [];
      mounted.camp.group.traverse(object => {
        if (object instanceof PointLight && object.visible) visible.push(object.name);
      });
      if (headLamp.visible) visible.push('headlamp');
      const hit = firstHit();
      return {
        seat: seat ?? null, lanterns, tookLamp, visible, relics: [...relics], errors,
        roomGain: roomGain.gain.value, hearthGain: hearthGain.gain.value,
        interaction: { rested }, ...offerings.snapshot(),
        pickaxe: {
          profile, firstHit: hit?.object.name, hitDistance: hit?.distance, foot, aim: mounted.pickaxeSite.aim,
          visible: mounted.camp.group.getObjectByName(mounted.pickaxeSite.id)?.visible,
          receipts: [...pickaxeReceipts], notices: [...pickaxeNotices], attemptedProfiles: [...attemptedProfiles],
        },
      };
    },
  },
});
