import {
  BoxGeometry, BufferGeometry, CanvasTexture, CylinderGeometry, DataTexture, DoubleSide, ExtrudeGeometry,
  Group, Material, Mesh, MeshBasicMaterial, MeshLambertMaterial, NearestFilter, Object3D, PlaneGeometry,
  RepeatWrapping, SRGBColorSpace, Shape, TorusGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  buildSwitchbackCenterline, createFrontRidgeSwitchbackRoad, hostGridAt, type SwitchbackPoint,
} from './front-ridge-switchback-road';
import { sampleNorthRidge350 } from './north-ridge-350-terrain';

/** D-5 supplement only. It does not own, move, or replace the T5 road. */
export const TOWN_D2_REST_STOP_TEXTS = Object.freeze({
  milepostTop: '盘山道',
  rest: '歇脚 · 前面陡，先喘口气',
  viewpoint: '半山回望 · 未写镇',
  warning: '崖侧慢行 · 夜里贴墙走',
});

export type RestStopPlacement = Readonly<{
  id: string;
  kind: 'milepost' | 'bench' | 'shelter' | 'viewpoint' | 'warning';
  east: number;
  north: number;
  height: number;
  /** True three-dimensional arc length from the road's first point. */
  distance: number;
  yaw: number;
  text: string;
}>;

export type D2Milepost = RestStopPlacement & Readonly<{
  kind: 'milepost';
  meters: number;
  /** Exact interpolated centreline station, before the shoulder offset. */
  centreEast: number;
  centreNorth: number;
  centreHeight: number;
  faceLabel: string;
  topLabel: '盘山道';
}>;
export type D2Bench = RestStopPlacement & Readonly<{ kind: 'bench'; turnDegrees: number }>;
export type D2Shelter = RestStopPlacement & Readonly<{ kind: 'shelter'; section: 'lower-end' | 'middle-cliff' }>;
export type D2Viewpoint = RestStopPlacement & Readonly<{
  kind: 'viewpoint';
  surveyedEast: 300;
  surveyedNorth: 400;
  /** Absolute world Y of the finished deck surface. */
  deckHeight: number;
}>;
export type D2Warning = RestStopPlacement & Readonly<{ kind: 'warning' }>;
export type HeightAt = (east: number, north: number, hintHeight?: number) => number;

type CreateOptions = Readonly<{
  centreline?: readonly SwitchbackPoint[];
  terrainAt?: HeightAt;
  gridAt?: HeightAt;
  surfaceAt?: HeightAt;
}>;

type SurveyPoint = SwitchbackPoint & Readonly<{ directionEast: number; directionNorth: number }>;
type Survey = {
  points: SurveyPoint[];
  length: number;
  baseIndex: number;
};

const MILE_INTERVAL = 250;
const MIN_BENCH_TURN = 120;
const MIN_BENCH_SPACING = 120;
const LOWER_SECTION_DESIGN_END = 1050;
const SHELTER_HALF_WIDTH = 2.05;
const SHELTER_HALF_DEPTH = 1.65;
const LOOKOUT_FOOTPRINT_RADIUS = 3.85;

/** Hide only superseded D-5 props; route signs and cable-station boards stay visible. */
export function hideLegacyD5Supplement(legacyGroup: Object3D) {
  const mileposts: Object3D[] = [];
  legacyGroup.traverse(object => {
    if (object.name.startsWith('switchback-mileage-') ||
        /(?:^|-)(?:bench|shelter|lookout)-/.test(object.name)) {
      object.visible = false;
    }
    if (object.name.startsWith('switchback-mileage-')) mileposts.push(object);
  });
  // Legacy mileage copy is an unnamed sibling plane, 0.14 m above and
  // 0.17 m in front of its stone. Do not blanket-hide unnamed signs.
  for (const post of mileposts) {
    for (const sibling of post.parent?.children ?? []) {
      if (sibling.name || !(sibling instanceof Mesh) ||
          !(sibling.geometry instanceof PlaneGeometry)) continue;
      if (sibling.position.distanceTo(post.position) <= 0.30) sibling.visible = false;
    }
  }
}

type GroundExtent = Readonly<{
  minGround: number;
  maxGround: number;
  base: number;
}>;

type TextFace = Readonly<{
  key: string;
  lines: readonly string[];
  width: number;
  height: number;
  engraved: boolean;
  anchor: Mesh;
}>;

type TextAtlasCell = Readonly<{
  key: string;
  lines: readonly string[];
  engraved: boolean;
  canvasWidth: number;
  canvasHeight: number;
}>;

type TextAtlasLayout = Readonly<{
  width: number;
  height: number;
  cells: ReadonlyMap<string, Readonly<{ x: number; y: number }>>;
}>;

/** Sample the complete rotated support footprint, including its boundary. */
function groundExtentAt(
  east: number,
  north: number,
  yaw: number,
  groundAt: HeightAt,
  halfWidth: number,
  halfDepth: number,
  circular = false,
): GroundExtent {
  const cosine = Math.cos(yaw), sine = Math.sin(yaw);
  const sample = (x: number, z: number) => groundAt(
    east + cosine * x + sine * z,
    north + sine * x - cosine * z,
  );
  let minGround = Infinity, maxGround = -Infinity;
  const include = (x: number, z: number) => {
    const height = sample(x, z);
    minGround = Math.min(minGround, height);
    maxGround = Math.max(maxGround, height);
  };
  const step = 0.25;
  if (circular) {
    include(0, 0);
    // Include the gradient-axis boundary points as well as the regular
    // ring samples, so a linear slope's exact high/low edges are retained.
    const gradientX = (sample(step, 0) - sample(-step, 0)) / (step * 2);
    const gradientZ = (sample(0, step) - sample(0, -step)) / (step * 2);
    const gradientLength = Math.hypot(gradientX, gradientZ);
    if (gradientLength > 1e-12) {
      include(gradientX / gradientLength * halfWidth, gradientZ / gradientLength * halfWidth);
      include(-gradientX / gradientLength * halfWidth, -gradientZ / gradientLength * halfWidth);
    }
    const rings = Math.ceil(halfWidth / step);
    for (let ring = 1; ring <= rings; ring++) {
      const radius = halfWidth * ring / rings;
      const count = Math.max(8, Math.ceil(Math.PI * 2 * radius / step));
      for (let i = 0; i < count; i++) {
        const angle = i / count * Math.PI * 2;
        include(Math.cos(angle) * radius, Math.sin(angle) * radius);
      }
    }
  } else {
    const columns = Math.ceil(halfWidth * 2 / step);
    const rows = Math.ceil(halfDepth * 2 / step);
    for (let column = 0; column <= columns; column++) {
      for (let row = 0; row <= rows; row++) {
        include(-halfWidth + halfWidth * 2 * column / columns,
          -halfDepth + halfDepth * 2 * row / rows);
      }
    }
  }
  if (![minGround, maxGround].every(Number.isFinite)) {
    throw new RangeError('D-5 support footprint has no finite ground extent.');
  }
  return { minGround, maxGround, base: maxGround + 0.03 };
}

