import {
  AmbientLight, BoxGeometry, BufferAttribute, BufferGeometry, Color, DirectionalLight, DoubleSide, Fog, Group,
  InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial, Object3D, PerspectiveCamera, PointLight, Quaternion, Raycaster, Scene, Vector2, Vector3, WebGLRenderer, Frustum, Sphere,
} from 'three';
import { addScenery } from './scenery';
import { buildPineCamp } from './town-pine-camp';
import { createPineCampActivity } from './town-pine-camp-activity';
import { createPineFireActivities, createRegionalCarry, isPineStoryTime } from './town-pine-camp-fire-activity';
import { readWalkGeometry, type Box, type Ramp, type TownPlot } from './landmark-kit';
import { buildTowerLandmark, setClocktowerDuskLighting, updateTowerWingVisibility, type TowerBellMotion } from './landmark-tower';
import { updateTowerTime } from './clocktower-face';
import { createDailyTowerChime } from './town-clocktower-time';
import { buildTavernLandmark, tavernInteriorContains, updateTavernInteriorVisibility } from './landmark-tavern';
import type { IceCastleRefinementRuntime } from './ice-castle-refinement';
import type { createIcePalaceLandmarkActivity } from './ice-palace-landmark-activity';
import type { IcePalaceRace } from './ice-palace-race';
import type { CastleIceSlideLanding, createCastleIceSlideActivity } from './ice-palace-slide';
import { createIcePalaceCrown } from './ice-palace-crown';
import './ice-palace-crown.css';
import { buildPostLandmark, setPostOpeningReady } from './landmark-post';
import { buildCultureLandmark } from './landmark-culture';
import { buildMarketLandmark, marketOxSite } from './landmark-market';
import { buildIcePlayProps, buildLakesideLandmark } from './landmark-lakeside';
import { buildVillageLandmark, villageHousePortals } from './landmark-village';

import { bridgeAt, canEnter, createTerrainGrid, isWater, layout, waterHeight, worldBounds } from './terrain';
import { addTerrainMeshes } from './terrain-mesh';
import { createMainSummitBlock, mainSummitLayout, mainSummitSpec } from './main-summit-block';
import { createZa22CloudRoute } from './town-za22-cloud-route';
import { mountZa29GuardPost, type Za29GuardPostKind } from './town-za29-guard-scenes';
import { createZa29GuardDuty } from './town-za29-guard-duty';
import { createTownViewBatches } from './town-view-batches';
import { createTownViewFaces } from './town-view-faces';
import { addDistrictHousing } from './district-layout';
import { sharedHomeLayer } from '../../../src/presence/shared-home-space';
import { buildSharedHome, createSharedHomeSpots, sharedHomeHearthWarmth, sharedHomeSpawn, sharedHomeWalkable } from './landmark-shared-home';
import { type TownHousePortal } from './town-house-portals';
import { createHouseDoorBook, findHouseDoorLanding, houseDoorBookCopy, recordHouseDoorVisit, renderHouseDoorBook } from './town-house-door-book';
import { prewarmHouseDoorTextures } from './town-house-door-textures';
import './town-house-door-book.css';
import { addForestDensity } from './forest-density';
import { addStreetscape } from './streetscape';
import { addNewYearDecor } from './town-new-year';
import { createSnowfall } from './snowfall';
import { createFestival, makeTestFireworksTable } from './festival';
import { createTownFireworksActivity } from './town-fireworks-activity';
import { createTownPersonalFireworks, firecrackerStand } from './personal-firework-activity';
import { personalFireworkRestricted } from '../../../src/presence/personal-fireworks';
import {
  ceremonyEveYear, ceremonyMidnight, createCeremonyDirector, createCeremonyOverlay, type CeremonyCue,
} from './town-ceremony';
import { loadRehearsalClock } from './town-rehearsal-clock';
import { ceremonyArrivalAt, ceremonyLateWindowMs, townCeremonyMidnight, type CeremonyArrival } from '../../../src/presence/ceremony-arrival';
import { wallCellOf } from '../../../src/presence/snowfight';
import { createCeremonyFrost, hasFrostCeremonyRelief, isExposedSnowAt, type FrostExposure } from './town-frost';
import { campfirePieces, createTownCampfires, findRegionalCampfires, pineCampfireId } from './town-campfires';
import { createForestCampfire, findForestChopSites } from './town-forest-campfire';
import { createLongHallRelay, longHallRelayStamp } from './long-hall-relay';
import { createLandingFeedback } from './landing-feedback';
import { createLandingSnow } from './landing-snow';
import { buildMuseumLandmark } from './landmark-museum';
import type { MuseumLight } from './museum-kit';
import { createMuseumVisit } from './museum-visit';
import { createTouchWalk } from './touch-walk';
import { createViewportControls } from './town-viewport';
import { createTouchLook } from './touch-look';
import { setTouchLookSensitivity, touchLookSensitivity } from './touch-look-curve';
import { particleDensityScale, qualityPixelRatioCap, qualityTier, setQualityTier } from './town-quality';
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
import { stageProgram } from './stage-choreography';
import { createMarketActivity } from './market-activity';
import { createMarketFairActivity, marketStalls, marketTastingStamp } from './market-fair';
import { createMarketResidentStationLookup } from './market-resident-stations';
import { createMarketVenueActivities } from './market-venue-activities';
import { createIceActivity } from './ice-activity';
import { createIceFishingActivity, iceFishingCatalogueStamp, iceFishingStation } from './ice-fishing-activity';
import { createLakeSkatingActivity } from './lake-skating-activity';
import { isLakeSkateIce, lakeSkateGates, lakeSkateStation } from './lake-skate-course';
import { createLakeSkateMotion } from './lake-skate-motion';
import { createWishActivity } from './wish-activity';
import { createRestActivity } from './town-rest-activity';
import { createHotSpringSoak, hotSpringPools } from './hot-spring-soak';
import { hotSpringPhotoStand, hotSpringTeaStand } from './hot-spring-details';
import { createWindowActivity } from './town-window';
import { extensionPlots, extensionRoadClearance, extensionStreetClearance } from './town-extension';
import { createTownRailway, type TownRailStopId } from './town-railway';
import { createRailOvernightBroadcast, railOvernightBoardCopy, railPlatformCopy } from './town-rail-copy';
import { isSharedHomePosition } from '../../../src/presence/shared-home-space';
import { createMascotFollower, type MascotFollowPoint } from './mascot-follow';
import { addTownRailWayfinding } from './town-rail-wayfinding';
import { createTownNpcActivity, townNpcDoorAnchors } from './town-npc';
import { createPlazaResidentGathering, registerTownResidentStations } from './town-npc-stations';
import { npcAuthoredDialogue } from './town-npc-dialogue';
import { createTownPresence } from './town-presence';
import { createClocktowerStorySpots } from './clocktower-story';
import { effectiveTownAvatarPose, type TownAvatarPose } from './town-presence-pose';
import { inPlazaPhotoRequestZone } from '../../../src/presence/plaza-photo';
import { createTheaterPhotoCamera } from './theater-photo-camera';
import { createPlazaGroupPhoto } from './plaza-group-photo';
import './plaza-group-photo.css';
import { downloadTownCanvas } from './town-photo-download';
import { createTownPassport } from './town-passport';
import { buildMascotPen } from './landmark-mascot-pen';
import { busStationCatalogueStamp, createBusStationHiddenActivity } from './bus-station-hidden-activity';
import { createZodiacProgress, postMousePosition } from './town-zodiac';
import { createLighthouseSnakeCharm } from './town-zodiac-snake';
import { createTownZodiacSites } from './town-zodiac-atlas';
import { createZodiacDogPostcard } from './town-zodiac-dog';
import { buildTigerZodiacAnchor, tigerZodiacSite } from './town-zodiac-tiger-anchor';
import {
  greenhouseRabbitSite, hotSpringPigSite, lanternWorkshopMonkeySite, towerDragonClues, towerDragonSite, workshopMonkeyClues,
} from './town-zodiac-sites';
import { createRailHorseCharm, railHorseClues } from './town-zodiac-rail';
import { createTavernRoosterCharm, tavernRoosterClues } from './town-zodiac-rooster';
import { createCourtyardSeatSpots, createIceThroneSpots, createRailwayStationSpots, stationTicketStamp } from './landmark-refinement-activity';
import { createTownLights } from './town-lights';
import { createTownWater, shoreJumpDepth } from './town-water';
import { craterWestSurvey, mountWestCraterRoad } from './town-za22-crater-road';
import { createTownPhysicsClock, townPhysicsDelta } from './town-physics-clock';
import { findNearestLegalSpawn } from './town-spawn';
import { approachTownSnowScale } from './town-snow-cover';
import { createTownSnowField } from './town-snow-field';
import { createPlazaInformationActivity } from './plaza-information-activity';
import { createPlazaSnowSupply, type PlazaSnowSupplySite } from './plaza-snow-supply';
import { advanceWeatherCover, townSnowWeatherForFrame } from './town-weather';
import { createSledRide, createSledWallCollider } from './sled-ride';
import { createTownSledVisuals } from './sled-visuals';
import { resolveTownSledRacks } from './town-sled-racks';
import { createSledAnimation } from './sled-animation';
import { createSledDrift } from './sled-drift';
import { createGrandPrix } from './town-grand-prix';
import { createSledTrackView } from './town-sled-track-view';
import { createTownSnowballFight, type SnowballState } from './town-snowball';
import { createTownSnowControls } from './town-snow-controls';
import { mountTownMobileControls } from './town-mobile-controls';
import './town-mobile-controls.css';
import { snowResourceLimit } from '../../../src/shared/snow-stock';
import { createTeamSnowfight } from './town-snowfight';
import { createSnowballSweep } from './town-snowball-world';
import { createSnowPracticeTarget, snowPracticeStand, snowPracticeTarget, type TownSnowballTarget } from './town-snow-target';
import { createTownSnowballBoard } from './town-snowball-board';
import { createTownBellGame } from './town-bell';
import { addTownSnowBoard } from './town-snow-board';
import { createSnowballHitFeedback } from './snowball-hit-feedback';
import './snowball-impact-texture.css';

const element = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id)! as T;
const previewOptions = new URLSearchParams(location.search);
const grid = createTerrainGrid();
const townWater = createTownWater(grid);
const snowCover = createTownSnowField(grid);
let visualSnowCover = 0;
const scene = new Scene();
let westCraterRoad: ReturnType<typeof mountWestCraterRoad> | undefined;
function ensureWestCraterRoad() {
  if (!westCraterRoad) {
    westCraterRoad = mountWestCraterRoad(worldBounds.depth, (north) => grid.groundHeightAt(0, north));
    scene.add(westCraterRoad.group);
  }
  return westCraterRoad;
}
scene.background = new Color('#adc2dd');
const weatherFog = new Fog('#adc2dd', 360, 1300);
scene.fog = weatherFog;
const townFar = 1400;
const summitSkylineFar = 2400;
const reportSummitSkyline = previewOptions.get('summitSkyline') === 'on';
const camera = new PerspectiveCamera(58, innerWidth / innerHeight, .1, summitSkylineFar);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, qualityPixelRatioCap()));
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
// Use the surveyed mountain alignment for the town's distant skyline.
// Walkable surfaces stay in the mountain scene.
const summitSkylineOrigin = new Vector3(300, 0, -676);
const summitSkylinePeak = new Vector3(mainSummitLayout.summit.east, mainSummitSpec.summitHeight,
  -mainSummitLayout.summit.north).add(summitSkylineOrigin);
const summitSkylinePeakNdc = new Vector3();
let summitSkylineDraws = 0;
const summitSkylineMesh = createMainSummitBlock(mainSummitLayout, 347, 100).coarse;
// The open heightfield is seen from below while the player is still in town.
summitSkylineMesh.material.side = DoubleSide;
const summitSkyline = new Group();
summitSkyline.name = 'main-summit-world-skyline';
summitSkyline.position.copy(summitSkylineOrigin);
summitSkyline.add(summitSkylineMesh);
scene.add(summitSkyline);
if (reportSummitSkyline) {
  summitSkylineMesh.onAfterRender = (_renderer, _scene, renderedCamera) => {
    if (renderedCamera === camera) summitSkylineDraws++;
  };
}
const presence = createTownPresence(scene, camera, announceActivity, resetMovement,
  (east, north) => east < 0 ? ensureWestCraterRoad().heightAt(east, north) ?? grid.heightAt(east, north)
    : grid.heightAt(east, north));
