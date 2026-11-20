import {
  AmbientLight, BufferAttribute, BufferGeometry, Color, DoubleSide, Mesh, MeshLambertMaterial,
  PerspectiveCamera, PointLight, Scene, Vector3, WebGLRenderer,
} from 'three';
import { createUndergroundMineLayout } from '@first-mine';
import { createUndergroundCampRemains } from '../voxel-tavern/town-blockout/underground-camp-remains';
import { createUndergroundCampInteractions } from '../voxel-tavern/town-blockout/underground-camp-interactions';
import { createUndergroundCampOfferings } from '../voxel-tavern/town-blockout/underground-camp-offerings';
import { mountUndergroundCampControls } from '../voxel-tavern/town-blockout/underground-camp-controls';
import { mountUndergroundCampLighting } from '../voxel-tavern/town-blockout/underground-camp-lighting';

const spec = {
  pool: { length: 4, width: 6, depth: 1.2, shaftAperture: { width: 2, length: 2 } },
  shoreLength: 8, gallery: { length: 20, drop: 1, railGauge: 1, railWidth: .08 },
  collapse: { length: 3, width: 1.2, height: 1.3 },
  camp: { length: 10, side: 'right' as const, extension: 5 },
  walker: { radius: .27, standingHeight: 1.8, crouchingHeight: 1.1, maxGrade: .2 },
};
const mine = createUndergroundMineLayout(spec);
const camp = createUndergroundCampRemains({ mine, camp: spec.camp, walker: spec.walker });
const offerings = createUndergroundCampOfferings(camp.memorial.niches);
const lights = mountUndergroundCampLighting(camp.lighting);
const scene = new Scene();
scene.background = new Color('#282925');
const headLamp = new PointLight('#fff1db', 14, 6, 2);
scene.add(new AmbientLight('#ebdfcb', .62), camp.group, headLamp);
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
type Foot = readonly [number, number, number];
let foot: Foot | undefined;
let looking: Foot = [2.6, -89.7, 44.3];
let eye: Foot | undefined;
let seat: string | undefined;
let lanterns = 3;
let tookLamp = 0;
let clock = 0;

const actions = {
  camp, walker: spec.walker,
  readFooting: () => foot,
  now: () => clock,
  restAfterMs: 2500,
  promptRange: 1.15,
  sit(room: typeof camp.rooms[number]) {
    const [x, y, z] = room.sit.position;
    eye = [x, y + .84, z];
    looking = [x - 1, y + .83, z];
    seat = room.id;
    return true;
  },
  stand() { eye = undefined; seat = undefined; return true; },
  setSeatedAmbience(active: boolean) {
    void sound.resume();
    // Independent gains are the host ports used by this isolated browser fixture.
    roomGain.gain.value = active ? .63 : 1;
    hearthGain.gain.value = active ? .38 : .2;
  },
  lookAtBowl(bowl: typeof camp.dining.bowl) { looking = bowl.position; return true; },
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
const interactions = createUndergroundCampInteractions(actions);
const controls = mountUndergroundCampControls(document.querySelector('output')!, document,
  interactions, error => errors.push(String(error)));

function render() {
  controls.update();
  const state = offerings.snapshot();
  lights.sync(new Set(state.litNicheIds), state.extraCampLightCount, 5 - Number(headLamp.visible));
  const standingEye = foot ? [foot[0], foot[1] + 1.65, foot[2]] as const : [2.5, -89.35, 40] as const;
  camera.position.fromArray(eye ?? standingEye);
  headLamp.position.copy(camera.position).y += .14;
  camera.lookAt(new Vector3().fromArray(looking));
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}
render();

Object.assign(window, {
  campInteractionsProbe: {
    go(id: string) {
      const room = camp.rooms.find(item => item.id === id);
      const stations: Record<string, { foot: Foot; look: Foot }> = {
        bowl: { foot: camp.dining.bowl.approach, look: camp.dining.bowl.position },
        memorial: { foot: camp.memorial.approach, look: camp.memorial.position },
        'memorial-wide': { foot: [2.6, -91, 40.4], look: [2.6, -90.5, 44.1] },
        'dorm-five-detail': { foot: [3.5, -91, 42.33], look: [5.19, -90.8, 42.52] },
      };
      const station = stations[id];
      foot = room?.approach ?? station?.foot;
      if (foot && camp.queryPassage(foot[0], foot[2], spec.walker.radius, spec.walker.standingHeight)?.floor !== foot[1]) {
        throw new Error('Review station is not walkable in the camp host');
      }
      if (station) looking = station.look;
      else if (room) looking = room.sit.position;
      controls.update();
    },
    headlamp(active: boolean) { headLamp.visible = active; },
    tick(ms: number) { clock += ms; },
    clear() { offerings.clear(); },
    inspect() {
      const visible: string[] = [];
      camp.group.traverse(object => {
        if (object instanceof PointLight && object.visible) visible.push(object.name);
      });
      if (headLamp.visible) visible.push('headlamp');
      return {
        seat: seat ?? null, lanterns, tookLamp, visible, relics: [...relics], errors,
        roomGain: roomGain.gain.value, hearthGain: hearthGain.gain.value,
        interaction: interactions.snapshot(), ...offerings.snapshot(),
      };
    },
  },
});