function directionBetween(a: SwitchbackPoint, b: SwitchbackPoint) {
  const east = b.east - a.east, north = b.north - a.north;
  const length = Math.hypot(east, north) || 1;
  return { east: east / length, north: north / length };
}

/** Recompute 3D arc length; the road's legacy `cum` is planar only. */
function surveyCentreline(input: readonly SwitchbackPoint[]): Survey {
  if (input.length < 2) throw new RangeError('D-5 needs a surveyed centreline with at least two points.');
  const points: SurveyPoint[] = [];
  let length = 0;
  for (let i = 0; i < input.length; i++) {
    const point = input[i]!;
    if (![point.east, point.north, point.height].every(Number.isFinite)) {
      throw new RangeError(`Non-finite centreline point at index ${i}.`);
    }
    if (i > 0) {
      const previous = input[i - 1]!;
      length += Math.hypot(point.east - previous.east, point.north - previous.north,
        point.height - previous.height);
    }
    const previous = input[Math.max(0, i - 1)]!, next = input[Math.min(input.length - 1, i + 1)]!;
    const direction = directionBetween(previous, next);
    points.push({ ...point, cum: length, directionEast: direction.east, directionNorth: direction.north });
  }
  if (!Number.isFinite(length) || length <= 0) throw new RangeError('D-5 centreline has no finite 3D length.');
  return {
    points, length,
    baseIndex: points.findIndex(point => Math.abs(point.east - 526) < 0.01 && Math.abs(point.north - 329) < 0.01),
  };
}

function sampleDistance(survey: Survey, distance: number): SwitchbackPoint {
  const target = Math.max(0, Math.min(survey.length, distance));
  let low = 0, high = survey.points.length - 1;
  while (low + 1 < high) {
    const middle = (low + high) >> 1;
    if (survey.points[middle]!.cum <= target) low = middle; else high = middle;
  }
  const a = survey.points[low]!, b = survey.points[high]!;
  const span = b.cum - a.cum;
  const t = span > 0 ? (target - a.cum) / span : 0;
  return {
    east: a.east + (b.east - a.east) * t,
    north: a.north + (b.north - a.north) * t,
    height: a.height + (b.height - a.height) * t,
    cum: target,
  };
}

function nearestDistance(survey: Survey, target: number) {
  return survey.points.reduce((best, point) =>
    Math.abs(point.cum - target) < Math.abs(best.cum - target) ? point : best).cum;
}

function nearestPlanPoint(survey: Survey, east: number, north: number) {
  let best: SwitchbackPoint = survey.points[0]!, bestDistance = Infinity;
  for (let i = 1; i < survey.points.length; i++) {
    const a = survey.points[i - 1]!, b = survey.points[i]!;
    const vx = b.east - a.east, vn = b.north - a.north;
    const length2 = vx * vx + vn * vn;
    const t = length2 > 0 ? Math.max(0, Math.min(1,
      ((east - a.east) * vx + (north - a.north) * vn) / length2)) : 0;
    const pe = a.east + vx * t, pn = a.north + vn * t;
    const distance = Math.hypot(east - pe, north - pn);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { east: pe, north: pn, height: a.height + (b.height - a.height) * t,
        cum: a.cum + (b.cum - a.cum) * t };
    }
  }
  return { point: best, planDistance: bestDistance };
}

function bevelBox(width: number, height: number, depth: number, bevel = 0.025) {
  const shape = new Shape();
  const x = width / 2 - bevel, y = height / 2 - bevel;
  shape.moveTo(-x, -y); shape.lineTo(x, -y); shape.lineTo(x, y); shape.lineTo(-x, y); shape.closePath();
  const geometry = new ExtrudeGeometry(shape, {
    depth: Math.max(0.001, depth - bevel * 2), bevelEnabled: true,
    bevelSegments: 1, steps: 1, bevelSize: bevel, bevelThickness: bevel, curveSegments: 1,
  });
  geometry.translate(0, 0, -depth / 2 + bevel);
  geometry.computeVertexNormals();
  return geometry;
}

/** Shelf-pack unchanged 768 px label rasters; mipmaps stay off for crisp nearest sampling. */
function layoutTextAtlas(input: readonly TextAtlasCell[]): TextAtlasLayout | null {
  const gutter = 2, maxWidth = 4096, maxHeight = 4096;
  const strideWidth = 768 + gutter * 2;
  const maxColumns = Math.max(1, Math.floor((maxWidth - gutter) / strideWidth));
  const ordered = [...input].sort((a, b) => b.canvasHeight - a.canvasHeight);
  let best: (TextAtlasLayout & { area: number }) | null = null;
  for (let columns = 1; columns <= Math.min(maxColumns, ordered.length); columns++) {
    const width = gutter + columns * strideWidth;
    const cells = new Map<string, Readonly<{ x: number; y: number }>>();
    let x = gutter, y = gutter, rowHeight = 0;
    for (const cell of ordered) {
      if (x + 768 + gutter > width) {
        x = gutter; y += rowHeight; rowHeight = 0;
      }
      cells.set(cell.key, { x, y });
      x += strideWidth;
      rowHeight = Math.max(rowHeight, cell.canvasHeight + gutter * 2);
    }
    const height = y + rowHeight;
    if (height > maxHeight) continue;
    const area = width * height;
    if (!best || area < best.area || (area === best.area && height < best.height)) {
      best = { width, height, cells, area };
    }
  }
  if (!best) return null;
  const { area: _area, ...layout } = best;
  return layout;
}

