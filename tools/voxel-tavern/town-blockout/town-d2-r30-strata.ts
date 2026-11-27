import {
  BufferGeometry, Color, Float32BufferAttribute, Group, Mesh, MeshLambertMaterial,
} from 'three';
import { createMainSummitBlock, mainSummitBounds, mainSummitLayout, mainSummitSpec } from './main-summit-block';
import { createMainSummitTrail } from './main-summit-trail';
import {
  sampleTownD2R30Height, townD2R30Anchors,
} from './town-d2-r30-domain';

export type TownD2R30StrataOptions = Readonly<{
  heightAt?: typeof sampleTownD2R30Height;
  arrivalHeight?: number;
}>;

type Point = Readonly<{ east: number; north: number }>;
type RoadSegment = Readonly<{ a: Point; b: Point }>;
type RoadSurvey = Readonly<{ segments: readonly RoadSegment[]; cells: ReadonlyMap<string, readonly RoadSegment[]> }>;
type GlacierSample = Readonly<{ east: number; north: number; height: number; red: number; green: number; blue: number }>;

export const townD2R30StrataSpec = Object.freeze({
  contourLevels: Object.freeze([235, 335, 435, 545, 665] as const),
  ochreLevel: 435,
  contourGridStep: 24,
  rockBandWidth: 1.6,
  ochreBandWidth: 2.2,
  rockGroundOffset: .14,
  glacierGroundOffset: .18,
  glacierAlongFrom: -420,
  glacierAlongTo: 420,
  glacierAlongSteps: 96,
  glacierAcrossSteps: 6,
  glacierMinimumWidth: 12,
  glacierMaximumWidth: 24,
  facilityClearance: 24,
  roadClearance: 15,
  roadCellSize: 32,
});

const DAY_ROCK_COLORS = Object.freeze(['#343c42', '#41494f', '#2b3339', '#4a5257'] as const);
const DAY_OCHRE_COLORS = Object.freeze(['#a47b3f', '#8e6838', '#b08a4d'] as const);
const ICE_BLUE = new Color('#79bdd8');
const ICE_LIGHT = new Color('#b7e4ef');
const SNOW_WHITE = new Color('#f3fbfc');
const roadSurveys = new Map<number, RoadSurvey>();
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const outside = (value: number, minimum: number, maximum: number) => Math.max(minimum - value, value - maximum, 0);

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

/** Fractal noise for glacier drape: replaces uniform sine meander/width/streak
 *  so each ice rib follows its own valley terrain instead of repeating a wave. */
function fractalNoise(east: number, north: number) {
  return valueNoise(east, north) * .58 + valueNoise(east * 2.07 + 17, north * 2.07 - 11) * .28 +
    valueNoise(east * 4.13 - 23, north * 4.13 + 31) * .14;
}

function rectangleDistance(east: number, north: number, rectangle: {
  west: number; east: number; south: number; north: number;
}) {
  return Math.hypot(outside(east, rectangle.west, rectangle.east), outside(north, rectangle.south, rectangle.north));
}

function pointSegmentDistance(east: number, north: number, segment: RoadSegment) {
  const dx = segment.b.east - segment.a.east, dn = segment.b.north - segment.a.north;
  const lengthSquared = dx * dx + dn * dn;
  const fraction = lengthSquared > 0
    ? clamp01(((east - segment.a.east) * dx + (north - segment.a.north) * dn) / lengthSquared)
    : 0;
  return Math.hypot(east - segment.a.east - fraction * dx, north - segment.a.north - fraction * dn);
}

