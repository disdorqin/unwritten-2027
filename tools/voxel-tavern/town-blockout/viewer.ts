import {
  AmbientLight, BoxGeometry, BufferAttribute, BufferGeometry, Color, DirectionalLight, Fog, Group,
  InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial, Object3D, PerspectiveCamera, PointLight, Quaternion, Scene, Vector2, Vector3, WebGLRenderer, Frustum, Sphere,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { addScenery } from './scenery';
import { readWalkGeometry, type Box, type Ramp, type TownPlot } from './landmark-kit';
import { buildTowerLandmark, type TowerBellMotion } from './landmark-tower';
import { buildTavernLandmark } from './landmark-tavern';
import type { IceCastleRefinementRuntime } from './ice-castle-refinement';
import type { IcePalaceRace } from './ice-palace-race';
import { buildPostLandmark, setPostOpeningReady } from './landmark-post';
import { buildCultureLandmark } from './landmark-culture';
import { buildMarketLandmark } from './landmark-market';
import { buildIcePlayProps, buildLakesideLandmark } from './landmark-lakeside';
import { buildVillageLandmark, villageHousePortals } from './landmark-village';

import { bridgeAt, canEnter, createTerrainGrid, isWater, layout, waterHeight, worldBounds } from './terrain';
import { addTerrainMeshes } from './terrain-mesh';
import { createTownViewBatches } from './town-view-batches';
import { createTownViewFaces } from './town-view-faces';
import { addDistrictHousing } from './district-layout';
import { sharedHomeLayer } from '../../../src/presence/shared-home-space';
import { buildSharedHome, createSharedHomeSpots, sharedHomeHearthWarmth, sharedHomeSpawn, sharedHomeWalkable } from './landmark-shared-home';
import { type TownHousePortal } from './town-house-portals';
import { addForestDensity } from './forest-density';
import { addStreetscape } from './streetscape';
import { addNewYearDecor } from './town-new-year';
import { createSnowfall } from './snowfall';
import { createFestival, makeTestFireworksTable } from './festival';
import { createTownFireworksActivity } from './town-fireworks-activity';
import {
  ceremonyEveYear, ceremonyMidnight, createCeremonyDirector, createCeremonyOverlay, type CeremonyCue,
} from './town-ceremony';
import { loadRehearsalClock } from './town-rehearsal-clock';
import { ceremonyArrivalAt, type CeremonyArrival } from '../../../src/presence/ceremony-arrival';
import { createCeremonyFrost, hasFrostCeremonyRelief, isExposedSnowAt, type FrostExposure } from './town-frost';
import { campfirePieces, createTownCampfires, findRegionalCampfires } from './town-campfires';
import { createLandingFeedback } from './landing-feedback';
import { createLandingSnow } from './landing-snow';
import { buildMuseumLandmark } from './landmark-museum';
import type { MuseumLight } from './museum-kit';
import { createMuseumVisit } from './museum-visit';
import { createTouchWalk } from './touch-walk';
import { createViewportControls } from './town-viewport';
import { createTouchLook } from './touch-look';
import { setTouchLookSensitivity, touchLookSensitivity } from './touch-look-curve';
import { createDesktopLook, type DesktopLookLockFailure } from './desktop-look';
import { createTownBgm } from './town-bgm';
import { terraceStop } from './museum-terrace';
import { createMuseumInspection } from './museum-inspection';
import { createMuseumLaunch } from './museum-launch';
import { createMuseumGuide } from './museum-guide';
import { museumHorizontalScale } from './museum-scale';
import { nearestTownActivity, type TownActivity, type TownActivityContext, type TownActivitySpot, type TownSeat } from './town-activity';
import { createTavernActivity } from './tavern-activity';
import { createTavernDrinkEffects } from './tavern-drink-effects';
import { createTavernSeatSpots } from './tavern-seats';
import { buildTavernWarmShed, createTavernWarmShedSpots, inTavernWarmShed, nearTavernWarmShedFire } from './tavern-warm-shed';
import './tavern-mix-panel.css';
import { openTavernDice } from './tavern-dice';
import './tavern-drink-effects.css';
import { createPostActivity } from './post-activity';
import { createTownMailActivity, playPostChime } from './town-mail-activity';
import { UNLOCK_AT } from './town-mail-store';
import { createRiddleActivity } from './town-riddle-activity';
import { createStageActivity } from './stage-activity';
import { createMarketActivity } from './market-activity';
import { createMarketFairActivity } from './market-fair';
import { createIceActivity } from './ice-activity';
import { createIceFishingActivity, iceFishingStation } from './ice-fishing-activity';
import { createLakeSkatingActivity } from './lake-skating-activity';
import { isLakeSkateIce, lakeSkateGates, lakeSkateStation } from './lake-skate-course';
import { createLakeSkateMotion } from './lake-skate-motion';
import { createWishActivity } from './wish-activity';
import { createRestActivity } from './town-rest-activity';
import { createHotSpringSoak } from './hot-spring-soak';
import { hotSpringPhotoStand, hotSpringTeaStand } from './hot-spring-details';
import { createWindowActivity } from './town-window';
import { extensionPlots, extensionRoadClearance, extensionStreetClearance } from './town-extension';
import { createTownRailway, type TownRailStopId } from './town-railway';
import { createRailOvernightBroadcast, railOvernightBoardCopy, railPlatformCopy } from './town-rail-copy';
import { addTownRailWayfinding } from './town-rail-wayfinding';
import { createTownNpcActivity } from './town-npc';
import { npcAuthoredDialogue } from './town-npc-dialogue';
import { createTownPresence } from './town-presence';
import { effectiveTownAvatarPose, type TownAvatarPose } from './town-presence-pose';
import { inPlazaPhotoRequestZone } from '../../../src/presence/plaza-photo';
import { createTheaterPhotoCamera } from './theater-photo-camera';
import { createPlazaGroupPhoto } from './plaza-group-photo';
import './plaza-group-photo.css';
import { downloadTownCanvas } from './town-photo-download';
import { createTownPassport } from './town-passport';
import { createZodiacProgress, postMousePosition } from './town-zodiac';
import { createLighthouseSnakeCharm } from './town-zodiac-snake';
import { createRailHorseCharm, railHorseClues } from './town-zodiac-rail';
import { createTavernRoosterCharm, tavernRoosterClues } from './town-zodiac-rooster';
import { createCourtyardSeatSpots, createIceThroneSpots, createRailwayStationSpots, stationTicketStamp } from './landmark-refinement-activity';
import { createTownLights } from './town-lights';
import { createTownWater, shoreJumpDepth } from './town-water';
import { createTownPhysicsClock, townPhysicsDelta } from './town-physics-clock';
import { findNearestLegalSpawn } from './town-spawn';
import { approachTownSnowScale, createTownSnowCover } from './town-snow-cover';
import { advanceWeatherCover, townSnowWeatherForFrame } from './town-weather';
import { createTownSnowballFight, type SnowballState } from './town-snowball';
import { createSnowballSweep } from './town-snowball-world';
import { createSnowPracticeTarget, snowPracticeStand, snowPracticeTarget, type TownSnowballTarget } from './town-snow-target';
import { createTownSnowballBoard } from './town-snowball-board';
import { addTownSnowBoard } from './town-snow-board';
import { createSnowballHitFeedback } from './snowball-hit-feedback';
import './snowball-impact-texture.css';

const element = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id)! as T;
const grid = createTerrainGrid();
const townWater = createTownWater(grid);
const snowCover = createTownSnowCover(grid);
let visualSnowCover = 0;
const scene = new Scene();
scene.background = new Color('#adc2dd');
const weatherFog = new Fog('#adc2dd', 360, 1300);
scene.fog = weatherFog;
const camera = new PerspectiveCamera(58, innerWidth / innerHeight, .1, 1400);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
element('scene').append(renderer.domElement);
renderer.domElement.setAttribute('aria-label', '雪镇建模预览');
renderer.domElement.tabIndex = 0;
const ambient = new AmbientLight('#8aaee5', 1.02);
scene.add(ambient);
const sun = new DirectionalLight('#a9bde9', 1.45);
ambient.layers.enable(sharedHomeLayer);
sun.layers.enable(sharedHomeLayer);
sun.position.set(-90, 150, 60);
scene.add(sun);
const landscape = new Group();
const viewBatches = createTownViewBatches();
const viewFaces = createTownViewFaces();
scene.add(landscape, viewBatches.group);
const presence = createTownPresence(scene, camera, announceActivity, resetMovement);
const plazaCamera = new PerspectiveCamera(60, 16 / 9, camera.near, camera.far);
const plazaCanvasSize = new Vector2();
const railway = createTownRailway(grid, presence.serverNow);
const frontRailStation = railway.stops.find(stop => stop.id === 'railway-station')!;
const previousStationEye = new Vector3();
let stationViewStillSince = Infinity;
const stationCullCamera = new PerspectiveCamera();
const stationSourceProjection = new Matrix4();
const stationCullTurn = .07;

function stationViewCamera() {
  if (stationCullCamera.position.equals(camera.position) && stationSourceProjection.equals(camera.projectionMatrix)
      && stationCullCamera.quaternion.angleTo(camera.quaternion) <= stationCullTurn) return stationCullCamera;
  stationSourceProjection.copy(camera.projectionMatrix);
  stationCullCamera.copy(camera, false);
  const projection = stationSourceProjection.elements;
  const [halfWidth, halfHeight] = [1 / projection[0], 1 / projection[5]];
  // Even a corner ray's unit direction moves by no more than this chord when rotating.
  const guard = 2 * Math.sin(stationCullTurn / 2);
  const cornerDepth = 1 / Math.hypot(halfWidth, halfHeight, 1);
  const depthGuard = guard / cornerDepth;
  stationCullCamera.near = camera.near * (1 - depthGuard);
  stationCullCamera.far = camera.far * (1 + depthGuard);
  stationCullCamera.updateProjectionMatrix();
  const padded = stationCullCamera.projectionMatrix.elements;
  padded[0] = (cornerDepth - guard) / (halfWidth * cornerDepth + guard);
  padded[5] = (cornerDepth - guard) / (halfHeight * cornerDepth + guard);
  stationCullCamera.projectionMatrixInverse.copy(stationCullCamera.projectionMatrix).invert();
  return stationCullCamera;
}
scene.add(railway.group);
const trackViewRoot = railway.group.children.find(group => group.children.some(child => child.name.startsWith('tour-train-track-')));
addTownRailWayfinding(scene, grid.heightAt);
const scenery = addScenery(landscape, grid);
const districts = addDistrictHousing(landscape, grid, scenery.blocked, railway.keepClear);
const streetscape = addStreetscape(landscape, grid, (east, north, radius) =>
  districts.keepClear(east, north, radius) || extensionRoadClearance(east, north, radius));
const forest = addForestDensity(landscape, grid,
  (east, north, radius) => districts.keepClear(east, north, radius) || streetscape.occupied(east, north, radius),
  (east, north, radius) => extensionRoadClearance(east, north, radius) || railway.keepClear(east, north, radius) || extensionStreetClearance(east, north, radius));
const snowfall = createSnowfall(scene);
const snowButton = element<HTMLButtonElement>('snow');
snowButton.onclick = () => {
  snowfall.setEnabled(!snowfall.enabled());
  snowButton.setAttribute('aria-pressed', String(snowfall.enabled()));
};
const timeOfDay = element<HTMLButtonElement>('lighting');
let nightMode = true;
let ceremonyDim = 1;
function applyCeremonyLighting() {
  ambient.intensity = (nightMode ? .96 : 1.35) * ceremonyDim;
  sun.intensity = (nightMode ? 1.23 : 1.7) * ceremonyDim;
}
function setNight(night: boolean) {
  nightMode = night;
  const sky = night ? '#182642' : '#acc2dd';
  (scene.background as Color).set(sky);
  scene.fog!.color.set(sky);
  ambient.color.set(night ? '#83a9e7' : '#e4edff');
  sun.color.set(night ? '#a6c0fd' : '#ffe6c5');
  applyCeremonyLighting();
  timeOfDay.textContent = night ? '雪夜' : '白昼';
  timeOfDay.setAttribute('aria-pressed', String(night));
  scenery.setNight(night);
}
setNight(true);
timeOfDay.onclick = () => setNight(timeOfDay.getAttribute('aria-pressed') !== 'true');

const prepareTerrain = addTerrainMeshes(scene, grid);

const stone = new MeshLambertMaterial({ color: '#647382' });
const timber = new MeshLambertMaterial({ color: '#865f46' });
const water = new MeshBasicMaterial({ color: '#315975' });

function waterStrip(points: { n: number; left: number; right: number }[]) {
  const vertices: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    vertices.push(a.left, waterHeight, -a.n, a.right, waterHeight, -a.n, b.left, waterHeight, -b.n,
      a.right, waterHeight, -a.n, b.right, waterHeight, -b.n, b.left, waterHeight, -b.n);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3));
  scene.add(new Mesh(geometry, water));
}
waterStrip(townWater.sections);
const [[inletX, inletNorth], [lakeX, lakeNorth]] = layout.lake.inlet;
const inlet = new Mesh(new BoxGeometry(Math.hypot(lakeX - inletX, lakeNorth - inletNorth), .08, 7.9), water);
inlet.position.set((inletX + lakeX) / 2, waterHeight, -(inletNorth + lakeNorth) / 2);
inlet.rotation.y = Math.atan2(lakeNorth - inletNorth, lakeX - inletX);
scene.add(inlet);
const bridgeGeometry = new BoxGeometry();
const bridgeCollision = new Group();
const rails: Box[] = [];
bridgeCollision.userData.colliders = rails;
const detailedBridges = new Group();
scene.add(detailedBridges);
let bridgePanorama: Group | undefined;
const bridgeMatrices = new Map([[stone, [] as Matrix4[]], [timber, [] as Matrix4[]]]);
function bridgeBatch(material: MeshLambertMaterial, transforms: Matrix4[], name: string) {
  const batch = new InstancedMesh(bridgeGeometry, material, transforms.length);
  batch.name = name;
  transforms.forEach((matrix, index) => batch.setMatrixAt(index, matrix));
  batch.computeBoundingSphere();
  return batch;
}
function showWideBridges(wide: boolean) {
  detailedBridges.visible = !wide;
  if (!bridgePanorama && wide) {
    bridgePanorama = new Group();
    for (const [material, matrices] of bridgeMatrices) {
      bridgePanorama.add(bridgeBatch(material, matrices, 'Bridge panorama'));
    }
    scene.add(bridgePanorama);
  }
  if (bridgePanorama) bridgePanorama.visible = wide;
}
for (const bridge of layout.bridges) {
  const parts = new Map([[stone, [] as Matrix4[]], [timber, [] as Matrix4[]]]);
  function box(x: number, y: number, n: number, w: number, h: number, d: number, material: MeshLambertMaterial) {
    parts.get(material)!.push(new Matrix4().makeScale(w, h, d).setPosition(x, y, -n));
  }
  const center = (bridge.west + bridge.east) / 2;
  const length = bridge.east - bridge.west;
  box(center, bridge.height - .39, bridge.north, length, .64, 8, stone);
  for (let x = bridge.west + .25; x < bridge.east; x += .5) {
    box(x, bridge.height - .07, bridge.north, .48, .14, 7.7, timber);
  }
  for (const n of [bridge.north - 3.8, bridge.north + 3.8]) {
    rails.push({
      min: [bridge.west - .125, bridge.height, -n - .125],
      max: [bridge.east + .125, bridge.height + 1.15, -n + .125],
    });
    box(center, bridge.height + 1.06, n, length, .18, .23, timber);
    for (let x = bridge.west; x <= bridge.east; x += 2) box(x, bridge.height + .55, n, .25, 1.1, .25, stone);
  }
  for (const x of [center - 5, center + 5]) box(x, (bridge.height + 3.5) / 2, bridge.north, 1.5, bridge.height - 3.5, 6.75, stone);
  for (const [material, transforms] of parts) {
    detailedBridges.add(bridgeBatch(material, transforms, `bridge-${bridge.id}-${material === stone ? 'stone' : 'timber'}`));
    bridgeMatrices.get(material)!.push(...transforms);
  }
}

