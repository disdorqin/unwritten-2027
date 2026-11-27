import { BufferGeometry, BoxGeometry, Color, Float32BufferAttribute, Group, Mesh, MeshLambertMaterial } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildCraterSeamCollar, type SurfaceVertex } from './town-a-r30-crater-seam';
import { featherSharedCraterApron } from './town-a-r30-crater-material-seam';
import { createMeteorCrater, meteorCraterFixturePlan, meteorCraterRimRadius } from './meteor-crater';
import { mountMeteorCraterSurface, type MeteorCraterWorldAnchor } from './meteor-crater-surface';
import { applyCraterDistancePalette } from './town-za34-crater-distance-palette';
import { mountZa31CraterCamp } from './town-za31-crater-camp';
import { buildZa31CraterRim } from './town-za31-crater-rim';
import { mountZa31CraterWinch } from './town-za31-crater-winch';
import { mountZa31CraterEntrance } from './za31-crater-entrance';
import { buildZa36CraterStoryDressing } from './town-za36-crater-story-dressing';
import { buildCraterMouthWorks, type CraterActionSpot } from './town-crater-mouth-works';
import { buildCraterOuterWorks, craterBeltTrackCorridor } from './town-crater-outer-works';
import { createWestLandscape } from './town-a-r30-west-landscape';
import { freightTurnoutKeepout } from './town-a-r30-rail-network';
import { mountWestNorthConnector, northFootwayWeight } from './town-a-r30-north-connector';
import { buildZa36CraterEjecta } from './town-za36-crater-ejecta';
import { buildZa36CraterMidground } from './town-za36-crater-midground';
import { mountZa36RopeStay } from './town-za36-rope-stay';
import { buildCraterSurveyM1 } from './town-crater-survey-m1';
import { buildCraterDensityA2 } from './town-crater-density-a2';
import { buildCraterColliders } from './town-crater-colliders';
import { mountZa31CraterLampRoom } from './town-za31-crater-lamp-room';
import {
  createTownC2CraterCentralMound, mountTownC2CraterCentralMound,
} from './town-c2-crater-central-mound';
import {
  applyCraterBrokenCircleToWalkMesh, buildTownC2CraterBrokenCircle,
} from './town-c2-crater-broken-circle';
import {
  mountC2CraterMoltenBeads, updateC2CraterMoltenBeads,
} from './town-c2-crater-molten-beads';
import { mountC2CraterInscription } from './town-c2-crater-inscription';
import {
  mountCraterWarmLightChain, surveyCraterWarmLightChain,
} from './town-c2-crater-warm-light-chain';
import { buildCraterMidgroundS5 } from './town-crater-midground-s5';
import { buildMoundPlanting } from './town-mound-planting';

export const craterWestSurvey = Object.freeze({
  west: -240, east: -120, north: 185, seamNorth: 159,
});

// North extent of the visible west ground sheet. The sheet covers the
// surveyed crater domain plus the isolation-wall line that bounds it
// (wall segments run to north 307, the north defence tower stands at
// ~252), rounded up to the 48 m tile grid. It deliberately does NOT
// follow the world depth: the height samples below keep the caller's
// full north limit, so heightAt keeps answering along the whole west
// seam even where no sheet is drawn.
export const craterGroundSheetNorth = 336;

const seamBlendWidth = 24;
// Shared B apron remains R59 until both sides accept the replacement edge.
const sharedApronRadius = meteorCraterRimRadius + 2 * (meteorCraterFixturePlan.mainTrail.halfWidth + meteorCraterFixturePlan.mainTrail.shoulderWidth);
const tileSize = 48;

type Story=ReturnType<typeof buildZa36CraterStoryDressing>;
/** B's exact accepted story lifecycle is injected by the assembly owner.
 * Never silently apply it to the legacy crater. */
