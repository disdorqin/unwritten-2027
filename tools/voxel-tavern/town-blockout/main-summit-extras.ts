import { Group, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';
import { createMainSummitApproach, mountMainSummitApproachSigns } from './main-summit-approach';
import { createMainSummitBannerCloud } from './main-summit-banner-cloud';
import { createMainSummitBellPosts } from './main-summit-bell-posts';
import { makeCloudGlowTexture } from './front-ridge-cloud-band';
import { createMainSummitWindGround } from './main-summit-wind-ground';
import { mountCloudTerraceArt } from './main-summit-cloud-terrace-art';
import { mountMainSummitTerraceEdge } from './main-summit-terrace-edge';
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
import { mainSummitBounds, mainSummitSpec } from './main-summit-block';
import { createMainSummitCableTravel } from './main-summit-cable-travel';
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

  const cloud = assembly.clouds;

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
  // D4 / m03-m34-m36-m82 is an additive scenery package only; it preserves
  // the ZA-22 flight runway, the B-window starport rack and portal authority.
  const cloudTerraceArt = mountCloudTerraceArt(group);
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
  // Anchor the detailed ref-m64 pad on actual P-1 snow/rock; it needs
  // retaining piers where the southern terrace drops beneath the deck.
  const windGround = createMainSummitWindGround(
    { east: 62.5, north: 975, height: 800 }, assembly.block.heightAt);
  group.add(windGround.group);
  // D-6 item 4: terrace platform-edge staging (parapet + day cloud
  // seam + line-2 station approach sign). Transfer code untouched.
  const terraceEdge = mountMainSummitTerraceEdge(assembly);
  group.add(terraceEdge.group);

  // Cloud-sea glow band, rebuilt to the settled plan B (batch 63,
  // 《设计-全图云层》): light floats ON the cloud surface south of the
  // terrace as slow river-like streams -- flowing spot texture in
  // crystal teal #7fd4c8 to snow white, never saturated blue/purple,
  // brightness capped under the town lights. Two depths (near/far
  // sheets, different repeats and flow speeds) replace the old
  // single static blue sheet. Night only.
  const glowBand = new Group();
  glowBand.name = 'cloud-glow-band';
  const glowTexture = makeCloudGlowTexture();
  const glowTextureFar = glowTexture ? glowTexture.clone() : null;
  if (glowTextureFar) glowTextureFar.needsUpdate = true;
  const glowMaterial = new MeshBasicMaterial({
    map: glowTexture ?? undefined, color: '#dff7f1', transparent: true, opacity: 0, depthWrite: false,
  });
  const glowMaterialFar = new MeshBasicMaterial({
    map: glowTextureFar ?? undefined, color: '#cfe9e2', transparent: true, opacity: 0, depthWrite: false,
  });
  const glowGeometry = new PlaneGeometry(130, 34);
  for (let i = 0; i < 4; i++) {
    const far = i >= 2;
    const sheet = new Mesh(glowGeometry, far ? glowMaterialFar : glowMaterial);
    sheet.rotation.x = -Math.PI / 2;
    sheet.position.set(-140 + (i % 2) * 250 + (far ? 60 : 0), assembly.arrivalHeight + (far ? 3.2 : 5), far ? 44 : 10);
    if (far) sheet.scale.setScalar(1.35);
    glowBand.add(sheet);
  }
  glowBand.visible = false;
  group.add(glowBand);
  let glowNight = false;
  const coarseMaterial = assembly.block.coarse.material;
  const coarseDayColor = coarseMaterial.color.getHex();

  let disposed = false;
  return {
    approach, posts, signs, wingRack, cableTravel, glideRings, glideProgress, cloud, paint, bannerCloud, icefall, rockTowers,
    surveyStations, hutFurnishings, wishLock, shelterMid, shelterIce, skyWatch, trailMarkers, machineRoom,
    bellPosts, windGround, glideEntities, glideLines, cloudTerraceArt, terraceEdge,
    blocked(east: number, north: number, feet: number, radius: number, bodyHeight: number) {
      return posts.blocked(east, north, feet, radius, bodyHeight) ||
        signs.blocked(east, north, feet, radius, bodyHeight) ||
        wingRack.blocked(east, north, feet, radius, bodyHeight) ||
        rockTowers.blocked(east, north, feet, radius, bodyHeight) ||
        surveyStations.blocked(east, north, feet, radius, bodyHeight) ||
        hutFurnishings.blocked(east, north, feet, radius, bodyHeight) ||
        machineRoom.blocked(east, north, feet, radius, bodyHeight) ||
        windGround.blocked(east, north, feet, radius, bodyHeight) ||
        cloudTerraceArt.blocked(east, north, feet, radius, bodyHeight);
    },
    /** Night material version (§2.4): paint and massif darken together. */
    setNight(night: boolean) {
      paint.setNight(night);
      coarseMaterial.color.setHex(night ? 0x2f3f52 : coarseDayColor);
      glowNight = night;
      glowBand.visible = true;
      cloudTerraceArt.setNight(night);
    },
    update(nowMs: number) {
      // Calm wind until the ZB-20 wind feed is wired into the mountain domain.
      cloud.update(nowMs, { east: 0, north: 0 });
      bannerCloud.update(nowMs / 1000);
      windGround.update(nowMs / 1000);
      glideEntities.update(nowMs / 1000);
      // Glow flow: river-slow texture drift, far layer slower (parallax);
      // opacity ramps toward the night target and the band hides at 0.
      const secs = nowMs / 1000;
      if (glowTexture) { glowTexture.offset.x = (secs * 0.0045) % 1; glowTexture.offset.y = (secs * 0.0011) % 1; }
      if (glowTextureFar) { glowTextureFar.offset.x = (secs * 0.0026) % 1; glowTextureFar.offset.y = (secs * 0.0007) % 1; }
      const ramp = (mat: MeshBasicMaterial, target: number) => {
        mat.opacity += (target - mat.opacity) * 0.04;
        if (Math.abs(target - mat.opacity) < 0.004) mat.opacity = target;
      };
      ramp(glowMaterial, glowNight ? 0.30 : 0);
      ramp(glowMaterialFar, glowNight ? 0.17 : 0);
      glowBand.visible = glowNight || glowMaterial.opacity > 0.01;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      glowGeometry.dispose();
      glowMaterial.dispose();
      glowMaterialFar.dispose();
      glowTexture?.dispose();
      glowTextureFar?.dispose();
      windGround.dispose();
      cloudTerraceArt.dispose();
      terraceEdge.dispose();
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
      glideVisuals.dispose();
      wingRack.dispose();
      posts.dispose();
      signs.dispose();
    },
  };
}
