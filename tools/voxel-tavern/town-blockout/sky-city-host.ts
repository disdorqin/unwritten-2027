import { Group, type Object3D } from 'three';
import type { AircraftPoint, AircraftWorld, createAircraftFlight } from '../../../src/shared/aircraft-flight';
import { createSkyCityLanding } from './sky-city-approach';
import type { SkyCitySite } from './sky-city-site';
import { mountSkyCity, skyCityTier } from './sky-city';

type SkyCityHostView =
  | { kind: 'ground' | 'summit' | 'city' }
  | { kind: 'aircraft'; feet: AircraftPoint };
type Aircraft = ReturnType<typeof createAircraftFlight>;
type AircraftLanding = Pick<NonNullable<ReturnType<Aircraft['snapshot']>>,
  'point' | 'phase' | 'recovery' | 'touchdown'>;

/** The public viewer supplies the surveyed site and the current player domain. */
export function mountSkyCityHost(scene: Object3D, site: SkyCitySite) {
  const frame = new Group();
  frame.name = 'sky-city-site';
  site.place(frame);
  const city = mountSkyCity(frame);
  const landing = createSkyCityLanding(site, {
    islandFloorAt: (x, z) => city.footModel()?.floorAt(x, z),
    islandBlocked: (x, z, y, radius) => city.footModel()?.obstructs(x, z, y, radius) ?? false,
  });
  let kind: SkyCityHostView['kind'] = 'ground';

  function update(view: SkyCityHostView, seconds: number) {
    kind = view.kind;
    const distance = view.kind === 'aircraft'
      ? Math.hypot(view.feet.east - site.origin.east, view.feet.north - site.origin.north)
      : Infinity;
    const tier = skyCityTier(view.kind, distance);
    city.show(tier);
    if (tier === 'hidden') frame.removeFromParent();
    else if (!frame.parent) scene.add(frame);
    city.update(seconds);
  }

  // Planar ground/runway probes don't have enough information to select a stacked island surface.
  const surfaceAt: AircraftWorld['surfaceAt'] = (east, north, _heading, previousHeight) =>
    previousHeight === undefined ? undefined : landing.surfaceAt(east, north, previousHeight);

  function disembark(flight: AircraftLanding) {
    if (kind !== 'aircraft' || flight.phase !== 'landed' || flight.recovery || flight.touchdown !== 'roof') return;
    if (landing.canDisembark(flight.point)) return { ...flight.point };
  }

  function step(feet: AircraftPoint, east: number, north: number) {
    const model = city.footModel();
    if (kind !== 'city' || !model) return;
    const from = site.toLocal(feet);
    const to = site.toLocal({ east, north, height: feet.height });
    const valid = model.step(from, to.x, to.z);
    if (valid) return site.toWorld(valid);
  }

  return { update, surfaceAt, blocked: landing.blocked, disembark, step, tier: city.current,
    dispose() {
      city.dispose();
      frame.removeFromParent();
      kind = 'ground';
    },
  };
}
