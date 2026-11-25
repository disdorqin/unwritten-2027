import {
  AmbientLight, BufferAttribute, BufferGeometry, Color, DirectionalLight, DoubleSide,
  FogExp2, Group, Mesh, MeshLambertMaterial, PerspectiveCamera,
  PointLight, Scene, Vector3, WebGLRenderer,
} from 'three';
import { createUndergroundMineLayout } from '../../src/shared/underground-mine-layout.js';
import { undergroundMineSpec } from './underground-first-mine-survey-spec.js';
import { createTerrainGrid, worldBounds } from '../voxel-tavern/town-blockout/terrain.js';
import { mountWestCraterRoad } from '../voxel-tavern/town-blockout/town-za22-crater-road.js';
import {
  createCraterBrokenCircleHeightField, craterBrokenCircleSpec,
} from '../voxel-tavern/town-blockout/town-c2-crater-broken-circle.js';
import {
  c2CraterMoltenBeadsPlan,
} from '../voxel-tavern/town-blockout/town-c2-crater-molten-beads.js';
import { createMeteorCrater, meteorCraterFixturePlan, meteorCraterRimRadius } from
  '../voxel-tavern/town-blockout/meteor-crater.js';
import { mountTownC2UndergroundWaterMinus90 } from
  '../voxel-tavern/town-blockout/town-c2-underground-water-minus90.js';

// Independent offline C2-01..06 review. It mounts the real modules but is not a
// production world, movement host, water authority, multiplayer session or art sign-off.
const mode = new URLSearchParams(location.search).get('mode') === 'underground' ? 'underground' : 'crater';
const fixtureHighWaterOffsetM = 1;
const fixtureOreVisuals = [
  { id: 'fixture/underwater', kind: 'underwater' as const, at: [0, -91, 2] as const },
  { id: 'fixture/riverbed', kind: 'riverbed' as const, at: [0, -90.2, 10] as const, normal: [0, 1, 0] as const },
];
const eyeHeight = 1.67;
const crouchEyeHeight = 1.2;
const walkerRadius = undergroundMineSpec.walker.radius;
const standingHeight = undergroundMineSpec.walker.standingHeight;
const walkSpeed = 2.6;
const scene = new Scene();
const camera = new PerspectiveCamera(68, innerWidth / innerHeight, .06, mode === 'crater' ? 320 : 80);
const renderer = new WebGLRenderer({ antialias: false, powerPreference: 'low-power' });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.domElement.setAttribute('name', 'town-c2-first-person-review');
document.body.append(renderer.domElement);
const ambient = new AmbientLight(0xaebdca, 1.05);
const sun = new DirectionalLight(0xf4e3cf, 2.2);
sun.position.set(-45, 70, 30);
const headlamp = new PointLight(0xe7d9c7, 0, 20, 2);
camera.add(headlamp);
scene.add(ambient, sun, camera);

type Collider = Readonly<{ min: readonly number[]; max: readonly number[] }>;
type ViewSpec = Readonly<{
  eye: readonly [number, number];
  target: readonly [number, number, number];
  targetUp?: number;
}>;
type ReviewStats = Record<string, unknown>;

let road: ReturnType<typeof mountWestCraterRoad> | undefined;
let neutralCrater: ReturnType<typeof createMeteorCrater> | undefined;
let mine: ReturnType<typeof createUndergroundMineLayout> | undefined;
let water: ReturnType<typeof mountTownC2UndergroundWaterMinus90> | undefined;
let waterMesh: Mesh | undefined;
const views: Record<string, ViewSpec> = {};
let view = '';
let night = false;
let waterLevel: 'high' | 'mid' | 'low' = 'mid';
let frames = 0;
let fpsStart = performance.now();
let walked = 0;
let rejected = 0;
let collisionChecks = 0;
let trustedW = 0;
let placementAdjustmentM = 0;
let crouchObserved = false;
const keys = new Set<string>();
const direction = new Vector3();

function craterBlocked(east: number, north: number, floor: number, radius = walkerRadius) {
  collisionChecks++;
  if (road!.fenceBlocks(east, north, floor + standingHeight, radius)) return true;
  const bottom = floor + .05, top = floor + standingHeight;
  const z = -north;
  return (road!.group.userData.colliders as Collider[]).some(box => {
    const dx = Math.max(box.min[0]! - east, 0, east - box.max[0]!);
    const dz = Math.max(box.min[2]! - z, 0, z - box.max[2]!);
    return dx * dx + dz * dz < radius * radius && box.min[1]! < top && box.max[1]! > bottom;
  });
}

