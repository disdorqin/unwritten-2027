import { Group, Mesh, MeshLambertMaterial } from 'three';
import type { Color } from 'three';
import {
  c2EastCanonicalArrivalHeight, c2EastSectorAreaKm2, createC2EastCanonicalGround,
  inC2EastSector, type C2EastGround, type C2EastGroundStats,
} from './town-night-c2-summit-canonical';
import { mountC2EastLandform } from './town-night-c2-summit-east-landform';
import { mountC2EastCamp } from './town-night-c2-summit-east-camp';
import { mountC2EastVegetation } from './town-night-c2-summit-east-vegetation';
import { mountC2EastSled } from './town-night-c2-summit-east-sled';
import { mountC2EastBench } from './town-night-c2-summit-east-bench';
import { mountC2EastSwitchback } from './town-night-c2-summit-east-switchback';
import { mountC2EastCliffWalkway } from './town-night-c2-summit-east-cliff-walkway';
import { mountC2EastAvalancheChute } from './town-night-c2-summit-east-avalanche-chute';
import { mountC2EastShelter } from './town-night-c2-summit-east-shelter';
import { mountC2EastSummitRock } from './town-night-c2-summit-east-summit-rock';
import { mountC2EastRoadMarkers } from './town-night-c2-summit-east-road-markers';
import { mountC2EastGullyDrop } from './town-night-c2-summit-east-gully-drop';
import { mountC2SummitEastPavilionApproach } from './town-night-c2-summit-east-pavilion-approach';
import { mountC2EastSnowRock } from './town-night-c2-summit-east-snow-rock';
import { mountC2EastSummitEastRockWall } from './town-night-c2-summit-east-rock-wall';

/**
 * C2 east-sector production aggregate (C31-1).
 *
 * One installable/uninstallable group for the whole east sector. D2's summit
 * assembly mounts this, A's ordinary entrance reaches the result through D2,
 * and nothing here invents a second terrain authority: every asset is seated
 * on `ground.heightAt`, which interpolates the canonical rendered 8 m
 * triangles.
 *
 * Contract for consumers:
 * - local frame `(east, height, -north)`, identical to every other C2 module
 * - `supportAt` = canonical ground under the foot, nothing else
 * - `blocked` = union of the fifteen module colliders, fail-closed after dispose
 * - `topAt` = highest standable surface (ground plus climbable decks/floors)
 * - `updateView` / `setNight` are safe to call every frame / every clock tick
 * - `dispose` is idempotent and leaves no residue in any parent
 */

type EastHeightAt = (east: number, north: number) => number | undefined;

type EastPiece = Readonly<{
  east: number; north: number; y: number; h: number; w?: number; d?: number;
}>;

type EastMountHandle = Readonly<{
  group: Group;
  pieces: readonly EastPiece[];
  blocked(east: number, north: number, feet: number, radius?: number, body?: number): boolean;
  dispose(): void;
  updateView?(east: number, north: number): void;
  stats(): Readonly<{ pieces: number; batches: number; lights: number }>;
}>;

type EastMount = (heightAt: EastHeightAt) => EastMountHandle;

export const c2EastProductionModules = Object.freeze([
  { id: 'E01-landform', mount: mountC2EastLandform },
  { id: 'E02-camp', mount: mountC2EastCamp },
  { id: 'E04-vegetation', mount: mountC2EastVegetation },
  { id: 'E05-sled', mount: mountC2EastSled },
  { id: 'E06-bench', mount: mountC2EastBench },
  { id: 'E07-switchback', mount: mountC2EastSwitchback },
  { id: 'E08-cliff-walkway', mount: mountC2EastCliffWalkway },
  { id: 'E09-avalanche-chute', mount: mountC2EastAvalancheChute },
  { id: 'E10-shelter', mount: mountC2EastShelter },
  { id: 'E11-summit-rock', mount: mountC2EastSummitRock },
  { id: 'E12-road-markers', mount: mountC2EastRoadMarkers },
  { id: 'E13-gully-drop', mount: mountC2EastGullyDrop },
  { id: 'E14-pavilion-approach', mount: mountC2SummitEastPavilionApproach },
  { id: 'E16-snow-rock', mount: mountC2EastSnowRock },
  { id: 'E17-rock-wall', mount: mountC2EastSummitEastRockWall },
] as unknown as readonly Readonly<{ id: string; mount: EastMount }>[]);

export type C2EastProductionStats = Readonly<{
  modules: number;
  pieces: number;
  batches: number;
  lights: number;
  sectorAreaKm2: number;
  installed: boolean;
  disposed: boolean;
  ground: C2EastGroundStats;
}>;

export type C2EastProduction = Readonly<{
  /** Root of the east sector, in main-summit local coordinates. */
  group: Group;
  ground: C2EastGround;
  installed(): boolean;
  install(parent: Group): Group;
  uninstall(): void;
  supportAt(east: number, north: number): number | undefined;
  topAt(east: number, north: number): number | undefined;
  blocked(east: number, north: number, feet: number, radius?: number, body?: number): boolean;
  updateView(east: number, north: number): void;
  setNight(night: boolean): void;
  stats(): C2EastProductionStats;
  dispose(): void;
}>;

