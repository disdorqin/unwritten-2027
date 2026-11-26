import { northRidgeSummit, sampleNorthRidge350 } from './north-ridge-350-terrain';
import { summitAssemblyAnchor } from './main-summit-assembly';
import { mainSummitBounds, mainSummitSpec } from './main-summit-block';
import {
  sampleTownD2R30Height, townD2R30Anchors, townD2R30LocalPoint, townD2R30Spec, townD2R30WorldPoint,
} from './town-d2-r30-domain';

/**
 * D2 → D: the cloud-terrace transform contract.
 *
 * The active board lists "D/D2交云海变换" as an interface deliverable that
 * both windows owe each other. This module is the machine-checkable half of
 * that handover: it states, in one place and in one frame, where the front
 * ridge's cloud terrace sits in the world, where it lands in the summit-local
 * frame, which line the two domains swap across, and which anchors a player
 * must be able to return from.
 *
 * The handover is a **domain swap**, not a continuous terrain stitch. The
 * front ridge tops out at 350 m; the summit domain starts at its 347 m
 * arrival deck. Both numbers are published here so window D does not have to
 * guess and neither window can quietly invent a third one.
 */

export const townD2CloudTerraceContract = Object.freeze({
  /** Bumped whenever the frame or the seam moves. */
  version: 'd2-cloud-terrace-1.0',
  /** The shared world anchor of the front ridge and the summit frames. */
  worldAnchor: Object.freeze({ east: 300, north: 676 }),
  /** The front ridge's cloud terrace in world coordinates. */
  terraceWorld: Object.freeze({ east: northRidgeSummit.east, north: northRidgeSummit.north, height: northRidgeSummit.height }),
  /** The same terrace expressed in the summit-local frame. */
  terraceLocal: Object.freeze({
    east: northRidgeSummit.east - summitAssemblyAnchor.east,
    north: northRidgeSummit.north - summitAssemblyAnchor.north,
    height: northRidgeSummit.height,
  }),
  /**
   * The swap seam. North of this line the player is on the summit domain;
   * south of it the player is on the front ridge.
   */
  seamNorthLocal: -12.75,
  /** The summit domain's arrival deck height. */
  arrivalHeight: 347,
  /** The ropeway's lower dock in the local frame (the front ridge anchor). */
  cableTerminalLocal: Object.freeze({ east: 36, north: -36 }),
  /**
   * The gate apron on the front-ridge side of the seam: the continuous
   * strip a player walks across when they leave the summit gate for the
   * cloud terrace. Its northern edge is the seam itself.
   */
  apronLocal: Object.freeze({ east: 0, halfWidth: 6, northFrom: -22, northTo: -13 }),
  /** The R30 summit gate, the first solid anchor inside the summit domain. */
  gateLocal: Object.freeze({ ...townD2R30Anchors.gate }),
});

export type TownD2CloudTerraceTransformReport = Readonly<{
  version: string;
  anchor: Readonly<{
    world: Readonly<{ east: number; north: number }>;
    /** The anchor the canonical summit assembly already uses. */
    matchesAssembly: boolean;
    /** The anchor the R30 domain already uses. */
    matchesR30: boolean;
  }>;
  terrace: Readonly<{
    world: Readonly<{ east: number; north: number; height: number }>;
    local: Readonly<{ east: number; north: number; height: number }>;
    /** The world point maps back onto the local point, to the millimetre. */
    roundTripExact: boolean;
    /** The front ridge height sampled at the terrace's world position. */
    frontRidgeHeight: number;
  }>;
  swap: Readonly<{
    /** The seam line in the local frame. */
    seamNorthLocal: number;
    /** The summit domain's arrival deck height. */
    arrivalHeight: number;
    /** The front ridge height the player comes from. */
    frontRidgeArrivalHeight: number;
    /**
     * The step between the two domains. A domain swap tolerates a small
     * step; it must not be a cliff.
     */
    arrivalStep: number;
    /** The step is inside the published front-ridge arrival band. */
    stepInsideBand: boolean;
  }>;
  footprint: Readonly<{
    /** The local north range the front ridge keeps. */
    southLimitLocal: number;
    /** The local north range the summit domain owns. */
    northLimitLocal: number;
    /** The published gate apron in the local frame. */
    apronLocal: Readonly<{ east: number; halfWidth: number; northFrom: number; northTo: number }>;
    /** The terrace supports a continuous apron at the seam. */
    apronContinuous: boolean;
  }>;
  returnAnchors: readonly Readonly<{
    id: string;
    /** Which domain carries this anchor. */
    domain: 'summit' | 'front-ridge';
    local: Readonly<{ east: number; north: number }>;
    world: Readonly<{ east: number; north: number }>;
    height: number;
    supported: boolean;
  }>[];
}>;

/**
 * The footprint the front ridge owns in the local frame.
 *
 * It mirrors the canonical `supportsCloudTerrace` predicate so window D can
 * place its own terrace geometry without importing the summit assembly. The
 * contract's test compares the two implementations side by side.
 */
