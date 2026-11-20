import {
  AmbientLight, BufferGeometry, Color, DirectionalLight, Float32BufferAttribute, Fog, Mesh,
  MeshLambertMaterial, PerspectiveCamera, Scene, WebGLRenderer,
} from 'three';
import { createFlightThrust, fuelSecondsPerStardustOre } from '../../../src/shared/flight-thrust';
import {
  aircraftChapterGateOpen, assembleAircraftAtStarport, createAircraftFlight, surveyAircraftRunway,
  type AircraftLoadout, type AircraftPoint, type AircraftThrottle,
} from '../../../src/shared/aircraft-flight';
import { resolveOrbitalGateTravel } from '../../../src/presence/orbital-gates';
import { createStarportFuelDispenser } from '../../../src/presence/starport-fuel';
import { flightAirspaceAt } from '../../../src/shared/flight-field';
import { createTownNightWindow, type TownNightSchedule } from '../../../src/shared/town-night-window';
import { createStarportReviewWorld, mountStarportFlightSite, starportFlightSite } from './starport-flight-site';
import { mountStarportFlightAssembly } from './starport-flight-assembly';
import { mountStarportFieldReview } from './starport-field-review';
import { mountStarportNightRing } from './starport-night-ring';
import { northRidgeFrame } from './north-ridge-350-terrain';
import { flightFuelCanFullPowerMs, mountFlightFuelDisplay } from './flight-fuel-display';
import './flight-fuel-display.css';

const scene = new Scene();
scene.background = new Color('#afc5df');
scene.fog = new Fog('#afc5df', 80, 1_600);
scene.add(new AmbientLight('#d6e5f5', 1.7));
const sun = new DirectionalLight('#fff1dc', 2.1);
sun.position.set(-32, 68, 21);
scene.add(sun);

const proofMode = new URLSearchParams(location.search).get('proof');
const nightProof = proofMode === 'night-window';
const assemblyHandoff = proofMode === 'assembly-handoff';
const scheduledProof = nightProof || assemblyHandoff;
const fixedClock = proofMode === 'clock' || scheduledProof;
const fieldWorld = createStarportReviewWorld({ assemblyHandoff });
const { world, groundAt } = fieldWorld;
const step = 4;
const columns = northRidgeFrame.width / step + 1;
const rows = northRidgeFrame.depth / step + 1;
const positions: number[] = [], colors: number[] = [], indices: number[] = [];
const frost = new Color('#dbe8ed'), ice = new Color('#87aebe'), water = new Color('#628299');
for (let row = 0; row < rows; row++) {
  for (let col = 0; col < columns; col++) {
    const east = col * step, north = row * step;
    const surface = world.surfaceAt(east, north, 0);
    const height = surface?.height ?? groundAt(east, north);
    positions.push(east, height, -north);
    const shade = surface?.kind === 'ice' ? ice : surface?.kind === 'water' ? water : frost;
    colors.push(shade.r, shade.g, shade.b);
    if (row + 1 < rows && col + 1 < columns) {
      const index = row * columns + col;
      indices.push(index, index + 1, index + columns, index + 1, index + columns + 1, index + columns);
    }
  }
}
const terrain = new BufferGeometry();
terrain.setAttribute('position', new Float32BufferAttribute(positions, 3));
terrain.setAttribute('color', new Float32BufferAttribute(colors, 3));
terrain.setIndex(indices);
terrain.computeVertexNormals();
scene.add(new Mesh(terrain, new MeshLambertMaterial({ vertexColors: true })));
const site = mountStarportFlightSite(scene, { assemblyHandoff });
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
document.querySelector('#scene')!.append(renderer.domElement);
const camera = new PerspectiveCamera(64, 1, .07, 1_800);
const proofStepMs = 100;
const proofWalkStepMs = 25;
// The review has no live town host. This one-night schedule belongs only to the evidence fixture.
const reviewNightSchedule: TownNightSchedule = { duskAt: 360_000, beaconAt: 420_000,
  cueExpiresAt: 422_000, morningBellAt: 600_000 };
let reviewNightNow = 0;
let trustedGateChecks = 0;
const nightWindow = createTownNightWindow({ now: () => scheduledProof ? reviewNightNow : Date.now(),
  scheduleAt: () => scheduledProof ? reviewNightSchedule : undefined });
