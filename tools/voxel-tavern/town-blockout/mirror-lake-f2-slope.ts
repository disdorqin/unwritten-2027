import { BufferGeometry, Float32BufferAttribute, Mesh, MeshLambertMaterial } from 'three';
import { mirrorLake, mirrorLakeIceInset } from '../../../src/shared/mirror-lake';
import layout from './layout.json';

type HeightAt = (east: number, north: number) => number;
type Stage = { runFraction: number; riseFraction: number };
type Profile = { stages: readonly Stage[]; halfWidth: number; rowStep: number; centerNorth?: number };
type Vertex = { east: number; north: number; height: number };

// The archived F2 route follows this latitude. Its relocated fishing stake
// belongs to the splitter's drawing and is independent of the slope.
const f2North = 210;
export const surveyedF2Corridor = {
  centerNorth: 210.85,
  halfWidth: .65,
  rowStep: .25,
  stages: [
    { runFraction: .4, riseFraction: .5 },
    { runFraction: .6, riseFraction: .5 },
  ],
} as const satisfies Profile;
const westLoop = layout.roads.find(road => road.id === 'west-loop')!;
const interpolate = (left: number, right: number, ratio: number) => left + (right - left) * ratio;

export function mirrorF2RoadAt(north: number) {
  const index = westLoop.points.findIndex(([, n]) => n <= north);
  if (index < 1) throw new RangeError('F2 must meet the existing west-loop segment.');
  const [east0, north0] = westLoop.points[index - 1];
  const [east1, north1] = westLoop.points[index];
  const gradient = (east1 - east0) / (north1 - north0);
  const centerEast = east0 + (north - north0) * gradient;
  return { centerEast, shoulderEast: centerEast - westLoop.width / 2 * Math.hypot(1, gradient) };
}

function eastIceRim(north: number) {
  const [cx, cn] = mirrorLake.center;
  const [rx, rn] = mirrorLake.radius;
  return cx + rx * Math.sqrt((1 - mirrorLakeIceInset / rn) ** 2 - ((north - cn) / rn) ** 2);
}

/**
 * Isolated review surface. The host would give this sampler precedence over
 * the old terrain only inside the block and restore the old terrain on exit.
 * Width and intermediate stages are caller inputs, with no production preset.
 */
export function createMirrorF2Slope(groundHeight: HeightAt, profile: Profile) {
  const { stages, halfWidth, rowStep, centerNorth = f2North } = profile;
  if (!(halfWidth > 0 && halfWidth <= 3 && rowStep > 0 && Number.isFinite(rowStep) &&
        Number.isFinite(centerNorth)) ||
      stages.length === 0 || stages.some(({ runFraction, riseFraction }, index) =>
        !(runFraction > (stages[index - 1]?.runFraction ?? 0) && runFraction < 1 &&
          riseFraction >= (stages[index - 1]?.riseFraction ?? 0) && riseFraction <= 1))) {
    throw new RangeError('Invalid F2 slope review profile.');
  }
  const south = centerNorth - halfWidth;
  const north = centerNorth + halfWidth;
  // Place the uphill break east of the entire strict ice rim. A flat toe
  // follows the rim so it does not move the ice criterion or the fishing stakes.
  const riseStart = eastIceRim(Math.max(south, mirrorLake.center[1]));
  const rowCount = Math.ceil((north - south) / rowStep);
  const breakpoints = [{ runFraction: 0, riseFraction: 0 }, ...stages, { runFraction: 1, riseFraction: 1 }];
  const rows = Array.from({ length: rowCount + 1 }, (_, index) => {
    const rowNorth = interpolate(south, north, index / rowCount);
    const { shoulderEast } = mirrorF2RoadAt(rowNorth);
    const shoulderHeight = groundHeight(shoulderEast, rowNorth);
    const rim = eastIceRim(rowNorth);
    if (!Number.isFinite(rim) || !(riseStart < shoulderEast && shoulderHeight > mirrorLake.height)) {
      throw new RangeError('F2 slope has no usable ice-to-shoulder span.');
    }
    return [
      { east: rim, north: rowNorth, height: mirrorLake.height },
      ...breakpoints.map(({ runFraction, riseFraction }) => ({
        east: interpolate(riseStart, shoulderEast, runFraction), north: rowNorth,
        height: interpolate(mirrorLake.height, shoulderHeight, riseFraction),
      })),
    ];
  });
  const columns = rows[0].length;
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(rows.flatMap(row =>
    row.flatMap(({ east, north, height }) => [east, height, -north])), 3));
  const triangles: number[] = [];
  for (let row = 0; row < rowCount; row++) for (let column = 0; column < columns - 1; column++) {
    const a = row * columns + column;
    const b = a + columns;
    if (rows[row][column].east < rows[row][column + 1].east) triangles.push(a, a + 1, b);
    if (rows[row + 1][column].east < rows[row + 1][column + 1].east) triangles.push(a + 1, b + 1, b);
  }
  geometry.setIndex(triangles);
  geometry.computeVertexNormals();
  const material = new MeshLambertMaterial({ color: '#becbd4' });
  const mesh = new Mesh(geometry, material);
  mesh.name = 'mirror-lake-f2-slope-review';
  let disposed = false;

  function heightAt(east: number, atNorth: number) {
    if (disposed || !Number.isFinite(east) || !Number.isFinite(atNorth) ||
        atNorth < south || atNorth > north || east < eastIceRim(atNorth) ||
        east > mirrorF2RoadAt(atNorth).shoulderEast) return;
    const rowPosition = (atNorth - south) / (north - south) * rowCount;
    const rowIndex = Math.min(Math.floor(rowPosition), rowCount - 1);
    const fraction = rowPosition - rowIndex;
    const lower = rows[rowIndex];
    const upper = rows[rowIndex + 1];
    const at = (a: Vertex, b: Vertex) => ({
      east: interpolate(a.east, b.east, fraction),
      height: interpolate(a.height, b.height, fraction),
    });
    for (let column = 0; column < columns - 1; column++) {
      const left = at(lower[column], upper[column]);
      const right = at(lower[column + 1], upper[column + 1]);
      if (east > right.east && column < columns - 2) continue;
      const diagonal = at(lower[column + 1], upper[column]);
      const [start, end] = east <= diagonal.east ? [left, diagonal] : [diagonal, right];
      if (end.east <= start.east) return start.height;
      const t = Math.min(1, Math.max(0, (east - start.east) / (end.east - start.east)));
      return interpolate(start.height, end.height, t);
    }
    return;
  }
  return {
    mesh, heightAt,
    dispose() {
      if (disposed) return;
      disposed = true;
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