type Builder = (plot: TownPlot) => Group;
const builders: Record<string, Builder> = {
  tavern(plot) {
    const tavern = buildTavernLandmark(plot);
    const { group, colliders } = buildTavernWarmShed(plot, grid.heightAt);
    tavern.add(group);
    tavern.userData.colliders.push(...colliders);
    return tavern;
  },
  clocktower: buildTowerLandmark, 'post-office': buildPostLandmark,
  memorial: buildMuseumLandmark, 'long-hall': buildCultureLandmark, cabins: buildVillageLandmark,
  'lantern-workshop': buildMarketLandmark, 'market-stalls': buildMarketLandmark,
  glasshouse: buildLakesideLandmark,
  lighthouse: buildLakesideLandmark, stage: buildVillageLandmark,
};
type Model = { id: string; file: string; colliders: Box[]; floors?: Box[]; ramps?: Ramp[] };
const architecture = new Map<string, Group>();
const festivalText = element('festival-status');
const rehearse = element<HTMLButtonElement>('rehearse');
const festival = createFestival(scene, message => { festivalText.textContent = message; }, announceSnowballTitles);
const actionButton = element<HTMLButtonElement>('world-action');
const assetBase = new URL('./town-blockout/buildings/', document.baseURI);
function validBox({ min, max }: Box) {
  return [min, max].every(v => v.length === 3 && v.every(Number.isFinite)) && min.every((v, i) => v <= max[i]);
}
function place(plot: Pick<TownPlot, 'id' | 'origin'>, group: Group) {
  const [x, n, y] = plot.origin;
  group.position.set(x, y, -n);
  group.name = plot.id;
  architecture.get(plot.id)?.removeFromParent();
  architecture.set(plot.id, group);
  scene.add(group);
}
for (const plot of layout.plots) place(plot, builders[plot.id](plot));
addNewYearDecor(scene);
const museumPlot = layout.plots.find(plot => plot.id === 'memorial')!;
const [museumEast, museumNorth, museumHeight] = museumPlot.origin;
function museumToWorld(localX: number, localY: number, localZ: number) {
  return [museumEast + localX * museumHorizontalScale, museumHeight + localY, -museumNorth + localZ * museumHorizontalScale] as const;
}
const museumLights = Array.from({ length: 3 }, () => new PointLight('#ffba76', 0, 16, 2));
scene.add(...museumLights);
let museumLightClock = 0;
const castleEye = new Vector3();
const castleLightPosition = new Vector3();
let nearbyIceExhibit: string | undefined;
let visiblePalaceRace: IcePalaceRace | undefined;

function updateMuseumLights(dt: number, eyePosition: Vector3) {
  const castle = architecture.get('ice-castle');
  const refinement = castle?.userData.iceRefinement as IceCastleRefinementRuntime | undefined;
  if (castle && refinement && eyePosition.distanceToSquared(castle.position) < 90 ** 2) {
    castle.worldToLocal(castleEye.copy(eyePosition));
    refinement.update(dt, castleEye, nightMode);
    museumLightClock = 0;
    museumLights.forEach((light, index) => {
      const source = refinement.lights[index];
      light.intensity = source?.power ?? 0;
      if (!source || source.power <= 0) return;
      castle.localToWorld(castleLightPosition.set(...source.position));
      light.position.copy(castleLightPosition);
      light.color.set(source.color);
      light.distance = source.distance;
    });
    const race = castle.userData.palaceRace as IcePalaceRace | undefined;
    if (race) {
      visiblePalaceRace = race;
      let status = '';
      if (walking && !seated && !boardingGround && !homeReturn) {
        status = race.update(x - castle.position.x, (airHeight ?? ground) - castle.position.y,
          -n - castle.position.z, airHeight === undefined);
      } else race.cancel();
      if (palaceRaceStatus.textContent !== status) palaceRaceStatus.textContent = status;
    }
    const exhibit = walking && !seated && !boardingGround && airHeight === undefined && !race?.running
      ? refinement.exhibits.find(({ stand: [x, y, z] }) =>
        Math.abs(castleEye.y - eye - y) < .55 && (castleEye.x - x) ** 2 + (castleEye.z - z) ** 2 < .9 ** 2)
      : undefined;
    if (!exhibit) nearbyIceExhibit = undefined;
    else if (nearbyIceExhibit !== exhibit.id && !placeCard.open && !museumVisit.dialog.open) {
      nearbyIceExhibit = exhibit.id;
      activityContext.open(exhibit.title, exhibit.description);
    }
    return;
  }
  nearbyIceExhibit = undefined;
  if (visiblePalaceRace) {
    visiblePalaceRace.cancel();
    visiblePalaceRace = undefined;
    palaceRaceStatus.textContent = '';
  }
  museumLightClock -= dt;
  if (museumLightClock > 0) return;
  museumLightClock = .15;
  const lights = architecture.get('memorial')?.userData.lights as MuseumLight[] | undefined;
  const nearby = (lights ?? []).map(light => ({ light, distance: Math.hypot(
    museumEast + light.position[0] - eyePosition.x,
    2.25 * (museumHeight + light.position[1] - eyePosition.y),
    -museumNorth + light.position[2] - eyePosition.z,
  ) })).filter(entry => entry.distance < 37).sort((a, b) => a.distance - b.distance);
  museumLights.forEach((light, index) => {
    const next = nearby[index]?.light;
    light.intensity = next?.power ?? 0;
    if (!next) return;
    light.position.set(museumEast + next.position[0], museumHeight + next.position[1], -museumNorth + next.position[2]);
    light.color.set(next.color);
    light.distance = next.distance;
  });
}
const slide = buildIcePlayProps();
scene.add(slide);

const bodyRadius = .27;
const collisionChunkSize = 64;
const collisionSubcells = 4;
const collisionCellSize = collisionChunkSize / collisionSubcells;
const collisionStride = Math.ceil(worldBounds.width / collisionChunkSize) + 3;
const chunkAtCell = (east: number, north: number) => Math.floor(east / collisionSubcells) +
  collisionStride * Math.floor(north / collisionSubcells);
const subcellMask = collisionSubcells - 1;
const subcellAt = (east: number, north: number) => (east & subcellMask) +
  collisionSubcells * (north & subcellMask);
type WalkGeometry = ReturnType<typeof readWalkGeometry>;
const emptyGeometry: WalkGeometry = { colliders: [], floors: [], ramps: [] };
let extensionStreets: ReturnType<typeof import('./extension-streets').buildExtensionStreets> | undefined;
let streetsRequested = false;
let homeReturn: TownHousePortal | undefined;
let sharedHome: ReturnType<typeof buildSharedHome> | undefined;
let sharedHomeGeometry: WalkGeometry | undefined;

function geometry() {
  const chunks = new Map<number, (WalkGeometry | undefined)[]>();
  function index<T extends Box>(boxes: T[], append: (cell: WalkGeometry, box: T) => void) {
    for (const box of boxes) {
      // An expanded box is registered on both sides of any cell boundary it overlaps.
      const x0 = Math.floor((box.min[0] - bodyRadius) / collisionCellSize);
      const x1 = Math.floor((box.max[0] + bodyRadius) / collisionCellSize);
      const n0 = Math.floor((-box.max[2] - bodyRadius) / collisionCellSize);
      const n1 = Math.floor((-box.min[2] + bodyRadius) / collisionCellSize);
      for (let n = n0; n <= n1; n++) {
        for (let x = x0; x <= x1; x++) {
          const id = chunkAtCell(x, n);
          const chunk = chunks.get(id) ?? [];
          if (!chunks.has(id)) chunks.set(id, chunk);
          const subcell = subcellAt(x, n);
          const cell = chunk[subcell] ?? (chunk[subcell] = { colliders: [], floors: [], ramps: [] });
          append(cell, box);
        }
      }
    }
  }
  const groups = [...architecture.values(), slide, railway.group, bridgeCollision];
  if (extensionStreets) groups.push(extensionStreets.group);
  for (const group of groups) {
    const { colliders, floors, ramps } = readWalkGeometry(group);
    index(colliders, (cell, box) => cell.colliders.push(box));
    index(floors, (cell, box) => cell.floors.push(box));
    index(ramps, (cell, ramp) => cell.ramps.push(ramp));
  }
  return chunks;
}
let walkGeometry = geometry();
function geometryAt(east: number, north: number) {
  return homeReturn ? sharedHomeGeometry ?? emptyGeometry : outdoorGeometryAt(east, north);
}
function outdoorGeometryAt(east: number, north: number) {
  const cellEast = Math.floor(east / collisionCellSize);
  const cellNorth = Math.floor(north / collisionCellSize);
  return walkGeometry.get(chunkAtCell(cellEast, cellNorth))?.[subcellAt(cellEast, cellNorth)] ?? emptyGeometry;
}

const extensionBuilders: Record<string, () => Promise<Group>> = {
  'railway-station': () => import('./landmark-station').then(module => module.buildRailwayStation()),
  'coaster-station': () => import('./landmark-station').then(module => module.buildCoasterStation()),
  'hot-spring': () => import('./landmark-hot-spring').then(module => module.buildHotSpring()),
  'ice-castle': () => import('./landmark-ice-castle').then(module => module.buildIceCastle()),
};
const requestedPlots = new Set<string>();
function prepareLandmarks(east: number, north: number, overview: boolean) {
  const plot = extensionPlots.find(({ id, origin }) => !requestedPlots.has(id) &&
    (overview || Math.hypot(east - origin[0], north - origin[1]) < 148));
  if (!plot) return;
  requestedPlots.add(plot.id);
  extensionBuilders[plot.id]().then(group => {
    place(plot, group);
    walkGeometry = geometry();
    registerLandmarkActivities(plot.id, group);
  }).catch(error => {
    requestedPlots.delete(plot.id);
    console.error(`Loading ${plot.id}`, error);
  });
}
async function loadBuildings() {
  const response = await fetch(new URL('index.json', assetBase));
  if (!response.ok || !response.headers.get('content-type')?.includes('json')) return;
  const models: Model[] = await response.json();
  const loader = new GLTFLoader();
  const results = await Promise.allSettled(models.map(async model => {
    const plot = layout.plots.find(item => item.id === model.id);
    if (plot?.id === 'carousel') return;
    if (!plot || !/^[a-z0-9-]+\.glb$/.test(model.file)) throw new Error('无效地块或文件名');
    if (![...model.colliders, ...(model.floors ?? []), ...(model.ramps ?? [])].every(validBox)) throw new Error('无效碰撞范围');
    const { scene: modelScene } = await loader.loadAsync(new URL(model.file, assetBase).href);
    const group = new Group();
    group.add(modelScene);
    group.userData = model;
    place(plot, group);
  }));
  walkGeometry = geometry();
  const failed = results.filter(result => result.status === 'rejected').length;
  if (failed) console.warn(`${failed} 栋替换模型加载失败`);
}
if (location.protocol !== 'file:') loadBuildings().catch(error => console.error('建筑清单读取失败', error));

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * .48;
controls.target.set(220, 8, -195);
const overview = element<HTMLButtonElement>('overview');
const walk = element<HTMLButtonElement>('walk');
const selector = element<HTMLSelectElement>('jump');
const points = new Map<string, number[]>([
  ['广场南侧', layout.plaza.spawn],
  ['西北木屋', layout.roads[0].points.at(-1)!],
  ['东北纪念馆', layout.roads[1].points.at(-1)!],
  ['西南年集', layout.roads[2].points.at(-1)!],
  ['东南游乐区', layout.roads[3].points.at(-1)!],
  ['西南河畔街巷', [161.5, 165.5]],
  ['东北坡地街巷', [319, 221]],
  ['冰湖雪球场', [350, 92.5]],
  ['冰湖滑冰', [lakeSkateStation.x, lakeSkateStation.n]],
  ['冰湖冰钓', [iceFishingStation.x, iceFishingStation.n]],
  ['东侧扩建步道', [443, 221]],
  ['北侧森林街区', [93, 378]],
  ['火车站', [526, 305]],
  ['环镇列车站', [469, 224]],
  ['温泉浴场', [520, 156]],
  ['冰雪城堡', [454, 75]],
  ['雪团练习场', [...snowPracticeStand]],
  ['南河岸', [266, 120]],
  ['北河岸', [212, 400]],
]);
const plotLabels = ['钟楼', '酒馆', '邮局', '纪念馆入口', '长殿', '木屋入口', '灯坊', '集市摊位', '暖房', '灯塔', '舞台'];
layout.plots.forEach((plot, i) => {
  points.set(plotLabels[i], plot.id === 'tavern' ? [159, 219.5] : plot.connect);
});
for (const key of points.keys()) selector.add(new Option(key, key));

