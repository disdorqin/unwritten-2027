import { BufferGeometry, BoxGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { meteorCraterFixturePlan, meteorCraterRimRadius } from './meteor-crater';
import { mountMeteorCraterSurface, type MeteorCraterWorldAnchor } from './meteor-crater-surface';
import { mountZa31CraterCamp } from './town-za31-crater-camp';
import { buildZa31CraterRim } from './town-za31-crater-rim';
import { mountZa31CraterWinch } from './town-za31-crater-winch';
import { mountZa31CraterEntrance } from './za31-crater-entrance';
import { buildZa36CraterStoryDressing } from './town-za36-crater-story-dressing';
import { buildCraterMouthWorks, type CraterActionSpot } from './town-crater-mouth-works';
import { buildCraterOuterWorks } from './town-crater-outer-works';
import { buildZa36CraterEjecta } from './town-za36-crater-ejecta';
import { buildZa36CraterMidground } from './town-za36-crater-midground';
import { mountZa36RopeStay } from './town-za36-rope-stay';
import { buildCraterSurveyM1 } from './town-crater-survey-m1';
import { buildCraterDensityA2 } from './town-crater-density-a2';

export const craterWestSurvey = Object.freeze({
  west: -240, east: -120, north: 185, seamNorth: 159,
});

const seamBlendWidth = 24;
const carrierHoleRadius = meteorCraterRimRadius + 2;
const tileSize = 48;

type WestCraterRoad = {
  group: Group;
  readonly winch: ReturnType<typeof mountZa31CraterWinch>;
  readonly mouthWorks: ReturnType<typeof buildCraterMouthWorks>;
  readonly outerWorks: ReturnType<typeof buildCraterOuterWorks>;
  readonly ejecta: ReturnType<typeof buildZa36CraterEjecta>;
  readonly midground: ReturnType<typeof buildZa36CraterMidground>;
  readonly densityA2: ReturnType<typeof buildCraterDensityA2>;
  readonly ropeStay: ReturnType<typeof mountZa36RopeStay> | undefined;
  readonly surveyM1: ReturnType<typeof buildCraterSurveyM1> | undefined;
  readonly craterActions: {
    actions: CraterActionSpot[];
    actionAt(east: number, north: number, height: number): CraterActionSpot | undefined;
    firewood(): boolean;
    setNight(night: boolean): void;
  };
  anchor: MeteorCraterWorldAnchor;
  lip: Readonly<{ east: number; north: number }> & { height: number };
  heightAt(east: number, north: number): number | undefined;
  fenceBlocks(east: number, north: number, height: number, radius: number): boolean;
};

/** Same surface and grid diagonals as the town, with the surveyed east edge kept bit-identical. */
export function mountWestCraterRoad(northLimit: number, westTownHeightAt: (north: number) => number): WestCraterRoad {
  const survey = craterWestSurvey;
  const rimHeight = westTownHeightAt(survey.seamNorth);
  const northOffset = survey.seamNorth - survey.north;
  const approachBearing = Math.atan2(Math.sqrt(meteorCraterRimRadius ** 2 - northOffset ** 2), northOffset);
  const yaw = approachBearing - meteorCraterFixturePlan.mainTrail.startBearing;
  const anchor = { east: survey.east, north: survey.north, rimHeight, yaw };
  const crater = mountMeteorCraterSurface(anchor);
  const lip = crater.trailPoint(0);
  const group = new Group();
  group.name = 'meteor-crater-west-road';
  group.add(crater.group);

  const tileGround = new MeshStandardMaterial({ color: 0xc1cedc, roughness: 1 });
  const eastCount = -survey.west + 1;
  const samples = new Float32Array(eastCount * (northLimit + 1));
  const inside = new Uint8Array(samples.length);
  function address(east: number, north: number) { return (east - survey.west) + north * eastCount; }
  for (let north = 0; north <= northLimit; north++) {
    const townHeight = westTownHeightAt(north);
    for (let east = survey.west; east <= 0; east++) {
      const t = Math.max(0, (east + seamBlendWidth) / seamBlendWidth);
      const i = address(east, north);
      samples[i] = rimHeight + (townHeight - rimHeight) * t * t * (3 - 2 * t);
      inside[i] = Number(Math.hypot(east - anchor.east, north - anchor.north) < carrierHoleRadius);
    }
  }
  // Batch adjacent 48 m ground tiles into spatially bounded 2×3 clusters:
  // fewer draw calls than one mesh per tile, without turning the full west
  // expanse into a single always-visible 240×540 m mesh.
  const groundBatches = new Map<string, BufferGeometry[]>();
  for (let north = 0; north < northLimit; north += tileSize) {
    for (let east = survey.west; east < 0; east += tileSize) {
      const endN = Math.min(north + tileSize, northLimit), endE = Math.min(east + tileSize, 0);
      const width = endE - east + 1;
      const positions: number[] = [], indices: number[] = [];
      for (let n = north; n <= endN; n++) {
        for (let e = east; e <= endE; e++) {
          const from = address(e, n);
          positions.push(e, samples[from], -n);
          if (e === endE || n === endN) continue;
          const a = (e - east) + (n - north) * width;
          const b = a + 1, c = a + width, d = c + 1;
          if (!inside[from] && !inside[from + 1] && !inside[from + eastCount]) indices.push(a, b, c);
          if (!inside[from + 1] && !inside[from + eastCount] && !inside[from + eastCount + 1]) indices.push(b, d, c);
        }
      }
      const footprint = new BufferGeometry();
      footprint.setAttribute('position', new Float32BufferAttribute(positions, 3));
      footprint.setIndex(indices);
      footprint.computeVertexNormals();
      const batch = `${Math.floor((east - survey.west) / (tileSize * 2))}:${Math.floor(north / (tileSize * 3))}`;
      const members = groundBatches.get(batch) ?? [];
      members.push(footprint);
      groundBatches.set(batch, members);
    }
  }

  for (const [batch, members] of groundBatches) {
    const joined = mergeGeometries(members);
    if (!joined) throw new Error(`West crater terrain batch ${batch} cannot be merged`);
    for (const member of members) member.dispose();
    joined.computeBoundingSphere();
    const mesh = new Mesh(joined, tileGround);
    mesh.name = 'meteor-crater-west-ground';
    mesh.userData.groundBatch = batch;
    group.add(mesh);
  }

  const metal = new MeshStandardMaterial({ color: 0x73534a, roughness: 1 });
  const leg = new BoxGeometry(.16, 2.02, .16);
  const crossbar = new BoxGeometry(.075, .1, 2.25);
  const fenceEast = lip.east + 1;
  const fenceOffset = 3.25;
  for (const side of [-1, 1]) {
    const fenceNorth = lip.north + side * fenceOffset;
    for (const post of [fenceNorth - 1.1, fenceNorth + 1.1]) {
      const pillar = new Mesh(leg, metal);
      pillar.position.set(fenceEast, lip.height + 1.01, -post);
      group.add(pillar);
    }
    for (const height of [.5, 1.4]) {
      const bar = new Mesh(crossbar, metal);
      bar.position.set(fenceEast, lip.height + height, -fenceNorth);
      group.add(bar);
    }
  }

  function fenceBlocks(east: number, north: number, height: number, radius: number) {
    return height < lip.height + 2.02 && Math.abs(east - fenceEast) < .08 + radius &&
      Math.abs(Math.abs(north - lip.north) - fenceOffset) < 1.18 + radius;
  }

  function heightAt(east: number, north: number) {
    if (east > 0 || east < survey.west || north < 0 || north > northLimit) return;
    const bowl = crater.heightAt(east, north);
    if (bowl !== undefined) return bowl;
    const x = Math.min(-1, Math.floor(east)), n = Math.min(northLimit - 1, Math.floor(north));
    const u = east - x, v = north - n;
    const i = address(x, n);
    const a = samples[i], b = samples[i + 1], c = samples[i + eastCount], d = samples[i + eastCount + 1];
    return u + v <= 1 ? a + (b - a) * u + (c - a) * v
      : d + (c - d) * (1 - u) + (b - d) * (1 - v);
  }

  const road = { group, anchor, lip, heightAt, fenceBlocks };
  mountZa31CraterEntrance(road);
  const camp = mountZa31CraterCamp(road);
  const rim = buildZa31CraterRim(road, camp.placements);
  group.add(rim.group, camp.group);
  const story = buildZa36CraterStoryDressing(road);
  group.add(story.group);
  const mouthWorks = buildCraterMouthWorks(road);
  group.add(mouthWorks.group);
  const outerWorks = buildCraterOuterWorks(road);
  group.add(outerWorks.group);
  // Salvage ③: V3 ejecta/midground, cleared against the mainline fence
  // (outer ring + gate segment) and the town-era wall line — a boulder
  // whose footprint would swallow a post is skipped, never nudged.
  const fenceExclusions = [
    ...outerWorks.fencePosts,
    ...mouthWorks.fencePosts,
  ].map(post => {
    const rad = (post.bearing * Math.PI) / 180;
    return {
      east: anchor.east + post.radius * Math.sin(rad),
      north: anchor.north + post.radius * Math.cos(rad),
      radius: 1,
    };
  });
  for (let n = outerWorks.wallLine.northStart; n <= outerWorks.wallLine.northEnd; n += 1.5) {
    fenceExclusions.push({ east: outerWorks.wallLine.east, north: n, radius: 1 });
  }
  const ejecta = buildZa36CraterEjecta(road, fenceExclusions);
  group.add(ejecta.group);
  const midground = buildZa36CraterMidground(road, [
    ...rim.placements, ...camp.placements,
    ...story.placements.map(site => ({ east: site.east, north: site.north, radius: .58 })),
    ...ejecta.placements.map(site => ({ east: site.east, north: site.north, radius: site.footprint })),
  ]);
  group.add(midground.group);
  // A2 density backfill: keeps out of everything already placed — the fence
  // and wall lines, the mainline sites, and every earlier dressing placement.
  const densityA2 = buildCraterDensityA2(road, [
    ...fenceExclusions,
    ...mouthWorks.sites, ...outerWorks.sites,
    ...rim.placements, ...camp.placements,
    ...story.placements.map(site => ({ east: site.east, north: site.north, radius: .58 })),
    ...ejecta.placements.map(site => ({ east: site.east, north: site.north, radius: site.footprint })),
    ...midground.placements.map(site => ({ east: site.east, north: site.north, radius: site.radius })),
  ]);
  group.add(densityA2.group);
  const winch = mountZa31CraterWinch(road);
  if (winch) group.add(winch.group);
  const ropeStay = mountZa36RopeStay(road);
  if (ropeStay) group.add(ropeStay.group);
  const surveyM1 = buildCraterSurveyM1(road);
  if (surveyM1) group.add(surveyM1.group);
  // Salvage ①: one E-action surface for the crater — the mouth-works
  // spots (registration / map / telescope / firewood) plus the M1 station.
  const surveySpot: CraterActionSpot | undefined = surveyM1 ? {
    id: 'survey', label: '查看测绘位 M1',
    east: surveyM1.site.east, north: surveyM1.site.north, height: surveyM1.site.height, range: 2.8,
  } : undefined;
  const craterActions = {
    actions: surveySpot ? [...mouthWorks.actions, surveySpot] : [...mouthWorks.actions],
    actionAt(east: number, north: number, height: number) {
      const found = mouthWorks.actionAt(east, north, height);
      if (found) return found;
      if (surveySpot && Math.hypot(east - surveySpot.east, north - surveySpot.north) <= surveySpot.range &&
        Math.abs(height - surveySpot.height) <= 3.3) return surveySpot;
      return undefined;
    },
    firewood: mouthWorks.firewood,
    setNight(night: boolean) { mouthWorks.setNight(night); outerWorks.setNight(night); },
  };
  return { ...road, winch, mouthWorks, outerWorks, ejecta, midground, densityA2, ropeStay, surveyM1, craterActions };
}
