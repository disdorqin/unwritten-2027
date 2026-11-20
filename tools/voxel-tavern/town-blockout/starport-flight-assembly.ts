import type { Object3D } from 'three';
import type { AircraftPoint } from '../../../src/shared/aircraft-flight';
import { createStarportAssembly, starportAssemblyParts,
  type StarportAssemblyResult, type StarportAssemblyState } from '../../../src/shared/starport-assembly';
import { mountStarportAssemblySite } from './starport-assembly-site';

type Interaction = StarportAssemblyResult | { kind: 'select-component' };
const visitor = 'starport-flight-review';
const eyeHeight = 1.58;

/** The review page supplies its own visitor inventory and key to the shared assembly transaction. */
export function mountStarportFlightAssembly(owner: Object3D, anchor: AircraftPoint,
  feet: () => AircraftPoint, layersOverlap: () => boolean) {
  const model = mountStarportAssemblySite(owner, anchor);
  let profile: StarportAssemblyState = { carried: starportAssemblyParts, installed: [], ignited: false, revision: 0 };
  let keyOne = false;
  let lastResult: Interaction['kind'] | 'idle' = 'idle';
  let disposed = false;
  const assembly = createStarportAssembly(model.site, {
    read: id => id === visitor && !disposed ? profile : undefined,
    pose: id => id === visitor && !disposed ? feet() : undefined,
    readIgnition: () => ({ keyOne, layersOverlap: layersOverlap() }),
    commit(id, revision, next, guard) {
      if (disposed || id !== visitor || profile.revision !== revision || !guard()) return false;
      profile = next;
      model.show(profile);
      return true;
    },
  });
  function aim(heading: number, pitch: number) {
    if (disposed || !Number.isFinite(heading) || !Number.isFinite(pitch)) return null;
    return model.aim(feet(), heading, pitch, eyeHeight);
  }

  return {
    group: model.group, aim,
    async interact(heading: number, pitch: number): Promise<Interaction> {
      const target = aim(heading, pitch);
      const result = target === 'ignition' ? await assembly.ignite(visitor)
        : target ? await assembly.place(visitor, target) : { kind: 'select-component' as const };
      lastResult = result.kind;
      return result;
    },
    snapshot() {
      return { profile: { ...profile, carried: [...profile.carried], installed: [...profile.installed] },
        keyOne, lastResult, targets: model.targets };
    },
    grantKeyOne() { if (!disposed) keyOne = true; },
    dispose() {
      if (disposed) return;
      disposed = true;
      model.dispose();
    },
  };
}
