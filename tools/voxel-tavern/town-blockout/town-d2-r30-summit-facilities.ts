import {
  BoxGeometry, Color, DoubleSide, Group, InstancedMesh, Matrix4, Mesh,
  MeshLambertMaterial, Object3D, type Material,
} from 'three';
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
import { applyTownD2R30NightTint } from './town-d2-r30-night-lights';
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
  /** Reuse the host's exact P-3 survey instead of generating a duplicate block. */
  trailPoints?:ReturnType<typeof createMainSummitTrail>['points'];
  /** B owns the operating workshop in production; legacy preview keeps this room. */
  includeLegacyMachineRoom?:boolean;
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

/**
 * R4/R5: the summit five-piece polish overlay.
 *
 * The canonical facility modules own their surveyed coordinates, heights and
 * rules; this overlay never rewrites them. It only adds the R30 host-side
 * block detail the "绝顶五件套" reference demands — hut eave icicles, roof
 * snow, door steps and a roof flag, the monument flagpole with its red-orange
 * banner, and the terrace stone railing with viewing pennants — so every body
 * keeps its canonical datum while reading as a stacked, pixel-textured five
 * -piece set instead of a smooth mass.
 *
 * Every piece is a unit-box instance in a Lambert material, so the existing
 * `setNight` tint pass dims the whole overlay with the rest of the summit.
 * The lamp cores carry an emissive term: the tint pass keeps emissive at
 * night and clears it at noon, so they glow only after dusk without a second
 * night switch.
 */
type PolishAnchor = { east: number; north: number; height: number };

function makePolishBatches(group: Group, disposers: (() => void)[], name: string) {
  const box = new BoxGeometry(1, 1, 1);
  disposers.push(() => box.dispose());
  const ice = new MeshLambertMaterial({ color: '#cfeef5' });
  const snow = new MeshLambertMaterial({ color: '#e5eaeb' });
  const stone = new MeshLambertMaterial({ color: '#83817d' });
  const darkStone = new MeshLambertMaterial({ color: '#4f5255' });
  const carved = new MeshLambertMaterial({ color: '#b7b8b5' });
  const timber = new MeshLambertMaterial({ color: '#694e39' });
  const plank = new MeshLambertMaterial({ color: '#57402d' });
  const brass = new MeshLambertMaterial({ color: '#bf9b63' });
  const flagMat = new MeshLambertMaterial({ color: '#b86a4c', side: DoubleSide });
  const lampMat = new MeshLambertMaterial({ color: '#3a3230', emissive: '#ffb45c', emissiveIntensity: 1 });
  for (const material of [ice, snow, stone, darkStone, carved, timber, plank, brass, flagMat, lampMat]) {
    disposers.push(() => material.dispose());
  }
  const batches: InstancedMesh[] = [];
  const matrix = new Matrix4();
  const pose = new Object3D();
  const tint = new Color();
  function batch(batchName: string, material: MeshLambertMaterial, count: number) {
    const mesh = new InstancedMesh(box, material, count);
    mesh.name = `${name}-${batchName}`;
    batches.push(mesh);
    group.add(mesh);
    return mesh;
  }
  function place(mesh: InstancedMesh, index: number, east: number, height: number,
    north: number, w: number, h: number, d: number, yaw = 0, color?: string) {
    pose.position.set(east, height, -north);
    pose.rotation.set(0, yaw, 0);
    pose.scale.set(w, h, d);
    pose.updateMatrix();
    mesh.setMatrixAt(index, pose.matrix);
    if (color) mesh.setColorAt(index, tint.set(color));
  }
  function finish() {
    for (const mesh of batches) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }
  return { batches, matrix, pose, tint, batch, place, finish,
    materials: { ice, snow, stone, darkStone, carved, timber, plank, brass, flagMat, lampMat } };
}