const eye = 1.65;
const keys = new Set<string>();
const touchSprintButton = element<HTMLButtonElement>('touch-sprint');
const touchWalk = createTouchWalk(element('touch-walk'), touchSprintButton);
const viewportControls = createViewportControls({
  fullscreenButton: element<HTMLButtonElement>('fullscreen-toggle'),
  chatPanel: element('town-chat'),
  chatToggle: element<HTMLButtonElement>('town-chat-toggle'),
  chatUnread: element('town-chat-unread'),
  chatLog: element('town-chat-log'),
});
const museumMapButton = element<HTMLButtonElement>('museum-map-button');
const crosshair = element('walk-crosshair');
const lockLookButton = element<HTMLButtonElement>('lock-look');
const envBanner = element('env-banner');
const touchJump = element<HTMLButtonElement>('touch-jump');
const walkClock = createTownPhysicsClock();
const landingFeedback = createLandingFeedback();
const landingSnow = createLandingSnow(scene);
const lakeSkateMotion = createLakeSkateMotion();
const walkPrevious = new Vector3();
const walkCurrent = new Vector3();
const walkRender = new Vector3();
let movementStepMs = 0;
let forwardPressedAt = -Infinity;
let doubleForward = false;
function stopTravel() {
  keys.clear();
  forwardPressedAt = -Infinity;
  doubleForward = false;
  touchWalk.reset();
  walkClock.reset();
  lakeSkateMotion.reset();
}
function resetMovement() {
  landingFeedback.reset();
  stopTravel();
  touchLook.reset();
  desktopLook.release();
  hitFeedback.clear();
}
let walking = false;
let x = 0;
let n = 0;
let yaw = 0;
let pitch = 0;
let ground = 0;
let airHeight: number | undefined;
let riseSpeed = 0;
let boardingGround: { x: number; n: number; ground: number; yaw: number } | undefined;
let lastRailStopShown: TownRailStopId | undefined;
let seated: (TownSeat & { pitch: number; tavern?: true }) | undefined;
let rideYawOffset = 0;
let ridePitch = 0;
const lookAhead = new Vector3();
const placeCard = element<HTMLDialogElement>('place-card');
const activityPanel = element('town-activity-content');
const activityStatus = element('town-activity-status');
const palaceRaceStatus = element<HTMLOutputElement>('ice-palace-race-status');
let activityMessageTimer: number | undefined;
let photoFilename: string | undefined;
const museumInspection = createMuseumInspection(renderer, camera.aspect);
const museumLaunch = createMuseumLaunch(renderer, camera.aspect);
const museumGuide = createMuseumGuide(scene, museumToWorld);
const museumOverlay = () => museumInspection.active || museumLaunch.active;
function inspectExhibit(month: number) {
  resetMovement();
  touchWalk.setAllowed(false);
  museumInspection.open(month);
  renderer.domElement.focus({ preventScroll: true });
}
function pauseForPanel() {
  resetMovement();
  touchWalk.setAllowed(false);
}
const museumVisit = createMuseumVisit(pauseForPanel, () => {
  const [viewX, viewY, viewZ] = museumToWorld(terraceStop.x, 5.65, terraceStop.z);
  if (!settleTownLanding(viewX, -viewZ, viewY)) {
    announceActivity('露台落点被挡住了');
    return;
  }
  yaw = Math.atan2(226 - x, 223 - n);
  pitch = .22;
  photoFilename = 'UNWRITTEN-2027-museum-terrace.png';
}, inspectExhibit, museumGuide.setActive, complete => {
  pauseForPanel();
  museumLaunch.open(complete);
});
museumVisit.dialog.addEventListener('close', () => {
  if (!museumLaunch.active) renderer.domElement.focus();
});
function museumPosition() {
  return { x: (x - museumEast) / museumHorizontalScale, y: ground - museumHeight, z: (museumNorth - n) / museumHorizontalScale };
}
museumMapButton.onclick = () => museumVisit.openMap(museumPosition());

function openPlace(title: string, description: string) {
  pauseForPanel();
  element('place-title').textContent = title;
  element('place-text').textContent = description;
  activityPanel.hidden = false;
  activityPanel.replaceChildren();
  if (!placeCard.open) placeCard.showModal();
  return activityPanel;
}
placeCard.addEventListener('close', () => renderer.domElement.focus());

