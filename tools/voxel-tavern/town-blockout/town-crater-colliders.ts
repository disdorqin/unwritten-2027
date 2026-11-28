import type { Box } from './landmark-kit';

/**
 * Crater-interior colliders, generated mechanically from the mounts' own
 * placement data (collision audit 2026-11-22: the whole crater interior
 * was walk-through except the terrain heightfield itself — Thomas's live
 * report). Each source module already computes world placements; this
 * module turns them into walk-geometry boxes in the road group's frame
 * (x = east, y = height, z = -north), and the road registers them on its
 * top group, which is the frame `readWalkGeometry` reads.
 *
 * Sizing discipline: boxes hug the physical piece, never the placement
 * clearance radius — an oversized box is an invisible wall, the other
 * defect in the same audit. Flat pieces (plates, scorch patches, survey
 * stakes) get no box: walking over them is correct. Mouth-works sites are
 * deliberately NOT boxed here — a site radius spans gates and signs that
 * must stay passable; that module needs per-piece boxes of its own.
 */

type Point = Readonly<{ east: number; north: number; height: number }>;

export type CraterWinchSurvey = Readonly<{
  plinth: Point;
  crane: Point;
  useFoot: Point;
}>;

export type CraterCampPlacement = Readonly<{
  kind: 'camp' | 'lamp' | 'strata';
  id: string;
  east: number;
  north: number;
  height: number;
  radius: number;
  /** Exact mounted piece envelopes; legacy survey fixtures may omit these. */
  colliders?: readonly Box[];
}>;

export type CraterMidgroundPlacement = Readonly<{
  kind: 'dead-pine' | 'fallen-pine' | 'lava-column';
  east: number;
  north: number;
  ground: number;
  height: number;
  radius: number;
}>;

export type CraterEjectaPlacement = Readonly<{
  kind: string;
  east: number;
  north: number;
  ground: number;
  footprint: number;
  height: number;
}>;

export type CraterDressingPlacement = Readonly<{
  kind: string;
  east: number;
  north: number;
  height: number;
}>;

function box(east: number, north: number, base: number,
  width: number, height: number, depth: number): Box {
  return {
    min: [east - width / 2, base, -north - depth / 2],
    max: [east + width / 2, base + height, -north + depth / 2],
  };
}

/** Axis-aligned envelope of a footprint rotated by the anchor yaw. */
function rotated(width: number, depth: number, yaw: number) {
  const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
  return { width: c * width + s * depth, depth: s * width + c * depth };
}

export function buildCraterColliders(sources: Readonly<{
  yaw: number;
  winch?: CraterWinchSurvey;
  camp: readonly CraterCampPlacement[];
  midground: readonly CraterMidgroundPlacement[];
  ejecta: readonly CraterEjectaPlacement[];
  dressing: readonly CraterDressingPlacement[];
  /** Pre-built boxes from structures that know their own walls
   * (e.g. the lamp room), appended verbatim. */
  extra?: readonly Box[];
}>): Box[] {
  const boxes: Box[] = [];
  const { yaw, winch } = sources;

  // The winch machine and its crane: the two pieces a player stands
  // against. The operator's foot point stays outside both boxes.
  if (winch) {
    const machine = rotated(.79, .48, yaw);
    boxes.push(box(winch.plinth.east, winch.plinth.north, winch.plinth.height,
      machine.width, .78, machine.depth));
    const stone = rotated(1.10, 1.25, yaw);
    boxes.push(box(winch.crane.east, winch.crane.north, winch.crane.height,
      stone.width, .45, stone.depth));
    const post = rotated(.28, .29, yaw);
    boxes.push(box(winch.crane.east, winch.crane.north, winch.crane.height + .45,
      post.width, 1.5, post.depth));
  }

  // Muster point （集结地） structures, sized by kind from the module's own
  // placement radii — envelopes of the built pieces, not their clearances.
  for (const site of sources.camp) {
    if(site.colliders){boxes.push(...site.colliders);continue;}
    if (site.kind === 'lamp') {
      boxes.push(box(site.east, site.north, site.height, .32, 1.3, .32));
    } else if (site.kind === 'strata') {
      const half = site.radius * .8;
      boxes.push(box(site.east, site.north, site.height, half * 2, 1.6, half * 2));
    } else if (site.id === 'collapsed-tent') {
      const half = site.radius * .55;
      boxes.push(box(site.east, site.north, site.height, half * 2, 1.25, half * 2));
    } else if (site.id === 'fire-ring') {
      const half = site.radius * .7;
      boxes.push(box(site.east, site.north, site.height, half * 2, .45, half * 2));
    } else if (site.id === 'open-toolbox') {
      const half = site.radius * .5;
      boxes.push(box(site.east, site.north, site.height, half * 2, .55, half * 2));
    } else if (site.id === 'broken-railhead') {
      const half = site.radius * .6;
      boxes.push(box(site.east, site.north, site.height, half * 2, .9, half * 2));
    }
  }

  // Midground silhouettes: trunks are slim whatever their clearance was;
  // a fallen log gets a low envelope; melt columns hug their built width.
  for (const piece of sources.midground) {
    if (piece.kind === 'dead-pine') {
      boxes.push(box(piece.east, piece.north, piece.ground, .6, piece.height * .96, .6));
    } else if (piece.kind === 'fallen-pine') {
      boxes.push(box(piece.east, piece.north, piece.ground, 5.4, .78, 5.4));
    } else {
      boxes.push(box(piece.east, piece.north, piece.ground, 1.24, piece.height * .98, 1.24));
    }
  }

  // Ejecta outcrops at body height or more; flat scorch stays walkable.
  for (const piece of sources.ejecta) {
    if (piece.height < 1) continue;
    const half = piece.footprint * .5;
    boxes.push(box(piece.east, piece.north, piece.ground,
      half * 2, piece.height * .9, half * 2));
  }

  // Story-dressing lamp posts (the warm chain's carriers). Plates, ice,
  // stakes and tilted timbers stay unboxed by design.
  for (const piece of sources.dressing) {
    if (piece.kind !== 'lamp') continue;
    boxes.push(box(piece.east, piece.north, piece.height, .34, 1.3, .34));
  }

  if (sources.extra) boxes.push(...sources.extra);
  return boxes;
}
