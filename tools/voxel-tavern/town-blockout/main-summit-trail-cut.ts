import { BufferGeometry, Float32BufferAttribute } from 'three';

type Point = Readonly<{ x: number; z: number }>;
type Normal = readonly [number, number, number];
type Vertex = Point & Readonly<{ y: number; normal?: Normal }>;
type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number };
type Boundary = { from: Vertex; to: Vertex; key: string };
type Triangle = {
  vertices: readonly [Vertex, Vertex, Vertex];
  edges: readonly Boundary[];
  bounds: Bounds;
  heightAt(point: Point): number;
  normalAt?(point: Point): Normal;
  orientation: number;
};

const tolerance = 1e-8;
const cutClearance = .02;
const cellSize = 16;

function cross(from: Point, to: Point, point: Point) {
  return (to.x - from.x) * (point.z - from.z) - (to.z - from.z) * (point.x - from.x);
}

function interpolate(a: Point, b: Point, fraction: number): Point {
  return { x: a.x + (b.x - a.x) * fraction, z: a.z + (b.z - a.z) * fraction };
}

function boundsOf(points: readonly Point[]): Bounds {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const { x, z } of points) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  return { minX, maxX, minZ, maxZ };
}

function overlaps(a: Bounds, b: Bounds) {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
}

function trianglesOf(geometry: BufferGeometry, preserveNormals = false) {
  const position = geometry.getAttribute('position');
  const normal = preserveNormals ? geometry.getAttribute('normal') : undefined;
  const index = geometry.getIndex();
  if (!position || !index) throw new TypeError('P-3 cuts require indexed terrain and tread meshes.');
  const vertices = Array.from({ length: position.count }, (_, i): Vertex => ({
    x: position.getX(i), z: position.getZ(i), y: position.getY(i),
    normal: normal && [normal.getX(i), normal.getY(i), normal.getZ(i)],
  }));
  const triangles: Triangle[] = [];
  for (let i = 0; i < index.count; i += 3) {
    const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    const a = vertices[ids[0]!]!, b = vertices[ids[1]!]!, c = vertices[ids[2]!]!;
    const area = cross(a, b, c);
    // The existing tread side faces have zero area when projected onto X/Z.
    if (Math.abs(area) <= tolerance) continue;
    const polygon = [a, b, c] as const;
    const [na, nb, nc] = [a.normal, b.normal, c.normal];
    triangles.push({
      vertices: polygon, bounds: boundsOf(polygon), orientation: Math.sign(area),
      edges: polygon.map((from, edge) => {
        const end = (edge + 1) % 3;
        const startId = ids[edge]!, endId = ids[end]!;
        return { from, to: polygon[end]!, key: startId < endId ? `${startId}:${endId}` : `${endId}:${startId}` };
      }),
      heightAt(point) {
        return a.y + (b.y - a.y) * cross(a, point, c) / area + (c.y - a.y) * cross(a, b, point) / area;
      },
      normalAt: na && nb && nc ? point => {
        const wb = cross(a, point, c) / area;
        const wc = cross(a, b, point) / area;
        const wa = 1 - wb - wc;
        // Keep the original linear normal field across any smaller surface triangles.
        return [
          na[0] * wa + nb[0] * wb + nc[0] * wc,
          na[1] * wa + nb[1] * wb + nc[1] * wc,
          na[2] * wa + nb[2] * wb + nc[2] * wc,
        ];
      } : undefined,
    });
  }
  return triangles;
}

function cellsFor({ minX, maxX, minZ, maxZ }: Bounds) {
  const keys: string[] = [];
  for (let x = Math.floor(minX / cellSize); x <= Math.floor(maxX / cellSize); x++) {
    for (let z = Math.floor(minZ / cellSize); z <= Math.floor(maxZ / cellSize); z++) keys.push(`${x}:${z}`);
  }
  return keys;
}

function clip(polygon: readonly Point[], distance: (point: Point) => number) {
  const result: Point[] = [];
  for (const [i, end] of polygon.entries()) {
    const start = polygon[(i + polygon.length - 1) % polygon.length]!;
    const before = distance(start), after = distance(end);
    if ((before > tolerance && after < -tolerance) || (before < -tolerance && after > tolerance)) {
      result.push(interpolate(start, end, before / (before - after)));
    }
    if (after >= -tolerance) result.push(end);
  }
  return result;
}

function areaOf(polygon: readonly Point[]) {
  return Math.abs(polygon.slice(2).reduce((sum, point, index) => sum + cross(polygon[0]!, polygon[index + 1]!, point), 0));
}

type Plane = (point: Point) => number;
type Surface = { polygon: readonly Point[]; heightAt: Plane; normalAt?: Triangle['normalAt']; isCut: boolean };
type SurfaceLayer = 'terrain' | 'floor' | 'bank';

function intersect(polygon: readonly Point[], sides: readonly Plane[]) {
  return sides.reduce<readonly Point[]>((region, side) => clip(region, side), polygon);
}