/** Hut + monument polish: eave icicles, roof snow, door steps, roof flag, monument flagpole. */
function buildHutMonumentPolish(anchors: {
  hut: PolishAnchor & { west: number; east: number; south: number; north: number };
  monument: PolishAnchor;
}) {
  const group = new Group();
  group.name = 'summit-hut-monument-polish';
  const disposers: (() => void)[] = [];
  const b = makePolishBatches(group, disposers, 'hut-monument');
  const { hut, monument } = anchors;
  const hutMidNorth = (hut.south + hut.north) / 2;
  const hutMidEast = (hut.west + hut.east) / 2;
  const soffit = hut.height + 4.15;
  const roofRise = 1.98;

  // Icicle teeth along both eaves, one per block course, reading as the
  // frozen drip the reference shows under the hut roof.
  const icicleCount = 22;
  const icicles = b.batch('eave-icicles', b.materials.ice, icicleCount);
  for (let i = 0; i < icicleCount; i++) {
    const east = hut.west + 0.6 + (i % 11) * ((hut.east - hut.west - 1.2) / 10);
    const north = i < 11 ? hut.south : hut.north;
    b.place(icicles, i, east, soffit - 0.3, north, 0.18, 0.6, 0.18);
  }
  // Roof ridge snow: a pale cap along the ridge line, one block thick.
  const ridgeSnow = b.batch('roof-snow', b.materials.snow, 12);
  for (let i = 0; i < 12; i++) {
    const east = hut.west + 0.6 + i * ((hut.east - hut.west - 1.2) / 11);
    b.place(ridgeSnow, i, east, soffit + roofRise + 0.12, hutMidNorth, 0.7, 0.12, 13.2);
  }
  // Door steps: two stone courses in front of the south door.
  const steps = b.batch('door-steps', b.materials.stone, 2);
  for (let i = 0; i < 2; i++) {
    b.place(steps, i, hutMidEast, hut.height + 0.05 + i * 0.12, hut.south - 0.25 - i * 0.3, 1.4, 0.1, 0.5);
  }
  // Roof flagpole: a slim mast on the ridge with a red-orange pennant,
  // echoing the monument banner across the plateau.
  const roofPole = b.batch('roof-flagpole', b.materials.timber, 6);
  const roofFlag = b.batch('roof-flag', b.materials.flagMat, 1);
  const poleBase = soffit + roofRise + 0.1;
  for (let i = 0; i < 6; i++) {
    b.place(roofPole, i, hutMidEast, poleBase + i * 0.45, hutMidNorth, 0.08, 0.45, 0.08);
  }
  b.place(roofFlag, 0, hutMidEast + 0.35, poleBase + 2.7, hutMidNorth, 0.55, 0.32, 0.04);
  // A small warm lamp by the door: emissive Lambert, so the night tint keeps
  // the glow after dusk and clears it at noon.
  const doorLamp = b.batch('door-lamp', b.materials.lampMat, 1);
  b.place(doorLamp, 0, hutMidEast, hut.height + 1.5, hut.south - 0.18, 0.22, 0.26, 0.22);

  // R5 deepening: wall plinth and cap. The reference hut reads as a stacked
  // wood-and-stone shell; the canonical walls stay untouched, so this overlay
  // adds a stone plinth band at the wall base and a timber cap under the
  // eaves to give the shell its readable course-by-course stack.
  const plinthCount = 18;
  const wallPlinth = b.batch('hut-wall-plinth', b.materials.stone, plinthCount);
  {
    let index = 0;
    for (const east of [56.4, 58.84, 61.28, 63.72, 66.16]) {
      b.place(wallPlinth, index++, east + 1.22, hut.height + 0.25, hut.south - 0.19, 2.44, 0.5, 0.22);
      b.place(wallPlinth, index++, east + 1.22, hut.height + 0.25, hut.north + 0.19, 2.44, 0.5, 0.22);
    }
    for (const north of [1007.4, 1010.2, 1013.0, 1015.8]) {
      b.place(wallPlinth, index++, hut.west - 0.19, hut.height + 0.25, north + 1.4, 0.22, 0.5, 2.8);
      b.place(wallPlinth, index++, hut.east + 0.19, hut.height + 0.25, north + 1.4, 0.22, 0.5, 2.8);
    }
  }
  const capCount = 18;
  const wallCap = b.batch('hut-wall-cap', b.materials.plank, capCount);
  {
    let index = 0;
    for (const east of [56.4, 58.84, 61.28, 63.72, 66.16]) {
      b.place(wallCap, index++, east + 1.22, soffit - 0.09, hut.south - 0.19, 2.44, 0.18, 0.16);
      b.place(wallCap, index++, east + 1.22, soffit - 0.09, hut.north + 0.19, 2.44, 0.18, 0.16);
    }
    for (const north of [1007.4, 1010.2, 1013.0, 1015.8]) {
      b.place(wallCap, index++, hut.west - 0.19, soffit - 0.09, north + 1.4, 0.16, 0.18, 2.8);
      b.place(wallCap, index++, hut.east + 0.19, soffit - 0.09, north + 1.4, 0.16, 0.18, 2.8);
    }
  }
  // Stone chimney: rises through the roof on the back-west shoulder, with a
  // dark cap block so the stack reads as a real appliance, not a flat box.
  const chimneyCount = 5;
  const chimney = b.batch('hut-chimney', b.materials.stone, chimneyCount);
  const chimneyEast = 59;
  const chimneyNorth = 1017;
  for (let i = 0; i < 4; i++) {
    b.place(chimney, i, chimneyEast, hut.height + 4.5 + i * 0.5, chimneyNorth, 0.7, 0.5, 0.7);
  }
  b.place(chimney, 4, chimneyEast, hut.height + 6.5, chimneyNorth, 0.8, 0.1, 0.8);
  // West-wall warm window: the reference hut carries a second warm pane on the
  // cross wall; the canonical south pane stays, this adds the west pane with
  // its own frame and sill so both cross walls read as lit at night.
  const westWindow = b.batch('hut-west-window', b.materials.lampMat, 1);
  b.place(westWindow, 0, hut.west - 0.02, hut.height + 1.95, hutMidNorth, 0.06, 1.0, 0.8);
  const westWindowFrame = b.batch('hut-west-window-frame', b.materials.timber, 2);
  b.place(westWindowFrame, 0, hut.west - 0.01, hut.height + 2.5, hutMidNorth, 0.1, 0.09, 0.9);
  b.place(westWindowFrame, 1, hut.west - 0.01, hut.height + 1.38, hutMidNorth, 0.1, 0.09, 0.9);
  // Door canopy: a short timber shelter over the south door, keeping the
  // doorway dry and giving the front face a readable landing.
  const doorCanopy = b.batch('hut-door-canopy', b.materials.plank, 1);
  b.place(doorCanopy, 0, hutMidEast, hut.height + 3.45, hut.south - 0.5, 2.0, 0.12, 0.6);

  // The reference pairs the carved stone with a red-orange flag on a slim
  // pole; the canonical monument keeps its slab, this overlay adds the pole.
  const monBase = monument.height;
  // Stone flag-pole base: a stepped stone collar at the monument top so the
  // mast reads as planted hardware instead of a bare stick.
  const monPoleBase = b.batch('monument-flagpole-base', b.materials.stone, 3);
  for (let i = 0; i < 3; i++) {
    b.place(monPoleBase, i, monument.east, monBase + 0.12 + i * 0.08, monument.north,
      0.9 - i * 0.22, 0.14, 0.9 - i * 0.22);
  }
  const monPole = b.batch('monument-flagpole', b.materials.timber, 10);
  const monFlag = b.batch('monument-flag', b.materials.flagMat, 4);
  for (let i = 0; i < 10; i++) {
    b.place(monPole, i, monument.east, monBase + 0.2 + i * 0.55, monument.north, 0.09, 0.55, 0.09);
  }
  // Flag top finial: a brass ball on the mast head so the banner reads as a
  // fitted, ceremonial pole rather than a cut stick.
  const monFinial = b.batch('monument-flag-finial', b.materials.brass, 1);
  b.place(monFinial, 0, monument.east, monBase + 5.75, monument.north, 0.16, 0.16, 0.16);
  // Banner folds: three segmented cloth bands stacked along the mast, each
  // slightly offset, reading as a real draped flag rather than one flat quad.
  for (let i = 0; i < 4; i++) {
    b.place(monFlag, i, monument.east + 0.42 + i * 0.16, monBase + 5.0 + i * 0.45, monument.north,
      0.5, 0.42, 0.04);
  }
  // Slab carved grooves: vertical dark incisions down the monument face,
  // echoing the chiseled lettering the reference shows on the carved stone.
  const monGrooves = b.batch('monument-slab-grooves', b.materials.darkStone, 5);
  for (let i = 0; i < 5; i++) {
    b.place(monGrooves, i, monument.east, monBase + 1.3 + i * 0.42, monument.north - 0.32,
      0.05, 0.5, 0.05);
  }
  // Bronze inscription plate: a warm metal plaque pinned to the slab face,
  // giving the monument a readable dedication surface in the reference's
  // bronze-on-stone palette.
  const monPlate = b.batch('monument-inscription-plate', b.materials.brass, 1);
  b.place(monPlate, 0, monument.east, monBase + 2.4, monument.north - 0.34, 0.8, 0.5, 0.05);
  // Plinth steps: two stone courses in front of the monument base, so the
  // carved slab reads as standing on a built plinth, not a bare mound.
  const monSteps = b.batch('monument-plinth-steps', b.materials.stone, 2);
  for (let i = 0; i < 2; i++) {
    b.place(monSteps, i, monument.east, monBase + 0.05 + i * 0.1, monument.north - 1.3 - i * 0.3,
      2.4, 0.1, 0.5);
  }
  // Ice teeth on the monument plinth edge.
  const monIcicles = b.batch('monument-plinth-icicles', b.materials.ice, 4);
  for (let i = 0; i < 4; i++) {
    b.place(monIcicles, i, monument.east - 0.7 + i * 0.47, monBase + 0.32, monument.north - 1.0, 0.16, 0.5, 0.16);
  }

  b.finish();
  let disposed = false;
  return {
    group,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.clear();
      for (const mesh of b.batches) mesh.dispose();
      for (const dispose of disposers) dispose();
    },
  };
}

