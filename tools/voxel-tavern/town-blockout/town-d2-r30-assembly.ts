import { Group, type Mesh, type Object3D } from 'three';
import { createMainSummitBlock, mainSummitLayout } from './main-summit-block';
import { createMainSummitTrail, type MainSummitTrailPoint } from './main-summit-trail';
import { createTownD2R30CableTowers } from './town-d2-r30-cable-towers';
import { createTownD2R30ChunkLod } from './town-d2-r30-chunk-lod';
import { createTownD2R30CloudTerraceHost } from './town-d2-r30-cloud-terrace-host';
import { createTownD2R30Collision } from './town-d2-r30-collision';
import { sampleTownD2R30Height, townD2R30Spec } from './town-d2-r30-domain';
import { createTownD2R30FacilityFoundations } from './town-d2-r30-facility-foundations';
import { createTownD2R30Massif } from './town-d2-r30-massif';
import { createTownD2R30NightLights } from './town-d2-r30-night-lights';
import { createTownD2R30NorthWall } from './town-d2-r30-north-wall';
import { createTownD2R30Ropeway } from './town-d2-r30-ropeway';
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
  /** D2-R08: include the summit night lights (trail lamps, window glow) (default false). */
  includeNightLights?: boolean;
  /** D2-R09: include the canonical ropeway, cabins and station buildings (default false). */
  includeRopeway?: boolean;
  /** Epoch used by the canonical ropeway clock when includeRopeway is true. */
  ropewayEpochMs?: number;
  /** D2-R2: include the north-wall via-ferrata, monument, great flag and lookout (default false). */
  includeNorthWall?: boolean;
  /** The already-surveyed accepted walkway. Supplying it avoids re-running the
   * P-1 block survey inside the assembly (one survey per mount, not two). */
  trail?: Readonly<{
    points: readonly MainSummitTrailPoint[];
    metrics: ReturnType<typeof createMainSummitTrail>['metrics'];
  }>;
  /** Mount the coarse ground now and the heavy detail packages later through
   * mountDetails(). The ground, the collision grid and the walking surface are
   * complete either way — only the dressing waits. */
  deferDetails?: boolean;
}>;

