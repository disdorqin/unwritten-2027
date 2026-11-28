import { createMainSummitCable } from './main-summit-cable';
import { createC2EastProduction } from './town-night-c2-summit-east-production';
import type { TownD2SectorInstaller, TownD2SectorPackage } from './town-d2-r30-production-host';
import { mountSouthProduction } from './town-night-a-summit-production';
import { createSouthReservation } from './town-night-a-summit-reservation';
import { proposeSouthRoadGrade } from './town-night-a-summit-road-grade';
import { createNightBWestCutSurface, cutNightBWestTerrain } from './town-night-b-summit-west-cut';
import { mountNightBWestProduction,mountNightBWestProductionAsync } from './town-night-b-summit-west-production';
import type {TownD2SectorHostPort} from './town-d2-r30-production-host';
import type {NightBAuditSliceOptions} from './town-night-b-audit-slices';

/**
 * D2-side wiring for the two sectors that already publish a production mount.
 *
 * Dependency provenance (exact, reproducible, unmodified checkouts — see the
 * D2 handoff card; the owning window's landing supersedes these blobs):
 *   - A: town-night-a-summit-* @ a965e464 (frozen 2026-11-27)
 *   - B: town-night-b-summit-west-* @ 7d1ef0e6 (frozen 2026-11-27)
 *
 * Both mount functions excavate the canonical near tiles *in place* and refuse
 * a duplicate, a surrogate tile or a second terrain. D2 only supplies the
 * canonical ground, the accepted walkway survey and the near tile ownership.
 */

type SnowHook = (...args: unknown[]) => void;

function settleSnow(source: (...args: never[]) => void): SnowHook {
  return (...args: unknown[]) => (source as unknown as SnowHook)(...args);
}

/** A / south: the accepted 833 m route, reprofiled against the live canonical
 * ground and cut with B's accepted colour-preserving cutter. */
export function createSouthSectorInstaller(
  options: Readonly<{ first?: number; last?: number }> = {},
): TownD2SectorInstaller {
  const first = options.first ?? 1;
  const last = options.last ?? 834;
  if (!Number.isInteger(first) || !Number.isInteger(last) || first < 1 || last <= first) {
    throw new RangeError('Invalid southern sector walkway range.');
  }
  return (port): TownD2SectorPackage => {
    const grade = proposeSouthRoadGrade(port.trail, first, last, port.groundAt);
    if (!grade.ok) {
      // Fail closed with the real number: A must reprofile, D2 must not flatten
      // the mountain to make a road fit.
      throw new Error(`A south road does not fit the canonical terrain (deficit ${grade.deficit.toFixed(3)} m).`);
    }
    const trail = [...port.trail.slice(0, first), ...grade.profile, ...port.trail.slice(last + 1)];
    const cable = createMainSummitCable(0, 10_000, port.arrivalHeight);
    const reserved = createSouthReservation(
      [{ points: port.trail, radius: 18 }, ...cable.ropes.map(rope => ({ points: rope.points, radius: 40 }))],
      [{ west: -42, east: 42, south: -10, north: 55 }],
    );
    const south = mountSouthProduction({
      owner: port.owner,
      groundAt: port.groundAt,
      reserved,
      trail,
      first,
      last,
      nearTiles: port.tiles,
      legacySouthVegetationExcluded: true,
      legacyTreadExcluded: true,
      cutTerrain: cutNightBWestTerrain,
      createCutSurface: createNightBWestCutSurface,
    });
    return {
      sector: 'A',
      group: south.group,
      groundAt: (east, north) => south.groundAt(east, north),
      // A31/1c1822b5: the exact cut coverage and cut face. The host needs both
      // to make the excavated surface the ground instead of a max with the
      // original raster.
      coversCut: (east, north) => south.coversCut(east, north),
      cutGroundAt: (east, north) => south.cutGroundAt(east, north),
      deckAt: (east, north) => south.deckAt(east, north),
      supportAt: (east, north) => south.supportAt(east, north),
      blocked: (east, north, height, radius, bodyHeight) =>
        south.blocked(east, north, height, radius ?? .27, bodyHeight ?? 1.8),
      updateView: (east, north) => south.updateView(east, north),
      setNight: value => south.setNight(value),
      updateSnow: settleSnow(south.updateSnow),
      dispose: () => south.dispose(),
    };
  };
}

/** C2 / east: the delivered east aggregate (C2 `da87cc44`), seated on the
 * host's live ground. C2 owns the bodies, the deck tops and the colliders; D2
 * only supplies the one ground authority and the one owner group. */
export function createEastSectorInstaller(
  options: Readonly<{ moduleIds?: readonly string[] }> = {},
): TownD2SectorInstaller {
  return (port): TownD2SectorPackage => {
    const east = createC2EastProduction({ heightAt: port.groundAt, moduleIds: options.moduleIds });
    try {
      east.install(port.owner);
    } catch (error) {
      east.dispose();
      throw error;
    }
    return {
      sector: 'C2',
      group: east.group,
      // C2 publishes the highest standable surface (ground + decks/floors);
      // its own ground is the host ground it was built on, so it adds no
      // second terrain authority.
      supportAt: (east_, north) => east.topAt(east_, north),
      blocked: (eastPoint, north, height, radius, bodyHeight) =>
        east.blocked(eastPoint, north, height, radius ?? .27, bodyHeight ?? 1.8),
      updateView: (eastPoint, north) => east.updateView(eastPoint, north),
      setNight: value => east.setNight(value),
      dispose: () => east.dispose(),
    };
  };
}

/** B / west: the west road, pavilion and dressing, cut in place on the same
 * canonical tiles. The west sector is the only writer of its own bodies. */
const westInput=(port:TownD2SectorHostPort)=>({owner:port.owner,groundAt:port.groundAt,trail:port.trail,nearTiles:port.tiles,legacyWestExcluded:true});
function westPackage(west:ReturnType<typeof mountNightBWestProduction>):TownD2SectorPackage{
    // Consume B a6095936's exact west night hook and expose the actual cut/deck split.
    return {
      sector: 'B',
      group: west.group,
      groundAt: (east, north) => west.groundAt(east, north),
      coversCut:west.coversCut,cutGroundAt:west.cutGroundAt,deckAt:west.deckAt,
      supportAt: (east, north) => west.supportAt(east, north),
      blocked: (east, north, height, radius, bodyHeight) =>
        west.blocked(east, north, height, radius ?? .27, bodyHeight ?? 1.8),
      updateView: (east, north) => west.updateView(east, north),
      setNight: west.setNight,
      dispose: () => west.dispose(),
    };
}
export function createWestSectorInstaller():TownD2SectorInstaller{return port=>westPackage(mountNightBWestProduction(westInput(port)));}
export async function installWestSectorAsync(port:TownD2SectorHostPort,options:NightBAuditSliceOptions={}){return westPackage(await mountNightBWestProductionAsync(westInput(port),options));}