function subtract(regions: readonly (readonly Point[])[], cut: { sides: readonly Plane[]; bounds: Bounds }) {
  const outside: Array<readonly Point[]> = [];
  for (const region of regions) {
    if (!overlaps(boundsOf(region), cut.bounds) || areaOf(intersect(region, cut.sides)) <= tolerance) {
      outside.push(region);
      continue;
    }
    let island = region;
    for (const side of cut.sides) {
      const removed = clip(island, point => -side(point));
      if (areaOf(removed) > tolerance) outside.push(removed);
      island = clip(island, side);
    }
  }
  return outside;
}

function sharedEdges(surfaces: readonly Surface[]) {
  const lines = new Map<string, { useX: boolean; points: Map<number, Point> }>();
  const vertexTolerance = 1e-7;

  function describe(a: Point, b: Point) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    if (length <= vertexTolerance) return;
    const useX = Math.abs(dx) >= Math.abs(dz);
    const scale = Math.sign(useX ? dx : dz) / length;
    const x = dx * scale, z = dz * scale;
    const key = `${Math.round(x * 1e7)}:${Math.round(z * 1e7)}:${Math.round((x * a.z - z * a.x) * 1e5)}`;
    return { key, useX, length };
  }

  for (const { polygon } of surfaces) {
    for (const [index, a] of polygon.entries()) {
      const b = polygon[(index + 1) % polygon.length]!;
      const edge = describe(a, b);
      if (!edge) continue;
      let line = lines.get(edge.key);
      if (!line) lines.set(edge.key, line = { useX: edge.useX, points: new Map() });
      for (const point of [a, b]) line.points.set(Math.round((line.useX ? point.x : point.z) / vertexTolerance), point);
    }
  }

  const sorted = new Map([...lines].map(([key, line]) => [key, {
    useX: line.useX, points: [...line.points.values()].sort((a, b) => line.useX ? a.x - b.x : a.z - b.z),
  }]));
  return (a: Point, b: Point) => {
    const edge = describe(a, b);
    const line = edge && sorted.get(edge.key);
    if (!edge || !line || line.points.length <= 2) return [];
    const along = (point: Point) => line.useX ? point.x : point.z;
    const from = along(a), to = along(b);
    const start = Math.min(from, to) + vertexTolerance, end = Math.max(from, to) - vertexTolerance;
    const points = line.points.filter(point => along(point) > start && along(point) < end &&
      Math.abs(cross(a, b, point)) < edge.length * vertexTolerance);
    const rounded = ({ x, z }: Point): Point => ({ x: Math.fround(x), z: Math.fround(z) });
    const startRounded = rounded(a), endRounded = rounded(b);
    if (points.every(point => cross(startRounded, endRounded, rounded(point)) === 0)) return [];
    // Reuse the neighbour's actual vertex so the plan edge still joins after Float32 conversion.
    return from < to ? points : points.reverse();
  };
}

function exposedBankSpans(a: Point, b: Point, owner: Triangle, nearby: readonly Triangle[]) {
  const bounds = boundsOf([a, b]);
  const overlapsAlongEdge: Array<{ from: number; to: number }> = [];
  for (const triangle of nearby) {
    if (triangle === owner || !overlaps(bounds, triangle.bounds)) continue;
    let from = 0, to = 1;
    for (const { from: e, to: f } of triangle.edges) {
      const atStart = cross(e, f, a) * triangle.orientation;
      const atEnd = cross(e, f, b) * triangle.orientation;
      if (atStart <= tolerance && atEnd <= tolerance) {
        from = 1;
        break;
      }
      if (atStart < tolerance) from = Math.max(from, (tolerance - atStart) / (atEnd - atStart));
      if (atEnd < tolerance) to = Math.min(to, (atStart - tolerance) / (atStart - atEnd));
    }
    if (to > from) overlapsAlongEdge.push({ from, to });
  }

  const spans: Array<readonly [number, number]> = [];
  let end = 0;
  for (const { from, to } of overlapsAlongEdge.sort((left, right) => left.from - right.from)) {
    if (from > end) spans.push([end, from]);
    end = Math.max(end, to);
  }
  if (end < 1) spans.push([end, 1]);
  return spans;
}

