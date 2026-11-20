import {
  Box3, BufferGeometry, DoubleSide, Float32BufferAttribute, Mesh, MeshBasicMaterial, Raycaster, Vector3,
} from 'three';
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

/** Use the installed mine's rock faces and live gate leaf for vitals light and sound reach. */
export function createUndergroundMineReach({ layer, mine, toLocal, readGateStage }: Readonly<{
  layer: string;
  mine: MineGeometry;
  toLocal(point: UndergroundSurvivalPoint): MineLocal | undefined;
  readGateStage?(): UndergroundMineGateStage;
}>) {
  if (!layer.trim()) throw new RangeError('Mine reach needs an installed underground layer');
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(mine.mesh.rock, 3));
  geometry.computeBoundingSphere();
  const material = new MeshBasicMaterial({ side: DoubleSide });
  const occluder = new Mesh(geometry, material);
  const ray = new Raycaster();
  const start = new Vector3();
  const direction = new Vector3();
  const hits: ReturnType<Raycaster['intersectObject']> = [];
  const gate = mine.expansion?.gate;
  const leafBounds = new Box3();
  const leafHit = new Vector3();
  let disposed = false;

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

  function hitsGate(stage: UndergroundMineGateStage) {
    if (!gate) return false;
    const gap = gate.gapFor(stage);
    if (gap >= gate.height) return false;
    const [x, floor, z] = gate.position;
    leafBounds.min.set(x - gate.width / 2, floor + gap, z - gate.thickness / 2);
    leafBounds.max.set(x + gate.width / 2, floor + gate.height, z + gate.thickness / 2);
    const hit = ray.ray.intersectBox(leafBounds, leafHit);
    if (!hit) return false;
    const distance = hit.distanceTo(start);
    return distance >= ray.near && distance <= ray.far;
  }

  return {
    reaches(from: UndergroundSurvivalPoint, to: UndergroundSurvivalPoint): boolean {
      if (disposed) return false;
      const gateStage = readGateStage?.() ?? 'closed';
      const a = locate(from, gateStage);
      if (!a) return false;
      start.fromArray(a);
      const b = locate(to, gateStage);
      if (!b) return false;
      direction.fromArray(b).sub(start);
      const distance = direction.length();
      if (distance <= edgeTolerance * 2) return true;
      ray.set(start, direction.divideScalar(distance));
      ray.near = edgeTolerance;
      ray.far = distance - edgeTolerance;
      if (hitsGate(gateStage)) return false;
      hits.length = 0;
      ray.intersectObject(occluder, false, hits);
      return hits.length === 0;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      hits.length = 0;
      geometry.dispose();
      material.dispose();
    },
  };
}