export type AR30StoryLifecycle={retire(story:Story):Story;refit(story:Story,heightAt:(e:number,n:number)=>number|undefined):{story:Story;changes:readonly unknown[]}};
type WestCraterRoad = {
  group: Group;
  readonly winch: ReturnType<typeof mountZa31CraterWinch>;
  readonly lampRoom: ReturnType<typeof mountZa31CraterLampRoom>;
  readonly mouthWorks: ReturnType<typeof buildCraterMouthWorks>;
  readonly outerWorks: ReturnType<typeof buildCraterOuterWorks>;
  readonly ejecta: ReturnType<typeof buildZa36CraterEjecta>;
  readonly midground: ReturnType<typeof buildZa36CraterMidground>;
  readonly densityA2: ReturnType<typeof buildCraterDensityA2>;
  readonly ropeStay: ReturnType<typeof mountZa36RopeStay> | undefined;
  readonly surveyM1: ReturnType<typeof buildCraterSurveyM1> | undefined;
  readonly centralMound: ReturnType<typeof mountTownC2CraterCentralMound>;
  readonly brokenCircle: ReturnType<typeof buildTownC2CraterBrokenCircle>;
  readonly moltenBeads: ReturnType<typeof mountC2CraterMoltenBeads>;
  readonly inscription: ReturnType<typeof mountC2CraterInscription>;
  readonly warmLightChain: ReturnType<typeof mountCraterWarmLightChain>;
  readonly midgroundS5: ReturnType<typeof buildCraterMidgroundS5>;
  readonly moundPlanting: ReturnType<typeof buildMoundPlanting>;
  readonly craterActions: {
    actions: CraterActionSpot[];
    actionAt(east: number, north: number, height: number): CraterActionSpot | undefined;
    firewood(): boolean;
    setNight(night: boolean): void;
  };
  anchor: MeteorCraterWorldAnchor;
  lip: Readonly<{ east: number; north: number }> & { height: number };
  heightAt(east: number, north: number): number | undefined;
  readonly terrainBoundary: Readonly<{inner:readonly SurfaceVertex[];outer:readonly SurfaceVertex[];renderNorth:number;apronRadius:number}>;
  terrainReadyAt(east:number,north:number):boolean;
  fenceBlocks(east: number, north: number, height: number, radius: number): boolean;
};

