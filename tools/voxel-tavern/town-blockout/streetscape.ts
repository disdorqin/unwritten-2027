import {
  BoxGeometry, Color, CylinderGeometry, DodecahedronGeometry, Group,
  InstancedMesh, MeshBasicMaterial, MeshLambertMaterial, Object3D, SphereGeometry, Vector3,
  type Material,
} from 'three';
import { bridgeAt, isWater, layout, riverX, waterHeight, worldBounds, type createTerrainGrid } from './terrain';
import { roadCorridorKeepClear } from './road-clearance';
import { addTavernStreetBanner } from './market-stall-banners';
import { streetInfill, type StreetInfillKind } from './streetscape-infill';
import { districtParcels, extensionPlots, extensionStreetClearance } from './town-extension';

type Ground = ReturnType<typeof createTerrainGrid>;
type Dimensions = [width: number, height: number, depth: number];

const snow = '#d9e6f4';
const timber = '#68483d';
const wood = '#95654b';
const red = '#933338';
const gold = '#f5ac63';
const stone = '#61788c';

export function addStreetscape(parent: Group, grid: Ground, keepClear: (x: number, n: number, radius: number) => boolean) {
  const group = new Group();
  group.name = 'Riverside and roadside scenery';
  parent.add(group);
  const geometries = {
    box: new BoxGeometry(),
    rock: new DodecahedronGeometry(.55),
    globe: new SphereGeometry(.5, 8, 5),
    pillar: new CylinderGeometry(.5, .56, 1, 7),
    light: new SphereGeometry(.5, 8, 5),
    floe: new CylinderGeometry(.55, .62, 1, 7),
  };
  type Shape = keyof typeof geometries;
  type Part = { x: number; y: number; n: number; size: Dimensions; color: string; yaw: number; pitch: number; roll: number };
  const batches = new Map<Shape, Part[]>();
  const footprints: { x: number; n: number; radius: number }[] = [];
  const colliders: typeof footprints = [];
  let seed = 716784;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }

  function part(shape: Shape, x: number, y: number, n: number, size: Dimensions, color: string, yaw = 0, pitch = 0, roll = 0) {
    const batch = batches.get(shape) ?? [];
    if (!batches.has(shape)) batches.set(shape, batch);
    batch.push({ x, y, n, size, color, yaw, pitch, roll });
  }

  function box(x: number, y: number, n: number, size: Dimensions, color: string, yaw = 0) {
    part('box', x, y, n, size, color, yaw);
  }

  function protectedArea(x: number, n: number, radius: number) {
    return keepClear(x, n, radius) || roadCorridorKeepClear(x, n, radius);
  }

  function infillProtectedArea(x: number, n: number, radius: number) {
    if (extensionStreetClearance(x, n, radius)) return true;
    const oldMargin = 8 + radius;
    if (x <= layout.width - oldMargin && n <= layout.depth - oldMargin) return protectedArea(x, n, radius);
    // The older occupancy callback protects the whole expansion as outside its lots.
    if (roadCorridorKeepClear(x, n, radius)) return true;
    for (const { origin: [east, north], footprint: [width, depth] } of extensionPlots) {
      if (Math.abs(x - east) < width / 2 + radius && Math.abs(n - north) < depth / 2 + radius) return true;
    }
    for (const parcels of Object.values(districtParcels)) for (const [east, north, width, depth] of parcels) {
      if (Math.hypot(x - east, n - north) < Math.hypot(width, depth) / 2 + radius) return true;
    }
    return false;
  }

  function reserve(x: number, n: number, radius: number, colliderRadius = 0, infill = false) {
    const bounds = infill ? worldBounds : layout;
    if (!Number.isFinite(x + n) || x < 2 + radius || x > bounds.width - 2 - radius
      || n < 2 + radius || n > bounds.depth - 2 - radius || isWater(x, n)
      || (infill ? infillProtectedArea(x, n, radius) : protectedArea(x, n, radius))
      || grid.surfaces[Math.round(n) * grid.gridWidth + Math.round(x)] === 4
      || footprints.some(other => Math.hypot(x - other.x, n - other.n) < radius + other.radius)) return false;
    footprints.push({ x, n, radius });
    if (colliderRadius) colliders.push({ x, n, radius: colliderRadius });
    return true;
  }

  function lantern(x: number, y: number, n: number, size: number) {
    part('globe', x, y, n, [size * 1.25, size, size], red);
    part('light', x, y - size * .04, n, [size * 1.29, size * .55, size * 1.05], gold);
    box(x, y + size * .48, n, [size * .5, size * .10, size * .48], '#be8b4e');
    box(x, y - size * .64, n, [size * .1, size * .36, size * .1], '#d94b45');
  }

  const up = new Vector3(0, 1, 0);
  const beamDirection = new Vector3();
  const orient = new Object3D();
  function beam(ax: number, ay: number, an: number, bx: number, by: number, bn: number, thickness: number, color: string) {
    beamDirection.set(bx - ax, by - ay, an - bn);
    const length = beamDirection.length();
    orient.quaternion.setFromUnitVectors(up, beamDirection.normalize());
    part('box', (ax + bx) / 2, (ay + by) / 2, (an + bn) / 2, [thickness, length, thickness], color,
      orient.rotation.y, orient.rotation.x, orient.rotation.z);
  }

  function boulder(x: number, n: number, size: number, icy = false) {
    const y = grid.heightAt(x, n);
    const yaw = random() * Math.PI;
    const tone = icy ? '#86bdd3' : ['#516d84', '#7b8d9e', '#647789'][Math.floor(random() * 3)];
    part('rock', x, y + size * .21, n, [size, size * .7, size * .83], tone, yaw);
    part('rock', x, y + size * .49, n, [size * .9, size * .3, size * .78], snow, yaw);
  }

  function reeds(x: number, n: number, y: number) {
    for (let i = 0; i < 9; i++) {
      const a = random() * Math.PI * 2;
      const span = .22 + random() * 1.24;
      const xx = x + Math.cos(a) * span;
      const nn = n + Math.sin(a) * span;
      const height = .48 + random() * .78;
      const ground = Math.max(y - .24, grid.heightAt(xx, nn));
      part('pillar', xx, ground + height / 2, nn, [.045, height, .045], '#9b8462', a, .17);
      part('globe', xx, ground + height, nn, [.087, .23, .075], '#6c584c', a, .17);
    }
  }

  for (let n = 10; n < layout.depth - 10; n += 6) {
    for (const side of [-1, 1]) {
      const jitter = n + random() * 4;
      const river = riverX(jitter);
      const bank = river + side * (9.3 + random() * 6.2);
      const radius = 1.15 + random() * .55;
      if (reserve(bank, jitter, radius)) {
        if (random() > .3) {
          boulder(bank, jitter, radius * 1.3, random() > .67);
          const behind = bank + side * 2.8;
          if (reserve(behind, jitter + 2.7, .85)) boulder(behind, jitter + 2.7, 1.25);
        } else reeds(bank, jitter, grid.heightAt(bank, jitter));
      }
      const waterEdge = river + side * (6.7 + random() * .5);
      if (layout.bridges.some(bridge => Math.abs(bridge.north - jitter) < 4.8) || random() < .13) continue;
      part('floe', waterEdge, waterHeight + .018, jitter, [1.1 + random() * 1.4, .085, 2.0 + random() * 3.8],
        random() > .28 ? '#98bed6' : '#6c9bb8', random() * .8);
    }
  }

  const [lakeX, lakeNorth] = layout.lake.center;
  const [lakeWidth, lakeDepth] = layout.lake.radius;
  for (let i = 0; i < 62; i++) {
    const angle = i * 2 * Math.PI / 62 + random() * .045;
    const distance = 1.04 + .17 * random();
    const x = lakeX + Math.cos(angle) * lakeWidth * distance;
    const n = lakeNorth + Math.sin(angle) * lakeDepth * distance;
    const size = 1.6 + random() * 2.6;
    if (reserve(x, n, size * .55)) {
      if (i % 3 === 0) reeds(x, n, grid.heightAt(x, n));
      else boulder(x, n, size, i % 4 === 0);
    }
  }

  function iceCrack(ax: number, an: number, bx: number, bn: number, width: number, tint: string) {
    const x = (ax + bx) / 2;
    const n = (an + bn) / 2;
    const allIce = [[ax, an], [x, n], [bx, bn]].every(([east, north]) =>
      grid.surfaces[Math.round(north) * grid.gridWidth + Math.round(east)] === 4);
    if (allIce) {
      const length = Math.hypot(bx - ax, bn - an);
      box(x, grid.heightAt(x, n) + .013, n, [length, .018, width], tint, Math.atan2(bn - an, bx - ax));
    }
  }

  // Fine fractures stay inside the ice sheet and keep the river mouth clear.
  for (let i = 0; i < 23; i++) {
    let x = lakeX + (random() - .5) * lakeWidth * 1.65;
    let n = lakeNorth + (random() - .5) * lakeDepth * 1.5;
    let direction = random() * Math.PI * 2;
    for (let step = 0; step < 5; step++) {
      const distance = 1.3 + random() * 2.8;
      const xx = x + Math.cos(direction) * distance;
      const nn = n + Math.sin(direction) * distance;
      iceCrack(x, n, xx, nn, .095 - step * .013, '#94c3db');
      if (step === 1) {
        const branch = direction + (random() > .5 ? 1 : -1) * .9;
        iceCrack(x, n, x + Math.cos(branch) * 2.2, n + Math.sin(branch) * 2.2, .05, '#a1cce1');
      }
      x = xx;
      n = nn;
      direction += (random() - .5) * .8;
    }
  }

  function snowman(x: number, n: number, direction: number) {
    if (!reserve(x, n, 1.25, .7)) return;
    const y = grid.heightAt(x, n);
    for (const [offset, size] of [[.59, 1.3], [1.35, .98], [2.0, .73]]) {
      part('globe', x, y + offset, n, [size, size, size], snow);
    }
    const fx = Math.sin(direction);
    const fn = -Math.cos(direction);
    part('pillar', x, y + 2.42, n, [.65, .33, .65], '#29364b');
    part('pillar', x, y + 2.30, n, [.94, .07, .94], '#29364b');
    part('pillar', x, y + 1.73, n, [.75, .12, .75], '#be3f43');
    for (const side of [-1, 1]) {
      part('globe', x + fx * .29 + side * fn * .10, y + 2.06, n + fn * .29 - side * fx * .10,
        [.09, .10, .085], '#27394a');
      beam(x - side * fn * .34, y + 1.46, n + side * fx * .34,
        x - side * fn * .84, y + 1.77, n + side * fx * .84, .072, wood);
    }
    part('rock', x + fx * .34, y + 1.97, n + fn * .34, [.16, .14, .16], '#f10');
  }

  function bench(x: number, n: number, direction: number) {
    if (!reserve(x, n, 1.7)) return;
    const y = grid.heightAt(x, n);
    const point = (u: number, v = 0) => [x + u * Math.cos(direction) - v * Math.sin(direction), n + u * Math.sin(direction) + v * Math.cos(direction)] as const;
    for (const u of [-.88, .88]) {
      const [px, pn] = point(u);
      box(px, y + .3, pn, [.20, .6, .85], stone, direction);
      const [bx, bn] = point(u, .36);
      box(bx, y + .8, bn, [.12, .92, .13], timber, direction);
    }
    for (const v of [-.27, .02, .31]) {
      const [px, pn] = point(0, v);
      box(px, y + .63, pn, [2.4, .11, .24], wood, direction);
    }
    const [bx, bn] = point(0, .37);
    box(bx, y + 1.10, bn, [2.39, .26, .11], wood, direction);
    box(bx, y + 1.25, bn, [2.39, .04, .12], snow, direction);
  }

  function fence(x: number, n: number, direction: number, length: number, height = 1.22) {
    const nx = Math.cos(direction), nn = Math.sin(direction);
    const interval = 2.6;
    let last: { x: number; n: number; y: number } | undefined;
    for (let d = -length / 2; d <= length / 2; d += interval) {
      const fx = x + d * nx;
      const fn = n + d * nn;
      if (!reserve(fx, fn, .56, .27)) { last = undefined; continue; }
      const y = grid.heightAt(fx, fn);
      box(fx, y + height / 2, fn, [.27, height, .27], timber, direction);
      box(fx, y + height + .01, fn, [.33, .08, .32], snow, direction);
      if (last) {
        for (const rail of [.39, .90]) {
          const offset = rail * height / 1.22;
          beam(last.x, last.y + offset, last.n, fx, y + offset, fn, .14, wood);
        }
        colliders.push({ x: (last.x + fx) / 2, n: (last.n + fn) / 2, radius: interval * .31 });
      }
      last = { x: fx, n: fn, y };
    }
  }

  function festiveLantern(x: number, y: number, n: number, size: number, step: number) {
    const paper = ['#e63f36', '#d72f33', '#c5323a'][step % 3];
    part('globe', x, y, n, [size * 1.18, size, size * 1.18], paper);
    part('light', x, y, n, [size * 1.20, size * .28, size * 1.20], '#ef6347');
    for (const edge of [-1, 1]) {
      box(x, y + edge * size * .43, n, [size * .54, size * .10, size * .54], '#e1a54d');
    }
    box(x, y + size * .62, n, [.036, size * .33, .036], '#4c2932');
    box(x, y - size * .59, n, [.052, size * .27, .052], '#e1a54d');
    box(x, y - size * .76, n, [.079, size * .15, .079], '#ba2735');
  }

  function festivalString(ax: number, ay: number, an: number, bx: number, by: number, bn: number, sag: number, leaveCenter = false) {
    let [px, py, pn] = [ax, ay, an];
    const segments = 12;
    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      const xx = ax + (bx - ax) * t;
      const yy = ay + (by - ay) * t - 4 * sag * t * (1 - t);
      const nn = an + (bn - an) * t;
      beam(px, py, pn, xx, yy, nn, .045, '#502a32');
      if (i % 2 && (!leaveCenter || i < 5 || i > 7)) {
        const size = .57 + (i % 4) * .04;
        festiveLantern(xx, yy - size * .74, nn, size, (i - 1) / 2);
      }
      [px, py, pn] = [xx, yy, nn];
    }
  }

  function festivalLights(x: number, n: number, direction: number, length = 10) {
    const dx = Math.cos(direction), dn = Math.sin(direction);
    const at = (fraction: number) => [x + dx * length * (fraction - .5), n + dn * length * (fraction - .5)] as const;
    const [ax, an] = at(0), [bx, bn] = at(1);
    const ay = grid.heightAt(ax, an), by = grid.heightAt(bx, bn);
    if (Math.abs(ay - by) > 2.8 || [0, .25, .5, .75, 1].some(t => {
      const [east, north] = at(t);
      return protectedArea(east, north, .5) || isWater(east, north);
    })) return;
    if (!reserve(ax, an, .65) || !reserve(bx, bn, .65)) return;
    for (const [xx, nn, yy] of [[ax, an, ay], [bx, bn, by]]) {
      box(xx, yy + 1.97, nn, [.22, 3.94, .22], timber);
      box(xx, yy + .22, nn, [.55, .44, .55], stone);
      box(xx, yy + 4.02, nn, [.36, .16, .35], snow);
      colliders.push({ x: xx, n: nn, radius: .27 });
    }
    festivalString(ax, ay + 3.88, an, bx, by + 3.88, bn, .75);
  }

  // Strings and benches follow the open edge of the square instead of crossing its paths.
  for (const [x, n, direction, length] of [
    [185, 189, Math.PI / 2, 9], [260, 176, Math.PI / 2, 11], [260, 205, Math.PI / 2, 9],
    [198, 160, 0, 9], [208, 221, Math.PI / 2, 10], [251, 219, Math.PI / 2, 8],
    [149, 118, 0, 11], [175, 94, Math.PI / 2, 11], [321, 117, Math.PI / 2, 10],
    [370, 118, 0, 10], [355, 260, .6, 9], [118, 241, .5, 9],
  ]) festivalLights(x, n, direction, length);

  // The two main-street façades carry their own lines. The brackets are elevated and share
  // the same box/paper/glow batches with the existing poles around the plaza.
  for (const [id, spread, wall, edge, height] of [
    ['tavern', 7.45, 6.42, 7.01, 5.14],
    ['post-office', 5.84, 7.28, 7.97, 6.95],
  ] as const) {
    const [x, n, y] = layout.plots.find(plot => plot.id === id)!.origin;
    for (const side of [-1, 1]) {
      const holder = x + side * spread;
      box(holder, y + height + .07, n - wall + .035, [.16, .27, .12], '#8f623e');
      beam(holder, y + height + .065, n - wall, holder, y + height, n - edge, .065, '#503238');
    }
    // Leave the existing tavern name readable below the center of the cable.
    festivalString(x - spread, y + height, n - edge, x + spread, y + height, n - edge, .41, id === 'tavern');
  }

  // Keep the tavern's south approach open by putting the new furniture on the east verge.
  const [tavernX, tavernNorth] = layout.plots.find(plot => plot.id === 'tavern')!.origin;
  const vergeEast = tavernX + 13;
  fence(vergeEast, tavernNorth, Math.PI / 2, 5.2, .66);
  const pileNorth = tavernNorth - 5.3;
  if (reserve(vergeEast, pileNorth, .76, .67)) {
    const y = grid.heightAt(vergeEast, pileNorth);
    for (const [row, count] of [3, 2, 1].entries()) {
      for (let column = 0; column < count; column++) {
        const x = vergeEast + (column - (count - 1) / 2) * .21;
        const logY = y + .12 + row * .17;
        box(x, logY, pileNorth, [.18, .20, 1.00], timber);
        box(x, logY, pileNorth - .508, [.15, .16, .025], wood);
      }
    }
    box(vergeEast, y + .61, pileNorth, [.54, .116, 1.03], snow);
  }
  const flagNorth = tavernNorth - 7.15;
  if (reserve(vergeEast, flagNorth, .62, .18)) {
    const y = grid.heightAt(vergeEast, flagNorth);
    box(vergeEast, y + 1.46, flagNorth, [.16, 2.92, .16], timber);
    box(vergeEast - .42, y + 2.83, flagNorth, [.92, .12, .12], wood);
    addTavernStreetBanner(group, vergeEast - .46, y + 2.14, -flagNorth - .08);
  }

  const [towerX, towerNorth, towerY] = layout.plots.find(plot => plot.id === 'clocktower')!.origin;
  // A raised timber plaque seats against the stone wall beyond the old brass entrance trim.
  box(towerX, towerY + 7.42, towerNorth - 6.76, [4.20, 1.41, .18], '#664135');
  for (const x of [towerX - 1.86, towerX + 1.86]) {
    box(x, towerY + 7.08, towerNorth - 6.23, [.19, .20, 1.07], '#654339');
  }

  for (const [x, n, d] of [
    [185, 198, Math.PI / 2], [185, 184, Math.PI / 2], [256, 185, Math.PI / 2], [256, 202, Math.PI / 2],
    [205, 163, 0], [221, 163, 0], [180, 96, .25], [137, 92, .2], [348, 106, 0], [363, 108, .25],
    [120, 251, .53], [352, 241, 0], [301, 201, Math.PI / 2], [266, 142, .5], [266, 107, 0],
  ]) bench(x, n, d);
  for (const [x, n, d] of [
    [188, 195, -.4], [254, 209, .3], [201, 166, 1], [230, 164, -.2], [178, 218, -.4],
    [145, 218, .3], [272, 197, -.4], [114, 250, .2], [155, 121, .8], [177, 108, .9],
    [333, 127, -.4], [354, 95, .3], [367, 118, .3], [342, 247, -.2], [366, 297, .1],
  ]) snowman(x, n, d);
  for (const [x, n, d, length] of [
    [167, 249, -.12, 28], [107, 289, .9, 24], [99, 165, 1.54, 19], [164, 86, -.12, 23],
    [197, 106, .5, 24], [350, 127, .10, 23], [396, 137, -.8, 29], [404, 230, -1, 28],
    [321, 266, 1.35, 30], [179, 291, -.13, 28], [273, 167, 1.13, 15],
  ]) fence(x, n, d, length);

  function supplies(x: number, n: number) {
    if (!reserve(x, n, 1.6, .63)) return;
    const y = grid.heightAt(x, n);
    part('pillar', x - .45, y + .48, n, [.85, .95, .86], wood);
    for (const offset of [.28, .73]) {
      part('pillar', x - .45, y + offset, n, [.89, .11, .9], '#58606a');
    }
    box(x + .51, y + .38, n + .28, [.88, .75, .84], '#b18c67', .18);
    box(x + .51, y + .75, n + .28, [.90, .065, .86], snow, .18);
    box(x + .80, y + .27, n - .53, [.56, .54, .57], timber, -.15);
  }

  for (const [x, n] of [[174, 222], [147, 225], [267, 201], [113, 124], [155, 91], [164, 94],
    [175, 111], [347, 104], [369, 106], [398, 83], [346, 252], [369, 303], [244, 152], [176, 173]]) supplies(x, n);

  function signalKiosk(x: number, n: number, yaw: number) {
    const y = grid.heightAt(x, n);
    if (y < waterHeight + 1 || !reserve(x, n, 5.25, 2.0)) return;
    const point = (u: number, v: number) => [x + u * Math.cos(yaw) - v * Math.sin(yaw), n + u * Math.sin(yaw) + v * Math.cos(yaw)] as const;
    box(x, y - .28, n, [5.4, 1.38, 4.1], stone, yaw);
    box(x, y + .45, n, [4.9, .20, 3.9], wood, yaw);
    for (const u of [-2.0, 2.0]) {
      for (const v of [-1.5, 1.5]) {
        const [px, pn] = point(u, v);
        box(px, y + 1.91, pn, [.27, 2.94, .27], red, yaw);
      }
    }
    box(x, y + 3.24, n, [4.85, .28, 3.87], red, yaw);
    for (let rank = 0; rank < 9; rank++) {
      const width = 6.1 - rank * .33;
      const depth = 5.1 - rank * .52;
      box(x, y + 3.45 + rank * .16, n, [width, .17, depth], '#415567', yaw);
      box(x, y + 3.56 + rank * .16, n, [width * .99, .07, depth * .985], snow, yaw);
    }
    for (const u of [-1.44, 1.44]) {
      const [px, pn] = point(u, -1.6);
      lantern(px, y + 2.78, pn, .74);
    }
  }

  for (const [x, n, yaw] of [[269, 125, .3], [316, 173, -.18], [246, 275, .52], [400, 51, -.2], [321, 26, .45]]) {
    if (!bridgeAt(x, n)) signalKiosk(x, n, yaw);
  }
  for (const road of layout.roads) {
    if (!road.id.endsWith('-loop')) continue;
    for (let i = 1; i < road.points.length; i++) {
      const [ax, an] = road.points[i - 1];
      const [bx, bn] = road.points[i];
      const dx = bx - ax, dn = bn - an;
      const length = Math.hypot(dx, dn);
      for (let t = .2; t < .92; t += .36) {
        for (const side of [-1, 1]) {
          const margin = 6 + random() * 1.8;
          const x = ax + dx * t - side * dn / length * margin;
          const n = an + dn * t + side * dx / length * margin;
          if (!reserve(x, n, .72)) continue;
          const y = grid.heightAt(x, n);
          box(x, y + .15, n, [.67, .29, .66], stone);
          box(x, y + .86, n, [.14, 1.52, .14], timber);
          lantern(x, y + 1.49, n, .55);
        }
      }
    }
  }

  const legacyFootprints = footprints.length;
  const infillPlaced = new Map<string, StreetInfillKind[]>();
  const infillSize = {
    lantern: [.55, .22], fence: [1.4, .58], firewood: [.8, .55], sign: [.76, .24], lanternFir: [1.65, .36],
  } as const;

  function addInfill(kind: StreetInfillKind, x: number, n: number, yaw: number) {
    if (kind === 'snowman') {
      if (!extensionStreetClearance(x, n, 1.25)) snowman(x, n, yaw);
      return;
    }
    const [radius, collision] = infillSize[kind];
    if (!reserve(x, n, radius, collision, true)) return;
    const y = grid.heightAt(x, n);
    const dx = Math.cos(yaw), dn = Math.sin(yaw);
    const block = (u: number, h: number, v: number, size: Dimensions, tint: string) =>
      box(x + dx * u - dn * v, y + h, n + dn * u + dx * v, size, tint, yaw);

    switch (kind) {
      case 'lanternFir':
        block(0, .67, 0, [.24, 1.34, .26], timber);
        for (const [tier, width] of [2.22, 1.63, 1.02, .55].entries()) {
          const height = 1.04 + tier * .47;
          block(0, height, 0, [width, .58, width * .86], tier % 2 ? '#395b53' : '#36534e');
          block(0, height + .33, 0, [width * .91, .10, width * .76], snow);
        }
        lantern(x - dx * .82, y + 1.36, n - dn * .82, .34);
        lantern(x + dx * .65, y + 1.85, n + dn * .65, .31);
        break;
      case 'lantern':
        block(0, .13, 0, [.48, .26, .48], stone);
        block(0, 1.34, 0, [.15, 2.68, .15], timber);
        block(.23, 2.61, 0, [.49, .10, .16], wood);
        lantern(x + dx * .39, y + 2.45, n + dn * .39, .28);
        break;
      case 'fence':
        for (const u of [-1.05, 0, 1.05]) {
          block(u, .33, 0, [.15, .74, .15], timber);
          block(u, .74, 0, [.19, .09, .19], snow);
          if (u) colliders.push({ x: x + dx * u, n: n + dn * u, radius: .26 });
        }
        for (const h of [.27, .56]) block(0, h, 0, [2.16, .12, .11], wood);
        break;
      case 'firewood':
        block(0, .11, 0, [1.30, .22, .73], timber);
        for (const [row, count] of [5, 4, 3].entries()) for (let i = 0; i < count; i++) {
          const u = (i - (count - 1) / 2) * .19;
          block(u, .27 + row * .15, 0, [.16, .16, .67], wood);
          block(u, .27 + row * .15, -.34, [.123, .123, .035], '#bf956a');
        }
        block(0, .69, 0, [.84, .09, .72], snow);
        break;
      case 'sign':
        block(0, .9, 0, [.14, 1.80, .14], timber);
        block(.25, 1.50, 0, [.88, .30, .12], wood);
        block(.47, 1.50, -.08, [.14, .14, .045], gold);
        block(.25, 1.68, 0, [.88, .09, .16], snow);
        break;
    }
  }

  for (const { id, points } of streetInfill) {
    const placed: StreetInfillKind[] = [];
    for (const [kind, x, n, yaw = 0] of points) {
      const before = footprints.length;
      addInfill(kind, x, n, yaw);
      if (footprints.length > before) placed.push(kind);
    }
    infillPlaced.set(id, placed);
  }

  const lit = new MeshBasicMaterial();
  const neutral = new MeshLambertMaterial();
  const instanceColor = new Color();
  const transform = new Object3D();
  for (const [shape, objects] of batches) {
    const material: Material = shape === 'light' ? lit : neutral;
    const mesh = new InstancedMesh(geometries[shape], material, objects.length);
    mesh.name = `Street ${shape}`;
    objects.forEach(({ x, y, n, size, color, yaw, pitch, roll }, index) => {
      transform.position.set(x, y, -n);
      transform.rotation.set(pitch, yaw, roll);
      transform.scale.set(...size);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
      mesh.setColorAt(index, instanceColor.set(color));
    });
    mesh.computeBoundingSphere();
    group.add(mesh);
  }

  return {
    count: footprints.length + (batches.get('floe')?.length ?? 0),
    infillPlaced,
    occupied: (x: number, n: number, radius: number) => footprints.some((other, index) =>
      index < legacyFootprints && Math.hypot(x - other.x, n - other.n) < other.radius + radius),
    blocked: (x: number, n: number) => colliders.some(other => Math.hypot(x - other.x, n - other.n) < other.radius + .26),
  };
}
