import { createMainSummitCable } from './main-summit-cable';
import type { TownD2SectorInstaller, TownD2SectorPackage } from './town-d2-r30-production-host';
import { mountSouthProduction } from './town-night-a-summit-production';
import { createSouthReservation } from './town-night-a-summit-reservation';
import { proposeSouthRoadGrade } from './town-night-a-summit-road-grade';
import { createNightBWestCutSurface, cutNightBWestTerrain } from './town-night-b-summit-west-cut';
import { mountNightBWestProduction } from './town-night-b-summit-west-production';

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

/** B / west: the west road, pavilion and dressing, cut in place on the same
 * canonical tiles. The west sector is the only writer of its own bodies. */
export function createWestSectorInstaller(): TownD2SectorInstaller {
  return (port): TownD2SectorPackage => {
    const west = mountNightBWestProduction({
      owner: port.owner,
      groundAt: port.groundAt,
      trail: port.trail,
      nearTiles: port.tiles,
      legacyWestExcluded: true,
    });
    // The frozen B package does not publish a top-level night hook; its sector
    // body still owns one, so the host drives it through the body and stays
    // silent when a future B revision drops it.
    const body = west.sector as unknown as { setNight?(night: boolean): void };
    return {
      sector: 'B',
      group: west.group,
      groundAt: (east, north) => west.groundAt(east, north),
      supportAt: (east, north) => west.supportAt(east, north),
      blocked: (east, north, height, radius, bodyHeight) =>
        west.blocked(east, north, height, radius ?? .27, bodyHeight ?? 1.8),
      updateView: (east, north) => west.updateView(east, north),
      setNight: value => body.setNight?.(value),
      dispose: () => west.dispose(),
    };
  };
}
