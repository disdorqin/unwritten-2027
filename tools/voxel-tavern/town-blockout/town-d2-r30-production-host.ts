import { Box3, Group, type BufferGeometry, type Mesh } from 'three';
import { createMainSummitBlock, mainSummitLayout } from './main-summit-block';
import { createMainSummitTrail, type MainSummitTrailPoint } from './main-summit-trail';
import { createTownD2R30Assembly, type TownD2R30Assembly } from './town-d2-r30-assembly';
import type { TownD2R30Collision } from './town-d2-r30-collision';
import { sampleTownD2R30Height } from './town-d2-r30-domain';
import { townD2SectorAt, townD2SectorContract } from './town-d2-r30-sector-audit';

/**
 * D2's real production host for the 3.1 four-sector summit (D31-1).
 *
 * D2 owns the one canonical height field, the one cached cut-face collision
 * grid and the one terrain mount. A, B and C2 each hand over an *installer*
 * that mounts their own sector bodies into this host; the host never builds a
 * second mountain, a second ground mesh or a second road.
 *
 * Contract for an installer (see `TownD2SectorInstaller`): it receives the
 * host port, adds its own group to `port.owner`, may replace the geometry of
 * the canonical near tiles it excavates, and returns a package with optional
 * ground/support/block/update/night hooks plus `dispose()` that restores every
 * tile it replaced. Anything else — new terrain meshes, a parallel height
 * function, a fixture stand-in — is rejected: `installSouth`/`installWest`
 * below consume the owning windows' own production mounts by exact
 * dependency SHA, and the host re-checks their result.
 */

export type TownD2SectorKey = 'A' | 'B' | 'C2';

export type TownD2SectorHostPort = Readonly<{
  /** The one owner group. A sector adds its group here and nowhere else. */
  owner: Group;
  /** Canonical collision grid, built once from the canonical sampler. */
  collision: TownD2R30Collision;
  /** Canonical height field (no excavation). */
  heightAt(east: number, north: number): number | undefined;
  /** Live walking surface: canonical terrain plus every installed cut. */
  groundAt(east: number, north: number): number | undefined;
  /** Canonical near TOP tiles, identity transform, summit-local frame. */
  tiles: readonly Mesh[];
  /** The accepted P-3 walkway survey the sectors align their roads to. */
  trail: readonly MainSummitTrailPoint[];
  arrivalHeight: number;
  sectorAt(east: number, north: number): 'A' | 'B' | 'C2' | 'D2' | 'overlap';
}>;

export type TownD2SectorPackage = Readonly<{
  sector: TownD2SectorKey;
  group: Group;
  /** Ground after this sector's excavation; undefined outside its own area. */
  groundAt?(east: number, north: number): number | undefined;
  /** Exact excavation coverage, when the sector publishes one (A31/1c1822b5).
   * Inside coverage the cut face IS the ground, even when it sits below the
   * original raster: taking a max would restore an invisible uncut layer. */
  coversCut?(east: number, north: number): boolean;
  /** The cut face inside `coversCut`; undefined there means a hole. */
  cutGroundAt?(east: number, north: number): number | undefined;
  /** Standable deck above the ground (road tread), without the ground fallback. */
  deckAt?(east: number, north: number): number | undefined;
  supportAt?(east: number, north: number, radius?: number): number | undefined;
  blocked?(east: number, north: number, height: number, radius?: number, bodyHeight?: number): boolean;
  updateView?(east: number, north: number): void;
  setNight?(night: boolean): void;
  updateSnow?(...args: unknown[]): void;
  dispose(): void;
}>;

export type TownD2SectorInstaller = (port: TownD2SectorHostPort) => TownD2SectorPackage;

/** The one cable line authority. B owns the towers, the rope, the stations,
 * the repair order and the ride controller; D2 only carries the slot. A line
 * may only be boarded when its installer declares itself certified — an
 * uncertified candidate is refused and the line stays closed. */
