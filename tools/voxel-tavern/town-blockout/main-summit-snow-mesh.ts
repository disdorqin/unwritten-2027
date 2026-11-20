import { BufferGeometry, Color, Float32BufferAttribute } from 'three';
import type { MainSummitTrailPoint } from './main-summit-trail';

const tileMetres = 8;
const tessellation = 16;
const naturalColor = new Color('#4b5e74');
const trailColor = new Color('#e2edf3');

type Trail = {
  points: readonly MainSummitTrailPoint[];
  sampleSurface(east: number, north: number): number | undefined;
};

function ribbonTiles(points: Trail['points']) {
  const cells = new Set<string>();
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1]!, to = points[index]!;
    const steps = Math.max(1, Math.ceil(Math.hypot(to.east - from.east, to.north - from.north) / 2));
    for (let step = 0; step <= steps; step++) {
      const fraction = step / steps;
      const east = from.east + (to.east - from.east) * fraction;
      const north = from.north + (to.north - from.north) * fraction;
      for (let x = Math.floor((east - 3) / tileMetres); x <= Math.floor((east + 3) / tileMetres); x++) {
        for (let z = Math.floor((north - 3) / tileMetres); z <= Math.floor((north + 3) / tileMetres); z++) {
          cells.add(`${x}:${z}`);
        }
      }
    }
  }
  return cells;
}

// Refining only route tiles makes cuts visible and puts the rendered snow on
// the same height sampler as riding. The source mountain mesh remains untouched.
export function buildMainSummitSnowMesh(coarse: BufferGeometry, trail: Trail) {
  const original = coarse.getAttribute('position');
  const oldIndex = coarse.getIndex();
  if (!original || !oldIndex) throw new TypeError('The trail surface needs indexed mountain triangles.');
  const cells = ribbonTiles(trail.points);
  const position = Array.from(original.array);
  const colors = Array.from({ length: original.count }, () => [naturalColor.r, naturalColor.g, naturalColor.b]).flat();
  const index: number[] = [];
  let refinedTriangles = 0;
  let treadVertices = 0;

  for (let offset = 0; offset < oldIndex.count; offset += 3) {
    const a = oldIndex.getX(offset), b = oldIndex.getX(offset + 1), c = oldIndex.getX(offset + 2);
    const ax = original.getX(a), ay = original.getY(a), an = -original.getZ(a);
    const bx = original.getX(b), by = original.getY(b), bn = -original.getZ(b);
    const cx = original.getX(c), cy = original.getY(c), cn = -original.getZ(c);
    let nearTrail = false;
    for (let x = Math.floor(Math.min(ax, bx, cx) / tileMetres); x <= Math.floor(Math.max(ax, bx, cx) / tileMetres); x++) {
      for (let z = Math.floor(Math.min(an, bn, cn) / tileMetres); z <= Math.floor(Math.max(an, bn, cn) / tileMetres); z++) {
        if (cells.has(`${x}:${z}`)) nearTrail = true;
      }
    }
    if (!nearTrail) {
      index.push(a, b, c);
      continue;
    }
    refinedTriangles++;
    const rowStarts: number[] = [];
    for (let row = 0; row <= tessellation; row++) {
      rowStarts.push(position.length / 3);
      const v = row / tessellation;
      for (let column = 0; column <= tessellation - row; column++) {
        const u = column / tessellation;
        const east = ax + (bx - ax) * u + (cx - ax) * v;
        const north = an + (bn - an) * u + (cn - an) * v;
        const ground = ay + (by - ay) * u + (cy - ay) * v;
        const tread = trail.sampleSurface(east, north);
        const color = tread === undefined ? naturalColor : trailColor;
        if (tread !== undefined) treadVertices++;
        position.push(east, tread ?? ground, -north);
        colors.push(color.r, color.g, color.b);
      }
    }
    for (let row = 0; row < tessellation; row++) {
      const current = rowStarts[row]!, next = rowStarts[row + 1]!;
      for (let column = 0; column < tessellation - row; column++) {
        index.push(current + column, current + column + 1, next + column);
        if (column + row + 1 < tessellation) index.push(current + column + 1, next + column + 1, next + column);
      }
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(position, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return { geometry, refinedTriangles, treadVertices };
}
