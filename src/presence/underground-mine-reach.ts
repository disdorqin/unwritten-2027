import type { UndergroundMineGateStage } from './underground-mine-gate.js';
import type { UndergroundSurvivalPoint } from './underground-survival.js';

type MineLocal = readonly [x: number, y: number, z: number];
type MineGate = Readonly<{
  position: MineLocal;
  width: number;
  height: number;
  thickness: number;
  gapFor(stage: UndergroundMineGateStage): number;
}>;
type MineGeometry = Readonly<{
  mesh: Readonly<{ rock: Float32Array }>;
  expansion?: Readonly<{ gate?: MineGate }>;
  queryPassage(x: number, z: number, radius: number, bodyHeight: number, gateStage?: UndergroundMineGateStage):
    Readonly<{ floor: number; clearance: number }> | undefined;
}>;
const edgeTolerance = .0001;

function hitsRock(rock: Float32Array, start: MineLocal, [dx, dy, dz]: MineLocal, far: number) {
  // Each set of nine coordinates is one double-sided rock triangle.
  for (let i = 0; i + 8 < rock.length; i += 9) {
    const ax = rock[i]!, ay = rock[i + 1]!, az = rock[i + 2]!;
    const abX = rock[i + 3]! - ax, abY = rock[i + 4]! - ay, abZ = rock[i + 5]! - az;
    const acX = rock[i + 6]! - ax, acY = rock[i + 7]! - ay, acZ = rock[i + 8]! - az;
    const crossX = dy * acZ - dz * acY;
    const crossY = dz * acX - dx * acZ;
    const crossZ = dx * acY - dy * acX;
    const determinant = abX * crossX + abY * crossY + abZ * crossZ;
    if (determinant === 0) continue;
    const offsetX = start[0] - ax, offsetY = start[1] - ay, offsetZ = start[2] - az;
    const u = (offsetX * crossX + offsetY * crossY + offsetZ * crossZ) / determinant;
    if (u < 0 || u > 1) continue;
    const normalX = offsetY * abZ - offsetZ * abY;
    const normalY = offsetZ * abX - offsetX * abZ;
    const normalZ = offsetX * abY - offsetY * abX;
    const v = (dx * normalX + dy * normalY + dz * normalZ) / determinant;
    if (v < 0 || u + v > 1) continue;
    const distance = (acX * normalX + acY * normalY + acZ * normalZ) / determinant;
    if (distance >= edgeTolerance && distance <= far) return true;
  }
  return false;
}

function hitsGate(gate: MineGate, stage: UndergroundMineGateStage, start: MineLocal, direction: MineLocal, far: number) {
  const gap = gate.gapFor(stage);
  if (gap >= gate.height) return false;
  const [x, floor, z] = gate.position;
  const minimum = [x - gate.width / 2, floor + gap, z - gate.thickness / 2] as const;
  const maximum = [x + gate.width / 2, floor + gate.height, z + gate.thickness / 2] as const;
  let entry = -Infinity;
  let exit = Infinity;
  for (const axis of [0, 1, 2] as const) {
    const origin = start[axis];
    const step = direction[axis];
    if (step === 0) {
      if (origin < minimum[axis] || origin > maximum[axis]) return false;
      continue;
    }
    const a = (minimum[axis] - origin) / step;
    const b = (maximum[axis] - origin) / step;
    entry = Math.max(entry, Math.min(a, b));
    exit = Math.min(exit, Math.max(a, b));
    if (entry > exit) return false;
  }
  // Clip the first forward surface. For a start inside the leaf this is the exit.
  const distance = entry >= 0 ? entry : exit;
  return distance >= edgeTolerance && distance <= far;
}

/** Use the installed mine's rock faces and live gate leaf for vitals light and sound reach. */
export function createUndergroundMineReach({ layer, mine, toLocal, readGateStage }: Readonly<{
  layer: string;
  mine: MineGeometry;
  toLocal(point: UndergroundSurvivalPoint): MineLocal | undefined;
  readGateStage?(): UndergroundMineGateStage;
}>) {
  if (!layer.trim()) throw new RangeError('Mine reach needs an installed underground layer');
  let rock: Float32Array | undefined = new Float32Array(mine.mesh.rock);
  const gate = mine.expansion?.gate;

  function locate(point: UndergroundSurvivalPoint, gateStage: UndergroundMineGateStage) {
    if (point.layer !== layer || ![point.east, point.north, point.height].every(Number.isFinite)) return;
    const local = toLocal(point);
    if (!local || local.length !== 3 || !local.every(Number.isFinite)) return;
    const [x, y, z] = local;
    const room = mine.queryPassage(x, z, 0, edgeTolerance, gateStage);
    if (room && y >= room.floor - edgeTolerance && y <= room.floor + room.clearance + edgeTolerance) {
      return local;
    }
  }

  return {
    reaches(from: UndergroundSurvivalPoint, to: UndergroundSurvivalPoint): boolean {
      if (!rock) return false;
      const stage = readGateStage?.() ?? 'closed';
      const a = locate(from, stage);
      if (!a) return false;
      const b = locate(to, stage);
      if (!b) return false;
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
      const distance = Math.hypot(dx, dy, dz);
      if (distance <= edgeTolerance * 2) return true;
      const direction: MineLocal = [dx / distance, dy / distance, dz / distance];
      const far = distance - edgeTolerance;
      return !(gate && hitsGate(gate, stage, a, direction, far)) && !hitsRock(rock, a, direction, far);
    },
    dispose() { rock = undefined; },
  };
}
