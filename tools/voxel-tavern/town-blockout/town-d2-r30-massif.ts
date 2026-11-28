import { BufferGeometry, Color, Float32BufferAttribute, Group, Mesh, MeshLambertMaterial } from 'three';
import type { Material } from 'three';
import {
  sampleTownD2R30Height, sampleTownD2R30Normal, townD2R30ChunkList, townD2R30GridAxis,
  townD2R30Spec, townD2R30SurfaceBand,
} from './town-d2-r30-domain';
import type { TownD2R30Chunk, TownD2R30SurfaceBand } from './town-d2-r30-domain';

const palette: Record<TownD2R30SurfaceBand, Color> = {
  forest: new Color('#365846'),
  woodland: new Color('#587454'),
  snowfield: new Color('#d9e5e8'),
  'alpine-rock': new Color('#69747b'),
  glacier: new Color('#a8c9d4'),
  'summit-cap': new Color('#e8f3f5'),
};
const ochre = new Color('#a9784f');
const iceHighlight = new Color('#cfe9f2');
const deepRock = new Color('#414b53');
const dayColor = new Color('#ffffff');
const nightColor = new Color('#738aa8');
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

function smoothstep(lower: number, upper: number, value: number) {
  const weight = clamp01((value - lower) / (upper - lower));
  return weight * weight * (3 - 2 * weight);
}

function hashNoise(east: number, north: number) {
  const value = Math.sin(east * 127.1 + north * 311.7) * 43_758.5453;
  return value - Math.floor(value);
}

function valueNoise(east: number, north: number) {
  const x = Math.floor(east), n = Math.floor(north);
  const tx = east - x, tn = north - n;
  const sx = tx * tx * (3 - 2 * tx), sn = tn * tn * (3 - 2 * tn);
  const a = hashNoise(x, n), b = hashNoise(x + 1, n), c = hashNoise(x, n + 1), d = hashNoise(x + 1, n + 1);
  return (a + (b - a) * sx) * (1 - sn) + (c + (d - c) * sx) * sn;
}

/** Fractal noise used only for vertex-color modulation: it breaks the uniform
 *  sine striping so snow, ice and rock bands read as terrain-draped, not repeated. */
function fractalNoise(east: number, north: number) {
  return valueNoise(east, north) * .58 + valueNoise(east * 2.07 + 17, north * 2.07 - 11) * .28 +
    valueNoise(east * 4.13 - 23, north * 4.13 + 31) * .14;
}

function finiteSurfaceNormal(east: number, north: number, arrivalHeight: number): readonly [number, number, number] {
  const west = -townD2R30Spec.width / 2, eastBound = townD2R30Spec.width / 2;
  const south = -10, northBound = townD2R30Spec.depth - 10;
  if (east >= west + 2 && east <= eastBound - 2 && north >= south + 2 && north <= northBound - 2) {
    return sampleTownD2R30Normal(east, north, arrivalHeight);
  }
  // The frozen sampler rejects points outside the domain, so use one-sided
  // differences at its boundary instead of extending the height field.
  const eastLow = Math.max(west, east - 2), eastHigh = Math.min(eastBound, east + 2);
  const northLow = Math.max(south, north - 2), northHigh = Math.min(northBound, north + 2);
  const dx = (sampleTownD2R30Height(eastHigh, north, arrivalHeight)! -
    sampleTownD2R30Height(eastLow, north, arrivalHeight)!) / (eastHigh - eastLow);
  const dn = (sampleTownD2R30Height(east, northHigh, arrivalHeight)! -
    sampleTownD2R30Height(east, northLow, arrivalHeight)!) / (northHigh - northLow);
  const length = Math.hypot(dx, 1, dn);
  return [-dx / length, 1 / length, dn / length];
}

