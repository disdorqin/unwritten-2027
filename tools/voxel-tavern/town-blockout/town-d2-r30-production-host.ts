import type {A32CanonicalWire} from './town-a32-canonical-wire';
import { Box3, Group, Vector3, type BufferGeometry, type Mesh } from 'three';
import { createMainSummitBlock, mainSummitLayout } from './main-summit-block';
import { createMainSummitTrail, type MainSummitTrailPoint } from './main-summit-trail';
import { createTownD2R30Assembly, type TownD2R30Assembly } from './town-d2-r30-assembly';
import type { TownD2R30Collision } from './town-d2-r30-collision';
import { sampleTownD2R30Height, sampleTownD2R30Normal, townD2R30CanonicalSpacing } from './town-d2-r30-domain';
import { mainSummitBounds } from './main-summit-block';
import { townD2SectorAt, townD2SectorContract } from './town-d2-r30-sector-audit';
import { createTownD2R30CableTowers } from './town-d2-r30-cable-towers';
import { createTownD2R30Ropeway } from './town-d2-r30-ropeway';
import { mainSummitR30CableWorkshopAnchor, mountMainSummitCableWorkshop } from './main-summit-cable-workshop';
import { mountNightBPublicRearCableAsync } from './town-night-b-public-rear-cable';
import {nightBRearCableAccessSteps} from './town-night-b-rear-cable-access';
import type {NightBAuditSliceOptions} from './town-night-b-audit-slices';
import { createTownD2R30SummitPlay, type TownD2R30SummitPlay } from './town-d2-r30-summit-play';
import { certifyRoadJoint, surveyRoadConnector } from './town-d2-r30-road-joint';
import { c2EastRoadHandoffs } from './town-night-c2-summit-road-handoff';

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

/** A foot in the summit-local frame (east, north, height). */
export type CableFoot = Readonly<{ east: number; north: number; height: number }>;

/** What A hands in: its presence authority for line 2 (see
 * town-night-b-production-controller / nightBProductionAuthority). D2 never
 * invents a clock, a repair state or a daylight source. */
export type TownD2CableAuthority = Readonly<{
  state: () => unknown;
  now: () => number | undefined;
  daylight: () => boolean | undefined;
  firstRun?: unknown;
}>;

/** B's actual upper operation, consumed whole — not a registration record. */
export type TownD2CableOperation = Readonly<{
  ready: boolean;
  reason?: string;
  service?: { physical?: boolean };
  ropeway?: { group: Group };
  workshop?: { group: Group };
  update?(): void;
  dispose(): void;
}>;

