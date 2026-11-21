import {
  AmbientLight, Color, DirectionalLight, Fog, Group, Mesh, MeshLambertMaterial, PerspectiveCamera,
  PlaneGeometry, Scene, WebGLRenderer,
} from 'three';
import { createSnowWingFlight, snowWingSpec } from '../../../src/shared/snow-wing';
import { summitWingPickupAvailability } from '../../../src/shared/summit-wing-pickup';
import { createSnowWingVisual } from './flight-equipment-visuals';
import { createMainSummitBlock, mainSummitLayout, mainSummitSpec } from './main-summit-block';
import { mountSummitGlideRingVisuals } from './main-summit-glide-ring-visuals';
import { createSummitGlideTargetRun, surveySummitGlidePracticeTarget } from './main-summit-glide-target';
import { mountSummitGlideTargetVisual } from './main-summit-glide-target-visual';
import { createSummitGlideRingProgress, summitGlideRingBodyLift, surveySummitGlideRings } from './main-summit-glide-rings';
import {
  createMainSummitRegistration, createMainSummitRegistrationLandmarks, mountMainSummitRegistration,
} from './main-summit-registration';
import { townPhysicsDelta } from './town-physics-clock';
import { mountMainSummitWingRack } from './main-summit-wing-rack';

const scene = new Scene();
scene.background = new Color('#b1c5dc');
const fog = new Fog('#a9bed8', 90, 1800);
scene.fog = fog;
scene.add(new AmbientLight('#d6e2f3', 1.6));
const sun = new DirectionalLight('#fff0d8', 2);
sun.position.set(-18, 44, 21);
scene.add(sun);
const block = createMainSummitBlock(mainSummitLayout, 347, 50);
scene.add(block.coarse);
const landmarks = createMainSummitRegistrationLandmarks(347);
const summit = new Group();
scene.add(summit);
const lodge = mountMainSummitRegistration(summit, landmarks);
const rack = mountMainSummitWingRack(lodge.group);
const registrar = createMainSummitRegistration(landmarks);
const wing = createSnowWingVisual();
scene.add(wing.group);
const floor = new Mesh(new PlaneGeometry(12000, 12000), new MeshLambertMaterial({ color: '#c1ceda' }));
floor.position.set(0, -.02, 2000);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1);
document.querySelector('#scene')!.append(renderer.domElement);
const camera = new PerspectiveCamera(54, 1, .05, 3000);
const status = document.querySelector<HTMLElement>('#flight-status')!;
const reading = document.querySelector<HTMLOutputElement>('#flight-reading')!;
const ringReading = document.querySelector<HTMLOutputElement>('#ring-reading')!;
const targetReading = document.querySelector<HTMLOutputElement>('#target-reading')!;
const vignette = document.querySelector<HTMLElement>('#vignette')!;
const keys = new Set<string>();
const movementKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight']);
const reviewOptions = new URLSearchParams(location.search);
const proof = reviewOptions.get('proof') === '1';
const showRings = reviewOptions.get('rings') === '1' || (!proof && reviewOptions.get('rings') !== '0');
const showPracticeTarget = reviewOptions.get('target') === '1';
const flightTimeScale = proof ? 12 : 1;
const groundAt = (east: number, north: number) => block.heightAt(east, north) ?? 0;
const flight = createSnowWingFlight(groundAt);
const position = { ...landmarks.summit.registry, north: 1006 };
const edgeNorth = mainSummitLayout.summit.north - mainSummitSpec.summitPlateau[1] / 2;
// The review course is surveyed from the centre of the P-4 lodge's existing F-1 launch walk.
const practiceEast = landmarks.summit.registry.east;
const practiceHeight = groundAt(practiceEast, edgeNorth);
const rings = showRings ? surveySummitGlideRings({
  east: practiceEast, north: edgeNorth, height: practiceHeight, heading: Math.PI, speed: 7.5,
  claimed: true, pathClear: true, drop: practiceHeight - groundAt(practiceEast, edgeNorth - 40),
}, groundAt) : [];
const course = showRings ? createSummitGlideRingProgress(rings) : undefined;
const ringVisuals = showRings ? mountSummitGlideRingVisuals(scene, rings) : undefined;
// Isolated demonstration only. The formal ZD-08 footslope target is registered by the world host.
const practiceTarget = showPracticeTarget ? surveySummitGlidePracticeTarget({
  east: practiceEast, north: edgeNorth, height: practiceHeight, heading: Math.PI,
  speed: 7.5, claimed: true, pathClear: true,
  drop: practiceHeight - groundAt(practiceEast, edgeNorth - 40),
}, groundAt) : undefined;
const targetVisual = practiceTarget ? mountSummitGlideTargetVisual(scene, practiceTarget) : undefined;
const targetRun = practiceTarget ? createSummitGlideTargetRun('review-flight', practiceTarget, groundAt) : undefined;
targetReading.hidden = !targetRun;
if (targetRun) targetReading.value = '练习落靶已标定：触雪后按离靶心距离结算（非正式山脚赛道）';
const radius = .26;
let claimed = false;
let groundHeading = Math.PI;
let lodgeAction = '';
let launchProbe: { east: number; north: number; height: number; drop: number; pathClear: boolean; speed: number } | undefined;
let lastPhase: string | undefined;
let lastCue: string | undefined;
let wingDraws = 0;
let rackDraws = 0;
let ringDraws = 0;
let paused = false;
let frame = 0;
let frameId = 0;
let previous = performance.now();
let remainder = 0;
const events: { kind: string; value: string; elapsed: number; height: number; speed: number }[] = [];
const wingMesh = wing.group.getObjectByName('snow-wing-voxels')!;
wingMesh.onAfterRender = () => { wingDraws++; };
rack.group.getObjectByName('snow-wing-voxels')!.onAfterRender = () => { rackDraws++; };
ringVisuals?.group.traverse(object => {
  if ((object as Mesh).isMesh) object.onAfterRender = () => { ringDraws++; };
});

