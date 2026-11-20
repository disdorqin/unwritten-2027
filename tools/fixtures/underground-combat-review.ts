import {
  BoxGeometry, Color, Mesh, MeshBasicMaterial, PerspectiveCamera, Raycaster, Scene, Vector2, Vector3, WebGLRenderer,
  type Object3D,
} from 'three';
import { mountUndergroundCombatFeedback, type UndergroundCombatCue } from '../voxel-tavern/town-blockout/underground-combat-feedback';
import { applyUndergroundKnockback } from '../voxel-tavern/town-blockout/underground-knockback';

const layer = 'review-mine';
const width = 720;
const height = 480;
const scene = new Scene();
scene.background = new Color('#34312f');
const camera = new PerspectiveCamera(60, width / height, .03, 25);
camera.position.set(0, -88.35, 0);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setSize(width, height);
document.querySelector('main')!.append(renderer.domElement);
const ground = new Mesh(new BoxGeometry(6, .1, 6), new MeshBasicMaterial({ color: '#645950' }));
ground.position.y = -90.05;
scene.add(ground);
// The collision adapter and the visible wall use the same inner face.
const bodyRadius = .27;
const wallInnerEast = 2.46;
const wallThickness = .14;
const wall = new Mesh(new BoxGeometry(wallThickness, 3, 6), new MeshBasicMaterial({ color: '#534942' }));
wall.position.set(wallInnerEast + wallThickness / 2, -88.5, 0);
wall.name = 'review-mine-east-wall';
scene.add(wall);

const Actors = [
  { id: 'clump', color: '#9baeb4', x: -.58, y: -89.72, z: -1.1, size: [.42, .44, .42] },
  { id: 'skeleton', color: '#b7966c', x: .60, y: -89.45, z: -.63, size: [.44, .95, .45] },
] as const;
const targets = Actors.map(actor => {
  const mesh = new Mesh(new BoxGeometry(...actor.size), new MeshBasicMaterial({ color: actor.color }));
  mesh.position.set(actor.x, actor.y, actor.z);
  mesh.name = actor.id;
  scene.add(mesh);
  return mesh;
});
const spark = new Mesh(new BoxGeometry(.12, .12, .12), new MeshBasicMaterial({ color: '#fff2c7' }));
spark.visible = false;
scene.add(spark);
const events: { code: string; trusted: boolean }[] = [];
const receipts: UndergroundCombatCue[] = [];
const effects: { id: string; family: string; holdMs: number; flashMs: number; stagger: string }[] = [];
type KnockbackOptions = Parameters<typeof applyUndergroundKnockback>[0];
type Foot = NonNullable<ReturnType<KnockbackOptions['readFoot']>>;
type Weight = KnockbackOptions['weight'];
type ImpactReport = {
  subject: string; weight: Weight; from: Foot; before: Foot; after: Foot; distance: number; blocked: boolean;
};
const impacts: ImpactReport[] = [];
const projection = new Vector3();
const reticle = new Vector2(0, 0);
const ray = new Raycaster();
let clock = 0;
let heldTool: 'pickaxe' | 'snowball' = 'pickaxe';
let activeLayer = layer;
let flash: { id: string; until: number } | undefined;
let last: UndergroundCombatCue | undefined;
let acceptedImpact: { cue: UndergroundCombatCue; from: Foot } | undefined;
let sent = 0;
let pending = false;
let endangered = false;
let sound: AudioContext | undefined;
let analyser: AnalyserNode | undefined;
const audioWave = new Float32Array(2048);
let audioPeak = 0;

function readFoot(object: Object3D): Foot {
  return { layer: activeLayer, east: object.position.x, north: -object.position.z };
}

function tryMove(object: Object3D, foot: Foot) {
  if (foot.layer !== activeLayer || foot.east > wallInnerEast - bodyRadius ||
      foot.east < -3 + bodyRadius || Math.abs(foot.north) > 3 - bodyRadius) return false;
  object.position.x = foot.east;
  object.position.z = -foot.north;
  object.updateMatrixWorld(true);
  return true;
}

function pushSubject(subject: string, object: Object3D, from: Foot, weight: Weight) {
  const before = readFoot(object);
  const result = applyUndergroundKnockback({
    from, weight, readFoot: () => readFoot(object), tryMove: next => tryMove(object, next),
  });
  if (!result) return;
  const report = { subject, weight, from, before, after: readFoot(object), ...result };
  impacts.push(report);
  return report;
}

const feedback = mountUndergroundCombatFeedback({
  parent: document.body,
  project(point) {
    projection.set(point.east, point.height, -point.north).project(camera);
    if (Math.abs(projection.x) > 1 || Math.abs(projection.y) > 1 || Math.abs(projection.z) > 1) return;
    return { x: (projection.x + 1) * width / 2, y: (1 - projection.y) * height / 2 };
  },
  getAudioContext: () => sound,
  audioOutput(context) {
    if (!analyser) {
      analyser = context.createAnalyser();
      analyser.fftSize = audioWave.length;
      analyser.connect(context.destination);
    }
    return analyser;
  },
  showCreatureHit(cue, effect) {
    effects.push({ id: cue.targetId, ...effect });
    flash = { id: cue.targetId, until: clock + effect.flashMs };
    spark.position.set(cue.at.east + .12, cue.at.height + .28, -cue.at.north + .08);
    spark.visible = true;
  },
  onKnockback(cue, weight) {
    if (acceptedImpact?.cue !== cue) throw new Error('Missing host-resolved source of accepted impact');
    const subject = cue.kind === 'player-hurt' ? 'player' : cue.targetId;
    const object = cue.kind === 'player-hurt' ? camera : targets.find(target => target.name === subject);
    if (!object) throw new Error('Unregistered knockback subject');
    pushSubject(subject, object, acceptedImpact.from, weight);
  },
  clear() {
    flash = undefined;
    spark.visible = false;
  },
});
feedback.setLayer(layer);