const nightRing = assemblyHandoff ? undefined : mountStarportNightRing(site.group, starportFlightSite.door);
const status = document.querySelector<HTMLElement>('#status')!;
const reading = document.querySelector<HTMLOutputElement>('#reading')!;
const aircraftControls = document.querySelector<HTMLDivElement>('#aircraft-controls')!;
const groundControls = document.querySelector<HTMLElement>('#ground-controls')!;
const assemblyAim = document.querySelector<HTMLElement>('#assembly-aim')!;
const assemblyAction = document.querySelector<HTMLElement>('#assembly-action')!;
let fuelDisplay: ReturnType<typeof mountFlightFuelDisplay> | undefined;
let fullPowerScaleMs = flightFuelCanFullPowerMs;
const held = new Set<string>();
const keys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyF', 'KeyQ', 'ArrowLeft', 'ArrowRight', 'Digit1', 'Digit2', 'Digit3']);
if (assemblyHandoff) {
  keys.add('ArrowUp');
  keys.add('ArrowDown');
  groundControls.textContent = 'WASD 移动，方向键转动视角。对准槽位或面板按 E 装件、点火。';
  status.textContent = '走近装配架，依次装入三件。';
}
const runway = starportFlightSite.runway;
const runwaySurvey = surveyAircraftRunway(runway, world);
const operations = mountStarportFieldReview(scene, fieldWorld, runwaySurvey.heading);
let engine = createFlightThrust(fuelSecondsPerStardustOre);
const flight = createAircraftFlight({ ...world,
  recoveryAt: from => operations.sites.nearest('skyline-review', from)?.pad,
}, { step: (...input) => engine.step(...input), snapshot: () => engine.snapshot() });
const unavailable = () => ['airborne', 'rolling', 'sliding', 'recovering'].includes(flight.snapshot()?.phase ?? '');
const distance = (a: AircraftPoint, b: AircraftPoint) => Math.hypot(a.east - b.east, a.north - b.north, a.height - b.height);
let loadout: AircraftLoadout = { snowWingClaimed: true, boosterOwned: true, aircraftAssembled: false };
let feet = { ...starportFlightSite.assembly, north: 671.2 };
let heading = 0;
let pitch = 0;
const assembly = assemblyHandoff ? mountStarportFlightAssembly(site.group, starportFlightSite.assembly,
  () => feet, () => nightWindow.snapshot().layersOverlap) : undefined;
let throttle: AircraftThrottle = 'off';
let lockResult = 'idle';
let fuelRevision = 0;
let ore = 2;
let checklist: ReturnType<typeof operations.route.prepare> | undefined;
let circuitElapsedMs = 0;
const refuelArea = 'starport-review';
const fuel = createStarportFuelDispenser({ area: refuelArea, point: operations.dispenser }, {
  foot: () => ({ area: refuelArea, at: feet, grounded: !unavailable() }),
  profile: () => ({ assembled: loadout.aircraftAssembled, revision: fuelRevision,
    stardustOre: ore, fuelSeconds: engine.snapshot().fuelSeconds }),
  commit(_player, revision, replacement) {
    if (revision !== fuelRevision) return false;
    engine = createFlightThrust(replacement.fuelSeconds);
    fuelRevision = replacement.revision;
    ore = replacement.stardustOre;
    return true;
  },
});

function prepareFlightFuelDisplay() {
  const { fuelSeconds, throttle } = engine.snapshot();
  const remainingFullPowerMs = fuelSeconds * 1_000;
  const scale = Math.max(fullPowerScaleMs, remainingFullPowerMs);
  if (fuelDisplay && scale === fullPowerScaleMs) return;
  // Keep a stable reference for the current charge and any later partial refill.
  fullPowerScaleMs = scale;
  fuelDisplay?.dispose();
  fuelDisplay = mountFlightFuelDisplay(aircraftControls, { remainingFullPowerMs, throttle }, scale);
}

const assemblyStatus: Record<string, string> = {
  placed: '零件已装入架体。', 'already-installed': '零件已经安装。',
  incomplete: '三件装齐后才能点火。', 'missing-key': '点火需要讲古钥一。',
  'window-closed': '等待第十三声首分钟。', 'out-of-reach': '往装配架靠近一点。',
  ignited: '点火完成。前往铜色跑道起线。', 'already-ignited': '飞行器已点火。前往跑道起线。',
};
const assemblyLabels = {
  'snow-wing': '雪翼槽', booster: '助推器槽', 'navigation-core': '导航芯槽', ignition: '点火',
};

