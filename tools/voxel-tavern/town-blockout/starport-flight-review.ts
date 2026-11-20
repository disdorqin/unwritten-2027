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
import { createStarportReviewWorld, mountStarportFlightSite, starportFlightSite } from './starport-flight-site';
import { mountStarportFieldReview } from './starport-field-review';
import { northRidgeFrame } from './north-ridge-350-terrain';

const scene = new Scene();
scene.background = new Color('#afc5df');
scene.fog = new Fog('#afc5df', 80, 1_600);
scene.add(new AmbientLight('#d6e5f5', 1.7));
const sun = new DirectionalLight('#fff1dc', 2.1);
sun.position.set(-32, 68, 21);
scene.add(sun);

const fieldWorld = createStarportReviewWorld();
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
const site = mountStarportFlightSite(scene);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
document.querySelector('#scene')!.append(renderer.domElement);
const camera = new PerspectiveCamera(64, 1, .07, 1_800);
const proof = new URLSearchParams(location.search).has('proof');
const status = document.querySelector<HTMLElement>('#status')!;
const reading = document.querySelector<HTMLOutputElement>('#reading')!;
const held = new Set<string>();
const keys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyF', 'KeyQ', 'ArrowLeft', 'ArrowRight', 'Digit1', 'Digit2', 'Digit3']);
const runway = starportFlightSite.runway;
const runwaySurvey = surveyAircraftRunway(runway, world);
const operations = mountStarportFieldReview(scene, fieldWorld, runwaySurvey.heading);
let engine = createFlightThrust(fuelSecondsPerStardustOre);
const flight = createAircraftFlight(world, { step: (...input) => engine.step(...input), snapshot: () => engine.snapshot() });
const unavailable = () => ['airborne', 'rolling', 'sliding', 'recovering'].includes(flight.snapshot()?.phase ?? '');
const distance = (a: AircraftPoint, b: AircraftPoint) => Math.hypot(a.east - b.east, a.north - b.north, a.height - b.height);
let loadout: AircraftLoadout = { snowWingClaimed: true, boosterOwned: true, aircraftAssembled: false };
let feet = { ...starportFlightSite.assembly, north: 671.2 };
let heading = 0;
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

function interact() {
  if (flight.skipRecovery() || unavailable()) return;
  if (distance(feet, starportFlightSite.assembly) <= 1.65) {
    const result = assembleAircraftAtStarport(loadout, 'starport-assembly-pad', feet, starportFlightSite.assembly);
    if (!result.ok) { status.textContent = '靠近合体台。'; return; }
    loadout = result.loadout;
    site.craft.visible = true;
    status.textContent = '合体完成。前往铜色跑道起线。';
  } else if (distance(feet, starportFlightSite.door) <= 1.6) {
    const travel = resolveOrbitalGateTravel({ gate: 'starport', direction: 'enter' }, { site: 'starport',
      pose: { ...feet, yaw: heading } }, {
      isOpen: () => aircraftChapterGateOpen, isAtOpening: () => true,
      landingAt: () => undefined, isLegalLanding: () => false,
    });
    lockResult = travel.ok ? 'open' : travel.reason;
    status.textContent = '已锁定。';
  } else if (distance(feet, runway.start) <= 1.4) {
    if (flight.launchRunway(loadout.aircraftAssembled, feet, runway)) {
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
  if (event.code === 'KeyE') interact();
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
let previous = performance.now();
function render(now: number) {
  const dt = Math.max(0, Math.min(.07, (now - previous) / 1_000));
  previous = now;
  const clockRate = proof && flight.snapshot()?.phase === 'airborne' ? 8 : 1;
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
  if (dt > 0) operations.route.update({ at: feet, airborne: air?.phase === 'airborne', elapsedMs: circuitElapsedMs });
  operations.syncMarkers();
  const bodyY = feet.height + 1.58;
  camera.position.set(feet.east, bodyY, -feet.north);
  camera.lookAt(feet.east + Math.sin(heading) * 15, bodyY + (air?.usesBothHands ? -.7 : -.25),
    -feet.north - Math.cos(heading) * 15);
  const telemetry = flight.snapshot();
  reading.value = `E ${feet.east.toFixed(1)} · N ${feet.north.toFixed(1)} · ${feet.height.toFixed(1)} m · ${(telemetry?.speed ?? 0).toFixed(1)} m/s`;
  if (air?.usesBothHands) reading.value += ` · ${flightAirspaceAt(feet.height).band} · 燃料 ${Math.ceil(engine.snapshot().fuelSeconds)} s`;
  const circuit = operations.route.snapshot();
  if (circuit.stage === 'airborne') reading.value += ` · 航门 ${circuit.nextGate}/${operations.route.gates.length}`;
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
renderer.setAnimationLoop(render);

if (proof) {
  Object.assign(window, { starportFlightProof: () => ({ feet: { ...feet }, loadout, runwaySurvey, lockResult,
    flight: flight.snapshot(), phases: [...phases], drawCalls: renderer.info.render.calls,
    emergencySites: operations.sites.sites().map(({ id }) => id), checklist, circuit: operations.route.snapshot(),
    fuel: { seconds: engine.snapshot().fuelSeconds, ore, revision: fuelRevision } }) });
}
