import {
  BufferGeometry, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshLambertMaterial,
  type Material,
} from 'three';
import survey from '../../fixtures/main-summit-snow-belt-survey.json';
import { createMainSummitBlock, mainSummitBounds, mainSummitLayout } from './main-summit-block';
import { createMainSummitCable } from './main-summit-cable';
import { mountMainSummitCable } from './main-summit-cable-scene';
import { mountMainSummitCableStations } from './main-summit-cable-stations';
import { createMainSummitCableTravel } from './main-summit-cable-travel';
import { mountMainSummitOutlook } from './main-summit-outlook';
import { cloudPavilionSites, createPlacedCloudPavilion } from './main-summit-pavilion-site';
import {
  createMainSummitRegistration, createMainSummitRegistrationLandmarks, mountMainSummitRegistration,
} from './main-summit-registration';
import { createMainSummitSnowBelt, type SnowBeltKnot } from './main-summit-snow-belt';
import { buildMainSummitSnowMesh } from './main-summit-snow-mesh';
import { surveyedSledConnection } from './main-summit-snow-transition';
import { createMainSummitTrail, mainSummitTrailSpec, type MainSummitTrailPoint } from './main-summit-trail';
import { mountMainSummitWreckage } from './main-summit-wreckage';
import { mountMainSummitWingRack } from './main-summit-wing-rack';
import { northRidgeCableAnchors, northRidgeFrame, sampleNorthRidge350 } from './north-ridge-350-terrain';
import { createTownSnowField } from './town-snow-field';

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

export function mountMainSummitAssembly(owner: Group, epochMs: number) {
  const group = new Group();
  group.name = 'main-summit-assembly';
  group.position.set(summitAssemblyAnchor.east, 0, -summitAssemblyAnchor.north);
  owner.add(group);
  const seam = mainSummitBounds.south;
  const arrivalHeight = frontRidgeAt(0, seam);
  const frontSnowAt = createFrontTerraceSnow();
  const block = createMainSummitBlock(mainSummitLayout, arrivalHeight, 100);
  group.add(block.coarse);
  const outlook = mountMainSummitOutlook(group, block.heightAt);

  const cable = createMainSummitCable(epochMs, 10_000, arrivalHeight);
  const cableView = mountMainSummitCable(group, cable, block.heightAt);
  const cableTravel = createMainSummitCableTravel(cable);
  let gateOwner = group;
  const stations = mountMainSummitCableStations(group, cable, {
    heightAt: block.heightAt,
    enter(owner) { gateOwner = owner; return block.enter(owner); },
    leave: block.leave,
  });

  const landmarks = createMainSummitRegistrationLandmarks(arrivalHeight);
  const registration = createMainSummitRegistration(landmarks);
  const cabin = mountMainSummitRegistration(group, landmarks, 'summit');
  const wingRack = mountMainSummitWingRack(cabin.group);
  const cloudRegistration = mountMainSummitRegistration(group, landmarks, 'cloud-deck');
  // P-4's lower monument survey is already in the front ridge frame.
  cloudRegistration.group.position.set(-summitAssemblyAnchor.east, 0, summitAssemblyAnchor.north);

  const trail = createMainSummitTrail(block.heightAt, arrivalHeight);
  // Only the first survey point is inside the gate. Later switchbacks can
  // dip south of the plaza edge and still belong to the same ribbon.
  const ribbon = createTrailRibbon(trail.points.slice(1), block.heightAt);
  ribbon.name = 'main-summit-walkway';
  group.add(ribbon);
  const wreckage = mountMainSummitWreckage(group, trail);
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

  function mountedParts() {
    const parts: string[] = [];
    if (block.coarse.parent === group) parts.push('P-1');
    if (group.getObjectByName('main-summit-cable')?.parent === group) parts.push('P-2');
    if (ribbon.parent === group && snow.parent === group) parts.push('P-3');
    if (cabin.group.parent === group && cloudRegistration.group.parent === group) parts.push('P-4');
    if (stations.group.parent === group) parts.push('P-7');
    if (pavilionGroup.parent === group && pavilionGroup.children.length === cloudPavilionSites.length) parts.push('P-9');
    return parts;
  }

  return {
    group, block, stations, arrivalHeight, frontRidgeAt, frontSnowAt, mountedParts,
    // P-1 local coordinates. The host prefers its plaza surface in the
    // overlap and this cut/fill tread before bare ground outside the plaza.
    trailSurfaceAt: trail.sampleWalkwaySurface,
    wreckageSites: wreckage.sites,
    wingRack, cableTravel, outlook,
    summitSnowAt: (east: number, north: number) => block.snowDepthAt(east, north, frontSnowAt(east, seam)),
    blocked(east: number, north: number, feet: number, radius: number, bodyHeight: number) {
      if (stations.blocked(east, north, feet, radius, bodyHeight)) return true;
      const front = north < seam;
      if (!front && (wingRack.blocked(east, north, feet, radius, bodyHeight) ||
        outlook.blocked(east, north, feet, radius, bodyHeight))) return true;
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
    setSummitDetail: (visible: boolean) => { snow.visible = visible; },
    update: cableView.update,
    timetableAt: cable.timetableAt,
    interact(east: number, north: number, height: number) {
      return north < seam ? registration.interact('cloud-deck', summitWorldPoint(east, north, height))
        : registration.interact('summit', { east, north, height });
    },
    dispose() {
      wreckage.dispose();
      stations.dispose();
      cableView.dispose();
      wingRack.dispose();
      outlook.dispose();
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
      block.dispose();
      group.removeFromParent();
      group.clear();
    },
  };
}