function interact(trustedKey: boolean) {
  if (flight.skipRecovery() || unavailable()) return;
  if (assembly && assembly.aim(heading, pitch)) {
    void assembly.interact(heading, pitch).then(result => {
      if (result.kind === 'ignited' || result.kind === 'already-ignited') {
        loadout = { ...loadout, aircraftAssembled: result.state.ignited };
        groundControls.textContent = '沿平台走到跑道起线，E 起飞，F 补给，Q 检查试飞。';
      }
      status.textContent = assemblyStatus[result.kind] ?? '对准零件槽或点火面板。';
      renderFrame();
    });
  } else if (!assembly && distance(feet, starportFlightSite.assembly) <= 1.65) {
    const result = assembleAircraftAtStarport(loadout, 'starport-assembly-pad', feet, starportFlightSite.assembly);
    if (!result.ok) { status.textContent = '靠近合体台。'; return; }
    loadout = result.loadout;
    site.craft.visible = true;
    status.textContent = '合体完成。前往铜色跑道起线。';
  } else if (!assembly && distance(feet, starportFlightSite.door) <= 1.6) {
    if (nightProof && trustedKey) trustedGateChecks++;
    const travel = resolveOrbitalGateTravel({ gate: 'starport', direction: 'enter' }, { site: 'starport',
      pose: { ...feet, yaw: heading } }, {
      isOpen: () => aircraftChapterGateOpen, isAtOpening: () => true,
      landingAt: () => undefined, isLegalLanding: () => false,
    });
    lockResult = travel.ok ? 'open' : travel.reason;
    status.textContent = '已锁定。';
  } else if (distance(feet, runway.start) <= 1.4) {
    if (flight.launchRunway(loadout.aircraftAssembled, feet, runway)) {
      site.craft.visible = true;
      prepareFlightFuelDisplay();
      throttle = 'full';
      status.textContent = '滑跑。';
    } else status.textContent = '检查合体、起线与跑道净空。';
  }
}

window.addEventListener('keydown', event => {
  if (!keys.has(event.code)) return;
  event.preventDefault();
  held.add(event.code);
  if (event.repeat) return;
  if (event.code === 'KeyE') interact(event.isTrusted);
  if (event.code === 'KeyF') {
    const available = fuel.inspect(1);
    if (available && fuel.refill(1, available.revision)) status.textContent = '补给完成。';
  }
  if (event.code === 'KeyQ' && !unavailable() && distance(feet, runway.start) <= 2) {
    checklist = operations.route.prepare({ assembled: loadout.aircraftAssembled,
      fuelSeconds: engine.snapshot().fuelSeconds, clearAirspace: runwaySurvey.ok });
    status.textContent = Object.entries(checklist).map(([label, ready]) => `${label} ${ready ? '就绪' : '待查'}`).join(' · ');
  }
  if (event.code === 'Digit1') throttle = 'off';
  if (event.code === 'Digit2') throttle = 'cruise';
  if (event.code === 'Digit3') throttle = 'full';
});
window.addEventListener('keyup', event => held.delete(event.code));
window.addEventListener('blur', () => held.clear());

function walk(dt: number) {
  heading += (Number(held.has('ArrowRight')) - Number(held.has('ArrowLeft'))) * dt * 1.8;
  if (assemblyHandoff) pitch = Math.max(-1.28, Math.min(1.28,
    pitch + (Number(held.has('ArrowUp')) - Number(held.has('ArrowDown'))) * dt * 1.6));
  const front = Number(held.has('KeyW')) - Number(held.has('KeyS'));
  const side = Number(held.has('KeyD')) - Number(held.has('KeyA'));
  const stride = 5.5 * dt / Math.max(1, Math.hypot(front, side));
  const east = feet.east + (Math.sin(heading) * front + Math.cos(heading) * side) * stride;
  const north = feet.north + (Math.cos(heading) * front - Math.sin(heading) * side) * stride;
  const terrain = world.surfaceAt(east, north, heading);
  if (!terrain || terrain.kind === 'water' || Math.abs(terrain.height - feet.height) > .43) return;
  const next = { east, north, height: terrain.height };
  if (!world.sweep(feet, next, .18)) feet = next;
}

let lastPhase = '';
const phases = new Set<string>();
function advanceFrame(dt: number, clockRate = 1) {
  const air = unavailable() ? flight.advance(dt * clockRate, { throttle,
    pitch: Number(held.has('KeyS')) - Number(held.has('KeyW')),
    turn: Number(held.has('KeyD')) - Number(held.has('KeyA')),
  }) : undefined;
  if (air) {
    feet = { ...air.point };
    heading = air.heading;
    if (air.phase !== lastPhase) {
      lastPhase = air.phase;
      phases.add(air.phase);
      if (air.phase === 'airborne') status.textContent = '已离地。';
      if (air.phase === 'recovering') status.textContent = '安全回收。按 E 起身。';
      if (air.phase === 'landed') status.textContent = '已落地。';
    }
    if (air.usesBothHands) {
      site.craft.position.set(feet.east + Math.sin(heading) * 2.2, feet.height + .88,
        -feet.north - Math.cos(heading) * 2.2);
      site.craft.rotation.set(0, Math.PI - heading, -air.bank);
    }
  } else walk(dt);
  circuitElapsedMs += dt * clockRate * 1_000;
  if (dt > 0) operations.route.update({ at: feet, airborne: air?.phase === 'airborne', elapsedMs: circuitElapsedMs,
    recovered: air?.phase === 'recovering' });
}

