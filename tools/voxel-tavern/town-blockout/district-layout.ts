import {
  BoxGeometry, BufferAttribute, BufferGeometry, Color, DoubleSide, Group, InstancedMesh, Matrix4, Mesh,
  MeshLambertMaterial, Object3D,
} from 'three';
import { buildDistrictHousing, type DistrictTheme } from './district-housing';
import { canEnter, layout, riverX, type createTerrainGrid } from './terrain';
import { bridgeMouthKeepClear } from './road-clearance';
import type { TownHousePortal } from './town-house-portals';

type Ground = ReturnType<typeof createTerrainGrid>;
type Style = Parameters<typeof buildDistrictHousing>[0];
type Site = { x: number; n: number; w: number; d: number; angle: number; style: Style; variant: number };
type HousingRejectionReason = 'rail' | 'slope' | 'plaza' | 'open-space' | 'lamp' | 'path' | 'setback';
type HousingRejection = {
  id: string;
  zone: DistrictTheme | 'central';
  location: readonly [east: number, north: number];
  relocated: boolean;
  overlapsPlaza: boolean;
  reason: HousingRejectionReason;
};
type KeepClear = (x: number, n: number, radius: number) => boolean;
type HousingBatch = { source: Mesh; matrices: Matrix4[]; colors: Color[] };
type HousingCell = { batches: Map<string, HousingBatch>; walks: number[] };
const housingCellSize = 96;
const plazaHouseRelocations: ReadonlyMap<string, readonly [east: number, north: number]> = new Map([
  ['117:202', [115.5, 220]],
  ['101:184', [89.5, 166.5]],
  ['105:152', [68.25, 183.5]],
  ['137:168', [180.25, 120]],
  ['158:184', [192.75, 118.5]],
  ['179:155', [203.5, 95.75]],
  ['173:135', [182, 91]],
  ['156:141', [107, 93]],
  ['246:135', [261, 120]],
  ['220:138', [250.5, 79.5]],
  ['197:132', [173, 63]],
  ['200:151', [198.5, 223]],
  ['262:180', [269.5, 241.5]],
]);

function lineDistance(x: number, n: number, a: number[], b: number[]) {
  const dx = b[0] - a[0];
  const dn = b[1] - a[1];
  const lengthSquared = dx * dx + dn * dn;
  const t = lengthSquared > 0 ? Math.min(1, Math.max(0, ((x - a[0]) * dx + (n - a[1]) * dn) / lengthSquared)) : 0;
  return Math.hypot(x - a[0] - t * dx, n - a[1] - t * dn);
}

const paths = [
  ...layout.roads.flatMap(({ points, width }) => points.slice(1).map((end, i) => ({ start: points[i], end, radius: width / 2 }))),
  ...layout.plots.map(({ connect, door }) => ({ start: connect, end: door, radius: 2 })),
];
const bounds = layout.plots.map(({ origin: [x, n], footprint: [w, d] }) => ({ x, n, w, d }));
const waterfront = [{ x: 355, n: 120, w: 16, d: 19 }];
const within = (x: number, n: number, { x: cx, n: cn, w, d }: Pick<Site, 'x' | 'n' | 'w' | 'd'>, margin: number) =>
  Math.abs(x - cx) < w / 2 + margin && Math.abs(n - cn) < d / 2 + margin;

const neighborhoods: { theme?: DistrictTheme; styles: Style[]; points: number[][] }[] = [
  { theme: 'forest', styles: ['alpine', 'alpine', 'courtyard'], points: [[110,277],[133,266],[149,281],[172,282],[191,282],[216,280],[128,247],[131,218],[117,202],[101,184],[105,152],[96,239],[70,229],[63,194],[85,287],[111,307],[147,320],[172,323],[191,325]] },
  { theme: 'memorial', styles: ['courtyard', 'machiya', 'courtyard'], points: [[318,267],[312,243],[338,232],[358,228],[364,207],[375,242],[391,234],[410,219],[414,190],[406,165],[333,317],[353,321],[398,297],[393,272],[380,282],[310,318],[373,335]] },
  { theme: 'market', styles: ['shop', 'machiya', 'courtyard'], points: [[137,168],[158,184],[179,155],[173,135],[156,141],[137,129],[123,144],[103,134],[94,100],[115,87],[137,70],[161,68],[188,65],[202,70],[217,66],[234,74],[245,80],[186,104],[206,110],[228,110],[246,114],[246,135],[220,138],[197,132],[186,116],[145,85],[181,89],[102,158]] },
  { theme: 'lakeside', styles: ['alpine', 'shop', 'machiya'], points: [[331,172],[349,184],[375,177],[378,155],[351,144],[337,130],[311,117],[325,87],[387,109],[410,119],[422,101],[423,73],[405,51],[397,41],[390,32],[320,105],[303,133],[329,155],[358,163],[361,122]] },
  { styles: ['shop', 'courtyard', 'machiya'], points: [[177,226],[180,196],[169,203],[181,166],[217,153],[200,151],[255,161],[262,180],[264,228],[251,219],[253,243],[221,251],[202,247],[190,251],[179,248],[213,233],[247,234],[266,258],[249,264],[199,262],[218,268],[238,265]] },
];

