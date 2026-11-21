import { Group, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';
import { createMainSummitApproach, mountMainSummitApproachSigns } from './main-summit-approach';
import { createMainSummitBannerCloud } from './main-summit-banner-cloud';
import { createMainSummitBellPosts } from './main-summit-bell-posts';
import { createMainSummitWindGround } from './main-summit-wind-ground';
import { createGlideRingEntities } from './main-summit-glide-ring-entities';
import {
  buildWindShelter, createSkyWatchRelic, createTrailMarkers, createWishLockPoint,
} from './main-summit-field-sites';
import { createMainSummitHutFurnishings } from './main-summit-hut-furnishings';
import { createMainSummitIcefall } from './main-summit-icefall';
import { createMainSummitMachineRoom } from './main-summit-machine-room';
import { buildMainSummitPaint } from './main-summit-paint';
import {
  cloudTerminal, cloudTerraceTurnNorth, mountMainSummitAssembly, supportsCloudTerrace,
  summitAssemblyAnchor,
} from './main-summit-assembly';
import { mainSummitBounds, mainSummitLayout, mainSummitSpec } from './main-summit-block';
import { createMainSummitCableTravel } from './main-summit-cable-travel';
import { createMainSummitCloudLayer } from './main-summit-cloud-layer';
import { mountSummitGlideRingVisuals } from './main-summit-glide-ring-visuals';
import { createSummitGlideRingProgress, surveySummitGlideRings } from './main-summit-glide-rings';
import { cloudPavilionSites } from './main-summit-pavilion-site';
import { mountMainSummitPosts } from './main-summit-posts';
import { createMainSummitRegistrationLandmarks } from './main-summit-registration';
import { createMainSummitRockTowers } from './main-summit-rock-towers';
import { createMainSummitSurveyStations } from './main-summit-survey-stations';
import { createMainSummitTrail } from './main-summit-trail';
import { mountMainSummitWingRack } from './main-summit-wing-rack';

type Assembly = ReturnType<typeof mountMainSummitAssembly>;

// Surveyed F-1 launch anchor in the P-1 local frame (ZD-01 glide-ring survey baseline).
const glideLaunchBase = { east: 62.5, north: 975, heading: Math.PI, speed: 7.5 } as const;

/**
 * Domain host for the main-summit player content that the entry-graph audit
 * (2026-11-21) found unreachable: approach signs, summit posts, wing rack,
 * cloud layer, glide rings and the P-2 cable-travel logic. Everything mounts
 * inside the assembly's local frame; the cloud route owns the lifecycle.
 */
export function mountMainSummitExtras(assembly: Assembly) {
  const { group } = assembly;
  const landmarks = createMainSummitRegistrationLandmarks(assembly.arrivalHeight);
  const approach = createMainSummitApproach({
    terminal: cloudTerminal,
    terraceTurnNorth: cloudTerraceTurnNorth,
    gateArrival: assembly.stations.gate.to,
    frontStamp: {
      east: landmarks.cloudDeck.stampPoint.east - summitAssemblyAnchor.east,
      north: landmarks.cloudDeck.stampPoint.north - summitAssemblyAnchor.north,
    },
    stampInteractionRadius: 1.1,
  });

  function frontFloor(east: number, north: number, radius = 0) {
    if (north < mainSummitBounds.south) {
      return supportsCloudTerrace(east, north, radius) ? assembly.frontRidgeAt(east, north) : undefined;
    }
    if (Math.abs(east) > mainSummitSpec.arrivalPlaza[0] / 2 || north > mainSummitSpec.arrivalPlaza[1]) return undefined;
    return assembly.block.heightAt(east, north);
  }

  const signs = mountMainSummitApproachSigns(group, approach, frontFloor);

  const pavilionSite = cloudPavilionSites[1]!;
  const gallery = group.getObjectByName('cloud-pavilion-upper-cloud');
  if (!(gallery instanceof Group)) throw new Error('P-9 upper pavilion is missing from the summit assembly.');
  const posts = mountMainSummitPosts(group, {
    approach,
    gate: assembly.stations.gate,
    stations: assembly.stations.stations,
    summit: landmarks.summit,
    upperPavilion: { model: gallery, approach: { east: pavilionSite.approachEast, north: pavilionSite.approachNorth } },
  });

  const wingRack = mountMainSummitWingRack(group);
  const cableTravel = createMainSummitCableTravel(assembly.cable);

  const launchHeight = assembly.block.heightAt(glideLaunchBase.east, 935);
  const glideLaunch = launchHeight === undefined ? undefined : {
    ...glideLaunchBase, height: 800, drop: 800 - launchHeight, pathClear: true, claimed: true,
  };
  const glideRings = glideLaunch ? surveySummitGlideRings(glideLaunch, assembly.block.heightAt) : [];
  const glideVisuals = mountSummitGlideRingVisuals(group, glideRings);
  const glideProgress = createSummitGlideRingProgress(glideRings);
  const glideEntities = createGlideRingEntities(glideRings, assembly.block.heightAt);
  group.add(glideEntities.group);
  // Dual-line placement registry (§4 / revision ch.1): high line for the
  // tailwind window, low line pressed down for headwind. Which line is
  // live is the rules layer's call (B window); placement is surveyed here
  // with the same authority and clearance checks as the canonical line.
  const glideLines = glideLaunch ? {
    high: surveySummitGlideRings(glideLaunch, assembly.block.heightAt,
      [55, 110, 165, 220, 275, 330, 385, 440, 495]),
    low: surveySummitGlideRings(glideLaunch, assembly.block.heightAt,
      [110, 165, 220, 275, 330, 385, 440, 495, 550], -6),
  } : { high: [], low: [] };

  const cloud = createMainSummitCloudLayer({
    bounds: mainSummitBounds,
    summit: mainSummitLayout.summit,
    shoulders: mainSummitLayout.shoulders,
    heightAt: assembly.block.heightAt,
  });
  group.add(cloud.group);

  const paint = buildMainSummitPaint(assembly.block.heightAt);
  group.add(paint.mesh);
  const bannerCloud = createMainSummitBannerCloud();
  group.add(bannerCloud.group);
  const icefall = createMainSummitIcefall(assembly.block.heightAt);
  group.add(icefall.group);
  const trail = createMainSummitTrail(assembly.block.heightAt, assembly.arrivalHeight);
  const rockTowers = createMainSummitRockTowers(trail.points, assembly.block.heightAt);
  group.add(rockTowers.group);
  const surveyStations = createMainSummitSurveyStations({
    cloudTerrace: {
      east: landmarks.cloudDeck.stampPoint.east - summitAssemblyAnchor.east - 2.5,
      north: landmarks.cloudDeck.stampPoint.north - summitAssemblyAnchor.north - 1,
      height: assembly.arrivalHeight,
    },
    trailPoints: trail.points,
    icefallTop: icefall.topAnchor,
    heightAt: assembly.block.heightAt,
  });
  group.add(surveyStations.group);
  const hutFurnishings = createMainSummitHutFurnishings();
  group.add(hutFurnishings.group);
  const wishLock = createWishLockPoint({ east: 12, north: -19, height: assembly.arrivalHeight });
  group.add(wishLock.group);
  const shelterMidPoint = trail.points[Math.floor(trail.points.length * .55)]!;
  const shelterMid = buildWindShelter('wind-shelter-trail-mid',
    shelterMidPoint.east + 6, shelterMidPoint.north + 5,
    assembly.block.heightAt(shelterMidPoint.east + 6, shelterMidPoint.north + 5) ?? shelterMidPoint.height);
  group.add(shelterMid.group);
  const shelterIceBase = assembly.block.heightAt(icefall.topAnchor.east + 7, icefall.topAnchor.north + 5) ?? icefall.topAnchor.height;
  const shelterIce = buildWindShelter('wind-shelter-icefall-top',
    icefall.topAnchor.east + 7, icefall.topAnchor.north + 5, shelterIceBase);
  group.add(shelterIce.group);
  const watchAnchor = trail.points.reduce((best, point) =>
    Math.abs(point.height - 640) < Math.abs(best.height - 640) ? point : best, trail.points[0]!);
  const skyWatch = createSkyWatchRelic(watchAnchor, assembly.block.heightAt);
  group.add(skyWatch.group);
  const trailMarkers = createTrailMarkers(trail.points, assembly.block.heightAt);
  group.add(trailMarkers.group);
  const machineRoom = createMainSummitMachineRoom(assembly.arrivalHeight);
  group.add(machineRoom.group);
  const bellPosts = createMainSummitBellPosts(trail.points);
  group.add(bellPosts.group);
  const windGround = createMainSummitWindGround({ east: 62.5, north: 975, height: 800 });
  group.add(windGround.group);

  // Cloud-sea glow band (§5.21, default plan): a soft lit sheet under the
  // cloud tops south of the terrace, visible only at night.
  const glowBand = new Group();
  glowBand.name = 'cloud-glow-band';
  const glowMaterial = new MeshBasicMaterial({
    color: '#86b4d9', transparent: true, opacity: .16, depthWrite: false,
  });
  const glowGeometry = new PlaneGeometry(130, 34);
  for (let i = 0; i < 4; i++) {
    const sheet = new Mesh(glowGeometry, glowMaterial);
    sheet.rotation.x = -Math.PI / 2;
    sheet.position.set(-140 + i * 125, assembly.arrivalHeight + 5, 10);
    glowBand.add(sheet);
  }
  glowBand.visible = false;
  group.add(glowBand);
  const coarseMaterial = assembly.block.coarse.material;
  const coarseDayColor = coarseMaterial.color.getHex();

  let disposed = false;
  return {
    approach, posts, signs, wingRack, cableTravel, glideRings, glideProgress, cloud, paint, bannerCloud, icefall, rockTowers,
    surveyStations, hutFurnishings, wishLock, shelterMid, shelterIce, skyWatch, trailMarkers, machineRoom,
    bellPosts, windGround, glideEntities, glideLines,
    blocked(east: number, north: number, feet: number, radius: number, bodyHeight: number) {
      return posts.blocked(east, north, feet, radius, bodyHeight) ||
        signs.blocked(east, north, feet, radius, bodyHeight) ||
        wingRack.blocked(east, north, feet, radius, bodyHeight) ||
        rockTowers.blocked(east, north, feet, radius, bodyHeight) ||
        surveyStations.blocked(east, north, feet, radius, bodyHeight) ||
        hutFurnishings.blocked(east, north, feet, radius, bodyHeight) ||
        machineRoom.blocked(east, north, feet, radius, bodyHeight);
    },
    /** Night material version (§2.4): paint and massif darken together. */
    setNight(night: boolean) {
      paint.setNight(night);
      coarseMaterial.color.setHex(night ? 0x2f3f52 : coarseDayColor);
      glowBand.visible = night;
    },
    update(nowMs: number) {
      // Calm wind until the ZB-20 wind feed is wired into the mountain domain.
      cloud.update(nowMs, { east: 0, north: 0 });
      bannerCloud.update(nowMs / 1000);
      windGround.update(nowMs / 1000);
      glideEntities.update(nowMs / 1000);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      glowGeometry.dispose();
      glowMaterial.dispose();
      windGround.dispose();
      bellPosts.dispose();
      glideEntities.dispose();
      machineRoom.dispose();
      trailMarkers.dispose();
      skyWatch.dispose();
      shelterIce.dispose();
      shelterMid.dispose();
      wishLock.dispose();
      hutFurnishings.dispose();
      surveyStations.dispose();
      rockTowers.dispose();
      icefall.dispose();
      bannerCloud.dispose();
      paint.dispose();
      cloud.dispose();
      glideVisuals.dispose();
      wingRack.dispose();
      posts.dispose();
      signs.dispose();
    },
  };
}