if (mode === 'crater') {
  const terrain = createTerrainGrid();
  road = mountWestCraterRoad(worldBounds.depth, north => terrain.groundHeightAt(0, north));
  neutralCrater = createMeteorCrater(meteorCraterFixturePlan);
  scene.add(road.group);
  scene.background = new Color(0x283746);
  scene.fog = new FogExp2(0x283746, .0045);
  const field = createCraterBrokenCircleHeightField(road.anchor);
  const radial = (bearingDeg: number, radius: number) => {
    const angle = bearingDeg * Math.PI / 180;
    return field.toWorld({ east: radius * Math.sin(angle), north: radius * Math.cos(angle) });
  };
  const addGround = (name: string, eye: readonly [number, number],
    target: readonly [number, number], up = 1.2) => {
    views[name] = { eye, target: [target[0], 0, -target[1]], targetUp: up };
  };
  const mound = road.centralMound.model.settings;
  addGround('crater/central-mound', [mound.workFace.east, mound.workFace.north],
    [mound.center.east, mound.center.north], 4.3);
  const collapseEye = radial(craterBrokenCircleSpec.collapseBearings[0]!, 16);
  const collapseTarget = radial(craterBrokenCircleSpec.collapseBearings[0]!, 47);
  addGround('crater/collapse-fan', [collapseEye.east, collapseEye.north],
    [collapseTarget.east, collapseTarget.north], 1.1);
  const gullyEye = radial(craterBrokenCircleSpec.gullyBearings[0]!, 16);
  const gullyTarget = radial(craterBrokenCircleSpec.gullyBearings[0]!, 44);
  addGround('crater/gully', [gullyEye.east, gullyEye.north],
    [gullyTarget.east, gullyTarget.north], .7);
  const bead = road.moltenBeads.firstPickupHostMarker;
  addGround('crater/molten-near', [bead.east, bead.north - .7],
    [bead.east, bead.north], .08);
  const beadDx = c2CraterMoltenBeadsPlan.east - road.anchor.east;
  const beadDn = c2CraterMoltenBeadsPlan.north - road.anchor.north;
  const beadBearing = Math.atan2(beadDx, beadDn) * 180 / Math.PI;
  const rimGuardEye = radial(beadBearing, meteorCraterRimRadius + .1);
  addGround('crater/molten-rim-invisible', [rimGuardEye.east, rimGuardEye.north],
    [c2CraterMoltenBeadsPlan.east, c2CraterMoltenBeadsPlan.north], .1);
  const inscription = road.inscription.layout;
  addGround('crater/inscription', [inscription.useFoot.east, inscription.useFoot.north],
    [inscription.stone.east, inscription.stone.north], inscription.stone.height + .3 - inscription.useFoot.height);
  const lampRoom = road.lampRoom?.site;
  if (lampRoom) {
    const c = Math.cos(road.anchor.yaw), s = Math.sin(road.anchor.yaw);
    const door = { east: lampRoom.east + 2.3 * c + .65 * s, north: lampRoom.north + .65 * c - 2.3 * s };
    const eye = { east: lampRoom.east + 6 * c + .65 * s, north: lampRoom.north + .65 * c - 6 * s };
    addGround('crater/lamp-room', [eye.east, eye.north], [door.east, door.north], 1.2);
  }
  const wellhead = road.warmLightChain.data.nodes.find(node => node.role === 'wellhead')!;
  views['crater/warm-chain-night'] = {
    eye: [mound.workFace.east, mound.workFace.north],
    target: [wellhead.east, wellhead.bulbHeight, -wellhead.north],
  };
  // A real surveyed trail segment, clear of the lip fence and machine boxes.
  const trailFixture = createMeteorCrater(meteorCraterFixturePlan);
  const trailStartLocal = trailFixture.mainTrailPoint(.055);
  const trailTargetLocal = trailFixture.mainTrailPoint(.085);
  const trailStart = road.centralMound.model.localToWorld(trailStartLocal.east, trailStartLocal.north);
  const trailTarget = road.centralMound.model.localToWorld(trailTargetLocal.east, trailTargetLocal.north);
  addGround('crater/trail-walk', [trailStart.east, trailStart.north],
    [trailTarget.east, trailTarget.north], 1.4);
} else {
  mine = createUndergroundMineLayout(undergroundMineSpec);
  const root = new Group();
  root.name = 'real-underground-mine-layout';
  root.position.y = 0;
  scene.add(root);
  scene.background = new Color(0x111820);
  scene.fog = new FogExp2(0x111820, .028);
  for (const [surface, vertices] of Object.entries(mine.mesh)) {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    const material = new MeshLambertMaterial({
      side: DoubleSide,
      color: surface === 'water' ? 0x29445b : surface === 'rail' ? 0x77695b : 0x544f49,
    });
    const mesh = new Mesh(geometry, material);
    mesh.name = 'underground-mine-' + surface;
    root.add(mesh);
    if (surface === 'water') waterMesh = mesh;
  }
  water = mountTownC2UndergroundWaterMinus90({
    parent: root, mine, waterMesh: waterMesh!, highWaterOffsetM: fixtureHighWaterOffsetM,
    oreVisuals: fixtureOreVisuals,
  });
  const landing = mine.anchors.poolLanding;
  views['underground/high'] = {
    eye: [landing[0], landing[2]], target: [0, -89.05, 7],
  };
  views['underground/mid'] = {
    eye: [landing[0], landing[2]], target: [0, -89.95, 7],
  };
  views['underground/low'] = {
    eye: [landing[0], landing[2]], target: [0, -90.05, 9],
  };
  views['underground/gallery-walk'] = {
    eye: [0, 18], target: [0, -90.7, 25],
  };
  const routeStart = mine.route[0]!.from;
  views['underground/route-start'] = {
    eye: [routeStart[0], routeStart[2]], target: [0, -90.7, 25],
  };
}

