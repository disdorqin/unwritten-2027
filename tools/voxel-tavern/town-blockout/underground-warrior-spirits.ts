import {
  BoxGeometry, Color, Group, InstancedMesh, Matrix4, MeshLambertMaterial, Object3D,
} from 'three';

type XYZ = readonly [number, number, number];
export type WarriorSpiritSite = Readonly<{
  id: string;
  /** Feet in the host parent's scene coordinates, with yaw in radians. */
  position: XYZ;
  yaw: number;
}>;

type MountOptions = Readonly<{ parent: Object3D; layer: string; sites: readonly WarriorSpiritSite[] }>;
type Visibility = Readonly<{ layer?: string; soulSightGranted?: boolean }>;
type Part = Readonly<{ position: XYZ; size: XYZ; color: string; tilt?: number }>;

const clothes = [
  { coat: '#535955', trim: '#727569', cap: '#474c48' },
  { coat: '#655848', trim: '#84725b', cap: '#51483d' },
  { coat: '#495460', trim: '#697580', cap: '#3e484f' },
  { coat: '#635652', trim: '#7e6d61', cap: '#524945' },
] as const;

function appearance(id: string) {
  let seed = 2166136261;
  for (const character of id) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619) >>> 0;
  const { coat, trim, cap } = clothes[seed % clothes.length]!;
  const scale = .92 + (seed >>> 8) % 9 * .02;
  const armTilt = (seed >>> 16) % 2 === 0 ? -.1 : -.32;
  const skin = '#847064';
  const parts: readonly Part[] = [
    { position: [-.12, .06, .031], size: [.16, .12, .25], color: '#373c3b' },
    { position: [.12, .06, .031], size: [.16, .12, .25], color: '#373c3b' },
    { position: [-.11, .38, 0], size: [.15, .58, .17], color: '#464846' },
    { position: [.11, .38, 0], size: [.15, .58, .17], color: '#464846' },
    { position: [0, .83, 0], size: [.39, .38, .23], color: coat },
    { position: [0, 1.11, 0], size: [.43, .35, .25], color: coat },
    { position: [0, 1.00, 0], size: [.40, .08, .245], color: trim },
    { position: [0, 1.29, 0], size: [.235, .08, .205], color: trim },
    { position: [0, 1.46, .015], size: [.235, .26, .23], color: skin },
    { position: [0, 1.61, .015], size: [.265, .12, .265], color: cap },
    { position: [-.27, 1.075, .018], size: [.115, .42, .155], color: coat, tilt: -.07 },
    { position: [.27, 1.085, .063], size: [.115, .42, .155], color: coat, tilt: armTilt },
    { position: [-.27, .845, .035], size: [.10, .105, .11], color: skin },
    { position: [.27, .865, .063 - .20 * Math.sin(armTilt)], size: [.10, .105, .11], color: skin },
  ];
  return { parts, scale };
}

/** The host supplies the scene anchors and the viewer's accepted soul-sight flag. */
export function mountUndergroundWarriorSpirits({ parent, layer, sites }: MountOptions) {
  if (!layer.trim()) throw new RangeError('Warrior-city spirits require a registered layer');
  const ids = new Set<string>();
  for (const { id, position, yaw } of sites) {
    if (!id.trim() || ids.has(id) || position.length !== 3 || !position.every(Number.isFinite) || !Number.isFinite(yaw)) {
      throw new RangeError('Warrior-city spirits require distinct finite sites');
    }
    ids.add(id);
  }

  const group = new Group();
  group.name = 'warrior-city-spirits';
  group.visible = false;
  const residents = sites.map(site => ({ site, ...appearance(site.id) }));
  const partCount = residents.reduce((total, { parts }) => total + parts.length, 0);
  const geometry = new BoxGeometry();
  const material = new MeshLambertMaterial();
  const batch = new InstancedMesh(geometry, material, partCount);
  batch.name = 'warrior-city-spirit-figures';
  batch.raycast = () => {};
  if (partCount) {
    const resident = new Object3D();
    const part = new Object3D();
    const matrix = new Matrix4();
    const color = new Color();
    let index = 0;
    for (const { site, parts, scale } of residents) {
      resident.position.set(...site.position);
      resident.rotation.y = site.yaw;
      resident.scale.setScalar(scale);
      resident.updateMatrix();
      for (const piece of parts) {
        part.position.set(...piece.position);
        part.scale.set(...piece.size);
        part.rotation.x = piece.tilt ?? 0;
        part.updateMatrix();
        batch.setMatrixAt(index, matrix.multiplyMatrices(resident.matrix, part.matrix));
        batch.setColorAt(index, color.set(piece.color));
        index++;
      }
    }
    batch.instanceMatrix.needsUpdate = true;
    if (batch.instanceColor) batch.instanceColor.needsUpdate = true;
    batch.computeBoundingSphere();
    group.add(batch);
  }
  parent.add(group);

  let disposed = false;
  return {
    group,
    sync({ layer: currentLayer, soulSightGranted }: Visibility) {
      if (!disposed) group.visible = partCount > 0 && currentLayer === layer && soulSightGranted === true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.visible = false;
      group.removeFromParent();
      group.clear();
      batch.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}
