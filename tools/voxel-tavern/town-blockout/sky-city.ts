import { Group, type BufferGeometry, type Material, type Mesh } from 'three';
import { buildSkyCityBuildings } from './sky-city-buildings';
import { buildSkyCityIsland } from './sky-city-island';
import { buildSkyCitySilhouette } from './sky-city-silhouette';
import { buildSkyCityTower } from './sky-city-tower';
import { buildSkyCityTree } from './sky-city-tree';

export type SkyCityTier = 'hidden' | 'silhouette' | 'full';
export type SkyCityFoot = { x: number; y: number; z: number };
export const skyCityNearMetres = 145;
const footRadius = .28;
const stepHeight = .42;

export function skyCityTier(view: 'ground' | 'summit' | 'aircraft' | 'city', distance: number): SkyCityTier {
  if (view === 'ground') return 'hidden';
  if (view === 'city' || (view === 'aircraft' && distance <= skyCityNearMetres)) return 'full';
  return 'silhouette';
}

function buildCity() {
  const group = new Group();
  group.name = 'sky-city-full';
  const island = buildSkyCityIsland();
  const tree = buildSkyCityTree();
  const buildings = buildSkyCityBuildings();
  const tower = buildSkyCityTower();
  group.add(island.group, tree.group, buildings.group, tower.group);

  function obstructs(x: number, z: number, y: number, radius: number) {
    return tree.blocked(x, z, y, radius) || buildings.blocked(x, z, y, radius) || tower.blocked(x, z, y, radius);
  }

  function step(foot: SkyCityFoot, x: number, z: number): SkyCityFoot | undefined {
    if (!island.supports(x, z, footRadius)) return;
    const y = tower.supportAt(x, z, foot.y) ?? 0;
    if (Math.abs(y - foot.y) > stepHeight || obstructs(x, z, y, footRadius)) return;
    return { x, y, z };
  }

  return { group, step, obstructs, floorAt: (x: number, z: number) => island.supports(x, z) ? 0 : undefined,
    dormRoute: buildings.dormRoute, towerRoute: tower.route, gate: tower.gate,
    update(seconds: number) { island.update(seconds); tree.update(seconds); } };
}

function disposeModel(root: Group) {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  root.traverse(object => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    geometries.add(mesh.geometry);
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  root.removeFromParent();
}

export function mountSkyCity(parent: Group) {
  let silhouette: Group | undefined;
  let full: ReturnType<typeof buildCity> | undefined;
  let current: SkyCityTier = 'hidden';
  function show(tier: SkyCityTier) {
    if (tier === current) return;
    silhouette?.removeFromParent();
    full?.group.removeFromParent();
    current = tier;
    if (tier === 'silhouette') {
      silhouette ??= buildSkyCitySilhouette();
      parent.add(silhouette);
    } else if (tier === 'full') {
      full ??= buildCity();
      parent.add(full.group);
    }
  }

  return { show, current: () => current, footModel: () => current === 'full' ? full : undefined,
    update(seconds: number) {
      if (current === 'silhouette' && silhouette) {
        silhouette.position.set(Math.sin(seconds * .1) * 1.15, Math.sin(seconds * .08) * .55, 0);
        silhouette.rotation.y = Math.sin(seconds * .075) * .042;
      } else if (current === 'full') full?.update(seconds);
    },
    dispose() {
      if (silhouette) disposeModel(silhouette);
      if (full) disposeModel(full.group);
      silhouette = full = undefined;
      current = 'hidden';
    },
  };
}
