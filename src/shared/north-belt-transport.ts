type Point = Readonly<{ east: number; north: number; height: number }>;
type Pose = Point & Readonly<{ yaw: number }>;
type RoomLimits = Readonly<{ width: number; depth: number; height: number }>;

const maxPoseMetres = 0xffff / 100;
const axes = ['east', 'north', 'height'] as const;
const roundCentimetres = (value: number) => Math.round(value * 100);

/** Use a surveyed origin, translating before writing the presence packet so it cannot saturate. */
export function createNorthBeltPresenceFrame(origin: Point, limits: RoomLimits) {
  const min = { ...origin };
  const roomLimits = Object.freeze({ ...limits });
  const spans = [limits.width, limits.depth, limits.height];
  const validSpan = (length: number) => Number.isFinite(length) && length >= .01 && length <= maxPoseMetres &&
    Math.abs(length * 100 - roundCentimetres(length)) < 1e-6;
  if (!axes.every((axis, index) => {
    const value = min[axis];
    return validSpan(spans[index]) && Number.isSafeInteger(roundCentimetres(value)) &&
      Number.isSafeInteger(roundCentimetres(value + spans[index]));
  })) throw new RangeError('Invalid north belt presence frame');

  return {
    roomLimits,
    toLocal(pose: Pose): Pose | undefined {
      if (!Number.isFinite(pose.yaw) || !axes.every((axis, index) =>
        Number.isFinite(pose[axis]) && pose[axis] >= min[axis] && pose[axis] <= min[axis] + spans[index])) return;
      return {
        east: roundCentimetres(pose.east - min.east) / 100,
        north: roundCentimetres(pose.north - min.north) / 100,
        height: roundCentimetres(pose.height - min.height) / 100,
        yaw: pose.yaw,
      };
    },
    toWorld(pose: Pose): Pose | undefined {
      if (!Number.isFinite(pose.yaw) || !axes.every((axis, index) =>
        Number.isFinite(pose[axis]) && pose[axis] >= 0 && pose[axis] <= spans[index])) return;
      return { east: pose.east + min.east, north: pose.north + min.north, height: pose.height + min.height, yaw: pose.yaw };
    },
  };
}

export type NorthBeltTransferId = 'railway-north-ridge' | 'cable-foothill';
type Side = 'town' | 'front-ridge';
type SurveyedEndpoint = Readonly<{ anchorId: string; landing: Pose }>;
type SurveyedTransfer = Readonly<{ id: NorthBeltTransferId; endpoints: Readonly<Record<Side, SurveyedEndpoint>> }>;
type SceneHost = Readonly<{
  frame: ReturnType<typeof createNorthBeltPresenceFrame>;
  canStandAt(anchorId: string, landing: Pose): boolean;
}>;

/**
 * Only the host supplies the two surveyed scene anchors for each route. A display name, map
 * marker or trial coordinate cannot create a route. The gate authority still approves departure.
 */
export function createNorthBeltTransferRegistry(hosts: Readonly<Record<Side, SceneHost>>, surveys: readonly SurveyedTransfer[]) {
  function resolveEndpoint(side: Side, endpoint: SurveyedEndpoint) {
    const worldPose = Object.freeze({ ...endpoint.landing });
    const localPose = hosts[side].frame.toLocal(worldPose);
    if (!endpoint.anchorId.trim() || !localPose || !hosts[side].canStandAt(endpoint.anchorId, worldPose)) {
      throw new Error(`Invalid north belt landing for ${side}:${endpoint.anchorId}`);
    }
    return Object.freeze({ side, anchorId: endpoint.anchorId, worldPose, localPose: Object.freeze(localPose) });
  }

  const routes = new Map<NorthBeltTransferId, Record<Side, ReturnType<typeof resolveEndpoint>>>();
  for (const { id, endpoints } of surveys) {
    if ((id !== 'railway-north-ridge' && id !== 'cable-foothill') || routes.has(id)) {
      throw new Error(`Invalid or duplicate north belt route: ${id}`);
    }
    routes.set(id, {
      town: resolveEndpoint('town', endpoints.town),
      'front-ridge': resolveEndpoint('front-ridge', endpoints['front-ridge']),
    });
  }

  return {
    destination(id: NorthBeltTransferId, from: Side) {
      const landing = routes.get(id)?.[from === 'town' ? 'front-ridge' : 'town'];
      if (landing && hosts[landing.side].canStandAt(landing.anchorId, landing.worldPose)) return landing;
    },
  };
}