export type TownD2CablePackage = Readonly<{
  /** True only when the owner has certified station support, deck clearance
   * and the external obstruction sweep for this exact build. */
  certified: boolean;
  group: Group;
  /** Ride boarding is gated on this; a closed line must leave it false. */
  boardable: boolean;
  stations?: readonly unknown[];
  supportAt?(east: number, north: number, radius?: number): number | undefined;
  blocked?(east: number, north: number, height: number, radius?: number, bodyHeight?: number): boolean;
  update?(nowMs: number): void;
  setNight?(night: boolean): void;
  dispose(): void;
}>;

export type TownD2CableInstaller = (port: TownD2SectorHostPort) => TownD2CablePackage;

export type TownD2SectorSettlement = Readonly<{
  sector: TownD2SectorKey;
  node: string;
  meshes: number;
  triangles: number;
  cutTiles: number;
  insideSector: boolean;
  bounds: Readonly<{ west: number; east: number; south: number; north: number }>;
}>;

export type TownD2ProductionHostOptions = Readonly<{
  arrivalHeight?: number;
  /** Passed to the D2 assembly's ropeway clock when that preview line is on. */
  epochMs?: number;
  /** D2's own ropeway. Off in production: B is the single cable authority, and
   * a second line or a second clock is explicitly forbidden by the 3.1 order. */
  includeRopeway?: boolean;
}>;

const world = townD2SectorContract.world;
export const townD2SectorBounds = Object.freeze({
  A: Object.freeze({ west: world.west, east: world.east, south: world.south, north: world.splitNorth }),
  B: Object.freeze({ west: world.west, east: -world.splitEast, south: world.splitNorth, north: world.north }),
  C2: Object.freeze({ west: world.splitEast, east: world.east, south: world.splitNorth, north: world.north }),
  D2: Object.freeze({ west: -world.splitEast, east: world.splitEast, south: world.splitNorth, north: world.north }),
});

/** A sector body may reach into the shared 32 m band, never past it. */
const SECTOR_TOLERANCE = world.overlapWidth;