/** A deck or floor this far above the local ground is still steppable. */
const MAX_STEP_UP = .7;

const NIGHT_TINT = '#8fa2c4';
const NIGHT_EMISSIVE = '#0b1424';
const DAY_TINT = '#ffffff';
const DAY_EMISSIVE = '#000000';

function tint(group: Group, night: boolean, original: Map<Color, string>) {
  group.traverse(child => {
    const mesh = child as Mesh;
    if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!(material instanceof MeshLambertMaterial)) continue;
      if (!original.has(material.color)) original.set(material.color, `#${material.color.getHexString()}`);
      material.color.set(night ? NIGHT_TINT : original.get(material.color)!);
      material.emissive.set(night ? NIGHT_EMISSIVE : DAY_EMISSIVE);
    }
  });
}

export function createC2EastProduction(options: Readonly<{
  heightAt?: EastHeightAt;
  arrivalHeight?: number;
  ground?: C2EastGround;
  moduleIds?: readonly string[];
}> = {}): C2EastProduction {
  const ownsGround = options.ground === undefined;
  const ground: C2EastGround = options.ground ?? createC2EastCanonicalGround({
    arrivalHeight: options.arrivalHeight ?? c2EastCanonicalArrivalHeight,
  });
  const heightAt: EastHeightAt = options.heightAt ?? ground.heightAt;

  const wanted = options.moduleIds ? new Set(options.moduleIds) : undefined;
  const selected = c2EastProductionModules.filter(entry => wanted === undefined || wanted.has(entry.id));
  if (wanted && selected.length !== wanted.size) {
    throw new RangeError('Unknown C2 east production module id.');
  }

  const group = new Group();
  group.name = 'town-night-c2-summit-east-production';
  const mounted: { id: string; handle: EastMountHandle }[] = [];
  const original = new Map<Color, string>();
  let installed = false;
  let disposed = false;
  let night = false;

  try {
    for (const entry of selected) {
      const handle = entry.mount(heightAt);
      handle.group.name = `c2-east-${entry.id}`;
      group.add(handle.group);
      mounted.push({ id: entry.id, handle });
    }
  } catch (error) {
    // Partial install must not leave half a sector behind.
    for (const { handle } of mounted) handle.dispose();
    if (ownsGround) ground.dispose();
    throw error;
  }

  const pieces: EastPiece[] = [];
  for (const { handle } of mounted) pieces.push(...handle.pieces);

  function install(parent: Group) {
    if (disposed) throw new Error('C2 east production is disposed.');
    group.removeFromParent();
    parent.add(group);
    installed = true;
    return group;
  }

  function uninstall() {
    group.removeFromParent();
    installed = false;
  }

  function supportAt(east: number, north: number) {
    if (disposed || !inC2EastSector(east, north)) return;
    return heightAt(east, north);
  }

  /** Highest surface a player can actually stand on: ground, plus decks and
   * floors within one step and clear of any wall or roof above them. */
  function topAt(east: number, north: number) {
    const support = supportAt(east, north);
    if (support === undefined) return;
    let best = support;
    for (const piece of pieces) {
      const top = piece.y + piece.h;
      if (top <= best + 1e-9 || top > support + MAX_STEP_UP) continue;
      const halfWidth = (piece.w ?? 0) / 2, halfDepth = (piece.d ?? 0) / 2;
      if (Math.abs(east - piece.east) > halfWidth + .27 ||
          Math.abs(north - piece.north) > halfDepth + .27) continue;
      if (blocked(east, north, top + 1e-3)) continue;
      best = top;
    }
    return best;
  }

  function blocked(east: number, north: number, feet: number, radius = .27, body = 1.8) {
    // Fail closed once unloaded: an unknown east sector never grants passage.
    if (disposed) return true;
    for (const { handle } of mounted) {
      if (handle.blocked(east, north, feet, radius, body)) return true;
    }
    return false;
  }

  function updateView(east: number, north: number) {
    if (disposed) return;
    for (const { handle } of mounted) handle.updateView?.(east, north);
  }

  function setNight(next: boolean) {
    if (disposed || next === night) return;
    night = next;
    tint(group, night, original);
  }

  function stats(): C2EastProductionStats {
    let batchTotal = 0, lightTotal = 0;
    for (const { handle } of mounted) {
      const moduleStats = handle.stats();
      batchTotal += moduleStats.batches;
      lightTotal += moduleStats.lights;
    }
    return {
      modules: mounted.length,
      pieces: pieces.length,
      batches: batchTotal,
      lights: lightTotal,
      sectorAreaKm2: c2EastSectorAreaKm2,
      installed,
      disposed,
      ground: ground.stats(),
    };
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    uninstall();
    for (const { handle } of mounted) handle.dispose();
    mounted.length = 0;
    pieces.length = 0;
    original.clear();
    if (ownsGround) ground.dispose();
  }

  return {
    group, ground,
    installed: () => installed,
    install, uninstall,
    supportAt, topAt, blocked, updateView, setNight,
    stats, dispose,
  };
}
