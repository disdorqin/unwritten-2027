import {
  BufferGeometry, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshLambertMaterial,
  type Material, type Object3D,
} from 'three';
import survey from '../../fixtures/main-summit-snow-belt-survey.json';
import { createMainSummitBlock, mainSummitBounds, mainSummitLayout } from './main-summit-block';
import { createMainSummitCable } from './main-summit-cable';
import { createMainSummitCloudLayer } from './main-summit-cloud-layer';
import { mountMainSummitCable } from './main-summit-cable-scene';
import { mountMainSummitCableStations } from './main-summit-cable-stations';
import { cloudPavilionSites, createPlacedCloudPavilion } from './main-summit-pavilion-site';
import {
  createMainSummitRegistration, createMainSummitRegistrationLandmarks, mountMainSummitRegistration,
  withinMainSummitRegistrationReach,
} from './main-summit-registration';
import { createMainSummitSnowBelt, type SnowBeltKnot } from './main-summit-snow-belt';
import { buildMainSummitSnowMesh } from './main-summit-snow-mesh';
import { surveyedSledConnection } from './main-summit-snow-transition';
import { createMainSummitTrail, mainSummitTrailSpec, type MainSummitTrailPoint } from './main-summit-trail';
import { buildMainSummitTrailCut } from './main-summit-trail-cut';
import { mountMainSummitWreckage } from './main-summit-wreckage';
import { mountMainSummitExpeditionSites } from './main-summit-expedition-sites';
import { mountSummitExpeditionPlaques } from './main-summit-expedition-plaques';
import { createSummitExpeditionActivities } from './main-summit-expedition-activities';
import { mountSummitExpeditionDynamics } from './main-summit-expedition-dynamics';
import { mountMainSummitCableWorkshop } from './main-summit-cable-workshop';
import { mountSummitCloudBellArray } from './main-summit-cloud-bell-array';
import { northRidgeCableAnchors, northRidgeFrame, sampleNorthRidge350 } from './north-ridge-350-terrain';
import { createTownSnowField } from './town-snow-field';
import { createTownD2R30Assembly } from './town-d2-r30-assembly';

// C-01 surveyed terrace alignment for the assembly candidate. The release keeps its current town bounds.
export const summitAssemblyAnchor = { east: 300, north: 676 } as const;
export const summitWorldPoint = (east: number, north: number, height: number) => ({
  east: summitAssemblyAnchor.east + east, north: summitAssemblyAnchor.north + north, height,
});

const frontRidgeAt = (east: number, north: number) =>
  sampleNorthRidge350(summitAssemblyAnchor.east + east, summitAssemblyAnchor.north + north);
const snowTier = { targetCover: .7, pilingRate: 1 };
const [terminalEast, terminalNorth] = northRidgeCableAnchors[2];
export const cloudTerminal = {
  east: terminalEast - summitAssemblyAnchor.east,
  north: terminalNorth - summitAssemblyAnchor.north,
} as const;
export const cloudTerraceTurnNorth = -12.75;

export function supportsCloudTerrace(east: number, north: number, padding = 0) {
  const gateApron = Math.abs(east) <= 6 - padding && north >= -22 + padding;
  const connection = east >= -2 + padding && east <= cloudTerminal.east + 2 - padding &&
    north >= -16 + padding && north <= -12 - padding;
  const terminal = Math.abs(east - cloudTerminal.east) <= 2 - padding &&
    north >= cloudTerminal.north - 2 + padding && north <= -12 - padding;
  return north <= mainSummitBounds.south && (gateApron || connection || terminal);
}

function createFrontTerraceSnow() {
  const gridWidth = northRidgeFrame.width + 1;
  const gridDepth = northRidgeFrame.depth + 1;
  const surfaces = new Uint8Array(gridWidth * gridDepth).fill(2);
  const { east: anchorEast, north: anchorNorth } = summitAssemblyAnchor;
  for (let n = cloudTerminal.north - 2; n <= mainSummitBounds.south; n++) {
    for (let e = -6; e <= cloudTerminal.east + 2; e++) {
      if (supportsCloudTerrace(e, n)) surfaces[(anchorNorth + n) * gridWidth + anchorEast + e] = 3;
    }
  }
  const snow = createTownSnowField({ gridWidth, gridDepth, surfaces, heightAt: sampleNorthRidge350 });
  // Initialize the witnessed approach as a packed terrace under the same weather throughout the run.
  snow.setIntensity(3);
  snow.setWeather(snowTier);
  snow.update(220, true);
  return (east: number, north: number) => {
    const world = summitWorldPoint(east, north, frontRidgeAt(east, north));
    return snow.depthAt(world.east, world.north, world.height);
  };
}

