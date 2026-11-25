import { Group, type Object3D } from 'three';
import { createTownD2R30CableTowers } from './town-d2-r30-cable-towers';
import { createTownD2R30ChunkLod } from './town-d2-r30-chunk-lod';
import { createTownD2R30CloudTerraceHost } from './town-d2-r30-cloud-terrace-host';
import { createTownD2R30Collision } from './town-d2-r30-collision';
import { sampleTownD2R30Height, townD2R30Spec } from './town-d2-r30-domain';
import { createTownD2R30FacilityFoundations } from './town-d2-r30-facility-foundations';
import { createTownD2R30Massif } from './town-d2-r30-massif';
import { createTownD2R30SledGateSupport } from './town-d2-r30-sled-gate-support';
import { createTownD2R30SnowRockHost } from './town-d2-r30-snow-rock-host';
import { createTownD2R30Strata } from './town-d2-r30-strata';
import { createTownD2R30SummitFacilities } from './town-d2-r30-summit-facilities';
import { createTownD2R30TrailSupport } from './town-d2-r30-trail-support';

/**
 * D2-R01/R04 full main-summit domain, assembled as one mountable entity.
 *
 * The six R30 packages stay single-owner independent modules; this file only
 * composes them and never edits the public viewer/terrain/collision authority.
 * Geometry is local (x=east, y=height, z=-north); the caller places `group`
 * with the world transform from `worldAnchor` (matching main-summit-assembly).
 */
export type TownD2R30AssemblyOptions = Readonly<{
  arrivalHeight?: number;
  /** 'static' builds every 256 m tile once (default); 'streaming' uses runtime LOD chunks. */
  terrainMode?: 'static' | 'streaming';
  /** Include the snow/ridge + low-rock supplement (default true). */
  includeSnowRock?: boolean;
  /** Include the strata + valley glacier band (default true). */
  includeStrata?: boolean;
  /** Include the cloud terrace wall + outer ring + lowland forest (default true). */
  includeCloudTerrace?: boolean;
  /** D2-R02: include cut/fill + pier support for the canonical walkway (default false). */
  includeTrailSupport?: boolean;
  /** D2-R02: include dense terrain-supported towers for the ropeway (default false). */
  includeCableTowers?: boolean;
  /** D2-R03: include facility pedestals where surveyed floors float (default false). */
  includeFacilityFoundations?: boolean;
  /** D2-R03: include solid stands for floating sled gates (default false). */
  includeSledGateSupport?: boolean;
  /** D2-R07: include the summit facility bodies (hut, icefall, props, glide course) (default false). */
  includeSummitFacilities?: boolean;
}>;

export type TownD2R30Assembly = Readonly<{
  group: Group;
  heightAt(east: number, north: number): number | undefined;
  collision: ReturnType<typeof createTownD2R30Collision>;
  /** Advance streaming LOD around a LOCAL observer point; no-op in static mode. */
  update(east: number, north: number): void;
  setNight(value: boolean): void;
  stats(): Readonly<Record<string, unknown>>;
  dispose(): void;
}>;

