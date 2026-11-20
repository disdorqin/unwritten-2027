import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group } from 'three';
import { addDistrictHousing } from '../tools/voxel-tavern/town-blockout/district-layout.ts';
import { addForestDensity } from '../tools/voxel-tavern/town-blockout/forest-density.ts';
import { readWalkGeometry } from '../tools/voxel-tavern/town-blockout/landmark-kit.ts';
import { buildMascotPen } from '../tools/voxel-tavern/town-blockout/landmark-mascot-pen.ts';
import { buildTavernLandmark } from '../tools/voxel-tavern/town-blockout/landmark-tavern.ts';
import {
  mascotDayPatrolLegs, mascotPatrolSites, mascotPenBounds, mascotWhiteoutReturnPaths, mascotWishTreeNapPath,
  type MascotPatrolPoint,
} from '../tools/voxel-tavern/town-blockout/mascot-patrol-sites.ts';
import { addScenery } from '../tools/voxel-tavern/town-blockout/scenery.ts';
import { addStreetscape } from '../tools/voxel-tavern/town-blockout/streetscape.ts';
import { buildTavernWarmShed } from '../tools/voxel-tavern/town-blockout/tavern-warm-shed.ts';
import { canEnter, createTerrainGrid, layout } from '../tools/voxel-tavern/town-blockout/terrain.ts';
import { extensionRoadClearance, extensionStreetClearance } from '../tools/voxel-tavern/town-blockout/town-extension.ts';
import { buildPineCamp } from '../tools/voxel-tavern/town-blockout/town-pine-camp.ts';
import { createTownRailway } from '../tools/voxel-tavern/town-blockout/town-railway.ts';
import { createTownWater } from '../tools/voxel-tavern/town-blockout/town-water.ts';

test('the pen is open from spawn and the full daytime and early-return walks have dry support', () => {
  const grid = createTerrainGrid();
  const world = new Group();
  const rail = createTownRailway(grid);
  const water = createTownWater(grid);
  const pine = buildPineCamp(grid);
  const documentBefore = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const gradient = () => ({ addColorStop() {} });
  const context = {
    createRadialGradient: gradient, createLinearGradient: gradient,
    fillRect() {}, strokeRect() {}, fillText() {}, drawImage() {},
    beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, stroke() {},
    translate() {}, rotate() {}, measureText() { return { width: 1 }; },
  };
  Object.defineProperty(globalThis, 'document', {
    configurable: true, value: { createElement: () => ({ getContext: () => context }) },
  });
  let scenery: ReturnType<typeof addScenery>;
  let houses: ReturnType<typeof addDistrictHousing>;
  let streets: ReturnType<typeof addStreetscape>;
  let tavern: ReturnType<typeof buildTavernLandmark>;
  const plot = layout.plots.find(({ id }) => id === 'tavern')!;
  try {
    scenery = addScenery(world, grid, pine.keepClear);
    houses = addDistrictHousing(world, grid, scenery.blocked, rail.keepClear);
    streets = addStreetscape(world, grid, (x, n, r) =>
      houses.keepClear(x, n, r) || extensionRoadClearance(x, n, r) || pine.keepClear(x, n, r));
    tavern = buildTavernLandmark(plot);
  } finally {
    if (documentBefore) Object.defineProperty(globalThis, 'document', documentBefore);
    else Reflect.deleteProperty(globalThis, 'document');
  }
  const forest = addForestDensity(world, grid,
    (x, n, r) => houses.keepClear(x, n, r) || streets.occupied(x, n, r) || pine.keepClear(x, n, r),
    (x, n, r) => extensionRoadClearance(x, n, r) || rail.keepClear(x, n, r) || extensionStreetClearance(x, n, r));
  assert.ok(houses.housePortals.some(({ id }) => id === 'old-town:117:202'));
  tavern.position.set(plot.origin[0], plot.origin[2], -plot.origin[1]);
  tavern.userData.colliders.push(...buildTavernWarmShed(plot, grid.heightAt).colliders);
  const penGeometry = readWalkGeometry(buildMascotPen(grid.heightAt));
  const tavernGeometry = readWalkGeometry(tavern);
  const boxes = [...penGeometry.colliders, ...tavernGeometry.colliders, ...tavernGeometry.floors];
  const contained = ({ min, max }: typeof boxes[number], x: number, n: number, feet: number) =>
    feet + .025 < max[1] && feet + 1.775 > min[1] &&
    Math.hypot(Math.max(min[0] - x, x - max[0], 0), Math.max(min[2] + n, -n - max[2], 0)) < .27;
  function clear(x: number, n: number) {
    const feet = grid.heightAt(x, n);
    return canEnter(x, n) && !water.at(x, n) && !rail.keepClear(x, n, .27) &&
      !scenery.plazaCoverBlocks(x, n, .27) && [scenery, houses, streets, forest].every(part => !part.blocked(x, n)) &&
      boxes.every(box => !contained(box, x, n, feet));
  }
  function walk(points: readonly MascotPatrolPoint[]) {
    let priorHeight = grid.heightAt(...points[0]);
    for (let index = 1; index < points.length; index++) {
      const [x0, n0] = points[index - 1], [x1, n1] = points[index];
      const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, n1 - n0) / .12));
      for (let step = 0; step <= steps; step++) {
        const ratio = step / steps;
        const x = x0 + (x1 - x0) * ratio, n = n0 + (n1 - n0) * ratio;
        const height = grid.heightAt(x, n);
        const margin = .3;
        assert.ok(clear(x, n) && clear(x - margin, n) && clear(x + margin, n) &&
          clear(x, n - margin) && clear(x, n + margin), `blocked at E${x.toFixed(2)} N${n.toFixed(2)}`);
        assert.ok(Number.isFinite(height) && Math.abs(height - priorHeight) <= .43, `unsupported at E${x} N${n}`);
        priorHeight = height;
      }
    }
  }

  const [spawnEast, spawnNorth] = layout.plaza.spawn;
  walk([[spawnEast, spawnNorth], ...mascotWhiteoutReturnPaths.plazaSun]);
  for (const [index, leg] of mascotDayPatrolLegs.entries()) {
    assert.equal(leg.at(-1), mascotDayPatrolLegs[(index + 1) % mascotDayPatrolLegs.length][0]);
    walk(leg);
  }
  walk(mascotWishTreeNapPath);
  for (const [site, path] of Object.entries(mascotWhiteoutReturnPaths)) {
    assert.equal(path[0], mascotPatrolSites[site as keyof typeof mascotWhiteoutReturnPaths]);
    assert.equal(path.at(-1), mascotPatrolSites.pen);
    walk(path);
  }
  assert.ok(clear(...mascotPatrolSites.pen));
  assert.ok(clear(mascotPenBounds.east, 214.2) && clear(mascotPenBounds.east, 215.8));
  assert.ok(!clear(mascotPenBounds.west, 215) && !clear(mascotPenBounds.east, 217.35));
});