function leaveRide() {
  if (!boardingGround) return true;
  const platform = railway.currentStop;
  const arrival = railway.disembark((east, north, feet) =>
    !isWater(east, north) && !townWater.at(east, north) && canStandAtActivity(east, north, feet));
  if (!arrival) {
    announceActivity('附近暂时没有安全落脚点');
    return false;
  }
  boardingGround = undefined;
  lastRailStopShown = undefined;
  resetMovement();
  if (platform) {
    if (!settleTownLanding(platform.x, platform.n, platform.ground)) settleTownLanding(platform.x, platform.n);
  } else {
    ({ x, n, ground } = arrival);
    airHeight = undefined;
    riseSpeed = 0;
  }
  yaw = arrival.yaw;
  pitch = 0;
  return true;
}
function leaveSeat() {
  if (!seated) return;
  seated = undefined;
  stopTravel();
  hotSpringSoak.leave();
}
const activityContext: Omit<TownActivityContext, 'announce'> = {
  scene,
  open: openPlace,
  sit(seat) {
    landingFeedback.reset();
    stopTravel();
    seated = { ...seat, pitch: 0 };
  },
  face(east, north, height) {
    stopTravel();
    const dx = east - (seated?.x ?? x), dn = north - (seated?.n ?? n);
    const heading = Math.atan2(dx, dn);
    const tilt = height === undefined ? 0 : Math.max(-1.42, Math.min(1.42,
      Math.atan2(height - (seated?.eyeY ?? ground + eye), Math.hypot(dx, dn)),
    ));
    if (seated) { seated.yaw = heading; seated.pitch = tilt; }
    else { yaw = heading; pitch = tilt; }
  },
};
const tavernDrinkEffects = createTavernDrinkEffects();
tavernDrinkEffects.mountSettings(element('town-panel-controls'));
const townBgm = createTownBgm(festival.getAudioContext);
townBgm.mountControls(element('town-panel-controls'));
let nextBgmRoomCheck = 0;
const hotSpringSoak = createHotSpringSoak(
  { sit: activityContext.sit, announce: announceActivity }, tavernDrinkEffects.setSoaking,
  { playerName: presence.playerName },
);
const lightsButton = element<HTMLButtonElement>('town-lights-button');
function showLightCount({ lit, total }: { lit: number; total: number }) {
  lightsButton.textContent = `点亮小镇 ${lit}/${total}`;
}
const townLights = createTownLights({ ...activityContext, announce: announceActivity }, grid, showLightCount);
showLightCount(townLights.getProgress());
lightsButton.onclick = townLights.openBook;
const mascotFrustum = new Frustum();
const mascotViewProjection = new Matrix4();
const mascotBounds = new Sphere(new Vector3(), .54);
const npcActivity = createTownNpcActivity({ ...activityContext, announce: announceActivity }, grid.heightAt, feature => {
  if (feature === 'spring') return architecture.has('hot-spring');
  if (feature === 'castle') return architecture.has('ice-castle');
  if (feature === 'mixing') return architecture.has('tavern');
  return true;
}, () => !nightMode, name => {
  if (name === '钟铁生' && zodiac.canCollect('horse')) return railHorseClues;
  if (name === '纪守信' && zodiac.canCollect('horse')) return npcAuthoredDialogue.纪守信.clues.slice(1);
  if (name === '罗大江' && zodiac.canCollect('rooster')) return tavernRoosterClues;
},
panel => openTavernDice(panel, () => {
  if (tavernDrinkEffects.getLevel() >= 3) return '这局你输了。酒意已满，免罚酒。';
  if (!tavernDrinkEffects.sip('#ce8c40', () => {})) return '这局你输了。正在喝酒，免另添一杯。';
  return '这局你输了，罚酒一杯。';
}), {
  now: presence.serverNow,
  groundAt: mascotOutdoorGround,
  visible(east, north, feet) {
    if (homeReturn) return false;
    mascotBounds.center.set(east, feet + .32, -north);
    if (camera.position.distanceToSquared(mascotBounds.center) > 65 ** 2) return false;
    camera.updateMatrixWorld();
    mascotFrustum.setFromProjectionMatrix(mascotViewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    return mascotFrustum.intersectsSphere(mascotBounds);
  },
});
const practiceTarget = createSnowPracticeTarget(scene, grid.heightAt);
let drinkingPoseUntil = 0;
let warmDrinkUntil = 0;
let nextBathTeaAt = 0;
function warmFromDrink() {
  warmDrinkUntil = performance.now() + 45_000;
  ceremonyFrost.drinkHot();
}
const tavernActivity = createTavernActivity(
  { ...activityContext, announce: announceActivity }, tavernDrinkEffects, warmFromDrink,
  () => { drinkingPoseUntil = performance.now() + 2500; },
);
const lakeSkating = createLakeSkatingActivity({ ...activityContext, announce: announceActivity }, grid.heightAt);
const iceFishing = createIceFishingActivity({ ...activityContext, announce: announceActivity }, grid.heightAt);
const marketFair = createMarketFairActivity(
  { ...activityContext, announce: announceActivity },
  { camera, player: () => ({ x, n, walking }), onHotDrink: warmFromDrink },
);
function nearbyActivity<T extends TownActivity>(create: (context: TownActivityContext) => T): T {
  const activity = create({
    ...activityContext,
    announce(message) {
      if (!walking || !activity.spots.some(spot =>
        Math.abs(ground - spot.ground) < 1 && Math.hypot(x - spot.x, n - spot.n) < spot.range + 5)) return;
      announceActivity(message);
    },
  });
  return activity;
}
const stageActivity = nearbyActivity(createStageActivity);
const activities: TownActivity[] = [
  nearbyActivity(createPostActivity), stageActivity, nearbyActivity(createMarketActivity),
  nearbyActivity(createIceActivity), nearbyActivity(createWishActivity), nearbyActivity(createRestActivity),
];
function announceActivity(message: string, gold = false) {
  activityStatus.textContent = message;
  activityStatus.toggleAttribute('data-gold', gold);
  window.clearTimeout(activityMessageTimer);
  activityMessageTimer = window.setTimeout(() => {
    activityStatus.textContent = '';
    activityStatus.removeAttribute('data-gold');
  }, 4200);
}
presence.onTestFireworks((seed, ageSeconds) => festival.startShow(makeTestFireworksTable(seed), {
  ageSeconds, clockMs: () => performance.now(),
}));
const plazaPhoto = createPlazaGroupPhoto({
  now: presence.serverNow, ownId: presence.photoPlayerId, request: presence.requestPlazaPhoto,
  leave: presence.leavePlazaPhoto, nearby: presence.nearbyPhotoPeople, announce: announceActivity, open: activityContext.open,
});
presence.onPlazaPhoto(plazaPhoto.receive);
const plazaPhotoAction = { label: '合影倒计时', run: plazaPhoto.request };
const fireworks = createTownFireworksActivity({ open: activityContext.open, announce: announceActivity }, grid, (seed, theme) => {
  if (!presence.requestFireworks(seed, theme) && festival.launchPublicFireworks(seed, theme)) fireworks.markStarted();
}, festival.showActive);
presence.onFireworks((seed, theme, ageMs, own) => {
  if (own) fireworks.markStarted(ageMs);
  festival.launchPublicFireworks(seed, theme, ageMs / 1000);
});
activities.unshift(tavernActivity);
activities.push(townLights, npcActivity, practiceTarget, lakeSkating, iceFishing, fireworks);
activities.push(marketFair);
const activitySpots = activities.flatMap(activity => activity.spots);
function registerHomeDoors(doors: readonly TownHousePortal[]) {
  for (const door of doors) {
    activitySpots.push({
      x: door.x, n: door.n, ground: door.ground, range: 1.6, label: '进入屋舍空间',
      available: () => !homeReturn,
      run: () => enterSharedHome(door),
    });
  }
}
function enterSharedHome(door: TownHousePortal) {
  if (homeReturn) return;
  if (!sharedHome) {
    sharedHome = buildSharedHome();
    sharedHome.traverse(object => object.layers.set(sharedHomeLayer));
    sharedHomeGeometry = readWalkGeometry(sharedHome);
    scene.add(sharedHome);
    activitySpots.push(...createSharedHomeSpots({ ...activityContext, announce: announceActivity }, leaveSharedHome, filename => {
      photoFilename = filename;
    }, sharedHome));
  }
  lakeSkating.stop();
  resetMovement();
  homeReturn = door;
  sharedHome.visible = true;
  camera.layers.set(sharedHomeLayer);
  ({ x, n, ground, yaw } = sharedHomeSpawn);
  pitch = 0;
  airHeight = undefined;
  riseSpeed = 0;
  fadeHousePortal();
  announceActivity('屋舍空间 · 从原门口返回');
}
function fadeHousePortal() {
  if (!reduceSnowEffects.matches) renderer.domElement.animate(
    [{ opacity: 0 }, { opacity: 1 }], { duration: 350, easing: 'ease-out' },
  );
}
function leaveSharedHome() {
  const door = homeReturn;
  if (!door) return;
  homeReturn = undefined;
  if (!settleTownLanding(door.x, door.n, door.ground)) {
    homeReturn = door;
    announceActivity('门外暂时无法落脚，请稍后再出来');
    return;
  }
  resetMovement();
  yaw = door.exitYaw;
  pitch = 0;
  camera.layers.set(0);
  if (sharedHome) sharedHome.visible = false;
  fadeHousePortal();
}
const townMail = createTownMailActivity({ open: activityContext.open, announce: announceActivity }, grid.heightAt);
scene.add(townMail.group);
activitySpots.push(...townMail.spots);
const riddleActivity = createRiddleActivity({ open: activityContext.open, announce: announceActivity }, architecture.get('lantern-workshop'), {
  celebrate: () => festival.launchWorkshopBurst(116.25, 15.4, -115),
  chime: () => festival.playRiddleChime(),
});
activitySpots.push(...riddleActivity.spots);
const snowballControls = element('snowball-controls');
const snowballScore = element('snowball-score');
const snowballMeter = element<HTMLProgressElement>('snowball-action-meter');
const snowballRing = element('snowball-action-ring');
const snowballHitMark = element('snowball-hit-mark');
const reduceSnowEffects = matchMedia('(prefers-reduced-motion: reduce)');
const previewOptions = new URLSearchParams(location.search);
const hitFeedback = createSnowballHitFeedback(
  element('snowball-frost'), previewOptions.get('hitFeedback') !== 'off', reduceSnowEffects,
);
const ceremonyOverlay = createCeremonyOverlay({
  dim: element('ceremony-dim'),
  countdown: element('ceremony-countdown'),
  banner: element('ceremony-banner'),
}, { reducedMotion: reduceSnowEffects, dimOverlay: false });
const ceremonyFrost = createCeremonyFrost(element('ceremony-frost'), {
  enabled: previewOptions.get('ceremonyFrost') !== 'off',
  reducedMotion: reduceSnowEffects,
  scene: element('scene'),
  announce: announceActivity,
});
ceremonyFrost.mountSettings(element('town-panel-controls'));
const ceremonyClock = (import.meta.env.MODE === 'town-rehearsal' ? await loadRehearsalClock() : undefined)
  ?? { now: presence.serverNow, utcOffsetMinutes: 8 * 60 };
const railOvernightBroadcast = createRailOvernightBroadcast();
const postUnlockTime = new Date(UNLOCK_AT).getTime();
setPostOpeningReady(architecture.get('post-office'), Date.now() >= postUnlockTime);
const cameraBeforeBellShake = new Quaternion();
let bellShakeStartedAt = -Infinity;
let nextHourlyBell = Infinity;
let hourlyBellsRemaining = 0;
const ceremony = createCeremonyDirector(ceremonyClock, {
  onCue: handleCeremonyCue,
  onFrostBaseline: ceremonyFrost.setBaseline,
  onSnowIntensity: snowCover.setIntensity,
  onDim(level) {
    ceremonyDim = level;
    applyCeremonyLighting();
    townLights.setCeremonyDim(level);
  },
});
window.addEventListener('pointerdown', festival.enableAudio, { once: true });
window.addEventListener('keydown', festival.enableAudio, { once: true });

function bellDistance() {
  return camera.position.distanceTo(towerBellPosition);
}

function handleCeremonyCue(cue: CeremonyCue) {
  ceremonyOverlay.cue(cue);
  switch (cue.type) {
    case 'mailbox-open':
      if (cue.at === postUnlockTime && Date.now() >= postUnlockTime) {
        setPostOpeningReady(architecture.get('post-office'), true);
        announceActivity('苏小满 · 时光信箱已开启，循红绸到邮局主箱读信。', true);
      }
      break;
    case 'hourly-chime':
      festival.playCeremonyBell('hourly', bellDistance());
      bellMotion.strike(.65);
      nextHourlyBell = cue.at + 2020;
      hourlyBellsRemaining = cue.strikes - 1;
      break;
    case 'countdown-tick':
      festival.playCeremonyBell('tick', bellDistance());
      bellMotion.strike(.28);
      break;
    case 'grand-strike':
      festival.playCeremonyBell('grand', bellDistance());
      bellMotion.strike();
      break;
    case 'bloom-band':
      townLights.setCeremonyBand(cue.band);
      break;
    case 'fireworks-main':
    case 'fireworks-far':
    case 'fireworks-finale':
      festival.launchCeremony(cue.type, (ceremonyClock.now() - cue.at) / 1000);
      break;
  }
}
const tossOrigin = new Vector3();
const tossDirection = new Vector3();
const gatherSeconds = .8;
const touchHoldMilliseconds = 150;
let snowHold: { source: 'mouse' | 'touch'; started: number } | undefined;
let snowAction: 'gather' | 'aim' | undefined;
let gatherTime = 0;
const gatherRayEnd = new Vector3();
const gatherCheck = { x: NaN, n: NaN, ground: NaN, yaw: NaN, pitch: NaN, snow: false };
let formalSnowFight = false;
let enteredSnowFight = false;
let snowOnHead = 0;
let jumpsToShakeSnow = 0;
let snowHatTime = 0;
let snowStaggerTime = 0;
let snowballWalkFactor = 1;
let snowballPhysicsMs = 0;
const profileTown = previewOptions.has('profile');
const profileOriginalDraws = profileTown && previewOptions.get('viewBatches') === 'off';
let aerialWarmFrames = 0;

const playerTarget: TownSnowballTarget = {
  id: 'local', label: '你', radius: .27, height: 1.78, shape: 'capsule', x: 0, y: -10000, z: 0,
  onHit() {
    if (!moveAllowed()) return;
    snowOnHead = Math.min(3, snowOnHead + 1);
    jumpsToShakeSnow = 3;
    snowHatTime = 10;
    snowStaggerTime = .18;
    snowballWalkFactor = .45;
    announceActivity('雪球打中你了 · 连跳三下抖掉头上的雪');
  },
};
const snowballTargets = [playerTarget, ...npcActivity.snowballTargets, ...practiceTarget.snowballTargets];
const targetById = new Map(snowballTargets.map(target => [target.id, target]));
const remoteSnowballTargets: TownSnowballTarget[] = [];
const remoteTargetPool = Array.from({ length: 48 }, (): TownSnowballTarget => ({
  id: '', label: '', x: 0, y: 0, z: 0, radius: playerTarget.radius, height: playerTarget.height,
  shape: 'capsule', onHit() {},
}));
const remoteSnowballNames = new Map<string, string>();
const recentSnowballHits = new Map<number, number>();
const remoteSnowballOrigin = new Vector3();
const remoteSnowballDirection = new Vector3();
let snowballSessionId: number | null = null;

function snowballName(id: string) {
  return targetById.get(id)?.label ?? remoteSnowballNames.get(id) ?? id;
}
const snowballBoard = createTownSnowballBoard({
  open: activityContext.open,
  announce: message => announceActivity(message, true),
  label: snowballName,
});
function announceSnowballTitles() {
  const { snowballKing, sharpshooter, popularityKing } = snowballBoard.getTitles();
  const winners = [
    snowballKing && `雪球王 ${snowballKing.label}`,
    sharpshooter && `百发百中 ${sharpshooter.label}`,
    popularityKing && `人气王 ${popularityKing.label}`,
  ].filter(Boolean);
  if (winners.length) announceActivity(`雪仗结算 · ${winners.join(' · ')}`, true);
}
element<HTMLButtonElement>('snowball-board').onclick = snowballBoard.open;
addTownSnowBoard(scene, grid.heightAt);
activitySpots.push({
  x: 220, n: 172, ground: grid.heightAt(220, 172), range: 2.4, label: '查看雪仗榜', run: snowballBoard.open,
});

function roofed(east: number, north: number, feet: number) {
  const { floors, colliders } = geometryAt(east, north);
  const above = (box: Box) => box.min[1] >= feet + .9 && overlapsBody(east, north, box);
  return floors.some(above) || colliders.some(above);
}
function outdoorLaunch(origin: Vector3, by: string) {
  if (by !== 'local') {
    const actor = targetById.get(by);
    if (actor) return !roofed(actor.x, -actor.z, actor.y);
  }
  return !roofed(origin.x, -origin.z, origin.y - eye + .08);
}
function showSnowballScore({ ammo, hits, combo }: SnowballState) {
  const depth = snowCover.depth();
  const text = `雪球 ${ammo}/10 · ${depth.label} · 命中 ${hits}${combo > 1 ? ` · 连中 ${combo}` : ''}${snowOnHead ? ` · 顶雪 ${snowOnHead}/3` : ''}`;
  if (snowballScore.textContent !== text) snowballScore.textContent = text;
  const aiming = snowAction === 'aim' && ammo > 0;
  const progress = aiming ? 1 : gatherTime / gatherSeconds;
  snowballMeter.hidden = !aiming && (snowAction !== 'gather' || ammo >= 10);
  snowballRing.hidden = snowballMeter.hidden || !moveAllowed();
  if (!snowballMeter.hidden) {
    snowballMeter.value = progress;
    const label = aiming ? '瞄准雪球' : '攒雪球进度';
    if (snowballMeter.getAttribute('aria-label') !== label) snowballMeter.setAttribute('aria-label', label);
    snowballRing.style.setProperty('--snowball-progress', `${100 * progress}%`);
  }
}
const sweepSnowball = createSnowballSweep({
  geometryAt,
  surfaceHeight(east, north) {
    const height = grid.heightAt(east, north);
    if (height >= waterHeight) return height;
    return townWater.at(east, north) || isWater(east, north) ? waterHeight : height;
  },
  occupiedAt(east, north, height) {
    if (east < 1 || north < 1 || east > worldBounds.width - 1 || north > worldBounds.depth - 1) return true;
    const relative = height - grid.heightAt(east, north);
    return (relative <= 7 && districts.blocked(east, north)) ||
      (relative <= 8 && forest.blocked(east, north)) ||
      (relative <= 3 && (scenery.blocked(east, north) || streetscape.blocked(east, north)));
  },
  targets: snowballTargets,
  scoreAt: target => !roofed(target.x, -target.z, target.y),
});
function showSnowballHit(streak: number, targetName: string) {
  if (!walking) return;
  if (!formalSnowFight || ![3, 5, 8].includes(streak)) {
    announceActivity(streak > 1 ? `连中 ${streak} 次 · ${targetName}` : `击中${targetName}`);
  }
  snowballHitMark.textContent = streak > 1 ? `+${streak} 连中` : '啪！';
  snowballHitMark.getAnimations().forEach(animation => animation.cancel());
  if (!reduceSnowEffects.matches) {
    snowballHitMark.animate([{ opacity: 1, transform: 'translate(-50%, 0)' },
      { opacity: 0, transform: 'translate(-50%, -28px)' }], { duration: 520, easing: 'ease-out' });
  }
}

const snowballs = createTownSnowballFight({
  scene,
  sweep: (from, to, radius, thrower, source) =>
    sweepSnowball(from, to, radius, thrower, source === 'player' ? remoteSnowballTargets : undefined),
  relayPlayerThrow: (ballId, origin, dir) => presence.sendSnowballThrow({
    ballId, east: origin.x, north: -origin.z, height: origin.y, dirX: dir.x, dirY: dir.y, dirZ: dir.z,
  }),
  canScoreAtLaunch: outdoorLaunch,
  onChange: showSnowballScore,
  onEvent(event) {
    if (event.type === 'throw') {
      if (event.scoreable) snowballBoard.recordThrow(event.thrower);
    } else if (event.type === 'miss') {
      if (event.scoreable) snowballBoard.recordMiss(event.thrower);
    } else {
      const target = event.targetId ? targetById.get(event.targetId) : undefined;
      if (event.shotBy === 'remote' && target === playerTarget && event.zone &&
        event.ballId !== undefined && moveAllowed() && !roofed(playerTarget.x, -playerTarget.z, playerTarget.y)) {
        target.onHit(event.velocity.x, event.velocity.z);
        hitFeedback.hit(event.zone);
        snowballs.clearCombo();
        presence.sendSnowballHit({ ballId: event.ballId, throwerId: Number(event.thrower.slice(2)), zone: event.zone });
      } else if (event.scored) {
        target?.onHit(event.velocity.x, event.velocity.z);
        if (target === playerTarget && moveAllowed()) hitFeedback.hit(event.zone);
        const recipient = target?.shape === 'box' ? undefined : target?.id;
        const streak = snowballBoard.recordHit(event.thrower, recipient, { announce: formalSnowFight });
        if (event.thrower === 'local') showSnowballHit(streak, target?.label ?? '目标');
      } else if (event.scoreable) {
        snowballBoard.recordMiss(event.thrower);
      }
    }
    renderer.domElement.dispatchEvent(new CustomEvent('town-snowball', { detail: event }));
  },
});

function updateSnowballSession(id: number | null) {
  if (id === snowballSessionId) return;
  snowballSessionId = id;
  recentSnowballHits.clear();
  remoteSnowballNames.clear();
  snowballBoard.clearRemoteScores();
  snowballs.clearRemote();
}

function remoteSnowballKey(id: number) {
  const key = `p:${id}`;
  const name = presence.snowballName(id);
  if (name) remoteSnowballNames.set(key, name);
  return key;
}

presence.onSnowballEvent(event => {
  const me = presence.selfId();
  if (me === null) return;
  updateSnowballSession(me);
  const thrower = event.throwerId === me ? 'local' : remoteSnowballKey(event.throwerId);
  if (event.kind === 'throw') {
    if (event.throwerId === me || Math.abs(event.height - (airHeight ?? ground)) > 10) return;
    remoteSnowballOrigin.set(event.east, event.height, -event.north);
    remoteSnowballDirection.set(event.dirX, event.dirY, event.dirZ);
    if (snowballs.throwRemote(remoteSnowballOrigin, remoteSnowballDirection, thrower, event.ballId)) {
      snowballBoard.recordThrow(thrower);
      presence.animateSnowballThrow(event.throwerId);
    }
    return;
  }
  const time = performance.now();
  for (const [key, expires] of recentSnowballHits) {
    if (time < expires) break;
    recentSnowballHits.delete(key);
  }
  const shot = event.throwerId * 65536 + event.ballId;
  if (recentSnowballHits.has(shot)) return;
  recentSnowballHits.set(shot, time + 3000);
  const target = event.confirmerId === me ? 'local' : remoteSnowballKey(event.confirmerId);
  snowballs.confirmRemoteImpact(thrower, event.ballId);
  const streak = snowballBoard.recordHit(thrower, target, { announce: formalSnowFight });
  if (event.throwerId === me) {
    snowballs.confirmPlayerHit();
    showSnowballHit(streak, snowballName(target));
  }
});

function aimsAtNearbySnow() {
  if (!moveAllowed() || airHeight !== undefined || waterAtFeet() || pitch >= 0) return false;
  if (x === gatherCheck.x && n === gatherCheck.n && ground === gatherCheck.ground &&
      yaw === gatherCheck.yaw && pitch === gatherCheck.pitch) return gatherCheck.snow;
  aimSnowball();
  gatherRayEnd.copy(tossOrigin).addScaledVector(tossDirection, 2.44);
  const hit = sweepSnowball(tossOrigin, gatherRayEnd, 0, 'local');
  const at = hit?.at;
  let snow = false;
  if (at && hit.kind === 'world') {
    const north = -at.z;
    const height = grid.heightAt(at.x, north);
    snow = Math.abs(height - at.y) < .18 && !roofed(x, n, ground) &&
      !townWater.at(at.x, north) && !roofed(at.x, north, height) && snowCover.canGather(at.x, north, height);
  }
  Object.assign(gatherCheck, { x, n, ground, yaw, pitch, snow });
  return snow;
}
function aimSnowball() {
  const flat = Math.cos(pitch);
  tossDirection.set(Math.sin(yaw) * flat, Math.sin(pitch), -Math.cos(yaw) * flat);
  tossOrigin.set(x, (airHeight ?? ground) + eye - .08, -n).addScaledVector(tossDirection, .06);
}
function cancelSnowAction(source?: 'mouse' | 'touch') {
  if (source && snowHold?.source !== source) return;
  snowHold = undefined;
  snowAction = undefined;
  gatherTime = 0;
  snowballs.hideAim();
}
function beginSnowAction(source: 'mouse' | 'touch') {
  if (!moveAllowed() || snowHold || waterAtFeet()?.mode === 'swim') return;
  if (homeReturn) {
    announceActivity('屋里不兴打雪仗');
    return;
  }
  snowHold = { source, started: performance.now() };
  gatherCheck.x = NaN;
  if (source === 'mouse') updateHeldSnowAction(0);
}
function finishSnowAction(source: 'mouse' | 'touch') {
  if (!snowHold || snowHold.source !== source) return;
  const fire = moveAllowed() && !aimsAtNearbySnow() && waterAtFeet()?.mode !== 'swim';
  cancelSnowAction(source);
  if (!fire) return;
  if (snowballs.getState().ammo === 0) {
    announceActivity(source === 'touch' ? '对准近处雪地长按收雪' : '对准近处雪地，长按左键收雪');
    return;
  }
  aimSnowball();
  snowballs.throwBall(tossOrigin, tossDirection, 'local', 1);
}
function updateHeldSnowAction(dt: number) {
  if (!snowHold) return;
  if (!moveAllowed() || waterAtFeet()?.mode === 'swim') {
    cancelSnowAction();
    return;
  }
  if (snowHold.source === 'touch' && performance.now() - snowHold.started < touchHoldMilliseconds) return;
  if (aimsAtNearbySnow()) {
    snowAction = 'gather';
    snowballs.hideAim();
    if (snowballs.getState().ammo >= 10) {
      gatherTime = 0;
      return;
    }
    gatherTime += dt;
    if (gatherTime >= gatherSeconds) {
      gatherTime -= gatherSeconds;
      snowballs.gather(snowCover.depth().servings);
    }
  } else {
    snowAction = 'aim';
    gatherTime = 0;
    if (snowballs.getState().ammo > 0) {
      aimSnowball();
      snowballs.showAim(tossOrigin, tossDirection, 1);
    }
  }
}
const touchSnowball = {
  delay: touchHoldMilliseconds,
  start: () => beginSnowAction('touch'),
  finish(milliseconds: number) {
    if (!snowHold || snowHold.source !== 'touch') return false;
    if (milliseconds < touchHoldMilliseconds) {
      cancelSnowAction('touch');
      return false;
    }
    finishSnowAction('touch');
    return true;
  },
  cancel: () => cancelSnowAction('touch'),
};
function snowballJumped() {
  if (snowOnHead > 0 && --jumpsToShakeSnow <= 0) {
    snowOnHead = 0;
    announceActivity('头上的雪抖掉了');
  }
}
function updateSnowFight(dt: number) {
  const inPlaza = Math.abs(x - 223) < 30 && Math.abs(n - 186) < 24;
  const active = moveAllowed();
  const outdoor = active && !roofed(x, n, airHeight ?? ground);
  const formal = nightMode && snowCover.depth().level >= 1;
  formalSnowFight = formal && walking;
  if (formalSnowFight && inPlaza && outdoor && !enteredSnowFight) {
    announceActivity('今晚雪够厚，来钟楼广场打雪仗！');
    enteredSnowFight = true;
  }
  if (!formal) enteredSnowFight = false;

  playerTarget.x = x;
  playerTarget.y = active ? airHeight ?? ground : -10000;
  playerTarget.z = -n;
  updateSnowballSession(presence.selfId());
  let remoteCount = 0;
  for (const peer of presence.getSnowballPeers()) {
    if (Math.abs(peer.height - (airHeight ?? ground)) > 10 || remoteCount >= remoteTargetPool.length) continue;
    const target = remoteTargetPool[remoteCount];
    target.id = `p:${peer.id}`;
    target.label = peer.name;
    target.x = peer.east;
    target.y = peer.height;
    target.z = -peer.north;
    remoteSnowballTargets[remoteCount++] = target;
  }
  remoteSnowballTargets.length = remoteCount;
  npcActivity.updateSnowFight(dt, formal && walking, outdoor && inPlaza ? playerTarget : undefined, snowballs.throwNpc);
  updateHeldSnowAction(dt);
  if (snowHatTime > 0 && (snowHatTime -= dt) <= 0) snowOnHead = 0;
  if (snowStaggerTime > 0 && (snowStaggerTime -= dt) <= 0) snowballWalkFactor = 1;
  snowballPhysicsMs = snowballs.update(dt);
  showSnowballScore(snowballs.getState());
  snowballControls.hidden = !active;
}
renderer.domElement.addEventListener('pointerdown', event => {
  if (event.pointerType !== 'mouse' || event.button !== 0 ||
      document.pointerLockElement !== renderer.domElement) return;
  beginSnowAction('mouse');
});
document.addEventListener('pointerup', event => {
  if (event.pointerType === 'mouse' && event.button === 0) finishSnowAction('mouse');
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== renderer.domElement) cancelSnowAction('mouse');
});
addEventListener('blur', () => cancelSnowAction());

