import { Group, Mesh, type Object3D } from 'three';
import { createMainSummitBlock, mainSummitLayout } from './main-summit-block';
import { createMainSummitTrail } from './main-summit-trail';
import { createMainSummitIcefall } from './main-summit-icefall';
import { createMainSummitRockTowers } from './main-summit-rock-towers';
import { buildWindShelter, createSkyWatchRelic, createTrailMarkers } from './main-summit-field-sites';
import { buildMainSummitPaint } from './main-summit-paint';
import { createMainSummitBellPosts } from './main-summit-bell-posts';
import { createMainSummitSurveyStations } from './main-summit-survey-stations';
import {
  createMainSummitRegistrationLandmarks, mountMainSummitRegistration,
} from './main-summit-registration';
import { createMainSummitHutFurnishings } from './main-summit-hut-furnishings';
import { mountMainSummitWingRack } from './main-summit-wing-rack';
import { createMainSummitWindGround } from './main-summit-wind-ground';
import { createMainSummitBannerCloud } from './main-summit-banner-cloud';
import { createMainSummitMachineRoom } from './main-summit-machine-room';
import {
  summitGlideNineRingMetres, surveySummitGlideRings,
} from './main-summit-glide-rings';
import { createGlideRingEntities } from './main-summit-glide-ring-entities';
import { mountSummitGlideRingVisuals } from './main-summit-glide-ring-visuals';
import { surveySummitGlidePracticeTarget } from './main-summit-glide-target';
import { mountSummitGlideTargetVisual } from './main-summit-glide-target-visual';
import { sampleTownD2R30Height } from './town-d2-r30-domain';
/**
 * D2-R07: mounts the actual summit facility bodies onto the R30 solid massif.
 *
 * Until now the R30 assembly only carried terrain, support geometry and the
 * stone pedestals from D2-R03 — every summit building, hut furnishing and
 * story prop stayed on the P-1 reference field. This module closes that gap:
 * it re-mounts the canonical facility modules (registration landmarks, hut
 * interior, wind ground, wing rack, icefall, rock towers, sky-watch relic,
 * trail markers, bell posts, survey stations, glide course) against the R30
 * height field so each body stands on the real terrain instead of the old
 * smoothed cone.
 *
 * Rules honoured here:
 *  - No canonical coordinate, height, gate count or rule is rewritten. The
 *    modules keep their own geometry; only the sampled ground changes.
 *  - Facilities whose canonical floor sits above the R30 ground keep their
 *    surveyed height and are reported as `pedestal`, so the D2-R03 stone
 *    foundation carries them instead of this module faking a deck.
 *  - The cloud terrace body belongs to window D's front-ridge domain and is
 *    deliberately not mounted here.
 */

/** A mounted facility and how it sits on the R30 terrain. */
export type TownD2R30SummitFacilityReport = Readonly<{
  id: string;
  kind: 'building' | 'prop' | 'terrain' | 'course';
  east: number;
  north: number;
  /** The facility's own datum height (deck, base or ring altitude). */
  height: number;
  /** The surface the facility actually stands on. */
  ground: number | undefined;
  /** height - ground. Positive means the body floats above that surface. */
  delta: number | undefined;
  status:
    /** Standing on the R30 surface within the grounded band. */
    | 'grounded'
    /** Floating above the R30 surface; a foundation must carry it. */
    | 'pedestal'
    /** Standing on the surveyed walkway deck, which D2-R02 solidifies. */
    | 'on-trail'
    /** An aerial waypoint (glide ring) that never touches the ground. */
    | 'aerial'
    /** Outside the R30 domain; owned by another window. */
    | 'external';
}>;

export type TownD2R30SummitFacilitiesStats = Readonly<{
  facilities: number;
  grounded: number;
  pedestal: number;
  onTrail: number;
  aerial: number;
  external: number;
  meshes: number;
  triangles: number;
  draws: number;
  /** Transparent paint quads dropped because no vertex carried any alpha. */
  culledPaintQuads: number;
}>;

export type TownD2R30SummitFacilitiesOptions = Readonly<{
  arrivalHeight?: number;
  heightAt?: (east: number, north: number, arrivalHeight?: number) => number | undefined;
  /** Include the hut interior + registration landmarks (default true). */
  includeHut?: boolean;
  /** Include the icefall and rock towers (default true). */
  includeGeology?: boolean;
  /** Include trail markers, bell posts, paint and survey stations (default true). */
  includeRouteProps?: boolean;
  /** Include the snow-wing rack, wind ground and glide course (default true). */
  includeFlight?: boolean;
}>;