function aim(id: string) {
  const target = targets.find(candidate => candidate.name === id);
  if (!target) throw new Error('Unregistered fixture actor');
  camera.lookAt(target.position);
  camera.updateMatrixWorld(true);
}

function aimedAt() {
  scene.updateMatrixWorld(true);
  ray.setFromCamera(reticle, camera);
  return ray.intersectObjects(targets).find(hit => hit.object.visible)?.object.name;
}

function activateAudio() {
  sound ??= new AudioContext();
  return sound.resume();
}

async function request(action: 'hit' | 'threat') {
  if (pending) return;
  const target = action === 'hit' ? aimedAt() : undefined;
  if (action === 'hit' && !target) return;
  pending = true;
  try {
    await activateAudio();
    const response = await fetch('/u14-api/' + action, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ target, tool: heldTool }),
    });
    if (!response.ok) throw new Error('Review authority failed: ' + response.status);
    const impact: { cue: UndergroundCombatCue; from: Foot } = await response.json();
    const { cue } = impact;
    acceptedImpact = impact;
    try {
      if (!cue || !feedback.receive(cue, clock)) throw new Error('Missing accepted feedback receipt');
    } finally {
      acceptedImpact = undefined;
    }
    last = cue;
    receipts.push(cue);
    sent++;
  } finally {
    pending = false;
  }
}

renderer.domElement.addEventListener('click', event => {
  if (event.button !== 0) return;
  events.push({ code: 'left', trusted: event.isTrusted });
  void request('hit');
});
window.addEventListener('keydown', event => {
  if (event.repeat || !['Digit1', 'Digit2', 'KeyW', 'ArrowLeft'].includes(event.code)) return;
  events.push({ code: event.code, trusted: event.isTrusted });
  if (event.code === 'Digit1') heldTool = 'pickaxe';
  if (event.code === 'Digit2') heldTool = 'snowball';
  if (event.code === 'KeyW') {
    const foot = readFoot(camera);
    tryMove(camera, { ...foot, north: foot.north + .08 });
    if (!endangered) {
      endangered = true;
      void request('threat');
    }
  }
  if (event.code === 'ArrowLeft') camera.rotateY(.08);
  camera.updateMatrixWorld(true);
});

function render() {
  const { held, screenX, screenY } = feedback.sample(clock);
  for (const [index, target] of targets.entries()) {
    const flashOn = flash?.id === target.name && clock < flash.until;
    target.material.color.set(flashOn ? '#ffffff' : Actors[index].color);
    // Freeze only the individual impact visual. Steering and local time keep running.
    target.rotation.y = held.has(target.name) ? 0 : .04;
  }
  spark.visible = !!flash && clock < flash.until;
  renderer.domElement.style.transform = screenX || screenY ? `translate(${screenX}px, ${screenY}px)` : '';
  if (analyser) {
    analyser.getFloatTimeDomainData(audioWave);
    for (const amplitude of audioWave) audioPeak = Math.max(audioPeak, Math.abs(amplitude));
  }
  renderer.render(scene, camera);
}

function loop() {
  render();
  requestAnimationFrame(loop);
}

aim('clump');
loop();
Object.assign(window, { undergroundCombatProbe: {
  aim,
  resetAudioPeak() { audioPeak = 0; },
  advance(ms: number) { clock += ms; render(); },
  replay() { return last ? feedback.receive(last, clock) : undefined; },
  replayInOtherLayer() {
    return last ? feedback.receive({ ...last, sequence: last.sequence + 50 }, clock) : undefined;
  },
  setLayer(next: string) { activeLayer = next; feedback.setLayer(next); render(); },
  heavyAgainstWall() {
    // A staged heavy impact uses the same movement adapter and the rendered wall.
    const subject = targets[0];
    subject.position.set(1.95, Actors[0].y, -1.35);
    const report = pushSubject(subject.name, subject, { layer, east: 1, north: 1.35 }, 'heavy');
    aim(subject.name);
    render();
    return { report, wallInnerEast, bodyRadius };
  },
  inspect() {
    const pose = feedback.sample(clock);
    const rim = feedback.overlay.querySelector<HTMLElement>('[data-underground-combat-hurt]')!;
    const numbers = Array.from(feedback.overlay.querySelectorAll<HTMLElement>('[data-underground-combat-damage]'))
      .filter(node => !node.hidden).map(node => ({ text: node.textContent, transform: node.style.transform }));
    return {
      clock, sent, activeLayer, aimed: aimedAt(), heldTool, pending, events, receipts, effects, impacts,
      audioPeak, held: [...pose.held.entries()], shake: [pose.screenX, pose.screenY], rim: Number(rim.style.opacity),
      numbers, spark: spark.visible, drawCalls: renderer.info.render.calls, view: camera.quaternion.toArray(),
      foot: readFoot(camera), footZ: camera.position.z, transform: renderer.domElement.style.transform,
      colors: targets.map(target => target.material.color.getHexString()),
      overlayPointerEvents: feedback.overlay.style.pointerEvents,
    };
  },
} });