const stampSites = [
  { id: 'plaza', label: '钟楼广场', hint: '从「广场南侧」沿广场向北几步。', x: 223, n: 184 },
  { id: 'tavern', label: '未写酒馆', hint: '在酒馆门外，找门口的盖戳牌。', x: 159, n: 221 },
  { id: 'post', label: '新年邮局', hint: '在邮局通往中央桥的路口南侧。', x: 263.5, n: 190 },
  { id: 'museum', label: '2026 纪念馆', hint: '从纪念馆入口的路口走向门厅。', x: 343, n: 255 },
  { id: 'station', label: '火车站', hint: '走进火车站正门，在站厅入口处盖章。', x: 526, n: 315.5 },
  { id: 'bath', label: '温泉浴场', hint: '在温泉浴场西门内侧。', x: 526, n: 159 },
  { id: 'castle', label: '冰雪城堡', hint: '在冰雪城堡西门内侧。', x: 462, n: 71 },
];
let zodiacStorage: Storage | undefined;
try { zodiacStorage = window.localStorage; } catch { /* Use transient progress if storage is blocked. */ }
const zodiac = createZodiacProgress(['mouse', 'snake', 'horse', 'rooster'], zodiacStorage);
const railHorseCharm = createRailHorseCharm(railway, zodiac, () => {
  announceActivity(`马 · 已收集 ${zodiac.count()}/12`);
  playPostChime(true);
});
const passport = createTownPassport(
  { ...activityContext, announce: announceActivity }, stampSites, tavernActivity.getMixIds,
  [stationTicketStamp], riddleActivity.getProgress, zodiac,
);
const passportButton = element<HTMLButtonElement>('town-passport-button');
function showStampCount() {
  const { collected, total } = passport.getProgress();
  passportButton.textContent = `纪念戳册 ${collected}/${total}`;
}
showStampCount();
passportButton.onclick = () => {
  passport.open();
  showStampCount();
};

const stampGeometry = new BoxGeometry();
const stampMarkers = new InstancedMesh(stampGeometry, new MeshLambertMaterial(), stampSites.length * 2);
stampMarkers.name = '小镇盖戳牌';
stampMarkers.visible = false;
const stampTransform = new Matrix4();
const stampPaint = new Color();
function paintStamp(index: number, stamped: boolean) {
  stampMarkers.setColorAt(index * 2 + 1, stampPaint.set(stamped ? '#728eaa' : '#efba67'));
  stampMarkers.instanceColor!.needsUpdate = true;
}
stampSites.forEach((stamp, index) => {
  const { x, n } = stamp;
  const ground = grid.heightAt(x, n);
  const signX = x + .64;
  const signZ = -n;
  const signY = grid.heightAt(signX, n);
  stampMarkers.setMatrixAt(index * 2, stampTransform.makeScale(.19, .9, .2).setPosition(signX, signY + .44, signZ));
  stampMarkers.setColorAt(index * 2, stampPaint.set('#725045'));
  stampMarkers.setMatrixAt(index * 2 + 1, stampTransform.makeScale(.42, .31, .19).setPosition(signX, signY + .91, signZ));
  paintStamp(index, passport.has(stamp.id));
  activitySpots.push({
    x, n, ground, range: 1.4, label: `领取${stamp.label}印章`,
    available: () => !passport.has(stamp.id),
    run() {
      if (passport.collect(stamp.id)) {
        paintStamp(index, true);
        showStampCount();
      }
    },
  });
});
stampMarkers.computeBoundingSphere();
scene.add(stampMarkers);

function localSpot(group: Group, [east, height, z]: readonly number[], range: number, label: string,
  run: (x: number, n: number, ground: number) => void): TownActivitySpot {
  const x = group.position.x + east;
  const n = -group.position.z - z;
  const ground = group.position.y + height;
  return { x, n, ground, range, label, run: () => run(x, n, ground) };
}
const zodiacPostOffice = architecture.get('post-office')!;
const [mouseX, mouseFloor, mouseZ] = postMousePosition;
const mouseCharm = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 6);
mouseCharm.name = '生肖寻宝 · 鼠挂牌';
const mouseParts = [
  [0, .14, 0, .25, .20, .065, '#ddbe90'],
  [-.11, .23, 0, .079, .079, .062, '#b6a589'],
  [.11, .23, 0, .079, .079, .062, '#b6a589'],
  [0, .13, .037, .16, .096, .014, '#959b91'],
  [0, .10, .046, .048, .031, .013, '#654955'],
  [0, .275, 0, .038, .051, .028, '#c89362'],
] as const;
mouseParts.forEach(([dx, y, dz, width, height, depth, color], index) => {
  mouseCharm.setMatrixAt(index, new Matrix4().makeScale(width, height, depth).setPosition(mouseX + dx, mouseFloor + y, mouseZ + dz));
  mouseCharm.setColorAt(index, new Color(color));
});
mouseCharm.visible = zodiac.canCollect('mouse');
zodiacPostOffice.add(mouseCharm);
activitySpots.push({
  ...localSpot(zodiacPostOffice, postMousePosition, .73, '拾取生肖挂件 · 鼠', () => {
    if (!zodiac.collect('mouse')) return;
    mouseCharm.visible = false;
    announceActivity(`鼠 · 已收集 ${zodiac.count()}/12`);
    playPostChime(true);
  }),
  available: () => zodiac.canCollect('mouse'),
});
activitySpots.push(createLighthouseSnakeCharm(architecture.get('lighthouse')!, zodiac, () => {
  announceActivity(`蛇 · 已收集 ${zodiac.count()}/12`);
  playPostChime(true);
}));
const tower = architecture.get('clocktower')!;
const towerStops = tower.userData.stops as Record<'dial' | 'bell' | 'lookout', [number, number, number]>;
const [bellX, bellDeck, bellZ] = towerStops.bell;
const towerBellPosition = tower.localToWorld(new Vector3(bellX, bellDeck + 1.8, bellZ));
const bellMotion = tower.userData.bellMotion as TowerBellMotion;
let bellReservedForCeremony = false;
const towerBellSpot = localSpot(tower, towerStops.bell, 2, '拉绳敲钟', () => {
  if (bellReservedForCeremony) {
    announceActivity('仪式将启，静候钟声');
    return;
  }
  if (festival.ringBell(bellDistance())) {
    bellMotion.strike(.65);
    bellShakeStartedAt = performance.now();
    announceActivity('钟声已响');
  }
});
activitySpots.push(
  localSpot(tower, towerStops.dial, 1.75, '查看钟楼表盘', () => {
    const dialFocus = tower.userData.dialFocus as [number, number, number];
    const focus = tower.localToWorld(new Vector3(...dialFocus));
    activityContext.face(focus.x, -focus.z, focus.y);
    announceActivity('表盘层 · 黄铜指针与传动齿轮');
  }),
  towerBellSpot,
  localSpot(tower, towerStops.lookout, 1.3, '保存钟楼取景', () => {
    const [, deck, opening] = towerStops.lookout;
    const center = tower.localToWorld(new Vector3(0, deck, opening));
    if (!settleTownLanding(center.x, -center.z, center.y)) {
      announceActivity('瞭望台落点被挡住了');
      return;
    }
    activityContext.face(223, 179, 75);
    photoFilename = 'UNWRITTEN-2027-clocktower.png';
  }),
);

function canStandAtActivity(east: number, north: number, feet: number) {
  return walkable(east, north) && !obstructed(east, north, feet);
}