/** Cache only the immutable road survey; its temporary block geometry is disposed immediately. */
function roadSurvey(arrivalHeight: number): RoadSurvey {
  const cached = roadSurveys.get(arrivalHeight);
  if (cached) return cached;
  const block = createMainSummitBlock(mainSummitLayout, arrivalHeight, 512);
  try {
    const trail = createMainSummitTrail(block.heightAt, arrivalHeight);
    const segments = trail.points.slice(1).map((point, index) => ({
      a: { east: trail.points[index]!.east, north: trail.points[index]!.north },
      b: { east: point.east, north: point.north },
    }));
    const buckets = new Map<string, RoadSegment[]>();
    const size = townD2R30StrataSpec.roadCellSize;
    const margin = townD2R30StrataSpec.roadClearance;
    for (const segment of segments) {
      const west = Math.floor((Math.min(segment.a.east, segment.b.east) - margin) / size);
      const east = Math.floor((Math.max(segment.a.east, segment.b.east) + margin) / size);
      const south = Math.floor((Math.min(segment.a.north, segment.b.north) - margin) / size);
      const north = Math.floor((Math.max(segment.a.north, segment.b.north) + margin) / size);
      for (let column = west; column <= east; column++) for (let row = south; row <= north; row++) {
        const key = `${column}:${row}`;
        const bucket = buckets.get(key);
        if (bucket) bucket.push(segment);
        else buckets.set(key, [segment]);
      }
    }
    const survey: RoadSurvey = { segments, cells: buckets };
    roadSurveys.set(arrivalHeight, survey);
    return survey;
  } finally {
    block.dispose();
  }
}

function roadDistance(survey: RoadSurvey, east: number, north: number) {
  const size = townD2R30StrataSpec.roadCellSize;
  const bucket = survey.cells.get(`${Math.floor(east / size)}:${Math.floor(north / size)}`);
  if (!bucket) return Infinity;
  let distance = Infinity;
  for (const segment of bucket) distance = Math.min(distance, pointSegmentDistance(east, north, segment));
  return distance;
}

function protectedFacilities(arrivalPlazaNorth: number) {
  const summit = townD2R30Anchors.summit;
  const [plateauWidth, plateauDepth] = mainSummitSpec.summitPlateau;
  const [plazaWidth] = mainSummitSpec.arrivalPlaza;
  const margin = townD2R30StrataSpec.facilityClearance;
  return [
    {
      west: summit.east - plateauWidth / 2 - margin,
      east: summit.east + plateauWidth / 2 + margin,
      south: summit.north - plateauDepth / 2 - margin,
      north: summit.north + plateauDepth / 2 + margin,
    },
    {
      west: -plazaWidth / 2 - margin,
      east: plazaWidth / 2 + margin,
      south: mainSummitBounds.south - margin,
      north: arrivalPlazaNorth + margin,
    },
  ];
}

type ContourMesh = Readonly<{
  mesh: Mesh<BufferGeometry, MeshLambertMaterial>;
  segments: number;
  level: number;
}>;

function makeContourMesh(
  positions: number[], colors: number[], level: number, segments: number, ochre: boolean,
): ContourMesh | undefined {
  if (!positions.length) return;
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const material = new MeshLambertMaterial({
    color: '#ffffff', vertexColors: true, flatShading: true,
    transparent: false, opacity: 1, depthWrite: true,
  });
  material.name = ochre ? 'town-d2-r30-ochre-rock-lambert' : 'town-d2-r30-dark-rock-lambert';
  const mesh = new Mesh(geometry, material);
  mesh.name = ochre ? 'town-d2-r30-ochre-rock-band' : 'town-d2-r30-dark-rock-bands';
  mesh.userData = {
    kind: 'rock-contours', contourLevel: level, contourSegments: segments,
    groundOffset: townD2R30StrataSpec.rockGroundOffset,
    bandWidth: ochre ? townD2R30StrataSpec.ochreBandWidth : townD2R30StrataSpec.rockBandWidth,
  };
  return { mesh, segments, level };
}

const MARCHING_CASES: readonly (readonly (readonly [number, number])[])[] = [
  [], [[3, 0]], [[0, 1]], [[3, 1]], [[1, 2]],
  [[0, 1], [2, 3]], [[0, 2]], [[3, 2]], [[2, 3]],
  [[0, 2]], [[3, 0], [1, 2]], [[1, 2]], [[1, 3]],
  [[0, 1]], [[3, 0]], [],
];