const cloudRoute = createZa22CloudRoute({
  now: presence.serverNow,
  enterOrExit(terminal, at) {
    presence.setMountainDomain(terminal === 'summit', cloudRoute.scene);
    x = at.east;
    n = at.north;
    ground = at.height;
    airHeight = undefined;
    riseSpeed = 0;
    stopTravel();
    snowControls.cancel();
    storeWalkView(walkCurrent);
    walkPrevious.copy(walkCurrent);
    yaw = 0;
    pitch = 0;
  },
  view: (title, message) => { activityContext.open(title, message); },
});
function connectGuardPost(kind: Za29GuardPostKind, model: ReturnType<typeof mountZa29GuardPost>) {
  const duty = createZa29GuardDuty(kind, model.anchors, announceActivity);
  return { model, duty };
}
type TownGuardPost = ReturnType<typeof connectGuardPost>;
let mountainGuardPost: TownGuardPost | undefined;
let craterGuardPost: TownGuardPost | undefined;

function currentGuardDuty() {
  if (cloudRoute.riding()) return undefined;
  return (cloudRoute.active() ? mountainGuardPost : craterGuardPost)?.duty;
}

function updateGuardPosts() {
  if (cloudRoute.assembly() && !mountainGuardPost) {
    mountainGuardPost = connectGuardPost('mountain',
      mountZa29GuardPost(cloudRoute.scene, 'mountain', (east, north) => cloudRoute.surfaceAt(east, north, 0)));
  } else if (!cloudRoute.assembly() && mountainGuardPost) {
    mountainGuardPost.model.dispose();
    mountainGuardPost = undefined;
  }
  if (x < 100 && !cloudRoute.active() && !craterGuardPost) {
    const road = ensureWestCraterRoad();
    craterGuardPost = connectGuardPost('crater', mountZa29GuardPost(road.group, 'crater', road.heightAt));
  }
  const night = presence.getTownNightWindow()?.shift === 'night';
  const duty = { guardPresent: !night, showNightSigns: night };
  for (const post of [mountainGuardPost, craterGuardPost]) {
    post?.model.setDuty(duty);
    post?.duty.updateDuty(duty.guardPresent);
  }
  if (walking && moveAllowed()) currentGuardDuty()?.observeApproach({ east: x, north: n, height: ground });
}
const plazaCamera = new PerspectiveCamera(60, 16 / 9, camera.near, townFar);
const plazaCanvasSize = new Vector2();
const railway = createTownRailway(grid, presence.serverNow);
const frontRailStation = railway.stops.find(stop => stop.id === 'railway-station')!;

const sledFootRadius = .36;
function sledGroundAt(east: number, north: number) {
  if (cloudRoute.active()) return cloudRoute.surfaceAt(east, north, sledFootRadius) ?? NaN;
  if (!walkable(east, north)) return NaN;
  return supportAt(east, north, Number.POSITIVE_INFINITY);
}
const sledAnimation = createSledAnimation((east, north) => {
  const height = sledGroundAt(east, north);
  return Number.isFinite(height) ? height : ground;
});
type SledRackVisuals = ReturnType<typeof createTownSledVisuals>;
type SledRackState = { visuals: SledRackVisuals; actions: TownActivitySpot[] };
let townSledRacks: SledRackState;
let summitSledRacks: SledRackState | undefined;
let setMountedRackVehicle: ((spot: { x: number; n: number; y: number; yaw: number }) => void) | undefined;
const sledDrift = createSledDrift();
const sledWallCollider = createSledWallCollider(
  (gx, gy) => teamFight.wallColumnAt(gx, gy),
  (gx, gy, speed) => presence.sendSnowfightSledSmash(gx, gy, speed),
);
const sledWorld: Parameters<typeof createSledRide>[0] = {
  height: sledGroundAt,
  surface(sx, nn, y) {
    if (cloudRoute.active()) return { surface: 0, deepSnow: false };
    const col = Math.round(sx), row = Math.round(nn);
    const surface = col >= 0 && row >= 0 && col < grid.gridWidth && row < grid.gridDepth
      ? grid.surfaces[row * grid.gridWidth + col] : 0;
    return { surface, deepSnow: snowCover.depthAt(sx, nn, y) >= .6 };
  },
  blocked: obstructed,
  canTraverse(from, to) {
    if (cloudRoute.active() && !cloudRoute.acceptsStep(from.x, from.n, to.x, to.n, sledFootRadius)) return false;
    return !currentGuardDuty()?.blocksStep(
      { east: from.x, north: from.n, height: from.y },
      { east: to.x, north: to.n, height: to.y },
    );
  },
  wallBlocked: (sx, nn, y) => {
    if (cloudRoute.active()) return false;
    const column = teamFight.wallColumnAt(wallCellOf(sx), wallCellOf(nn));
    return !!column && y < column.ground + column.height * .5;
  },
  wallImpact: (from, to, speed) => cloudRoute.active() ? undefined : sledWallCollider.collide(from, to, speed),
  snow: (sx, nn, y, snowYaw, count, effect) =>
    (cloudRoute.active() ? summitSledRacks : townSledRacks)?.visuals.puff(sx, nn, y, snowYaw, count, effect),
  stopped: () => announceActivity('雪橇停稳了，找个下坡再出发'),
  smoothFlight: () => announceActivity('漂亮'),
};
let sledRide = createSledRide(sledWorld);
const sledTrackView = createSledTrackView(scene, (east, north) => supportAt(east, north, Number.POSITIVE_INFINITY));
const grandPrix = createGrandPrix();
const sledStatus = element<HTMLOutputElement>('sled-status');
const grandPrixStatus = element<HTMLOutputElement>('grand-prix-status');
const grandPrixBoard = element<HTMLOutputElement>('grand-prix-board');
function renderGrandPrixBoard() {
  const rows = grandPrix.board();
  grandPrixBoard.textContent = rows.length
    ? '大奖赛镇内榜 · ' + rows.map((row, i) => `${i + 1}. ${row.name} ${(row.totalMs / 1000).toFixed(1)} 秒`).join(' · ')
    : '';
}
presence.onGrandPrixResult(result => {
  grandPrix.recordResult(result);
  renderGrandPrixBoard();
});
function leaveSled() {
  if (!sledRide.leave()) return;
  cancelSledBrake();
  sledDrift.reset();
  const parked = sledRide.parked();
  if (!parked) return;
  setMountedRackVehicle?.(parked);
  setMountedRackVehicle = undefined;
  ({ x, n, y: ground } = parked);
  airHeight = undefined;
  riseSpeed = 0;
  landingFeedback.reset();
  storeWalkView(walkRender);
  walkCurrent.copy(walkRender);
  walkPrevious.copy(walkRender);
}
function alignPlayerWithSled() {
  const spot = sledRide.spot;
  ({ x, n } = spot);
  ground = sledGroundAt(x, n);
  airHeight = spot.y > ground + .02 ? spot.y : undefined;
}
function playerBodyYaw() {
  return sledRide.active() ? sledRide.spot.yaw : yaw;
}
function createSledRacks(domain: 'town' | 'summit'): SledRackState {
  const sampleFooting = (east: number, north: number) => {
    if (domain === 'summit') {
      const surface = cloudRoute.surfaceAt(east, north, sledFootRadius);
      if (surface === undefined || cloudRoute.blocked(east, north, surface, sledFootRadius, bodyHeight)) return;
      return surface;
    }
    return dryTownLandingHeight(east, north, undefined, true);
  };
  const racks = resolveTownSledRacks(domain, sampleFooting, domain === 'town' ? ensureWestCraterRoad().lip : undefined);
  const visuals = createTownSledVisuals(domain === 'summit' ? cloudRoute.scene : scene, racks);
  const actions = racks.map(rack => {
    let ride: ReturnType<typeof createSledRide> | undefined;
    const position = () => ride?.parked() ?? rack;
    return {
      get x() { return position().x; },
      get n() { return position().n; },
      get ground() { return position().y; },
      range: 2.4,
      get label() { return ride?.parked() ? '重新上橇' : '乘雪橇'; },
      run() {
        if (sledRide.active()) return;
        ride ??= createSledRide(sledWorld);
        const parked = ride.parked() !== undefined;
        if (parked) {
          if (!ride.remount(x, n, ground)) return;
        } else {
          // Deferred station and palace floors may have loaded since this rack was placed.
          const feet = sampleFooting(rack.x, rack.n);
          if (feet === undefined || !ride.mount(rack.x, rack.n, feet, rack.yaw)) {
            announceActivity('雪橇旁暂时没有安全落脚点');
            return;
          }
        }
        sledRide = ride;
        visuals.setRackVehicle(rack.id, undefined);
        setMountedRackVehicle = spot => visuals.setRackVehicle(rack.id, spot);
        alignPlayerWithSled();
        stopTravel();
        storeWalkView(walkRender);
        walkCurrent.copy(walkRender);
        walkPrevious.copy(walkRender);
        announceActivity(parked ? '重新坐上雪橇' : '坐上雪橇 · W 前行 / S 倒车 · A D 转向 · 空格刹车');
      },
    };
  });
  return { visuals, actions };
}
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
const pineCamp = buildPineCamp(grid);
landscape.add(pineCamp.group);
const scenery = addScenery(landscape, grid, pineCamp.keepClear);
const districts = addDistrictHousing(landscape, grid, scenery.blocked, railway.keepClear);
const streetscape = addStreetscape(landscape, grid, (east, north, radius) =>
  districts.keepClear(east, north, radius) || extensionRoadClearance(east, north, radius) || pineCamp.keepClear(east, north, radius));