function surfaceColor(east: number, north: number, arrivalHeight: number, target: Color) {
  const height = sampleTownD2R30Height(east, north, arrivalHeight)!;
  const normal = finiteSurfaceNormal(east, north, arrivalHeight);
  const band = townD2R30SurfaceBand(east, north, arrivalHeight);
  const slope = 1 - normal[1];
  target.copy(palette[band]);
  if (band === 'alpine-rock') {
    // Strata read as layered rock bands that follow the relief, not a uniform
    // sine stripe: fractal noise at two scales breaks repetition along the ridge.
    const belt = smoothstep(415, 445, height) * (1 - smoothstep(525, 565, height)) *
      (1 - smoothstep(.38, .72, slope));
    target.lerp(ochre, belt * .82);
    const strata = .88 + .12 * (fractalNoise(east * .04, north * .03) - .5) * 2;
    target.multiplyScalar(strata);
  } else if (band === 'glacier') {
    // M08: read ice as layered, slope-facing surfaces rather than a flat fill.
    // Crevasses cut dark lines along the flow; shallow shelves catch a cold
    // blue highlight. Fractal noise makes the ice follow the terrain, not repeat.
    const flow = fractalNoise(east * .05, north * .035);
    const crevasse = Math.pow(Math.max(0, flow - .62), 2.2);
    target.multiplyScalar(1 - crevasse * .22);
    const shelf = smoothstep(.02, .22, slope) * (1 - smoothstep(.4, .7, slope));
    const shelfNoise = .6 + .4 * fractalNoise(east * .08, north * .06);
    target.lerp(iceHighlight, shelf * shelfNoise * .3);
  } else if (band === 'summit-cap') {
    target.lerp(palette.glacier, smoothstep(.08, .3, slope) * .34);
    // Soft, aspect-aware snow line: leeward shallow faces keep brighter snow,
    // while steep windward faces reveal the rock beneath. Fractal noise breaks
    // the uniform windward stripe so the cap reads as terrain-draped snow.
    const aspect = fractalNoise(east * .03, north * .02);
    const windward = clamp01(.5 + .5 * Math.sin(east * .012 - north * .009)) * (.7 + .3 * aspect);
    const exposure = smoothstep(.12, .42, slope) * windward;
    target.lerp(palette['alpine-rock'], exposure * .26);
  }
  // Fine grain: fractal noise at two scales so the surface never reads as a
  // flat repeated tint, with slope-based darkening for relief shading.
  const grain = .94 + .06 * (fractalNoise(east * .17, north * .11) - .5) * 2;
  target.multiplyScalar(grain * (1 - Math.min(.16, slope * .14)));
  return target;
}

function finishGeometry(geometry: BufferGeometry, name: string) {
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.name = name;
  return geometry;
}