function buildContours(
  groundAt: (east: number, north: number) => number | undefined,
): { dark?: ContourMesh; ochre?: ContourMesh; segments: number; levels: Readonly<Record<number, number>> } {
  const { west, east, south, north } = mainSummitBounds;
  const step = townD2R30StrataSpec.contourGridStep;
  const xs = [west];
  const ns = [south];
  for (let value = west + step; value < east; value += step) xs.push(value);
  for (let value = south + step; value < north; value += step) ns.push(value);
  xs.push(east);
  ns.push(north);
  const columns = xs.length, rows = ns.length;
  const heights = new Float64Array(columns * rows);
  heights.fill(NaN);
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const height = groundAt(xs[column]!, ns[row]!);
    if (height !== undefined && Number.isFinite(height)) heights[row * columns + column] = height;
  }

  const darkPositions: number[] = [], darkColors: number[] = [];
  const ochrePositions: number[] = [], ochreColors: number[] = [];
  const levelCounts: Record<number, number> = {};
  const tint = new Color();
  let totalSegments = 0;
  for (const level of townD2R30StrataSpec.contourLevels) {
    let levelSegments = 0;
    const ochre = level === townD2R30StrataSpec.ochreLevel;
    const positions = ochre ? ochrePositions : darkPositions;
    const colorData = ochre ? ochreColors : darkColors;
    const palette = ochre ? DAY_OCHRE_COLORS : DAY_ROCK_COLORS;
    const halfWidth = (ochre ? townD2R30StrataSpec.ochreBandWidth : townD2R30StrataSpec.rockBandWidth) / 2;
    for (let row = 0; row < rows - 1; row++) for (let column = 0; column < columns - 1; column++) {
      const indices = [
        row * columns + column, row * columns + column + 1,
        (row + 1) * columns + column + 1, (row + 1) * columns + column,
      ];
      const cornerHeights = indices.map(index => heights[index]!);
      if (cornerHeights.some(height => !Number.isFinite(height))) continue;
      const corners = [
        { east: xs[column]!, north: ns[row]! },
        { east: xs[column + 1]!, north: ns[row]! },
        { east: xs[column + 1]!, north: ns[row + 1]! },
        { east: xs[column]!, north: ns[row + 1]! },
      ];
      let mask = 0;
      for (let corner = 0; corner < 4; corner++) if (cornerHeights[corner]! >= level) mask |= 1 << corner;
      let cases = MARCHING_CASES[mask]!;
      if (mask === 5 || mask === 10) {
        const centreHigh = cornerHeights.reduce((sum, height) => sum + height, 0) / 4 >= level;
        cases = mask === 5
          ? (centreHigh ? [[0, 1], [2, 3]] : [[3, 0], [1, 2]])
          : (centreHigh ? [[3, 0], [1, 2]] : [[0, 1], [2, 3]]);
      }
      const edgeCorners = [[0, 1], [1, 2], [3, 2], [0, 3]] as const;
      const edgePoint = (edge: number): Point => {
        const [from, to] = edgeCorners[edge]!;
        const delta = cornerHeights[to]! - cornerHeights[from]!;
        const fraction = delta === 0 ? .5 : clamp01((level - cornerHeights[from]!) / delta);
        return {
          east: corners[from]!.east + (corners[to]!.east - corners[from]!.east) * fraction,
          north: corners[from]!.north + (corners[to]!.north - corners[from]!.north) * fraction,
        };
      };
      for (const [firstEdge, secondEdge] of cases) {
        const a = edgePoint(firstEdge), b = edgePoint(secondEdge);
        const dx = b.east - a.east, dn = b.north - a.north;
        const length = Math.hypot(dx, dn);
        if (length < 1e-6) continue;
        const acrossEast = -dn / length * halfWidth, acrossNorth = dx / length * halfWidth;
        const footprint = [
          { east: a.east - acrossEast, north: a.north - acrossNorth },
          { east: a.east + acrossEast, north: a.north + acrossNorth },
          { east: b.east + acrossEast, north: b.north + acrossNorth },
          { east: b.east - acrossEast, north: b.north - acrossNorth },
        ];
        const samples = footprint.map(point => groundAt(point.east, point.north));
        if (samples.some(height => height === undefined || !Number.isFinite(height))) continue;
        tint.set(palette[levelSegments % palette.length]!);
        for (const index of [0, 1, 2, 0, 2, 3]) {
          const point = footprint[index]!;
          positions.push(point.east, samples[index]! + townD2R30StrataSpec.rockGroundOffset, -point.north);
          colorData.push(tint.r, tint.g, tint.b);
        }
        levelSegments++;
      }
    }
    levelCounts[level] = levelSegments;
    totalSegments += levelSegments;
  }
  return {
    dark: makeContourMesh(darkPositions, darkColors, -1, totalSegments - (levelCounts[townD2R30StrataSpec.ochreLevel] ?? 0), false),
    ochre: makeContourMesh(ochrePositions, ochreColors, townD2R30StrataSpec.ochreLevel,
      levelCounts[townD2R30StrataSpec.ochreLevel] ?? 0, true),
    segments: totalSegments,
    levels: levelCounts,
  };
}

