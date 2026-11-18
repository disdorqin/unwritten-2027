import {
  BoxGeometry, BufferGeometry, Color, CylinderGeometry, Float32BufferAttribute,
  Group, InstancedMesh, Mesh, MeshBasicMaterial, MeshLambertMaterial, Object3D, type Camera,
} from 'three';
import { canEnter, isWater, layout, riverX, type createTerrainGrid } from './terrain';
import { districtParcels, districtStreets, extensionPlots, extensionRoads, memorialInfill } from './town-extension';
import type { Box } from './landmark-kit';
import type { TownSeat } from './town-activity';
import { housePortalPlaque, type TownHousePortal } from './town-house-portals';

type Ground = ReturnType<typeof createTerrainGrid>;
type Point = readonly [east: number, north: number];
type District = 'forest' | 'memorial' | 'market' | 'lakeside';
type Parcel = readonly [east: number, north: number, width: number, depth: number];
type Street = { district: District; width: number; points: readonly Point[] };
type Segment = { district: District; a: Point; b: Point; width: number };
type Tint = string;
type Shape = 'box' | 'lit' | 'pine';
type Piece = {
  x: number; y: number; n: number; w: number; h: number; d: number; yaw: number;
  tint: Tint; shape: Shape;
};
type Cell = {
  x: number; n: number; silhouette: Piece[]; trim: Piece[]; paving: number[]; colors: number[];
  group?: Group; detail?: Group;
};
type BuildingSite = { x: number; n: number; w: number; d: number; yaw: number; district: District };
type CourtyardSeat = { approaches: { x: number; n: number; ground: number }[]; seat: TownSeat };

const streets: Street[] = districtStreets;
const approachDistricts: District[] = ['memorial', 'market', 'lakeside', 'lakeside', 'forest'];

const parcels: Record<District, Parcel[]> = districtParcels;

const districtTints = {
  forest: { body: ['#976747','#8d5e42','#a37855'], dark: '#47382f', trim: '#bc956b', roof: '#4d5056', foundation: '#7a818d', paving: '#a49585' },
  memorial: { body: ['#b9c3cc','#ccd4d9','#aebdc4'], dark: '#435565', trim: '#dae0e4', roof: '#5c6c7a', foundation: '#8492a0', paving: '#9c9da0' },
  market: { body: ['#a54d42','#a05b45','#b0634e'], dark: '#533737', trim: '#ceab8b', roof: '#5d5055', foundation: '#878088', paving: '#ab9385' },
  lakeside: { body: ['#b8ac99','#aaa49b','#c5b9a5'], dark: '#4b5f67', trim: '#c8cdd1', roof: '#526774', foundation: '#778998', paving: '#9ca5ad' },
};

const snow = '#d9e6f3';
const blueSnow = '#becfe4';
const chunkSize = 80;
const boxGeometry = new BoxGeometry();
const pineGeometry = new CylinderGeometry(.045, .52, 1, 7);
const solidMaterial = new MeshLambertMaterial();
const lightsMaterial = new MeshBasicMaterial();
const pathMaterial = new MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2 });

function segments(street: Street): Segment[] {
  return street.points.slice(1).map((b, i) => ({ district: street.district, a: street.points[i], b, width: street.width }));
}

function project(east: number, north: number, { a, b }: Segment): Point {
  const dx = b[0] - a[0];
  const dn = b[1] - a[1];
  const t = Math.min(1, Math.max(0, ((east - a[0]) * dx + (north - a[1]) * dn) / (dx * dx + dn * dn)));
  return [a[0] + dx * t, a[1] + dn * t];
}

function distanceTo(x: number, n: number, segment: Segment) {
  const [east, north] = project(x, n, segment);
  return Math.hypot(east - x, north - n);
}

function plate(x: number, n: number, y: number, w: number, h: number, d: number): Box {
  return { min: [x - w / 2, y, -n - d / 2], max: [x + w / 2, y + h, -n + d / 2] };
}

function courtyardFootprint(variant: number) {
  const bench = variant % 3 === 0;
  // The centered bench envelope includes the rear backrest at local n + .41 m.
  return bench ? { bench, width: 2.42, depth: .82 }
    : { bench, width: (variant % 2 ? 1.44 : 2.48) + .15, depth: 1.23 };
}

