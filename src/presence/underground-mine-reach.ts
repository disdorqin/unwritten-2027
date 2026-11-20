import {
  BufferGeometry, DoubleSide, Float32BufferAttribute, Mesh, MeshBasicMaterial, Raycaster, Vector3,
} from 'three';
import type { UndergroundSurvivalPoint } from './underground-survival.js';

type MineLocal = readonly [x: number, y: number, z: number];
type MineGeometry = Readonly<{
  mesh: Readonly<{ rock: Float32Array }>;
  queryPassage(x: number, z: number, radius: number, bodyHeight: number):
    Readonly<{ floor: number; clearance: number }> | undefined;
}>;
const edgeTolerance = .0001;

/** Use one installed mine's rock faces for the vitals light and sound reach checks. */
export function createUndergroundMineReach({ layer, mine, toLocal }: Readonly<{
  layer: string;
  mine: MineGeometry;
  toLocal(point: UndergroundSurvivalPoint): MineLocal | undefined;
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
  let disposed = false;

  function locate(point: UndergroundSurvivalPoint) {
    if (point.layer !== layer || ![point.east, point.north, point.height].every(Number.isFinite)) return;
    const local = toLocal(point);
    if (!local || local.length !== 3 || !local.every(Number.isFinite)) return;
    const [x, y, z] = local;
    const room = mine.queryPassage(x, z, 0, edgeTolerance);
    if (room && y >= room.floor - edgeTolerance && y <= room.floor + room.clearance + edgeTolerance) {
      return local;
    }
  }

  return {
    reaches(from: UndergroundSurvivalPoint, to: UndergroundSurvivalPoint): boolean {
      if (disposed) return false;
      const a = locate(from);
      if (!a) return false;
      start.fromArray(a);
      const b = locate(to);
      if (!b) return false;
      direction.fromArray(b).sub(start);
      const distance = direction.length();
      if (distance <= edgeTolerance * 2) return true;
      ray.set(start, direction.divideScalar(distance));
      ray.near = edgeTolerance;
      ray.far = distance - edgeTolerance;
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