function registerLandmarkActivities(id: string, group: Group) {
  if (id === 'railway-station') {
    const hallNorth = 313.3;
    activitySpots.push({
      x: 526, n: hallNorth, ground: grid.heightAt(526, hallNorth), range: 1.7, label: '查看环镇列车乘车路线',
      run() {
        activityContext.open('环镇列车乘车路线',
          '从站厅出门，沿站前路向西步行到火车站前站，在黄线外候车。列车停稳后可以上车。');
      },
    });
    activitySpots.push(...createRailwayStationSpots(
      group, activityContext, railway, passport, canStandAtActivity, ceremonyClock.now, showLiveRailSchedule,
    ));
  } else if (id === 'hot-spring') {
    activitySpots.push(...hotSpringSoak.spots(group));
    const tea = localSpot(group, hotSpringTeaStand, 1.15, '取一份茶点', () => {
      const now = performance.now();
      if (now < nextBathTeaAt) return;
      nextBathTeaAt = now + 60_000;
      warmFromDrink();
      announceActivity('热茶和点心已备好 · 暖意入身');
    });
    tea.available = () => performance.now() >= nextBathTeaAt;
    activitySpots.push(tea, localSpot(group, hotSpringPhotoStand, 1.2, '保存雪见温泉取景', () => {
      activityContext.face(group.position.x + 12.08, -group.position.z + 8.85, group.position.y + .8);
      photoFilename = 'UNWRITTEN-2027-hot-spring.png';
    }));
    const seats = group.userData.seats as number[][];
    for (const [east, height, z] of seats) {
      activitySpots.push(localSpot(group, [east, .25, z - .85], 1.4, '在温泉馆就座', (x, n, ground) => {
        activityContext.sit({ x, n: n - .85, eyeY: ground + height + .98 - .25, yaw: 0 });
      }));
    }
  } else if (id === 'ice-castle') {
    activitySpots.push(localSpot(group, [15.8, .12, -.36], 1.75, '保存冰晶大殿取景', () => {
      activityContext.face(503.13, 76.92, 14.2);
      photoFilename = 'UNWRITTEN-2027-ice-castle.png';
    }));
    activitySpots.push(...createIceThroneSpots(group, activityContext, canStandAtActivity, filename => {
      photoFilename = filename;
    }));
  }
}
function seatedTavernNpc() {
  if (seated?.tavern) return nearestTownActivity(npcActivity.spots, seated.x, seated.n, ground);
}
function openTavernSeatActions() {
  const drink = tavernActivity.carryAction();
  const talk = seatedTavernNpc();
  const panel = openPlace('酒馆座位', '');
  for (const action of [drink, talk, { label: '起身', run: leaveSeat }]) {
    if (!action) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = action.label;
    button.onclick = () => { placeCard.close(); action.run(); };
    panel.append(button);
  }
}
const tavernSeatAction = { label: '酒馆座位', run: openTavernSeatActions };
function currentAction() {
  if (!walking || airHeight !== undefined || placeCard.open || museumVisit.dialog.open) return undefined;
  if (boardingGround) {
    if (railHorseCharm.visibleTo(camera)) return railHorseCharm.action;
    const stop = railway.currentStop;
    if (stop) return { label: `在${stop.label}下车`, run: () => leaveRide() };
    return { label: '在此下车', run: () => leaveRide() };
  }
  if (seated) {
    if (seated.tavern && (tavernActivity.carryAction() || seatedTavernNpc())) return tavernSeatAction;
    return { label: hotSpringSoak.active() ? '起身离开温泉' : '起身', run: leaveSeat };
  }
  if (museumInspection.active) return { label: '返回展柜', run: museumInspection.close };
  if (museumLaunch.active) return { label: '返回展柜', run: museumLaunch.close };
  const local = museumPosition();
  const museumStop = museumVisit.near(local.x, local.y, local.z);
  if (museumStop) return museumStop;
  const platform = railway.canBoard(x, n, ground);
  if (!homeReturn && platform) {
    return { label: `在${platform.label}上车`, run() {
      if (!railway.board(platform.id)) {
        announceActivity('列车已发车，请稍候下一班');
        return;
      }
      resetMovement();
      boardingGround = { x: platform.x, n: platform.n, ground: platform.ground, yaw };
      rideYawOffset = 0;
      ridePitch = 0;
    } };
  }
  const nearest = nearestTownActivity(activitySpots, x, n, ground);
  if (nearest) return nearest;
  if (!homeReturn && !plazaPhoto.active() && inPlazaPhotoRequestZone(x, n, ground)) return plazaPhotoAction;
  return tavernActivity.carryAction();
}
function interact() {
  currentAction()?.run();
  if (!placeCard.open && !museumVisit.dialog.open) renderer.domElement.focus();
}
actionButton.onclick = interact;
function jump() {
  [x, n] = points.get(selector.value)!;
  const target = layout.plots[plotLabels.indexOf(selector.value)];
  const destinations: Record<string, readonly [number, number]> = {
    '西南河畔街巷': [131, 141], '冰湖雪球场': [350, 79],
    '冰湖滑冰': [lakeSkateGates[0].x, lakeSkateGates[0].n],
    '冰湖冰钓': [iceFishingStation.x - 1.5, iceFishingStation.n - 1.5],
    '东侧扩建步道': [456, 222], '北侧森林街区': [104, 415],
    '火车站': [526, 312], '环镇列车站': [478, 224],
    '温泉浴场': [524, 158], '冰雪城堡': [460, 72],
    '雪团练习场': snowPracticeTarget, '南河岸': [303, 120], '北河岸': [246, 400],
  };
  const [east, north] = target?.door ?? destinations[selector.value] ?? [226, 223];
  yaw = Math.atan2(east - x, north - n);
  ground = surfaceAt(x, n);
  airHeight = undefined;
  riseSpeed = 0;
  pitch = selector.value === '雪团练习场' ? .09 : 0;
}
const walkMouseHelp = '点击画面后移动鼠标转向，WASD 行走，双按 W 或 Shift+W 疾跑，空格跳跃，E 互动，长按左键对准近处雪地收雪，抬头瞄准后松手投掷。';
const walkDragHelp = '当前为拖拽视角：按住左键拖动转向，WASD 行走，双按 W 或 Shift+W 疾跑，空格跳跃，E 互动；点准心下方按钮可锁定鼠标视角。';
let lookLocked = false;
let lockFailure: DesktopLookLockFailure | undefined;
let lastUnlockAt = 0;
function refreshLockHint() {
  lockLookButton.hidden = !(walking && !lookLocked && !touchWalk.active());
  if (!walking || touchWalk.active()) return;
  const help = element('help');
  if (lookLocked) help.textContent = walkMouseHelp;
  else if (lockFailure === 'unsupported')
    help.textContent = '当前浏览器不支持鼠标锁定视角：按住左键拖动转向，WASD 行走。建议改用电脑上的 Chrome 或 Edge 打开本页。';
  else if (lockFailure && lastUnlockAt > 0 && Date.now() - lastUnlockAt < 1500)
    help.textContent = '刚退出鼠标锁定，请稍等一秒再点画面；这段时间可按住左键拖动转向，WASD 行走。';
  else help.textContent = walkDragHelp;
}
function mode(next: boolean) {
  if (homeReturn) {
    leaveSeat();
    leaveSharedHome();
    if (homeReturn) return false;
  }
  lakeSkating.stop();
  if (!leaveRide()) return false;
  leaveSeat();
  resetMovement();
  activityStatus.textContent = '';
  if (next) {
    jump();
    next = settleTownLanding();
  }
  walking = next;
  museumInspection.close();
  museumLaunch.close();
  museumGuide.setActive(false);
  controls.enabled = !next;
  overview.setAttribute('aria-pressed', String(!next));
  walk.setAttribute('aria-pressed', String(next));
  element('help').textContent = next
    ? (touchWalk.active() ? '滑动转向。长按画面对准雪地收雪，手指继续按住向上划动瞄准，松手投掷。' : walkMouseHelp)
    : (touchWalk.active() ? '拖动旋转，双指缩放。' : '拖动旋转，滚轮缩放。可前往街区或建筑入口。');
  if (!next) {
    camera.position.set(540, 494, 177);
    controls.target.set(320, 20, -254);
    controls.update();
  }
  refreshLockHint();
  return true;
}
overview.onclick = () => mode(false);
element('view-valley').onclick = () => {
  if (!mode(false)) return;
  camera.position.set(386, 177, 15);
  controls.target.set(215, 24, -198);
  controls.update();
};
element('view-museum').onclick = () => {
  if (!mode(false)) return;
  camera.position.set(museumEast - 41, museumHeight + 29, -museumNorth + 62);
  controls.target.set(museumEast, museumHeight + 7.0, -museumNorth + 1);
  controls.update();
};
rehearse.onclick = () => {
  if (festival.active() || !mode(false) || !festival.start()) return;
  setNight(true);
  camera.position.set(283, 33, -108);
  controls.target.set(225, 54, -207);
  controls.update();
};
walk.onclick = event => {
  // Native keyboard activation of an already selected mode must not revisit the selected destination.
  if ((!walking || event.detail !== 0) && (!mode(true) || !walking)) return;
  renderer.domElement.focus({ preventScroll: true });
  if (event.isTrusted) townBgm.enter();
  if (event.isTrusted) viewportControls.tryEnterFullscreen();
  desktopLook.engage();
};
selector.onchange = event => {
  if (!mode(true) || !walking) return;
  renderer.domElement.focus({ preventScroll: true });
  if (event.isTrusted) townBgm.enter();
};
const moveKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight']);
const forwardKey = (code: string) => code === 'KeyW' || code === 'ArrowUp';
const forwardHeld = () => keys.has('KeyW') || keys.has('ArrowUp');
function lookAllowed() {
  return walking && !presence.chatFocused() && !museumOverlay() && !placeCard.open && !museumVisit.dialog.open;
}
function moveAllowed() { return lookAllowed() && !seated && !boardingGround && !plazaPhoto.locked(); }
function skatesOnIce() {
  return lakeSkating.enabled() && airHeight === undefined && isLakeSkateIce(x, n) &&
    Math.abs(ground - grid.heightAt(x, n)) <= .16;
}
function turnView(horizontal: number, vertical: number) {
  if (boardingGround) {
    rideYawOffset += horizontal;
    ridePitch = Math.max(-1.42, Math.min(1.42, ridePitch + vertical));
  } else if (seated) {
    seated.yaw += horizontal;
    seated.pitch = Math.max(-1.42, Math.min(1.42, seated.pitch + vertical));
  } else {
    yaw += horizontal;
    pitch = Math.max(-1.42, Math.min(1.42, pitch + vertical));
  }
}
const desktopLook = createDesktopLook(renderer.domElement, lookAllowed, turnView, {
  onLockFailed(reason) {
    lockFailure = reason;
    refreshLockHint();
  },
  onLockChange(nowLocked) {
    lookLocked = nowLocked;
    if (nowLocked) lockFailure = undefined;
    else lastUnlockAt = Date.now();
    refreshLockHint();
  },
});
lockLookButton.onclick = () => {
  if (!lookAllowed()) return;
  renderer.domElement.focus({ preventScroll: true });
  desktopLook.engage();
};
if (typeof renderer.domElement.requestPointerLock !== 'function' ||
    /MicroMessenger|MQQBrowser|QQ\//.test(navigator.userAgent)) envBanner.hidden = false;
const touchLook = createTouchLook(renderer.domElement, lookAllowed, turnView,
  () => boardingGround ? ridePitch : seated?.pitch ?? pitch, touchSnowball, touchLookSensitivity);
const lookSensitivityInput = element<HTMLInputElement>('touch-look-sensitivity');
lookSensitivityInput.value = String(touchLookSensitivity());
lookSensitivityInput.addEventListener('input', () => setTouchLookSensitivity(Number(lookSensitivityInput.value)));
function canJump() {
  return moveAllowed() && landingFeedback.pose() === 'none' && airHeight === undefined &&
    (waterAtFeet()?.depth ?? 0) <= shoreJumpDepth;
}
function requestJump() {
  if (!canJump()) return;
  landingFeedback.begin(ground);
  airHeight = ground;
  riseSpeed = jumpVelocity;
  snowballJumped();
}
touchJump.addEventListener('pointerdown', event => {
  if (event.pointerType === 'touch') { event.preventDefault(); requestJump(); }
});
touchJump.addEventListener('click', requestJump);
addEventListener('keydown', e => {
  if (placeCard.open || museumVisit.dialog.open || e.altKey || e.ctrlKey || e.metaKey || e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement) return;
  if (museumOverlay()) {
    if (e.code === 'Escape' || (e.code === 'KeyE' && !e.repeat)) {
      e.preventDefault();
      interact();
    } else {
      museumInspection.handleKey(e);
    }
    return;
  }
  if ((seated || boardingGround) && e.code === 'Escape') {
    e.preventDefault();
    if (seated) leaveSeat();
    else leaveRide();
    return;
  }
  if (e.code === 'Escape' && document.pointerLockElement === renderer.domElement) {
    desktopLook.release();
    return;
  }
  if (walking && e.code === 'KeyE' && !e.repeat && currentAction()) {
    e.preventDefault();
    interact();
  }
  if (moveAllowed() && e.code === 'Space') {
    if (!e.repeat && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      requestJump();
    }
    return;
  }
  if (moveAllowed() && moveKeys.has(e.code)) {
    if (!e.repeat && forwardKey(e.code) && !forwardHeld()) {
      const now = performance.now();
      doubleForward = now - forwardPressedAt <= 330;
      forwardPressedAt = now;
    }
    keys.add(e.code);
    e.preventDefault();
  }
});
addEventListener('keyup', e => {
  keys.delete(e.code);
  if (!forwardHeld()) doubleForward = false;
});
addEventListener('blur', resetMovement);
let fittedWidth = 0;
let fittedHeight = 0;
function fitRenderer() {
  if (innerWidth === fittedWidth && innerHeight === fittedHeight) return;
  fittedWidth = innerWidth;
  fittedHeight = innerHeight;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  museumInspection.resize(camera.aspect);
  museumLaunch.resize(camera.aspect);
  renderer.setSize(innerWidth, innerHeight);
}
addEventListener('resize', fitRenderer);
addEventListener('orientationchange', fitRenderer);
// Mobile browsers resize the visual viewport when the address bar shows or
// hides; refit then too so the canvas never leaves a gap at the edges.
visualViewport?.addEventListener('resize', fitRenderer);
const startInMuseum = document.body.dataset.start === 'museum' || new URLSearchParams(location.search).get('visit') === 'museum';
if (startInMuseum) selector.value = '纪念馆入口';
let previous = performance.now();
let snowMoveScale = 1;
let chillMoveScale = 1;
let widePanorama = false;
function walkable(x: number, n: number) {
  return homeReturn ? sharedHomeWalkable(x, n) : outdoorWalkable(x, n);
}
function outdoorWalkable(x: number, n: number) {
  const terrainPassable = canEnter(x, n) || bridgeAt(x, n) !== undefined || townWater.at(x, n) !== undefined;
  return terrainPassable && !scenery.blocked(x, n) && !districts.blocked(x, n) &&
    !forest.blocked(x, n) && !streetscape.blocked(x, n);
}
const bodyHeight = 1.8;
const stepHeight = .43;
const surfaceEpsilon = .025;
const gravity = 22;
const jumpVelocity = Math.sqrt(2 * gravity * 1.255);
function surfaceAt(east: number, north: number) {
  if (homeReturn) return sharedHomeSpawn.ground;
  return townWater.at(east, north)?.ground ?? grid.heightAt(east, north);
}
function snowCleared(east: number, north: number, feet: number) {
  return Boolean(homeReturn) || districts.sweptAt(east, north) || roofed(east, north, feet);
}
function waterAtFeet() {
  if (homeReturn || airHeight !== undefined) return undefined;
  const water = townWater.at(x, n);
  return water && Math.abs(ground - water.ground) < .25 ? water : undefined;
}

function storeWalkView(position: Vector3) {
  const water = waterAtFeet();
  position.set(x, (airHeight ?? ground) + (water?.mode === 'swim' ? 1.52 : eye), -n);
}

function overlapsBody(east: number, north: number, { min, max }: Box, radius = bodyRadius) {
  const z = -north;
  const dx = Math.max(min[0] - east, east - max[0], 0);
  const dz = Math.max(min[2] - z, z - max[2], 0);
  return dx * dx + dz * dz < radius * radius;
}

function mascotOutdoorGround(east: number, north: number) {
  if (isWater(east, north) || townWater.at(east, north) || !outdoorWalkable(east, north)) return undefined;
  const feet = grid.heightAt(east, north);
  const { colliders, floors } = outdoorGeometryAt(east, north);
  const blocked = (box: Box) => feet + surfaceEpsilon < box.max[1] &&
    feet + .65 - surfaceEpsilon > box.min[1] && overlapsBody(east, north, box, .18);
  if (colliders.some(blocked) || floors.some(blocked) ||
    activities.some(activity => activity.blocked?.(east, north, feet))) return undefined;
  return feet;
}

function supportAt(east: number, north: number, limit: number, solidLimit = -Infinity) {
  const z = -north;
  let height = surfaceAt(east, north);
  const { floors, ramps, colliders } = geometryAt(east, north);
  for (const floor of floors) {
    if (floor.max[1] <= limit && overlapsBody(east, north, floor)) height = Math.max(height, floor.max[1]);
  }
  for (const ramp of ramps) {
    if (east < ramp.min[0] || east > ramp.max[0] || z < ramp.min[2] || z > ramp.max[2]) continue;
    const axis = ramp.axis === 'x' ? 0 : 2;
    const fraction = ((axis === 0 ? east : z) - ramp.min[axis]) / (ramp.max[axis] - ramp.min[axis]);
    const top = ramp.min[1] + (ramp.max[1] - ramp.min[1]) * (ramp.ascending > 0 ? fraction : 1 - fraction);
    if (top <= limit) height = Math.max(height, top);
  }
  if (solidLimit > -Infinity) {
    for (const solid of colliders) {
      if (solid.max[1] <= solidLimit && overlapsBody(east, north, solid)) height = Math.max(height, solid.max[1]);
    }
  }
  return height;
}

function obstructed(east: number, north: number, feet: number) {
  const intersects = (box: Box) => feet + surfaceEpsilon < box.max[1] &&
    feet + bodyHeight - surfaceEpsilon > box.min[1] && overlapsBody(east, north, box);
  const { colliders, floors } = geometryAt(east, north);
  return railway.vehicleBlocks(east, north, feet, bodyHeight, bodyRadius) ||
    activities.some(activity => activity.blocked?.(east, north, feet)) ||
    colliders.some(intersects) || floors.some(intersects);
}

function dryTownLandingHeight(east: number, north: number, heightHint?: number) {
  if (east < bodyRadius || north < bodyRadius || east > worldBounds.width - bodyRadius ||
    north > worldBounds.depth - bodyRadius || !walkable(east, north)) return undefined;
  if (bridgeAt(east, north) === undefined && (isWater(east, north) || townWater.at(east, north))) return undefined;
  const base = heightHint ?? surfaceAt(east, north);
  const feet = supportAt(east, north, base + stepHeight, base + surfaceEpsilon);
  if (Math.abs(feet - base) > stepHeight || obstructed(east, north, feet)) return undefined;
  return Number.isFinite(feet) ? feet : undefined;
}

function settleTownLanding(targetEast = x, targetNorth = n, heightHint?: number) {
  const dryGround = (east: number, north: number) => dryTownLandingHeight(east, north, heightHint);
  const [plazaEast, plazaNorth] = layout.plaza.spawn;
  const landing = findNearestLegalSpawn({ x: targetEast, n: targetNorth }, dryGround)
    ?? (heightHint === undefined ? findNearestLegalSpawn({ x: plazaEast, n: plazaNorth }, dryGround) : undefined);
  if (!landing) return false;
  landingFeedback.reset();
  ({ x, n, ground } = landing);
  airHeight = undefined;
  riseSpeed = 0;
  return true;
}

function tryMove(nextX: number, nextN: number) {
  if (!walkable(nextX, nextN)) return false;
  const feet = airHeight ?? ground;
  const limit = feet + (airHeight === undefined ? stepHeight : surfaceEpsilon);
  const floor = supportAt(nextX, nextN, limit, airHeight === undefined ? ground + .03 : limit);
  const nextHeight = airHeight === undefined ? floor : feet;
  if (floor > limit || obstructed(nextX, nextN, nextHeight)) return false;
  [x, n] = [nextX, nextN];
  if (airHeight === undefined) {
    if (ground - nextHeight > stepHeight) {
      landingFeedback.begin(ground);
      airHeight = ground;
      riseSpeed = 0;
    } else ground = nextHeight;
  }
  return true;
}

function stepJump(dt: number) {
  if (airHeight === undefined) return;
  const feet = airHeight;
  const next = feet + riseSpeed * dt - .5 * gravity * dt * dt;
  riseSpeed -= gravity * dt;
  if (next > feet) {
    const head = feet + bodyHeight;
    let ceiling = next + bodyHeight;
    function checkCeiling(box: Box) {
      if (box.min[1] >= head - surfaceEpsilon && box.min[1] < ceiling && overlapsBody(x, n, box)) {
        ceiling = box.min[1];
      }
    }
    const { floors, colliders } = geometryAt(x, n);
    floors.forEach(checkCeiling);
    colliders.forEach(checkCeiling);
    if (ceiling < next + bodyHeight) {
      airHeight = Math.max(feet, ceiling - bodyHeight);
      riseSpeed = 0;
      return;
    }
    if (obstructed(x, n, next)) {
      riseSpeed = 0;
      return;
    }
  } else {
    const landing = supportAt(x, n, feet + surfaceEpsilon, feet + surfaceEpsilon);
    if (next <= landing) {
      ground = landing;
      airHeight = undefined;
      riseSpeed = 0;
      const reaction = landingFeedback.land(landing, snowCover.depthAt(x, n, landing, snowCleared) >= .6);
      if (reaction !== 'none' && !reduceSnowEffects.matches && !waterAtFeet()) {
        landingSnow.burst(x, landing + .06, -n);
      }
      return;
    }
  }
  airHeight = next;
}
function faceFrom(east: number, north: number, height: number, heading: number, tilt: number) {
  camera.position.set(east, height, -north);
  camera.lookAt(east + Math.sin(heading) * Math.cos(tilt), height + Math.sin(tilt), -north - Math.cos(heading) * Math.cos(tilt));
}
const windowActivity = createWindowActivity(
  { ...activityContext, announce: announceActivity }, architecture,
  (east, north, feet) => !walkable(east, north) || obstructed(east, north, feet),
);
activities.push(windowActivity);
activitySpots.push(...windowActivity.spots);
const tavern = architecture.get('tavern')!;
const rooster = createTavernRoosterCharm(tavern, windowActivity, zodiac, canStandAtActivity, () => {
  announceActivity(`鸡 · 已收集 ${zodiac.count()}/12`);
  playPostChime(true);
});
if (rooster) activitySpots.push(rooster);
const tavernPlot = layout.plots.find(({ id }) => id === 'tavern');
if (tavernPlot) {
  activitySpots.push(...createTavernSeatSpots(tavernPlot, {
    sit(seat) {
      activityContext.sit(seat);
      if (seated) seated.tavern = true;
    },
  }, canStandAtActivity));
  activitySpots.push(...createTavernWarmShedSpots(tavernPlot, grid.heightAt,
    { ...activityContext, announce: announceActivity }, warmFromDrink, canStandAtActivity));
}
registerHomeDoors(districts.housePortals);
const cabins = architecture.get('cabins');
if (cabins) registerHomeDoors(villageHousePortals(cabins, grid.heightAt));
for (const stop of railway.stops) {
  activitySpots.push({
    x: stop.x, n: stop.n, ground: stop.ground,
    range: 2, label: `查看${stop.label}时刻表`,
    run: () => showLiveRailSchedule(`环镇线 · ${stop.label}`, () => railPlatformCopy(railway, stop, ceremonyClock.now())),
  });
}

const campfireSites = findRegionalCampfires((east, north, height) => {
  if (bridgeAt(east, north) || isLakeSkateIce(east, north) || townWater.at(east, north)) return;
  const base = height ?? grid.heightAt(east, north);
  const feet = supportAt(east, north, base + stepHeight, base + surfaceEpsilon);
  if (Math.abs(feet - base) > (height === undefined ? .30 : .14) ||
      !canStandAtActivity(east, north, feet) || roofed(east, north, feet) ||
      activitySpots.some(spot => Math.abs(spot.ground - feet) < .65 &&
        (spot.x - east) ** 2 + (spot.n - north) ** 2 < .85 ** 2)) return;
  return feet;
});
const outdoorCampfires = createTownCampfires(scene, activityContext, campfireSites);
scenery.setCampfirePieces(campfirePieces(campfireSites));
activities.push(outdoorCampfires);
activitySpots.push(...outdoorCampfires.spots);

function atRailwayPlatform() {
  return walking && !homeReturn && (railway.riding || railway.stops.some(stop =>
    Math.abs(ground - stop.ground) < .65 && Math.hypot(x - stop.x, n - stop.n) < 3));
}

function showLiveRailSchedule(title: string, read: () => string) {
  openPlace(title, read());
  const body = element('place-text');
  body.style.whiteSpace = 'pre-line';
  const timer = window.setInterval(() => {
    if (!placeCard.open || element('place-title').textContent !== title) {
      window.clearInterval(timer);
      return;
    }
    const next = read();
    if (body.textContent !== next) body.textContent = next;
  }, 500);
  placeCard.addEventListener('close', () => {
    window.clearInterval(timer);
    body.style.removeProperty('white-space');
  }, { once: true });
}
mode(startInMuseum);
let presenceSkateSpeed = 0;
let previousPoseSession: number | null = null;
let ceremonyArrivalPose: { value: TownAvatarPose; until: number } | undefined;

function arriveAtCeremony(event: CeremonyArrival, now: number) {
  const landing = ceremonyArrivalAt(event.slot, event.edge);
  if (!landing) return;
  const homeBeforeArrival = homeReturn;
  homeReturn = undefined;
  const feet = dryTownLandingHeight(landing.east, landing.north);
  if (feet === undefined) {
    homeReturn = homeBeforeArrival;
    announceActivity('广场落脚点被挡住，请沿灯路前往广场。');
    return;
  }

  ceremonyArrivalPose = {
    value: effectiveTownAvatarPose(now < drinkingPoseUntil, hotSpringSoak.active(),
      !!boardingGround, !!seated, presenceSkateSpeed),
    until: now + 350,
  };
  if (sharedHome) sharedHome.visible = false;
  camera.layers.set(0);
  railway.cancelRide();
  boardingGround = undefined;
  lastRailStopShown = undefined;
  leaveSeat();
  lakeSkating.stop();
  plazaPhoto.leaveForCeremony();
  if (placeCard.open) placeCard.close();
  if (museumVisit.dialog.open) museumVisit.dialog.close();
  museumInspection.close();
  museumLaunch.close();
  museumGuide.setActive(false);
  resetMovement();

  x = landing.east;
  n = landing.north;
  ground = feet;
  airHeight = undefined;
  riseSpeed = 0;
  const stage = layout.plots.find(({ id }) => id === 'stage')!;
  const [faceEast, faceNorth, faceHeight] = landing.focus === 'tree'
    ? [208, 198, 26]
    : [stage.origin[0], stage.origin[1], stage.origin[2] + 15];
  yaw = Math.atan2(faceEast - x, faceNorth - n);
  pitch = Math.atan2(faceHeight - ground - eye, Math.hypot(faceEast - x, faceNorth - n));
  faceFrom(x, n, ground + eye, yaw, pitch);
  presence.sample(walking, x, n, ground, yaw);
  if (!event.edge && !reduceSnowEffects.matches) {
    const blackout = document.createElement('div');
    blackout.style.cssText = 'position:fixed;inset:0;background:#000;z-index:1000;pointer-events:none';
    document.body.append(blackout);
    const fade = blackout.animate([{ opacity: 1 }, { opacity: 0 }], 350);
    void fade.finished.then(() => blackout.remove(), () => blackout.remove());
  }
}

presence.onCeremonyArrival(arrival => arriveAtCeremony(arrival, performance.now()));
renderer.setAnimationLoop(now => {
  const frameSeconds = Math.max(0, now - previous) / 1000;
  const dt = Math.min(.25, frameSeconds);
  previous = now;
  const startEast = x, startNorth = n;
  movementStepMs = 0;
  landingFeedback.update(frameSeconds);
  landingSnow.update(frameSeconds);
  const beacon = architecture.get('lighthouse')?.userData.beaconPivot as Object3D | undefined;
  railway.update(dt);
  if (boardingGround) {
    const stopped = railway.currentStop;
    if (stopped && stopped.id !== lastRailStopShown) {
      lastRailStopShown = stopped.id;
      announceActivity(`${stopped.label}到了。${stopped.arrival}`);
    } else if (!stopped) lastRailStopShown = undefined;
  }
  if (beacon) {
    beacon.visible = nightMode;
    if (nightMode) beacon.rotation.y = (beacon.rotation.y + .28 * dt) % (Math.PI * 2);
  }
  if (museumOverlay()) {
    element('position').textContent = '';
  } else if (walking && boardingGround) {
    railway.view.getWorldPosition(camera.position);
    railway.view.getWorldDirection(lookAhead);
    const heading = Math.atan2(lookAhead.x, -lookAhead.z);
    const slot = presence.riderSlot();
    const side = slot % 2 ? .50 : -.50;
    const row = (Math.floor(slot / 2) - 2.5) * .62;
    const seatX = camera.position.x + lookAhead.x * row - lookAhead.z * side;
    const seatZ = camera.position.z + lookAhead.z * row + lookAhead.x * side;
    faceFrom(seatX, -seatZ, camera.position.y, heading + rideYawOffset, ridePitch);
    const stop = railway.currentStop;
    element('position').textContent = stop ? `环镇列车 · 到达${stop.label}` :
      `下一站：${railway.nextStop.label} · 按动作键在此下车`;
  } else if (walking && seated) {
    faceFrom(seated.x, seated.n, seated.eyeY, seated.yaw, seated.pitch);
    element('position').textContent = '已就座';
  } else if (walking) {
    const forward = Number(forwardHeld()) - Number(keys.has('KeyS') || keys.has('ArrowDown')) + touchWalk.axes.forward;
    const right = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft')) + touchWalk.axes.right;
    const sprint = forward > .12 && (doubleForward || keys.has('ShiftLeft') || keys.has('ShiftRight') || touchWalk.sprinting);
    const movementStartedAt = performance.now();
    storeWalkView(walkRender);
    if (!walkRender.equals(walkCurrent)) {
      // Snap after teleports and seating changes instead of interpolating across town.
      walkClock.reset();
      snowMoveScale = chillMoveScale = 1;
      walkPrevious.copy(walkRender);
      walkCurrent.copy(walkRender);
    }
    let interpolation = 1;
    if (moveAllowed()) {
      const chillEnabled = ceremonyFrost.enabled();
      const chillTarget = ceremonyFrost.walkingScale();
      const speed = (sprint ? 11.3 : 7.5) * snowballWalkFactor * landingFeedback.walkingScale() /
        Math.max(1, Math.hypot(forward, right));
      const east = (Math.sin(yaw) * forward + Math.cos(yaw) * right) * speed;
      const north = (Math.cos(yaw) * forward - Math.sin(yaw) * right) * speed;
      interpolation = walkClock.advance(frameSeconds, () => {
        walkPrevious.copy(walkCurrent);
        if (skatesOnIce() && landingFeedback.pose() === 'none') {
          snowMoveScale = chillMoveScale = 1;
          const glide = lakeSkateMotion.step(east, north, townPhysicsDelta);
          const glideEast = x, glideNorth = n;
          if ((glide.east || glide.north) &&
            !tryMove(x + glide.east * townPhysicsDelta, n + glide.north * townPhysicsDelta)) lakeSkateMotion.reset();
          presenceSkateSpeed = Math.hypot(x - glideEast, n - glideNorth) / townPhysicsDelta;
        } else {
          lakeSkateMotion.reset();
          if (speed > 0 && landingFeedback.pose() === 'none' && (forward || right)) {
            const water = waterAtFeet();
            let moveScale = 1;
            if (water || airHeight !== undefined) {
              snowMoveScale = chillMoveScale = 1;
              moveScale = water ? water.speed * (sprint ? 7.5 / 11.3 : 1) : (sprint ? 1 : .8);
            } else {
              const target = snowCover.movementScale(x, n, ground, snowCleared, sprint);
              snowMoveScale = approachTownSnowScale(snowMoveScale, target, townPhysicsDelta);
              chillMoveScale = chillEnabled ? approachTownSnowScale(chillMoveScale, chillTarget, townPhysicsDelta) : 1;
              moveScale = snowMoveScale * chillMoveScale;
            }
            const nx = x + east * moveScale * townPhysicsDelta;
            const nn = n + north * moveScale * townPhysicsDelta;
            if (!tryMove(nx, nn) && !tryMove(nx, n)) tryMove(x, nn);
          }
        }
        stepJump(townPhysicsDelta);
        if (lakeSkating.enabled()) lakeSkating.onPosition(x, n, townPhysicsDelta, isLakeSkateIce(x, n));
        storeWalkView(walkCurrent);
      });
    } else {
      walkPrevious.copy(walkCurrent);
    }
    movementStepMs = performance.now() - movementStartedAt;
    walkRender.lerpVectors(walkPrevious, walkCurrent, interpolation);
    const water = waterAtFeet();
    const landingPose = landingFeedback.pose();
    const dip = landingPose === 'prone' ? 1.21 : reduceSnowEffects.matches ? 0 : .22 * landingFeedback.compression();
    const landingTilt = landingPose === 'prone' && !reduceSnowEffects.matches ? Math.min(pitch, -.24) : pitch;
    faceFrom(walkRender.x, -walkRender.z, walkRender.y - dip, yaw, landingTilt);
    const movement = landingPose === 'prone' ? '趴倒' : landingPose === 'compress' ? '落地' :
      water?.mode === 'swim' ? '游泳' : water?.mode === 'wade' ? '涉水' :
      airHeight !== undefined ? '腾空' : skatesOnIce() ? '滑冰' : sprint ? '疾跑' : '行走';
    element('position').textContent = `东 ${x.toFixed(1)} m · 北 ${n.toFixed(1)} m · ${movement}`;
  } else {
    controls.update();
    element('position').textContent = '';
  }
  if (!walking || !moveAllowed() || !skatesOnIce()) presenceSkateSpeed = 0;
  const poseSession = presence.selfId();
  if (!walking || (previousPoseSession !== null && previousPoseSession !== poseSession)) drinkingPoseUntil = 0;
  previousPoseSession = poseSession;
  if (ceremonyArrivalPose && now >= ceremonyArrivalPose.until) ceremonyArrivalPose = undefined;
  const activityPose = walking && landingFeedback.pose() === 'prone'
    ? effectiveTownAvatarPose(false, false, false, true, 0)
    : effectiveTownAvatarPose(now < drinkingPoseUntil, hotSpringSoak.active(), !!boardingGround, !!seated, presenceSkateSpeed);
  presence.setActivityPose(ceremonyArrivalPose?.value ?? activityPose);
  presence.sample(walking,
    boardingGround ? camera.position.x : seated?.x ?? x,
    boardingGround ? -camera.position.z : seated?.n ?? n,
    boardingGround ? camera.position.y - eye : airHeight ?? ground,
    boardingGround ? Math.atan2(lookAhead.x, -lookAhead.z) + rideYawOffset : seated?.yaw ?? yaw,
    walking && !museumOverlay(),
  );
  presence.update(dt);
  const wideView = !walking && camera.position.y > (widePanorama ? 232 : 248);
  widePanorama = wideView;
  const cullAerial = !walking && !wideView && camera.position.y > 95 && !profileOriginalDraws;
  const stationView = !profileOriginalDraws && walking && !homeReturn && !boardingGround
    && Math.abs(camera.position.x - frontRailStation.x) < 2.1
    && Math.abs(-camera.position.z - frontRailStation.n) < 10
    && camera.position.y > frontRailStation.ground + .8
    && camera.getWorldDirection(lookAhead).x < -.24;
  if (!stationView) stationViewStillSince = Infinity;
  else if (!Number.isFinite(stationViewStillSince) || !previousStationEye.equals(camera.position)) {
    stationViewStillSince = now;
    previousStationEye.copy(camera.position);
  }
  // Defer rebuilding while walking. Reuse the padded selection while standing and looking around.
  const cullStationView = now - stationViewStillSince >= 150;
  const cullStaticView = cullAerial || cullStationView;
  const warmStationView = stationView && !cullStationView;
  const cullCamera = cullStationView ? stationViewCamera() : cullAerial ? camera : undefined;
  const warmAerial = wideView && !profileOriginalDraws && aerialWarmFrames++ < 60;
  const detailStartedAt = profileTown ? performance.now() : 0;
  snowCover.update(dt, nightMode);
  if (!homeReturn) prepareTerrain(camera.position.x, -camera.position.z, !walking, wideView, visualSnowCover, cullCamera);
  const terrainMs = profileTown ? performance.now() - detailStartedAt : 0;
  forest.setPanorama(wideView);
  districts.setPanorama(wideView);
  showWideBridges(wideView);
  railway.setPanorama(wideView);
  stampMarkers.visible = !wideView && stampSites.some(site =>
    Math.abs(camera.position.x - site.x) < 34 && Math.abs(camera.position.z + site.n) < 34 &&
    Math.abs(camera.position.y - grid.heightAt(site.x, site.n)) < 18);
  const towerInterior = architecture.get('clocktower')?.userData.detailInterior as Group | undefined;
  if (towerInterior) towerInterior.visible = !wideView && Math.hypot(camera.position.x - 226, camera.position.z + 223) < 45;
  if (!homeReturn) prepareLandmarks(camera.position.x, -camera.position.z, !walking);
  if (!homeReturn && !streetsRequested && (!walking || camera.position.x > 320 || -camera.position.z > 275)) {
    streetsRequested = true;
    import('./extension-streets').then(({ buildExtensionStreets }) => {
      extensionStreets = buildExtensionStreets(grid, railway.keepClear, districts.keepClear);
      scene.add(extensionStreets.group);
      walkGeometry = geometry();
      activitySpots.push(...createCourtyardSeatSpots(extensionStreets, activityContext, canStandAtActivity));
      registerHomeDoors(extensionStreets.housePortals);
    }).catch(error => {
      streetsRequested = false;
      console.error('Loading extension streets', error);
    });
  }
  extensionStreets?.update(camera, wideView);
  const baths = architecture.get('hot-spring');
  if (baths) baths.userData.updateSteam(dt, camera.position.distanceTo(baths.position));
  scenery.update(dt, walking, camera.position.x, camera.position.y, camera.position.z);
  outdoorCampfires.updateFlames(dt, camera.position.x, -camera.position.z, Boolean(homeReturn));
  const museum = architecture.get('memorial');
  const smallLabels = museum?.userData.smallLabels as Mesh[] | undefined;
  if (smallLabels) for (const label of smallLabels) label.visible = !wideView;
  const interior = museum?.userData.detailInterior as Group | undefined;
  if (interior && museum) {
    interior.visible = Math.abs(camera.position.x - museumEast) < 48 &&
      Math.abs(camera.position.z + museumNorth) < 43 &&
      camera.position.y - museumHeight < 16;
  }
  updateMuseumLights(dt, camera.position);
  const local = museumPosition();
  const sheltered = walking && Math.abs(local.x) < 19.55 && local.z > -13.7 && local.z < 12.85;
  const shedEast = seated?.x ?? x;
  const shedNorth = seated?.n ?? n;
  const shedFeet = airHeight ?? ground;
  const shedSheltered = walking && !homeReturn && inTavernWarmShed(tavernPlot, shedEast, shedNorth, shedFeet);
  if (now >= nextBgmRoomCheck) {
    nextBgmRoomCheck = now + 180;
    townBgm.setIndoor(walking && (Boolean(homeReturn) || sheltered ||
      roofed(seated?.x ?? x, seated?.n ?? n, ground)));
  }
  festival.update(dt);
  const ceremonyState = ceremony.update();
  const weatherStartedAt = profileTown ? performance.now() : 0;
  const weather = townSnowWeatherForFrame(ceremonyState);
  const effectiveSnowIntensity = weather.intensity;
  const roofSheltered = walking && !boardingGround && !homeReturn && !sheltered && !shedSheltered &&
    roofed(shedEast, shedNorth, shedFeet);
  snowfall.setIntensity(effectiveSnowIntensity);
  snowfall.update(camera, dt, walking, sheltered || shedSheltered || roofSheltered || Boolean(homeReturn));
  weatherFog.near = weather.fogNear;
  weatherFog.far = weather.fogFar;
  // Weather changes the snow tint and cold exposure. The movement and gathering cover
  // still follows the existing ceremony intensity and night mode.
  visualSnowCover = ceremonyState.phase === 'ordinary'
    ? advanceWeatherCover(visualSnowCover, dt, weather)
    : snowCover.amount();
  const weatherMs = profileTown ? performance.now() - weatherStartedAt : 0;
  const overnightBoard = architecture.get('railway-station')?.userData.railOvernightBoard as Group | undefined;
  if (overnightBoard) overnightBoard.visible = Boolean(railOvernightBoardCopy(ceremonyState.now));
  const railNotice = railOvernightBroadcast(ceremonyState.now, atRailwayPlatform);
  if (railNotice) announceActivity(railNotice);
  ceremonyOverlay.apply(ceremonyState);
  const indoors = sheltered || Boolean(homeReturn) || shedSheltered || roofSheltered;
  ceremonyFrost.setWarmth('interior', indoors);
  ceremonyFrost.setWarmth('onsen', hotSpringSoak.active());
  ceremonyFrost.setWarmth('fire-source', homeReturn
    ? sharedHomeHearthWarmth(shedEast, shedNorth, shedFeet)
    : walking && !boardingGround && ((shedSheltered && nearTavernWarmShedFire(tavernPlot, shedEast, shedNorth, shedFeet)) ||
      (!indoors && outdoorCampfires.warmAt(shedEast, shedNorth, shedFeet))));
  if (warmDrinkUntil && now >= warmDrinkUntil) {
    warmDrinkUntil = 0;
    ceremonyFrost.setWarmth('hot-drink', false);
  }
  let coldSurface: FrostExposure = 'none';
  let coldDepth = 0;
  if (walking && !indoors && !boardingGround && airHeight === undefined && !isLakeSkateIce(shedEast, shedNorth)) {
    if (!seated && waterAtFeet()) coldSurface = 'water';
    else if (!nightMode || scenery.litAt(shedEast, shedNorth, shedFeet) || townLights.litAt(shedEast, shedNorth, shedFeet)) {
      coldSurface = 'lamp';
    } else if (effectiveSnowIntensity >= 2 && isExposedSnowAt(grid, shedEast, shedNorth, shedFeet, districts.sweptAt)) {
      coldSurface = 'dark-snow';
      coldDepth = snowCover.depthAt(shedEast, shedNorth, shedFeet, districts.sweptAt);
    }
  }
  ceremonyFrost.setExposure(effectiveSnowIntensity, coldDepth, coldSurface, hasFrostCeremonyRelief(ceremonyState));
  ceremonyFrost.update(dt);
  stageActivity.syncCeremony(ceremonyState.now, walking ? x : Infinity, n);
  if (hourlyBellsRemaining && ceremonyState.now >= nextHourlyBell) {
    if (ceremonyState.now - nextHourlyBell < 800) bellMotion.strike(.65);
    hourlyBellsRemaining--;
    nextHourlyBell += 2020;
  }
  bellMotion.update(dt);
  const reserveBell = ceremonyState.phase === 'climax' ||
    (ceremonyState.secondsToMidnight !== null && ceremonyState.secondsToMidnight <= 300);
  if (reserveBell !== bellReservedForCeremony) {
    bellReservedForCeremony = reserveBell;
    towerBellSpot.label = reserveBell ? '仪式将启，静候钟声' : '拉绳敲钟';
  }
  if (ceremonyState.phase === 'climax') {
    const offset = ceremonyClock.utcOffsetMinutes;
    const elapsed = ceremonyState.now - ceremonyMidnight(ceremonyEveYear(ceremonyState.now, offset), offset);
    townLights.setCeremonyBand(Math.min(3, Math.floor(elapsed / 600)));
  } else {
    townLights.setCeremonyBand(ceremonyState.phase === 'afterglow' ? 3 : -1);
  }
  if (walking && (x - 126) ** 2 + (n - 115) ** 2 < 400) riddleActivity.syncNearby();
  updateSnowFight(dt);
  for (const activity of activities) activity.update?.(frameSeconds);
  rehearse.disabled = festival.active();
  const canControl = walking && !placeCard.open && !museumVisit.dialog.open;
  touchWalk.setAllowed(moveAllowed());
  crosshair.hidden = !lookAllowed();
  touchJump.hidden = !moveAllowed() || !touchWalk.active();
  touchJump.disabled = !canJump();
  touchSprintButton.hidden = !moveAllowed() || !touchWalk.active();
  museumMapButton.hidden = !canControl || museumOverlay() || Math.abs(local.x) > 29 || Math.abs(local.z) > 19;
  const action = currentAction();
  actionButton.hidden = !action;
  const label = action ? (touchWalk.active() ? action.label : `E · ${action.label}`) : '';
  if (label !== actionButton.textContent) actionButton.textContent = label;
  const groupPhotoFrame = plazaPhoto.update({
    east: x, north: n, height: ground,
    active: canControl && !homeReturn && !boardingGround && airHeight === undefined && !museumOverlay(),
  });
  if (museumLaunch.active) { museumLaunch.update(frameSeconds); museumLaunch.render(); }
  else if (museumInspection.active) museumInspection.render();
  else {
    const startedFeedback = profileTown ? performance.now() : 0;
    if (moveAllowed()) hitFeedback.apply(camera);
    const feedbackMs = profileTown ? performance.now() - startedFeedback : 0;
    const batchesStartedAt = profileTown ? performance.now() : 0;
    const staticViewRoots = cullStaticView || warmAerial || warmStationView ? [landscape, detailedBridges,
      ...(trackViewRoot ? [trackViewRoot] : []), ...(extensionStreets ? [extensionStreets.group] : []),
      ...architecture.values()] : [];
    if (warmAerial || warmStationView) {
      viewBatches.warm(staticViewRoots);
      viewFaces.warm(architecture.values());
    }
    viewBatches.update(cullStaticView, cullCamera ?? camera, staticViewRoots);
    viewFaces.update(cullStaticView, camera.position, architecture.values());
    const detailMs = profileTown ? terrainMs + performance.now() - batchesStartedAt : 0;
    const shakeAge = now - bellShakeStartedAt;
    const shakeBell = walking && shakeAge >= 0 && shakeAge < 320 && !reduceSnowEffects.matches;
    if (shakeBell) {
      cameraBeforeBellShake.copy(camera.quaternion);
      camera.rotateZ(.0022 * Math.sin(shakeAge * .036) * (1 - shakeAge / 320));
    }
    const drinkStartedAt = profileTown ? performance.now() : 0;
    tavernDrinkEffects.apply(camera, now, walking && (x !== startEast || n !== startNorth), walking);
    let drinkEffectsMs = profileTown ? performance.now() - drinkStartedAt : 0;
    try {
      if (groupPhotoFrame) {
        createTheaterPhotoCamera(groupPhotoFrame.view, groupPhotoFrame.people, grid.heightAt, plazaCamera);
        renderer.getSize(plazaCanvasSize);
        const width = Math.floor(Math.min(plazaCanvasSize.x, plazaCanvasSize.y * plazaCamera.aspect));
        const height = Math.floor(width / plazaCamera.aspect);
        const left = Math.floor((plazaCanvasSize.x - width) / 2);
        const bottom = Math.floor((plazaCanvasSize.y - height) / 2);
        renderer.setScissorTest(false);
        renderer.clear();
        renderer.setViewport(left, bottom, width, height);
        renderer.setScissor(left, bottom, width, height);
        renderer.setScissorTest(true);
        try {
          presence.renderPlazaPhoto(groupPhotoFrame.people, plazaCamera, groupPhotoFrame.showNames);
          renderer.render(scene, plazaCamera);
          if (groupPhotoFrame.shutter) {
            const ratio = renderer.getPixelRatio();
            plazaPhoto.capture(renderer.domElement, plazaCamera, groupPhotoFrame, {
              x: Math.round(left * ratio),
              y: renderer.domElement.height - Math.round((bottom + height) * ratio),
              width: Math.round(width * ratio),
              height: Math.round(height * ratio),
            });
          }
        } finally {
          renderer.setScissorTest(false);
          renderer.setViewport(0, 0, plazaCanvasSize.x, plazaCanvasSize.y);
        }
      } else renderer.render(scene, camera);
    }
    finally {
      const restoreStartedAt = profileTown ? performance.now() : 0;
      tavernDrinkEffects.restore(camera);
      if (shakeBell) camera.quaternion.copy(cameraBeforeBellShake);
      if (profileTown) drinkEffectsMs += performance.now() - restoreStartedAt;
    }
    if (profileTown) {
      renderer.domElement.dispatchEvent(new CustomEvent('town-frame-profile', { detail: {
        frameMs: frameSeconds * 1000, feedbackMs, drinkEffectsMs,
        movementMs: movementStepMs, snowballMs: snowballPhysicsMs,
        calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, cameraY: camera.position.y, detailMs,
        weatherMs, weatherTier: weather.tier, snowIntensity: effectiveSnowIntensity, snowCover: visualSnowCover,
        fogNear: weatherFog.near, fogFar: weatherFog.far, points: renderer.info.render.points,
      } }));
    }
  }
  if (photoFilename) {
    const filename = photoFilename;
    photoFilename = undefined;
    downloadTownCanvas(renderer.domElement, filename);
  }
});
