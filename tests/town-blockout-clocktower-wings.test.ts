import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Box3, InstancedMesh, Matrix4, Raycaster, Scene, Vector3 } from 'three';
import { buildTowerLandmark, clocktowerHeight } from '../tools/voxel-tavern/town-blockout/landmark-tower.ts';
import { readWalkGeometry, type Box } from '../tools/voxel-tavern/town-blockout/landmark-kit.ts';
import type { TownActivityContext } from '../tools/voxel-tavern/town-blockout/town-activity.ts';
import { createWindowActivity, type TownWindow } from '../tools/voxel-tavern/town-blockout/town-window.ts';
import { createTerrainGrid, layout } from '../tools/voxel-tavern/town-blockout/terrain.ts';

type Point = readonly [x: number, z: number];
const plot = layout.plots.find(({ id }) => id === 'clocktower')!;
const [east, north, level] = plot.origin;
const grid = createTerrainGrid();
const radius = .27;
const bodyHeight = 1.8;

function makeFixture() {
  const tower = buildTowerLandmark(plot);
  tower.position.set(east, level, -north);
  return { tower, ...readWalkGeometry(tower) };
}

function touches(x: number, z: number, volume: Box) {
  return Math.hypot(
    Math.max(volume.min[0] - x, 0, x - volume.max[0]),
    Math.max(volume.min[2] - z, 0, z - volume.max[2]),
  ) < radius;
}

function isBlocked(x: number, z: number, y: number, obstacles: Box[]) {
  return obstacles.some(box =>
    y + .025 < box.max[1] && y + bodyHeight - .025 > box.min[1] && touches(x, z, box));
}

function walk(targets: readonly Point[], geometry: ReturnType<typeof makeFixture>) {
  const { floors, colliders, ramps } = geometry;
  const obstacles = [...floors, ...colliders];
  let [x, z] = targets[0];
  let y = grid.heightAt(east + x, north - z);
  let stepCount = 0;
  let minimumHeadroom = Infinity;
  let maxStep = 0;
  const endpoints = [y];
  for (const [targetX, targetZ] of targets.slice(1)) {
    const fromX = x, fromZ = z;
    const steps = Math.ceil(Math.hypot(targetX - fromX, targetZ - fromZ) / .08);
    for (let step = 1; step <= steps; step++) {
      x = fromX + (targetX - fromX) * step / steps;
      z = fromZ + (targetZ - fromZ) * step / steps;
      const worldX = east + x, worldZ = z - north;
      const maxRise = y + .43;
      let next = floors.reduce((support, cell) =>
        cell.max[1] <= maxRise && touches(worldX, worldZ, cell) ? Math.max(support, cell.max[1]) : support,
        grid.heightAt(worldX, -worldZ));
      for (const ramp of ramps) {
        if (worldX < ramp.min[0] || worldX > ramp.max[0] || worldZ < ramp.min[2] || worldZ > ramp.max[2]) continue;
        const axis = ramp.axis === 'x' ? 0 : 2;
        const position = axis === 0 ? worldX : worldZ;
        const progress = (position - ramp.min[axis]) / (ramp.max[axis] - ramp.min[axis]);
        const support = ramp.min[1] + (ramp.max[1] - ramp.min[1]) * (ramp.ascending > 0 ? progress : 1 - progress);
        if (support <= maxRise) next = Math.max(next, support);
      }
      assert.ok(Math.abs(y - next) <= .43 + 1e-9, `height ${y}→${next} at ${x},${z}`);
      const blockage = obstacles.find(cell => next + .025 < cell.max[1] && next + bodyHeight - .025 > cell.min[1] &&
        touches(worldX, worldZ, cell));
      assert.equal(blockage, undefined, `obstruction on raw-local route at ${x.toFixed(3)},${z.toFixed(3)}, world y=${next}`);
      for (const cell of obstacles) {
        const clearance = cell.min[1] - next;
        if (clearance > .025 && clearance < minimumHeadroom && touches(worldX, worldZ, cell)) minimumHeadroom = clearance;
      }
      maxStep = Math.max(maxStep, Math.abs(next - y));
      y = next;
      stepCount++;
    }
    endpoints.push(y);
  }
  return { y, stepCount, endpoints, minimumHeadroom, maxStep };
}

const eastApproach = [[0, 11], [0, 6.4], [0, -3], [4.65, -3], [4.65, 0], [6.65, 0], [6.65, 4.48],
  [7.4, 4.48], [14.45, 4.48], [14.45, -1.5]] as const;
