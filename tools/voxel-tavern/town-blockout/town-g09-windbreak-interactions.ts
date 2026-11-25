import type { TownOutdoorWeatherState } from '../../../src/shared/town-outdoor-weather';
import type { WindbreakBuild, WindbreakInteraction } from './town-g09-windbreak-model';

/**
 * R6 candidate controller: action requests, never server-side rewards.
 *
 * This is a gameplay port prepared for A's locked viewer. It does not claim
 * warmth, score, weather or photo effects happened until the host authorizes
 * and executes them. There is no new local weather clock and no DOM listener
 * installed by the model itself.
 */
export type WindbreakVisitor = Readonly<{
  east: number;
  north: number;
  feetHeight: number;
}>;

export type WindbreakActionRequest = Readonly<{
  id: WindbreakInteraction['id'];
  kind: WindbreakInteraction['kind'];
  world: readonly [east: number, north: number, height: number];
  /** For public weather-board text only, not a client-authorized world phase. */
  weather?: TownOutdoorWeatherState;
}>;

export type WindbreakActionHost = Readonly<{
  now: () => number;
  weather: () => TownOutdoorWeatherState | undefined;
  /** Host must validate the player session and authoritative side effects. */
  requestAction(action: WindbreakActionRequest): void;
}>;

function localVisitor(model: WindbreakBuild, visitor: WindbreakVisitor) {
  if (![visitor.east, visitor.north, visitor.feetHeight].every(Number.isFinite)) return;
  const x = visitor.east - model.group.position.x;
  const z = -visitor.north - model.group.position.z;
  const yaw = model.group.rotation.y;
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  return {
    x: x * cos - z * sin,
    z: x * sin + z * cos,
    height: visitor.feetHeight - model.group.position.y,
  };
}

function publicActionWorld(model: WindbreakBuild, at: readonly [number,number,number]) {
  const yaw = model.group.rotation.y;
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  const east = model.group.position.x + at[0] * cos + at[2] * sin;
  const z = model.group.position.z - at[0] * sin + at[2] * cos;
  return [east, -z, model.group.position.y + at[1]] as const;
}

export function createTownWindbreakGameplay(model: WindbreakBuild, host: WindbreakActionHost) {
  const cooldown = new Map<WindbreakInteraction['id'], number>();
  function nearby(visitor: WindbreakVisitor) {
    const local = localVisitor(model, visitor);
    if (!local) return;
    let nearest: { interaction: WindbreakInteraction; distance: number } | undefined;
    for (const interaction of model.interactions) {
      const dx = interaction.at[0] - local.x;
      const dz = interaction.at[2] - local.z;
      const distance = Math.hypot(dx,dz);
      // A player must be on the correct deck; don't interact through a
      // second storey just because the X/Z coordinates are close.
      const height = Math.abs(interaction.at[1] - local.height);
      if (distance > interaction.reach || height > 2.25) continue;
      if (!nearest || distance < nearest.distance) nearest = { interaction, distance };
    }
    return nearest?.interaction;
  }
  return {
    nearby,
    interact(visitor: WindbreakVisitor) {
      const point = nearby(visitor);
      const now = host.now();
      if (!point || !Number.isFinite(now)) return;
      const prev = cooldown.get(point.id) ?? -Infinity;
      if (now - prev < 500) return;
      cooldown.set(point.id, now);
      const weather = point.kind === 'read-weather' ? host.weather() : undefined;
      const action: WindbreakActionRequest = {
        id: point.id,
        kind: point.kind,
        world: publicActionWorld(model, point.at),
        ...(weather && { weather }),
      };
      host.requestAction(action);
      return action;
    },
    dispose() { cooldown.clear(); },
  };
}
