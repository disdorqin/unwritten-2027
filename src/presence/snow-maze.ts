import { classifyWallSite, SnowWallField, WALL_CELL, WALL_TOWN_CAP, wallCellCentre } from './snowfight.js';

const mazeWallLayers = 2;
const ownMazeKey = 'unwritten.snow-maze.v1';

type Point = Readonly<{ east: number; north: number }>;
type Checkpoint = Readonly<Point & { radius: number }>;
type Cell = Readonly<{ gx: number; gy: number }>;
type Bounds = readonly [west: number, south: number, east: number, north: number];
type Storage = { getItem(key: string): string | null; setItem(key: string, value: string): void };
type WallTeam = Parameters<SnowWallField['place']>[3];

export type SnowMazeBlueprint = Readonly<{
  columns: readonly Cell[];
  entry: Checkpoint;
  bell: Checkpoint;
}>;

type Rules = {
  bounds: Bounds;
  captureMs: number;
  bodyRadius: number;
  ownerId: number;
  wallTeam: WallTeam;
  canUseSite(point: Point): boolean;
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function point(value: unknown): value is Point {
  return record(value) && Number.isFinite(value.east) && Number.isFinite(value.north);
}

function checkpoint(value: unknown): value is Checkpoint {
  return point(value) && 'radius' in value && typeof value.radius === 'number' &&
    Number.isFinite(value.radius) && value.radius > 0;
}

function parseBlueprint(value: unknown): SnowMazeBlueprint | undefined {
  if (!record(value) || !checkpoint(value.entry) || !checkpoint(value.bell) ||
      !Array.isArray(value.columns) || !value.columns.length || value.columns.length * mazeWallLayers > WALL_TOWN_CAP ||
      !value.columns.every(cell => record(cell) && Number.isSafeInteger(cell.gx) && Number.isSafeInteger(cell.gy))) return;
  return {
    entry: { east: value.entry.east, north: value.entry.north, radius: value.entry.radius },
    bell: { east: value.bell.east, north: value.bell.north, radius: value.bell.radius },
    columns: value.columns.map(cell => ({ gx: cell.gx, gy: cell.gy })),
  };
}

function inside({ east, north }: Point, [w, s, e, n]: Bounds, margin: number) {
  return east - margin >= w && east + margin <= e && north - margin >= s && north + margin <= n;
}

function near(p: Point, checkpoint: Checkpoint) {
  return Math.hypot(p.east - checkpoint.east, p.north - checkpoint.north) <= checkpoint.radius;
}

/** Swept horizontal body contact. Race walls keep their real visible height. */
function crossesCell(from: Point, to: Point, minEast: number, minNorth: number, radius: number) {
  const maxEast = minEast + WALL_CELL, maxNorth = minNorth + WALL_CELL;
  if (Math.min(from.east, to.east) >= maxEast + radius || Math.max(from.east, to.east) <= minEast - radius ||
      Math.min(from.north, to.north) >= maxNorth + radius || Math.max(from.north, to.north) <= minNorth - radius) return false;
  const dx = to.east - from.east, dn = to.north - from.north;
  let low = 0, high = 1;
  for (const [start, delta, min, max] of [[from.east, dx, minEast, maxEast], [from.north, dn, minNorth, maxNorth]]) {
    if (delta === 0) {
      if (start < min || start > max) low = Infinity;
      continue;
    }
    const a = (min - start) / delta, b = (max - start) / delta;
    low = Math.max(low, Math.min(a, b));
    high = Math.min(high, Math.max(a, b));
  }
  if (low <= high) return true;

  for (const p of [from, to]) {
    if (Math.hypot(Math.max(minEast - p.east, p.east - maxEast, 0),
      Math.max(minNorth - p.north, p.north - maxNorth, 0)) < radius) return true;
  }
  const lengthSquared = dx * dx + dn * dn;
  if (lengthSquared === 0) return false;
  for (const east of [minEast, maxEast]) {
    for (const north of [minNorth, maxNorth]) {
      const projection = Math.max(0, Math.min(1, ((east - from.east) * dx + (north - from.north) * dn) / lengthSquared));
      if (Math.hypot(east - from.east - projection * dx, north - from.north - projection * dn) < radius) return true;
    }
  }
  return false;
}

/** Compile an approved or player-authored blueprint with the normal WallField rules. */
export function compileSnowMaze(value: unknown, rules: Rules) {
  const blueprint = parseBlueprint(value);
  const { captureMs, bodyRadius, ownerId, wallTeam, canUseSite } = rules;
  const bounds: Bounds = [...rules.bounds];
  if (!blueprint || !bounds.every(Number.isFinite) ||
      !Number.isSafeInteger(captureMs) || captureMs <= 0 ||
      !Number.isFinite(bodyRadius) || bodyRadius <= 0) return;
  const { bell, entry, columns } = blueprint;
  if (!inside(entry, bounds, entry.radius + bodyRadius) ||
      !inside(bell, bounds, bell.radius + bodyRadius) ||
      !canUseSite(entry) || !canUseSite(bell) ||
      Math.hypot(entry.east - bell.east, entry.north - bell.north) <= entry.radius + bell.radius) return;

  const field = new SnowWallField();
  const wallObstructs = (from: Point, to: Point) => columns.some(({ gx, gy }) =>
    crossesCell(from, to, gx * WALL_CELL, gy * WALL_CELL, bodyRadius));
  for (const { gx, gy } of columns) {
    const p = { east: wallCellCentre(gx), north: wallCellCentre(gy) };
    if (field.height(gx, gy) || !inside(p, bounds, WALL_CELL / 2) ||
        classifyWallSite(p.east, p.north) || !canUseSite(p)) return;
    for (let layer = 0; layer < mazeWallLayers; layer++) {
      if ('reason' in field.place(gx, gy, ownerId, wallTeam, 0)) return;
    }
  }
  if (wallObstructs(entry, entry) || wallObstructs(bell, bell)) return;
  const canMove = (from: Point, to: Point) =>
    point(from) && point(to) && inside(from, bounds, bodyRadius) &&
    inside(to, bounds, bodyRadius) && canUseSite(to) && !wallObstructs(from, to);

  return {
    wallBlocks: () => field.snapshot().map(block => ({ ...block })),
    canMove,
    saveOwn(storage: Storage) {
      try {
        storage.setItem(ownMazeKey, JSON.stringify(blueprint));
        return true;
      } catch {
        return false;
      }
    },
    /** One timed run. Session authority or UI owns verified elapsed time and the actual pose stream. */
    begin(at: number, position: Point) {
      if (!Number.isFinite(at) || !point(position) || !near(position, entry) || !canMove(position, position)) return;
      let current = { ...position };
      let tickAt = at;
      let heldSince: number | undefined;
      let elapsedMs: number | undefined;
      return {
        update(now: number, next: Point) {
          if (elapsedMs !== undefined || !Number.isFinite(now) || now < tickAt || !canMove(current, next)) return false;
          tickAt = now;
          current = { ...next };
          if (!near(next, bell)) heldSince = undefined;
          else {
            heldSince ??= now;
            const capturedAt = heldSince + captureMs;
            if (now >= capturedAt) elapsedMs = capturedAt - at;
          }
          return true;
        },
        state: () => ({
          heldMs: heldSince === undefined ? 0 : Math.min(captureMs, tickAt - heldSince),
          elapsedMs,
        }),
      };
    },
  };
}

type CompiledMaze = NonNullable<ReturnType<typeof compileSnowMaze>>;
type MazeRun = NonNullable<ReturnType<CompiledMaze['begin']>>;

/** One invitation scope. The host supplies authoritative player IDs, poses and timestamps. */
export function createSnowMazeChallenge(
  maze: CompiledMaze,
  challengeId: string,
  authorId: number,
  invitees: readonly number[],
) {
  const validPlayer = (id: number) => Number.isSafeInteger(id) && id > 0;
  if (!challengeId.trim() || !validPlayer(authorId) || !invitees.every(validPlayer)) return;

  const invited = new Set(invitees);
  const runs = new Map<number, MazeRun>();
  const bestTimes = new Map<number, number>();

  return {
    start(runnerId: number, at: number, position: Point) {
      if ((runnerId !== authorId && !invited.has(runnerId)) || runs.has(runnerId)) return false;
      const run = maze.begin(at, position);
      if (!run) return false;
      runs.set(runnerId, run);
      return true;
    },
    move(runnerId: number, at: number, position: Point) {
      const run = runs.get(runnerId);
      if (!run?.update(at, position)) return false;
      const { elapsedMs } = run.state();
      if (elapsedMs !== undefined) {
        runs.delete(runnerId);
        bestTimes.set(runnerId, Math.min(bestTimes.get(runnerId) ?? elapsedMs, elapsedMs));
      }
      return true;
    },
    reportFor(viewerId: number) {
      if (viewerId !== authorId) return;
      const guestResults = [...bestTimes]
        .filter(([runnerId]) => runnerId !== authorId)
        .map(([runnerId, elapsedMs]) => ({ runnerId, elapsedMs }))
        .sort((a, b) => a.elapsedMs - b.elapsedMs || a.runnerId - b.runnerId);
      return { challengeId, personalBestMs: bestTimes.get(authorId), guestResults };
    },
  };
}

export function loadOwnSnowMaze(storage: Storage): SnowMazeBlueprint | undefined {
  try {
    return parseBlueprint(JSON.parse(storage.getItem(ownMazeKey) ?? 'null'));
  } catch {
    return undefined;
  }
}
