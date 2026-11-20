import { BoxGeometry, Mesh, MeshLambertMaterial, Ray, Vector3, type Object3D } from 'three';
import type { AircraftPoint } from '../../../src/shared/aircraft-flight';
import {
  createFittedStarportAssemblySite, fittedStarportAssemblyLayout, starportAssemblyParts,
  type StarportAssemblyPart, type StarportAssemblyState,
} from '../../../src/shared/starport-assembly';
import { buildStarportAssemblyRack } from './starport-assembly-rack';

type Target = StarportAssemblyPart | 'ignition';
const targetNames = [...starportAssemblyParts, 'ignition'] as const;
const sightRadius = .32;
const sightDistance = 4.5;

/** World-aligned bounds for the fitted rack, with sockets facing south (+Z). */
export function starportAssemblyEnvelopeAt(anchor: AircraftPoint) {
  // The protruding booster is the south edge, .973 m from the rack origin.
  return { ...anchor, north: anchor.north - .235, width: 6.06, depth: 1.48, tall: 2.19 };
}

/** The host owns accepted feet, inventory and the ignition state; this mounts their display and targeting. */
export function mountStarportAssemblySite(owner: Object3D, anchor: AircraftPoint) {
  const rack = buildStarportAssemblyRack();
  const { group } = rack;
  group.position.set(anchor.east, anchor.height, -anchor.north);
  owner.add(group);

  const panelGeometry = new BoxGeometry();
  const panelMaterial = new MeshLambertMaterial({ color: '#414e4d' });
  const indicatorMaterial = new MeshLambertMaterial({ color: '#b8794f' });
  const panel = new Mesh(panelGeometry, panelMaterial);
  panel.name = 'starport-ignition-panel';
  panel.position.set(0, 2.04, .29);
  panel.scale.set(.56, .29, .19);
  const indicator = new Mesh(panelGeometry, indicatorMaterial);
  indicator.name = 'starport-ignition-indicator';
  indicator.position.set(0, 2.04, .4);
  indicator.scale.set(.23, .075, .025);
  group.add(panel, indicator);

  const worldPoint = ({ x, y, z }: Readonly<{ x: number; y: number; z: number }>) => Object.freeze({
    east: anchor.east + x, north: anchor.north - z, height: anchor.height + y,
  });
  const targets = Object.freeze({
    'snow-wing': worldPoint(rack.sockets['snow-wing']),
    booster: worldPoint(rack.sockets.booster),
    'navigation-core': worldPoint(rack.sockets['navigation-core']),
    ignition: worldPoint(fittedStarportAssemblyLayout.ignition),
  });
  const site = createFittedStarportAssemblySite(anchor);
  const hitTargets = targetNames.map(target => {
    const { east, north, height } = targets[target];
    return { target, point: new Vector3(east, height, -north) };
  });
  const sight = new Ray();
  const offset = new Vector3();
  const envelope = starportAssemblyEnvelopeAt(anchor);
  let disposed = false;

  function aim(feet: AircraftPoint | undefined, heading: number, pitch: number, eyeHeight: number): Target | null {
    if (disposed || !feet || ![feet.east, feet.north, feet.height, heading, pitch, eyeHeight].every(Number.isFinite)) return null;
    const horizontal = Math.cos(pitch);
    sight.origin.set(feet.east, feet.height + eyeHeight, -feet.north);
    sight.direction.set(Math.sin(heading) * horizontal, Math.sin(pitch), -Math.cos(heading) * horizontal);
    let closest = Infinity;
    let selected: Target | null = null;
    for (const { target, point } of hitTargets) {
      offset.subVectors(point, sight.origin);
      if (!site.approachable(feet, targets[target]) || offset.dot(sight.direction) <= 0 || offset.lengthSq() > sightDistance ** 2) continue;
      const miss = sight.distanceSqToPoint(point);
      if (miss > sightRadius ** 2 || miss >= closest) continue;
      closest = miss;
      selected = target;
    }
    return selected;
  }

  return {
    group, site, targets, aim,
    blocked(feet: AircraftPoint, radius: number, bodyHeight: number) {
      if (disposed || feet.height + bodyHeight - .025 <= envelope.height ||
          feet.height + .025 >= envelope.height + envelope.tall) return false;
      const east = Math.max(Math.abs(feet.east - envelope.east) - envelope.width / 2, 0);
      const north = Math.max(Math.abs(feet.north - envelope.north) - envelope.depth / 2, 0);
      return Math.hypot(east, north) < radius;
    },
    show(state: Pick<StarportAssemblyState, 'installed' | 'ignited'>) {
      if (disposed) return;
      rack.showParts(state.installed);
      indicatorMaterial.color.set(state.ignited ? '#a1cc81' : '#b8794f');
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      rack.dispose();
      panelGeometry.dispose();
      panelMaterial.dispose();
      indicatorMaterial.dispose();
    },
  };
}