export function townD2CloudTerraceFootprint(east: number, north: number, padding = 0): boolean {
  const gateApron = Math.abs(east) <= 6 - padding && north >= -22 + padding;
  const connection = east >= -2 + padding && east <= 38 - padding &&
    north >= -16 + padding && north <= -12 - padding;
  const terminal = Math.abs(east - 36) <= 2 - padding &&
    north >= -38 + padding && north <= -12 - padding;
  return north <= mainSummitBounds.south && (gateApron || connection || terminal);
}

const RETURN_ANCHORS = Object.freeze([
  { id: 'gate', east: townD2R30Anchors.gate.east, north: townD2R30Anchors.gate.north, domain: 'summit' },
  { id: 'cable-terminal', east: 36, north: -36, domain: 'front-ridge' },
  {
    id: 'cloud-terrace',
    east: townD2CloudTerraceContract.terraceLocal.east,
    north: townD2CloudTerraceContract.terraceLocal.north,
    domain: 'front-ridge',
  },
  { id: 'south-pass', east: townD2R30Anchors.southPass.east, north: townD2R30Anchors.southPass.north, domain: 'summit' },
  { id: 'summit', east: townD2R30Anchors.summit.east, north: townD2R30Anchors.summit.north, domain: 'summit' },
] as const);

/**
 * Resolves the contract and checks every claim it makes. The report is what
 * window D and the pairing reviewer read; a failed claim is a real defect,
 * not a warning.
 */
export function resolveTownD2CloudTerraceTransform(): TownD2CloudTerraceTransformReport {
  const contract = townD2CloudTerraceContract;
  const anchor = contract.worldAnchor;

  const matchesAssembly = anchor.east === summitAssemblyAnchor.east && anchor.north === summitAssemblyAnchor.north;
  const matchesR30 = anchor.east === townD2R30Spec.worldAnchor.east && anchor.north === townD2R30Spec.worldAnchor.north;

  const terraceWorld = { ...contract.terraceWorld };
  const terraceLocal = { ...contract.terraceLocal };
  const roundTrip = townD2R30LocalPoint(terraceWorld);
  const roundTripExact = roundTrip.east === terraceLocal.east && roundTrip.north === terraceLocal.north;
  const forward = townD2R30WorldPoint(terraceLocal);
  const frontRidgeHeight = sampleNorthRidge350(terraceWorld.east, terraceWorld.north);

  const [bandLow, bandHigh] = mainSummitSpec.frontRidgeArrivalBand;
  const arrivalStep = Math.abs(frontRidgeHeight - contract.arrivalHeight);

  // The apron in front of the gate must run continuously across the seam:
  // every published apron cell has to be carried by the front-ridge footprint.
  const apron = contract.apronLocal;
  let apronContinuous = true;
  for (let north = apron.northFrom; north <= apron.northTo; north += 1) {
    for (let east = apron.east - apron.halfWidth; east <= apron.east + apron.halfWidth; east += 1) {
      if (!townD2CloudTerraceFootprint(east, north)) { apronContinuous = false; break; }
    }
    if (!apronContinuous) break;
  }

  const returnAnchors = RETURN_ANCHORS.map(point => {
    const world = townD2R30WorldPoint({ ...point, height: 0 });
    // Each anchor is carried by the domain that owns it: the terrace and the
    // ropeway's lower dock stand on the front ridge, the rest on the summit.
    const height = point.domain === 'front-ridge'
      ? sampleNorthRidge350(world.east, world.north)
      : sampleTownD2R30Height(point.east, point.north);
    return Object.freeze({
      id: point.id,
      domain: point.domain,
      local: Object.freeze({ east: point.east, north: point.north }),
      world: Object.freeze({ east: world.east, north: world.north }),
      height: height ?? Number.NaN,
      supported: height !== undefined,
    });
  });

  return Object.freeze({
    version: contract.version,
    anchor: Object.freeze({
      world: { ...anchor },
      matchesAssembly,
      matchesR30,
    }),
    terrace: Object.freeze({
      world: terraceWorld,
      local: terraceLocal,
      roundTripExact: roundTripExact && forward.east === terraceWorld.east && forward.north === terraceWorld.north,
      frontRidgeHeight,
    }),
    swap: Object.freeze({
      seamNorthLocal: contract.seamNorthLocal,
      arrivalHeight: contract.arrivalHeight,
      frontRidgeArrivalHeight: frontRidgeHeight,
      arrivalStep,
      stepInsideBand: arrivalStep <= bandHigh - bandLow,
    }),
    footprint: Object.freeze({
      southLimitLocal: mainSummitBounds.south,
      northLimitLocal: contract.seamNorthLocal,
      apronLocal: Object.freeze({ ...apron }),
      apronContinuous,
    }),
    returnAnchors: Object.freeze(returnAnchors),
  });
}

/**
 * True when the summit domain may be wired to the front ridge. Any failed
 * claim keeps the domains apart instead of producing a broken seam.
 */
export function canWireTownD2CloudTerrace(): boolean {
  const report = resolveTownD2CloudTerraceTransform();
  return report.anchor.matchesAssembly
    && report.anchor.matchesR30
    && report.terrace.roundTripExact
    && report.swap.stepInsideBand
    && report.footprint.apronContinuous
    && report.returnAnchors.every(anchor => anchor.supported);
}