function mineStance(z: number) {
  const [start, end] = mine!.crouchInterval;
  const crouching = z >= start && z <= end;
  if (crouching) crouchObserved = true;
  return {
    crouching,
    bodyHeight: crouching ? undergroundMineSpec.walker.crouchingHeight : undergroundMineSpec.walker.standingHeight,
    eyeHeight: crouching ? crouchEyeHeight : eyeHeight,
  };
}

function setNight(value: boolean) {
  if (typeof value !== 'boolean') return false;
  night = value;
  ambient.intensity = night ? .34 : mode === 'crater' ? 1.05 : .68;
  sun.intensity = night ? .12 : mode === 'crater' ? 2.2 : .55;
  headlamp.intensity = night ? 5 : 0;
  const background = night ? 0x0d1522 : mode === 'crater' ? 0x283746 : 0x111820;
  scene.background = new Color(background);
  scene.fog = new FogExp2(background, night ? .007 : mode === 'crater' ? .0045 : .028);
  road?.craterActions.setNight(night);
  return true;
}

function setWater(level: 'high' | 'mid' | 'low') {
  if (mode !== 'underground' || !water || !['high', 'mid', 'low'].includes(level)) return false;
  waterLevel = level;
  water.setLevel(level);
  return true;
}

function nearestCraterFoot(requested: readonly [number, number]) {
  const [east, north] = requested;
  const floor = road!.heightAt(east, north);
  if (floor !== undefined && Number.isFinite(floor) && !craterBlocked(east, north, floor)) {
    return { east, north, floor, adjustment: 0 };
  }
  for (let radius = .35; radius <= 2.05; radius += .35) {
    for (let index = 0; index < 16; index++) {
      const angle = index * Math.PI / 8;
      const e = east + Math.cos(angle) * radius, n = north + Math.sin(angle) * radius;
      const f = road!.heightAt(e, n);
      if (f !== undefined && Number.isFinite(f) && !craterBlocked(e, n, f)) {
        return { east: e, north: n, floor: f, adjustment: radius };
      }
    }
  }
}

function setView(name: string) {
  const spec = views[name];
  if (!spec || (mode === 'crater' && !name.startsWith('crater/')) ||
      (mode === 'underground' && !name.startsWith('underground/'))) return false;
  if (mode === 'crater') {
    const foot = nearestCraterFoot(spec.eye);
    if (!foot) return false;
    camera.position.set(foot.east, foot.floor + eyeHeight, -foot.north);
    placementAdjustmentM = foot.adjustment;
    const target = spec.target as readonly [number, number, number];
    const targetFloor = road!.heightAt(target[0], -target[2]);
    const targetY = spec.targetUp !== undefined
      ? (targetFloor ?? foot.floor) + spec.targetUp
      : target[1];
    camera.lookAt(target[0], targetY, target[2]);
  } else {
    const [x, z] = spec.eye;
    const stance = mineStance(z);
    const passage = mine!.queryPassage(x, z, walkerRadius, stance.bodyHeight, 'open');
    if (!passage) return false;
    collisionChecks++;
    camera.position.set(x, passage.floor + stance.eyeHeight, z);
    camera.lookAt(...spec.target);
    placementAdjustmentM = 0;
  }
  camera.updateMatrixWorld(true);
  view = name;
  return true;
}