/** Same surface and grid diagonals as the town, with the surveyed east edge kept bit-identical. */
/** A-2: five-band vertex palette enabled by default; false is explicit rollback. */
export function mountWestCraterRoad(northLimit: number, westTownHeightAt: (north: number) => number,
  options: { za34DistantPaletteCandidate?: boolean; unifiedStory?:AR30StoryLifecycle } = {}): WestCraterRoad {
  const survey = craterWestSurvey;
  const rimHeight = westTownHeightAt(survey.seamNorth);
  const northOffset = survey.seamNorth - survey.north;
  const approachBearing = Math.atan2(Math.sqrt(meteorCraterRimRadius ** 2 - northOffset ** 2), northOffset);
  const yaw = approachBearing - meteorCraterFixturePlan.mainTrail.startBearing;
  const anchor = { east: survey.east, north: survey.north, rimHeight, yaw };
  const neutralCrater = createMeteorCrater(meteorCraterFixturePlan);
  const centralMoundModel = createTownC2CraterCentralMound(anchor);
  const crater = mountMeteorCraterSurface(anchor, { centralMound: centralMoundModel });
  const surface = crater.group.getObjectByName('meteor-crater-walk-mesh');
  if (!surface || !(surface as Mesh).isMesh) throw new Error('B-01 crater walk surface absent');
  const unifiedRelief=surface.userData.bR30UnifiedRelief===true;
  const paletteEnabled = !unifiedRelief && options.za34DistantPaletteCandidate !== false;
  const paletteAudit = paletteEnabled ? applyCraterDistancePalette(surface as Mesh) : undefined;
  // B's geology remains intact. Only the 55–59m shared snow apron is A's
  // material blend; do not overwrite its interior with the legacy five bands.
  if(unifiedRelief)featherSharedCraterApron(surface as Mesh,meteorCraterRimRadius,sharedApronRadius);
  const lip = crater.trailPoint(0);
  const group = new Group();
  group.name = 'meteor-crater-west-road';
  if (paletteAudit) group.userData.za34DistantPaletteAudit = paletteAudit;
  group.userData.za34DistantPaletteEnabled = paletteEnabled;
  group.add(crater.group);
  const centralMound = mountTownC2CraterCentralMound(group, anchor, {
    floorHeightAtLocal: (east, north) => neutralCrater.heightOffsetAt(east, north),
  });

  const tileGround = new MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
  const sheetNorthLimit = Math.min(northLimit, craterGroundSheetNorth);
  const landscape=createWestLandscape(anchor,sharedApronRadius,sheetNorthLimit,craterBeltTrackCorridor);
  const oldCarrierAt=(east:number,north:number)=>{
    const t=Math.max(0,(east+seamBlendWidth)/seamBlendWidth);
    return rimHeight+(westTownHeightAt(north)-rimHeight)*t*t*(3-2*t);
  };
  const eastCount = -survey.west + 1;
  const samples = new Float32Array(eastCount * (northLimit + 1));

  function address(east: number, north: number) { return (east - survey.west) + north * eastCount; }
  for (let north = 0; north <= northLimit; north++) {
    const townHeight = westTownHeightAt(north);
    for (let east = survey.west; east <= 0; east++) {
      const t = Math.max(0, (east + seamBlendWidth) / seamBlendWidth);
      const i = address(east, north);
      samples[i] = rimHeight + (townHeight - rimHeight) * t * t * (3 - 2 * t) + landscape.offsetAt(east,north);

    }
  }
  const sampleCarrier = (east:number,north:number) => {
    const x=Math.min(-1,Math.floor(east)), n=Math.min(northLimit-1,Math.floor(north));
    const u=east-x,v=north-n,i=address(x,n);
    const a=samples[i],b=samples[i+1],c=samples[i+eastCount],d=samples[i+eastCount+1];
    return u+v<=1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v);
  };
  const collar=buildCraterSeamCollar(surface as Mesh,anchor,sharedApronRadius,sampleCarrier);
  const cut=collar.bounds;
  // Batch adjacent 48 m ground tiles into spatially bounded 2×3 clusters:
  // fewer draw calls than one mesh per tile, without turning the full west
  // expanse into a single always-visible 240×540 m mesh.
  const groundBatches = new Map<string, BufferGeometry[]>();
  for (let north = 0; north < sheetNorthLimit; north += tileSize) {
    for (let east = survey.west; east < 0; east += tileSize) {
      const endN = Math.min(north + tileSize, sheetNorthLimit), endE = Math.min(east + tileSize, 0);
      const width = endE - east + 1;
      const positions: number[] = [], indices: number[] = [];
      for (let n = north; n <= endN; n++) {
        for (let e = east; e <= endE; e++) {
          const from = address(e, n);
          positions.push(e, samples[from], -n);
          if (e === endE || n === endN) continue;
          const a = (e - east) + (n - north) * width;
          const b = a + 1, c = a + width, d = c + 1;
          // Remove the complete integer rectangle, not a circle tested only
          // at triangle corners. The zipper collar supplies this exact cut.
          if(e<cut.west||e>=cut.east||n<cut.south||n>=cut.north)indices.push(a,b,c,b,d,c);
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

  // Same material, same spatial batch; do not add a full-map draw.
  const collarBatch=`${Math.floor((anchor.east-survey.west)/(tileSize*2))}:${Math.floor(anchor.north/(tileSize*3))}`;
  groundBatches.get(collarBatch)!.push(collar.geometry);
  for (const [batch, members] of groundBatches) {
    const joined = mergeGeometries(members);
    if (!joined) throw new Error(`West crater terrain batch ${batch} cannot be merged`);
    for (const member of members) member.dispose();
    // Derive a coherent vertex snow/rock treatment from actual terrain.
    // Preserve the old color exactly across the B apron and protected pads;
    // don't disguise invisible or mismatched support with a second overlay.
    const pos=joined.getAttribute('position'), colors=new Float32Array(pos.count*3);
    const snow=new Color(0xc1cedc), rock=new Color(0x8995a4), powder=new Color(0xe1e8ef);
    const tint=new Color(),packedSnow=new Color(0xa0a5aa),railGravel=new Color(0x767d82),yardGravel=new Color(0x9a9288);
    const strataGrey=new Color(0x77716a),strataOchre=new Color(0x9e8d76),strataTint=new Color();
    for(let k=0;k<pos.count;k++){
      const e=pos.getX(k),n=-pos.getZ(k),h=pos.getY(k);
      const rad=Math.hypot(e-anchor.east,n-anchor.north);
      const base=oldCarrierAt(e,n);
      const weight=Math.min(1,Math.max(0,(rad-sharedApronRadius-1.5)/8))
        *Math.min(1,Math.max(0,(-e-58)/18));
      // Coherent colors shared at coincident tile vertices; no per-tile
      // random noise or per-face palette jump.
      const d=h-base;
      const shade=Math.min(1,Math.abs(d)/2.8)*weight;
      tint.copy(snow).lerp(d<0?rock:powder,shade*(.58+.22*Math.sin(e*.13+n*.08)));
      // Snow worn by people and ore transport is a material of this very
      // carrier, never another coplanar road mesh. Warm gravel in work yards,
      // subdued ballast along the narrow track, compacted snow on the road.
      const exposure=landscape.outcropAt(e,n);
      if(exposure.exposure>0){
        strataTint.copy(strataGrey).lerp(strataOchre,exposure.band*.75);
        tint.lerp(strataTint,exposure.exposure*.86);
      }
      const civil=landscape.surfaceWeightsAt(e,n);
      tint.lerp(yardGravel,civil.yard*(.42+.06*Math.sin(e*.43+n*.27)));
      tint.lerp(packedSnow,civil.packed*(.66+.09*Math.cos(n*.91+e*.37)));
      tint.lerp(railGravel,civil.ballast*(.66+.07*Math.sin(e*.59-n*.52)));
      tint.lerp(packedSnow,northFootwayWeight(e,n)*(.76+.04*Math.cos(n*.63+e*.72)));
      colors[k*3]=tint.r;colors[k*3+1]=tint.g;colors[k*3+2]=tint.b;
    }
    joined.setAttribute('color',new Float32BufferAttribute(colors,3));
    joined.computeBoundingSphere();
    const mesh = new Mesh(joined, tileGround);
    mesh.name = 'meteor-crater-west-ground';
    mesh.userData.groundBatch = batch;
    group.add(mesh);
  }

  const metal = new MeshLambertMaterial({ color: 0x73534a });
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
    return collar.heightAt(east,north) ?? sampleCarrier(east,north);
  }

  const northConnector=mountWestNorthConnector(northLimit,sampleCarrier);
  group.add(northConnector.group);
  const terrainBoundary={inner:collar.inner,outer:collar.outer,renderNorth:sheetNorthLimit,apronRadius:sharedApronRadius};
  const terrainReadyAt=(east:number,north:number)=>Number.isFinite(east)&&Number.isFinite(north)
    &&((east>=survey.west&&east<=0&&north>=0&&north<=sheetNorthLimit)
      ||northConnector.readyAt(east,north));
  const road = { group, anchor, lip, heightAt, fenceBlocks,terrainBoundary,terrainReadyAt };
  mountZa31CraterEntrance(road);
  const camp = mountZa31CraterCamp(road);
  const rim = buildZa31CraterRim(road, camp.placements);
  group.add(rim.group, camp.group);
  // 卡06 lamp room at the winch workface — mounted before the story
  // dressing so its footprint reserves the ground it stands on.
  const lampRoom = mountZa31CraterLampRoom(road);
  if (lampRoom) group.add(lampRoom.group);
  let story = buildZa36CraterStoryDressing(road,
    lampRoom ? [lampRoom.footprint] : []);
  if(options.unifiedStory){
    if(!unifiedRelief)throw Error('Unified story lifecycle requires B shared ground');
    const before=story.placements.length;
    story=options.unifiedStory.retire(story);
    group.userData.aR30RetiredTerraces=before-story.placements.length;
  }
  group.add(story.group);
  const brokenCircle = buildTownC2CraterBrokenCircle(road, {
    oldWorkPlacements: story.placements.filter(piece => piece.cluster.startsWith('old-work-')),
  });
  group.add(brokenCircle.group);
  // Cut B-01 once. The legacy sampler is analytic and requires its
  // wrapper; B-R01's new sampler reads the same mutable vertex array
  // as the BufferAttribute, so wrapping it would double the offset.
  applyCraterBrokenCircleToWalkMesh(surface as Mesh, anchor, brokenCircle.heightOffsetAt);
  if(!unifiedRelief)road.heightAt=brokenCircle.heightAt;
  if(options.unifiedStory){
    const settled=options.unifiedStory.refit(story,road.heightAt);
    story=settled.story;
    group.userData.aR30SettledSupports=settled.changes;
  }
  const mouthWorks = buildCraterMouthWorks(road);
  group.add(mouthWorks.group);
  const outerWorks = buildCraterOuterWorks(road);
  group.add(outerWorks.group);
  // S-1 collision汇入 (分支窗 A): the crater-outside builders' world-space
  // wall boxes + floors land on this top group's userData, the single
  // walk-geometry source the viewer indexes for east < 0. C3's crater-
  // inside boxes append to these same arrays when they land — do not
  // create a second userData channel.
  group.userData.colliders = [...mouthWorks.colliders, ...outerWorks.colliders];
  group.userData.floors = [...mouthWorks.floors, ...outerWorks.floors];
  group.userData.ramps = [...mouthWorks.ramps, ...outerWorks.ramps];
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
  // The formerly solid factories are now occupied spaces. Keep both the
  // visible ejecta and its matching collider out of these actual footprints
  // and their new entrance/stair routes; do not merely disable collision.
  const industrialKeepout=outerWorks.sites.filter(s=>s.id==='smelter-plant'||s.id==='instrument-plant');
  const routeKeepout=outerWorks.industrialRoutes.flatMap(route=>route.points.map(p=>({...p,radius:1.5})));
  const turnoutKeepout=freightTurnoutKeepout();
  const worksKeepout=[...industrialKeepout,...routeKeepout,...turnoutKeepout,
    ...mouthWorks.supplyDeckRoute.map(p=>({...p,radius:1.5}))];
  const ejecta = buildZa36CraterEjecta(road, [...fenceExclusions,...worksKeepout]);
  group.add(ejecta.group);
  const midground = buildZa36CraterMidground(road, [
    ...worksKeepout, ...rim.placements, ...camp.placements,
    ...story.placements.map(site => ({ east: site.east, north: site.north, radius: .58 })),
    ...ejecta.placements.map(site => ({ east: site.east, north: site.north, radius: site.footprint })),
  ]);
  group.add(midground.group);
  // A2 density backfill: keeps out of everything already placed — the fence
  // and wall lines, the mainline sites, and every earlier dressing placement.
  const densityA2 = buildCraterDensityA2(road, [
    ...fenceExclusions,...turnoutKeepout,
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
  const moltenBeads = mountC2CraterMoltenBeads(road);
  group.add(moltenBeads.group);
  const moltenEarth = moltenBeads.group.getObjectByName('c2-molten-beads-scorched-earth');
  let lastMoltenX = NaN, lastMoltenY = NaN, lastMoltenZ = NaN, lastMoltenNight: boolean | undefined;
  if (moltenEarth instanceof Mesh) {
    moltenEarth.onBeforeRender = (_renderer, _scene, camera) => {
      if (c2Night === lastMoltenNight && Math.abs(camera.position.x - lastMoltenX) < .05 &&
          Math.abs(camera.position.y - lastMoltenY) < .05 && Math.abs(camera.position.z - lastMoltenZ) < .05) return;
      lastMoltenX = camera.position.x; lastMoltenY = camera.position.y; lastMoltenZ = camera.position.z;
      lastMoltenNight = c2Night;
      updateC2CraterMoltenBeads(moltenBeads, { cameraPosition: camera.position, night: c2Night });
    };
  }
  const warmLightChain = mountCraterWarmLightChain(group, surveyCraterWarmLightChain(road));
  let c2Night = false;
  let lastC2Night: boolean | undefined;
  let lastLodDistance = -1;
  surface.onBeforeRender = (_renderer, _scene, camera) => {
    const distance = Math.hypot(camera.position.x - anchor.east,
      camera.position.z + anchor.north);
    if (Math.abs(distance - lastLodDistance) < 2) return;
    lastLodDistance = distance;
    crater.interiorDressing.group.visible = distance < 105;
    centralMound.group.visible = distance < 190;
    brokenCircle.group.visible = distance < 175;
    moltenBeads.group.visible = distance < 80;
    inscription.group.visible = distance < 150;
    midgroundS5.group.visible = distance < 105;
    moundPlanting.group.visible = distance < 190;
  };
  // Collision fix (audit 2026-11-22): the crater's built pieces register
  // walk-geometry boxes on the road's top group, generated from the
  // mounts' own placements. The viewer's west index (buildWestGeometry,
  // window A's S-1 wiring) reads this group's userData, so registering
  // here is what makes the boxes take effect for east < 0.
  // S-1 channel contract: APPEND to the mouth/outer arrays registered
  // above — overwriting them silently dropped the crater-outside boxes
  // from the west index (regression caught by window A's west-collision
  // test on the batch-96 tree: merged colliders 193 < 200).
  group.userData.colliders = [...group.userData.colliders, ...buildCraterColliders({
    yaw: anchor.yaw,
    winch: winch?.survey,
    camp: camp.placements,
    midground: midground.placements,
    ejecta: ejecta.placements,
    dressing: story.placements,
    extra: lampRoom?.boxes,
  })];
  const inscription = mountC2CraterInscription(group, { ...road, ejecta });
  // Batch-107 wiring (window A): window B's mid-band clusters and mound
  // planting ride the same crater group as the C2 five. The S5 builder
  // takes za36's placements as its deconfliction list (window B's
  // production configuration, 85 pieces measured); the planting reads
  // only the live height authority (the C2 mound included).
  const midgroundS5 = buildCraterMidgroundS5(road, {
    avoid: story.placements,
  });
  group.add(midgroundS5.group);
  const moundPlanting = buildMoundPlanting(road);
  group.add(moundPlanting.group);
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
    setNight(night: boolean) {
      if (night === lastC2Night) return;
      lastC2Night = night;
      c2Night = night;
      mouthWorks.setNight(night);
      outerWorks.setNight(night);
      crater.floorWorklights.setNight(night);
      warmLightChain.setNight(night);
    },
  };
  for (const staticGroup of [centralMound.group, brokenCircle.group, inscription.group, warmLightChain.group]) {
    staticGroup.updateMatrixWorld(true);
    staticGroup.traverse(object => { if (object instanceof Mesh) object.matrixAutoUpdate = false; });
  }
  return { ...road, winch, lampRoom, mouthWorks, outerWorks, ejecta, midground, densityA2, ropeStay, surveyM1,
    centralMound, brokenCircle, moltenBeads, inscription, warmLightChain, midgroundS5, moundPlanting, craterActions };
}