const DEFAULTS = Object.freeze({
  /** Height gap under which a body counts as standing on the terrain. */
  groundedBand: 1.5,
  /** The snow-wing launch and its glide course start on the summit plateau. */
  glideLaunch: Object.freeze({ east: 62.5, north: 975, heading: Math.PI, speed: 7.5 }),
  /** Ground clearance used when the launch drop is measured. */
  glideProbeNorth: 935,
});

type GroundAt = (east: number, north: number) => number | undefined;

/**
 * Drops the fully transparent quads from the canonical summit paint overlay.
 *
 * The canonical overlay paints the whole P-1 footprint, so every cell whose
 * band alpha resolves to 0 still ships a quad. Those quads are invisible but
 * they still cost triangles, and because the overlay is a transparent material
 * they still write depth over the massif surface underneath them. The shared
 * P-1 module stays untouched; the R30 host trims its own copy instead.
 */
function cullTransparentPaintQuads(mesh: Mesh): number {
  const geometry = mesh.geometry;
  const index = geometry.getIndex();
  const color = geometry.getAttribute('color') as
    | { count: number; getW(index: number): number }
    | undefined;
  if (!index || !color) return 0;
  const kept: number[] = [];
  let dropped = 0;
  for (let triangle = 0; triangle + 2 < index.count; triangle += 3) {
    const a = index.getX(triangle);
    const b = index.getX(triangle + 1);
    const c = index.getX(triangle + 2);
    const visible = color.getW(a) > 0 || color.getW(b) > 0 || color.getW(c) > 0;
    if (visible) kept.push(a, b, c);
    else dropped += 1;
  }
  if (!dropped) return 0;
  geometry.setIndex(kept);
  return dropped;
}