/** Terrace polish: chipped stone balustrade, viewing pennants, rail posts and a glide launch marker. */
function buildTerracePolish(terrace: PolishAnchor) {
  const group = new Group();
  group.name = 'summit-terrace-polish';
  const disposers: (() => void)[] = [];
  const b = makePolishBatches(group, disposers, 'terrace');
  const railCount = 14;
  const rail = b.batch('stone-rail', b.materials.stone, railCount);
  const railNorth = terrace.north - 6.2;
  for (let i = 0; i < railCount; i++) {
    const east = terrace.east - 8.4 + i * (16.8 / (railCount - 1));
    b.place(rail, i, east, terrace.height + 0.55, railNorth, 0.7, 0.5, 0.5);
  }
  // R5 deepening: rail posts. Each balustrade block stands on a stone post
  // that drops to the platform, so the railing reads as a built fence rather
  // than a floating bar.
  const railPosts = b.batch('terrace-rail-posts', b.materials.stone, railCount);
  for (let i = 0; i < railCount; i++) {
    const east = terrace.east - 8.4 + i * (16.8 / (railCount - 1));
    b.place(railPosts, i, east, terrace.height + 0.22, railNorth, 0.22, 0.6, 0.22);
  }
  // R5 deepening: end posts. The two termini rise higher than the mid rail,
  // giving the gallery a readable gate post at each end.
  const endPosts = b.batch('terrace-end-posts', b.materials.stone, 2);
  b.place(endPosts, 0, terrace.east - 8.4, terrace.height + 0.9, railNorth, 0.3, 1.2, 0.3);
  b.place(endPosts, 1, terrace.east + 8.4, terrace.height + 0.9, railNorth, 0.3, 1.2, 0.3);
  // Pennant poles along the rail, each with a cloth flag in the reference's
  // warm palette; instance colours keep one draw for the whole string.
  const pennantPoles = b.batch('pennant-poles', b.materials.timber, 15);
  const pennants = b.batch('pennants', b.materials.flagMat, 3);
  const pennantColors = ['#b86a4c', '#e7bb84', '#8d7159'];
  for (let i = 0; i < 3; i++) {
    const east = terrace.east - 5 + i * 5;
    for (let seg = 0; seg < 5; seg++) {
      b.place(pennantPoles, i * 5 + seg, east, terrace.height + 0.6 + seg * 0.4, railNorth, 0.07, 0.4, 0.07);
    }
    b.place(pennants, i, east + 0.28, terrace.height + 2.6, railNorth, 0.5, 0.3, 0.04, 0, pennantColors[i]!);
  }
  // R5 deepening: glide launch marker. A brass-capped stone ring on the
  // platform's north lip marks the takeoff point, so the glide course reads
  // as a marked launch pad rather than an undifferentiated deck.
  const launchRing = b.batch('terrace-glide-launch-ring', b.materials.stone, 8);
  const launchRingNorth = terrace.north + 4.5;
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    b.place(launchRing, i,
      terrace.east + Math.cos(angle) * 1.1,
      terrace.height + 0.12,
      launchRingNorth + Math.sin(angle) * 1.1,
      0.3, 0.12, 0.3);
  }
  const launchCap = b.batch('terrace-glide-launch-cap', b.materials.brass, 1);
  b.place(launchCap, 0, terrace.east, terrace.height + 0.3, launchRingNorth, 0.5, 0.12, 0.5);
  b.finish();
  let disposed = false;
  return {
    group,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.clear();
      for (const mesh of b.batches) mesh.dispose();
      for (const dispose of disposers) dispose();
    },
  };
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
  // The canonical facility bodies carry no night response of their own, so
  // this module owns the darkening of every lit surface it mounts.
  let paintSetNight: ((night: boolean) => void) | undefined;
  let bellLampSwitch: ((on: boolean) => void) | undefined;

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
  let trailPoints=options.trailPoints;
  if(!trailPoints){
    const block=createMainSummitBlock(mainSummitLayout,arrivalHeight,100);
    try{trailPoints=createMainSummitTrail(block.heightAt,arrivalHeight).points;}finally{block.dispose();}
  }
  if(trailPoints.length<2)throw Error('Missing summit trail survey');

  if (includeHut) {
    const landmarks = createMainSummitRegistrationLandmarks(arrivalHeight);
    const summit = landmarks.summit;
    const registration = mountMainSummitRegistration(group, landmarks, 'summit');
    registration.group.userData.colliders=registration.colliders;
    disposers.push(() => registration.dispose());
    record('registration-hut', 'building', summit.hut.east + (summit.hut.east - summit.hut.west) / 2,
      summit.hut.north + (summit.hut.north - summit.hut.south) / 2, summit.hut.height);

    const furnishings = createMainSummitHutFurnishings();
    group.add(furnishings.group);
    disposers.push(() => furnishings.dispose());
    record('hut-furnishings', 'building', summit.interior.east, summit.interior.north,
      summit.interior.height);

    // The line-2 lower station machine room stands on the arrival terrace.
    if(options.includeLegacyMachineRoom!==false){
      const machineRoom = createMainSummitMachineRoom(arrivalHeight);
      group.add(machineRoom.group);
      disposers.push(() => machineRoom.dispose());
      record('machine-room', 'building', -15.5, 6, arrivalHeight);
    }

    // R4/R5: the hut and monument polish overlay. The canonical hut and
    // carved slab keep their surveyed datum; this only adds the stacked
    // block detail the five-piece reference demands.
    const hutPolish = buildHutMonumentPolish({
      hut: { ...summit.hut },
      monument: { ...summit.monument },
    });
    group.add(hutPolish.group);
    disposers.push(() => hutPolish.dispose());
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
    // The canonical overlay owns its own night colour, so the generic tint
    // pass must leave it alone.
    (paint.mesh.material as Material).userData.noNightTint = true;
    paintSetNight = paint.setNight;
    group.add(paint.mesh);
    disposers.push(() => paint.dispose());

    const bellPosts = createMainSummitBellPosts(trailPoints);
    group.add(bellPosts.group);
    disposers.push(() => bellPosts.dispose());
    bellLampSwitch = (on: boolean) => bellPosts.setAllLamps(on);
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

    // R4/R5: the terrace polish overlay. The canonical wind-ground pad keeps
    // its surveyed datum; this only adds the stacked stone balustrade and
    // viewing pennants the five-piece reference shows on the vantage.
    const terracePolish = buildTerracePolish({
      east: DEFAULTS.glideLaunch.east,
      north: DEFAULTS.glideLaunch.north,
      height: 800,
    });
    group.add(terracePolish.group);
    disposers.push(() => terracePolish.dispose());

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
    // The rules side owns the bell-post lamp cores; D2-R08 asks this hook
    // instead of reaching into the canonical bell module.
    bellLampSwitch,
  };

  let disposed = false;
  let night = false;
  return {
    group,
    reports: () => Object.freeze(reports.map(report => ({ ...report }))),
    stats: () => stats,
    /**
     * D2-R08: darkens every lit surface the facility bodies own and hands
     * the emissive bodies over to the night-light package. The overlay keeps
     * its canonical night colour.
     */
    setNight(value: boolean) {
      if (disposed) throw new Error('The D2-R07 summit facilities are disposed.');
      if (typeof value !== 'boolean') throw new TypeError('setNight expects a boolean.');
      if (night === value) return;
      night = value;
      applyTownD2R30NightTint(group, value);
      paintSetNight?.(value);
      group.userData.night = night;
    },
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