const westApproach = [[0, 11], [0, 6.4], [0, 0], [-13.3, 0], [-13.3, 5.1], [-14.35, 5.1],
  [-14.35, 3.6]] as const;

test('expanded wings have 0.45 m perimeter walls and six usable full-size real sashes', t => {
  const { tower, floors, colliders } = makeFixture();
  const scene = new Scene();
  scene.add(tower);
  scene.updateMatrixWorld();
  const obstacles = [...floors, ...colliders];
  const windows = tower.userData.townWindows as TownWindow[];
  assert.equal(windows.length, 6);
  const close = (value: number, expected: number) => Math.abs(value - expected) < 1e-8;
  const rear = colliders.filter(({ min, max }) => close(min[2] + north, -7) && close(max[2] + north, -6.55));
  assert.equal(rear.length, 2);
  const context: TownActivityContext = {
    scene, face() {}, announce() {}, sit() {},
    open() { return assert.fail('operating a sash does not open a panel'); },
  };
  const sashActivity = createWindowActivity(context, new Map([['clocktower', tower]]),
    (x, n, feet) => isBlocked(x, -n, feet, obstacles));
  assert.equal(sashActivity.spots.length, 6);
  for (const [index, window] of windows.entries()) {
    assert.equal(window.width, 2.125);
    assert.equal(window.height, 3.45);
    assert.equal(window.y - window.height / 2, 2.05);
    assert.ok(close(window.z, 6.775));
    for (const offsetX of [-.99, 0, .99]) {
      for (const localY of [2.12, 3.775, 5.43]) {
        const blocked = colliders.some(({ min, max }) => {
          const worldX = east + window.x + offsetX, worldY = level + localY;
          const z = window.z - north;
          return min[0] < worldX && max[0] > worldX && min[1] < worldY && max[1] > worldY && min[2] < z && max[2] > z;
        });
        assert.equal(blocked, false, `opaque solid in window ${index + 1}`);
      }
    }
  }
  const frame = tower.getObjectByName('可开启窗框');
  assert.ok(frame instanceof InstancedMesh);
  const matrix = new Matrix4();
  let sweepZ = Infinity;
  for (const spot of sashActivity.spots) spot.run();
  // Test the full opening sweep, including the nonterminal point with the most depth.
  for (let step = 0; step < 64; step++) {
    sashActivity.update(.015625);
    for (let part = 0; part < frame.count; part++) {
      frame.getMatrixAt(part, matrix);
      const p = matrix.elements;
      sweepZ = Math.min(sweepZ, p[14] - (Math.abs(p[2]) + Math.abs(p[6]) + Math.abs(p[10])) / 2);
    }
  }
  assert.ok(windows.every(window => sashActivity.isOpen(window)));
  assert.ok(sweepZ > 5.60, `sash sweeps into western loft: ${sweepZ}`);
  t.diagnostic(`6 sash spots and real opens, 54 measured opening points, both rear walls z [-7,-6.55]; sash sweep raw near edge z=${sweepZ.toFixed(5)} versus loft z=5.60.`);
});

test('west wing continues from the hall to the mezzanine exhibit without a height jump', t => {
  const geometry = makeFixture();
  const route = walk([...westApproach, [-14.35, -4.4], [-12.4, -4.4], [-10.8, -4.4]], geometry);
  assert.equal(route.y, level + 4.9);
  t.diagnostic(`west route ${route.stepCount} × ≤0.08 m, last feet ${route.y} m.`);
});

test('east wing reaches the mezzanine and the 2.2 m ridge platform with 2 m stair headroom', t => {
  const geometry = makeFixture();
  const mezz = walk([...eastApproach, [13, -1.5]], geometry);
  assert.equal(mezz.y, level + 4.9);
  const route: Point[] = [...eastApproach, [14.45, -4.48], [10.2, -4.48], [7.4, -4.48], [7.4, -2.8], [7.4, -.9],
    [7.4, 0], [7.4, 1.1], [15.2, 1.1]];
  const summit = walk(route, geometry);
  assert.equal(summit.y, level + clocktowerHeight(11.225));
  assert.ok(geometry.floors.some(({ min, max }) => min[0] === east + 5.4 && max[0] === east + 16.25 &&
    min[2] === -north && max[2] === -north + 2.2 && max[1] === summit.y));
  const obstacles = [...geometry.floors, ...geometry.colliders];
  for (const endpoint of [8, 10, 11, 12, 14]) {
    const [x, z] = route[endpoint];
    const y = summit.endpoints[endpoint];
    const ceiling = Math.min(...obstacles.filter(box => box.min[1] > y + .05 && touches(east + x, z - north, box))
      .map(box => box.min[1]));
    assert.ok(ceiling - y >= 2, `headroom at ${x},${z} = ${ceiling - y} m`);
    t.diagnostic(`headroom raw x=${x},z=${z}, feet Y=${y}: ${Number.isFinite(ceiling) ? (ceiling - y).toFixed(5) + ' m' : 'no overhead collider'}`);
  }
  t.diagnostic(`east mezzanine: ${mezz.stepCount} steps to ${mezz.y} m; ridge: ${summit.stepCount} steps to ${summit.y} m.`);
});

