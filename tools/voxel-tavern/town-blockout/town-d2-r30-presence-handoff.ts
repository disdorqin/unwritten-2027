import { mountainPresenceBounds, mountainPresenceNorthOrigin } from '../../../src/shared/za22-mountain-domain';
import { mainSummitBounds } from './main-summit-block';
import { townD2CloudTerraceContract } from './town-d2-cloud-terrace-transform';
import {
  sampleTownD2R30Height, townD2R30LocalPoint, townD2R30Spec, townD2R30WorldPoint,
} from './town-d2-r30-domain';

export const townD2R30PresenceHandoff = Object.freeze({
  status: 'proposal',
  owner: 'A/总控',
  roomKey: 'main-summit-local',
  coordinateConvention: 'x=east,y=height,z=-north',
  localBounds: Object.freeze({
    west: mainSummitBounds.west,
    east: mainSummitBounds.east,
    south: mainSummitBounds.south,
    north: mainSummitBounds.north,
    minimumHeight: townD2R30Spec.floorHeight,
    maximumHeight: townD2R30Spec.summitHeight,
  }),
  worldAnchor: Object.freeze({ ...townD2R30Spec.worldAnchor }),
  frontRidge: Object.freeze({
    northOrigin: mountainPresenceNorthOrigin,
    bounds: Object.freeze({ ...mountainPresenceBounds }),
    unchanged: true,
  }),
  seam: Object.freeze({ localNorth: townD2CloudTerraceContract.seamNorthLocal, worldNorth: townD2R30Spec.worldAnchor.north + townD2CloudTerraceContract.seamNorthLocal, height: townD2CloudTerraceContract.arrivalHeight }),
  // The terrain starts at N=-10; domain ownership transfers earlier on the apron.
  gateLine: Object.freeze({ localNorth: mainSummitBounds.south, worldNorth: townD2R30Spec.worldAnchor.north + mainSummitBounds.south }),
  requiredOwnerFields: Object.freeze([
    'presencePath',
    'wireOriginEast',
    'wireOriginNorth',
    'unsignedOrSignedEncoding',
    'interestRadius',
    'authoritativeRoomOwner',
  ] as const),
  productionReady: false,
});

export type TownD2R30PresenceReport = Readonly<{
  status: 'proposal';
  owner: 'A/总控';
  localBounds: Readonly<{
    west: number;
    east: number;
    south: number;
    north: number;
    minimumHeight: number;
    maximumHeight: number;
  }>;
  worldBounds: Readonly<{
    west: number;
    east: number;
    south: number;
    north: number;
    minimumHeight: number;
    maximumHeight: number;
  }>;
  checks: Readonly<{
    localAreaMatchesDomain: boolean;
    worldRoundTripExact: boolean;
    summitHeightSupported: boolean;
    gateHeightSupported: boolean;
    frontRidgeUnchanged: boolean;
    directUnionWouldRequireNegativeEast: boolean;
  }>;
  missingOwnerFields: readonly string[];
  productionReady: false;
}>;

export function resolveTownD2R30PresenceHandoff(): TownD2R30PresenceReport {
  const handoff = townD2R30PresenceHandoff;
  const { localBounds, worldAnchor, frontRidge, seam } = handoff;
  const worldBounds = Object.freeze({
    west: worldAnchor.east + localBounds.west,
    east: worldAnchor.east + localBounds.east,
    south: worldAnchor.north + localBounds.south,
    north: worldAnchor.north + localBounds.north,
    minimumHeight: localBounds.minimumHeight,
    maximumHeight: localBounds.maximumHeight,
  });
  const corners = [
    { east: localBounds.west, north: localBounds.south, height: localBounds.minimumHeight },
    { east: localBounds.east, north: localBounds.north, height: localBounds.maximumHeight },
  ] as const;
  const roundTripExact = corners.every(point => {
    const back = townD2R30LocalPoint(townD2R30WorldPoint(point));
    return back.east === point.east && back.north === point.north && back.height === point.height;
  });
  const summitHeight = sampleTownD2R30Height(50, 1_000);
  const gateHeight = sampleTownD2R30Height(0, handoff.gateLine.localNorth);
  const frontNorth = frontRidge.northOrigin + frontRidge.bounds.depth;
  return Object.freeze({
    status: 'proposal',
    owner: 'A/总控',
    localBounds: Object.freeze({ ...localBounds }),
    worldBounds,
    checks: Object.freeze({
      localAreaMatchesDomain: (localBounds.east - localBounds.west) * (localBounds.north - localBounds.south) ===
        townD2R30Spec.width * townD2R30Spec.depth,
      worldRoundTripExact: roundTripExact,
      summitHeightSupported: summitHeight === localBounds.maximumHeight,
      gateHeightSupported: gateHeight === seam.height,
      frontRidgeUnchanged: frontRidge.unchanged && frontRidge.bounds.width === 640 &&
        frontRidge.bounds.depth === 260 && frontNorth === 800,
      directUnionWouldRequireNegativeEast: worldBounds.west < 0,
    }),
    missingOwnerFields: Object.freeze([...handoff.requiredOwnerFields]),
    productionReady: false,
  });
}