function step(seconds: number) {
  if (!keys.has('w') || !Number.isFinite(seconds) || seconds <= 0 || seconds > 3) return false;
  camera.updateMatrixWorld(true);
  camera.getWorldDirection(direction);
  direction.y = 0;
  direction.normalize();
  const distance = seconds * walkSpeed, count = Math.ceil(distance / .08);
  for (let index = 0; index < count; index++) {
    const delta = distance / count;
    const x = camera.position.x + direction.x * delta;
    const z = camera.position.z + direction.z * delta;
    if (mode === 'crater') {
      const east = x, north = -z, floor = road!.heightAt(east, north);
      if (floor === undefined || !Number.isFinite(floor) || craterBlocked(east, north, floor)) {
        rejected++;
        return false;
      }
      camera.position.set(x, floor + eyeHeight, z);
    } else {
      const stance = mineStance(z);
      const passage = mine!.queryPassage(x, z, walkerRadius, stance.bodyHeight, 'open');
      if (!passage) {
        collisionChecks++;
        rejected++;
        return false;
      }
      collisionChecks++;
      camera.position.set(x, passage.floor + stance.eyeHeight, z);
    }
    walked += delta;
  }
  return true;
}

addEventListener('keydown', event => {
  if (event.key.toLowerCase() === 'w') {
    keys.add('w');
    if (event.isTrusted) trustedW++;
    event.preventDefault();
  }
});
addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

function inspect(): ReviewStats {
  const cameraRadius = road ? Math.hypot(camera.position.x - road.anchor.east,
    camera.position.z + road.anchor.north) : undefined;
  const common = {
    mode, view, night, frames,
    fps: frames * 1000 / Math.max(1, performance.now() - fpsStart),
    eye: camera.position.toArray(), firstPersonEyeHeight: eyeHeight, walkSpeed,
    walked, rejected, collisionChecks, trustedW, placementAdjustmentM,
    render: { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles },
    pointerLock: document.pointerLockElement === null,
    fixtureOnly: true,
    productionCertified: false,
  };
  if (mode === 'crater' && road) {
    return {
      ...common,
      crater: {
        anchor: road.anchor,
        colliderCount: (road.group.userData.colliders as unknown[]).length,
        mounted: {
          centralMound: road.centralMound.group.parent === road.group,
          brokenCircle: road.brokenCircle.group.parent === road.group,
          moltenBeads: road.moltenBeads.group.parent === road.group,
          inscription: road.inscription.group.parent === road.group,
          warmLightChain: road.warmLightChain.group.parent === road.group,
        },
        centralMound: road.centralMound.stats,
        lampRoomRiseM: (() => {
          const lamp = road.lampRoom?.site;
          if (!lamp || !neutralCrater) return undefined;
          const local = road.centralMound.model.worldToLocal(lamp.east, lamp.north);
          return lamp.height - (road.anchor.rimHeight + neutralCrater.heightOffsetAt(local.east, local.north)!);
        })(),
        brokenCircle: { featureCount: road.brokenCircle.features.length },
        moltenBeads: road.moltenBeads.stats,
        moltenInsideRimGuard: cameraRadius! < meteorCraterRimRadius - c2CraterMoltenBeadsPlan.rimGuardInset,
        inscription: road.inscription.stats,
        warmLightChain: {
          lampCount: road.warmLightChain.data.lampCount,
          isNightLit: road.warmLightChain.isNightLit,
          activeLightCount: road.warmLightChain.lights.filter(light => light.visible).length,
        },
      },
    };
  }
  return {
    ...common,
    underground: {
      mineDepth: -90,
      water: water!.stats(),
      waterLevel,
      fixtureHighWaterOffsetM,
      highWaterOffsetAuthority: 'fixture-only; not a production-certified host value',
      waterCollisionAuthority: 'none; step uses mine.queryPassage at every substep',
      crouching: mineStance(camera.position.z).crouching,
      crouchObserved,
      route: mine!.route.map(item => item.zone),
      routePoints: mine!.route,
    },
  };
}

setNight(false);
if (mode === 'underground') setWater('mid');
if (!setView(mode === 'crater' ? 'crater/central-mound' : 'underground/mid')) {
  throw new Error('C2 review initial standing point is blocked');
}
function frame() {
  renderer.render(scene, camera);
  frames++;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

const api = {
  setView,
  setNight,
  setWater,
  faceLocal(east: number, north: number) {
    if (mode !== 'underground' || ![east, north].every(Number.isFinite)) return false;
    camera.lookAt(east, camera.position.y, north);
    camera.updateMatrixWorld(true);
    return true;
  },
  step,
  resetFPS() { frames = 0; fpsStart = performance.now(); },
  resetWalkStats() { walked = 0; rejected = 0; collisionChecks = 0; trustedW = 0; crouchObserved = false; },
  inspect,
};
Object.assign(window, { townC2Review: api });
declare global {
  interface Window { townC2Review: typeof api }
}