/** A top-only, indexed terrain tile in east/height/-north coordinates. */
export function buildTownD2R30ChunkGeometry(
  chunk: TownD2R30Chunk, spacing: number = townD2R30Spec.canonicalSpacing, arrivalHeight: number = 347,
): BufferGeometry {
  if (!Number.isFinite(arrivalHeight)) throw new RangeError('Invalid D2-R01 arrival height.');
  const eastAxis = townD2R30GridAxis(chunk.west, chunk.east, spacing);
  const northAxis = townD2R30GridAxis(chunk.south, chunk.north, spacing);
  const positions = new Float32Array(eastAxis.length * northAxis.length * 3);
  const colors = new Float32Array(positions.length);
  const indices: number[] = [];
  const color = new Color();
  for (let row = 0; row < northAxis.length; row++) {
    const north = northAxis[row]!;
    for (let column = 0; column < eastAxis.length; column++) {
      const east = eastAxis[column]!;
      const vertex = row * eastAxis.length + column;
      const height = sampleTownD2R30Height(east, north, arrivalHeight)!;
      positions.set([east, height, -north], vertex * 3);
      surfaceColor(east, north, arrivalHeight, color);
      colors.set([color.r, color.g, color.b], vertex * 3);
      if (row + 1 === northAxis.length || column + 1 === eastAxis.length) continue;
      const nextRow = vertex + eastAxis.length;
      indices.push(vertex, vertex + 1, nextRow, vertex + 1, nextRow + 1, nextRow);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  return finishGeometry(geometry, `town-d2-r30-top-${chunk.key}`);
}

function massifPerimeter(eastAxis: readonly number[], northAxis: readonly number[]) {
  const west = eastAxis[0]!, east = eastAxis.at(-1)!;
  const south = northAxis[0]!, north = northAxis.at(-1)!;
  return [
    ...eastAxis.map(value => [value, south] as const),
    ...northAxis.slice(1).map(value => [east, value] as const),
    ...eastAxis.slice(0, -1).reverse().map(value => [value, north] as const),
    ...northAxis.slice(1, -1).reverse().map(value => [west, value] as const),
  ];
}

function buildSkirtGeometry(ring: readonly (readonly [number, number])[], arrivalHeight: number) {
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const color = new Color();
  for (let index = 0; index < ring.length; index++) {
    const [eastHere, northHere] = ring[index]!;
    const height = sampleTownD2R30Height(eastHere, northHere, arrivalHeight)!;
    const topColor = surfaceColor(eastHere, northHere, arrivalHeight, color);
    positions.push(eastHere, height, -northHere, eastHere, townD2R30Spec.floorHeight, -northHere);
    colors.push(topColor.r, topColor.g, topColor.b, deepRock.r, deepRock.g, deepRock.b);
    const next = (index + 1) % ring.length;
    const topHere = index * 2, bottomHere = topHere + 1;
    const topNext = next * 2, bottomNext = topNext + 1;
    // Ring order keeps the wall winding outward on every side.
    indices.push(topHere, bottomHere, topNext, topNext, bottomHere, bottomNext);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  return finishGeometry(geometry, 'town-d2-r30-closed-perimeter');
}

function buildFloorGeometry(ring: readonly (readonly [number, number])[]) {
  const y = townD2R30Spec.floorHeight;
  const positions = [0, y, 0], colors = [deepRock.r, deepRock.g, deepRock.b];
  for (const [east, north] of ring) {
    positions.push(east, y, -north);
    colors.push(deepRock.r, deepRock.g, deepRock.b);
  }
  const indices: number[] = [];
  // Subdivide every wall-bottom edge; a four-corner cap would leave T-junctions.
  for (let index = 0; index < ring.length; index++) {
    const current = index + 1, next = (index + 1) % ring.length + 1;
    indices.push(0, next, current);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  return finishGeometry(geometry, 'town-d2-r30-floor');
}

export type TownD2R30MassifOptions = Readonly<{ arrivalHeight?: number; spacing?: number }>;
export type TownD2R30MassifStats = Readonly<{
  spacing: number;
  vertices: number; triangles: number; meshes: number; draws: number;
  minHeight: number; maxHeight: number; minTopHeight: number;
}>;

/** Builds every top tile plus an outward-facing perimeter wall and bottom cap. */
export function createTownD2R30Massif(options: TownD2R30MassifOptions = {}) {
  const arrivalHeight = options.arrivalHeight ?? 347;
  const spacing = options.spacing ?? townD2R30Spec.canonicalSpacing;
  if (!Number.isFinite(arrivalHeight)) throw new RangeError('Invalid D2-R30 arrival height.');
  // Validate before allocating the 72 chunk meshes.
  townD2R30GridAxis(-townD2R30Spec.width / 2, townD2R30Spec.width / 2, spacing);
  const group = new Group();
  group.name = 'town-d2-r30-massif';
  const material = new MeshLambertMaterial({ color: dayColor.clone(), vertexColors: true });
  let vertices = 0, triangles = 0, minHeight = Infinity, maxHeight = -Infinity, minTopHeight = Infinity;
  const addMesh = (geometry: BufferGeometry) => {
    const mesh = new Mesh(geometry, material);
    mesh.name = geometry.name;
    group.add(mesh);
    vertices += geometry.getAttribute('position').count;
    triangles += (geometry.getIndex()?.count ?? 0) / 3;
    geometry.computeBoundingBox();
    minHeight = Math.min(minHeight, geometry.boundingBox!.min.y);
    maxHeight = Math.max(maxHeight, geometry.boundingBox!.max.y);
  };
  for (const chunk of townD2R30ChunkList) {
    const geometry = buildTownD2R30ChunkGeometry(chunk, spacing, arrivalHeight);
    geometry.computeBoundingBox();
    minTopHeight = Math.min(minTopHeight, geometry.boundingBox!.min.y);
    addMesh(geometry);
  }
  const perimeter = massifPerimeter(
    townD2R30GridAxis(-townD2R30Spec.width / 2, townD2R30Spec.width / 2, spacing),
    townD2R30GridAxis(-10, townD2R30Spec.depth - 10, spacing),
  );
  addMesh(buildSkirtGeometry(perimeter, arrivalHeight));
  addMesh(buildFloorGeometry(perimeter));
  const stats: TownD2R30MassifStats = Object.freeze({
    spacing,
    vertices, triangles, meshes: group.children.length, draws: group.children.length,
    minHeight, maxHeight, minTopHeight,
  });
  let disposed = false;
  return {
    group,
    heightAt: (east: number, north: number) => sampleTownD2R30Height(east, north, arrivalHeight),
    stats: () => stats,
    setNight(night: number) {
      if (disposed) throw new Error('The D2-R30 massif is disposed.');
      if (!Number.isFinite(night)) throw new RangeError('Invalid D2-R30 night blend.');
      material.color.copy(dayColor).lerp(nightColor, clamp01(night));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const geometries = new Set<BufferGeometry>();
      const materials = new Set<Material>();
      group.traverse(object => {
        if (!(object instanceof Mesh)) return;
        geometries.add(object.geometry);
        const list = Array.isArray(object.material) ? object.material : [object.material];
        list.forEach(item => materials.add(item));
      });
      group.removeFromParent();
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(item => item.dispose());
      group.clear();
    },
  };
}
