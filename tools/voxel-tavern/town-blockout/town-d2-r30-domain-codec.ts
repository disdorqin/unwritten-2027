import { mainSummitBounds } from './main-summit-block';
import { townD2CloudTerraceContract } from './town-d2-cloud-terrace-transform';
import {
  townD2R30LocalPoint as canonicalToLocal,
  townD2R30Spec,
  townD2R30WorldPoint as canonicalToWorld,
  type TownD2R30Point,
} from './town-d2-r30-domain';
import { townD2R30PresenceHandoff } from './town-d2-r30-presence-handoff';

/** Stable identity for the R30 main-summit coordinate leaf, not a presence authority. */
export const TOWN_D2_R30_DOMAIN_ID = 'town-d2-r30-main-summit' as const;
export const TOWN_D2_R30_DOMAIN_FRAME = 'd2-r30-summit-local-east-north-height' as const;
export const TOWN_D2_R30_DOMAIN_VERSION = 1 as const;

const SEAM_TOLERANCE = 1e-9;
const TRANSFORM_TOLERANCE = 1e-9;

export type TownD2R30EncodedPoint = Readonly<{
  domainId: typeof TOWN_D2_R30_DOMAIN_ID;
  frame: typeof TOWN_D2_R30_DOMAIN_FRAME;
  local: TownD2R30Point;
  world: TownD2R30Point;
  seamNorthLocal: number;
  version: typeof TOWN_D2_R30_DOMAIN_VERSION;
}>;

export type TownD2R30WorldClassification = 'front-ridge' | 'seam' | 'summit' | 'outside';

function finitePoint(value: unknown): TownD2R30Point | undefined {
  if (value === null || typeof value !== 'object') return;
  const { east, north, height } = value as Record<string, unknown>;
  if (typeof east !== 'number' || !Number.isFinite(east) ||
      typeof north !== 'number' || !Number.isFinite(north) ||
      typeof height !== 'number' || !Number.isFinite(height)) return;
  return Object.freeze({ east, north, height });
}

function requirePoint(value: unknown, label: string): TownD2R30Point {
  const point = finitePoint(value);
  if (!point) throw new RangeError(`${label} must contain finite east, north and height.`);
  return point;
}

function samePoint(left: TownD2R30Point, right: TownD2R30Point): boolean {
  return Math.abs(left.east - right.east) <= TRANSFORM_TOLERANCE &&
    Math.abs(left.north - right.north) <= TRANSFORM_TOLERANCE &&
    Math.abs(left.height - right.height) <= TRANSFORM_TOLERANCE;
}

function validateLocalBounds(point: TownD2R30Point): void {
  const { west, east, south, north } = mainSummitBounds;
  if (point.east < west || point.east > east || point.north < south || point.north > north) {
    throw new RangeError('D2-R30 local point is outside the main-summit bounds.');
  }
  if (point.height < townD2R30Spec.floorHeight || point.height > townD2R30Spec.summitHeight) {
    throw new RangeError(`D2-R30 local height must be in [${townD2R30Spec.floorHeight}, ${townD2R30Spec.summitHeight}].`);
  }
}

export function townD2R30ToWorld(localPoint: TownD2R30Point): TownD2R30Point {
  return canonicalToWorld(requirePoint(localPoint, 'localPoint'));
}

export function townD2R30ToLocal(worldPoint: TownD2R30Point): TownD2R30Point {
  return canonicalToLocal(requirePoint(worldPoint, 'worldPoint'));
}

export function encodeTownD2R30Point(localPoint: TownD2R30Point): TownD2R30EncodedPoint {
  const local = requirePoint(localPoint, 'localPoint');
  validateLocalBounds(local);
  const world = Object.freeze(townD2R30ToWorld(local));
  if (!samePoint(townD2R30ToLocal(world), local)) {
    throw new RangeError('D2-R30 local/world transform is not reversible within tolerance for this point.');
  }
  return Object.freeze({
    domainId: TOWN_D2_R30_DOMAIN_ID,
    frame: TOWN_D2_R30_DOMAIN_FRAME,
    local,
    world,
    seamNorthLocal: townD2CloudTerraceContract.seamNorthLocal,
    version: TOWN_D2_R30_DOMAIN_VERSION,
  });
}

/** Untrusted payloads are accepted only when every frame claim and coordinate agrees exactly. */
export function decodeTownD2R30Point(encoded: unknown): TownD2R30Point {
  if (encoded === null || typeof encoded !== 'object') {
    throw new RangeError('Encoded D2-R30 point must be an object.');
  }
  const value = encoded as Record<string, unknown>;
  if (value.domainId !== TOWN_D2_R30_DOMAIN_ID) throw new RangeError('Wrong D2-R30 domainId.');
  if (value.frame !== TOWN_D2_R30_DOMAIN_FRAME) throw new RangeError('Wrong D2-R30 coordinate frame.');
  if (value.version !== TOWN_D2_R30_DOMAIN_VERSION) throw new RangeError('Unsupported D2-R30 codec version.');
  if (value.seamNorthLocal !== townD2CloudTerraceContract.seamNorthLocal) {
    throw new RangeError('Wrong D2-R30 canonical seamNorthLocal.');
  }
  const local = requirePoint(value.local, 'encoded.local');
  const world = requirePoint(value.world, 'encoded.world');
  validateLocalBounds(local);
  if (!samePoint(world, townD2R30ToWorld(local)) || !samePoint(townD2R30ToLocal(world), local)) {
    throw new RangeError('Encoded D2-R30 local/world coordinates do not round-trip within tolerance.');
  }
  return local;
}

/**
 * Classifies only the published summit/front-ridge footprints. Invalid or
 * unsupported coordinates fail closed as outside; this grants no room access.
 */
export function classifyTownD2R30WorldPoint(worldPoint: TownD2R30Point): TownD2R30WorldClassification {
  const world = finitePoint(worldPoint);
  if (!world || world.height < townD2R30Spec.floorHeight || world.height > townD2R30Spec.summitHeight) {
    return 'outside';
  }
  const local = canonicalToLocal(world);
  const seam = townD2CloudTerraceContract.seamNorthLocal;
  const { northOrigin, bounds } = townD2R30PresenceHandoff.frontRidge;
  const inFrontRidge = world.east >= 0 && world.east <= bounds.width &&
    world.north >= northOrigin && world.north <= northOrigin + bounds.depth;
  const inSummit = local.east >= mainSummitBounds.west && local.east <= mainSummitBounds.east &&
    local.north >= seam && local.north <= mainSummitBounds.north;
  if (!inFrontRidge && !inSummit) return 'outside';
  const seamDistance = local.north - seam;
  if (Math.abs(seamDistance) <= SEAM_TOLERANCE) return 'seam';
  return seamDistance < 0 ? 'front-ridge' : 'summit';
}