export function createTownD2R30SummitFacilities(
  options: TownD2R30SummitFacilitiesOptions = {},
) {
  const arrivalHeight = options.arrivalHeight ?? 347;
  const includeHut = options.includeHut ?? true;
  const includeGeology = options.includeGeology ?? true;
  const includeRouteProps = options.includeRouteProps ?? true;
  const includeFlight = options.includeFlight ?? true;
  if (!Number.isFinite(arrivalHeight)) {
    throw new RangeError('D2-R07 requires a finite arrival height.');
  }
  const sample = options.heightAt ?? sampleTownD2R30Height;
  const heightAt: GroundAt = (east, north) => {
    const value = sample(east, north, arrivalHeight);
    return value !== undefined && Number.isFinite(value) ? value : undefined;
  };

  const group = new Group();
  group.name = 'town-d2-r30-summit-facilities';
  const disposers: (() => void)[] = [];
  const reports: TownD2R30SummitFacilityReport[] = [];
  let culledPaintQuads = 0;

  /**
   * Records how a body meets its support surface.
   *
   * `support` states which surface actually carries the body:
   *  - 'terrain' samples the R30 massif;
   *  - 'walkway' means the body stands on the surveyed walkway deck that
   *    D2-R02 solidifies with cut/fill shoulders and piers;
   *  - 'air' means the body is an aerial waypoint and never touches ground.
   */
  const record = (
    id: string,
    kind: TownD2R30SummitFacilityReport['kind'],
    east: number,
    north: number,
    height: number,
    support: 'terrain' | 'walkway' | 'air' = 'terrain',
  ) => {
    if (support === 'air') {
      reports.push(Object.freeze({
        id, kind, east, north, height,
        ground: heightAt(east, north),
        delta: undefined,
        status: 'aerial',
      }));
      return;
    }
    const ground = heightAt(east, north);
    if (ground === undefined) {
      reports.push(Object.freeze({
        id, kind, east, north, height, ground: undefined, delta: undefined, status: 'external',
      }));
      return;
    }
    if (support === 'walkway') {
      // The deck the body stands on is the surveyed walkway height; the R30
      // massif only has to be close enough for the D2-R02 earthwork to meet it.
      reports.push(Object.freeze({
        id, kind, east, north, height, ground,
        delta: height - ground, status: 'on-trail',
      }));
      return;
    }
    const delta = height - ground;
    const status = Math.abs(delta) <= DEFAULTS.groundedBand ? 'grounded' : 'pedestal';
    reports.push(Object.freeze({ id, kind, east, north, height, ground, delta, status }));
  };

  // The canonical P-3 walkway is surveyed against the P-1 reference field.
  // Route props that hang off the walkway keep that survey, but every body
  // samples the R30 ground so nothing floats above the new massif.
  const block = createMainSummitBlock(mainSummitLayout, arrivalHeight, 100);
  let trailPoints: ReturnType<typeof createMainSummitTrail>['points'] = [];
  try {
    trailPoints = createMainSummitTrail(block.heightAt, arrivalHeight).points;
  } finally {
    block.dispose();
  }

  if (includeHut) {
    const landmarks = createMainSummitRegistrationLandmarks(arrivalHeight);
    const summit = landmarks.summit;
    const registration = mountMainSummitRegistration(group, landmarks, 'summit');
    disposers.push(() => registration.dispose());
    record('registration-hut', 'building', summit.hut.east + (summit.hut.east - summit.hut.west) / 2,
      summit.hut.north + (summit.hut.north - summit.hut.south) / 2, summit.hut.height);

    const furnishings = createMainSummitHutFurnishings();
    group.add(furnishings.group);
    disposers.push(() => furnishings.dispose());
    record('hut-furnishings', 'building', summit.interior.east, summit.interior.north,
      summit.interior.height);

    // The line-2 lower station machine room stands on the arrival terrace.
    const machineRoom = createMainSummitMachineRoom(arrivalHeight);
    group.add(machineRoom.group);
    disposers.push(() => machineRoom.dispose());
    record('machine-room', 'building', -15.5, 6, arrivalHeight);
  }

  if (includeGeology) {
    const icefall = createMainSummitIcefall(heightAt);
    group.add(icefall.group);
    disposers.push(() => icefall.dispose());
    record('icefall', 'terrain', icefall.topAnchor.east, icefall.topAnchor.north,
      icefall.topAnchor.height);

    const rockTowers = createMainSummitRockTowers(trailPoints, heightAt);
    group.add(rockTowers.group);
    disposers.push(() => rockTowers.dispose());
    for (const cluster of rockTowers.clusters) {
      // A rock tower's cluster height is the spire tip; its base is what
      // meets the ground, so the report compares against that base.
      record(`rock-tower-${cluster.name}`, 'terrain', cluster.east, cluster.north,
        heightAt(cluster.east, cluster.north) ?? cluster.height);
    }
  }

  if (includeRouteProps) {
    const markers = createTrailMarkers(trailPoints, heightAt);
    group.add(markers.group);
    disposers.push(() => markers.dispose());
    record('trail-markers', 'prop', 0, 0, arrivalHeight, 'walkway');

    const paint = buildMainSummitPaint(heightAt);
    // The R30 massif paints its own four-band grammar natively, so the
    // overlay's empty cells carry no picture — only triangles and depth
    // writes. Trim them here; the visible band grammar is untouched.
    culledPaintQuads = cullTransparentPaintQuads(paint.mesh);
    group.add(paint.mesh);
    disposers.push(() => paint.dispose());

    const bellPosts = createMainSummitBellPosts(trailPoints);
    group.add(bellPosts.group);
    disposers.push(() => bellPosts.dispose());
    for (const post of bellPosts.posts) {
      // Bell posts stand beside the surveyed walkway, on the deck that
      // D2-R02 solidifies with its cut/fill shoulders.
      record(`bell-post-${post.index}`, 'prop', post.east, post.north, post.height, 'walkway');
    }

    const icefall = createMainSummitIcefall(heightAt);
    const survey = createMainSummitSurveyStations({
      cloudTerrace: { east: 0, north: -8, height: arrivalHeight },
      trailPoints,
      icefallTop: icefall.topAnchor,
      heightAt,
    });
    group.add(survey.group);
    disposers.push(() => survey.dispose());
    icefall.dispose();
    for (const station of survey.stations) {
      record(`survey-${station.id}`, 'prop', station.east, station.north, station.height);
    }

    // The sky-watch relic sits 80 m radially off the surveyed 640 m trail
    // point, exactly as the canonical field-site module derives it.
    const watchAnchor = trailPoints.reduce((best, point) =>
      Math.abs(point.height - 640) < Math.abs(best.height - 640) ? point : best, trailPoints[0]!);
    const skyWatch = createSkyWatchRelic(watchAnchor, heightAt);
    group.add(skyWatch.group);
    disposers.push(() => skyWatch.dispose());
    record('sky-watch-relic', 'prop', skyWatch.site.east, skyWatch.site.north, skyWatch.site.height);

    const shelterMidPoint = trailPoints[Math.floor(trailPoints.length * .55)]!;
    const shelterMid = buildWindShelter('wind-shelter-trail-mid',
      shelterMidPoint.east + 6, shelterMidPoint.north + 5,
      heightAt(shelterMidPoint.east + 6, shelterMidPoint.north + 5) ?? shelterMidPoint.height);
    group.add(shelterMid.group);
    disposers.push(() => shelterMid.dispose());
    record('wind-shelter-trail-mid', 'prop', shelterMid.east, shelterMid.north, shelterMid.base);
  }

  if (includeFlight) {
    const wingRack = mountMainSummitWingRack(group);
    disposers.push(() => wingRack.dispose());
    record('wing-rack', 'prop', wingRack.stand.east, wingRack.stand.north, wingRack.stand.height);

    const windGround = createMainSummitWindGround(
      { east: DEFAULTS.glideLaunch.east, north: DEFAULTS.glideLaunch.north, height: 800 }, heightAt);
    group.add(windGround.group);
    disposers.push(() => windGround.dispose());
    record('wind-ground', 'building', DEFAULTS.glideLaunch.east, DEFAULTS.glideLaunch.north, 800);

    const bannerCloud = createMainSummitBannerCloud();
    group.add(bannerCloud.group);
    disposers.push(() => bannerCloud.dispose());
    record('banner-cloud', 'prop', 62.5, 1010, 800);

    const launchGround = heightAt(DEFAULTS.glideLaunch.east, DEFAULTS.glideProbeNorth);
    const launch = launchGround === undefined ? undefined : {
      ...DEFAULTS.glideLaunch,
      height: 800,
      drop: 800 - launchGround,
      pathClear: true,
      claimed: true,
    };
    const rings = launch ? surveySummitGlideRings(launch, heightAt, summitGlideNineRingMetres) : [];
    if (rings.length) {
      const visuals = mountSummitGlideRingVisuals(group, rings);
      disposers.push(() => visuals.dispose());
      const entities = createGlideRingEntities(rings, heightAt);
      group.add(entities.group);
      disposers.push(() => entities.dispose());
      for (const ring of rings) {
        record(`glide-ring-${ring.id}`, 'course', ring.east, ring.north, ring.height, 'air');
      }
    }
    const target = launch ? surveySummitGlidePracticeTarget(launch, heightAt) : undefined;
    if (target) {
      const visual = mountSummitGlideTargetVisual(group, target);
      disposers.push(() => visual.dispose());
      record('glide-target', 'course', target.east, target.north, target.height);
    }
  }

  let meshes = 0;
  let triangles = 0;
  group.traverse(object => {
    const mesh = object as Object3D & {
      isMesh?: boolean;
      geometry?: { getIndex(): { count: number } | null; getAttribute(name: string): { count: number } };
      count?: number;
    };
    if (!mesh.isMesh || !mesh.geometry) return;
    meshes += 1;
    const index = mesh.geometry.getIndex();
    const count = index ? index.count : mesh.geometry.getAttribute('position').count;
    triangles += (count / 3) * (mesh.count ?? 1);
  });

  const stats: TownD2R30SummitFacilitiesStats = Object.freeze({
    facilities: reports.length,
    grounded: reports.filter(report => report.status === 'grounded').length,
    pedestal: reports.filter(report => report.status === 'pedestal').length,
    onTrail: reports.filter(report => report.status === 'on-trail').length,
    aerial: reports.filter(report => report.status === 'aerial').length,
    external: reports.filter(report => report.status === 'external').length,
    meshes,
    triangles: Math.round(triangles),
    draws: meshes,
    culledPaintQuads,
  });
  group.userData = {
    owner: 'D2-R07', visualOnly: true, includesWorldCollision: false,
    modifiesHeightAt: false, modifiesFacilityHeight: false,
    reports: Object.freeze(reports.map(report => ({ ...report }))), stats,
    coordinateConvention: 'x=east,y=height,z=-north',
  };

  let disposed = false;
  return {
    group,
    reports: () => Object.freeze(reports.map(report => ({ ...report }))),
    stats: () => stats,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const dispose of disposers) dispose();
      group.removeFromParent();
      group.clear();
      group.userData.disposed = true;
    },
  };
}