const forest = addForestDensity(landscape, grid,
  (east, north, radius) => districts.keepClear(east, north, radius) ||
    streetscape.occupied(east, north, radius) || pineCamp.keepClear(east, north, radius),
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
function bridgeBatch(material: MeshLambertMaterial, transforms: Matrix4[], name: string) {
  const batch = new InstancedMesh(bridgeGeometry, material, transforms.length);
  batch.name = name;
  transforms.forEach((matrix, index) => batch.setMatrixAt(index, matrix));
  batch.computeBoundingSphere();
  return batch;
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
const festival = createFestival(scene, message => { festivalText.textContent = message; }, announceSnowballTitles, grid.heightAt);
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
place({ id: 'mascot-sheep-pen', origin: [0, 0, 0] }, buildMascotPen(grid.heightAt));
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
let palaceTowerStatus = '';

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
      const displayStatus = palaceTowerStatus || status;
      if (palaceRaceStatus.textContent !== displayStatus) palaceRaceStatus.textContent = displayStatus;
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
const tigerPine = buildTigerZodiacAnchor(grid.heightAt);
scene.add(tigerPine);
let extensionStreets: ReturnType<typeof import('./extension-streets').buildExtensionStreets> | undefined;
let extensionStreetsLoad: Promise<void> | undefined;
let homeReturn: TownHousePortal | undefined;
let houseDoorTravel = false;
let houseDoorLandingCheck: { entry: TownHousePortal; target: TownHousePortal } | undefined;
const homeDoors = new Map<string, TownHousePortal>();
const blockedHouseDoors = new Set<string>();
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
  index(scenery.plazaCoverBoxes, (cell, box) => cell.colliders.push(box));
  const groups = [...architecture.values(), slide, railway.group, bridgeCollision, tigerPine, pineCamp.group];
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
  if (cloudRoute.active()) return emptyGeometry;
  return homeReturn ? sharedHomeGeometry ?? emptyGeometry : outdoorGeometryAt(east, north);
}
function outdoorGeometryAt(east: number, north: number) {
  if (east < 0) return emptyGeometry;
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
function prepareLandmarks(east: number, north: number) {
  const plot = extensionPlots.find(({ id, origin }) => !requestedPlots.has(id) &&
    Math.hypot(east - origin[0], north - origin[1]) < 148);
  if (!plot) return;
  requestedPlots.add(plot.id);
  const palaceModule = plot.id === 'ice-castle'
    ? Promise.all([import('./ice-palace-landmark-activity'), import('./ice-palace-slide')]) : undefined;
  Promise.all([extensionBuilders[plot.id](), palaceModule]).then(([group, palace]) => {
    place(plot, group);
    walkGeometry = geometry();
    registerLandmarkActivities(plot.id, group);
    if (palace) registerIcePalaceActivities(group, palace[0].createIcePalaceLandmarkActivity, palace[1].createCastleIceSlideActivity);
  }).catch(error => {
    requestedPlots.delete(plot.id);
    console.error(`Loading ${plot.id}`, error);
  });
}
async function loadBuildings() {
  const response = await fetch(new URL('index.json', assetBase));
  if (!response.ok || !response.headers.get('content-type')?.includes('json')) return;
  const models: Model[] = await response.json();
  if (models.length === 0) return;
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
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
  ['爆竹摊', [firecrackerStand.x, firecrackerStand.n - .85]],
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
let sledBrakeHeld = false;
let touchSledBrakeHeld = false;
function cancelSledBrake() {
  sledBrakeHeld = touchSledBrakeHeld = false;
}
createViewportControls({
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
// 3.0 M5 quality tiers: resolution cap + particle density, applied live.
// 'balanced' (the default) reproduces the pre-tier values exactly.
function applyQualityTier() {
  renderer.setPixelRatio(Math.min(devicePixelRatio, qualityPixelRatioCap()));
  snowfall.setDensityScale(particleDensityScale());
  landingSnow.setDensityScale(particleDensityScale());
}
applyQualityTier();
const lakeSkateMotion = createLakeSkateMotion();
const walkPrevious = new Vector3();
const walkCurrent = new Vector3();
const walkRender = new Vector3();
let movementStepMs = 0;
let forwardPressedAt = -Infinity;
let doubleForward = false;
function stopTravel() {
  keys.clear();
  cancelSledBrake();
  forwardPressedAt = -Infinity;
  doubleForward = false;
  touchWalk.reset();
  walkClock.reset();
  lakeSkateMotion.reset();
}
function resetMovement() {
  landingFeedback.reset();
  sledDrift.reset();
  stopTravel();
  snowControls.cancel();
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
let palaceSlide: ReturnType<typeof createCastleIceSlideActivity> | undefined;
let palaceSlideGround: number | undefined;
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
function landPalaceSlide(landing: CastleIceSlideLanding) {
  ({ x, n, ground, yaw } = landing);
  airHeight = undefined;
  riseSpeed = pitch = 0;
  resetMovement();
}
function leaveSeat(resetSlide = false) {
  if (!seated) return;
  if (palaceSlide?.active()) {
    if (resetSlide) palaceSlide.reset();
    else {
      const landing = palaceSlide.cancel();
      if (!landing) return;
      landPalaceSlide(landing);
    }
  }
  palaceSlideGround = undefined;
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
const townSettings = element<HTMLDialogElement>('town-settings');
element('town-panel-toggle').addEventListener('click', cancelSledBrake);
townBgm.mountControls(element('town-panel-controls'), element<HTMLButtonElement>('town-music-toggle'));
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
let towerDusk = false;
function setTowerDusk(enabled: boolean) {
  if (towerDusk === enabled) return;
  towerDusk = enabled;
  townLights.setDusk(enabled);
  setClocktowerDuskLighting(tower, enabled);
}
const mascotFrustum = new Frustum();
const mascotViewProjection = new Matrix4();
const mascotBounds = new Sphere(new Vector3(), .54);
const mascotFollower = createMascotFollower(mascotFollowGround);
const mascotRailCenter = new Vector3(), mascotRailForward = new Vector3(), mascotPoolLocal = new Vector3();
let ownedMascot: MascotFollowPoint | undefined;
const npcActivity = createTownNpcActivity({ ...activityContext, announce: announceActivity }, grid.heightAt, feature => {
  if (feature === 'spring') return architecture.has('hot-spring');
  if (feature === 'castle') return architecture.has('ice-castle');
  if (feature === 'mixing') return architecture.has('tavern');
  return true;
}, () => !nightMode, name => {
  if (name === '钟铁生') return [
    ...(zodiac.canCollect('dragon') ? towerDragonClues : []),
    ...(zodiac.canCollect('horse') ? railHorseClues : []),
  ];
  if (name === '纪守信' && zodiac.canCollect('horse')) return npcAuthoredDialogue.纪守信.clues.slice(1);
  if (name === '罗大江' && zodiac.canCollect('rooster')) return tavernRoosterClues;
  if (name === '乔麦' && zodiac.canCollect('monkey')) return workshopMonkeyClues;
},
panel => openTavernDice(panel, () => {
  if (tavernDrinkEffects.getLevel() >= 3) return '这局你输了。酒意已满，免罚酒。';
  if (!tavernDrinkEffects.sip('#ce8c40', () => {})) return '这局你输了。正在喝酒，免另添一杯。';
  return '这局你输了，罚酒一杯。';
}), {
  now: presence.serverNow,
  groundAt: mascotOutdoorGround,
  follow: () => presence.ownerFollowsMascot() && walking ? ownedMascot : presence.sampleRemoteMascot(),
  visible(east, north, feet) {
    if (Boolean(homeReturn) !== isSharedHomePosition(east, north, feet)) return false;
    mascotBounds.center.set(east, feet + .32, -north);
    if (camera.position.distanceToSquared(mascotBounds.center) > 65 ** 2) return false;
    camera.updateMatrixWorld();
    mascotFrustum.setFromProjectionMatrix(mascotViewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    return mascotFrustum.intersectsSphere(mascotBounds);
  },
});
const practiceStatus = element<HTMLOutputElement>('snow-practice-status');
const practiceTarget = createSnowPracticeTarget(scene, grid.heightAt, {
  status(text) {
    practiceStatus.textContent = text;
    practiceStatus.hidden = !text;
  },
  announce: announceActivity,
});
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
const lakeSkating = createLakeSkatingActivity({ ...activityContext, announce: announceActivity }, grid.heightAt, () => nightMode);
const regionalCarry = createRegionalCarry();
const iceFishing = createIceFishingActivity({ ...activityContext, announce: announceActivity }, grid.heightAt,
  () => collectRegionalStamp(iceFishingCatalogueStamp.id), regionalCarry.collectFish);
const marketFair = createMarketFairActivity(
  { ...activityContext, announce: announceActivity },
  {
    camera, player: () => ({ x, n, walking }), onHotDrink: warmFromDrink,
    marketPassport: {
      collect: () => passport.collectExtension(marketTastingStamp.id),
      collected: () => passport.hasExtension(marketTastingStamp.id),
    },
  },
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
const wishActivity = nearbyActivity(createWishActivity);
let icePalaceActivity: ReturnType<typeof createIcePalaceLandmarkActivity> | undefined;
const icePalaceCrown = createIcePalaceCrown(document.body);
let icePalaceSelfCrowned = false;
function palaceThroneSeat() {
  return seated && icePalaceActivity?.snowballRules.atThrone(seated) ? seated : undefined;
}
const activities: TownActivity[] = [
  nearbyActivity(createPostActivity), stageActivity, nearbyActivity(createMarketActivity),
  nearbyActivity(createIceActivity), wishActivity, nearbyActivity(createRestActivity),
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
presence.onTestFireworks((seed, ageSeconds) => festival.startShow(makeTestFireworksTable(seed, grid.heightAt), {
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
const personalFirecrackers = createTownPersonalFireworks({
  context: { ...activityContext, announce: announceActivity },
  button: element<HTMLButtonElement>('town-firecracker-bag'),
  player() {
    const protectedSpace = !walking || seated || boardingGround || museumOverlay() || waterAtFeet() || homeReturn ||
      roofed(x, n, ground) || personalFireworkRestricted(x, n, ground);
    return { x, y: airHeight ?? ground, z: -n, yaw: playerBodyYaw(), area: protectedSpace ? 'house' : 'open' };
  },
  listener: () => camera.position,
  hand(owner) {
    const peer = presence.getSnowballPeers().find(actor => actor.id === owner);
    if (!peer) return;
    return {
      x: peer.east + .32 * Math.cos(peer.yaw) + .44 * Math.sin(peer.yaw),
      y: peer.height + 1.27,
      z: -peer.north + .32 * Math.sin(peer.yaw) - .44 * Math.cos(peer.yaw),
    };
  },
  ground: (east, z) => dryTownLandingHeight(east, -z) ?? NaN,
  canSet(point, player) {
    if (airHeight !== undefined) return false;
    const north = -point.z;
    const feet = dryTownLandingHeight(point.x, north, player.y);
    return feet !== undefined && Math.abs(point.y - feet) <= 1.6 &&
      !roofed(point.x, north, feet) && !personalFireworkRestricted(point.x, north, feet);
  },
  request: presence.requestFirecracker,
  serverNow: presence.serverNow,
  ceremony() {
    const now = presence.serverNow();
    return now >= townCeremonyMidnight - 10_000 && now < townCeremonyMidnight + ceremonyLateWindowMs;
  },
  paint: festival.setPersonalFireworkFrame,
  sound: festival.playPersonalFirework,
});
presence.onFirecracker(personalFirecrackers.receive, personalFirecrackers.reject);
activities.unshift(tavernActivity);
activities.push(townLights, npcActivity, practiceTarget, lakeSkating, iceFishing, fireworks);
activities.push(marketFair);
const activitySpots = activities.flatMap(activity => activity.spots);
activitySpots.push(personalFirecrackers.pickup(grid.heightAt(firecrackerStand.x, firecrackerStand.n)));
function registerHomeDoors(doors: readonly TownHousePortal[]) {
  for (const door of doors) {
    if (homeDoors.has(door.id)) continue;
    homeDoors.set(door.id, door);
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
    }, sharedHome, openHouseDoorBook));
  }
  lakeSkating.stop();
  resetMovement();
  homeReturn = door;
  recordHouseDoorVisit(door.id);
  void prepareExtensionStreets();
  sharedHome.visible = true;
  camera.layers.set(sharedHomeLayer);
  ({ x, n, ground, yaw } = sharedHomeSpawn);
  pitch = 0;
  airHeight = undefined;
  riseSpeed = 0;
  fadeHousePortal();
  announceActivity('屋舍空间 · 从原门口返回');
}
function prepareExtensionStreets() {
  return extensionStreetsLoad ??= import('./extension-streets').then(({ buildExtensionStreets }) => {
    extensionStreets = buildExtensionStreets(grid, railway.keepClear, districts.keepClear);
    scene.add(extensionStreets.group);
    walkGeometry = geometry();
    activitySpots.push(...createCourtyardSeatSpots(extensionStreets, activityContext, canStandAtActivity));
    registerHomeDoors(extensionStreets.housePortals);
    const dogMailbox = extensionStreets.dogMailbox;
    if (dogMailbox) {
      activitySpots.push(zodiacSites.mount(extensionStreets.group, dogMailbox.charm),
        createZodiacDogPostcard(dogMailbox, activityContext));
    }
  }).catch(error => {
    extensionStreetsLoad = undefined;
    console.error('Loading extension streets', error);
  });
}

async function openHouseDoorBook() {
  const entry = homeReturn;
  if (!entry || houseDoorTravel) return;
  const panel = openPlace(houseDoorBookCopy.title, houseDoorBookCopy.introduction);
  const loading = document.createElement('p');
  loading.textContent = '正在登记各区屋门…';
  panel.append(loading);
  await prepareExtensionStreets();
  if (homeReturn !== entry || !placeCard.open || !loading.isConnected) return;
  if (!extensionStreets) {
    loading.textContent = '屋门清单暂未登记齐，请关册后重试。';
    return;
  }
  const anchors = [
    ...layout.plots.map(({ door: [x, n] }, i) => ({ label: plotLabels[i], x, n })),
    ...marketStalls.map(({ kind, east, north }) => ({ label: kind + '摊', x: east, n: north })),
    ...townNpcDoorAnchors,
  ];
  renderHouseDoorBook(panel, createHouseDoorBook([...homeDoors.values()], anchors), entry, blockedHouseDoors,
    target => void exitThroughHouseDoor(target));
}

function houseDoorOccupied(east: number, north: number, feet: number) {
  return presence.getSnowballPeers().some(peer => Math.abs(peer.height - feet) < bodyHeight &&
    Math.hypot(east - peer.east, north - peer.north) < bodyRadius * 2);
}

function availableHouseDoorGround(east: number, north: number) {
  const feet = dryTownLandingHeight(east, north, undefined, true);
  return feet === undefined || houseDoorOccupied(east, north, feet) ? undefined : feet;
}

async function prewarmHouseDoorExit(entry: TownHousePortal, target: TownHousePortal, conceal: Animation) {
  const landing = findHouseDoorLanding(target, availableHouseDoorGround);
  if (!landing) return;
  // The prediction only chooses textures. Landing is revalidated when the door actually opens.
  const destination = new Vector3(landing.x, landing.ground + eye, -landing.n);
  await prewarmHouseDoorTextures(renderer, scene, camera, destination, target.exitYaw,
    () => homeReturn === entry && houseDoorTravel && conceal.playState === 'running');
}

function leaveToRecordedDoor(entry: TownHousePortal, target: TownHousePortal) {
  blockedHouseDoors.add(target.id);
  announceActivity(houseDoorBookCopy.blocked);
  const landing = findNearestLegalSpawn(entry, (east, north) => {
    const feet = dryTownLandingHeight(east, north, entry.ground);
    return feet === undefined || houseDoorOccupied(east, north, feet) ? undefined : feet;
  });
  if (!landing) {
    homeReturn = entry;
    ({ x, n, ground, yaw } = sharedHomeSpawn);
    camera.layers.set(sharedHomeLayer);
    if (sharedHome) sharedHome.visible = true;
    return;
  }
  ({ x, n, ground } = landing);
  yaw = entry.exitYaw;
}

async function exitThroughHouseDoor(target: TownHousePortal) {
  const entry = homeReturn;
  if (!entry || houseDoorTravel) return;
  houseDoorTravel = true;
  resetMovement();
  placeCard.close();
  const fade = reduceSnowEffects.matches ? undefined : document.createElement('div');
  try {
    if (fade) {
      fade.className = 'house-door-fade';
      document.body.append(fade);
      const conceal = fade.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, fill: 'forwards' });
      void prewarmHouseDoorExit(entry, target, conceal).catch(() => {});
      await conceal.finished.catch(() => {});
    }
    // A timed ceremony can move a visitor out of the shared room while the DOM fades.
    if (homeReturn !== entry) return;
    homeReturn = undefined;
    const landing = findHouseDoorLanding(target, availableHouseDoorGround);
    if (landing) {
      ({ x, n, ground } = landing);
      yaw = target.exitYaw;
      blockedHouseDoors.delete(target.id);
      houseDoorLandingCheck = { entry, target };
    } else {
      leaveToRecordedDoor(entry, target);
    }
    if (!homeReturn) {
      camera.layers.set(0);
      if (sharedHome) sharedHome.visible = false;
    }
    pitch = 0;
    airHeight = undefined;
    riseSpeed = 0;
    if (fade) {
      const reveal = fade.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' });
      await reveal.finished.catch(() => {});
    } else if (landing) {
      await new Promise<void>(resolve => window.setTimeout(resolve, 200));
    }
  } finally {
    fade?.remove();
    houseDoorLandingCheck = undefined;
    houseDoorTravel = false;
  }
}

function checkHouseDoorLanding() {
  const check = houseDoorLandingCheck;
  if (!check || !houseDoorOccupied(x, n, ground)) return;
  // The already established AOI only delivers exterior peers as the player re-enters the town.
  const landing = findHouseDoorLanding(check.target, availableHouseDoorGround);
  if (landing) ({ x, n, ground } = landing);
  else {
    leaveToRecordedDoor(check.entry, check.target);
    houseDoorLandingCheck = undefined;
  }
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
function ensureTownInputButton(id: string, label: string, after: HTMLElement): HTMLButtonElement {
  const existing = document.getElementById(id);
  if (existing instanceof HTMLButtonElement) return existing;
  const button = document.createElement('button');
  button.id = id;
  button.type = 'button';
  button.hidden = true;
  button.textContent = label;
  after.after(button);
  return button;
}
const snowPrimaryButton = ensureTownInputButton('snowball-primary', '投雪球', snowballMeter);
const touchSledBrakeButton = ensureTownInputButton('touch-sled-brake', '刹车', actionButton);
touchSledBrakeButton.setAttribute('aria-pressed', 'false');
const snowballRing = element('snowball-action-ring');
const snowballHitMark = element('snowball-hit-mark');
const reduceSnowEffects = matchMedia('(prefers-reduced-motion: reduce)');
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
festival.mountAudioSettings(element('town-panel-controls'));
const ceremonyClock = (import.meta.env.MODE === 'town-rehearsal' ? await loadRehearsalClock() : undefined)
  ?? { now: presence.serverNow, utcOffsetMinutes: 8 * 60 };
const railOvernightBroadcast = createRailOvernightBroadcast();
const postUnlockTime = new Date(UNLOCK_AT).getTime();
setPostOpeningReady(architecture.get('post-office'), Date.now() >= postUnlockTime);
const cameraBeforeBellShake = new Quaternion();
let bellShakeStartedAt = -Infinity;
let nextHourlyBell = Infinity;
let hourlyBellsRemaining = 0;
const dailyTowerChime = createDailyTowerChime();
let overtureMidnight: number | undefined;
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
      festival.launchCeremony(cue.type, cue.at, ceremonyClock.now);
      break;
  }
}
const tossOrigin = new Vector3();
const tossDirection = new Vector3();
const gatherRayEnd = new Vector3();
const plazaSnowSupply = createPlazaSnowSupply();
const gatherCheck = { x: NaN, n: NaN, ground: NaN, yaw: NaN, pitch: NaN, snow: false,
  supply: undefined as PlazaSnowSupplySite | undefined };
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
const snowballExtras: TownSnowballTarget[] = [];
const remoteTargetPool = Array.from({ length: 48 }, (): TownSnowballTarget => ({
  id: '', label: '', x: 0, y: 0, z: 0, radius: playerTarget.radius, height: playerTarget.height,
  shape: 'capsule', onHit() {},
}));
const remoteSnowballNames = new Map<string, string>();
const recentSnowballHits = new Map<number, number>();
const palaceSnowballOrigins = new Map<number, { at: Vector3; expires: number }>();
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
const bellGame = createTownBellGame({
  scene, camera, presence,
  getAudioContext: festival.getAudioContext,
  announce: announceActivity,
  heightAt: (east, north) => grid.heightAt(east, north),
  localPosition: () => ({ east: x, north: n, height: ground }),
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
  return !roofed(origin.x, -origin.z, origin.y - eye + .08) ||
    (by === 'local' && icePalaceActivity?.snowballRules.canRelay(origin) === true);
}
function showSnowballScore({ ammo, hits, combo }: SnowballState) {
  const depth = snowCover.depth();
  const text = `雪团 ${ammo}/${snowResourceLimit} · ${depth.label} · 命中 ${hits}${combo > 1 ? ` · 连中 ${combo}` : ''}${snowOnHead ? ` · 顶雪 ${snowOnHead}/3` : ''}`;
  if (snowballScore.textContent !== text) snowballScore.textContent = text;
}
function showSnowGatherProgress() {
  const progress = snowControls.gatherProgress();
  snowballMeter.hidden = snowballRing.hidden = progress === undefined;
  if (progress !== undefined) {
    snowballMeter.value = progress;
    snowballRing.style.setProperty('--snowball-progress', `${100 * progress}%`);
  }
}
const sweepSnowball = createSnowballSweep({
  geometryAt(east, north) {
    const cell = geometryAt(east, north);
    return homeReturn ? cell : icePalaceActivity?.snowballRules.projectileGeometry(cell) ?? cell;
  },
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
  scoreAt: target => !target.id.startsWith('wall:') && !roofed(target.x, -target.z, target.y),
});
function canConfirmSnowballHit(indoorBall?: { at: Vector3; expires: number }) {
  if (!indoorBall) return moveAllowed() && !roofed(playerTarget.x, -playerTarget.z, playerTarget.y);
  if (indoorBall.expires <= performance.now()) return false;
  const throneSeat = palaceThroneSeat();
  if (!moveAllowed() && !(throneSeat && lookAllowed() && !plazaPhoto.locked())) return false;
  return icePalaceActivity?.snowballRules.canConfirm(indoorBall.at, {
    x: playerTarget.x, n: -playerTarget.z, ground: playerTarget.y,
  }, throneSeat) === true;
}
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
    sweepSnowball(from, to, radius, thrower, source === 'npc' ? undefined : snowballExtras),
  relayPlayerThrow: (ballId, origin, dir) => presence.sendSnowballThrow({
    ballId, east: origin.x, north: -origin.z, height: origin.y, dirX: dir.x, dirY: dir.y, dirZ: dir.z,
  }),
  canScoreAtLaunch: outdoorLaunch,
  onChange: showSnowballScore,
  onEvent(event) {
    practiceTarget.onSnowballEvent(event);
    if (event.type === 'throw') {
      if (event.scoreable) snowballBoard.recordThrow(event.thrower);
      if (event.shotBy === 'remote') teamFight.onThrowHeard(event.origin);
    } else if (event.type === 'miss') {
      if (event.scoreable) snowballBoard.recordMiss(event.thrower);
    } else {
      const target = event.targetId ? targetById.get(event.targetId) : undefined;
      if (event.targetId?.startsWith('wall:')) {
        teamFight.onWallImpact(event.at);
      }
      const remoteThrower = event.shotBy === 'remote' ? Number(event.thrower.slice(2)) : undefined;
      const shotKey = remoteThrower !== undefined && event.ballId !== undefined ? remoteThrower * 65536 + event.ballId : undefined;
      const indoorBall = shotKey === undefined ? undefined : palaceSnowballOrigins.get(shotKey);
      if (indoorBall && shotKey !== undefined) palaceSnowballOrigins.delete(shotKey);
      if (remoteThrower !== undefined && target === playerTarget && event.zone && event.ballId !== undefined &&
          canConfirmSnowballHit(indoorBall)) {
        target.onHit(event.velocity.x, event.velocity.z);
        hitFeedback.hit(event.zone);
        if (teamFight.active()) {
          teamFight.victimFlash();
          snowStaggerTime = Math.max(snowStaggerTime, .3);
        }
        snowballs.clearCombo();
        presence.sendSnowballHit({ ballId: event.ballId, throwerId: remoteThrower, zone: event.zone });
      } else if (event.scored) {
        target?.onHit(event.velocity.x, event.velocity.z);
        if (target === playerTarget && moveAllowed()) {
          hitFeedback.hit(event.zone);
          if (teamFight.active()) {
            teamFight.victimFlash();
            snowStaggerTime = Math.max(snowStaggerTime, .3);
          }
        }
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

const teamFight = createTeamSnowfight({
  scene,
  presence,
  stock: snowballs.stock,
  heightAt: (east, north) => grid.heightAt(east, north),
  announce: message => announceActivity(message),
  playerPose: () => ({ east: x, north: n }),
  snowDepthLevel: () => snowCover.depth().level,
  freeBuildAvailable: presence.freeSnowWallsAvailable,
});

function updateSnowballSession(id: number | null) {
  if (id === snowballSessionId) return;
  snowballSessionId = id;
  recentSnowballHits.clear();
  palaceSnowballOrigins.clear();
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
    if (event.throwerId !== me) personalFirecrackers.cancelSparkler(event.throwerId);
    if (event.throwerId === me || Math.abs(event.height - (airHeight ?? ground)) > 10) return;
    remoteSnowballOrigin.set(event.east, event.height, -event.north);
    remoteSnowballDirection.set(event.dirX, event.dirY, event.dirZ);
    if (snowballs.throwRemote(remoteSnowballOrigin, remoteSnowballDirection, thrower, event.ballId)) {
      if (icePalaceActivity?.snowballRules.canRelay(remoteSnowballOrigin)) {
        const now = performance.now();
        for (const [key, { expires }] of palaceSnowballOrigins) {
          if (expires > now) break;
          palaceSnowballOrigins.delete(key);
        }
        palaceSnowballOrigins.set(event.throwerId * 65536 + event.ballId, { at: remoteSnowballOrigin.clone(), expires: now + 3000 });
      }
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
  if (event.confirmerId === me) icePalaceActivity?.confirmedHit();
  snowballs.confirmRemoteImpact(thrower, event.ballId);
  const streak = snowballBoard.recordHit(thrower, target, { announce: formalSnowFight });
  if (event.throwerId === me) {
    snowballs.confirmPlayerHit();
    showSnowballHit(streak, snowballName(target));
    if (teamFight.active()) teamFight.popScore(streak > 1 ? `命中 · 连中 ${streak}` : '命中！');
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
  const aimedSupply = plazaSnowSupply.aimed(tossOrigin, gatherRayEnd, grid.heightAt, hit);
  const supply = aimedSupply && !roofed(x, n, ground) && !townWater.at(aimedSupply.east, aimedSupply.north) &&
    !roofed(aimedSupply.east, aimedSupply.north, grid.heightAt(aimedSupply.east, aimedSupply.north)) ? aimedSupply : undefined;
  Object.assign(gatherCheck, { x, n, ground, yaw, pitch, snow: snow || !!supply, supply });
  return gatherCheck.snow;
}
function aimSnowball() {
  const flat = Math.cos(pitch);
  tossDirection.set(Math.sin(yaw) * flat, Math.sin(pitch), -Math.cos(yaw) * flat);
  tossOrigin.set(x, (airHeight ?? ground) + eye - .08, -n).addScaledVector(tossDirection, .06);
}
const wallAimFrom = new Vector3();
const wallAimTo = new Vector3();
const touchSnowRay = new Raycaster();
const touchSnowCoordinates = new Vector2();
const wallAimReach = 4.5;

function snowWallTarget(origin: Vector3, direction: Vector3) {
  if (direction.y >= -.1) return;
  wallAimFrom.copy(origin);
  // Short segments keep the first obstruction and the terrain grade at the cursor.
  for (let distance = 1.5; distance <= wallAimReach; distance += 1.5) {
    wallAimTo.copy(origin).addScaledVector(direction, distance);
    const hit = sweepSnowball(wallAimFrom, wallAimTo, 0, 'local', snowballExtras);
    if (!hit) {
      wallAimFrom.copy(wallAimTo);
      continue;
    }
    const east = hit.at.x, north = -hit.at.z;
    const gx = wallCellOf(east), gy = wallCellOf(north);
    if (hit.kind === 'target') {
      const wallKey = hit.targetId?.split(':');
      if (wallKey?.[0] !== 'wall') return;
      const wallX = Number(wallKey[1]), wallY = Number(wallKey[2]);
      const wall = teamFight.wallColumnAt(wallX, wallY);
      if (wall && hit.at.y >= wall.ground + wall.height * .5 - .09) return { gx: wallX, gy: wallY };
      return;
    }
    const support = supportAt(east, north, hit.at.y + .06);
    if (Math.abs(hit.at.y - support) <= .25) return { gx, gy };
    return;
  }
}

function aimedSnowWall() {
  aimSnowball();
  return snowWallTarget(tossOrigin, tossDirection);
}

function throwSnowball(origin: Vector3, direction: Vector3) {
  if (!snowballs.getState().ammo) {
    announceActivity(touchWalk.active() ? '对准近处雪地，长按交互键采集' : '对准近处雪地，按住 E 采集');
    return;
  }
  personalFirecrackers.cancelSparkler();
  snowballs.throwBall(origin, direction, 'local', 1);
}

function tapSnowTarget(clientX: number, clientY: number) {
  if (!canUseSnow()) return false;
  const { left, top, width, height } = renderer.domElement.getBoundingClientRect();
  if (!width || !height) return false;
  touchSnowCoordinates.set((clientX - left) / width * 2 - 1, 1 - (clientY - top) / height * 2);
  camera.updateMatrixWorld();
  touchSnowRay.setFromCamera(touchSnowCoordinates, camera);
  const { origin, direction } = touchSnowRay.ray;
  return snowControls.touchPrimary(snowWallTarget(origin, direction), () => {
    tossOrigin.copy(origin).addScaledVector(direction, .06);
    throwSnowball(tossOrigin, direction);
  });
}

const canUseSnow = () => moveAllowed() && !cloudRoute.active() && !sledRide.active() && !homeReturn &&
  waterAtFeet()?.mode !== 'swim';
const snowControls = createTownSnowControls({
  canUseSnow,
  canGather: () => snowballs.getState().ammo < snowResourceLimit && aimsAtNearbySnow(),
  gather() {
    if (plazaSnowSupply.gather(snowballs, 1, gatherCheck.supply)) {
      teamFight.onGatherTick();
      gatherCheck.x = NaN;
    }
  },
  canInteract: () => Boolean(currentAction()),
  interact,
  throwSnowball() {
    aimSnowball();
    throwSnowball(tossOrigin, tossDirection);
  },
  wallTarget: aimedSnowWall,
  placeWall: teamFight.tryPlace,
});
const mobileControls = mountTownMobileControls(snowControls, {
  action: actionButton,
  throwButton: snowPrimaryButton,
  brakeButton: touchSledBrakeButton,
  direction: element('touch-walk'),
  jump: touchJump,
  sprint: touchSprintButton,
}, held => { touchSledBrakeHeld = held; });
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

  const throneSeat = palaceThroneSeat();
  playerTarget.x = throneSeat?.x ?? x;
  playerTarget.y = throneSeat && lookAllowed() && !plazaPhoto.locked()
    ? throneSeat.eyeY - .98 : active ? airHeight ?? ground : -10000;
  playerTarget.z = -(throneSeat?.n ?? n);
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
  snowballExtras.length = 0;
  snowballExtras.push(...remoteSnowballTargets, ...teamFight.wallTargets());
  const wallPreview = canUseSnow() ? touchWalk.active() ? snowControls.touchWallPreview() : aimedSnowWall() : undefined;
  teamFight.update(dt, wallPreview);
  npcActivity.updateSnowFight(dt, formal && walking, outdoor && inPlaza ? playerTarget : undefined, snowballs.throwNpc);
  snowControls.update(dt);
  if (snowHatTime > 0 && (snowHatTime -= dt) <= 0) snowOnHead = 0;
  if (snowStaggerTime > 0 && (snowStaggerTime -= dt) <= 0) snowballWalkFactor = 1;
  snowballPhysicsMs = snowballs.update(dt);
  showSnowballScore(snowballs.getState());
  showSnowGatherProgress();
  snowballControls.hidden = !active;

}
renderer.domElement.addEventListener('pointerdown', event => {
  if (event.pointerType !== 'mouse' || event.button !== 0 ||
      document.pointerLockElement !== renderer.domElement) return;
  snowControls.primary();
});

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
const zodiacSites = createTownZodiacSites(zodiac, label => {
  announceActivity(`${label} · 已收集 ${zodiac.count()}/12`);
  playPostChime(true);
});
scene.add(zodiacSites.mesh);
const railHorseCharm = createRailHorseCharm(railway, zodiac, () => {
  announceActivity(`马 · 已收集 ${zodiac.count()}/12`);
  playPostChime(true);
});
const passport = createTownPassport(
  { ...activityContext, announce: announceActivity }, stampSites, tavernActivity.getMixIds,
  [stationTicketStamp, iceFishingCatalogueStamp, longHallRelayStamp, marketTastingStamp, busStationCatalogueStamp],
  riddleActivity.getProgress, zodiac,
);
const passportButton = element<HTMLButtonElement>('town-passport-button');
function showStampCount() {
  const { collected, total } = passport.getProgress();
  passportButton.textContent = `纪念戳册 ${collected}/${total}`;
}
showStampCount();
function collectRegionalStamp(id: string) {
  if (passport.collectExtension(id)) showStampCount();
}
const longHallRelayStatus = element<HTMLOutputElement>('long-hall-relay-status');
const longHallRelay = createLongHallRelay(
  architecture.get('long-hall')!, { announce: announceActivity }, {
    award: () => collectRegionalStamp(longHallRelayStamp.id),
    status: text => { longHallRelayStatus.textContent = text; },
  },
);
activities.push(longHallRelay);
activitySpots.push(...longHallRelay.spots);
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
activitySpots.push(...createClocktowerStorySpots(tower, activityContext, {
  now: presence.serverNow,
  nightWindow: presence.getTownNightWindow,
}));
const towerStops = tower.userData.stops as Record<'dial' | 'bell' | 'lookout', [number, number, number]>;
activitySpots.push(
  zodiacSites.mount(architecture.get('market-stalls')!, marketOxSite),
  zodiacSites.mount(tigerPine, tigerZodiacSite),
  zodiacSites.mount(architecture.get('glasshouse')!, greenhouseRabbitSite),
  zodiacSites.mount(tower, towerDragonSite(towerStops.lookout)),
  zodiacSites.mount(architecture.get('lantern-workshop')!, lanternWorkshopMonkeySite),
);
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
  localSpot(tower, [-2.12, .3125, 4.12], 1.25, '查看登塔图', () => {
    const diagram = tower.localToWorld(new Vector3(-3.52, 2.43, 4.81));
    activityContext.face(diagram.x, -diagram.z, diagram.y);
    announceActivity('登塔 · 表盘层看齿轮，钟层拉绳，瞭望台取景。');
  }),
  localSpot(tower, [-11.9, .3125, -3.75], 1.3, '查看钟机展陈', () => {
    const gearWall = tower.localToWorld(new Vector3(-11.9, 1.77, -5.51));
    activityContext.face(gearWall.x, -gearWall.z, gearWall.y);
    announceActivity('钟机展陈 · 这组齿轮把钟摆节拍传到指针。');
  }),
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

function registerIcePalaceActivities(group: Group, createActivity: typeof createIcePalaceLandmarkActivity,
  createSlide: typeof createCastleIceSlideActivity) {
  const refinement = group.userData.iceRefinement as IceCastleRefinementRuntime | undefined;
  const activity = createActivity(group, { ...activityContext, announce: announceActivity }, {
    onlineThroneOwned: presence.onlineThroneOwned,
    stateChanged(state) {
      if (state.crowned && !icePalaceSelfCrowned) refinement?.enthrone();
      icePalaceSelfCrowned = state.crowned;
    },
    canStand: canStandAtActivity,
    warmFromDrink,
    onToast: duration => { drinkingPoseUntil = performance.now() + duration; },
    onRaceStatus: status => { palaceTowerStatus = status; },
    playerName: presence.playerName,
  });
  icePalaceActivity = activity;
  palaceSlide = createSlide(group, { ...activityContext, announce: announceActivity }, canStandAtActivity);
  activitySpots.push(...activity.spots, ...palaceSlide.spots);
  activities.push({
    ...activity,
    update: dt => activity.step(dt, walking && !boardingGround && !homeReturn
      ? { x, n, ground, grounded: airHeight === undefined, seated } : undefined),
  });
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
    activitySpots.push(...createBusStationHiddenActivity(group, activityContext, passport, {
      canStand: canStandAtActivity,
      canBuyTicket: () => walking && !homeReturn,
      onTicketCollected: showStampCount,
    }).spots);
  } else if (id === 'hot-spring') {
    activitySpots.push(...hotSpringSoak.spots(group), zodiacSites.mount(group, hotSpringPigSite));
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
  if (houseDoorTravel || !walking || placeCard.open || museumVisit.dialog.open) return undefined;
  if (sledRide.active()) return { label: '下橇', run: leaveSled };
  if (airHeight !== undefined) return undefined;
  const guardAction = !homeReturn && currentGuardDuty()?.action({ east: x, north: n, height: ground });
  if (guardAction) return guardAction;
  if (cloudRoute.active()) {
    if (cloudRoute.riding()) return undefined;
    const cable = cloudRoute.action({ east: x, north: n, height: ground });
    return cable ?? nearestTownActivity(summitSledRacks?.actions ?? [], x, n, ground);
  }
  if (boardingGround) {
    if (railHorseCharm.visibleTo(camera)) return railHorseCharm.action;
    const stop = railway.currentStop;
    if (stop) return { label: `在${stop.label}下车`, run: () => leaveRide() };
    return { label: '在此下车', run: () => leaveRide() };
  }
  if (seated) {
    if (seated.tavern && (tavernActivity.carryAction() || seatedTavernNpc())) return tavernSeatAction;
    if (isAtPineSeat(seated) && isPineStoryTime(ceremonyClock.now(), !nightMode)) {
      return { label: '听松林火塘故事会', run: pineFireActivities.openStory };
    }
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
  const cable = cloudRoute.action({ east: x, north: n, height: ground });
  if (cable) return cable;
  const nearest = nearestTownActivity(activitySpots, x, n, ground);
  const rack = homeReturn ? undefined : nearestTownActivity(townSledRacks.actions, x, n, ground);
  if (rack && (!nearest || Math.hypot(x - rack.x, n - rack.n) <= Math.hypot(x - nearest.x, n - nearest.n))) return rack;
  if (nearest) return nearest;
  if (!homeReturn && !plazaPhoto.active() && inPlazaPhotoRequestZone(x, n, ground)) return plazaPhotoAction;
  return tavernActivity.carryAction();
}
function interact() {
  currentAction()?.run();
  if (!placeCard.open && !museumVisit.dialog.open) renderer.domElement.focus();
}
function landAtSelectedDestination() {
  const destination = points.get(selector.value);
  if (!destination || !settleTownLanding(destination[0], destination[1])) return false;
  const target = layout.plots[plotLabels.indexOf(selector.value)];
  const destinations: Record<string, readonly [number, number]> = {
    '西南河畔街巷': [131, 141], '冰湖雪球场': [350, 79],
    '冰湖滑冰': [lakeSkateGates[0].x, lakeSkateGates[0].n],
    '冰湖冰钓': [iceFishingStation.x - 1.5, iceFishingStation.n - 1.5],
    '爆竹摊': [firecrackerStand.x, firecrackerStand.n],
    '东侧扩建步道': [456, 222], '北侧森林街区': [104, 415],
    '火车站': [526, 312], '环镇列车站': [478, 224],
    '温泉浴场': [524, 158], '冰雪城堡': [460, 72],
    '雪团练习场': snowPracticeTarget, '南河岸': [303, 120], '北河岸': [246, 400],
  };
  const [east, north] = target?.door ?? destinations[selector.value] ?? [226, 223];
  yaw = Math.atan2(east - x, north - n);
  pitch = selector.value === '雪团练习场' ? .09 : 0;
  return true;
}
const walkMouseHelp = '移动鼠标转向，WASD 行走，空格跳跃。短按 E 互动，瞄准雪地长按 E 采雪。左键瞄地放墙，瞄空或瞄人投雪球。骑行时空格刹车，E 下橇。';
const walkDragHelp = '当前为拖拽视角：按住左键拖动转向，WASD 行走，双按 W 或 Shift+W 疾跑，空格跳跃，短按 E 互动、长按采雪。左键短点瞄地放墙，瞄空或瞄人投掷。';
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
function visitSelectedDestination() {
  if (houseDoorTravel) return false;
  if (sledRide.active()) {
    announceActivity('下橇后再切换地点');
    return false;
  }
  if (homeReturn) {
    leaveSeat();
    leaveSharedHome();
    if (homeReturn) return false;
  }
  lakeSkating.stop();
  if (!leaveRide()) return false;
  leaveSeat(true);
  resetMovement();
  activityStatus.textContent = '';
  if (!landAtSelectedDestination()) return false;
  museumInspection.close();
  museumLaunch.close();
  museumGuide.setActive(false);
  refreshLockHint();
  return true;
}
rehearse.onclick = () => {
  if (!festival.active() && festival.start()) setNight(true);
  if (townSettings.open) townSettings.close();
  renderer.domElement.focus({ preventScroll: true });
};
selector.onchange = event => {
  if (!visitSelectedDestination()) return;
  if (townSettings.open) townSettings.close();
  renderer.domElement.focus({ preventScroll: true });
  if (event.isTrusted) townBgm.enter();
};
renderer.domElement.addEventListener('pointerdown', event => {
  if (event.isTrusted && lookAllowed()) townBgm.enter();
});
const moveKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight']);
const forwardKey = (code: string) => code === 'KeyW' || code === 'ArrowUp';
const forwardHeld = () => keys.has('KeyW') || keys.has('ArrowUp');
function lookAllowed() {
  return walking && !houseDoorTravel && !presence.chatFocused() && !museumOverlay() &&
    !townSettings.open && !placeCard.open && !museumVisit.dialog.open;
}
function moveAllowed() { return lookAllowed() && !seated && !boardingGround && !cloudRoute.riding() && !plazaPhoto.locked(); }
function skatesOnIce() {
  return lakeSkating.enabled() && airHeight === undefined && isLakeSkateIce(x, n) &&
    Math.abs(ground - grid.heightAt(x, n)) <= .16;
}
function turnView(horizontal: number, vertical: number) {
  if (horizontal || vertical) ceremonyLook = undefined;
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
  onFallbackPrimary: snowControls.primary,
  onLockFailed(reason) {
    lockFailure = reason;
    refreshLockHint();
  },
  onLockChange(nowLocked) {
    lookLocked = nowLocked;
    if (nowLocked) lockFailure = undefined;
    else {
      lastUnlockAt = Date.now();
      sledBrakeHeld = false;
    }
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
  () => boardingGround ? ridePitch : seated?.pitch ?? pitch, undefined, touchLookSensitivity, tapSnowTarget);
const lookSensitivityInput = element<HTMLInputElement>('touch-look-sensitivity');
lookSensitivityInput.value = String(touchLookSensitivity());
lookSensitivityInput.addEventListener('input', () => setTouchLookSensitivity(Number(lookSensitivityInput.value)));
const qualityTierSelect = element<HTMLSelectElement>('quality-tier');
qualityTierSelect.value = qualityTier();
qualityTierSelect.addEventListener('change', () => {
  setQualityTier(qualityTierSelect.value);
  applyQualityTier();
});
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
function requestJumpAction() {
  if (!sledRide.active()) requestJump();
}
touchJump.addEventListener('pointerdown', event => {
  if (event.pointerType === 'touch') { event.preventDefault(); requestJumpAction(); }
});
touchJump.addEventListener('click', requestJumpAction);
addEventListener('keydown', e => {
  if (townSettings.open || placeCard.open || museumVisit.dialog.open || presence.chatFocused() ||
      e.altKey || e.ctrlKey || e.metaKey || e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement) return;
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
  if (snowControls.keyDown(e.code, e.repeat)) {
    e.preventDefault();
    return;
  }
  if (moveAllowed() && e.code === 'Space') {
    if (sledRide.active()) {
      e.preventDefault();
      if (!e.repeat) sledBrakeHeld = true;
    } else if (!e.repeat && !(e.target instanceof HTMLButtonElement)) {
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
  if (e.code === 'KeyE' && (townSettings.open || placeCard.open || museumVisit.dialog.open || presence.chatFocused())) {
    snowControls.cancel();
  }
  if (snowControls.keyUp(e.code)) {
    e.preventDefault();
    return;
  }
  if (e.code === 'Space' && sledBrakeHeld) {
    e.preventDefault();
    sledBrakeHeld = false;
  }
  keys.delete(e.code);
  if (!forwardHeld()) doubleForward = false;
});
addEventListener('blur', resetMovement);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) cancelSledBrake();
});
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
function walkable(x: number, n: number) {
  if (cloudRoute.active()) return cloudRoute.surfaceAt(x, n, bodyRadius) !== undefined;
  return homeReturn ? sharedHomeWalkable(x, n) : outdoorWalkable(x, n);
}
function outdoorWalkable(x: number, n: number) {
  if (x < 0) return x >= craterWestSurvey.west + bodyRadius && n >= 1 && n <= worldBounds.depth - 1;
  // E0 is a supported mesh seam. The legacy 1 m world-edge margin is open only here.
  const westSeam = x < 1 && n >= 1 && n <= worldBounds.depth - 1 && !isWater(x, n);
  const terrainPassable = westSeam || canEnter(x, n) || bridgeAt(x, n) !== undefined || townWater.at(x, n) !== undefined;
  return terrainPassable && !scenery.blocked(x, n) && !scenery.plazaCoverBlocks(x, n, bodyRadius) && !districts.blocked(x, n) &&
    !forest.blocked(x, n) && !streetscape.blocked(x, n);
}
const bodyHeight = 1.8;
const stepHeight = .43;
const surfaceEpsilon = .025;
const gravity = 22;
const jumpVelocity = Math.sqrt(2 * gravity * 1.255);
function surfaceAt(east: number, north: number) {
  if (cloudRoute.active()) return cloudRoute.surfaceAt(east, north, bodyRadius) ?? ground;
  return homeReturn ? sharedHomeSpawn.ground : outdoorSurfaceAt(east, north);
}
function outdoorSurfaceAt(east: number, north: number) {
  if (east < 0) return ensureWestCraterRoad().heightAt(east, north) ?? grid.heightAt(east, north);
  return townWater.at(east, north)?.ground ?? grid.heightAt(east, north);
}
function snowCleared(east: number, north: number, feet: number) {
  return Boolean(homeReturn) || districts.sweptAt(east, north) || roofed(east, north, feet);
}
function waterAtFeet() {
  if (cloudRoute.active() || homeReturn || airHeight !== undefined) return undefined;
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

function mascotOnPoolWater(east: number, north: number, feet: number) {
  const springs = architecture.get('hot-spring');
  if (!springs || Math.hypot(east - springs.position.x, north + springs.position.z) > 35) return false;
  springs.worldToLocal(mascotPoolLocal.set(east, feet, -north));
  return hotSpringPools.some(pool => Math.abs(mascotPoolLocal.x - pool.x) < pool.width / 2 + .18 &&
    Math.abs(mascotPoolLocal.z - pool.z) < pool.depth / 2 + .18);
}

function mascotFollowGround(east: number, north: number, around: number) {
  if (!walkable(east, north)) return undefined;
  if (!homeReturn && !isLakeSkateIce(east, north) && bridgeAt(east, north) === undefined &&
      (isWater(east, north) || townWater.at(east, north))) return undefined;
  const feet = supportAt(east, north, around + stepHeight, around + surfaceEpsilon, .18);
  if (!Number.isFinite(feet) || Math.abs(feet - around) > stepHeight || mascotOnPoolWater(east, north, feet)) return undefined;
  const { colliders, floors } = geometryAt(east, north);
  const blocked = (box: Box) => feet + surfaceEpsilon < box.max[1] &&
    feet + .65 - surfaceEpsilon > box.min[1] && overlapsBody(east, north, box, .18);
  if (colliders.some(blocked) || floors.some(blocked) ||
      activities.some(activity => activity.blocked?.(east, north, feet)) ||
      railway.vehicleBlocks(east, north, feet, .65, .18)) return undefined;
  return feet;
}

function updateMascotFollower(dt: number, movementSpeed: number) {
  if (!walking || !presence.ownerFollowsMascot()) {
    if (ownedMascot) mascotFollower.reset();
    ownedMascot = undefined;
    return;
  }
  let mounted: Omit<MascotFollowPoint, 'speed'> | undefined;
  const coach = railway.coachCharmAnchor.parent;
  if (boardingGround && coach) {
    coach.localToWorld(mascotRailCenter.set(.62, 1.10, .43));
    coach.getWorldDirection(mascotRailForward);
    mounted = {
      x: mascotRailCenter.x, n: -mascotRailCenter.z, ground: mascotRailCenter.y,
      yaw: Math.atan2(mascotRailForward.x, -mascotRailForward.z),
    };
  }
  const wetGround = waterAtFeet();
  const edge = hotSpringSoak.dryEdge();
  const bathEdge = edge && mascotFollowGround(edge.x, edge.n, edge.ground) !== undefined ? edge : undefined;
  ownedMascot = mascotFollower.update({
    x: seated?.x ?? x, n: seated?.n ?? n, ground, yaw: seated?.yaw ?? playerBodyYaw(),
    speed: movementSpeed, indoor: Boolean(homeReturn), wet: Boolean(wetGround),
    skating: skatesOnIce(), bathing: hotSpringSoak.active(), sitting: Boolean(seated),
  }, dt, mounted, bathEdge);
  if (ownedMascot) presence.sendMascot({
    east: ownedMascot.x, north: ownedMascot.n, height: ownedMascot.ground, yaw: ownedMascot.yaw,
  });
}

function supportAt(
  east: number, north: number, limit: number, solidLimit = -Infinity, radius = bodyRadius,
  surface = surfaceAt(east, north), { floors, ramps, colliders } = geometryAt(east, north),
) {
  const z = -north;
  let height = surface;
  for (const floor of floors) {
    if (floor.max[1] <= limit && overlapsBody(east, north, floor, radius)) height = Math.max(height, floor.max[1]);
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
      if (solid.max[1] <= solidLimit && overlapsBody(east, north, solid, radius)) height = Math.max(height, solid.max[1]);
    }
  }
  return height;
}

function obstructed(east: number, north: number, feet: number, { colliders, floors } = geometryAt(east, north)) {
  if (cloudRoute.active()) return cloudRoute.blocked(east, north, feet, bodyRadius, bodyHeight);
  if (!homeReturn && east < 0) {
    if (!outdoorWalkable(east, north)) return true;
    return ensureWestCraterRoad().fenceBlocks(east, north, feet, bodyRadius);
  }
  const intersects = (box: Box) => feet + surfaceEpsilon < box.max[1] &&
    feet + bodyHeight - surfaceEpsilon > box.min[1] && overlapsBody(east, north, box);
  return railway.vehicleBlocks(east, north, feet, bodyHeight, bodyRadius) ||
    activities.some(activity => activity.blocked?.(east, north, feet)) ||
    colliders.some(intersects) || floors.some(intersects);
}

function dryTownLandingHeight(east: number, north: number, heightHint?: number, outdoors = false) {
  const canStand = outdoors ? outdoorWalkable : walkable;
  const townWest = outdoors || !homeReturn ? craterWestSurvey.west : 0;
  if (east < townWest + bodyRadius || north < bodyRadius || east > worldBounds.width - bodyRadius ||
    north > worldBounds.depth - bodyRadius || !canStand(east, north)) return undefined;
  if (bridgeAt(east, north) === undefined && (isWater(east, north) || townWater.at(east, north))) return undefined;
  const surface = outdoors ? outdoorSurfaceAt(east, north) : surfaceAt(east, north);
  const geometry = outdoors ? outdoorGeometryAt(east, north) : geometryAt(east, north);
  const base = heightHint ?? surface;
  const feet = supportAt(east, north, base + stepHeight, base + surfaceEpsilon, bodyRadius, surface, geometry);
  if (Math.abs(feet - base) > stepHeight || obstructed(east, north, feet, geometry)) return undefined;
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
  if (cloudRoute.active() && !cloudRoute.acceptsStep(x, n, nextX, nextN, bodyRadius)) return false;
  if (!walkable(nextX, nextN)) return false;
  const feet = airHeight ?? ground;
  const limit = feet + (airHeight === undefined ? stepHeight : surfaceEpsilon);
  const floor = supportAt(nextX, nextN, limit, airHeight === undefined ? ground + .03 : limit);
  const nextHeight = airHeight === undefined ? floor : feet;
  if (floor > limit || obstructed(nextX, nextN, nextHeight)) return false;
  if (!homeReturn && currentGuardDuty()?.blocksStep(
    { east: x, north: n, height: feet }, { east: nextX, north: nextN, height: nextHeight },
  )) return false;
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

function campfireGround(east: number, north: number, height?: number) {
  if (bridgeAt(east, north) || isLakeSkateIce(east, north) || townWater.at(east, north)) return;
  const base = height ?? pineCamp.fireGroundAt(east, north) ?? grid.heightAt(east, north);
  const feet = supportAt(east, north, base + stepHeight, base + surfaceEpsilon);
  if (Math.abs(feet - base) > (height === undefined ? .30 : .14) ||
      !canStandAtActivity(east, north, feet) || roofed(east, north, feet) ||
      activitySpots.some(spot => Math.abs(spot.ground - feet) < .65 &&
        (spot.x - east) ** 2 + (spot.n - north) ** 2 < .85 ** 2)) return;
  return feet;
}
const campfireSites = findRegionalCampfires(campfireGround, layout.plaza.bounds, { pineCamp: true });
const pineFire = campfireSites.find(site => site.id === pineCampfireId);
const forestChopSites = findForestChopSites(campfireSites, campfireGround);
const forestCampfire = createForestCampfire(scene, { announce: announceActivity }, forestChopSites,
  { isNight: () => nightMode, pineCamp: pineFire });
const outdoorCampfires = createTownCampfires(scene, activityContext, campfireSites, forestCampfire.flames);
scenery.setCampfirePieces(campfirePieces(campfireSites));

function isAtPineSeat(seat: TownSeat) {
  return pineFire?.seats.some(site => site.x === seat.x && site.n === seat.n && site.ground + 1.475 === seat.eyeY) ?? false;
}

const pineFireActivities = createPineFireActivities({ open: activityContext.open, announce: announceActivity }, regionalCarry, {
  lighted: () => forestCampfire.pineCampState().fuel > 0,
  warmFromRoast: warmFromDrink,
  storyHint: () => pineCampActivity.storyHint(),
  leaveSeat,
});
const pineCampActivity = createPineCampActivity({ open: activityContext.open, announce: announceActivity }, {
  heightAt(east, north) {
    const base = pineCamp.fireGroundAt(east, north) ?? grid.heightAt(east, north);
    return supportAt(east, north, base + stepHeight, base + surfaceEpsilon);
  },
  canStand: canStandAtActivity,
  rollingAt() {
    if (!walking || homeReturn || seated || sledRide.active() || railway.riding ||
        boardingGround || airHeight !== undefined) return;
    const exposed = isExposedSnowAt(grid, x, n, ground, snowCleared);
    const snow = !exposed ? 'other' : snowCover.depthAt(x, n, ground, snowCleared) >= .6 ? 'deep' : 'shallow';
    return { x, n, snow };
  },
  setFormation: pineCamp.setFormation,
  setTreasureTrailVisible: pineCamp.setTreasureTrailVisible,
  openGrill: pineFire ? pineFireActivities.openGrill : undefined,
});
activities.push(outdoorCampfires, forestCampfire, pineCampActivity, { spots: [], update: pineFireActivities.update });
activitySpots.push(...outdoorCampfires.spots, ...forestCampfire.spots, ...pineCampActivity.spots);
const marketResidentLookup = createMarketResidentStationLookup({
  market: () => architecture.get('market-stalls'),
  fairSpots: marketFair.spots,
  standableGround: dryTownLandingHeight,
});
activitySpots.push(...createMarketVenueActivities(
  architecture.get('market-stalls'), activityContext, dryTownLandingHeight,
  filename => { photoFilename = filename; },
));
const plazaResidentGathering = createPlazaResidentGathering(canStandAtActivity, grid.heightAt);
activitySpots.push(...registerTownResidentStations(npcActivity, {
  plazaGathering: plazaResidentGathering,
  campfires: campfireSites,
  canStand: canStandAtActivity,
  isNight: () => nightMode,
  forestChop: () => forestCampfire.spots.find(spot => spot.label === '篝火旁劈柴'),
  mainFishing: () => iceFishing.spots[0],
  palaceProgress: () => icePalaceActivity?.state(),
  marketStall: marketResidentLookup,
  canCollect: zodiac.canCollect,
}));

const plazaInformation = createPlazaInformationActivity(showLiveRailSchedule, {
  clock: ceremonyClock,
  train: () => railway.timetable('coaster-station'),
  roster: presence.townRoster,
  stage: () => {
    const state = stageActivity.getShowState();
    return state.playing ? stageProgram.find(({ id }) => id === state.act)?.announcement : undefined;
  },
  formalSnowFight: () => nightMode && snowCover.depth().level >= 1,
  latestWish: wishActivity.latestWish,
}, grid.heightAt, canStandAtActivity);
activitySpots.push(...plazaInformation.spots);

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
if (!landAtSelectedDestination()) throw new Error('小镇出生点不可用');
townSledRacks = createSledRacks('town');
walking = true;
element('help').textContent = touchWalk.active()
  ? '滑动转向，短按大交互键互动。瞄准雪地长按交互键采雪。点地预览，再点同一处放墙。点空处或人物投雪球。'
  : walkDragHelp;
refreshLockHint();
let presenceSkateSpeed = 0;
let previousPoseSession: number | null = null;
let ceremonyArrivalPose: { value: TownAvatarPose; until: number } | undefined;
let ceremonyLook: { began: number; deadline: number; yaw: number; pitch: number } | undefined;

function findCeremonySledLanding(x: number, n: number) {
  const [west, south, east, north] = layout.plaza.bounds;
  return findNearestLegalSpawn({ x, n }, (targetX, targetN) => {
    if (targetX < west || targetX > east || targetN < south || targetN > north) return undefined;
    const feet = dryTownLandingHeight(targetX, targetN);
    if (feet === undefined) return undefined;
    const sledFeet = sledGroundAt(targetX, targetN);
    if (Math.abs(sledFeet - feet) > surfaceEpsilon || !sledRide.canRelocateMounted(targetX, targetN, sledFeet)) return undefined;
    return sledFeet;
  });
}

function arriveAtCeremony(event: CeremonyArrival, now: number) {
  const landing = ceremonyArrivalAt(event.slot, event.edge);
  if (!landing) return;
  const homeBeforeArrival = homeReturn;
  homeReturn = undefined;
  const mounted = sledRide.active();
  let arrival = mounted ? findCeremonySledLanding(landing.east, landing.north) : undefined;
  if (!mounted) {
    const feet = dryTownLandingHeight(landing.east, landing.north);
    if (feet !== undefined) arrival = { x: landing.east, n: landing.north, ground: feet };
  }
  const stage = layout.plots.find(({ id }) => id === 'stage')!;
  const [faceEast, faceNorth, faceHeight] = landing.focus === 'tree'
    ? [208, 198, 26]
    : [stage.origin[0], stage.origin[1], stage.origin[2] + 15];
  const faceYaw = (east: number, north: number) => Math.atan2(faceEast - east, faceNorth - north);
  if (!arrival || (mounted && !sledRide.relocateMounted(arrival.x, arrival.n, arrival.ground, faceYaw(arrival.x, arrival.n)))) {
    homeReturn = homeBeforeArrival;
    announceActivity('广场落脚点被挡住，请沿灯路前往广场。');
    return;
  }

  ceremonyArrivalPose = {
    value: effectiveTownAvatarPose(now < drinkingPoseUntil, hotSpringSoak.active(),
      !!boardingGround, !!seated, presenceSkateSpeed, mounted),
    until: now + 350,
  };
  if (sharedHome) sharedHome.visible = false;
  camera.layers.set(0);
  railway.cancelRide();
  boardingGround = undefined;
  lastRailStopShown = undefined;
  leaveSeat(true);
  lakeSkating.stop();
  plazaPhoto.leaveForCeremony();
  if (placeCard.open) placeCard.close();
  if (museumVisit.dialog.open) museumVisit.dialog.close();
  museumInspection.close();
  museumLaunch.close();
  museumGuide.setActive(false);
  resetMovement();

  ({ x, n, ground } = arrival);
  airHeight = undefined;
  riseSpeed = 0;
  yaw = faceYaw(x, n);
  pitch = Math.atan2(faceHeight - ground - eye, Math.hypot(faceEast - x, faceNorth - n));
  const worldNow = ceremonyClock.now();
  const midnight = ceremonyMidnight(ceremonyEveYear(worldNow, ceremonyClock.utcOffsetMinutes), ceremonyClock.utcOffsetMinutes);
  ceremonyLook = !reduceSnowEffects.matches && worldNow < midnight
    ? { began: worldNow, deadline: midnight, yaw: Math.atan2(Math.sin(yaw), Math.cos(yaw)), pitch }
    : undefined;
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
function walkingAxes() {
  const forward = Number(forwardHeld()) - Number(keys.has('KeyS') || keys.has('ArrowDown')) + touchWalk.axes.forward;
  const right = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft')) + touchWalk.axes.right;
  const sprint = forward > .12 && (doubleForward || keys.has('ShiftLeft') || keys.has('ShiftRight') || touchWalk.sprinting);
  return { forward, right, sprint };
}

function refreshPlayerControls() {
  mobileControls.update({
    mobile: touchWalk.active(),
    canMove: moveAllowed(),
    driving: sledRide.active(),
    canUseSnow: canUseSnow(),
    action: currentAction()?.label,
  });
}

function stepMountedSled(forward: number, turn: number) {
  const brake = sledBrakeHeld || touchSledBrakeHeld;
  const drift = sledDrift.update(townPhysicsDelta, {
    grounded: !sledRide.airborne(), speed: sledRide.speed(),
    turn, lateral: sledRide.lateral(),
    engaged: sledRide.drifting() && (forward < -.1 || brake),
  });
  sledRide.step(townPhysicsDelta, { forward, turn, brake }, drift.boost);
  alignPlayerWithSled();
}

function updateSledPresentation(visuals: SledRackVisuals, dt: number) {
  sledRide.finishFrame(dt, x, n);
  const sledFrame = sledAnimation.step(dt, {
    mounted: sledRide.active(), east: x, north: n, height: airHeight ?? ground, yaw: playerBodyYaw(),
    speed: sledRide.speed(), turn: sledRide.turnRate(), braking: sledRide.braking(), airborne: sledRide.airborne(),
    drifting: sledRide.drifting(),
  });
  const sledDisplay = sledRide.active() ? sledRide.spot : undefined;
  if (sledDisplay) {
    visuals.setPose(sledDisplay.x, sledDisplay.n, sledDisplay.y, sledDisplay.yaw,
      sledFrame.shellRoll + sledRide.roll(), sledFrame.shellPitch, sledRide.active() ? sledFrame : undefined);
  } else visuals.hide();
  visuals.update(dt);
  const targetFov = sledRide.active() ? 58 + sledFrame.fov : 58;
  if (Math.abs(camera.fov - targetFov) > .01) {
    camera.fov = targetFov;
    camera.updateProjectionMatrix();
  }
  sledStatus.textContent = sledRide.recovering() && sledRide.active() ? '翻橇中 · 仍在雪橇上' : sledRide.active()
    ? `雪橇 ${(sledRide.speed() * 3.6).toFixed(0)} km/h` +
      (sledDrift.drifting() ? ` · 漂移充能 ${Math.round(sledDrift.charge() * 100)}%`
        : sledDrift.boosting() ? ' · 漂移加速' : '')
    : sledRide.recovering() ? '翻橇了，缓一缓' : '';
}

function renderCloudRoute(frameSeconds: number) {
  const cabin = cloudRoute.ridePoint();
  if (cabin) {
    cloudRoute.updateView(cabin);
    faceFrom(cabin.east, cabin.north, cabin.height + eye, yaw, pitch);
    element('position').textContent = '缆车一线 · 前山';
  } else {
    summitSledRacks ??= createSledRacks('summit');
    const { forward, right, sprint } = walkingAxes();
    const speed = (sprint ? 11.3 : 7.5) / Math.max(1, Math.hypot(forward, right));
    const east = (Math.sin(yaw) * forward + Math.cos(yaw) * right) * speed;
    const north = (Math.cos(yaw) * forward - Math.sin(yaw) * right) * speed;
    const interpolation = walkClock.advance(frameSeconds, () => {
      walkPrevious.copy(walkCurrent);
      if (moveAllowed()) {
        if (sledRide.active()) stepMountedSled(forward, right);
        else {
          const nextX = x + east * townPhysicsDelta, nextN = n + north * townPhysicsDelta;
          if ((east || north) && !tryMove(nextX, nextN) && !tryMove(nextX, n)) tryMove(x, nextN);
          stepJump(townPhysicsDelta);
        }
      }
      storeWalkView(walkCurrent);
    });
    walkRender.lerpVectors(walkPrevious, walkCurrent, interpolation);
    faceFrom(walkRender.x, -walkRender.z, walkRender.y, yaw, pitch);
    const place = cloudRoute.updateView({ east: walkRender.x, north: -walkRender.z, height: walkRender.y - eye });
    element('position').textContent = `东 ${x.toFixed(1)} m · 北 ${n.toFixed(1)} m · ${place}${sledRide.active() ? ' · 雪橇' : ''}`;
    updateSledPresentation(summitSledRacks.visuals, Math.min(.25, frameSeconds));
  }
  presence.setActivityPose(effectiveTownAvatarPose(false, false, false, false, 0, sledRide.active(), sledRide.drifting()));
  presence.sample(!cabin && walking, x, n, airHeight ?? ground, playerBodyYaw());
  presence.update(Math.min(.25, frameSeconds));
  const enabled = moveAllowed();
  touchWalk.setAllowed(enabled);
  crosshair.hidden = !lookAllowed();
  touchJump.disabled = !canJump();
  museumMapButton.hidden = true;
  refreshPlayerControls();
  renderer.render(cloudRoute.scene, camera);
  if (profileTown) {
    renderer.domElement.dispatchEvent(new CustomEvent('town-frame-profile', { detail: {
      frameMs: frameSeconds * 1000, calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles, cameraY: camera.position.y,
    } }));
  }
}

renderer.setAnimationLoop(now => {
  const frameSeconds = Math.max(0, now - previous) / 1000;
  const dt = Math.min(.25, frameSeconds);
  previous = now;
  cloudRoute.update({ east: x, north: n, height: ground }, !sledRide.active());
  updateGuardPosts();
  if (cloudRoute.active()) {
    renderCloudRoute(frameSeconds);
    return;
  }
  practiceTarget.updateRound();
  const startEast = x, startNorth = n;
  if (ceremonyLook) {
    if (!lookAllowed() || keys.size || seated || boardingGround) ceremonyLook = undefined;
    if (ceremonyLook) {
      const { began, deadline, yaw: initialYaw, pitch: initialPitch } = ceremonyLook;
      const elapsed = ceremonyClock.now();
      if (elapsed > deadline + 2000) ceremonyLook = undefined;
      else {
        const t = Math.min(1, Math.max(0, (elapsed - began) / (deadline - began)));
        const amount = t * t * (3 - 2 * t);
        yaw = initialYaw * (1 - amount);
        pitch = initialPitch + (Math.PI / 10 - initialPitch) * amount;
        if (t === 1) ceremonyLook = undefined;
      }
    }
  }
  movementStepMs = 0;
  landingFeedback.update(frameSeconds);
  landingSnow.update(frameSeconds);
  const beacon = architecture.get('lighthouse')?.userData.beaconPivot as Object3D | undefined;
  railway.update(dt);
  const slide = palaceSlide?.step(dt, Boolean(seated));
  if (slide?.kind === 'riding') {
    seated = { ...slide.seat, pitch: slide.pitch };
    palaceSlideGround = slide.ground;
  } else if (slide?.kind === 'land') {
    leaveSeat();
    landPalaceSlide(slide.landing);
  }
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
    const { forward, right, sprint } = walkingAxes();
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
        if (sledRide.active() || sledRide.recovering()) {
          snowMoveScale = chillMoveScale = 1;
          lakeSkateMotion.reset();
          if (sledRide.active()) {
            const beforeX = x, beforeN = n;
            stepMountedSled(forward, right);
            if (sledRide.active() && !sledRide.airborne() && sledRide.speed() > .5 &&
              Math.hypot(x - beforeX, n - beforeN) > .05) {
              snowCover.addTrack(beforeX, beforeN, x, n, sledRide.deepSnow() ? 1 : .55, sledRide.drifting());
            }
          }
        } else if (skatesOnIce() && landingFeedback.pose() === 'none') {
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
        if (!sledRide.active() && !sledRide.recovering()) stepJump(townPhysicsDelta);
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
    const movement = sledRide.recovering() ? '翻橇' : sledRide.active() ? '雪橇' :
      landingPose === 'prone' ? '趴倒' : landingPose === 'compress' ? '落地' :
      water?.mode === 'swim' ? '游泳' : water?.mode === 'wade' ? '涉水' :
      airHeight !== undefined ? '腾空' : skatesOnIce() ? '滑冰' : sprint ? '疾跑' : '行走';
    element('position').textContent = `东 ${x.toFixed(1)} m · 北 ${n.toFixed(1)} m · ${movement}`;
  }
  if (!walking || !moveAllowed() || !skatesOnIce()) presenceSkateSpeed = 0;
  const poseSession = presence.selfId();
  if (!walking || (previousPoseSession !== null && previousPoseSession !== poseSession)) drinkingPoseUntil = 0;
  previousPoseSession = poseSession;
  if (ceremonyArrivalPose && now >= ceremonyArrivalPose.until) ceremonyArrivalPose = undefined;
  const activityPose = walking && landingFeedback.pose() === 'prone'
    ? effectiveTownAvatarPose(false, false, false, true, 0)
    : effectiveTownAvatarPose(now < drinkingPoseUntil, hotSpringSoak.active(), !!boardingGround, !!seated, presenceSkateSpeed, sledRide.active(), sledRide.drifting());
  presence.setActivityPose(ceremonyArrivalPose?.value ?? activityPose);
  const throneSeat = palaceThroneSeat();
  presence.setWestDomain(walking && !homeReturn && x < 0);
  presence.sample(walking,
    boardingGround ? camera.position.x : seated?.x ?? x,
    boardingGround ? -camera.position.z : seated?.n ?? n,
    boardingGround ? camera.position.y - eye : palaceSlideGround ?? (throneSeat ? throneSeat.eyeY - .98 : airHeight ?? ground),
    boardingGround ? Math.atan2(lookAhead.x, -lookAhead.z) + rideYawOffset : seated?.yaw ?? playerBodyYaw(),
    walking && !museumOverlay(),
  );
  presence.update(dt);
  icePalaceCrown.render(icePalaceSelfCrowned ? 'self' : presence.remoteCrown() ?? null, camera);
  bellGame.update(dt);
  // 3.0 D2: sled presentation, field track rendering, grand prix timing/board.
  updateSledPresentation(townSledRacks.visuals, dt);
  sledTrackView.sync(snowCover, now / 1000);
  const gpStatus = walking
    ? grandPrix.update(x, n, { sledding: sledRide.active(), skating: skatesOnIce() && presenceSkateSpeed > .5 })
    : '';
  if (gpStatus !== grandPrixStatus.textContent) grandPrixStatus.textContent = gpStatus;
  const gpResult = grandPrix.takeResult();
  if (gpResult !== undefined) {
    presence.sendGrandPrixResult(gpResult);
    grandPrix.recordResult({
      id: String(presence.selfId() ?? 'local'), name: presence.playerName(), totalMs: gpResult, at: Date.now(),
    });
    renderGrandPrixBoard();
  }
  updateMascotFollower(dt, Math.hypot(x - startEast, n - startNorth) / Math.max(dt, .001));
  checkHouseDoorLanding();
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
  const warmStationView = stationView && !cullStationView;
  const cullCamera = cullStationView ? stationViewCamera() : undefined;
  const detailStartedAt = profileTown ? performance.now() : 0;
  snowCover.update(dt, nightMode);
  if (!homeReturn) prepareTerrain(camera.position.x, -camera.position.z, false, false, visualSnowCover, cullCamera);
  const terrainMs = profileTown ? performance.now() - detailStartedAt : 0;
  stampMarkers.visible = stampSites.some(site =>
    Math.abs(camera.position.x - site.x) < 34 && Math.abs(camera.position.z + site.n) < 34 &&
    Math.abs(camera.position.y - grid.heightAt(site.x, site.n)) < 18);
  const towerInterior = architecture.get('clocktower')?.userData.detailInterior as Group | undefined;
  if (towerInterior) towerInterior.visible = Math.hypot(camera.position.x - 226, camera.position.z + 223) < 45;
  updateTowerWingVisibility(tower, camera.position.x, -camera.position.z, camera.position.y);
  if (!homeReturn) {
    if (!cloudRoute.active() && camera.position.x < 100) ensureWestCraterRoad();
    prepareLandmarks(camera.position.x, -camera.position.z);
  }
  if (!homeReturn && !extensionStreetsLoad && (camera.position.x > 320 || -camera.position.z > 275)) {
    void prepareExtensionStreets();
  }
  extensionStreets?.update(camera, false);
  zodiacSites.update(camera.position, !homeReturn);
  const baths = architecture.get('hot-spring');
  if (baths) baths.userData.updateSteam(dt, camera.position.distanceTo(baths.position));
  scenery.update(dt, walking, camera.position.x, camera.position.y, camera.position.z);
  outdoorCampfires.updateFlames(dt, camera.position.x, -camera.position.z, Boolean(homeReturn));
  scenery.updatePlazaSnowSupply(plazaSnowSupply.heightScale, camera.position.x, -camera.position.z);
  const museum = architecture.get('memorial');
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
  personalFirecrackers.update();
  const ceremonyState = ceremony.update();
  const offset = ceremonyClock.utcOffsetMinutes;
  const midnight = ceremonyMidnight(ceremonyEveYear(ceremonyState.now, offset), offset);
  updateTowerTime(tower, ceremonyState.now, ceremonyState.secondsToMidnight, ceremonyState.phase === 'climax');
  const dailyChime = dailyTowerChime(ceremonyState.now, ceremonyState.phase);
  const ordinaryBellHours = ceremonyState.phase === 'ordinary';
  plazaResidentGathering.tick(ceremonyState.now, ordinaryBellHours);
  if (!ordinaryBellHours) setTowerDusk(false);
  if (dailyChime) {
    const { cue, audible } = dailyChime;
    if (audible) {
      handleCeremonyCue(cue);
      marketFair.refresh();
      plazaResidentGathering.start(cue.at, cue.hour, campfireSites);
      if (cue.hour === 17 || cue.hour === 18) setTowerDusk(true);
      else if (cue.hour === 7) setTowerDusk(false);
    } else {
      bellMotion.strike(.65);
      nextHourlyBell = cue.at + 2020;
      hourlyBellsRemaining = cue.strikes - 1;
    }
  }
  let ceremonyElapsed: number | undefined;
  if (ceremonyState.phase !== 'ordinary') {
    ceremonyElapsed = (ceremonyState.now - midnight) / 1000;
    if (ceremonyState.phase === 'approach' && overtureMidnight !== midnight) {
      overtureMidnight = midnight;
      festival.launchOverture(midnight - 600_000, ceremonyClock.now);
    }
  }
  const duckMusic = ceremonyElapsed !== undefined && ceremonyElapsed >= -10 && ceremonyElapsed < 30;
  festival.update(dt, { listener: camera.position, ceremonyElapsed, musicLevel: townBgm.setDuck(duckMusic ? .3 : 1) });
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
  // H2: the unified snow field follows the same shared-clock weather tiers.
  snowCover.setWeather(weather);
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
    else if (scenery.litAt(shedEast, shedNorth, shedFeet) || townLights.litAt(shedEast, shedNorth, shedFeet)) {
      coldSurface = 'lamp';
    } else if (effectiveSnowIntensity >= 1 && isExposedSnowAt(grid, shedEast, shedNorth, shedFeet, districts.sweptAt)) {
      coldSurface = 'dark-snow';
      coldDepth = snowCover.depthAt(shedEast, shedNorth, shedFeet, districts.sweptAt);
    }
  }
  // H1 sledding exemption: mobility factor stays 1; while sledding the frost
  // tracker pauses exposure growth and thaws (town-frost sledding parameter).
  ceremonyFrost.setExposure(effectiveSnowIntensity, coldDepth, coldSurface, hasFrostCeremonyRelief(ceremonyState), 1, sledRide.active());
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
  const canControl = walking && !townSettings.open && !placeCard.open && !museumVisit.dialog.open;
  touchWalk.setAllowed(moveAllowed());
  crosshair.hidden = !lookAllowed();
  touchJump.disabled = !canJump();
  museumMapButton.hidden = !canControl || museumOverlay() || Math.abs(local.x) > 29 || Math.abs(local.z) > 19;
  refreshPlayerControls();
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
    const insideTavern = walking && !homeReturn && !boardingGround &&
      tavernInteriorContains(tavern, seated?.x ?? x, seated?.n ?? n, airHeight ?? ground);
    updateTavernInteriorVisibility(tavern, (groupPhotoFrame ? plazaCamera : camera).position, insideTavern);
    const staticViewRoots = cullStationView || warmStationView ? [landscape, detailedBridges,
      ...(trackViewRoot ? [trackViewRoot] : []), ...(extensionStreets ? [extensionStreets.group] : []),
      ...architecture.values()] : [];
    if (warmStationView) {
      viewBatches.warm(staticViewRoots);
      viewFaces.warm(architecture.values());
    }
    viewBatches.update(cullStationView, cullCamera ?? camera, staticViewRoots);
    viewFaces.update(cullStationView, camera.position, architecture.values());
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
    summitSkylineDraws = 0;
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
      const skylinePeak = reportSummitSkyline ? summitSkylinePeakNdc.copy(summitSkylinePeak).project(camera) : null;
      renderer.domElement.dispatchEvent(new CustomEvent('town-frame-profile', { detail: {
        frameMs: frameSeconds * 1000, feedbackMs, drinkEffectsMs,
        movementMs: movementStepMs, snowballMs: snowballPhysicsMs,
        calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, cameraY: camera.position.y, detailMs,
        weatherMs, weatherTier: weather.tier, snowIntensity: effectiveSnowIntensity, snowCover: visualSnowCover,
        fogNear: weatherFog.near, fogFar: weatherFog.far, points: renderer.info.render.points,
        ...(skylinePeak ? { summitSkyline: { draws: summitSkylineDraws, peakNdc: skylinePeak.toArray(),
          camera: camera.position.toArray(), far: camera.far } } : {}),
      } }));
    }
  }
  if (photoFilename) {
    const filename = photoFilename;
    photoFilename = undefined;
    downloadTownCanvas(renderer.domElement, filename);
  }
});