export function createTownD2R30Assembly(options: TownD2R30AssemblyOptions = {}): TownD2R30Assembly {
  const arrivalHeight = options.arrivalHeight ?? 347;
  const terrainMode = options.terrainMode ?? 'static';
  if (!Number.isFinite(arrivalHeight)) throw new RangeError('Invalid D2-R30 arrival height.');
  if (terrainMode !== 'static' && terrainMode !== 'streaming') {
    throw new RangeError('terrainMode must be "static" or "streaming".');
  }
  const includeSnowRock = options.includeSnowRock ?? true;
  const includeStrata = options.includeStrata ?? true;
  const includeCloudTerrace = options.includeCloudTerrace ?? true;
  const includeTrailSupport = options.includeTrailSupport ?? false;
  const includeCableTowers = options.includeCableTowers ?? false;
  const includeFacilityFoundations = options.includeFacilityFoundations ?? false;
  const includeSledGateSupport = options.includeSledGateSupport ?? false;
  const includeSummitFacilities = options.includeSummitFacilities ?? false;
  if ([includeSnowRock, includeStrata, includeCloudTerrace, includeTrailSupport, includeCableTowers,
    includeFacilityFoundations, includeSledGateSupport, includeSummitFacilities]
    .some(value => typeof value !== 'boolean')) {
    throw new TypeError('D2-R30 inclusion flags must be booleans.');
  }

  const group = new Group();
  group.name = 'town-d2-r30-assembly';
  const disposers: (() => void)[] = [];
  const nightHooks: ((value: boolean) => void)[] = [];
  const children: Group[] = [];

  // One shared height sampler for every sub-package and the collision grid, so
  // visual terrain and the walking surface can never drift apart.
  const heightAt = (east: number, north: number) => sampleTownD2R30Height(east, north, arrivalHeight);

  let terrainStats: () => unknown;
  let updateLod: ((east: number, north: number) => void) | undefined;
  if (terrainMode === 'static') {
    const massif = createTownD2R30Massif({ arrivalHeight });
    terrainStats = () => massif.stats();
    children.push(massif.group);
    disposers.push(() => massif.dispose());
    // The massif tints by a continuous 0..1 blend, while the assembly hooks are
    // boolean; adapt here so the static terrain darkens with every other layer.
    nightHooks.push(value => massif.setNight(Number(value)));
  } else {
    const lod = createTownD2R30ChunkLod({ arrivalHeight });
    terrainStats = () => lod.stats();
    updateLod = lod.update;
    children.push(lod.group);
    disposers.push(() => lod.dispose());
  }

  if (includeStrata) {
    const strata = createTownD2R30Strata({ heightAt, arrivalHeight });
    children.push(strata.group);
    disposers.push(() => strata.dispose());
    nightHooks.push(value => strata.setNight(value));
  }

  if (includeSnowRock) {
    const snowRock = createTownD2R30SnowRockHost({ heightAt, arrivalHeight });
    children.push(snowRock.group);
    disposers.push(() => snowRock.dispose());
    nightHooks.push(value => snowRock.setNight(value));
  }

  if (includeCloudTerrace) {
    const cloud = createTownD2R30CloudTerraceHost({ heightAt, arrivalHeight });
    children.push(cloud.group);
    disposers.push(() => cloud.dispose());
    nightHooks.push(value => cloud.setNight(value));
  }

  if (includeTrailSupport) {
    const support = createTownD2R30TrailSupport({ heightAt, arrivalHeight });
    children.push(support.group);
    disposers.push(() => support.dispose());
    nightHooks.push(value => support.setNight(value));
  }

  if (includeCableTowers) {
    const towers = createTownD2R30CableTowers({ heightAt, arrivalHeight });
    children.push(towers.group);
    disposers.push(() => towers.dispose());
    nightHooks.push(value => towers.setNight(value));
  }

  if (includeFacilityFoundations) {
    const foundations = createTownD2R30FacilityFoundations({ heightAt, arrivalHeight });
    children.push(foundations.group);
    disposers.push(() => foundations.dispose());
    nightHooks.push(value => foundations.setNight(value));
  }

  if (includeSledGateSupport) {
    const sled = createTownD2R30SledGateSupport({ heightAt, arrivalHeight });
    children.push(sled.group);
    disposers.push(() => sled.dispose());
    nightHooks.push(value => sled.setNight(value));
  }

  if (includeSummitFacilities) {
    const facilities = createTownD2R30SummitFacilities({ heightAt, arrivalHeight });
    children.push(facilities.group);
    disposers.push(() => facilities.dispose());
  }

  for (const child of children) group.add(child);

  const measure = (root: Group) => {
    let meshCount = 0;
    let triangleCount = 0;
    root.traverse(object => {
      const mesh = object as Object3D & {
        isMesh?: boolean;
        geometry?: { getIndex(): { count: number } | null; getAttribute(name: string): { count: number } };
        count?: number;
      };
      if (!mesh.isMesh || !mesh.geometry) return;
      meshCount += 1;
      const index = mesh.geometry.getIndex();
      const count = index ? index.count : mesh.geometry.getAttribute('position').count;
      triangleCount += (count / 3) * (mesh.count ?? 1);
    });
    return { meshes: meshCount, triangles: Math.round(triangleCount) };
  };

  const packageSizes = children.map(child => ({ package: child.name, ...measure(child) }));
  const meshes = packageSizes.reduce((sum, size) => sum + size.meshes, 0);
  const triangles = packageSizes.reduce((sum, size) => sum + size.triangles, 0);

  const collision = createTownD2R30Collision({
    heightAt: (east, north) => heightAt(east, north),
  });
  disposers.push(() => collision.dispose());

  group.userData = {
    owner: 'D2-R01/R04',
    coordinateConvention: 'x=east,y=height,z=-north',
    worldAnchor: { ...townD2R30Spec.worldAnchor },
    modifiesHeightAt: false,
    visualOnly: false,
    includesWorldCollision: true,
    collisionSpacing: collision.stats().spacing,
    subPackages: Object.freeze(children.map(child => child.name)),
  };

  let disposed = false;
  let night = false;
  return {
    group,
    heightAt,
    collision,
    update(east: number, north: number) {
      if (disposed) return;
      if (!Number.isFinite(east) || !Number.isFinite(north)) {
        throw new RangeError('D2-R30 LOD observer must be finite.');
      }
      updateLod?.(east, north);
    },
    setNight(value: boolean) {
      if (disposed) throw new Error('The D2-R30 assembly is disposed.');
      if (typeof value !== 'boolean') throw new TypeError('setNight expects a boolean.');
      if (night === value) return;
      night = value;
      for (const hook of nightHooks) hook(value);
      group.userData.night = night;
    },
    stats() {
      return Object.freeze({
        terrainMode,
        arrivalHeight,
        terrain: terrainStats(),
        subPackages: Object.freeze(children.map(child => child.name)),
        budget: Object.freeze({
          meshes,
          draws: meshes,
          triangles,
          packages: Object.freeze(packageSizes.map(size => Object.freeze({ ...size }))),
        }),
        collision: collision.stats(),
        worldAnchor: { ...townD2R30Spec.worldAnchor },
        night,
        disposed,
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (let index = disposers.length - 1; index >= 0; index--) disposers[index]!();
      group.removeFromParent();
      group.clear();
      group.userData.disposed = true;
    },
  };
}