export function courtyardCollisionSize(variant: number, yaw: number) {
  const { width, depth } = courtyardFootprint(variant);
  const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
  return { width: width * c + depth * s + .1, depth: width * s + depth * c + .1 };
}

function batch(group: Group, items: Piece[], shape: Shape) {
  if (!items.length) return;
  const geometry = shape === 'pine' ? pineGeometry : boxGeometry;
  const material = shape === 'lit' ? lightsMaterial : solidMaterial;
  const mesh = new InstancedMesh(geometry, material, items.length);
  const transform = new Object3D();
  const color = new Color();
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    transform.position.set(item.x, item.y, -item.n);
    transform.rotation.y = item.yaw;
    transform.scale.set(item.w, item.h, item.d);
    transform.updateMatrix();
    mesh.setMatrixAt(i, transform.matrix);
    mesh.setColorAt(i, color.set(item.tint));
  }
  mesh.name = shape;
  mesh.computeBoundingSphere();
  group.add(mesh);
}

function pieceGroup(pieces: Piece[]) {
  const group = new Group();
  for (const shape of ['box', 'lit', 'pine'] as const) batch(group, pieces.filter(piece => piece.shape === shape), shape);
  return group;
}

export function buildExtensionStreets(
  grid: Ground, railKeepClear: (east: number, north: number, radius: number) => boolean = () => false,
  legacyKeepClear: (east: number, north: number, radius: number) => boolean = () => false,
) {
  const group = new Group();
  group.name = 'Expanded district streets';
  const cells = new Map<number, Cell>();
  const colliders: Box[] = [];
  const sites: BuildingSite[] = [];
  const housePortals: TownHousePortal[] = [];
  const establishedSites: BuildingSite[] = [];
  const infillSites: BuildingSite[] = [];
  const seating: CourtyardSeat[] = [];
  const approachStreets = extensionRoads.map(({ points, width }, i) => ({
    district: approachDistricts[i], width, points: points.map(([x, n]): Point => [x, n]),
  }));
  const routeSegments = [...approachStreets, ...streets].flatMap(segments);
  const oldRoads = layout.roads.flatMap(({ points, width }) => segments({
    points: points.map(([x, n]): Point => [x, n]), width, district: 'forest',
  }));
  const largePlots = [...layout.plots, ...extensionPlots];
  const sparsePathSegments: Segment[] = [];
  const infillPaths: Segment[] = [];
  let seed = 28649;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  function cellAt(x: number, n: number) {
    const a = Math.floor(x / chunkSize);
    const b = Math.floor(n / chunkSize);
    const key = b * 100 + a;
    const present = cells.get(key);
    if (present) return present;
    const cell: Cell = { x: (a + .5) * chunkSize, n: (b + .5) * chunkSize, silhouette: [], trim: [], paving: [], colors: [] };
    cells.set(key, cell);
    return cell;
  }

  function add(cell: Cell, x: number, y: number, n: number, w: number, h: number, d: number,
    tint: Tint, yaw = 0, detail = false, shape: Shape = 'box') {
    (detail ? cell.trim : cell.silhouette).push({ x, y, n, w, h, d, yaw, tint, shape });
  }

  function nearPlot(x: number, n: number, pad: number) {
    return largePlots.some(({ origin, footprint }) =>
      Math.abs(x - origin[0]) < footprint[0] / 2 + pad && Math.abs(n - origin[1]) < footprint[1] / 2 + pad);
  }

  function windowSite(x: number, n: number, margin: number) {
    if (!canEnter(x, n) || isWater(x, n) || nearPlot(x, n, margin)) return false;
    if (x <= layout.width && n <= layout.depth && legacyKeepClear(x, n, margin)) return false;
    return !routeSegments.some(seg => distanceTo(x, n, seg) < seg.width / 2 + margin)
      && !oldRoads.some(seg => distanceTo(x, n, seg) < seg.width / 2 + margin);
  }

  function buildHouse(site: BuildingSite, base: number, bottom: number, variant: number) {
    const { x, n, district, yaw } = site;
    const turned = Math.abs(Math.sin(yaw)) > .5;
    const w = turned ? site.d : site.w;
    const d = turned ? site.w : site.d;
    const colors = districtTints[district];
    const body = colors.body[variant % colors.body.length];
    const hot = ['#ffd3a4', '#f4b883', '#c7d9e5'][variant % 3];
    const dark = colors.dark;
    const trim = colors.trim;
    const cell = cellAt(x, n);
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const at = (u: number, v: number): Point => [x + u * c + v * s, n + u * s - v * c];
    const put = (u: number, y: number, v: number, ww: number, hh: number, dd: number, tint: Tint,
      detail = true, shape: Shape = 'box') => {
      const [east, north] = at(u, v);
      add(cell, east, base + y, north, ww, hh, dd, tint, yaw, detail, shape);
    };
    const front = d / 2;
    const window = (u: number, y: number, v: number, width: number, height: number, facing: 1 | -1) => {
      put(u, y, v, width + .25, height + .20, .18, dark, false);
      put(u, y, v + facing * .113, width, height, .06, hot, false, 'lit');
      put(u, y, v + facing * .152, .076, height, .062, dark);
      put(u, y - height * .08, v + facing * .153, width, .067, .058, dark);
      put(u, y - height / 2 - .15, v + facing * .14, width + .4, .13, .31, trim);
      put(u, y - height / 2 - .075, v + facing * .15, width + .29, .05, .25, blueSnow);
    };

    put(0, (bottom - base) / 2, 0, w + .19, base - bottom, d + .24, colors.foundation, false);
    const height = district === 'memorial' ? 4.1 + (variant % 3) * 1.33
      : district === 'market' ? 5.4 + (variant % 3) * .65 : 3.9 + (variant % 3) * .54;
    put(0, height / 2, 0, w, height, d, body, false);
    put(0, .18, 0, w + .16, .36, d + .18, colors.foundation, false);

    if (district === 'forest' || district === 'lakeside') {
      const rawLog = district === 'forest';
      const ridge = rawLog ? Math.min(4.8, w * .39) : Math.min(3.6, w * .32);
      const steps = rawLog ? 11 : 9;
      const eave = rawLog ? .74 : .45;
      for (let i = 0; i < steps; i++) {
        const t = i / steps;
        const level = height + (i + .5) * ridge / steps;
        const measure = (w + 2 * eave) * (1 - t);
        put(0, level, 0, measure, ridge / steps + .035, d + 2 * eave, colors.roof, false);
        const band = Math.min(measure / 2, (w + 2 * eave) * .55 / steps);
        for (const side of [-1, 1]) {
          put(side * (measure - band) / 2, level + ridge / steps * .5, 0, band, .10, d + 2 * eave - .14,
            (variant + i) % 4 === 1 ? blueSnow : snow, false);
          const inset = front + eave + .035;
          put(0, level - .03, side * inset, Math.max(.3, measure - .46), ridge / steps + .02, .09,
            rawLog ? trim : body);
        }
      }
      put(0, height + ridge + .08, 0, .24, .22, d + 2 * eave, snow, false);

      if (rawLog) {
        for (let y = .47; y < height - .08; y += .41) {
          put(0, y, front, w + .28, .20, .27, trim);
          put(0, y, -front, w + .26, .19, .26, trim);
          for (const sign of [-1, 1]) put(sign * w / 2, y, 0, .28, .20, d + .36, colors.body[(variant + 1) % 3]);
        }
        for (const sign of [-1, 1]) {
          put(sign * w * .38, 1.34, front + 1.05, .26, 2.68, .24, dark, false);
          put(sign * w * .32, .45, front + .62, w * .32, .16, 1.24, trim);
        }
        put(0, 2.79, front + .55, w * .90, .20, 1.54, colors.roof, false);
        put(0, 2.91, front + .54, w * .88, .08, 1.48, snow, false);
        window(0, height + ridge * .29, front + eave + .08, 1.30, .94, 1);
      } else {
        for (let y = .64; y < 1.93; y += .34) {
          for (let i = 0; i < 6; i++) {
            put((i - 2.5) * w / 6, y, front + .035, w / 6 - .064, .20, .10,
              i % 3 === 0 ? '#9b9b98' : i % 2 ? '#a9a096' : '#bfb6a7');
          }
        }
        put(0, height + .18, front + .53, w * .76, .15, 1.38, trim, false);
        put(0, height + .28, front + .53, w * .71, .10, 1.25, snow, false);
        window(0, height + ridge * .33, front + eave + .09, 2.1, .98, 1);
      }

      put(-w * .29, height + ridge * .73, -d * .19, .81, 2.68, .92, rawLog ? '#846b62' : colors.foundation, false);
      put(-w * .29, height + ridge * .73 + 1.38, -d * .19, 1.02, .14, 1.10, snow);
    } else {
      put(0, height + .12, 0, w + .70, .31, d + .61, colors.roof, false);
      put(0, height + .31, 0, w + .53, .14, d + .47, snow, false);
      if (district === 'memorial') {
        const side = variant % 2 ? 1 : -1;
        put(w * .29 * side, height + .62, -d * .10, w * .37, .89, d * .61, '#677b88', false);
        put(w * .29 * side, height + 1.13, -d * .10, w * .35, .13, d * .58, blueSnow, false);
        put(0, 2.96, front + .76, w * .95, .24, 2.02, '#596b7d', false);
        put(0, 3.105, front + .76, w * .92, .075, 1.96, snow, false);
        for (const sign of [-1, 1]) {
          put(sign * w * .45, 1.50, front + 1.56, .25, 3, .25, trim, false);
          put(sign * w * .25, height - .86, front + .04, w * .38, .30, .16, colors.foundation, false);
        }
        for (let i = 0; i < 9; i++) put((i - 4) * w * .086, height + .50, front - .10, .15, .42, .29, trim);
      } else {
        put(0, height + .54, front, w, .66, .56, body, false);
        put(0, height + .92, front, w + .23, .19, .67, trim, false);
        put(0, height + 1.04, front, w + .16, .11, .63, snow, false);
        for (let i = 0; i < 3; i++) {
          put(0, height + 1.16 + i * .41, front, w * (.52 - i * .13), .45, .66, body, false);
          put(0, height + 1.37 + i * .41, front, w * (.53 - i * .13), .11, .70, blueSnow);
        }
        for (let y = .46; y < height; y += .32) {
          for (const f of [-1, 1]) put(0, y, f * (front + .035), w, .027, .052, dark);
        }
        for (const u of [-w * .30, 0, w * .30]) {
          const archWidth = w * .093;
          for (const sign of [-1, 1]) {
            put(u + sign * (archWidth + .12), 1.03, front + .15, .21, 1.9, .32, trim, false);
            for (let k = 0; k < 4; k++) {
              const angle = (k + .5) * Math.PI / 8;
              put(u + sign * (archWidth + .16) * Math.cos(angle), 2.02 + .66 * Math.sin(angle),
                front + .17, .28, .21, .36, trim, false);
            }
          }
          put(u, 2.72, front + .17, .29, .24, .42, blueSnow);
        }
      }
    }

    const size = district === 'memorial' || district === 'lakeside' ? w * .27 : w * .175;
    const half = district === 'market' ? w * .30 : w * .27;
    const glassHeight = district === 'memorial' || district === 'lakeside' ? 2.17 : 1.36;
    for (const side of [-1, 1]) {
      window(side * half, 1.65, front + .067, size, glassHeight, 1);
      window(side * (w * .26), 1.67, -front - .035, size * .8, 1.43, -1);
      if (height > 4.55) window(side * half, height - .96, front + .04, size * .77, 1.30, 1);
      const lanternX = side * 1.30;
      put(lanternX, 2.50, front + .27, .26, .38, .29, '#e9a866', false, 'lit');
      put(lanternX, 2.75, front + .27, .36, .10, .40, dark);
      put(lanternX, .42, front + 1.02, .66, .64, .68, colors.foundation);
    }

    put(0, 1.12, front + .085, 1.60, 2.24, .22, dark, false);
    put(0, 1.22, front + .217, 1.34, 1.91, .072, district === 'market' ? '#753d42' : district === 'forest' ? '#79523b' : '#516777');
    put(0, 1.70, front + .264, 1.13, .72, .038, hot, false, 'lit');
    put(0, .13, front + .59, 1.88, .26, 1.12, colors.foundation);
    put(.45, .97, front + .278, .092, .17, .12, trim);
    for (const mark of housePortalPlaque) {
      put(mark.x, 1.18 + mark.y, front + .326 + mark.z, mark.w, mark.h, mark.d, mark.color, false);
    }
    const [doorX, doorN] = at(0, front + 1.42);
    housePortals.push({ id: `district:${x}:${n}`, x: doorX, n: doorN,
      ground: grid.heightAt(doorX, doorN), exitYaw: Math.atan2(s, -c) });
    const door = at(0, front + 1.14);
    colliders.push(plate(x, n, bottom, site.w, height + base - bottom, site.d));
    return door;
  }

  for (const [name, positions] of Object.entries(parcels)) {
    const district = name as District;
    positions.forEach((parcel, variant) => {
      const [x, n, w, d] = parcel;
      const infill = district === 'memorial' && memorialInfill.some(([east, north]) => east === x && north === n);
      const near = routeSegments.reduce((best, seg) => distanceTo(x, n, seg) < distanceTo(x, n, best) ? seg : best);
      const [px, pn] = project(x, n, near);
      const yaw = Math.abs(px - x) > Math.abs(pn - n) ? Math.sign(px - x) * Math.PI / 2 : pn > n ? Math.PI : 0;
      const turned = Math.abs(Math.sin(yaw)) > .5;
      const ww = turned ? d : w;
      const dd = turned ? w : d;
      const halfW = ww / 2;
      const halfD = dd / 2;
      const sample = [-1, 0, 1].flatMap(i => [-1, 0, 1].map(j => [x + i * halfW, n + j * halfD] as const));
      if (railKeepClear(x, n, Math.hypot(halfW, halfD) + 1.3) || !sample.every(([a, b]) => windowSite(a, b, 1.4))) return;
      if (sites.some(s => Math.abs(s.x - x) < (s.w + ww) / 2 + 2.7 && Math.abs(s.n - n) < (s.d + dd) / 2 + 2.7)) return;
      const heights = sample.map(([a, b]) => grid.heightAt(a, b));
      const highest = Math.max(...heights);
      const lowest = Math.min(...heights);
      if (highest - lowest > 5.0) return;
      const site = { x, n, w: ww, d: dd, yaw, district };
      const door = buildHouse(site, highest + .11, lowest - .33, variant);
      sites.push(site);
      (infill ? infillSites : establishedSites).push(site);
      if (Math.hypot(px - door[0], pn - door[1]) > 1) {
        (infill ? infillPaths : sparsePathSegments).push({ district, a: door, b: [px, pn], width: 2.18 });
      }
    });
  }

  // Dress the surface along established approaches, including their legacy-side connections.
  const color = new Color();
  const offsets = [[0, 0], [1, 0], [0, 1], [1, 1]] as const;
  const woven = new Set<number>();
  for (const seg of [...routeSegments, ...sparsePathSegments, ...infillPaths]) {
    const infill = infillPaths.includes(seg);
    const half = seg.width / 2;
    const x0 = Math.floor(Math.min(seg.a[0], seg.b[0]) - half);
    const n0 = Math.floor(Math.min(seg.a[1], seg.b[1]) - half);
    const x1 = Math.ceil(Math.max(seg.a[0], seg.b[0]) + half);
    const n1 = Math.ceil(Math.max(seg.a[1], seg.b[1]) + half);
    for (let n = n0; n < n1; n++) for (let x = x0; x < x1; x++) {
      const distance = distanceTo(x + .5, n + .5, seg);
      const index = n * grid.gridWidth + x;
      if (distance > half + .19 * Math.sin(n * 2.9 + x * 4.6) || woven.has(index)) continue;
      if (grid.surfaces[index] === 2 || grid.surfaces[index] === 4 || !canEnter(x + .5, n + .5)) continue;
      woven.add(index);
      const cell = cellAt(x, n);
      color.set(districtTints[seg.district].paving);
      // The added footpaths must not reseed the existing forests and street props.
      const jitter = infill ? .5 + .5 * Math.sin(x * 9.43 + n * 5.33) : random();
      color.multiplyScalar((distance > half - .85 ? .82 : 1) * (.89 + jitter * .17));
      for (const corner of [0, 1, 2, 1, 3, 2]) {
        const [dx, dn] = offsets[corner];
        cell.paving.push(x + dx, grid.heightAt(x + dx, n + dn) + .039, -n - dn);
        cell.colors.push(color.r, color.g, color.b);
      }
    }
  }

  function clearProp(x: number, n: number, margin: number) {
    return windowSite(x, n, margin) && !railKeepClear(x, n, margin + .7)
      && !sparsePathSegments.some(seg => distanceTo(x, n, seg) < margin + seg.width / 2)
      && !establishedSites.some(s => Math.abs(s.x - x) < s.w / 2 + margin && Math.abs(s.n - n) < s.d / 2 + margin);
  }

  function clearInfill(x: number, n: number, margin: number) {
    return !infillPaths.some(seg => distanceTo(x, n, seg) < margin + seg.width / 2)
      && !infillSites.some(s => Math.abs(s.x - x) < s.w / 2 + margin && Math.abs(s.n - n) < s.d / 2 + margin);
  }

  const props: Point[] = [];
  const canopy = ['#294740', '#354f48', '#2f4948', '#355452'];
  let treeCount = 0;

  function plant(x: number, n: number, h: number, r: number) {
    const y = grid.heightAt(x, n);
    const cell = cellAt(x, n);
    const turn = random() * Math.PI;
    const leaf = canopy[Math.floor(random() * canopy.length)];
    add(cell, x, y + h * .31, n, h * .092, h * .67, h * .092, '#6b5549', turn);
    for (let i = 0; i < 3; i++) {
      const scale = 1 - i * .27;
      const level = y + h * (.37 + i * .205);
      add(cell, x, level, n, 2 * r * scale, h * .44, 2 * r * scale, leaf, turn + i, false, 'pine');
      add(cell, x, level + h * .055, n, 1.73 * r * scale, h * .35, 1.72 * r * scale,
        i === 0 ? blueSnow : snow, turn + i, false, 'pine');
    }
    const stem = Math.min(.43, h * .044);
    colliders.push(plate(x, n, y, 2 * stem, h, 2 * stem));
    props.push([x, n]);
    treeCount++;
  }

  const woodlots = [
    [76,452,75,64],[177,484,62,38],[281,480,54,36],[342,454,66,47],
    [436,458,67,55],[565,468,87,46],[600,380,43,54],[615,251,38,72],
    [596,61,54,74],[544,36,65,29],[452,58,30,32],[490,327,45,60],
  ];
  for (let n = 19; n < 503; n += 7.8) for (let x = 11; x < 634; x += 8.6) {
    if (x < 450 && n < 386) continue;
    const a = x + (random() - .5) * 5.8;
    const b = n + (random() - .5) * 5.5;
    const cover = woodlots.reduce((max, [cx, cn, rx, rn]) =>
      Math.max(max, 1 - Math.hypot((a - cx) / rx, (b - cn) / rn) ** 2), 0);
    const h = 3.9 + random() * (3.9 + 4 * cover);
    const radius = h * (.17 + random() * .03);
    if (random() > .035 + cover * .85 || Math.abs(a - riverX(b)) < 10 + radius
      || !clearProp(a, b, radius + .38)) continue;
    if (clearInfill(a, b, radius + .38)) plant(a, b, h, radius);
    else {
      // Preserve the old spacing and consume plant's turn/tint draws even when the site is newly reserved.
      random();
      random();
      props.push([a, b]);
    }
  }

  let lights = 0;
  const fixtureRadius = 1.25;

  function placeFixture(x: number, n: number, yaw: number, district: District) {
    if (!clearProp(x, n, fixtureRadius) || props.some(([a, b]) => Math.hypot(a - x, b - n) < 3.2)) return;
    props.push([x, n]);
    if (!clearInfill(x, n, fixtureRadius)) return;
    const y = grid.heightAt(x, n);
    const cell = cellAt(x, n);
    const lanternBody = district === 'forest' ? '#654b3c' : '#4e4c52';
    add(cell, x, y + 1.29, n, .23, 2.57, .23, lanternBody);
    add(cell, x, y + .22, n, .62, .45, .62, districtTints[district].foundation, yaw);
    add(cell, x, y + 2.64, n, .43, .51, .43, district === 'lakeside' ? '#ffcea1' : '#fbb37c', yaw, false, 'lit');
    add(cell, x, y + 2.96, n, .65, .15, .65, lanternBody, yaw);
    add(cell, x, y + 3.06, n, .58, .08, .58, snow, yaw);
    add(cell, x, y + 2.40, n, .54, .10, .54, lanternBody, yaw, true);
    for (const sign of [-1, 1]) add(cell, x + sign * .23, y + 2.66, n, .07, .53, .43, lanternBody, 0, true);
    colliders.push(plate(x, n, y, .55, 2.58, .55));
    lights++;
  }

  function courtyardPiece(x: number, n: number, yaw: number, district: District, variant: number) {
    if (!clearProp(x, n, 1.45) || props.some(([a, b]) => Math.hypot(a - x, b - n) < 3.2)) return;
    props.push([x, n]);
    if (!clearInfill(x, n, 1.45)) return;
    const y = grid.heightAt(x, n);
    const cell = cellAt(x, n);
    const ground = districtTints[district].foundation;
    const wood = district === 'forest' ? '#9a7657' : '#805d4d';
    const footprint = courtyardFootprint(variant);
    if (footprint.bench) {
      add(cell, x, y + .43, n, footprint.width, .21, .79, wood, yaw);
      add(cell, x, y + .56, n, 2.41, .06, .72, blueSnow, yaw, true);
      for (const side of [-1, 1]) {
        add(cell, x + Math.cos(yaw) * side * .91, y + .18, n + Math.sin(yaw) * side * .91, .23, .38, .76, ground, yaw);
      }
      add(cell, x - Math.sin(yaw) * .34, y + .88, n + Math.cos(yaw) * .34, 2.38, .21, .14, wood, yaw);
    } else {
      const w = footprint.width - .15;
      add(cell, x, y + .28, n, w, .56, 1.09, ground, yaw);
      add(cell, x, y + .58, n, footprint.width, .17, footprint.depth, '#687d87', yaw);
      for (let i = 0; i < 3; i++) {
        add(cell, x + Math.cos(yaw) * (i - 1) * w * .27, y + .82, n + Math.sin(yaw) * (i - 1) * w * .27,
          .43 + .1 * i, .58, .57, canopy[i], yaw, true, 'pine');
      }
    }
    const collision = courtyardCollisionSize(variant, yaw);
    if (footprint.bench) {
      const east = Math.sin(yaw), north = -Math.cos(yaw);
      // A standing player must clear the full rotated AABB, including body radius.
      const clearance = .36;
      const step = Math.min(
        (collision.width / 2 + clearance) / Math.abs(east),
        (collision.depth / 2 + clearance) / Math.abs(north),
      );
      const approaches = [0, -.52, .52, -.9, .9].map(offset => {
        const standX = x + east * step + Math.cos(yaw) * offset;
        const standN = n + north * step + Math.sin(yaw) * offset;
        return { x: standX, n: standN, ground: grid.heightAt(standX, standN) };
      });
      seating.push({ approaches, seat: { x, n, eyeY: y + .59 + .98, yaw: Math.atan2(east, north) } });
    }
    colliders.push(plate(x, n, y, collision.width, .79, collision.depth));
  }

  for (const seg of routeSegments) {
    const dx = seg.b[0] - seg.a[0], dn = seg.b[1] - seg.a[1];
    const length = Math.hypot(dx, dn);
    const turn = Math.atan2(dn, dx);
    for (let offset = 4, i = 0; offset < length - 2; offset += 10.4, i++) {
      const sign = i % 2 === 0 ? 1 : -1;
      const edge = seg.width / 2 + 1.78;
      const x = seg.a[0] + dx / length * offset, n = seg.a[1] + dn / length * offset;
      placeFixture(x - dn * sign * edge / length, n + dx * sign * edge / length, turn, seg.district);
      const farther = edge + .85;
      courtyardPiece(x + dn * sign * farther / length, n - dx * sign * farther / length, turn, seg.district, i);
    }
  }

  // Break up the blank snow between tree clusters without crowding track approaches.
  for (let n = 29; n < 498; n += 12.7) for (let x = 31; x < 630; x += 13.1) {
    if (x < 453 && n < 390) continue;
    const a = x + (random() - .5) * 9;
    const b = n + (random() - .5) * 9;
    if (random() > .39 || !clearProp(a, b, .96) || props.some(([xx, nn]) => Math.hypot(a - xx, b - nn) < 2.7)) continue;
    const cell = cellAt(a, b);
    const y = grid.heightAt(a, b);
    const w = .66 + random() * 1.38;
    const yaw = random() * Math.PI;
    if (!clearInfill(a, b, .96)) continue;
    add(cell, a, y + w * .13, b, w, w * .38, w * .82, '#6b788b', yaw, true, 'pine');
    add(cell, a, y + w * .25, b, w * .82, w * .22, w * .65, blueSnow, yaw, true, 'pine');
  }

  const counts = {
    buildings: sites.length, trees: treeCount, lights, pavingCells: woven.size, chunks: cells.size,
    districts: Object.fromEntries(Object.keys(parcels).map(k => [k, sites.filter(s => s.district === k).length])),
  };
  group.userData = { colliders, floors: [], ramps: [], counts };

  function pave(parent: Group, positions: number[], colors: number[]) {
    if (!positions.length) return;
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    parent.add(new Mesh(geometry, pathMaterial));
  }

  function buildCell(cell: Cell) {
    const batch = pieceGroup(cell.silhouette);
    batch.name = `District cell ${cell.x},${cell.n}`;
    pave(batch, cell.paving, cell.colors);
    group.add(batch);
    cell.group = batch;
  }

  function discardTrim(cell: Cell) {
    if (!cell.detail) return;
    for (const item of cell.detail.children) if (item instanceof InstancedMesh) item.dispose();
    cell.detail.removeFromParent();
    cell.detail = undefined;
  }

  let overviewGroup: Group | undefined;
  function update(camera: Camera, overview: boolean) {
    if (overview) {
      if (overviewGroup?.visible) return;
      if (!overviewGroup) {
        const all = [...cells.values()];
        overviewGroup = pieceGroup(all.flatMap(cell => cell.silhouette));
        overviewGroup.name = 'Expanded district aerial batches';
        pave(overviewGroup, all.flatMap(cell => cell.paving), all.flatMap(cell => cell.colors));
        group.add(overviewGroup);
      }
      for (const cell of cells.values()) if (cell.group) cell.group.visible = false;
      overviewGroup.visible = true;
      return;
    }
    if (overviewGroup) overviewGroup.visible = false;
    let buildBudget = 2;
    let trimBudget = 1;
    for (const cell of cells.values()) {
      const deltaX = Math.max(0, Math.abs(camera.position.x - cell.x) - chunkSize / 2);
      const deltaN = Math.max(0, Math.abs(-camera.position.z - cell.n) - chunkSize / 2);
      const distanceSquared = deltaX * deltaX + deltaN * deltaN;
      // Solid roof, windows, paths and landscape remain visible as the long-distance representation.
      if (!cell.group && buildBudget > 0 && distanceSquared < 240 ** 2) {
        buildCell(cell);
        buildBudget--;
      }
      if (!cell.group) continue;
      cell.group.visible = true;
      if (!cell.detail && trimBudget > 0 && distanceSquared < 93 ** 2 && cell.trim.length) {
        cell.detail = pieceGroup(cell.trim);
        cell.group.add(cell.detail);
        trimBudget--;
      }
      if (cell.detail && distanceSquared > 149 ** 2) discardTrim(cell);
    }
  }

  return { group, update, counts, sites, seating, housePortals };
}