function createTrailRibbon(points: readonly MainSummitTrailPoint[], groundAt: (e: number, n: number) => number | undefined) {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const [i, point] of points.entries()) {
    const before = points[Math.max(0, i - 1)]!;
    const after = points[Math.min(points.length - 1, i + 1)]!;
    const de = after.east - before.east, dn = after.north - before.north;
    const scale = mainSummitTrailSpec.width / 2 / Math.hypot(de, dn);
    for (const side of [-1, 1]) {
      const e = point.east - side * dn * scale, n = point.north + side * de * scale;
      positions.push(e, point.height + .07, -n, e, groundAt(e, n) ?? point.height - .4, -n);
    }
    if (i === 0) continue;
    const left = 4 * (i - 1), right = left + 2, next = left + 4;
    indices.push(left, right, next, next, right, next + 2,
      left, left + 1, next, next, left + 1, next + 1,
      right, next + 2, next + 3, right, next + 3, right + 1);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return new Mesh(geometry, new MeshLambertMaterial({ color: '#bac2bf', side: DoubleSide }));
}

/** The optional official wind is supplied by the shared ZB-20 host, not generated in the summit scene. */
export function mountMainSummitAssembly(owner: Group, epochMs: number,
  officialWind?: () => Readonly<{ east: number; north: number }> | undefined,
  options: Readonly<{ expeditionPreview?: boolean; r30?: boolean }> = {}) {
  const group = new Group();
  group.name = 'main-summit-assembly';
  group.position.set(summitAssemblyAnchor.east, 0, -summitAssemblyAnchor.north);
  owner.add(group);
  const seam = mainSummitBounds.south;
  const arrivalHeight = frontRidgeAt(0, seam);
  const frontSnowAt = createFrontTerraceSnow();
  const block = createMainSummitBlock(mainSummitLayout, arrivalHeight, 100);
  group.add(block.coarse);
  // Mount the existing, fully built P-8 layer in the real ZA-22 host, not only in
  // preview-main-summit-clouds. With no official wind feed, banks stay calm;
  // no local weather generator or client-side random gusts are introduced.
  const clouds = createMainSummitCloudLayer({
    bounds: mainSummitBounds, summit: mainSummitLayout.summit,
    shoulders: mainSummitLayout.shoulders, heightAt: block.heightAt,
  });
  group.add(clouds.group);

  const cable = createMainSummitCable(epochMs, 10_000, arrivalHeight);
  const cableView = mountMainSummitCable(group, cable, block.heightAt);
  const legacyCableGroup = group.getObjectByName('main-summit-cable');
  let gateOwner = group;
  const legacyStations = mountMainSummitCableStations(group, cable, {
    heightAt: block.heightAt,
    enter(owner) { gateOwner = owner; return block.enter(owner); },
    leave: block.leave,
  });

  const landmarks = createMainSummitRegistrationLandmarks(arrivalHeight);
  const registration = createMainSummitRegistration(landmarks);
  const cabin = mountMainSummitRegistration(group, landmarks, 'summit');
  const cloudRegistration = mountMainSummitRegistration(group, landmarks, 'cloud-deck');
  // P-4's lower monument survey is already in the front ridge frame.
  cloudRegistration.group.position.set(-summitAssemblyAnchor.east, 0, summitAssemblyAnchor.north);

  const trail = createMainSummitTrail(block.heightAt, arrivalHeight);
  // Keep the surveyed plaza join and the later turns that dip below its north edge.
  const ribbon = createTrailRibbon(trail.points.slice(1), block.heightAt);
  ribbon.name = 'main-summit-walkway';
  const trailTerrain = buildMainSummitTrailCut(block.coarse.geometry, ribbon.geometry).geometry;
  block.coarse.geometry = trailTerrain;
  group.add(ribbon);
  const wreckage = mountMainSummitWreckage(group, trail);
  // R7 safety gate: models only in an expressly opted-in review, not the
  // default multiplayer world. Preserve the latest P-8 clouds & cable host.
  const candidate = options.expeditionPreview ? (() => {
    const expedition = mountMainSummitExpeditionSites(group, block.heightAt, trail.points);
    const workshop = mountMainSummitCableWorkshop(group, block.heightAt);
    const cloudBells = mountSummitCloudBellArray(group, trail.points, block.heightAt);
    const openingBell = cloudBells.posts[0]!;
    const plaques = mountSummitExpeditionPlaques(group, [...expedition.sites, {
      id: openingBell.id, kind: 'waymark', east: openingBell.east, north: openingBell.north,
      height: openingBell.height, yaw: openingBell.heading,
      trail: { ...trail.points[0]! }, distanceToTrail: openingBell.baseClearanceMetres,
    }]);
    const expeditionDynamics = mountSummitExpeditionDynamics(group, expedition.sites);
    const expeditionActivities = createSummitExpeditionActivities([
      ...expedition.sites,
      { id: 'expedition-cable-machine-room', kind: 'machine-hall', east: -21, north: 7,
        height: 347, yaw: Math.PI / 2,
        trail: { east: 0, north: 7, height: 347 }, distanceToTrail: 21 },
    ]);
    return { expedition, workshop, cloudBells, plaques, expeditionDynamics, expeditionActivities };
  })() : undefined;
  const knots = survey.map((row): SnowBeltKnot => {
    const [east, north, heading, height] = row;
    if (row.length < 4) throw new RangeError('Invalid surveyed snow belt knot.');
    return [east!, north!, heading!, height!];
  });
  const snowBelt = createMainSummitSnowBelt(knots, -surveyedSledConnection.grade);
  const detailedBlock = createMainSummitBlock(mainSummitLayout, arrivalHeight, 16);
  const snowGeometry = buildMainSummitSnowMesh(detailedBlock.coarse.geometry, snowBelt).geometry;
  detailedBlock.dispose();
  const snow = new Mesh(snowGeometry, new MeshLambertMaterial({ vertexColors: true, side: DoubleSide }));
  snow.name = 'main-summit-snow-belt';
  snow.visible = false;
  group.add(snow);

  const pavilionGroup = new Group();
  pavilionGroup.name = 'main-summit-pavilions';
  for (const site of cloudPavilionSites) pavilionGroup.add(createPlacedCloudPavilion(site, block.heightAt));
  group.add(pavilionGroup);

  const r30 = options.r30 === false ? undefined : createTownD2R30Assembly({
    arrivalHeight,
    includeTrailSupport: true,
    includeCableTowers: true,
    includeFacilityFoundations: true,
    includeSledGateSupport: true,
    includeSummitFacilities: true,
    includeNightLights: true,
    includeRopeway: true,
    includeNorthWall: true,
    ropewayEpochMs: epochMs,
  });
  let activeCable = cable;
  let activeStations = legacyStations;
  if (r30) {
    group.add(r30.group);
    block.coarse.visible = false;
    clouds.group.visible = false;
    ribbon.visible = false;
    if (legacyCableGroup) legacyCableGroup.visible = false;
    legacyStations.group.visible = false;
    if (!r30.ropeway) throw new Error('The R30 production mount requires its canonical ropeway.');
    activeCable = r30.ropeway.cable;
    activeStations = r30.ropeway.stations;
  }

  function mountedWithin(object: Object3D | undefined, ancestor: Group) {
    let current = object?.parent ?? null;
    while (current) {
      if (current === ancestor) return true;
      current = current.parent;
    }
    return false;
  }

  function mountedParts() {
    const parts: string[] = [];
    if (r30 ? r30.group.parent === group : block.coarse.parent === group) parts.push('P-1');
    if (r30?.ropeway ? mountedWithin(r30.ropeway.group, group) : legacyCableGroup?.parent === group) parts.push('P-2');
    if (r30 ? Boolean(group.getObjectByName('town-d2-r30-trail-support')) : ribbon.parent === group && snow.parent === group) parts.push('P-3');
    if (cabin.group.parent === group && cloudRegistration.group.parent === group) parts.push('P-4');
    if (mountedWithin(activeStations.group, group)) parts.push('P-7');
    if (r30 ? Boolean(group.getObjectByName('town-d2-r30-cloud-terrace-host')) : clouds.group.parent === group) parts.push('P-8');
    if (pavilionGroup.parent === group && pavilionGroup.children.length === cloudPavilionSites.length) parts.push('P-9');
    return parts;
  }

  return {
    group, block, stations: activeStations, cable: activeCable, clouds, arrivalHeight, frontRidgeAt, frontSnowAt, mountedParts,
    r30, r30Mounted: r30 !== undefined,
    // The host can prefer its plaza surface where it overlaps the P-1 local tread.
    trailSurfaceAt(east: number, north: number, radius = .27) {
      return candidate?.expedition.surfaceAt(east, north, radius) ??
        candidate?.workshop.surfaceAt(east, north, radius) ??
        candidate?.cloudBells.surfaceAt(east, north, radius) ??
        trail.sampleWalkwaySurface(east, north, radius);
    },
    expedition: candidate?.expedition, workshop: candidate?.workshop,
    cloudBells: candidate?.cloudBells, plaques: candidate?.plaques,
    expeditionDynamics: candidate?.expeditionDynamics,
    expeditionActivities: candidate?.expeditionActivities,
    wreckageSites: wreckage.sites, aimWreckage: wreckage.aim,
    atCloudStamp: (position: ReturnType<typeof summitWorldPoint>) =>
      withinMainSummitRegistrationReach(position, landmarks.cloudDeck.stampPoint),
    summitSnowAt: (east: number, north: number) => block.snowDepthAt(east, north, frontSnowAt(east, seam)),
    blocked(east: number, north: number, feet: number, radius: number, bodyHeight: number) {
      if (activeStations.blocked(east, north, feet, radius, bodyHeight)) return true;
      const front = north < seam;
      if (!front && (
        (candidate?.expedition.blocked(east, north, feet, radius, bodyHeight) ?? false) ||
        (candidate?.workshop.blocked(east, north, feet, radius, bodyHeight) ?? false) ||
        (candidate?.cloudBells.blocked(east, north, feet, radius, bodyHeight) ?? false)
      )) return true;
      // D2-R3 production gate: the R30 massif is the one canonical height
      // authority. Reject feet on a centre slope steeper than the same
      // 55 deg walkable threshold the R30 collision uses, and reject the new
      // north-wall landmark bodies (obelisk / mast / lookout rails) so the
      // player cannot walk through them. The climb rungs are deliberately
      // left non-solid so the ascent itself stays traversable.
      if (r30 && !front) {
        const slope = r30.collision.slopeAt(east, north);
        if (slope !== undefined && slope > (r30.northWall?.maxFootSlope ?? 55 * Math.PI / 180)) return true;
        if (r30.northWall?.blocked(east, north, feet, radius, bodyHeight)) return true;
        if (r30.cableTowers?.blocked(east, north, feet, radius, bodyHeight)) return true;
      }
      const position = front ? summitWorldPoint(east, north, feet) : { east, north, height: feet };
      const boxes = front ? cloudRegistration.colliders : cabin.colliders;
      return boxes.some(({ min, max }) => {
        if (feet + bodyHeight - .025 <= min[1] || feet + .025 >= max[1]) return false;
        const dx = Math.max(min[0] - position.east, position.east - max[0], 0);
        const dz = Math.max(min[2] + position.north, -position.north - max[2], 0);
        return Math.hypot(dx, dz) < radius;
      });
    },
    enterGate: () => block.enter(gateOwner),
    leaveGate: block.leave,
    setFrontDetail: (visible: boolean) => { cloudRegistration.group.visible = visible; },
    setSummitDetail: (visible: boolean) => { snow.visible = visible; },
    setNight(night: boolean) {
      r30?.setNight(night);
    },
    update(now: number) {
      const wind = officialWind?.();
      clouds.update(now, wind && Number.isFinite(wind.east) && Number.isFinite(wind.north)
        ? wind : { east: 0, north: 0 });
      if (r30) {
        r30.update(mainSummitLayout.summit.east, mainSummitLayout.summit.north);
        return r30.ropeway!.update(now);
      }
      return cableView.update(now);
    },
    interact(east: number, north: number, height: number) {
      return north < seam ? registration.interact('cloud-deck', summitWorldPoint(east, north, height))
        : registration.interact('summit', { east, north, height });
    },
    dispose() {
      candidate?.cloudBells.dispose();
      candidate?.expeditionDynamics.dispose();
      candidate?.plaques.dispose();
      candidate?.expedition.dispose();
      candidate?.workshop.dispose();
      wreckage.dispose();
      clouds.dispose();
      r30?.dispose();
      legacyStations.dispose();
      cableView.dispose();
      cabin.dispose();
      cloudRegistration.dispose();
      ribbon.geometry.dispose();
      ribbon.material.dispose();
      snow.geometry.dispose();
      snow.material.dispose();
      const geometries = new Set<BufferGeometry>();
      const materials = new Set<Material>();
      pavilionGroup.traverse(object => {
        if (!(object instanceof Mesh)) return;
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      });
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      trailTerrain.dispose();
      block.dispose();
      group.removeFromParent();
      group.clear();
    },
  };
}