test('both three-metre ramp centres cross the wing front continuously', t => {
  const geometry = makeFixture();
  for (const x of [-15.5, 15.5]) {
    const route = walk([11, 7, 6.55, 6.3, 5.83, 5.52, 7, 11].map(z => [x, z]), geometry);
    assert.equal(route.endpoints[4], level + .315);
    assert.equal(route.endpoints[5], level + .3125);
    assert.equal(route.y, level);
    assert.ok(route.maxStep < .1, `unexpected ramp jump ${route.maxStep} m`);
    assert.ok(route.minimumHeadroom >= bodyHeight, `ramp headroom ${route.minimumHeadroom} m`);
    t.diagnostic(`x=${x}: ${route.stepCount} steps, crest Y=${route.endpoints[4]}, max step ${route.maxStep.toFixed(5)} m, net headroom ${route.minimumHeadroom.toFixed(5)} m.`);
  }
});

test('east ridge platform connects around the pier to the fourth tower stop and back down', t => {
  const geometry = makeFixture();
  const corner = 3.21875;
  const approach: Point[] = [...eastApproach, [14.45, -4.48], [10.2, -4.48], [7.4, -4.48], [7.4, -.9], [7.4, 1.1],
    [7.875, 1.1], [7.875, 7.78125], [corner, 7.78125], [corner, 6.3], [corner, 5.6], [corner, 4.5], [corner, corner]];
  const bridge = walk(approach, geometry);
  assert.deepEqual(bridge.endpoints.slice(-6), [11.2, 11.2, 11, 10.8125, 10.8125, 10.8125]
    .map(raw => level + clocktowerHeight(raw)));
  assert.ok(bridge.minimumHeadroom >= 2.25);
  const returnToHall = walk([...approach, [-corner, corner], [-corner, -corner], [corner, -corner],
    [corner, corner], [0, 3.2], [0, 0]], geometry);
  assert.equal(returnToHall.y, level + .3125);
  t.diagnostic(`entry to fourth deck: ${bridge.stepCount} steps, feet Y=${bridge.y}, net headroom ${bridge.minimumHeadroom.toFixed(5)} m; full return ${returnToHall.stepCount} steps to feet Y=${returnToHall.y}.`);
});

test('fourth stop has a visible south opening and the tower keeps its measured height', t => {
  const { tower, colliders } = makeFixture();
  tower.updateMatrixWorld(true);
  assert.equal(new Box3().setFromObject(tower, true).max.y - level, 117.125);
  const doorLeft = east + 2.65625;
  const doorRight = east + 3.78125;
  const sill = level + clocktowerHeight(10.8125);
  const lintel = level + clocktowerHeight(13.0625);
  const southernWall = colliders.filter(box =>
    box.min[2] === 4.5 - north && box.max[2] === 5.375 - north);
  assert.equal(southernWall.length, 4);
  assert.ok(southernWall.some(box => box.min[0] === doorLeft && box.max[0] === doorRight && box.min[1] === lintel));
  assert.ok(southernWall.some(box => box.min[0] === doorLeft && box.max[0] === doorRight && box.max[1] === sill));
  for (const x of [doorLeft + .125, (doorLeft + doorRight) / 2, doorRight - .125]) {
    for (const y of [sill + .125, (sill + lintel) / 2, lintel - .125]) {
      const ray = new Raycaster(new Vector3(x, y, 5.6 - north), new Vector3(0, 0, -1), 0, 1.125);
      assert.equal(ray.intersectObject(tower, true).length, 0, `facade crosses door at x=${x}, y=${y}`);
    }
  }
  t.diagnostic(`9 unobstructed facade sightlines; door width ${doorRight - doorLeft} m, rendered clear height ${lintel - sill} m.`);
});