export function createTownD2R30ProductionHost(options: TownD2ProductionHostOptions = {}) {
  const arrivalHeight = options.arrivalHeight ?? 347;
  const epochMs = options.epochMs ?? 0;
  const includeRopeway = options.includeRopeway ?? false;
  if (!Number.isFinite(arrivalHeight)) throw new RangeError('Invalid production host arrival height.');
  if (typeof includeRopeway !== 'boolean') throw new TypeError('includeRopeway must be a boolean.');

  const group = new Group();
  group.name = 'town-d2-r30-production';
  const assembly: TownD2R30Assembly = createTownD2R30Assembly({
    arrivalHeight,
    // Static tiles only: an excavated road needs a floor that stays resident.
    terrainMode: 'static',
    includeTrailSupport: true,
    includeCableTowers: false, // B owns the single tower batch
    includeFacilityFoundations: true,
    includeSledGateSupport: true,
    includeSummitFacilities: true,
    includeNightLights: true,
    includeRopeway,
    includeNorthWall: true,
    ropewayEpochMs: epochMs,
  });
  group.add(assembly.group);

  const collision = assembly.collision;
  const tiles = assembly.tiles;
  if (tiles.length === 0) {
    assembly.dispose();
    throw new Error('The production host needs canonical near tiles; streaming terrain cannot host sectors.');
  }

  // The accepted P-3 walkway survey, sampled exactly the way the assembly and
  // A's accepted production test sample it.
  const survey = createMainSummitBlock(mainSummitLayout, arrivalHeight, 100);
  let trail: readonly MainSummitTrailPoint[];
  try {
    trail = createMainSummitTrail(survey.heightAt, arrivalHeight).points;
  } finally {
    survey.dispose();
  }

  // Snapshot the untouched canonical geometry so an uninstall can be proven
  // complete instead of asserted.
  const originals = new Map<Mesh, BufferGeometry>();
  for (const tile of tiles) originals.set(tile, tile.geometry as BufferGeometry);

  const installed = new Map<TownD2SectorKey, TownD2SectorPackage>();
  const failures = new Map<TownD2SectorKey, string>();
  const nightHooks: ((value: boolean) => void)[] = [];
  let night = false;
  let disposed = false;

  const heightAt = (east: number, north: number) => sampleTownD2R30Height(east, north, arrivalHeight);

  /** A sector may only speak for its own quadrant (plus the shared 32 m seam).
   * Without this, a neighbour's ground fallback leaks into another sector's
   * surface — that is exactly how B's canonical ground put 1.762 m of phantom
   * support under A's road. */
  function ownsPoint(sector: TownD2SectorKey, east: number, north: number) {
    const own = townD2SectorBounds[sector];
    return east >= own.west - SECTOR_TOLERANCE && east <= own.east + SECTOR_TOLERANCE &&
      north >= own.south - SECTOR_TOLERANCE && north <= own.north + SECTOR_TOLERANCE;
  }

  /** The one final ground authority, resident for the whole session.
   *
   * Inside a published cut, the excavated face IS the ground — never the max
   * of the cut and the original raster (that resurrects an invisible uncut
   * collision layer and put 204 of 832 southern road samples up to 1.762 m
   * high). A hole inside coverage fails closed instead of falling back.
   * Outside cuts the sector's own ground is authoritative where it has one. */
  function surfaceAt(east: number, north: number) {
    if (disposed) return;
    let height = collision.surfaceAt(east, north);
    for (const pkg of installed.values()) {
      if (!ownsPoint(pkg.sector, east, north)) continue;
      if (pkg.coversCut) {
        if (!pkg.coversCut(east, north)) continue;
        return pkg.cutGroundAt ? pkg.cutGroundAt(east, north) : undefined;
      }
      const ground = pkg.groundAt?.(east, north);
      if (ground !== undefined) height = ground;
    }
    return height;
  }

  function supportAt(east: number, north: number, radius = .27) {
    if (disposed) return;
    let height = surfaceAt(east, north);
    for (const pkg of installed.values()) {
      if (!ownsPoint(pkg.sector, east, north)) continue;
      // Prefer the published deck (A31/1c1822b5). A package's own support may
      // carry a ground fallback; the ground is this host's job, not a second
      // opinion, so the deck is what may raise the feet.
      const deck = pkg.deckAt ? pkg.deckAt(east, north) : pkg.supportAt?.(east, north, radius);
      if (deck === undefined) continue;
      height = height === undefined ? deck : Math.max(height, deck);
    }
    return height;
  }

  function blocked(east: number, north: number, height: number, radius = .27, bodyHeight = 1.8) {
    if (disposed) return true;
    for (const pkg of installed.values()) {
      if (pkg.blocked?.(east, north, height, radius, bodyHeight)) return true;
    }
    return false;
  }

  /** The ground an installer may see: canonical terrain plus the sectors that
   * were already installed, snapshotted so a package's own `groundAt` can never
   * call back into the composed host surface (that would recurse forever). */
  function groundBefore(prior: readonly TownD2SectorPackage[]) {
    return (east: number, north: number) => {
      let height = collision.surfaceAt(east, north);
      for (const pkg of prior) {
        const cut = pkg.groundAt?.(east, north);
        if (cut === undefined) continue;
        height = height === undefined ? cut : Math.max(height, cut);
      }
      return height;
    };
  }

  function createPort(prior: readonly TownD2SectorPackage[]): TownD2SectorHostPort {
    return Object.freeze({
      owner: group,
      collision,
      heightAt,
      groundAt: groundBefore(prior),
      tiles,
      trail,
      arrivalHeight,
      sectorAt: townD2SectorAt,
    });
  }

  function measure(root: Group) {
    let meshes = 0, triangles = 0;
    root.traverse(object => {
      const candidate = object as {
        isMesh?: boolean;
        geometry?: { getIndex(): { count: number } | null; getAttribute(name: string): { count: number } };
        count?: number;
      };
      if (!candidate.isMesh || !candidate.geometry) return;
      meshes += 1;
      const index = candidate.geometry.getIndex();
      const count = index ? index.count : candidate.geometry.getAttribute('position').count;
      triangles += (count / 3) * (candidate.count ?? 1);
    });
    return { meshes, triangles: Math.round(triangles) };
  }

  function packageBounds(pkg: TownD2SectorPackage) {
    pkg.group.updateMatrixWorld(true);
    const box = new Box3().setFromObject(pkg.group);
    if (box.isEmpty()) throw new Error(`Sector ${pkg.sector} mounts no geometry.`);
    // Local frame is x=east, y=height, z=-north.
    return {
      west: box.min.x, east: box.max.x,
      south: -box.max.z, north: -box.min.z,
    };
  }

  function assertLanded(sector: TownD2SectorKey, pkg: TownD2SectorPackage) {
    if (pkg.sector !== sector) throw new Error(`Installer returned sector ${pkg.sector} for a ${sector} slot.`);
    if (!pkg.group || pkg.group.parent !== group) throw new Error('Sector group was not mounted into the host owner.');
    const name = pkg.group.name;
    if (!name) throw new Error('Sector group has no name; duplicate exclusion cannot be checked.');
    let occurrences = 0;
    group.traverse(object => { if (object.name === name) occurrences += 1; });
    if (occurrences !== 1) throw new Error(`Sector ${sector} appears ${occurrences} times under one owner.`);
    const bounds = packageBounds(pkg);
    const own = townD2SectorBounds[sector];
    const inside = bounds.west >= own.west - SECTOR_TOLERANCE && bounds.east <= own.east + SECTOR_TOLERANCE &&
      bounds.south >= own.south - SECTOR_TOLERANCE && bounds.north <= own.north + SECTOR_TOLERANCE;
    if (!inside) {
      pkg.group.removeFromParent();
      throw new Error(`Sector ${sector} body leaves its own sector: ${JSON.stringify(bounds)}`);
    }
    return { bounds, inside };
  }

  function settle(sector: TownD2SectorKey, pkg: TownD2SectorPackage): TownD2SectorSettlement {
    const landed = assertLanded(sector, pkg);
    const size = measure(pkg.group);
    return Object.freeze({
      sector,
      node: pkg.group.name,
      meshes: size.meshes,
      triangles: size.triangles,
      cutTiles: tiles.filter(tile => originals.get(tile) !== tile.geometry).length,
      insideSector: landed.inside,
      bounds: Object.freeze(landed.bounds),
    });
  }

  function install(sector: TownD2SectorKey, installer: TownD2SectorInstaller): TownD2SectorSettlement {
    if (disposed) throw new Error('The production host is disposed.');
    if (installed.has(sector)) throw new Error(`Sector ${sector} is already installed.`);
    if (typeof installer !== 'function') throw new TypeError('A sector installer must be a function.');
    const before = group.children.length;
    const prior = Object.freeze([...installed.values()]);
    // Snapshot what THIS install starts from — including the cuts the already
    // installed sectors made. Rolling back to the pristine originals would
    // silently undo A's and B's excavation when C2 fails.
    const tileSnapshot = new Map<Mesh, BufferGeometry>();
    for (const tile of tiles) tileSnapshot.set(tile, tile.geometry as BufferGeometry);
    let pkg: TownD2SectorPackage | undefined;
    try {
      pkg = installer(createPort(prior));
      const settlement = settle(sector, pkg);
      installed.set(sector, pkg);
      failures.delete(sector);
      return settlement;
    } catch (error) {
      try { pkg?.dispose(); } catch { /* the original failure is the one to report */ }
      // Roll back exactly this install: detach what it added and restore the
      // geometry that was live before it ran, leaving other sectors untouched.
      for (const child of [...group.children].slice(before)) child.removeFromParent();
      for (const tile of tiles) {
        const snapshot = tileSnapshot.get(tile);
        if (snapshot !== undefined && tile.geometry !== snapshot) tile.geometry = snapshot;
      }
      failures.set(sector, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  function uninstall(sector: TownD2SectorKey) {
    if (disposed) throw new Error('The production host is disposed.');
    const pkg = installed.get(sector);
    if (!pkg) throw new Error(`Sector ${sector} is not installed.`);
    installed.delete(sector);
    const node = pkg.group.name;
    pkg.dispose();
    // A package that forgets to detach its own group is a defect: detach it
    // here and let the residue check below say so.
    for (const child of [...group.children]) if (child.name === node) child.removeFromParent();
    const residue = tiles.filter(tile => tile.geometry !== originals.get(tile)).length;
    return Object.freeze({ sector, node, cutTilesRestored: residue === 0, residue });
  }

  let cable: TownD2CablePackage | undefined;
  let cableRefusal: string | undefined;

  /** Install the single cable line. An uncertified package is refused and the
   * line stays closed: the host never marks an unverified ride as boardable. */
  function installCable(installer: TownD2CableInstaller) {
    if (disposed) throw new Error('The production host is disposed.');
    if (cable) throw new Error('A cable line is already installed.');
    if (typeof installer !== 'function') throw new TypeError('A cable installer must be a function.');
    const before = group.children.length;
    const tileSnapshot = new Map<Mesh, BufferGeometry>();
    for (const tile of tiles) tileSnapshot.set(tile, tile.geometry as BufferGeometry);
    let pkg: TownD2CablePackage | undefined;
    try {
      pkg = installer(createPort(Object.freeze([...installed.values()])));
      if (pkg.certified !== true) throw new Error('Cable line is not certified; it stays closed.');
      if (!pkg.group || pkg.group.parent !== group) throw new Error('Cable line was not mounted into the host owner.');
      if (pkg.boardable !== true) throw new Error('Cable line is installed but not boardable.');
      cable = pkg;
      cableRefusal = undefined;
      return Object.freeze({ installed: true as const, certified: true, group: pkg.group.name });
    } catch (error) {
      try { pkg?.dispose(); } catch { /* report the refusal, not the cleanup */ }
      for (const child of [...group.children].slice(before)) child.removeFromParent();
      for (const tile of tiles) {
        const snapshot = tileSnapshot.get(tile);
        if (snapshot !== undefined && tile.geometry !== snapshot) tile.geometry = snapshot;
      }
      cable = undefined;
      cableRefusal = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  /** What A may consume: a closed line reports installed:false and boardable:false. */
  function cableState() {
    return Object.freeze({
      installed: cable !== undefined,
      boardable: cable?.boardable === true && cable?.certified === true,
      certified: cable?.certified === true,
      refusal: cableRefusal,
    });
  }

  /** Per-sector live check on the mounted host: real support and collision over
   * each quadrant, not a report about geometry that might be installed later.
   * A sector that is not installed reports `installed: false` and keeps the
   * whole verdict false — the host never claims four sectors when three are in. */
  function sectorLiveCheck(step = 64) {
    if (!Number.isFinite(step) || step < 8) throw new RangeError('Invalid sector check spacing.');
    const keys = ['A', 'B', 'C2', 'D2'] as const;
    const sectors = keys.map(key => {
      const bounds = townD2SectorBounds[key];
      const mounted = key === 'D2' || installed.has(key);
      let samples = 0, unsupported = 0, floatingDeck = 0, blockedSamples = 0;
      if (mounted) {
        for (let north = bounds.south + step; north < bounds.north; north += step) {
          for (let east = bounds.west + step; east < bounds.east; east += step) {
            if (townD2SectorAt(east, north) === 'overlap') continue;
            samples++;
            const ground = surfaceAt(east, north);
            const support = supportAt(east, north);
            if (ground === undefined || support === undefined) {
              unsupported++;
              continue;
            }
            if (support < ground - 1e-6) floatingDeck++;
            if (blocked(east, north, support)) blockedSamples++;
          }
        }
      }
      return Object.freeze({
        sector: key,
        installed: mounted,
        samples,
        unsupported,
        floatingDeck,
        blockedSamples,
      });
    });
    const ready = sectors.every(sector => sector.installed && sector.samples > 0 &&
      sector.unsupported === 0 && sector.floatingDeck === 0);
    return Object.freeze({ version: 'd2-host-live-1.0', step, sectors: Object.freeze(sectors), ready });
  }

  function stats() {
    // Duplicate exclusion is about sector ROOTS under one owner: repeated
    // instance names inside a sector body (rack uprights, ring rails) are the
    // sector's own business.
    const roots = new Map<string, number>();
    for (const child of group.children) {
      if (!child.name) continue;
      roots.set(child.name, (roots.get(child.name) ?? 0) + 1);
    }
    const duplicates = [...roots.entries()].filter(([, count]) => count > 1).map(([name]) => name);
    return Object.freeze({
      owner: group.name,
      arrivalHeight,
      installed: Object.freeze([...installed.keys()]),
      failures: Object.freeze(Object.fromEntries(failures)),
      sectors: Object.freeze([...installed.values()].map(pkg => Object.freeze({
        sector: pkg.sector,
        node: pkg.group.name,
        ...measure(pkg.group),
      }))),
      duplicates: Object.freeze(duplicates),
      tiles: Object.freeze({
        count: tiles.length,
        cut: tiles.filter(tile => originals.get(tile) !== tile.geometry).length,
      }),
      assembly: assembly.stats(),
      night,
      disposed,
    });
  }

  let disposedOnce = false;
  return {
    group,
    assembly,
    collision,
    tiles,
    trail,
    port: createPort(Object.freeze([])),
    createPort,
    sectorLiveCheck,
    installCable,
    cableState,
    install,
    uninstall,
    installed: () => Object.freeze([...installed.keys()]),
    package: (sector: TownD2SectorKey) => installed.get(sector),
    heightAt,
    surfaceAt,
    supportAt,
    blocked,
    update(east: number, north: number, nowMs?: number) {
      if (disposed) return;
      if (!Number.isFinite(east) || !Number.isFinite(north)) {
        throw new RangeError('The production host observer must be finite.');
      }
      assembly.update(east, north, nowMs);
      for (const pkg of installed.values()) pkg.updateView?.(east, north);
    },
    setNight(value: boolean) {
      if (disposed) throw new Error('The production host is disposed.');
      if (typeof value !== 'boolean') throw new TypeError('setNight expects a boolean.');
      if (night === value) return;
      night = value;
      assembly.setNight(value);
      for (const pkg of installed.values()) pkg.setNight?.(value);
      for (const hook of nightHooks) hook(value);
    },
    updateSnow(...args: unknown[]) {
      if (disposed) return;
      for (const pkg of installed.values()) pkg.updateSnow?.(...args);
    },
    stats,
    dispose() {
      if (disposedOnce) return;
      disposedOnce = true;
      disposed = true;
      // Sectors own their cut geometry: release them before the terrain.
      for (const sector of [...installed.keys()]) {
        const pkg = installed.get(sector)!;
        installed.delete(sector);
        try { pkg.dispose(); } catch { /* keep disposing the rest */ }
      }
      for (const child of [...group.children]) if (child !== assembly.group) child.removeFromParent();
      assembly.dispose();
      group.removeFromParent();
      group.clear();
      nightHooks.length = 0;
    },
  };
}