function blocked(east: number, north: number, height: number) {
  if (rack.blocked(east, north, height, radius, 1.8)) return true;
  return lodge.colliders.some(({ min, max }) => {
    if (height + 1.8 <= min[1] || height + .03 >= max[1]) return false;
    const dx = Math.max(min[0] - east, east - max[0], 0);
    const dz = Math.max(min[2] + north, -north - max[2], 0);
    return Math.hypot(dx, dz) < radius;
  });
}

function useLodge() {
  const { east, north } = landmarks.summit.registry;
  if (flight.snapshot()?.usesBothHands) return;
  const pickup = summitWingPickupAvailability(position, claimed, registrar.snapshot());
  if (pickup !== 'out-of-reach') {
    lodgeAction = pickup;
    if (pickup === 'available') {
      claimed = true;
      rack.setClaimed(true);
      lodgeAction = 'claimed';
      status.textContent = '已领雪翼。走出小屋，向南越过雪崖。';
    } else if (pickup === 'need-registration') {
      status.textContent = '先到登记台登记，再到翼架领翼。';
    }
  } else if (Math.hypot(position.east - east, position.north - north) <= 1.1) {
    const action = registrar.interact('summit', position);
    lodgeAction = action.changed ? 'registered' : 'already-registered';
    if (!claimed) status.textContent = '绝顶已登记。到小屋东侧翼架按 E 领取。';
  } else {
    lodgeAction = 'out-of-reach';
  }
}

function walk(landed: boolean) {
  groundHeading += (Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft'))) * 1.65 * townPhysicsDelta;
  const forward = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
  const sideways = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
  if (!forward && !sideways) return;
  const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 11.3 : 7.5) /
    Math.hypot(forward, sideways);
  const dt = speed * townPhysicsDelta;
  const east = position.east + (Math.sin(groundHeading) * forward + Math.cos(groundHeading) * sideways) * dt;
  const north = position.north + (Math.cos(groundHeading) * forward - Math.sin(groundHeading) * sideways) * dt;
  const height = landed ? groundAt(east, north) : block.heightAt(east, north);
  if (height === undefined || Math.abs(height - position.height) > .43 || blocked(east, north, height)) return;
  if (forward > 0 && position.north > edgeNorth && north <= edgeNorth) {
    const edgeHeight = groundAt(east, edgeNorth);
    const drop = edgeHeight - groundAt(east, edgeNorth - 40);
    const pathClear = Array.from({ length: 81 }, (_, index) => edgeNorth - index / 2).every(n =>
      !blocked(east, n, edgeHeight) && groundAt(east, n) <= edgeHeight);
    if (flight.launch({ east, north: edgeNorth, height: edgeHeight, heading: Math.PI, speed, claimed, pathClear, drop })) {
      launchProbe = { east, north: edgeNorth, height: edgeHeight, speed, pathClear, drop };
    } else status.textContent = '需要雪翼和前方净空，才能从崖边起飞。';
    return;
  }
  Object.assign(position, { east, north, height });
}