export type TownD2R30Assembly = Readonly<{
  group: Group;
  /** Mount pending detail packages (all, or one by name) and report each cost. */
  mountDetails(only?: string): { name: string; ms: number }[];
  pendingDetails(): readonly string[];
  heightAt(east: number, north: number): number | undefined;
  /** Canonical near TOP tiles (identity transform, summit-local frame), so a
   * sector installer can replace their geometry in place. Empty in streaming
   * mode: a floor that streams away cannot host an excavated road. */
  tiles: readonly Mesh[];
  collision: ReturnType<typeof createTownD2R30Collision>;
  ropeway: ReturnType<typeof createTownD2R30Ropeway> | undefined;
  /** North-wall climb + landmark bodies, exposed so the production host can block them. */
  northWall: ReturnType<typeof createTownD2R30NorthWall> | undefined;
  /** Cable tower masts, exposed so the production host can block solid masts. */
  cableTowers: ReturnType<typeof createTownD2R30CableTowers> | undefined;
  /** Advance streaming LOD around a LOCAL observer point; no-op in static mode. */
  update(east: number, north: number, nowMs?: number): void;
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
  const includeNightLights = options.includeNightLights ?? false;
  const includeRopeway = options.includeRopeway ?? false;
  const ropewayEpochMs = options.ropewayEpochMs ?? 0;
  const includeNorthWall = options.includeNorthWall ?? false;
  if ([includeSnowRock, includeStrata, includeCloudTerrace, includeTrailSupport, includeCableTowers,
    includeFacilityFoundations, includeSledGateSupport, includeSummitFacilities, includeNightLights,
    includeRopeway, includeNorthWall]
    .some(value => typeof value !== 'boolean')) {
    throw new TypeError('D2-R30 inclusion flags must be booleans.');
  }

  const group = new Group();
  group.name = 'town-d2-r30-assembly';
  const disposers: (() => void)[] = [];
  const nightHooks: ((value: boolean) => void)[] = [];
  const children: Group[] = [];
  // The night-light package borrows the emissive bodies it lights.
  let nightLightsHost: Group | undefined;

  // One shared height sampler for every sub-package and the collision grid, so
  // visual terrain and the walking surface can never drift apart.
  const heightAt = (east: number, north: number) => sampleTownD2R30Height(east, north, arrivalHeight);

  // Cloud/forest exclusions and night lamps share one canonical P-3 survey.
  // Skip it entirely when neither consumer is mounted, and always release the
  // temporary P-1 block that supplies the surveyed ground.
  let trailPoints: ReturnType<typeof createMainSummitTrail>['points'] | undefined;
  let trailSurveyStats: Readonly<{
    pointCount: number;
    metrics: ReturnType<typeof createMainSummitTrail>['metrics'];
  }> | undefined;
  if (options.trail) {
    // The host already surveys the accepted walkway once; re-surveying it here
    // burned a second 100 m block and a full trail build for the same numbers.
    trailPoints = options.trail.points;
    trailSurveyStats = Object.freeze({
      pointCount: options.trail.points.length,
      metrics: Object.freeze({ ...options.trail.metrics }),
    });
  } else if (includeCloudTerrace || includeNightLights) {
    const block = createMainSummitBlock(mainSummitLayout, arrivalHeight, 100);
    try {
      const trail = createMainSummitTrail(block.heightAt, arrivalHeight);
      trailPoints = trail.points;
      trailSurveyStats = Object.freeze({
        pointCount: trail.points.length,
        metrics: Object.freeze({ ...trail.metrics }),
      });
    } finally {
      block.dispose();
    }
  }

  let terrainStats: () => unknown;
  let tiles: readonly Mesh[] = Object.freeze([]);
  let updateLod: ((east: number, north: number) => void) | undefined;
  let updateRopeway: ((nowMs: number) => void) | undefined;
  let ropeway: ReturnType<typeof createTownD2R30Ropeway> | undefined;
  let northWall: ReturnType<typeof createTownD2R30NorthWall> | undefined;
  let cableTowers: ReturnType<typeof createTownD2R30CableTowers> | undefined;
  if (terrainMode === 'static') {
    const massif = createTownD2R30Massif({ arrivalHeight });
    tiles = massif.tiles;
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

  // ---- detail packages, mountable now or later ------------------------------
  // Each entry is self-contained: it creates its package, adds it to the
  // assembly, registers its disposer and its night hook. Running them all
  // immediately is the old behaviour; `deferDetails` keeps them pending so a
  // caller can paint the mountain first and let the dressing arrive after.
  const pending: { name: string; mount: () => void }[] = [];
  const addDetail = (name: string, mount: () => void) => pending.push({ name, mount });

  if (includeStrata) {
    addDetail('strata', () => {
      const strata = createTownD2R30Strata({ heightAt, arrivalHeight });
      children.push(strata.group);
      disposers.push(() => strata.dispose());
      nightHooks.push(value => strata.setNight(value));
    });
  }

  if (includeSnowRock) {
    addDetail('snow-rock', () => {
      const snowRock = createTownD2R30SnowRockHost({ heightAt, arrivalHeight });
      children.push(snowRock.group);
      disposers.push(() => snowRock.dispose());
      nightHooks.push(value => snowRock.setNight(value));
    });
  }

  if (includeCloudTerrace) {
    addDetail('cloud-terrace', () => {
      const cloud = createTownD2R30CloudTerraceHost({
        heightAt,
        arrivalHeight,
        trailPoints: trailPoints!,
      });
      children.push(cloud.group);
      disposers.push(() => cloud.dispose());
      nightHooks.push(value => cloud.setNight(value));
    });
  }

  if (includeTrailSupport) {
    addDetail('trail-support', () => {
      const support = createTownD2R30TrailSupport({ heightAt, arrivalHeight });
      children.push(support.group);
      disposers.push(() => support.dispose());
      nightHooks.push(value => support.setNight(value));
    });
  }

  if (includeCableTowers) {
    addDetail('cable-towers', () => {
      const towers = createTownD2R30CableTowers({ heightAt, arrivalHeight });
      cableTowers = towers;
      children.push(towers.group);
      disposers.push(() => towers.dispose());
      nightHooks.push(value => towers.setNight(value));
    });
  }

  if (includeFacilityFoundations) {
    addDetail('facility-foundations', () => {
      const foundations = createTownD2R30FacilityFoundations({ heightAt, arrivalHeight });
      children.push(foundations.group);
      disposers.push(() => foundations.dispose());
      nightHooks.push(value => foundations.setNight(value));
    });
  }

  if (includeSledGateSupport) {
    addDetail('sled-gate-support', () => {
      const sled = createTownD2R30SledGateSupport({ heightAt, arrivalHeight });
      children.push(sled.group);
      disposers.push(() => sled.dispose());
      nightHooks.push(value => sled.setNight(value));
    });
  }

  if (includeSummitFacilities) {
    addDetail('summit-facilities', () => {
      const facilities = createTownD2R30SummitFacilities({ heightAt, arrivalHeight });
      children.push(facilities.group);
      disposers.push(() => facilities.dispose());
      // The canonical facility bodies carry no night response of their own,
      // so the R07 package owns the darkening of every lit surface it mounts.
      nightHooks.push(value => facilities.setNight(value));
      nightLightsHost = facilities.group;
    });
  }

  if (includeNightLights) {
    addDetail('night-lights', () => {
      // The lamp chain follows the same canonical walkway survey used by the
      // cloud/forest exclusions, and the lamps stand on the D2-R02 roadbed.
      const lights = createTownD2R30NightLights({
        hostGroup: nightLightsHost,
        trailPoints: trailPoints!,
      });
      children.push(lights.group);
      disposers.push(() => lights.dispose());
      nightHooks.push(value => lights.setNight(value));
    });
  }

  if (includeRopeway) {
    addDetail('ropeway', () => {
      // D2-R09: the rope, the cabins and the station buildings, rebuilt on
      // the R30 massif so the line has a deck to land on.
      const nextRopeway = createTownD2R30Ropeway({ heightAt, arrivalHeight, epochMs: ropewayEpochMs });
      ropeway = nextRopeway;
      children.push(nextRopeway.group);
      disposers.push(() => nextRopeway.dispose());
      nightHooks.push(value => nextRopeway.setNight(value));
      updateRopeway = nowMs => nextRopeway.update(nowMs);
    });
  }

  if (includeNorthWall) {
    addDetail('north-wall', () => {
      // D2-R2: the central-sector climb + four summit landmarks, on the same
      // height field as the massif; canonical hut/icefall/glide are the R07
      // package's job and are deliberately not duplicated here.
      const wall = createTownD2R30NorthWall({ heightAt, arrivalHeight });
      northWall = wall;
      children.push(wall.group);
      disposers.push(() => wall.dispose());
      nightHooks.push(value => wall.setNight(value));
    });
  }

  const deferDetails = options.deferDetails === true;
  const mounted = new Set<string>();
  let night = false;

  /** Mount the pending detail packages (all, or one by name). Returns the real
   * cost of each so a streaming caller can budget a frame. */
  function mountDetails(only?: string): { name: string; ms: number }[] {
    const timings: { name: string; ms: number }[] = [];
    for (const entry of [...pending]) {
      if (only !== undefined && entry.name !== only) continue;
      const index = pending.indexOf(entry);
      if (index >= 0) pending.splice(index, 1);
      const started = performance.now();
      entry.mount();
      timings.push({ name: entry.name, ms: performance.now() - started });
      mounted.add(entry.name);
      // A package that arrives after dusk must not sit at full daylight.
      if (night) {
        const last = nightHooks[nightHooks.length - 1];
        last?.(true);
      }
      group.userData.subPackages = Object.freeze(children.map(child => child.name));
    }
    if (timings.length > 0) {
      for (const child of children) if (child.parent !== group) group.add(child);
      recomputeBudget();
    }
    return timings;
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

  let packageSizes: { package: string; meshes: number; triangles: number }[] = [];
  let meshes = 0, triangles = 0;
  function recomputeBudget() {
    packageSizes = children.map(child => ({ package: child.name, ...measure(child) }));
    meshes = packageSizes.reduce((sum, size) => sum + size.meshes, 0);
    triangles = packageSizes.reduce((sum, size) => sum + size.triangles, 0);
  }

  // Immediate mode mounts every detail package now that the budget helper and
  // the drawing measure exist; deferred mode leaves them in `pending`.
  if (!deferDetails) mountDetails();

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
  return {
    group,
    tiles,
    heightAt,
    collision,
    get ropeway(){return ropeway;},
    get northWall(){return northWall;},
    get cableTowers(){return cableTowers;},
    mountDetails,
    pendingDetails: () => Object.freeze(pending.map(entry => entry.name)),
    update(east: number, north: number, nowMs?: number) {
      if (disposed) return;
      if (!Number.isFinite(east) || !Number.isFinite(north)) {
        throw new RangeError('D2-R30 LOD observer must be finite.');
      }
      updateLod?.(east, north);
      // The ropeway cabins only move when the host supplies a timestamp.
      if (nowMs !== undefined) {
        if (!Number.isFinite(nowMs)) throw new RangeError('D2-R30 ropeway time must be finite.');
        updateRopeway?.(nowMs);
      }
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
      recomputeBudget();
      return Object.freeze({
        terrainMode,
        arrivalHeight,
        terrain: terrainStats(),
        trailSurvey: trailSurveyStats,
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
        pendingDetails: Object.freeze(pending.map(entry => entry.name)),
        mountedDetails: Object.freeze([...mounted]),
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