/** Carve only the region where the original terrain would cover the rendered P-3 tread. */
export function buildMainSummitTrailCut(coarse: BufferGeometry, ribbon: BufferGeometry) {
  const terrain = trianglesOf(coarse, true);
  const tread = trianglesOf(ribbon);
  const cells = new Map<string, Triangle[]>();
  const edgeUses = new Map<string, number>();
  for (const triangle of tread) {
    for (const { key } of triangle.edges) edgeUses.set(key, (edgeUses.get(key) ?? 0) + 1);
    for (const cell of cellsFor(triangle.bounds)) {
      const bucket = cells.get(cell);
      if (bucket) bucket.push(triangle);
      else cells.set(cell, [triangle]);
    }
  }

  const positions: number[] = [];
  const indices: number[] = [];
  const emitted = new Map<string, number>();
  const sourceNormals = new Map<number, Normal>();
  const lowered = new Set<number>();
  const surfaces: Surface[] = [];
  let refinedTriangles = 0;

  function vertex(point: Point, y: number, layer: SurfaceLayer, normalAt?: Triangle['normalAt']) {
    const x = Math.fround(point.x), z = Math.fround(point.z), height = Math.fround(y);
    // Keep a hard shading edge where the surfaces meet at identical positions.
    const key = `${layer}:${x}:${height}:${z}`;
    const existing = emitted.get(key);
    if (existing !== undefined) return existing;
    const index = positions.length / 3;
    positions.push(x, height, z);
    emitted.set(key, index);
    if (normalAt) sourceNormals.set(index, normalAt(point));
    return index;
  }

  function surfaceTriangle(a: Point, b: Point, c: Point, surface: Surface) {
    if (Math.abs(cross(a, b, c)) <= tolerance) return;
    const layer = surface.isCut ? 'floor' : 'terrain';
    const corners = [a, b, c].map(point => vertex(point, surface.heightAt(point), layer, surface.normalAt));
    if (new Set(corners).size !== 3) return;
    indices.push(...corners);
    if (surface.isCut) corners.forEach(corner => lowered.add(corner));
  }

  function banks(polygon: readonly Point[], original: Triangle, cut: Triangle, nearby: readonly Triangle[]) {
    const perimeter = cut.edges.filter(edge => edgeUses.get(edge.key) === 1);
    for (const [i, a] of polygon.entries()) {
      const b = polygon[(i + 1) % polygon.length]!;
      const exposed = perimeter.some(({ from, to }) => Math.abs(cross(from, to, a)) <= tolerance &&
        Math.abs(cross(from, to, b)) <= tolerance);
      if (!exposed) continue;
      for (const [first, last] of exposedBankSpans(a, b, cut, nearby)) {
        const start = interpolate(a, b, first), end = interpolate(a, b, last);
        if (Math.hypot(start.x - end.x, start.z - end.z) <= tolerance) continue;
        const topA = vertex(start, original.heightAt(start), 'bank');
        const topB = vertex(end, original.heightAt(end), 'bank');
        const bottomA = vertex(start, cut.heightAt(start) - cutClearance, 'bank');
        const bottomB = vertex(end, cut.heightAt(end) - cutClearance, 'bank');
        // Original face winding follows the contour; the bank faces into the cut.
        if (topA !== bottomA) indices.push(topA, topB, bottomA);
        if (topB !== bottomB) indices.push(bottomA, topB, bottomB);
      }
    }
  }

  for (const original of terrain) {
    const nearby = [...new Set(cellsFor(original.bounds).flatMap(cell => cells.get(cell) ?? []))]
      .filter(triangle => overlaps(original.bounds, triangle.bounds));
    const cuts = nearby.flatMap(triangle => {
      const sides = triangle.edges.map(({ from, to }) => (point: Point) => cross(from, to, point) * triangle.orientation);
      sides.push(point => original.heightAt(point) - triangle.heightAt(point) + cutClearance);
      const polygon = intersect(original.vertices, sides);
      return areaOf(polygon) > tolerance ? [{ triangle, sides, polygon, bounds: boundsOf(polygon) }] : [];
    });
    let remaining: Array<readonly Point[]> = [original.vertices];
    for (const [index, cut] of cuts.entries()) {
      let floor = [cut.polygon];
      // A neighbouring tread can overlap in a hairpin. A cut floor needs only
      // the actual overlap removed, without inheriting the uncut face's fans.
      for (const prior of cuts.slice(0, index)) if (overlaps(prior.bounds, cut.bounds)) floor = subtract(floor, prior);
      for (const polygon of floor) {
        surfaces.push({ polygon, heightAt: point => cut.triangle.heightAt(point) - cutClearance, isCut: true });
        banks(polygon, original, cut.triangle, nearby);
      }
      remaining = subtract(remaining, cut);
    }
    if (cuts.length) refinedTriangles++;
    for (const polygon of remaining) {
      surfaces.push({ polygon, heightAt: original.heightAt, normalAt: original.normalAt, isCut: false });
    }
  }

  const splits = sharedEdges(surfaces);
  for (const surface of surfaces) {
    const { polygon } = surface;
    const edges = polygon.map((from, index) => [from, ...splits(from, polygon[(index + 1) % polygon.length]!)]);
    const fan = edges.findIndex((edge, index) => edge.length === 1 && edges[(index + edges.length - 1) % edges.length]!.length === 1);
    if (fan >= 0) {
      const boundary = [...edges.slice(fan), ...edges.slice(0, fan)].flat();
      for (let i = 2; i < boundary.length; i++) surfaceTriangle(boundary[0]!, boundary[i - 1]!, boundary[i]!, surface);
      continue;
    }
    const boundary = edges.flat();
    const centre = {
      x: polygon.reduce((sum, point) => sum + point.x, 0) / polygon.length,
      z: polygon.reduce((sum, point) => sum + point.z, 0) / polygon.length,
    };
    for (const [i, from] of boundary.entries()) {
      surfaceTriangle(centre, from, boundary[(i + 1) % boundary.length]!, surface);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute('normal');
  for (const [index, normal] of sourceNormals) normals.setXYZ(index, ...normal);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return { geometry, refinedTriangles, loweredVertices: lowered.size };
}