function valleyPoint(valley: (typeof townD2R30Anchors.valleys)[number], along: number, across: number) {
  // Per-valley meander from fractal noise: each glacier follows its own valley
  // terrain instead of repeating one uniform sine wave across all four ribs.
  const meander = (fractalNoise(along * .011 + valley.east * .004, valley.north * .004) - .5) * 48;
  const offset = meander + across;
  return {
    east: valley.east + Math.cos(valley.heading) * along - Math.sin(valley.heading) * offset,
    north: valley.north + Math.sin(valley.heading) * along + Math.cos(valley.heading) * offset,
  };
}

function buildGlacier(
  valley: (typeof townD2R30Anchors.valleys)[number], valleyIndex: number,
  groundAt: (east: number, north: number) => number | undefined,
  facilities: ReturnType<typeof protectedFacilities>, survey: RoadSurvey,
): { mesh: Mesh<BufferGeometry, MeshLambertMaterial>; samples: number; triangles: number; minimumWidth: number; maximumWidth: number } {
  const alongSteps = townD2R30StrataSpec.glacierAlongSteps;
  const acrossSteps = townD2R30StrataSpec.glacierAcrossSteps;
  const columns = acrossSteps + 1;
  const samples: (GlacierSample | undefined)[] = new Array((alongSteps + 1) * columns);
  const tint = new Color();
  let minimumWidth = Infinity, maximumWidth = -Infinity;
  const protectedAt = (east: number, north: number) =>
    facilities.some(rectangle => rectangleDistance(east, north, rectangle) < townD2R30StrataSpec.facilityClearance) ||
    roadDistance(survey, east, north) < townD2R30StrataSpec.roadClearance;

  for (let row = 0; row <= alongSteps; row++) {
    const along = townD2R30StrataSpec.glacierAlongFrom +
      (townD2R30StrataSpec.glacierAlongTo - townD2R30StrataSpec.glacierAlongFrom) * row / alongSteps;
    const width = 18 + 6 * (fractalNoise(along * .013 + valley.east * .006, valley.north * .006 + valleyIndex) - .5) * 2;
    minimumWidth = Math.min(minimumWidth, width);
    maximumWidth = Math.max(maximumWidth, width);
    for (let column = 0; column <= acrossSteps; column++) {
      const fraction = column / acrossSteps * 2 - 1;
      const point = valleyPoint(valley, along, fraction * width / 2);
      const height = groundAt(point.east, point.north);
      if (height === undefined || !Number.isFinite(height) || protectedAt(point.east, point.north)) continue;
      const edge = Math.pow(Math.abs(fraction), 1.7);
      // Streak and snow line from fractal noise so the ice surface reads as
      // terrain-draped flow, not a uniform sine wave repeated on every rib.
      const streak = fractalNoise(along * .043 + valley.east * .008, fraction * 5 + valley.north * .008 + valleyIndex);
      const snow = clamp01(edge * .7 + Math.max(0, streak - .62) * 1.6);
      tint.copy(ICE_BLUE).lerp(ICE_LIGHT, .35 + streak * .3).lerp(SNOW_WHITE, snow * .85);
      samples[row * columns + column] = {
        ...point, height: height + townD2R30StrataSpec.glacierGroundOffset,
        red: tint.r, green: tint.g, blue: tint.b,
      };
    }
  }

  const sourceIndices: number[] = [];
  for (let row = 0; row < alongSteps; row++) for (let column = 0; column < acrossSteps; column++) {
    const here = row * columns + column;
    const corners = [samples[here], samples[here + 1], samples[here + columns + 1], samples[here + columns]];
    if (corners.some(sample => sample === undefined)) continue;
    // Reject a whole cell when its interior or an edge would bridge a keep-out,
    // even if all four corner samples happen to lie beyond it.
    let clear = true;
    for (const vertical of [0, .5, 1]) for (const horizontal of [0, .5, 1]) {
      const left = corners[0]!.east + (corners[3]!.east - corners[0]!.east) * vertical;
      const right = corners[1]!.east + (corners[2]!.east - corners[1]!.east) * vertical;
      const near = corners[0]!.north + (corners[3]!.north - corners[0]!.north) * vertical;
      const far = corners[1]!.north + (corners[2]!.north - corners[1]!.north) * vertical;
      const east = left + (right - left) * horizontal;
      const north = near + (far - near) * horizontal;
      if (protectedAt(east, north)) { clear = false; break; }
    }
    if (!clear) continue;
    sourceIndices.push(here, here + columns, here + 1, here + 1, here + columns, here + columns + 1);
  }
  if (!sourceIndices.length) throw new RangeError(`No clear glacier geometry remains in ${valley.id}.`);

  // Compact away samples belonging only to rejected cells so stats count real terrain samples.
  const remap = new Int32Array(samples.length);
  remap.fill(-1);
  const positions: number[] = [], colors: number[] = [];
  for (const source of sourceIndices) {
    if (remap[source] !== -1) continue;
    const sample = samples[source]!;
    remap[source] = positions.length / 3;
    positions.push(sample.east, sample.height, -sample.north);
    colors.push(sample.red, sample.green, sample.blue);
  }
  const indices = sourceIndices.map(source => remap[source]!);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const material = new MeshLambertMaterial({
    color: '#ffffff', vertexColors: true, flatShading: true,
    transparent: false, opacity: 1, depthWrite: true,
  });
  material.name = 'town-d2-r30-glacier-lambert';
  const mesh = new Mesh(geometry, material);
  mesh.name = `town-d2-r30-glacier-${valley.id}`;
  mesh.userData = {
    kind: 'glacier', valleyId: valley.id, groundOffset: townD2R30StrataSpec.glacierGroundOffset,
    minimumWidth, maximumWidth, roadClearance: townD2R30StrataSpec.roadClearance,
  };
  return { mesh, samples: positions.length / 3, triangles: indices.length / 3, minimumWidth, maximumWidth };
}