function renderFrame() {
  operations.syncMarkers();
  nightRing?.apply(nightWindow.snapshot());
  const air = flight.snapshot();
  const bodyY = feet.height + 1.58;
  camera.position.set(feet.east, bodyY, -feet.north);
  const lookHeight = air?.usesBothHands ? -.7 : assemblyHandoff ? Math.tan(pitch) * 15 : -.25;
  camera.lookAt(feet.east + Math.sin(heading) * 15, bodyY + lookHeight,
    -feet.north - Math.cos(heading) * 15);
  if (assembly) {
    const target = !unavailable() && assembly.aim(heading, pitch);
    assemblyAim.hidden = unavailable();
    assemblyAction.hidden = !target;
    assemblyAction.textContent = target ? `E · ${assemblyLabels[target]}` : '';
  }
  reading.value = `E ${feet.east.toFixed(1)} · N ${feet.north.toFixed(1)} · ${feet.height.toFixed(1)} m · ${(air?.speed ?? 0).toFixed(1)} m/s`;
  aircraftControls.hidden = !air?.usesBothHands;
  if (air?.usesBothHands) {
    reading.value += ` · ${flightAirspaceAt(feet.height).band}`;
    const { fuelSeconds, throttle } = engine.snapshot();
    fuelDisplay?.update({ remainingFullPowerMs: fuelSeconds * 1_000, throttle });
  }
  const circuit = operations.route.snapshot();
  if (circuit.stage === 'airborne' || circuit.stage === 'complete') {
    reading.value += ` · 航门 ${circuit.nextGate}/${operations.route.gates.length}`;
  }
  if (circuit.durationMs !== undefined) reading.value += ` · ${(circuit.durationMs / 1_000).toFixed(2)} s`;
  renderer.render(scene, camera);
}
function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / Math.max(1, innerHeight);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
if (fixedClock) renderFrame();
else {
  let previous = performance.now();
  renderer.setAnimationLoop(now => {
    const dt = Math.max(0, Math.min(.07, (now - previous) / 1_000));
    previous = now;
    const clockRate = proofMode !== null && flight.snapshot()?.phase === 'airborne' ? 8 : 1;
    advanceFrame(dt, clockRate);
    renderFrame();
  });
}

if (proofMode !== null) {
  const readProof = () => ({ feet: { ...feet }, loadout, runway, runwaySurvey, lockResult,
    flight: flight.snapshot(), phases: [...phases], drawCalls: renderer.info.render.calls,
    emergencySites: operations.sites.sites().map(({ id }) => id), checklist, circuit: operations.route.snapshot(),
    gates: operations.route.gates, fuel: { seconds: engine.snapshot().fuelSeconds, ore, revision: fuelRevision },
    ...(assembly && { heading, pitch, assembly: { ...assembly.snapshot(), aimed: assembly.aim(heading, pitch) } }) });
  Object.assign(window, { starportFlightProof: readProof });
  if (fixedClock) {
    // The verifier controls only time. Every step reads the normal browser key handlers.
    Object.assign(window, {
      starportFlightPaint: renderFrame,
      starportFlightStep() {
        advanceFrame((unavailable() ? proofStepMs : proofWalkStepMs) / 1_000);
        return readProof();
      },
    });
  }
  if (scheduledProof) {
    Object.assign(window, {
      starportNightProof: () => ({ now: reviewNightNow, schedule: reviewNightSchedule,
        state: nightWindow.snapshot(), ring: nightRing?.snapshot(), trustedGateChecks, lockResult,
        feet: { ...feet }, door: starportFlightSite.door }),
      starportNightClock(now: number) { reviewNightNow = now; renderFrame(); },
      starportNightBeacon(at: number) {
        const receipt = nightWindow.recordBeacon(at);
        renderFrame();
        return receipt;
      },
    });
  }
  if (assembly) Object.assign(window, { starportAssemblyKeyOne: () => assembly.grantKeyOne() });
}

if (assembly) window.addEventListener('pagehide', event => {
  if (!event.persisted) assembly.dispose();
});