/** The bodies D2 mounts for the line and must release again. */
type TownD2CableRig = Readonly<{
  ropeway: ReturnType<typeof createTownD2R30Ropeway>;
  towers: ReturnType<typeof createTownD2R30CableTowers>;
  workshop: ReturnType<typeof mountMainSummitCableWorkshop>;
}>;

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
  /** Mount the coarse ground now and the heavy dressing later through
   * mountDetails(). Ground, collision and the walking surface are complete
   * immediately either way — only the detail packages wait. */
  deferDetails?: boolean;
  preparedCanonical?:A32CanonicalWire;
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
  const deferDetails = options.deferDetails === true;
  if (!Number.isFinite(arrivalHeight)) throw new RangeError('Invalid production host arrival height.');
  if (typeof includeRopeway !== 'boolean') throw new TypeError('includeRopeway must be a boolean.');

  const group = new Group();
  group.name = 'town-d2-r30-production';
  // One survey for the whole mount: the host owns the accepted walkway and the
  // assembly consumes it instead of surveying the same ground again.
  const prepared=options.preparedCanonical;
  if(prepared&&prepared.arrivalHeight!==arrivalHeight)throw Error('Prepared canonical arrival height changed');
  let trail: readonly MainSummitTrailPoint[];
  let surveyMetrics: ReturnType<typeof createMainSummitTrail>['metrics'];
  if(prepared){trail=prepared.trail.points;surveyMetrics=Object.freeze({...prepared.trail.metrics});}
  else{
    const survey=createMainSummitBlock(mainSummitLayout,arrivalHeight,100);
    try{const built=createMainSummitTrail(survey.heightAt,arrivalHeight);trail=built.points;surveyMetrics=Object.freeze({...built.metrics});}
    finally{survey.dispose();}
  }

  const assembly: TownD2R30Assembly = createTownD2R30Assembly({
    arrivalHeight,
    // Static tiles only: an excavated road needs a floor that stays resident.
    terrainMode: 'static',
    includeTrailSupport: true,
    includeCableTowers: false, // B owns the single tower batch
    includeFacilityFoundations: true,
    includeSledGateSupport: true,
    includeSummitFacilities: true,
    includeLegacyMachineRoom:includeRopeway,
    includeNightLights: true,
    includeRopeway,
    includeNorthWall: true,
    ropewayEpochMs: epochMs,
    trail: { points: trail, metrics: surveyMetrics },
    deferDetails,preparedMassif:prepared?.massif,preparedCollision:prepared?.heights,
  });
  group.add(assembly.group);

  const collision = assembly.collision;
  const tiles = assembly.tiles;
  if (tiles.length === 0) {
    assembly.dispose();
    throw new Error('The production host needs canonical near tiles; streaming terrain cannot host sectors.');
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
  type CentralBox={min:number[];max:number[]};
  let registrationBoxes:readonly CentralBox[]=[];
  const refreshRegistrationBoxes=()=>{registrationBoxes=(assembly.group.getObjectByName('main-summit-hut-and-registration')?.userData.colliders??[]) as readonly CentralBox[];};
  refreshRegistrationBoxes();

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
    // The line is part of the walking surface: station decks you board from and
    // the workshop floor you repair on are real support, not decoration.
    const cableDeck=cablePackage?.supportAt(east,north,radius);
    if(cableDeck!==undefined)height=height===undefined?cableDeck:Math.max(height,cableDeck);
    return height;
  }

  function blocked(east: number, north: number, height: number, radius = .27, bodyHeight = 1.8) {
    if (disposed) return true;
    for (const pkg of installed.values()) {
      const b=townD2SectorBounds[pkg.sector],margin=SECTOR_TOLERANCE+radius+2;
      // The installer already rejects every body outside these sector bounds.
      // A conservative sector broad-phase avoids scanning unrelated obstacles.
      if(east<b.west-margin||east>b.east+margin||north<b.south-margin||north>b.north+margin)continue;
      if (pkg.blocked?.(east, north, height, radius, bodyHeight)) return true;
    }
    // Real bodies on the line: tower masts, station walls, cabin docks and the
    // workshop walls all block a walking player, not just the cable audit.
    if(assembly.northWall?.blocked(east,north,height,radius,bodyHeight))return true;
    if(east>=48&&east<=71&&north>=996&&north<=1021&&registrationBoxes.some(b=>height+.025<b.max[1]!&&height+bodyHeight-.025>b.min[1]!&&Math.hypot(Math.max(b.min[0]!-east,east-b.max[0]!,0),Math.max(b.min[2]!+north,-north-b.max[2]!,0))<radius))return true;
    return cablePackage?.blocked(east,north,height,radius,bodyHeight)===true;
  }

  /** The ground an installer may see: canonical terrain plus the sectors that
   * were already installed, snapshotted so a package's own `groundAt` can never
   * call back into the composed host surface (that would recurse forever). */
  function groundBefore(prior: readonly TownD2SectorPackage[]) {
    return (east: number, north: number) => {
      let height = collision.surfaceAt(east, north);
      for (const pkg of prior) {
        if(!ownsPoint(pkg.sector,east,north))continue;
        if(pkg.coversCut){if(pkg.coversCut(east,north))return pkg.cutGroundAt?.(east,north);continue;}
        const cut = pkg.groundAt?.(east, north);
        if (cut !== undefined) height=cut;
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

  let sectorInstalling=false;
  function beginInstall(sector:TownD2SectorKey){
    if(sectorInstalling)throw Error('Sector installation already pending');
    if (disposed) throw new Error('The production host is disposed.');
    if(cableInstalling||cablePackage)throw Error('Remove the certified cable before modifying sector geometry');
    if (installed.has(sector)) throw new Error(`Sector ${sector} is already installed.`);
    const before = group.children.length;
    const prior = Object.freeze([...installed.values()]);
    // Snapshot what THIS install starts from — including the cuts the already
    // installed sectors made. Rolling back to the pristine originals would
    // silently undo A's and B's excavation when C2 fails.
    const tileSnapshot = new Map<Mesh, BufferGeometry>();
    for (const tile of tiles) tileSnapshot.set(tile, tile.geometry as BufferGeometry);
    sectorInstalling=true;
    function commit(pkg:TownD2SectorPackage){
      if(disposed)throw Error('Sector owner disposed during installation');
      const settlement = settle(sector, pkg);
      installed.set(sector, pkg);
      pkg.setNight?.(night);
      collectSleepers();
      if (detailFocus) setDetailFocus(detailFocus.east, detailFocus.north);
      failures.delete(sector);
      return settlement;
    }
    function rollback(error:unknown,pkg?:TownD2SectorPackage):never{
      installed.delete(sector);
      try { pkg?.dispose(); } catch { /* the original failure is the one to report */ }
      // Roll back exactly this install: detach what it added and restore the
      // geometry that was live before it ran, leaving other sectors untouched.
      for (const child of [...group.children].slice(before)) child.removeFromParent();
      if(!disposed)for (const tile of tiles) {
        const snapshot = tileSnapshot.get(tile);
        if (snapshot !== undefined && tile.geometry !== snapshot) tile.geometry = snapshot;
      }
      failures.set(sector, error instanceof Error ? error.message : String(error));
      throw error;
    }
    return {port:createPort(prior),commit,rollback,finish(){sectorInstalling=false;}};
  }
  function install(sector: TownD2SectorKey, installer: TownD2SectorInstaller): TownD2SectorSettlement {
    if(typeof installer!=='function')throw TypeError('A sector installer must be a function.');
    const tx=beginInstall(sector);let pkg:TownD2SectorPackage|undefined;
    try{pkg=installer(tx.port);return tx.commit(pkg);}catch(error){return tx.rollback(error,pkg);}finally{tx.finish();}
  }
  /** The public staging host is detached until this transaction commits. */
  async function installAsync(sector:TownD2SectorKey,installer:(port:TownD2SectorHostPort,valid:()=>boolean)=>Promise<TownD2SectorPackage>){
    const tx=beginInstall(sector);let pkg:TownD2SectorPackage|undefined;
    try{pkg=await installer(tx.port,()=>!disposed);return tx.commit(pkg);}catch(error){return tx.rollback(error,pkg);}finally{tx.finish();}
  }

  function uninstall(sector: TownD2SectorKey) {
    if(sectorInstalling)throw Error('Sector installation already pending');
    if (disposed) throw new Error('The production host is disposed.');
    if(cableInstalling||cablePackage)throw Error('Remove the certified cable before modifying sector geometry');
    const pkg = installed.get(sector);
    if (!pkg) throw new Error(`Sector ${sector} is not installed.`);
    installed.delete(sector);
    const node = pkg.group.name;
    pkg.dispose();
    // A package that forgets to detach its own group is a defect: detach it
    // here and let the residue check below say so.
    for (const child of [...group.children]) if (child.name === node) child.removeFromParent();
    collectSleepers();
    const residue = tiles.filter(tile => tile.geometry !== originals.get(tile)).length;
    return Object.freeze({ sector, node, cutTilesRestored: residue === 0, residue });
  }

  // ---- front/rear airlock (D32-2) ------------------------------------------
  // The seam contract is published in WORLD metres (the front room's frame):
  // the same foot must be standable on both sides of N666.5..669 at H347.
  // D2 does not delete a railing to "open" the mountain — it measures the real
  // crossing and refuses while a mounted body still blocks it.
  const SEAM_CROSSING_WORLD = Object.freeze({
    // The corridor runs from the N663.25 railing line to the N669 seam: the
    // whole passage, not just the contract band, so the report can say where a
    // body actually closes it. The railing itself is a real physical object and
    // is never deleted to "open" the way.
    west: 298.75, east: 301.25, railingNorth: 663.25, south: 662.5, frontNorth: 666.5, north: 669,
    floor: 347, tolerance: .45,
  });
  const anchor = townD2SectorContract.worldAnchor;

  function certifySeamCrossing() {
    const recorded: { east: number; north: number; support: number | undefined; blocked: boolean }[] = [];
    let unsupported = 0, obstructed = 0, worst = 0, samples = 0;
    let contractUnsupported = 0, contractObstructed = 0, contractSamples = 0;
    const rows: { north: number; unsupported: number; obstructed: number }[] = [];
    for (let north = SEAM_CROSSING_WORLD.south; north <= SEAM_CROSSING_WORLD.north + 1e-9; north += .5) {
      let rowUnsupported = 0, rowObstructed = 0;
      for (let east=SEAM_CROSSING_WORLD.west;east<=SEAM_CROSSING_WORLD.east+1e-9;east+=.25) {
        // World -> summit-local (x=east, z=-north, anchor at E300/N676).
        const localEast = east - anchor.east;
        const localNorth = north - anchor.north;
        samples++;
        const support = supportAt(localEast, localNorth);
        const blockedAt = support === undefined ? true : blocked(localEast, localNorth, support);
        const inContract = north >= SEAM_CROSSING_WORLD.south - 1e-9 &&
          north >= 666.5;
        if (inContract) contractSamples++;
        if (support === undefined) { unsupported++; rowUnsupported++; if (inContract) contractUnsupported++; }
        else if (inContract) worst = Math.max(worst, Math.abs(support - SEAM_CROSSING_WORLD.floor));
        if (blockedAt) { obstructed++; rowObstructed++; if (inContract) contractObstructed++; }
        if (blockedAt && recorded.length < 24) {
          recorded.push({ east, north, support, blocked: blockedAt });
        }
      }
      if (rowUnsupported > 0 || rowObstructed > 0) {
        rows.push({ north, unsupported: rowUnsupported, obstructed: rowObstructed });
      }
    }
    return Object.freeze({
      version: 'd2-seam-crossing-1.0',
      contract: SEAM_CROSSING_WORLD,
      frame: 'world; local = world - (300, 676)',
      samples,
      unsupported,
      obstructed,
      maxFloorDrift: worst,
      /** Open only when every sample stands on the published floor and no
       * mounted body blocks it — the N663.25 railing included. */
      /** The contract band (N666.5..669) is what D2 owns; it is open only when
       * every sample there stands on the floor and nothing blocks it. */
      open: contractUnsupported === 0 && contractObstructed === 0 &&
        worst <= SEAM_CROSSING_WORLD.tolerance,
      band: Object.freeze({
        samples: contractSamples, unsupported: contractUnsupported, obstructed: contractObstructed,
      }),
      /** Metres between the railing line and the first row D2 has ground on:
       * that strip belongs to the front owner's terrain, not to this domain. */
      frontStripMetres: Math.max(0, (rows.find(row => row.north >= 662.5 && row.unsupported === 0)?.north ??
        SEAM_CROSSING_WORLD.north) - SEAM_CROSSING_WORLD.railingNorth),
      blockedSamples: Object.freeze(recorded),
      /** Every north row that closes the corridor, so the owner of the body is
       * obvious instead of the whole passage reading "blocked". */
      closedRows: Object.freeze(rows),
    });
  }

  // ---- same-source snow depth (D32-2) --------------------------------------
  // The original design's ladder: the high mountain carries 4-5 tiers, the
  // wind-scoured summit cap only 1-2. Everything here samples the one canonical
  // height field, so snow cannot disagree with the ground under it, and the
  // front terrace is F's authority handed in by A — never a second clock or a
  // locally generated weather.
  const SNOW_TIERS = 5;
  /** Width of the seam band where the rear ladder may not out-jump the front. */
  const SNOW_SEAM_BAND = 96;
  let frontSnow: ((east: number, north: number) => number | undefined) | undefined;

  const clampTier = (value: number) => Math.max(0, Math.min(SNOW_TIERS, Math.round(value)));

  function snowTierAt(east: number, north: number) {
    if (disposed) return;
    if (!Number.isFinite(east) || !Number.isFinite(north)) return;
    const height = sampleTownD2R30Height(east, north, arrivalHeight);
    if (height === undefined) return;
    const slope = 1 - sampleTownD2R30Normal(east, north, arrivalHeight)[1];
    let tier: number;
    if (height >= 770) tier = slope >= .45 ? 1 : 2;          // wind-scoured cap
    else if (height >= 610) tier = slope < .45 ? 5 : 4;
    else if (height >= 500) tier = slope < .5 ? 4 : 3;
    else if (height >= 350) tier = slope < .45 ? 3 : 2;
    else if (height >= 245) tier = slope < .4 ? 2 : 1;
    else tier = slope < .4 ? 1 : 0;
    // The town-side terrace is the weather authority's business. Across the
    // shared seam the step may never exceed one tier, so a blizzard on one
    // side cannot meet bare ground on the other.
    const seam = townD2SectorContract.world.splitNorth;
    if (frontSnow && Math.abs(north - seam) <= SNOW_SEAM_BAND) {
      const reported = frontSnow(east, north);
      if (typeof reported === 'number' && Number.isFinite(reported)) {
        const frontier = clampTier(reported * SNOW_TIERS);
        tier = Math.max(frontier - 1, Math.min(frontier + 1, tier));
      }
    }
    return tier;
  }

  /** Normalized depth 0..1 for the summit/trail host. Same source as the raw
   * tier list; undefined only outside the canonical domain. */
  function snowAt(east: number, north: number) {
    const tier = snowTierAt(east, north);
    return tier === undefined ? undefined : tier / SNOW_TIERS;
  }

  /** A hands in F's weather authority (front terrace depth 0..1). */
  function setFrontSnow(next: ((east: number, north: number) => number | undefined) | undefined) {
    if (next !== undefined && typeof next !== 'function') throw new TypeError('setFrontSnow expects a sampler or undefined.');
    frontSnow = next;
  }

  // ---- coarse resident, detail sleeps (D32-2) ------------------------------
  // The canonical massif stays mounted forever: it is the ground the player
  // walks on and the silhouette the far view sees. Heavy detail bodies (the
  // summit facilities, north wall, cloud terrace, each sector's own dressing
  // and the cable line) only render while the view is actually near them.
  // Sleeping is a render decision only — support, collision and domain logic
  // never depend on it, so a sleeping sector is still solid.
  const DETAIL_RADIUS = 620;
  let detailFocus: { east: number; north: number } | undefined;
  const sleepers: { name: string; object: { visible: boolean }; west:number;east:number;south:number;north:number }[] = [];

  function collectSleepers() {
    sleepers.length = 0;
    group.updateWorldMatrix(true,true);
    const origin=group.getWorldPosition(new Vector3());
    const candidates=[...group.children.filter(child=>child!==assembly.group),...assembly.group.children.filter(child=>!/(massif|chunk|lod|-skirt|floor)/.test(child.name))];
    for(const child of candidates){
      const box=new Box3().setFromObject(child);
      if(box.isEmpty())continue;
      sleepers.push({name:child.name,object:child,west:box.min.x-origin.x,east:box.max.x-origin.x,south:origin.z-box.max.z,north:origin.z-box.min.z});
    }
  }

  /** Focus the detail layer on the player's actual position. Returns how many
   * bodies are awake so a caller can assert the switch really happened. */
  function setDetailFocus(east: number, north: number, radius = DETAIL_RADIUS) {
    if (disposed) return 0;
    if (!Number.isFinite(east) || !Number.isFinite(north) || !Number.isFinite(radius) || radius <= 0) {
      throw new RangeError('Detail focus needs a finite position and a positive radius.');
    }
    detailFocus = { east, north };
    if (sleepers.length === 0) collectSleepers();
    let awake = 0;
    for (const sleeper of sleepers) {
      const distance = Math.hypot(Math.max(sleeper.west-east,east-sleeper.east,0),Math.max(sleeper.south-north,north-sleeper.north,0));
      // The line and the sectors carry their own large bounds; a hard radius
      // keeps a distant dressing layer out of the frame entirely.
      const visible = distance <= radius;
      sleeper.object.visible = visible;
      if (visible) awake++;
    }
    return awake;
  }

  /** D32-2: a full-domain hole scan. The visible massif, the collision grid and
   * the canonical sampler must agree everywhere inside the bounds — a hole is
   * "地形空洞" and must be a number, not a hope. */
  function terrainIntegrity(step = townD2R30CanonicalSpacing) {
    if (!Number.isFinite(step) || step < 4) throw new RangeError('Invalid terrain integrity spacing.');
    let samples = 0, noCanonical = 0, noCollision = 0, worstCollisionDrift = 0;
    for (let north = mainSummitBounds.south; north <= mainSummitBounds.north; north += step) {
      for (let east = mainSummitBounds.west; east <= mainSummitBounds.east; east += step) {
        samples++;
        const canonical = heightAt(east, north);
        const surface = collision.surfaceAt(east, north);
        if (canonical === undefined) noCanonical++;
        if (surface === undefined) noCollision++;
        else if (canonical !== undefined) {
          worstCollisionDrift = Math.max(worstCollisionDrift, Math.abs(surface - canonical));
        }
      }
    }
    return Object.freeze({
      version: 'd2-terrain-integrity-1.0',
      step, samples, noCanonical, noCollision, worstCollisionDrift,
      /** Mid-cell collision interpolation is expected; a hole is not. */
      intact: noCanonical === 0 && noCollision === 0,
    });
  }

  // ---- same-source wind resistance (D32-2) ---------------------------------
  // The movement system needs a wind load per metre of ground, not a second
  // weather generator. Exposure comes from the same canonical height and slope
  // as the snow: high and steep is exposed, high and sheltered in a gully is
  // not, and across the shared seam it is clamped against F's authority so the
  // player does not hit a wall of wind at the gate.
  let frontWind: ((east: number, north: number) => number | undefined) | undefined;
  const WIND_SEAM_BAND = 96;

  function windAt(east: number, north: number) {
    if (disposed) return;
    if (!Number.isFinite(east) || !Number.isFinite(north)) return;
    const height = sampleTownD2R30Height(east, north, arrivalHeight);
    if (height === undefined) return;
    const normal = sampleTownD2R30Normal(east, north, arrivalHeight);
    const slope = 1 - normal[1];
    // Altitude load, then slope exposure, then a lee reduction for faces that
    // turn away from the prevailing wind (the same +east bias the summit art
    // uses for windward shading).
    const altitude = Math.max(0, Math.min(1, (height - 260) / 520));
    const exposure = Math.max(0, Math.min(1, (slope - .06) / .5));
    const lee = Math.max(0, Math.min(1, (.18 - normal[0]) / .36));
    const wind = Math.max(0, Math.min(1, altitude * .55 + exposure * .3 + altitude * lee * .15));
    const seam = townD2SectorContract.world.splitNorth;
    if (frontWind && Math.abs(north - seam) <= WIND_SEAM_BAND) {
      const reported = frontWind(east, north);
      if (typeof reported === 'number' && Number.isFinite(reported)) {
        // Never more than one step of wind across the seam.
        const scaled = Math.max(0, Math.min(1, reported));
        return Math.max(scaled - .2, Math.min(scaled + .2, wind));
      }
    }
    return wind;
  }

  /** A hands in F's front-terrace wind authority (0..1). */
  function setFrontWind(next: ((east: number, north: number) => number | undefined) | undefined) {
    if (next !== undefined && typeof next !== 'function') throw new TypeError('setFrontWind expects a sampler or undefined.');
    frontWind = next;
  }

  // ---- front/rear airlock (D32-2) ------------------------------------------
  // A real two-way transition, not a teleport: the front foot must sit in the
  // certified corridor, the rear foot must land on real supported ground, and
  // the crossing itself must be open. Anything else fails closed and says why.
  type AirlockState = 'front' | 'rear';
  let airlock: AirlockState = 'front';

  function enterRear(fromFront: CableFoot) {
    if (disposed) throw new Error('The production host is disposed.');
    if (airlock === 'rear') return Object.freeze({ ok: false as const, reason: 'already-rear' as const });
    const crossing = certifySeamCrossing();
    if (!crossing.open) {
      return Object.freeze({ ok: false as const, reason: 'crossing-closed' as const, crossing });
    }
    const inCorridor = fromFront.east >= SEAM_CROSSING_WORLD.west &&
      fromFront.east <= SEAM_CROSSING_WORLD.east &&
      fromFront.north >= SEAM_CROSSING_WORLD.railingNorth - 1 &&
      fromFront.north <= SEAM_CROSSING_WORLD.north + 1 &&
      Math.abs(fromFront.height - SEAM_CROSSING_WORLD.floor) <= 1;
    if (!inCorridor) return Object.freeze({ ok: false as const, reason: 'outside-corridor' as const });
    const localEast = fromFront.east - anchor.east;
    const localNorth = fromFront.north - anchor.north;
    const support = supportAt(localEast, localNorth);
    if (support === undefined) return Object.freeze({ ok: false as const, reason: 'no-rear-ground' as const });
    if (blocked(localEast, localNorth, support)) {
      return Object.freeze({ ok: false as const, reason: 'rear-blocked' as const });
    }
    airlock = 'rear';
    return Object.freeze({
      ok: true as const,
      domain: 'summit' as const,
      local: Object.freeze({ east: localEast, north: localNorth, height: support }),
    });
  }

  function exitRear() {
    if (disposed) throw new Error('The production host is disposed.');
    if (airlock !== 'rear') return Object.freeze({ ok: false as const, reason: 'not-rear' as const });
    const crossing = certifySeamCrossing();
    if (!crossing.open) {
      return Object.freeze({ ok: false as const, reason: 'crossing-closed' as const, crossing });
    }
    airlock = 'front';
    return Object.freeze({
      ok: true as const,
      domain: 'mountain' as const,
      // The published seam foot, in world metres, is where the front room
      // takes over; D2 never moves the player itself.
      world: Object.freeze({
        east: anchor.east, north: SEAM_CROSSING_WORLD.frontNorth,
        height: SEAM_CROSSING_WORLD.floor,
      }),
    });
  }

  // ---- the original summit play, bound to the real bodies (D32-P1) ---------
  let play: TownD2R30SummitPlay | undefined;

  /** One play binding per host: registration, climb, slip and glide all read
   * the same real support, collision and snow tier list. */
  function summitPlay() {
    if (disposed) throw new Error('The production host is disposed.');
    play ??= createTownD2R30SummitPlay({
      northWall: assembly.northWall,
      supportAt,
      blocked,
      snowTierAt,
    });
    return play;
  }

  // ---- the one real cable line (D32-1) -------------------------------------
  // D2 owns the slot and the host lifecycle; B owns the operation. The line is
  // built from B's actual upper installer, claims the ropeway clock so nothing
  // else may move the cabins, and stays closed until A hands in the presence
  // authority and the operation certifies itself.
  let cable: TownD2CableOperation | undefined;
  let cablePackage:Extract<Awaited<ReturnType<typeof mountNightBPublicRearCableAsync>>,{ready:true}>|undefined;
  let cableInstalling=false;
  let cableSlices:number[]=[];
  const cableAbort=new AbortController();
  let cableRefusal: string | undefined;

  function cableClosed(reason: string) {
    cableRefusal = reason;
    return Object.freeze({ installed: false as const, certified: false as const, boardable: false as const, reason });
  }

  /** Called by A with its presence authority. Idempotent after a successful
   * build; a refused attempt can be retried. */
  async function preparePublicCable(authority: TownD2CableAuthority,options:NightBAuditSliceOptions={}) {
    if (disposed) throw new Error('The production host is disposed.');
    if (cable) return cableState();
    if(cableInstalling||sectorInstalling)throw Error('Cable or sector installation already pending');
    if (!authority || typeof authority.state !== 'function' || typeof authority.now !== 'function' ||
        typeof authority.daylight !== 'function') {
      throw new TypeError('preparePublicCable needs the presence authority (state/now/daylight).');
    }
    // The line is certified against the final four-sector ground; building it on
    // a partial mountain would certify clearances that no longer exist.
    const missing = (['A', 'B', 'C2'] as const).filter(key => !installed.has(key));
    if (missing.length) {
      cableClosed('sector-' + missing.join('-') + '-not-mounted');
      throw new Error('Cable needs the mounted ground of sector ' + missing.join(', ') + ' first.');
    }
    if(assembly.pendingDetails().length)throw Error('Cable needs completed details');
    const revision=tiles.map(t=>t.geometry);
    cableInstalling=true;cableSlices=[];
    try {
      const result=await mountNightBPublicRearCableAsync({
        owner:group,groundAt:surfaceAt,supportAt,blocked,groundMeshes:tiles,
        authority:authority as Parameters<typeof mountNightBPublicRearCableAsync>[0]['authority'],
        authorized:sectorLiveCheck().ready,
        *certifyRoutes(docks,repair,supportAt,blocked,repairFootClear,dispatcherFoot){
          const routes=yield* nightBRearCableAccessSteps({docks,repair,supportAt,blocked,repairFootClear,dispatcherFoot,
            gate:{east:0,north:-8,height:347},summitLanding:trail.at(-1)!});
          return routes.ready;
        }
      },{...options,signal:options.signal??cableAbort.signal,valid:()=>!disposed&&revision.every((g,i)=>tiles[i]?.geometry===g)&&options.valid?.()!==false,
        onSlice:ms=>{cableSlices.push(ms);options.onSlice?.(ms);}});
      if(!result.ready)throw Error('Cable refused: '+result.reason);
      if(disposed||options.signal?.aborted){result.dispose();throw Error('Cable owner disposed during preparation');}
      cablePackage=result;cable=result.cableOperation;result.setNight(night);collectSleepers();
      cableRefusal=undefined;
      return cableState();
    }catch(error){
      cablePackage?.dispose();cablePackage=undefined;cable=undefined;
      cableClosed(error instanceof Error?error.message:String(error));
      throw error;
    }finally{cableInstalling=false;}
  }

  /** D32-1 boarding/exiting certification on the real docks.
   *
   * A ride is only proposable when the operation is open, the foot really
   * stands at a dock the operation accepts, and the exit dock is supported and
   * clear. This is the D2 half of the pairing: it proves the rear line can be
   * boarded and left at both stations without inventing a teleport.
   */
  function cableRidePlan(foot: CableFoot) {
    if (!cable || cable.ready !== true) return Object.freeze({ ok: false as const, reason: 'no-line' as const });
    if (!foot || ![foot.east, foot.north, foot.height].every(Number.isFinite)) {
      throw new RangeError('cableRidePlan needs a finite foot position.');
    }
    const service = cable.service as unknown as {
      physical?: boolean;
      serviceOpen?(): boolean;
      cabinStates?(): readonly { canBoardOrExit: boolean }[] | undefined;
      board?(feet: CableFoot, cabin: 0 | 1): { cabinIndex: number } | undefined;
      exit?(ride: { cabinIndex: number }): CableFoot | undefined;
      ridePose?(ride: { cabinIndex: number }): (CableFoot & { station?: string | null; whiteout?: boolean }) | undefined;
    } | undefined;
    if (!service || service.physical !== true || service.board === undefined) {
      return Object.freeze({ ok: false as const, reason: 'service-closed' as const });
    }
    const open = service.serviceOpen?.() === true;
    for (const cabin of [0, 1] as const) {
      const ride = service.board(foot, cabin);
      if (!ride) continue;
      const pose = service.ridePose?.(ride);
      const station = pose?.station ?? null;
      // Where this cabin can be left: the exit must be a real, clear dock.
      const exitFoot = { cabinIndex: ride.cabinIndex };
      const atExit = service.cabinStates?.()?.[ride.cabinIndex];
      const canLeave = atExit?.canBoardOrExit === true;
      const exitAt = canLeave ? service.exit?.(exitFoot) : undefined;
      return Object.freeze({
        ok: true as const,
        cabinIndex: ride.cabinIndex,
        serviceOpen: open,
        station,
        boardFeet: Object.freeze({ ...foot }),
        exitReady: exitAt !== undefined,
        exitFeet: exitAt === undefined ? undefined : Object.freeze({ ...exitAt }),
        exitSupported: exitAt === undefined ? false
          : supportAt(exitAt.east, exitAt.north) !== undefined &&
            !blocked(exitAt.east, exitAt.north, exitAt.height),
      });
    }
    return Object.freeze({ ok: false as const, reason: 'not-at-dock' as const, serviceOpen: open });
  }

  /** The exact contract A reads (town-a31-cable-binding readA31UpperCable). */
  function cableState() {
    const certified = cable?.ready === true;
    const boardable = certified && cable?.service?.physical === true;
    return Object.freeze({
      installed: cable !== undefined,
      certified,
      boardable,
      slices:cableSlices.length?{count:cableSlices.length,max:Math.max(...cableSlices),median:[...cableSlices].sort((a,b)=>a-b)[Math.floor(cableSlices.length/2)]}:undefined,
      tickOwner: (cable === undefined ? 'none' : 'b-controller') as 'none' | 'b-controller',
      refusal: cableRefusal,
    });
  }

  /** Release the line and every body it mounted; the slot can be rebuilt. */
  function uninstallCable() {
    if (disposed) throw new Error('The production host is disposed.');
    if (!cable) throw new Error('No cable line is installed.');
    cablePackage?.dispose();cablePackage=undefined;cable=undefined;collectSleepers();
    return cableState();
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
    snowTierAt,
    snowAt,
    setFrontSnow,
    certifySeamCrossing,
    summitPlay,
    /** D32 streaming: mount the pending detail packages and report each cost, so
     * a caller can hand out one stage per frame instead of one 1.5 s hitch. */
    mountDetails: (only?: string) => {
      if (disposed) throw new Error('The production host is disposed.');
      if(sectorInstalling)throw Error('Sector installation already pending');
      const timings = assembly.mountDetails(only);
      refreshRegistrationBoxes();
      collectSleepers();
      if (detailFocus) setDetailFocus(detailFocus.east, detailFocus.north);
      return timings;
    },
    pendingDetails: () => assembly.pendingDetails(),
    setDetailFocus,
    windAt,
    setFrontWind,
    terrainIntegrity,
    enterRear,
    exitRear,
    airlockState: () => airlock,
    /** D32-P1 #8: measure the real joint between the central spiral and C2's
     * single east-sector centreline, on this host's live support and collision. */
    certifyRoadJoint: () => certifyRoadJoint({ trail, supportAt, blocked }),
    /** Survey a connector candidate to one C2 handoff and hand the numbers to
     * the sector owner. Builds nothing; it measures whether a legal path fits. */
    surveyRoadConnector: (id: string) => {
      const handoff = c2EastRoadHandoffs.find(entry => entry.id === id);
      if (!handoff) throw new RangeError('Unknown C2 road handoff id: ' + id);
      return surveyRoadConnector({ trail, supportAt, blocked, handoff });
    },
    preparePublicCable,
    uninstallCable,
    cableRidePlan,
    cableState,
    /** A's readA31UpperCable consumes this directly; undefined while closed. */
    get cableOperation() {
      return cable;
    },
    install,
    installAsync,
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
      // One night state for the whole mountain, the line included.
      cablePackage?.setNight(value);
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
      // Abort the pending transaction before tearing down its host.
      cableAbort.abort();
      try{cablePackage?.dispose();}catch{/* keep releasing */}
      cablePackage=undefined;cable=undefined;
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