export function createTownD2FrontRidgeRestStops(options: CreateOptions = {}) {
  const centreline = options.centreline ?? buildSwitchbackCenterline();
  const terrainAt = options.terrainAt ?? sampleNorthRidge350;
  const gridAt = options.gridAt ?? hostGridAt;
  const road = options.surfaceAt || options.centreline ? undefined : createFrontRidgeSwitchbackRoad();
  const survey = surveyCentreline(centreline);
  const group = new Group();
  group.name = 'town-d2-front-ridge-rest-stops';
  group.userData = { scope: 'D-5', roadMoved: false, distanceConvention: 'three-dimensional-centreline-arc' };
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<CanvasTexture | DataTexture>();
  let disposed = false;
  let textAtlasBuilt = false;
  const textFaces: TextFace[] = [];
  const placements: RestStopPlacement[] = [];
  const mileposts: D2Milepost[] = [];
  const benches: D2Bench[] = [];
  const shelters: D2Shelter[] = [];
  const warnings: D2Warning[] = [];

  function geometry<T extends BufferGeometry>(value: T): T { geometries.add(value); return value; }
  function material<T extends Material>(value: T): T { materials.add(value); return value; }
  function mesh(parent: Object3D, shape: BufferGeometry, surface: Material, name: string) {
    const item = new Mesh(geometry(shape), material(surface));
    item.name = name;
    parent.add(item);
    return item;
  }
  function place(id: string, built: Group, east: number, north: number, height: number, yaw: number) {
    built.name = id;
    built.position.set(east, height, -north);
    built.rotation.y = yaw;
    built.userData.survey = { east, north, height };
    group.add(built);
    return built;
  }
  function part(parent: Object3D, shape: BufferGeometry, surface: Material,
    x: number, y: number, z: number, name: string, rx = 0, ry = 0, rz = 0) {
    const item = mesh(parent, shape, surface, name);
    item.position.set(x, y, z); item.rotation.set(rx, ry, rz);
    return item;
  }

  // Tiny deterministic rasters give every plank and stone its own material grain
  // without adding draw calls; authored sign text still uses its separate atlas.
  function grainTexture(kind: 'wood' | 'stone') {
    const size = 32, data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const hash = ((x * 73 + y * 151 + x * y * 17) % 29) / 29;
      const value = kind === 'wood'
        ? 205 + Math.sin(x * 1.7 + Math.sin(y * 0.31) * 2) * 19 + hash * 13
        : 190 + hash * 49 + (Math.sin(x * 0.7 + y * 1.1) > 0.72 ? -24 : 0);
      const offset = (y * size + x) * 4;
      data[offset] = data[offset + 1] = data[offset + 2] = Math.max(0, Math.min(255, value));
      data[offset + 3] = 255;
    }
    const texture = new DataTexture(data, size, size);
    texture.colorSpace = SRGBColorSpace;
    texture.wrapS = texture.wrapT = RepeatWrapping;
    texture.magFilter = NearestFilter; texture.minFilter = NearestFilter; texture.generateMipmaps = false;
    textures.add(texture);
    return texture;
  }
  const woodGrain = grainTexture('wood'), stoneGrain = grainTexture('stone');
  const timber = material(new MeshLambertMaterial({ color: '#654b31', map: woodGrain }));
  const timberLight = material(new MeshLambertMaterial({ color: '#80613d', map: woodGrain }));
  const timberDark = material(new MeshLambertMaterial({ color: '#493724', map: woodGrain }));
  const stone = material(new MeshLambertMaterial({ color: '#858b87', map: stoneGrain }));
  const stoneDark = material(new MeshLambertMaterial({ color: '#626c6b', map: stoneGrain }));
  const stoneLight = material(new MeshLambertMaterial({ color: '#a1a29a', map: stoneGrain }));
  const snow = material(new MeshLambertMaterial({ color: '#e8ecf0' }));
  const snowShade = material(new MeshLambertMaterial({ color: '#bfcdd7' }));
  const moss = material(new MeshLambertMaterial({ color: '#4c5a43' }));
  const iron = material(new MeshLambertMaterial({ color: '#454a49' }));
  const rust = material(new MeshLambertMaterial({ color: '#8a4a34' }));
  const rope = material(new MeshLambertMaterial({ color: '#a48a5d' }));
  const engraving = material(new MeshBasicMaterial({ color: '#263c35', side: DoubleSide }));

  function canvasFace(parent: Object3D, lines: readonly string[], width: number, height: number,
    x: number, y: number, z: number, name: string, engraved = false) {
    const inset = part(parent, new PlaneGeometry(width, height), engraving, x, y, z, `${name}-inset`);
    inset.userData.authoredCopy = [...lines];
    if (typeof document === 'undefined') return inset;
    const canvasHeight = Math.max(128, Math.round(768 * height / width));
    textFaces.push({
      key: JSON.stringify([engraved, lines, width, height]), lines, width, height, engraved, anchor: inset,
    });
    return inset;
  }

  function buildTextAtlas(root: Group) {
    if (typeof document === 'undefined' || textFaces.length === 0) return;
    const unique = new Map<string, TextAtlasCell>();
    for (const face of textFaces) {
      if (unique.has(face.key)) continue;
      unique.set(face.key, {
        key: face.key, lines: face.lines, engraved: face.engraved, canvasWidth: 768,
        canvasHeight: Math.max(128, Math.round(768 * face.height / face.width)),
      });
    }
    const pages: Array<Readonly<{ cells: TextAtlasCell[]; layout: TextAtlasLayout }>> = [];
    const paginate = (cells: TextAtlasCell[]) => {
      const layout = layoutTextAtlas(cells);
      if (layout) pages.push({ cells, layout });
      else {
        const middle = Math.ceil(cells.length / 2);
        paginate(cells.slice(0, middle)); paginate(cells.slice(middle));
      }
    };
    paginate([...unique.values()]);
    for (const page of pages) {
      const locations = new Map<string, Readonly<{
        layout: TextAtlasLayout; x: number; y: number;
      }>>();
      const canvas = document.createElement('canvas');
      canvas.width = page.layout.width; canvas.height = page.layout.height;
      const context = canvas.getContext('2d');
      if (!context) continue;
      for (const cell of page.cells) {
        const position = page.layout.cells.get(cell.key)!;
        locations.set(cell.key, { layout: page.layout, ...position });
        context.save();
        context.translate(position.x, position.y);
        context.beginPath(); context.rect(0, 0, cell.canvasWidth, cell.canvasHeight); context.clip();
        context.fillStyle = cell.engraved ? '#858b87' : '#493724';
        context.fillRect(0, 0, cell.canvasWidth, cell.canvasHeight);
        context.strokeStyle = cell.engraved ? '#46534d' : '#a08358';
        context.lineWidth = 10; context.strokeRect(8, 8, cell.canvasWidth - 16, cell.canvasHeight - 16);
        context.fillStyle = cell.engraved ? '#263c35' : '#eee1bd';
        context.textAlign = 'center'; context.textBaseline = 'middle';
        const fontSize = Math.min(cell.canvasHeight / (cell.lines.length + 0.7),
          cell.canvasWidth / Math.max(...cell.lines.map(line => line.length)) * 1.55);
        context.font = `bold ${fontSize}px system-ui, sans-serif`;
        cell.lines.forEach((line, index) => context.fillText(line, cell.canvasWidth / 2,
          cell.canvasHeight * (index + 1) / (cell.lines.length + 1), cell.canvasWidth - 38));
        context.restore();
      }
      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      texture.magFilter = NearestFilter; texture.minFilter = NearestFilter; texture.generateMipmaps = false;
      textures.add(texture);
      const faceMaterial = material(new MeshBasicMaterial({ map: texture, side: DoubleSide }));
      faceMaterial.userData.authoredTextAtlas = true;
      const pieces = textFaces.flatMap(face => {
        const location = locations.get(face.key);
        if (!location) return [];
        const shape = new PlaneGeometry(face.width * 0.96, face.height * 0.94);
        const u0 = location.x / location.layout.width;
        const u1 = (location.x + 768) / location.layout.width;
        const v0 = 1 - (location.y + Math.max(128, Math.round(768 * face.height / face.width))) / location.layout.height;
        const v1 = 1 - location.y / location.layout.height;
        const uv = shape.getAttribute('uv');
        for (let i = 0; i < uv.count; i++) {
          uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
        }
        shape.translate(0, 0, 0.008);
        shape.applyMatrix4(face.anchor.matrixWorld);
        return [shape];
      });
      if (pieces.length === 0) {
        texture.dispose(); textures.delete(texture);
        faceMaterial.dispose(); materials.delete(faceMaterial);
        continue;
      }
      const merged = mergeGeometries(pieces);
      pieces.forEach(piece => piece.dispose());
      if (!merged) throw new Error('D-5 authored text atlas batch failed.');
      geometries.add(merged);
      const atlas = new Mesh(merged, faceMaterial);
      atlas.name = 'town-d2-authored-text-atlas';
      atlas.userData.authoredCopy = [...new Set(page.cells.flatMap(cell => [...cell.lines]))];
      root.add(atlas);
      textAtlasBuilt = true;
    }
  }

  function nail(parent: Object3D, x: number, y: number, z: number) {
    part(parent, new CylinderGeometry(0.025, 0.025, 0.045, 6), iron, x, y, z, 'hand-forged-nail', Math.PI / 2);
  }

  function batchStaticGeometry(root: Group) {
    root.updateMatrixWorld(true);
    const batches = new Map<Material, BufferGeometry[]>();
    const authoredCopy = new Map<Material, string[]>();
    const originals: Mesh[] = [];
    root.traverse(object => {
      if (!(object instanceof Mesh) || object.userData.structuralFoundation || Array.isArray(object.material)) return;
      if (object.material.userData.authoredTextAtlas) return;
      if (!textAtlasBuilt && Array.isArray(object.userData.authoredCopy)) return;
      if (Array.isArray(object.userData.authoredCopy)) {
        const copy = authoredCopy.get(object.material) ?? [];
        copy.push(...object.userData.authoredCopy); authoredCopy.set(object.material, copy);
      }
      const clone = object.geometry.clone();
      clone.applyMatrix4(object.matrixWorld);
      const flat = clone.index ? clone.toNonIndexed() : clone;
      if (flat !== clone) clone.dispose();
      const list = batches.get(object.material) ?? [];
      list.push(flat); batches.set(object.material, list); originals.push(object);
    });
    for (const original of originals) original.removeFromParent();
    for (const [surface, pieces] of batches) {
      const merged = mergeGeometries(pieces);
      pieces.forEach(piece => piece.dispose());
      if (!merged) throw new Error('D-5 static geometry batch failed.');
      geometries.add(merged);
      const batch = new Mesh(merged, surface);
      batch.name = `town-d2-static-${surface.uuid}`;
      const copy = authoredCopy.get(surface);
      if (copy) batch.userData.authoredCopy = copy;
      root.add(batch);
    }
  }

  function makeBench(id: string, point: SwitchbackPoint, east: number, north: number,
    height: number, yaw: number, turnDegrees: number): D2Bench {
    const built = new Group();
    for (let i = 0; i < 4; i++) {
      part(built, bevelBox(1.95, 0.10, 0.16), i % 2 ? timber : timberLight,
        0, 0.53, -0.30 + i * 0.20, 'seat-plank');
    }
    for (let i = 0; i < 2; i++) {
      part(built, bevelBox(1.95, 0.24, 0.09), timberLight,
        0, 0.86 + i * 0.27, -0.43, 'back-plank', -0.08);
    }
    // Shallow carved grain and worn end-grain keep the bevels readable at play distance.
    for (let i = 0; i < 4; i++) {
      part(built, bevelBox(1.68, 0.012, 0.012, 0.003), timberDark,
        0.04, 0.535, -0.215 + i * 0.20, 'seat-grain');
    }
    for (let i = 0; i < 2; i++) {
      part(built, bevelBox(1.72, 0.014, 0.012, 0.003), timber,
        0, 0.89 + i * 0.27, -0.378, 'back-grain', -0.08);
    }
    for (const side of [-1, 1]) {
      part(built, bevelBox(0.14, 0.53, 0.16), timberDark, side * 0.78, 0.265, 0, 'splayed-leg', 0, 0, side * 0.08);
      part(built, bevelBox(0.12, 0.12, 0.75), timberDark, side * 0.78, 0.10, 0, 'foot');
      part(built, bevelBox(0.10, 0.68, 0.10), timberDark, side * 0.78, 0.86, -0.43, 'back-post', -0.08);
      part(built, bevelBox(0.10, 0.10, 0.52), timberDark, side * 0.78, 0.36, -0.20, 'diagonal-brace', 0, side * 0.65);
      part(built, new CylinderGeometry(0.035, 0.035, 0.04, 6), iron,
        side * 0.78, 0.53, 0.34, 'seat-peg', Math.PI / 2);
      part(built, new CylinderGeometry(0.046, 0.046, 0.008, 8), rust,
        side * 0.78, 0.53, 0.362, 'seat-peg-rust-washer', Math.PI / 2);
    }
    part(built, bevelBox(1.88, 0.045, 0.35, 0.012), snow, 0, 0.603, -0.06, 'seat-snow', -0.015);
    part(built, bevelBox(1.91, 0.045, 0.15, 0.012), snowShade, 0, 1.165, -0.47, 'back-snow', -0.08);
    place(id, built, east, north, height, yaw);
    const value: D2Bench = { id, kind: 'bench', east, north, height, distance: point.cum,
      yaw, turnDegrees, text: '' };
    built.userData.placement = value; benches.push(value); placements.push(value);
    return value;
  }

  // Interpolate absolute 250 m targets so vertex spacing cannot accumulate drift.
  const groundAt = (east: number, north: number) =>
    (survey.baseIndex >= 0 && nearestPlanPoint(survey, east, north).point.cum <= survey.points[survey.baseIndex]!.cum
      ? gridAt : terrainAt)(east, north);
  const stopSurfaceAt = (east: number, north: number, centreHeight?: number) =>
    options.surfaceAt?.(east, north, centreHeight) ??
    road?.heightAt(east, north, centreHeight) ?? groundAt(east, north);
  for (let meters = MILE_INTERVAL; meters <= survey.length + 1e-8; meters += MILE_INTERVAL) {
    const point = sampleDistance(survey, meters);
    const before = sampleDistance(survey, Math.max(0, meters - 2));
    const after = sampleDistance(survey, Math.min(survey.length, meters + 2));
    const direction = directionBetween(before, after);
    const perpEast = -direction.north, perpNorth = direction.east;
    const left = groundAt(point.east + perpEast * 3, point.north + perpNorth * 3);
    const right = groundAt(point.east - perpEast * 3, point.north - perpNorth * 3);
    const side = left < right ? 1 : -1; // place on the downhill shoulder
    const east = point.east + perpEast * side * 2.35;
    const north = point.north + perpNorth * side * 2.35;
    const height = stopSurfaceAt(east, north, point.height) + 0.03;
    const yaw = Math.atan2(-direction.east, direction.north);
    const id = `town-d2-milepost-${meters}m`;
    const built = new Group();
    part(built, new CylinderGeometry(0.43, 0.52, 0.20, 7), stoneDark, 0, 0.10, 0, 'stone-footing', 0, 0.13);
    part(built, bevelBox(0.46, 1.25, 0.34, 0.035), timber, 0, 0.76, 0, 'square-timber-post');
    part(built, bevelBox(0.62, 0.13, 0.48, 0.025), timberDark, 0, 1.39, 0, 'snow-shedding-cap');
    part(built, bevelBox(0.50, 0.045, 0.36, 0.012), snow, 0, 1.47, 0, 'cap-snow', 0.025);
    part(built, bevelBox(0.41, 0.40, 0.035, 0.008), stoneLight, 0, 0.93, 0.19, 'mileage-inset');
    part(built, bevelBox(0.43, 0.16, 0.035, 0.008), timberDark, 0, 1.23, 0.19, 'route-name-inset');
    for (const x of [-0.12, 0.06]) {
      part(built, bevelBox(0.014, 0.82, 0.012, 0.003), timberDark,
        x, 0.78, 0.178, 'post-wood-grain');
    }
    part(built, bevelBox(0.012, 0.16, 0.012, 0.003), stoneDark,
      -0.30, 0.11, 0.39, 'footing-stone-crack', 0, 0, -0.45);
    part(built, bevelBox(0.16, 0.018, 0.10, 0.004), rust,
      0.18, 1.405, 0.18, 'cap-rust-scar');
    canvasFace(built, [`${meters} 米`], 0.36, 0.33, 0, 0.93, 0.214, 'mileage', true);
    canvasFace(built, [TOWN_D2_REST_STOP_TEXTS.milepostTop], 0.38, 0.12, 0, 1.23, 0.214, 'route-name');
    for (const x of [-0.15, 0.15]) for (const y of [0.80, 1.06]) nail(built, x, y, 0.226);
    part(built, new TorusGeometry(0.255, 0.018, 4, 12), rope, 0, 1.12, 0, 'old-binding-rope', Math.PI / 2);
    part(built, bevelBox(0.12, 0.08, 0.20, 0.015), moss, -0.22, 0.25, 0.08, 'footing-moss');
    place(id, built, east, north, height, yaw);
    const value: D2Milepost = { id, kind: 'milepost', east, north, height, distance: point.cum,
      yaw, meters, centreEast: point.east, centreNorth: point.north, centreHeight: point.height,
      faceLabel: `${meters} 米`, topLabel: TOWN_D2_REST_STOP_TEXTS.milepostTop,
      text: `${TOWN_D2_REST_STOP_TEXTS.milepostTop}\n${meters} 米` };
    built.userData.placement = value; mileposts.push(value); placements.push(value);
  }

  // Use the turn's interior bisector; forward tangents point outside a hairpin.
  let lastBenchDistance = -Infinity;
  for (let i = 1; i < survey.points.length - 1; i++) {
    const previous = survey.points[i - 1]!, point = survey.points[i]!, next = survey.points[i + 1]!;
    const incoming = directionBetween(previous, point), outgoing = directionBetween(point, next);
    const cosine = Math.max(-1, Math.min(1,
      incoming.east * outgoing.east + incoming.north * outgoing.north));
    const turnDegrees = Math.acos(cosine) * 180 / Math.PI;
    if (turnDegrees <= MIN_BENCH_TURN || point.cum - lastBenchDistance < MIN_BENCH_SPACING) continue;
    let insideEast = outgoing.east - incoming.east;
    let insideNorth = outgoing.north - incoming.north;
    const insideLength = Math.hypot(insideEast, insideNorth);
    if (insideLength < 1e-6) continue;
    insideEast /= insideLength; insideNorth /= insideLength;
    const east = point.east + insideEast * 2.55;
    const north = point.north + insideNorth * 2.55;
    makeBench(`town-d2-hairpin-bench-${Math.round(point.cum)}m`, point, east, north,
      stopSurfaceAt(east, north, point.height) + 0.03, Math.atan2(-insideEast, insideNorth), turnDegrees);
    lastBenchDistance = point.cum;
  }

  function signboard(parent: Object3D, text: string, id: string, width = 2.45, boardHeight = 0.64) {
    for (const x of [-width * 0.34, width * 0.34]) {
      part(parent, new CylinderGeometry(0.055, 0.075, 1.40, 7), timber,
        x, 0.70, -0.025, 'sign-support-post');
      part(parent, bevelBox(0.19, 0.10, 0.19, 0.018), stoneDark,
        x, 0.05, -0.025, 'sign-post-footing');
    }
    part(parent, bevelBox(width, boardHeight, 0.11, 0.025), timberDark, 0, 1.64, 0, 'sign-board');
    part(parent, bevelBox(width + 0.12, 0.08, 0.18, 0.018), timberLight, 0, boardHeight / 2 + 1.68, 0, 'sign-cap');
    for (let i = 0; i < 5; i++) {
      part(parent, bevelBox(0.012, boardHeight * 0.78, 0.008, 0.002), timber,
        -width * 0.40 + i * width * 0.20, 1.64, 0.059, 'sign-board-grain');
    }
    part(parent, bevelBox(width * 0.78, 0.018, 0.008, 0.002), rust,
      0, 1.64 - boardHeight * 0.34, 0.059, 'sign-weather-streak');
    canvasFace(parent, [text], width * 0.91, boardHeight * 0.76, 0, 1.64, 0.064, id);
    for (const x of [-width * 0.39, width * 0.39]) {
      nail(parent, x, 1.64, 0.082);
      part(parent, new CylinderGeometry(0.043, 0.043, 0.006, 8), rust,
        x, 1.64, 0.077, 'sign-nail-rust-washer', Math.PI / 2);
    }
  }

  function shelter(id: string, distance: number, section: D2Shelter['section']) {
    const point = sampleDistance(survey, distance);
    const directionEast = point.east - sampleDistance(survey, Math.max(0, distance - 3)).east;
    const directionNorth = point.north - sampleDistance(survey, Math.max(0, distance - 3)).north;
    const dl = Math.hypot(directionEast, directionNorth) || 1;
    const perpEast = -directionNorth / dl, perpNorth = directionEast / dl;
    const a = groundAt(point.east + perpEast * 6, point.north + perpNorth * 6);
    const b = groundAt(point.east - perpEast * 6, point.north - perpNorth * 6);
    const uphill = a >= b ? 1 : -1;
    const east = point.east + perpEast * uphill * 4.7;
    const north = point.north + perpNorth * uphill * 4.7;
    const yaw = Math.atan2(-perpEast * uphill, -perpNorth * uphill); // opening faces the road
    const extent = groundExtentAt(east, north, yaw, groundAt, SHELTER_HALF_WIDTH, SHELTER_HALF_DEPTH);
    const height = extent.base;
    const built = new Group();
    built.userData.foundation = {
      footprint: 'rotated-rectangle', halfWidth: SHELTER_HALF_WIDTH, halfDepth: SHELTER_HALF_DEPTH,
      ...extent,
    };
    const supportHeight = height - extent.minGround;
    const foundation = part(built,
      bevelBox(SHELTER_HALF_WIDTH * 2, supportHeight, SHELTER_HALF_DEPTH * 2,
        Math.min(0.04, supportHeight / 4)),
      stoneDark, 0, -supportHeight / 2, 0, 'shelter-stone-foundation');
    foundation.userData.structuralFoundation = true;
    // Dry-stone footing and staggered back/side walls leave the road side open.
    for (const x of [-1.65, -0.82, 0, 0.82, 1.65]) {
      part(built, bevelBox(0.76, 0.20, 0.58, 0.04), x % 2 ? stone : stoneDark,
        x, 0.10, 0, 'footing-block', 0, (x * 0.7) % 0.08);
    }
    for (let row = 0; row < 5; row++) {
      for (let column = 0; column < 5; column++) {
        const x = -1.56 + column * 0.78 + (row % 2) * 0.20;
        part(built, bevelBox(0.72, 0.32, 0.36 + (row % 2) * 0.05, 0.035),
          (row + column) % 3 ? stone : stoneDark, x, 0.33 + row * 0.32, -1.34,
          'back-wall-block', 0, ((row + column) % 3 - 1) * 0.025);
      }
    }
    for (const side of [-1, 1]) for (let row = 0; row < 3; row++) {
      part(built, bevelBox(0.34, 0.32, 0.66, 0.035), row % 2 ? stoneDark : stone,
        side * 1.67, 0.33 + row * 0.32, -0.93 + row * 0.18, 'side-wall-block');
    }
    // Chipped dry-stone arrises and shallow mortarless cracks, all within the old wall envelope.
    for (let row = 0; row < 4; row++) {
      part(built, bevelBox(0.014, 0.18, 0.012, 0.002), stoneDark,
        -1.18 + row * 0.77, 0.35 + row * 0.32, -1.147, 'wall-stone-crack', 0, 0, row % 2 ? 0.35 : -0.28);
      part(built, bevelBox(0.12, 0.025, 0.012, 0.003), stoneLight,
        -0.74 + row * 0.53, 0.45 + (row % 2) * 0.64, -1.146, 'wall-chipped-arris');
    }
    for (const x of [-1.65, 1.65]) {
      part(built, bevelBox(0.012, 1.48, 0.012, 0.002), timberDark,
        x + 0.055, 1.27, 1.185, 'shelter-post-grain');
    }
    for (const x of [-1.65, 1.65]) for (const z of [-1.20, 1.18]) {
      part(built, new CylinderGeometry(0.095, 0.12, 2.34, 7), timber,
        x, 1.22, z, 'hewn-post', 0, x * 0.12);
      part(built, new CylinderGeometry(0.13, 0.13, 0.08, 7), iron,
        x, 0.30, z, 'post-iron-collar');
    }
    part(built, bevelBox(3.62, 0.16, 0.16), timberDark, 0, 2.32, -1.20, 'back-plate');
    part(built, bevelBox(3.62, 0.14, 0.14), timberDark, 0, 2.30, 1.18, 'eave-plate');
    for (let i = 0; i < 9; i++) {
      const z = -1.45 + i * 0.36;
      part(built, bevelBox(3.88, 0.09, 0.32, 0.018), i % 2 ? timber : timberLight,
        0, 2.46 + (1.45 - Math.abs(z)) * 0.20, z, 'individual-roof-plank',
        Math.atan2(0.20 * Math.sign(z || 1), 1));
      part(built, bevelBox(3.82, 0.045, 0.25, 0.012), i % 3 ? snow : snowShade,
        0, 2.54 + (1.45 - Math.abs(z)) * 0.20, z, 'roof-snow',
        Math.atan2(0.20 * Math.sign(z || 1), 1));
    }
    part(built, new CylinderGeometry(0.09, 0.09, 3.96, 7), timberDark, 0, 2.78, 0, 'ridge-pole', 0, 0, Math.PI / 2);
    // Bench is part of each shelter; these are not hairpin-grid benches.
    for (let i = 0; i < 3; i++) {
      part(built, bevelBox(1.75, 0.10, 0.18), timberLight,
        0, 0.53, -0.72 + i * 0.20, 'shelter-seat-plank');
      part(built, bevelBox(1.52, 0.012, 0.012, 0.003), timberDark,
        0.05, 0.538, -0.621 + i * 0.20, 'shelter-seat-grain');
    }
    for (const x of [-0.68, 0.68]) part(built, bevelBox(0.14, 0.48, 0.42), stoneDark,
      x, 0.26, -0.42, 'shelter-seat-support');
    signboard(built, TOWN_D2_REST_STOP_TEXTS.rest, `${id}-rest-copy`);
    // Empty tin, a small wood pile and roof icicles make the rest stop read as used.
    part(built, new CylinderGeometry(0.10, 0.085, 0.17, 9, 1, true), iron,
      1.30, 0.79, -0.98, 'empty-tin-cup');
    part(built, new TorusGeometry(0.10, 0.015, 4, 10), iron, 1.30, 0.88, -0.98, 'cup-rim', Math.PI / 2);
    for (let i = 0; i < 5; i++) {
      const log = part(built, new CylinderGeometry(0.07, 0.08, 0.65, 7), i % 2 ? timber : timberDark,
        -1.35, 0.11 + (i % 2) * 0.11, 0.80 + Math.floor(i / 2) * 0.15, 'split-firewood', Math.PI / 2);
      log.rotation.z = (i % 2 ? 1 : -1) * 0.12;
    }
    for (const x of [-1.45, -0.55, 0.65, 1.50]) {
      part(built, new CylinderGeometry(0.015, 0.035, 0.34 + (x + 1.5) * 0.08, 5), snowShade,
        x, 2.23, 1.56, 'eave-icicle');
    }
    place(id, built, east, north, height, yaw);
    const value: D2Shelter = { id, kind: 'shelter', east, north, height, distance: point.cum,
      yaw, section, text: TOWN_D2_REST_STOP_TEXTS.rest };
    built.userData.placement = value; shelters.push(value); placements.push(value);
  }

  // Snap the card's approximate section boundaries to the measured line.
  shelter('town-d2-shelter-lower-end', nearestDistance(survey, LOWER_SECTION_DESIGN_END), 'lower-end');
  const middleAnchor = nearestPlanPoint(survey, 440, 520).point;
  shelter('town-d2-shelter-middle-cliff', middleAnchor.cum, 'middle-cliff');

  // Cliff warning follows the measured middle section and faces incoming walkers.
  const warningDistance = middleAnchor.cum + 55;
  const warningPoint = sampleDistance(survey, Math.min(survey.length, warningDistance));
  const warningBefore = sampleDistance(survey, Math.max(0, warningPoint.cum - 3));
  const warningAfter = sampleDistance(survey, Math.min(survey.length, warningPoint.cum + 3));
  const warningDirection = directionBetween(warningBefore, warningAfter);
  const warningEast = warningPoint.east - warningDirection.north * 2.45;
  const warningNorth = warningPoint.north + warningDirection.east * 2.45;
  const warningHeight = stopSurfaceAt(warningEast, warningNorth, warningPoint.height) + 0.03;
  const warningYaw = Math.atan2(-warningDirection.east, warningDirection.north);
  const warningGroup = new Group();
  for (const x of [-0.86, 0.86]) part(warningGroup, new CylinderGeometry(0.07, 0.09, 2.10, 7), timber,
    x, 1.05, 0, 'warning-post');
  signboard(warningGroup, TOWN_D2_REST_STOP_TEXTS.warning, 'cliff-warning-copy', 2.65, 0.72);
  part(warningGroup, bevelBox(2.70, 0.08, 0.17), timberLight, 0, 2.10, 0, 'warning-cap');
  place('town-d2-cliff-warning', warningGroup, warningEast, warningNorth, warningHeight, warningYaw);
  const warning: D2Warning = { id: 'town-d2-cliff-warning', kind: 'warning',
    east: warningEast, north: warningNorth, height: warningHeight,
    distance: warningPoint.cum, yaw: warningYaw, text: TOWN_D2_REST_STOP_TEXTS.warning };
  warningGroup.userData.placement = warning; warnings.push(warning); placements.push(warning);

  // The lookout anchor is exact; its support spans the real 3.85 m footprint.
  const viewpointEast = 300, viewpointNorth = 400;
  const nearestRoad = nearestPlanPoint(survey, viewpointEast, viewpointNorth);
  const extent = groundExtentAt(viewpointEast, viewpointNorth, 0, terrainAt,
    LOOKOUT_FOOTPRINT_RADIUS, LOOKOUT_FOOTPRINT_RADIUS, true);
  const viewpointHeight = extent.base;
  const deckHeight = viewpointHeight + 0.42;
  const lookout = new Group();
  lookout.userData.foundation = {
    footprint: 'circle', radius: LOOKOUT_FOOTPRINT_RADIUS, ...extent,
  };
  lookout.userData.deckHeight = deckHeight;
  const supportHeight = viewpointHeight - extent.minGround;
  const foundation = part(lookout,
    new CylinderGeometry(3.55, LOOKOUT_FOOTPRINT_RADIUS, supportHeight, 12),
    stoneDark, 0, -supportHeight / 2, 0, 'lookout-foundation');
  foundation.userData.structuralFoundation = true;
  const deck = part(lookout, new CylinderGeometry(3.55, 3.55, 0.42, 12),
    stoneDark, 0, 0.21, 0, 'lookout-deck');
  deck.userData.structuralFoundation = true;
  for (let ring = 0; ring < 3; ring++) {
    const count = 8 + ring * 3;
    for (let i = 0; i < count; i++) {
      const angle = i / count * Math.PI * 2 + ring * 0.19;
      const radius = 0.72 + ring * 0.92;
      part(lookout, bevelBox(0.70, 0.10, 0.56, 0.025), (i + ring) % 3 ? stone : stoneLight,
        Math.cos(angle) * radius, 0.37, Math.sin(angle) * radius, 'individual-paver',
        0, -angle + Math.PI / 2);
    }
  }
  // South-facing half parapet keeps the town view open.
  for (let i = 0; i < 7; i++) {
    const angle = Math.PI * (0.10 + i * 0.133);
    const x = Math.cos(angle) * 3.34, z = Math.sin(angle) * 3.34;
    part(lookout, bevelBox(0.94, 0.68, 0.32, 0.045), i % 2 ? stone : stoneDark,
      x, 0.76, z, 'parapet-block', 0, -angle);
    part(lookout, bevelBox(0.98, 0.08, 0.38, 0.022), snow,
      x, 1.13, z, 'parapet-snow', 0, -angle);
    part(lookout, bevelBox(0.012, 0.25, 0.012, 0.002), stoneDark,
      x - Math.cos(angle) * 0.17, 0.71, z - Math.sin(angle) * 0.17,
      'parapet-stone-crack', 0, -angle, i % 2 ? 0.32 : -0.32);
    part(lookout, bevelBox(0.26, 0.025, 0.018, 0.003), snowShade,
      x + Math.cos(angle) * 0.20, 1.09, z + Math.sin(angle) * 0.20,
      'parapet-melt-mark', 0, -angle);
  }
  part(lookout, bevelBox(2.42, 1.13, 0.48, 0.07), stone, 0, 0.985, 1.60, 'engraved-view-stone', -0.035);
  part(lookout, bevelBox(2.56, 0.13, 0.62, 0.035), stoneLight, 0, 1.605, 1.60, 'view-stone-cap');
  part(lookout, bevelBox(0.45, 0.035, 0.50, 0.012), snow,
    -0.72, 1.69, 1.57, 'view-stone-snow-cap', 0, 0, -0.035);
  for (const x of [-0.94, 0.91]) {
    part(lookout, bevelBox(0.014, 0.34, 0.012, 0.002), stoneDark,
      x, 0.98, 1.367, 'view-stone-crack', -0.035, 0, x > 0 ? 0.28 : -0.28);
  }
  canvasFace(lookout, [TOWN_D2_REST_STOP_TEXTS.viewpoint], 2.18, 0.56, 0, 0.995, 1.343,
    'viewpoint-engraving-north', true);
  canvasFace(lookout, [TOWN_D2_REST_STOP_TEXTS.viewpoint], 2.18, 0.56, 0, 0.995, 1.851,
    'viewpoint-engraving-south', true);
  // Empty old storm lantern: frame, glass, dead wick, no emitted light.
  part(lookout, new CylinderGeometry(0.065, 0.085, 1.62, 7), timberDark, 2.68, 1.25, -1.00, 'lantern-post');
  part(lookout, bevelBox(0.40, 0.08, 0.40), iron, 2.68, 2.10, -1.00, 'lantern-base');
  for (const x of [-0.15, 0.15]) for (const z of [-0.15, 0.15]) {
    part(lookout, new CylinderGeometry(0.014, 0.014, 0.38, 5), iron,
      2.68 + x, 2.30, -1.00 + z, 'lantern-cage');
  }
  part(lookout, new CylinderGeometry(0.23, 0.18, 0.10, 6), iron, 2.68, 2.52, -1.00, 'lantern-lid');
  part(lookout, new TorusGeometry(0.13, 0.018, 4, 10), rust, 2.68, 2.61, -1.00, 'lantern-handle', 0, Math.PI / 2);
  part(lookout, new CylinderGeometry(0.025, 0.025, 0.09, 5), timberDark, 2.68, 2.29, -1.00, 'empty-wick');
  for (let i = 0; i < 5; i++) {
    part(lookout, new CylinderGeometry(0.16 + i * 0.06, 0.21 + i * 0.07, 0.24, 6),
      i % 2 ? stoneDark : stone, -2.70 + i * 0.13, 0.54 + i * 0.22, -1.60, 'wayfinding-cairn',
      0, i * 0.33);
  }
  place('town-d2-viewpoint-300-400', lookout, viewpointEast, viewpointNorth, viewpointHeight, 0);
  const viewpoint: D2Viewpoint = { id: 'town-d2-viewpoint-300-400', kind: 'viewpoint',
    east: viewpointEast, north: viewpointNorth, height: viewpointHeight, deckHeight,
    distance: nearestRoad.point.cum, yaw: 0, text: TOWN_D2_REST_STOP_TEXTS.viewpoint,
    surveyedEast: 300, surveyedNorth: 400 };
  lookout.userData.placement = viewpoint; placements.push(viewpoint);

  group.updateMatrixWorld(true);
  buildTextAtlas(group);
  batchStaticGeometry(group);
  road?.dispose();

  const result = {
    group, placements, mileposts, benches, shelters, viewpoint,
    warnings, centreline: survey.points, totalLength: survey.length,
    materials: Object.freeze({ timber, timberLight, timberDark, stone, stoneDark, stoneLight,
      snow, snowShade, moss, iron, rust, rope }),
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      for (const child of [...group.children]) group.remove(child);
      group.clear();
      for (const shape of geometries) shape.dispose();
      for (const surface of materials) surface.dispose();
      for (const texture of textures) texture.dispose();
      geometries.clear(); materials.clear(); textures.clear();
      group.userData.disposed = true;
    },
  };
  return result;
}
