import { createTownD2R30ProductionHost } from './town-d2-r30-production-host';
import { createEastSectorInstaller, createWestSectorInstaller } from './town-d2-r30-sector-installers';
import { createA32SouthSectorInstaller } from './town-a32-south-installer';

/**
 * D32 performance data for the real host, produced by the host itself.
 *
 * The total control review twice hit `performanceSamples: []`, so the numbers
 * for the mountain were guesses made from independent preview pages. This
 * measures the actual production path: how long each stage of the mount costs,
 * what each region costs to draw, and what the four-sector live check costs to
 * run — all on the real canonical host, no fixture and no preview page.
 *
 * It builds a throwaway host, so it never runs on the frame path.
 */

export type StageTiming = Readonly<{ stage: string; ms: number }>;

export type RegionCost = Readonly<{
  focus: string;
  east: number;
  north: number;
  awake: number;
  asleep: number;
  draws: number;
  triangles: number;
}>;

export type HostProfile = Readonly<{
  version: string;
  stages: readonly StageTiming[];
  mountMs: number;
  regions: readonly RegionCost[];
  liveCheckMs: number;
  terrainIntegrityMs: number;
  tiles: Readonly<{ count: number; cut: number }>;
  draws: number;
  triangles: number;
}>;

/** Same measure() the host uses for its own budget: real meshes, real indices. */
function measure(root: { traverse(callback: (object: unknown) => void): void }) {
  let draws = 0, triangles = 0;
  root.traverse(object => {
    const mesh = object as {
      isMesh?: boolean;
      geometry?: { getIndex(): { count: number } | null; getAttribute(name: string): { count: number } };
      count?: number;
      visible?: boolean;
    };
    if (!mesh.isMesh || !mesh.geometry) return;
    // Sleeping bodies are mounted but not submitted: a cost report that counts
    // them is worse than no report.
    for (let node: unknown = object; node; node = (node as { parent?: unknown }).parent) {
      if ((node as { visible?: boolean }).visible === false) return;
    }
    draws += 1;
    const index = mesh.geometry.getIndex();
    const count = index ? index.count : mesh.geometry.getAttribute('position').count;
    triangles += (count / 3) * (mesh.count ?? 1);
  });
  return { draws, triangles: Math.round(triangles) };
}

export function profileTownD2Host(): HostProfile {
  const stages: StageTiming[] = [];
  const timed = <T>(stage: string, run: () => T): T => {
    const started = performance.now();
    const value = run();
    stages.push(Object.freeze({ stage, ms: performance.now() - started }));
    return value;
  };

  const host = timed('host-assembly', () => createTownD2R30ProductionHost());
  try {
    timed('sector-A', () => host.install('A', createA32SouthSectorInstaller()));
    timed('sector-B', () => host.install('B', createWestSectorInstaller()));
    timed('sector-C2', () => host.install('C2', createEastSectorInstaller()));
    const mountMs = stages.reduce((sum, entry) => sum + entry.ms, 0);

    const regions: RegionCost[] = [];
    for (const [focus, east, north] of [
      ['south', 0, 100], ['west', -600, 900], ['summit', 50, 1000], ['east', 700, 1200],
    ] as const) {
      const awake = host.setDetailFocus(east, north);
      const visible = host.group.children.filter(child =>
        (child as unknown as { visible: boolean }).visible).length;
      // Only what is actually in the frame costs draws: the sleeping dressings
      // stay mounted but out of the submission list.
      let draws = 0, triangles = 0;
      for (const child of host.group.children) {
        if (!(child as unknown as { visible: boolean }).visible) continue;
        const cost = measure(child as unknown as { traverse(cb: (o: unknown) => void): void });
        draws += cost.draws;
        triangles += cost.triangles;
      }
      regions.push(Object.freeze({
        focus, east, north, awake,
        asleep: host.group.children.length - visible,
        draws, triangles,
      }));
    }

    const started = performance.now();
    const live = host.sectorLiveCheck();
    const liveCheckMs = performance.now() - started;

    const integrityStarted = performance.now();
    host.terrainIntegrity();
    const terrainIntegrityMs = performance.now() - integrityStarted;

    const stats = host.stats();
    const budget = measure(host.group as unknown as { traverse(cb: (o: unknown) => void): void });
    return Object.freeze({
      version: 'd2-host-profile-1.0',
      stages: Object.freeze(stages),
      mountMs,
      regions: Object.freeze(regions),
      liveCheckMs,
      terrainIntegrityMs,
      tiles: Object.freeze({ count: stats.tiles.count, cut: stats.tiles.cut }),
      draws: budget.draws,
      triangles: budget.triangles,
      ...(live.ready ? {} : { incomplete: true }),
    });
  } finally {
    host.dispose();
  }
}