export function addDistrictHousing(
  parent: Group, grid: Ground, lampBlocked: (x: number, n: number) => boolean,
  railwayKeepClear: KeepClear = () => false,
  plazaBounds: readonly number[] = layout.plaza.bounds,
) {
  const [west, south, east, north] = plazaBounds;
  const sites: Site[] = [];
  const zoneCounts = { forest: 0, memorial: 0, market: 0, lakeside: 0, central: 0 };
  const movedSites = new Set<Site>();
  const housePortals: TownHousePortal[] = [];
  const rejectedHomes: HousingRejection[] = [];
  const sweptPaths: { x: number; n: number; dx: number; dn: number; start: number; end: number }[] = [];
  const foundation = new BoxGeometry();
  const stone = new MeshLambertMaterial({ color: '#6c6c79' });
  const courtyardSnow = new MeshLambertMaterial({ color: '#b5c3d6' });
  const stonePath = new MeshLambertMaterial({ color: '#9b9294', side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
  const cells = new Map<string, HousingCell>();
  const detailed = new Group();
  detailed.name = 'district-infill';
  detailed.matrixAutoUpdate = false;
  parent.add(detailed);
  let panorama: Group | undefined;

  function cellAt(x: number, n: number) {
    const key = `${Math.floor(x / housingCellSize)},${Math.floor(n / housingCellSize)}`;
    let cell = cells.get(key);
    if (!cell) {
      cell = { batches: new Map(), walks: [] };
      cells.set(key, cell);
    }
    return cell;
  }

  function addModel(model: Object3D, { batches }: HousingCell) {
    model.updateMatrixWorld(true);
    model.traverse(item => {
      if (!(item instanceof Mesh) || Array.isArray(item.material)) return;
      const key = item.geometry.uuid + item.material.uuid;
      let batch = batches.get(key);
      if (!batch) batches.set(key, batch = { source: item, matrices: [], colors: [] });
      if (item instanceof InstancedMesh) {
        const matrix = new Matrix4();
        for (let i = 0; i < item.count; i++) {
          item.getMatrixAt(i, matrix);
          batch.matrices.push(matrix.clone().premultiply(item.matrixWorld));
          if (item.instanceColor) {
            const tint = new Color();
            item.getColorAt(i, tint);
            batch.colors.push(tint);
          }
        }
      } else batch.matrices.push(item.matrixWorld.clone());
    });
  }

  function outside(x: number, n: number, radius: number) {
    return !canEnter(x, n) || Math.abs(x - riverX(n)) < 8 + radius
      || n < 8 + radius || x < 8 + radius || n > layout.depth - 8 - radius || x > layout.width - 8 - radius;
  }

  function insidePlaza(x: number, n: number, radius: number) {
    return x > west - radius && x < east + radius && n > south - radius && n < north + radius;
  }

  function openSpace(x: number, n: number, radius: number) {
    const cx = Math.round(x), cn = Math.round(n);
    return !outside(x, n, radius) && !bridgeMouthKeepClear(x, n, radius) && grid.surfaces[cn * grid.gridWidth + cx] !== 4
      && !insidePlaza(x, n, radius)
      && !bounds.some(plot => within(x, n, plot, radius + 1.1))
      && !waterfront.some(plot => within(x, n, plot, radius));
  }

  function sampleFailure(x: number, n: number): HousingRejectionReason | undefined {
    if (!openSpace(x, n, 1.4)) return insidePlaza(x, n, 1.4) ? 'plaza' : 'open-space';
    if (lampBlocked(x, n)) return 'lamp';
    if (!paths.every(({ start, end, radius }) => lineDistance(x, n, start, end) > radius + 1.35)) return 'path';
  }

  const footprints = (site: Site) => Math.abs(Math.sin(site.angle)) > .5 ? { ...site, w: site.d, d: site.w } : site;
  function edges(site: Site) {
    const { x, n, w, d } = footprints(site);
    return [-1, 0, 1].flatMap(i => [-1, 0, 1].map(j => [x + i * (w / 2 + 1), n + j * (d / 2 + 1)]));
  }

  function conflictsWithRail({ x, n, w, d }: Site) {
    // Reserve the roof, entrance steps, and wall fittings beyond the structural footprint.
    const halfWidth = w / 2 + 1.25;
    const halfDepth = d / 2 + 1.25;
    if (!railwayKeepClear(x, n, Math.hypot(halfWidth, halfDepth))) return false;
    // Cover the rectangle with small circular probes to avoid discarding clear diagonals.
    const columns = Math.ceil(halfWidth);
    const rows = Math.ceil(halfDepth);
    const width = 2 * halfWidth / columns;
    const depth = 2 * halfDepth / rows;
    const radius = Math.hypot(width, depth) / 2;
    for (let column = 0; column < columns; column++) {
      const east = x - halfWidth + (column + .5) * width;
      for (let row = 0; row < rows; row++) {
        const north = n - halfDepth + (row + .5) * depth;
        if (railwayKeepClear(east, north, radius)) return true;
      }
    }
    return false;
  }

  for (const { theme, styles, points } of neighborhoods) {
    for (const [i, [sourceEast, sourceNorth]] of points.entries()) {
      const address = `${sourceEast}:${sourceNorth}`;
      const id = `old-town:${address}`;
      const relocation = plazaHouseRelocations.get(address);
      const [x, n] = relocation ?? [sourceEast, sourceNorth];
      const style = styles[i % styles.length];
      const w = 9.2 + (i * 7 % 6) * .96 + (style === 'courtyard' ? 1.5 : 0);
      const d = 8.1 + (i % 4) * 1.25;
      const nearest = paths.reduce((best, path) => lineDistance(x, n, path.start, path.end) < lineDistance(x, n, best.start, best.end) ? path : best);
      const angle = [0, Math.PI / 2, Math.PI, -Math.PI / 2].reduce((best, value) => {
        const distance = (heading: number) => lineDistance(x + 6 * Math.sin(heading), n - 6 * Math.cos(heading), nearest.start, nearest.end);
        return distance(value) < distance(best) ? value : best;
      });
      const site = { x, n, w, d, angle, style, variant: 11 * i + Math.round(sourceEast) };
      const footprint = footprints(site);
      const samples = edges(site);
      function reject(reason: HousingRejectionReason) {
        rejectedHomes.push({
          id, zone: theme ?? 'central', location: [x, n], relocated: relocation !== undefined,
          overlapsPlaza: samples.some(([px, pn]) => insidePlaza(px, pn, 1.4)), reason,
        });
      }
      if (conflictsWithRail(footprint)) {
        reject('rail');
        continue;
      }
      const heights = samples.map(([px, pn]) => grid.heightAt(px, pn));
      if (Math.max(...heights) - Math.min(...heights) > 5.3) {
        reject('slope');
        continue;
      }
      let failure: HousingRejectionReason | undefined;
      for (const [px, pn] of samples) {
        failure = sampleFailure(px, pn);
        if (failure) break;
      }
      if (failure) {
        reject(failure);
        continue;
      }
      if (sites.some(other => {
        const size = footprints(other);
        // The receiving strip is tighter. Keep a 1.8 m structural gap at moved houses.
        const setback = relocation || movedSites.has(other) ? 1.8 : 3.6;
        return within(x, n, { ...size, w: size.w + footprint.w, d: size.d + footprint.d }, setback);
      })) {
        reject('setback');
        continue;
      }
      const level = Math.max(grid.heightAt(x, n), ...heights) + .14;
      const base = Math.min(...heights) - .28;
      const model = buildDistrictHousing(style, w, d, site.variant, theme);
      model.position.set(x, level, -n);
      model.rotation.y = angle;
      const plinth = new Mesh(foundation, stone);
      plinth.scale.set(w + .17, level - base, d + .17);
      plinth.position.y = (base - level) / 2;
      model.add(plinth);
      const cap = new Mesh(foundation, courtyardSnow);
      cap.scale.set(w + .35, .14, d + .35);
      cap.position.y = -.09;
      model.add(cap);
      const cell = cellAt(x, n);
      addModel(model, cell);
      sites.push(site);
      zoneCounts[theme ?? 'central']++;
      if (relocation) movedSites.add(site);

      const dx = Math.sin(angle), dn = -Math.cos(angle);
      const side = model.userData.houseDoorEast as number;
      const stand = d / 2 + 1.42;
      const doorX = x + dx * stand - dn * side;
      const doorN = n + dn * stand + dx * side;
      housePortals.push({ id, x: doorX, n: doorN,
        ground: grid.heightAt(doorX, doorN), exitYaw: Math.atan2(dx, dn) });
      const start = d / 2 + .55;
      const reach = Math.min(12, lineDistance(x, n, nearest.start, nearest.end) + 1);
      let sweptEnd = start;
      for (let distance = start; distance < reach; distance += .8) {
        const corners = [[distance, -1.08], [distance, 1.08], [distance + .8, -1.08], [distance + .8, 1.08]].map(([s, side]) => {
          const px = x + dx * s + dn * side, pn = n + dn * s - dx * side;
          return [px, grid.heightAt(px, pn) + .045, -pn];
        });
        if (corners.some(([px, , pz]) => !openSpace(px, -pz, .32))) break;
        for (const index of [0, 1, 2, 1, 3, 2]) cell.walks.push(...corners[index]);
        sweptEnd = distance + .8;
      }
      if (sweptEnd > start) sweptPaths.push({ x, n, dx, dn, start, end: sweptEnd });
    }
  }

  function renderBatches(target: Group, { batches, walks: triangles }: HousingCell, name: string) {
    for (const { source, matrices, colors } of batches.values()) {
      const batch = new InstancedMesh(source.geometry, source.material, matrices.length);
      matrices.forEach((matrix, i) => batch.setMatrixAt(i, matrix));
      colors.forEach((color, i) => batch.setColorAt(i, color));
      batch.matrixAutoUpdate = false;
      batch.computeBoundingSphere();
      batch.name = name;
      target.add(batch);
    }
    if (triangles.length) {
      const walks = new BufferGeometry();
      walks.setAttribute('position', new BufferAttribute(new Float32Array(triangles), 3));
      walks.computeVertexNormals();
      walks.computeBoundingSphere();
      const path = new Mesh(walks, stonePath);
      path.matrixAutoUpdate = false;
      path.name = name + ' paths';
      target.add(path);
    }
  }

  for (const [key, cell] of cells) renderBatches(detailed, cell, 'Old town housing ' + key);
  function setPanorama(wide: boolean) {
    detailed.visible = !wide;
    if (wide && !panorama) {
      const overview: HousingCell = { batches: new Map(), walks: [] };
      for (const { batches, walks } of cells.values()) {
        for (const [key, { source, matrices, colors }] of batches) {
          let entry = overview.batches.get(key);
          if (!entry) overview.batches.set(key, entry = { source, matrices: [], colors: [] });
          entry.matrices.push(...matrices);
          entry.colors.push(...colors);
        }
        overview.walks.push(...walks);
      }
      panorama = new Group();
      panorama.name = 'Old town housing panorama';
      panorama.matrixAutoUpdate = false;
      renderBatches(panorama, overview, 'Old town housing overview');
      parent.add(panorama);
    }
    if (panorama) panorama.visible = wide;
  }
  const completed = sites.map(footprints);
  const keepClear: KeepClear = (x, n, radius) => !openSpace(x, n, radius) || lampBlocked(x, n)
    || paths.some(({ start, end, radius: size }) => lineDistance(x, n, start, end) < radius + size + .6)
    || completed.some(site => within(x, n, site, radius + 2));
  function sweptAt(east: number, north: number) {
    return sweptPaths.some(({ x, n, dx, dn, start, end }) => {
      const offsetX = east - x, offsetN = north - n;
      const along = offsetX * dx + offsetN * dn;
      return along >= start && along <= end && Math.abs(offsetX * dn - offsetN * dx) <= 1.08;
    });
  }
  return { count: sites.length, zoneCounts, sites, housePortals, relocations: plazaHouseRelocations, rejectedHomes, keepClear, setPanorama, sweptAt,
    blocked: (x: number, n: number) => completed.some(site => within(x, n, site, .27)) };
}