/**
 * Visual-only H235–665 rock bands and four terrain-draped valley glaciers.
 * The canonical surveyed trail, summit plateau and gate plaza are keep-outs;
 * no terrain, collision, viewer or road authority is changed.
 */
export function createTownD2R30Strata(options: TownD2R30StrataOptions = {}) {
  if (!options || typeof options !== 'object') throw new TypeError('D2-R30 strata options must be an object.');
  const arrivalHeight = options.arrivalHeight ?? 347;
  if (!Number.isFinite(arrivalHeight)) throw new RangeError('D2-R30 arrivalHeight must be finite.');
  const suppliedHeightAt = options.heightAt ?? sampleTownD2R30Height;
  if (typeof suppliedHeightAt !== 'function') throw new TypeError('D2-R30 heightAt must be a function.');
  const groundAt = (east: number, north: number) => {
    const height = suppliedHeightAt(east, north, arrivalHeight);
    return height !== undefined && Number.isFinite(height) ? height : undefined;
  };
  // The road reserve is the existing canonical survey, not a second invented route.
  const surveyArrivalHeight = arrivalHeight >= 347 && arrivalHeight <= 350 ? arrivalHeight : 347;
  const survey = roadSurvey(surveyArrivalHeight);
  const facilities = protectedFacilities(mainSummitSpec.arrivalPlaza[1]);
  const contours = buildContours(groundAt);
  const glaciers = townD2R30Anchors.valleys.map((valley, index) =>
    buildGlacier(valley, index, groundAt, facilities, survey));

  const group = new Group();
  group.name = 'town-d2-r30-strata';
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<MeshLambertMaterial>();
  const rockMaterial = contours.dark?.mesh.material;
  const ochreMaterial = contours.ochre?.mesh.material;
  // Every valley glacier owns its own material. Tinting only glaciers[0]
  // left three ice ribs bright at night — collect them all.
  const iceMaterials = glaciers.map(glacier => glacier.mesh.material);
  let vertices = 0, triangles = 0;
  const addMesh = (mesh: Mesh<BufferGeometry, MeshLambertMaterial>) => {
    group.add(mesh);
    geometries.add(mesh.geometry);
    materials.add(mesh.material);
    vertices += mesh.geometry.getAttribute('position').count;
    triangles += (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3;
  };
  if (contours.dark) addMesh(contours.dark.mesh);
  if (contours.ochre) addMesh(contours.ochre.mesh);
  for (const glacier of glaciers) addMesh(glacier.mesh);

  const stats = Object.freeze({
    contourSegments: contours.segments,
    glacierSamples: glaciers.reduce((sum, glacier) => sum + glacier.samples, 0),
    vertices,
    triangles,
    draws: group.children.length,
    contourLevels: townD2R30StrataSpec.contourLevels,
    contourLevelSegments: Object.freeze({ ...contours.levels }),
    glacierValleys: Object.freeze(townD2R30Anchors.valleys.map(valley => valley.id)),
    minimumGlacierWidth: Math.min(...glaciers.map(glacier => glacier.minimumWidth)),
    maximumGlacierWidth: Math.max(...glaciers.map(glacier => glacier.maximumWidth)),
    roadClearance: townD2R30StrataSpec.roadClearance,
  });
  group.userData = {
    visualOnly: true, includesWorldCollision: false, modifiesHeightAt: false,
    coordinateConvention: 'x=east,y=height,z=-north', night: false,
    contourLevels: townD2R30StrataSpec.contourLevels,
    glacierValleys: stats.glacierValleys,
  };
  let disposed = false;
  let night = false;
  return {
    group,
    stats: () => stats,
    setNight(value: boolean) {
      if (disposed) throw new Error('The D2-R30 strata are disposed.');
      if (typeof value !== 'boolean') throw new TypeError('setNight expects a boolean.');
      if (night === value) return;
      night = value;
      // Material tints only: rock loses more luminance than ice, with no new lights or draws.
      rockMaterial?.color.set(night ? '#64717d' : '#ffffff');
      ochreMaterial?.color.set(night ? '#7d817d' : '#ffffff');
      for (const material of iceMaterials) material.color.set(night ? '#c4d6df' : '#ffffff');
      group.userData.night = night;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.clear();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      group.userData.disposed = true;
    },
  };
}