function observe(air = flight.snapshot()) {
  if (!air) return;
  const { phase, elapsed, height, speed, stallCue } = air;
  if (phase !== lastPhase) {
    events.push({ kind: 'phase', value: phase, elapsed, height, speed });
    lastPhase = phase;
  }
  if (stallCue !== lastCue) {
    events.push({ kind: 'stall-cue', value: stallCue, elapsed, height, speed });
    lastCue = stallCue;
  }
}

function simulate() {
  const air = flight.snapshot();
  if (!air?.usesBothHands) {
    walk(air?.phase === 'landed');
    observe();
    return;
  }
  const pitch = Number(keys.has('KeyS')) - Number(keys.has('KeyW'));
  const turn = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
  const next = flight.advance(townPhysicsDelta, { pitch, turn });
  if (course && next?.usesBothHands) {
    course.advance({ east: air.east, north: air.north, height: air.height + summitGlideRingBodyLift },
      { east: next.east, north: next.north, height: next.height + summitGlideRingBodyLift });
  }
  if (next?.phase === 'landed') {
    const { east, north, height, heading } = next;
    Object.assign(position, { east, north, height });
    groundHeading = heading;
    if (air?.usesBothHands && targetRun) {
      const result = targetRun.settle({
        flightId: 'review-flight', accepted: true, phase: next.phase, touchdown: next.touchdown,
        east, north, height,
      });
      if (result) {
        const label = { bullseye: '正中靶心', inner: '内环', outer: '外环', outside: '靶外' }[result.grade];
        targetReading.value = `练习落靶：${label} · 距心 ${result.horizontalMetres.toFixed(2)} m · ${result.touchdown === 'seated' ? '坐地缓冲' : '柔和触雪'}`;
      }
    }
  }
  observe(next);
}

function display() {
  const air = flight.snapshot();
  const airborne = air?.usesBothHands ? air : undefined;
  const point = airborne ?? position;
  const heading = airborne?.heading ?? groundHeading;
  const dx = Math.sin(heading);
  const dz = -Math.cos(heading);
  wing.group.visible = air?.usesBothHands === true;
  if (ringVisuals && course) {
    const passed = course.snapshot().length;
    ringVisuals.group.visible = air?.usesBothHands === true;
    ringVisuals.setProgress(passed);
    ringReading.hidden = !air || rings.length === 0;
    ringReading.value = `滑翔光圈 ${passed} / ${rings.length}`;
  }
  if (air?.usesBothHands) {
    if (practiceTarget) {
      const east = practiceTarget.east - air.east;
      const north = practiceTarget.north - air.north;
      const bearing = Math.atan2(east, north);
      const offset = Math.atan2(Math.sin(bearing - air.heading), Math.cos(bearing - air.heading));
      const correction = offset > .12 ? '向右修正' : offset < -.12 ? '向左修正' : '正前方';
      targetReading.value = `练习落靶导航 · 距目标 ${Math.hypot(east, north).toFixed(0)} m · ${correction} · 触雪结算`;
    }
    const flutter = air.stallCue === 'flutter' ? Math.sin(air.elapsed * 32) * .035 : 0;
    wing.group.position.set(point.east, point.height + 1.5, -point.north);
    wing.group.rotation.set(0, Math.PI - heading, air.bank + flutter, 'YXZ');
    camera.position.set(point.east - dx * 8, point.height + 4.15, -point.north - dz * 8);
    camera.lookAt(point.east + dx * 4, point.height + .8, -point.north + dz * 4);
  } else {
    camera.position.set(point.east, point.height + 1.65, -point.north);
    camera.lookAt(point.east + dx, point.height + 1.58, -point.north + dz);
  }
  fog.near = air?.visibilityMetres ? 45 : 90;
  fog.far = air?.visibilityMetres ?? 1800;
  vignette.dataset.active = String(air?.stallCue === 'settling' || air?.stallCue === 'dim');
  if (air) {
    const message = {
      'lift-off': '离地',
      'flap-assist': '翼面补速',
      glide: air.stallCue === 'flutter' ? '翼尖轻颤' : air.stallCue === 'dim' ? '请压头接回滑翔' : '滑翔中',
      settling: '柔和飘落。按住 W 恢复滑翔。',
      landed: air.touchdown === 'seated' ? '在雪地坐稳，已收翼。' : '落地，已收翼。',
    }[air.phase];
    if (status.textContent !== message) status.textContent = message;
    reading.value = `高度 ${air.height.toFixed(1)} m · ${air.speed.toFixed(1)} m/s · ${air.horizontalMetres.toFixed(0)} m`;
  } else reading.value = `E ${point.east.toFixed(2)} · N ${point.north.toFixed(2)} · 高度 ${point.height.toFixed(1)} m`;
  wingDraws = 0;
  rackDraws = 0;
  ringDraws = 0;
  renderer.render(scene, camera);
  frame++;
}

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}

