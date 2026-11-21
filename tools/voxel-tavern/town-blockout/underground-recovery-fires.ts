import { Group, Mesh, MeshBasicMaterial, RingGeometry } from 'three';
import type { UndergroundSurvivalOptions, UndergroundSurvivalPoint } from '../../../src/presence/underground-survival';

type ScenePosition = readonly [x: number, y: number, z: number];
type LocalPoint = Omit<UndergroundSurvivalPoint, 'layer'>;
type CavePad = readonly [east: number, north: number];
type SurvivalFire = UndergroundSurvivalOptions['fires'][number];
type FireTone = 'warm' | 'cold';

type GeometryReferences = Readonly<{
  camp?: { recovery: ScenePosition };
  cave?: { hallFirePad: CavePad; poolFirePad: CavePad; floorAt(east: number, north: number): number | undefined };
  warrior?: { fireReserve: LocalPoint };
  palace?: { fireReserve: LocalPoint };
}>;

/** Read the authored reserves in their original frames. The host supplies world placement and ranges. */
export function readUndergroundRecoveryFireReferences({ camp, cave, warrior, palace }: GeometryReferences = {}) {
  function cavePoint(pad?: CavePad) {
    if (!pad) return;
    const [east, north] = pad;
    const height = cave?.floorAt(east, north);
    if (height !== undefined && Number.isFinite(height)) return { east, north, height };
  }
  return {
    mineCamp: { depth: -90, tone: 'warm', frame: 'mine-local-xyz', position: camp?.recovery },
    crystalHall: { depth: -140, tone: 'warm', frame: 'cave-local-eny', position: cavePoint(cave?.hallFirePad) },
    crystalPool: { depth: -140, tone: 'warm', frame: 'cave-local-eny', position: cavePoint(cave?.poolFirePad) },
    warriorSquare: warrior
      ? { depth: -165, tone: 'cold', frame: 'warrior-local-eny', position: warrior.fireReserve }
      : { depth: -165, tone: 'cold', missing: 'statue-base-fire-reserve' },
    palaceForecourt: { depth: -190, tone: 'warm', frame: 'palace-local-eny', position: palace?.fireReserve },
  } as const;
}

export type UndergroundRecoveryFireSite = Readonly<{
  fire: SurvivalFire;
  radius: number;
  tone: FireTone;
}>;

type ConfirmedFireContact = Readonly<{ fireId: string; layer: string }>;
const ringColors: Record<FireTone, string> = { warm: '#e9a05a', cold: '#9dd7ef' };

/** Display the radius registered by the host. U-6 still decides whether a player receives healing. */
export function createUndergroundRecoveryFirePresentation(
  sites: readonly UndergroundRecoveryFireSite[],
  toScene: (point: UndergroundSurvivalPoint) => ScenePosition,
) {
  const ids = new Set<string>();
  const recoveryLayers = new Set<string>();
  const placements = sites.map(({ fire, radius, tone }) => {
    const { id, point, healPerSecond, recovery } = fire;
    if (!id.trim() || !point.layer.trim() || ids.has(id) || (recovery && recoveryLayers.has(point.layer)) ||
        ![point.east, point.north, point.height, healPerSecond, radius].every(Number.isFinite) ||
        healPerSecond < 0 || radius <= 0 || (tone !== 'warm' && tone !== 'cold')) {
      throw new RangeError('Invalid recovery fire registration: ' + id);
    }
    const position = toScene(point);
    if (!position.every(Number.isFinite)) throw new RangeError('Invalid recovery fire scene position: ' + id);
    ids.add(id);
    if (recovery) recoveryLayers.add(point.layer);
    return { fire: structuredClone(fire), radius, tone, position };
  });

  const group = new Group();
  group.name = 'underground-recovery-fire-rings';
  const geometry = new RingGeometry(.96, 1, 64);
  const rings = placements.map(({ fire, radius, tone, position: [x, y, z] }) => {
    const material = new MeshBasicMaterial({ color: ringColors[tone], transparent: true, opacity: .2, depthWrite: false });
    const mesh = new Mesh(geometry, material);
    mesh.name = 'recovery-fire/' + fire.id;
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y + .02, z);
    mesh.scale.setScalar(radius);
    group.add(mesh);
    return { id: fire.id, layer: fire.point.layer, mesh };
  });
  let disposed = false;
  return {
    group,
    fires: placements.map(({ fire }) => fire),
    sync(contact?: ConfirmedFireContact) {
      if (disposed) return;
      for (const { id, layer, mesh } of rings) {
        mesh.material.opacity = contact?.fireId === id && contact.layer === layer ? .8 : .2;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.clear();
      geometry.dispose();
      for (const { mesh } of rings) mesh.material.dispose();
    },
  };
}
