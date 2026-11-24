import { Group, InstancedMesh, type BufferGeometry, type Material, type Mesh, type Texture } from 'three';
import { buildSkyCityBuildings } from './sky-city-buildings';
import { buildSkyCityDistrict } from './sky-city-district';
import { buildSkyObservatoryHall, skyObservatoryHall } from './sky-city-observatory-hall';
import { buildSkyCityIsland } from './sky-city-island';
import { buildSkyCitySilhouette, updateSkyCitySilhouette } from './sky-city-silhouette';
import type { SkyCityFoot } from './sky-city-site';
import { buildSkyCityTower } from './sky-city-tower';
import { buildSkyCityTree } from './sky-city-tree';

export type SkyCityTier = 'hidden' | 'silhouette' | 'full';
export type { SkyCityFoot } from './sky-city-site';
export const skyCityNearMetres = 145;
export const skyCityPrewarmMetres = 235;
const footRadius = .28;
const stepHeight = .42;

export function skyCityTier(view: 'ground' | 'summit' | 'aircraft' | 'city', distance: number): SkyCityTier {
  if (view === 'ground') return 'hidden';
  if (view === 'city' || (view === 'aircraft' && distance <= skyCityNearMetres)) return 'full';
  return 'silhouette';
}

function* buildCity(group:Group) {
  // Build disjoint canonical components one at a time while still on the
  // silhouette. The partially constructed group is never exposed to walking
  // or rendering; near arrival completes any remaining stages synchronously.
  const island = buildSkyCityIsland();group.add(island.group);yield;
  const tree = buildSkyCityTree();group.add(tree.group);yield;
  const buildings = buildSkyCityBuildings();group.add(buildings.group);yield;
  const tower = buildSkyCityTower();group.add(tower.group);yield;
  const district=buildSkyCityDistrict(island.supports);group.add(district.group);yield;
  const hall=buildSkyObservatoryHall();group.add(hall.group);
  if(!island.supports(skyObservatoryHall.x,skyObservatoryHall.z,Math.hypot(skyObservatoryHall.w/2,skyObservatoryHall.d/2)))throw new Error('Observatory hall must be on the surveyed island');
  // The physical empty city is default. These presentation hooks are only
  // reserved for the future accepted presence-domain event; no UI flag or
  // client-side event can activate dream state in the production host.
  const dreamPresentation = (active:boolean) => {
    tree.setDreamPresentation(active);tower.setDreamPresentation(active);district.setDreamLighting(active);buildings.setDreamLighting(active);hall.setDreamLighting(active);
  };
  dreamPresentation(false);

  function obstructs(x: number, z: number, y: number, radius: number) {
    return island.blocked(x,z,y,radius) || tree.blocked(x, z, y, radius) || buildings.blocked(x, z, y, radius) || tower.blocked(x, z, y, radius) || district.blocked(x,z,y,radius) || hall.blocked(x,z,y,radius);
  }

  function step(foot: SkyCityFoot, x: number, z: number): SkyCityFoot | undefined {
    const distance = Math.hypot(x - foot.x, z - foot.z);
    // Check the path between clear endpoints so a long movement cannot skip a wall or unsupported floor.
    const samples = Math.max(1, Math.ceil(distance / (footRadius / 2)));
    if (!Number.isFinite(samples) || !Number.isFinite(foot.y)) return;
    let y = foot.y;
    for (let index = 1; index <= samples; index++) {
      const fraction = index / samples;
      const sampleX = (1 - fraction) * foot.x + fraction * x;
      const sampleZ = (1 - fraction) * foot.z + fraction * z;
      if (!island.supports(sampleX, sampleZ, footRadius)) return;
      const support = tower.supportAt(sampleX, sampleZ, y) ?? 0;
      if (Math.abs(support - y) > stepHeight || obstructs(sampleX, sampleZ, support, footRadius)) return;
      y = support;
    }
    return { x, y, z };
  }

  return { group, step, obstructs, floorAt: (x: number, z: number) => island.supports(x, z) ? 0 : undefined,
    dormRoute: buildings.dormRoute, towerRoute: tower.route, gate: tower.gate,
    districtPlots:district.accepted, soulAnchors:district.anchors, dreamPresentation,
    update(seconds: number) { island.update(seconds); tree.update(seconds); tower.update(seconds); } };
}

function disposeModel(root: Group) {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const colorMaps = new Set<Texture>();
  root.traverse(object => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    if(mesh instanceof InstancedMesh)mesh.dispose();
    geometries.add(mesh.geometry);
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) {
    const { map } = material as Material & { map?: Texture | null };
    if (map) colorMaps.add(map);
    material.dispose();
  }
  for (const map of colorMaps) map.dispose();
  root.removeFromParent();
}

export function mountSkyCity(parent: Group) {
  let silhouette: Group | undefined;
  type FullModel=ReturnType<typeof buildCity> extends Generator<unknown,infer T,unknown>?T:never;
  let full: FullModel | undefined;
  let pending: ReturnType<typeof buildCity>|undefined;
  let preparedGroup:Group|undefined;
  let current: SkyCityTier = 'hidden';
  function prepare(){
    if(full)return true;
    if(!pending){preparedGroup=new Group();preparedGroup.name='sky-city-full';pending=buildCity(preparedGroup)}
    const result=pending.next();
    if(result.done){full=result.value;pending=undefined;preparedGroup=undefined;}
    return !!full;
  }
  function show(tier: SkyCityTier) {
    if (tier === current) return;
    silhouette?.removeFromParent();
    full?.group.removeFromParent();
    current = tier;
    if (tier === 'silhouette') {
      silhouette ??= buildSkyCitySilhouette();
      parent.add(silhouette);
    } else if (tier === 'full') {
      while(!prepare()){/* complete all remaining components before authority uses the model */}
      parent.add(full!.group);
    }
  }

  return { show, prepare, prepared:()=>!!full, current: () => current, footModel: () => current === 'full' ? full : undefined,
    update(seconds: number) {
      if (current === 'silhouette' && silhouette) updateSkyCitySilhouette(silhouette, seconds);
      else if (current === 'full') full?.update(seconds);
    },
    dispose() {
      if (silhouette) disposeModel(silhouette);
      if (full) disposeModel(full.group);
      if(preparedGroup)disposeModel(preparedGroup);
      pending?.return(undefined as never);pending=undefined;preparedGroup=undefined;
      silhouette = full = undefined;
      current = 'hidden';
    },
  };
}