function animate(now: number) {
  const dt = Math.min(.1, Math.max(0, (now - previous) / 1000));
  previous = now;
  if (!paused) remainder += dt * (flight.snapshot()?.usesBothHands ? flightTimeScale : 1);
  while (remainder >= townPhysicsDelta) {
    simulate();
    remainder -= townPhysicsDelta;
  }
  display();
  frameId = requestAnimationFrame(animate);
}

addEventListener('keydown', event => {
  if (proof && event.code === 'KeyP' && !event.repeat) paused = !paused;
  if (event.code === 'KeyE' && !event.repeat) useLodge();
  if (!movementKeys.has(event.code)) return;
  event.preventDefault();
  if (!keys.has(event.code)) {
    const air = flight.snapshot();
    events.push({ kind: 'down', value: event.code, elapsed: air?.elapsed ?? 0,
      height: air?.height ?? position.height, speed: air?.speed ?? 0 });
  }
  keys.add(event.code);
});
addEventListener('keyup', event => { keys.delete(event.code); });
addEventListener('blur', () => keys.clear());
addEventListener('resize', resize);
addEventListener('pagehide', () => {
  cancelAnimationFrame(frameId);
  ringVisuals?.dispose();
  targetVisual?.dispose();
  rack.dispose();
  lodge.dispose();
  wing.dispose();
  block.dispose();
  floor.geometry.dispose();
  floor.material.dispose();
  renderer.dispose();
}, { once: true });

Object.defineProperty(window, '__snowWingReview', { value: Object.freeze({ getState: () => ({
  frame, flightTimeScale, paused, claimed, registration: registrar.snapshot(), position: { ...position },
  groundHeading, lodgeAction, rack: { stand: rack.stand, visible: !claimed, draws: rackDraws, inReach: rack.canReach(position) },
  rings: course ? { passed: course.snapshot(), count: rings.length, draws: ringDraws } : null,
  practiceTarget: practiceTarget ? { target: { ...practiceTarget }, settlement: targetRun?.snapshot(),
    lamps: targetVisual?.lights.length } : null,
  flight: flight.snapshot(), launchProbe: launchProbe && { ...launchProbe }, events: events.map(event => ({ ...event })),
  wing: { name: wing.group.name, visible: wing.group.visible, draws: wingDraws, bank: wing.group.rotation.z,
    width: wing.bounds.max.x - wing.bounds.min.x },
  draws: renderer.info.render.calls, triangles: renderer.info.render.triangles, fogFar: fog.far,
  cloudRange: [snowWingSpec.cloudLow, snowWingSpec.cloudHigh],
}) }) });
resize();
frameId = requestAnimationFrame(animate);
