import { Group, PointLight, type Object3D } from 'three';
import type { UndergroundSurvivalPoint } from '../../../src/presence/underground-survival';
import {
  createUndergroundRecoveryFirePresentation, type UndergroundRecoveryFireSite,
} from './underground-recovery-fires';

type ScenePosition = readonly [number, number, number];
type FireLightsOptions = Readonly<{
  parent: Object3D;
  sites: readonly UndergroundRecoveryFireSite[];
  toScene(point: UndergroundSurvivalPoint): ScenePosition;
  intensityFor(fireId: string): number;
  emitterHeightFor(fireId: string): number;
}>;
type CurrentFireDomain = Readonly<{
  layer?: string;
  availableLightSlots: number;
  confirmedFireId?: string;
}>;

const lightColors = { warm: '#ffbc77', cold: '#9dd7ef' } as const;

/** Mount registered recovery pools in the host's meter-scaled scene. U-6 owns healing. */
export function mountUndergroundRecoveryFireLights({ parent, sites, toScene, intensityFor, emitterHeightFor }: FireLightsOptions) {
  const projected = new Map<UndergroundSurvivalPoint, ScenePosition>();
  function project(point: UndergroundSurvivalPoint): ScenePosition {
    const previous = projected.get(point);
    if (previous) return previous;
    const position = toScene(point);
    if (position.length !== 3 || !position.every(Number.isFinite)) {
      throw new RangeError('Invalid recovery fire scene position');
    }
    const snapshot = [...position] as const;
    projected.set(point, snapshot);
    return snapshot;
  }

  const placements = sites.map(({ fire, radius, tone }) => {
    const intensity = intensityFor(fire.id);
    if (!Number.isFinite(intensity) || intensity <= 0) {
      throw new RangeError('Invalid recovery fire light intensity: ' + fire.id);
    }
    const emitterHeight = emitterHeightFor(fire.id);
    if (!Number.isFinite(emitterHeight) || emitterHeight <= 0) {
      throw new RangeError('Invalid recovery fire emitter height: ' + fire.id);
    }
    const [x, y, z] = project(fire.point);
    const elevation = y + emitterHeight;
    const cutoff = Math.hypot(radius, emitterHeight);
    if (!Number.isFinite(elevation) || !Number.isFinite(cutoff)) {
      throw new RangeError('Invalid recovery fire light extent: ' + fire.id);
    }
    // The elevated light's spherical cutoff meets the ground at the registered radius.
    return { id: fire.id, layer: fire.point.layer, cutoff, tone, intensity, position: [x, elevation, z] as const };
  });
  const rings = createUndergroundRecoveryFirePresentation(sites, project);
  const ringByName = new Map(rings.group.children.map(ring => [ring.name, ring]));
  const group = new Group();
  group.name = 'underground-recovery-fire-lights';
  group.add(rings.group);

  const sources = placements.map(({ id, layer, cutoff, tone, intensity, position }) => {
    const light = new PointLight(lightColors[tone], intensity, cutoff);
    light.name = 'recovery-fire/' + id + '/light';
    light.position.set(...position);
    light.visible = false;
    group.add(light);
    const ring = ringByName.get('recovery-fire/' + id);
    if (ring) ring.visible = false;
    return { id, layer, light, ring };
  });
  parent.add(group);

  let disposed = false;
  return {
    group,
    fires: rings.fires,
    /** Return active-domain fire IDs that could not fit the host's remaining scene light slots. */
    sync({ layer, availableLightSlots, confirmedFireId }: CurrentFireDomain): string[] {
      if (disposed) return [];
      if (!Number.isSafeInteger(availableLightSlots) || availableLightSlots < 0) {
        throw new RangeError('Invalid recovery fire light budget');
      }
      let spare = availableLightSlots;
      const unlitFireIds: string[] = [];
      for (const source of sources) {
        const current = layer === source.layer;
        source.light.visible = current && spare > 0;
        if (source.ring) source.ring.visible = source.light.visible;
        if (source.light.visible) spare--;
        else if (current) unlitFireIds.push(source.id);
      }
      rings.sync(layer && confirmedFireId ? { layer, fireId: confirmedFireId } : undefined);
      return unlitFireIds;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const { light } of sources) light.dispose();
      rings.dispose();
      group.removeFromParent();
      group.clear();
    },
  };
}
