import { BoxGeometry, Mesh, MeshLambertMaterial, Ray, Vector3, type Object3D } from 'three';
import type { AircraftPoint } from '../../../src/shared/aircraft-flight';
import {
  createStarportAssembly, starportAssemblyParts,
  type StarportAssemblyPart, type StarportAssemblyResult, type StarportAssemblyState,
} from '../../../src/shared/starport-assembly';
import { buildStarportAssemblyRack } from './starport-assembly-rack';

type Target = StarportAssemblyPart | 'ignition';
type Interaction = StarportAssemblyResult | { kind: 'select-component' };

const visitor = 'starport-flight-review';
const eyeHeight = 1.58;
const maxSight = 4.5;
const aimRadius = .32;

/** Use the reviewed rack and assembly transaction at the flight preview's surveyed site. */
export function mountStarportFlightAssembly(owner: Object3D, anchor: AircraftPoint,
  feet: () => AircraftPoint, layersOverlap: () => boolean) {
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
    ignition: worldPoint({ x: 0, y: 2.04, z: .36 }),
  });
  const floor = (at: AircraftPoint) => ({ ...at, height: anchor.height });
  const hitTargets = ([...starportAssemblyParts, 'ignition'] as const).map(target => {
    const { east, north, height } = targets[target];
    return { target, point: new Vector3(east, height, -north) };
  });
  const sight = new Ray();
  const offset = new Vector3();

  let profile: StarportAssemblyState = { carried: starportAssemblyParts, installed: [], ignited: false, revision: 0 };
  let keyOne = false;
  let lastResult: Interaction['kind'] | 'idle' = 'idle';
  let disposed = false;
  const assembly = createStarportAssembly({
    sockets: {
      'snow-wing': floor(targets['snow-wing']),
      booster: floor(targets.booster),
      'navigation-core': floor(targets['navigation-core']),
    },
    ignitionPoint: floor(targets.ignition),
    reach: 2.12,
  }, {
    read: id => id === visitor && !disposed ? profile : undefined,
    pose: id => id === visitor && !disposed ? feet() : undefined,
    readIgnition: () => ({ keyOne, layersOverlap: layersOverlap() }),
    commit(id, revision, next, guard) {
      if (disposed || id !== visitor || profile.revision !== revision || !guard()) return false;
      profile = next;
      rack.showParts(profile.installed);
      indicatorMaterial.color.set(profile.ignited ? '#a1cc81' : '#b8794f');
      return true;
    },
  });

  function aim(heading: number, pitch: number): Target | null {
    if (disposed || !Number.isFinite(heading) || !Number.isFinite(pitch)) return null;
    const at = feet();
    if (![at.east, at.north, at.height].every(Number.isFinite)) return null;
    const horizontal = Math.cos(pitch);
    sight.origin.set(at.east, at.height + eyeHeight, -at.north);
    sight.direction.set(Math.sin(heading) * horizontal, Math.sin(pitch), -Math.cos(heading) * horizontal);
    let closest = Infinity;
    let selected: Target | null = null;
    for (const { target, point } of hitTargets) {
      offset.subVectors(point, sight.origin);
      if (offset.dot(sight.direction) <= 0 || offset.lengthSq() > maxSight ** 2) continue;
      const miss = sight.distanceSqToPoint(point);
      if (miss > aimRadius ** 2 || miss >= closest) continue;
      closest = miss;
      selected = target;
    }
    return selected;
  }

  return {
    group, aim,
    async interact(heading: number, pitch: number): Promise<Interaction> {
      const target = aim(heading, pitch);
      const result = target === 'ignition' ? await assembly.ignite(visitor)
        : target ? await assembly.place(visitor, target) : { kind: 'select-component' as const };
      lastResult = result.kind;
      return result;
    },
    snapshot() {
      return { profile: { ...profile, carried: [...profile.carried], installed: [...profile.installed] }, keyOne, lastResult, targets };
    },
    grantKeyOne() { if (!disposed) keyOne = true; },
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
