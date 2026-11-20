import { Group } from 'three';
import { addDistrictHousing } from './voxel-tavern/town-blockout/district-layout';
import { addForestDensity } from './voxel-tavern/town-blockout/forest-density';
import { addScenery } from './voxel-tavern/town-blockout/scenery';
import { addStreetscape } from './voxel-tavern/town-blockout/streetscape';
import { createTerrainGrid, canEnter } from './voxel-tavern/town-blockout/terrain';
import { createTownRailway } from './voxel-tavern/town-blockout/town-railway';
import { buildPineCamp } from './voxel-tavern/town-blockout/town-pine-camp';
import { extensionRoadClearance, extensionStreetClearance } from './voxel-tavern/town-blockout/town-extension';

const grid = createTerrainGrid();
const landscape = new Group();
const track = createTownRailway(grid);
const camp = buildPineCamp(grid);
const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
Object.defineProperty(globalThis, 'document', {
  configurable: true,
  value: { createElement: () => ({ getContext: () => ({
    createRadialGradient: () => ({ addColorStop() {} }),
    fillRect() {}, strokeRect() {}, fillText() {}, drawImage() {},
  }) }) },
});
let scenery: ReturnType<typeof addScenery>;
try {
  scenery = addScenery(landscape, grid, camp.keepClear);
} finally {
  if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
  else Reflect.deleteProperty(globalThis, 'document');
}
const district = addDistrictHousing(landscape, grid, scenery.blocked, track.keepClear);
const streets = addStreetscape(landscape, grid, (e, n, r) =>
  district.keepClear(e, n, r) || extensionRoadClearance(e, n, r) || camp.keepClear(e, n, r));
const forest = addForestDensity(landscape, grid,
  (e, n, r) => district.keepClear(e, n, r) || streets.occupied(e, n, r) || camp.keepClear(e, n, r),
  (e, n, r) => extensionRoadClearance(e, n, r) || track.keepClear(e, n, r) || extensionStreetClearance(e, n, r));

const { createSledRide } = await import('./voxel-tavern/town-blockout/sled-ride');
const { readWalkGeometry } = await import('./voxel-tavern/town-blockout/landmark-kit');
const { colliders, floors, ramps } = readWalkGeometry(track.group);
const boxes = new Map<string, typeof colliders>();
for (const box of [...colliders, ...floors]) {
  for (let e = Math.floor((box.min[0] - .35) / 16); e <= Math.floor((box.max[0] + .35) / 16); e++) {
    for (let n = Math.floor((-box.max[2] - .35) / 16); n <= Math.floor((-box.min[2] + .35) / 16); n++) {
      const key = e + ':' + n;
      const list = boxes.get(key) ?? [];
      list.push(box);
      boxes.set(key, list);
    }
  }
}
const starts = [...track.stops.map(s => [s.id, s.x + 1.6, s.n, s.ground] as const),
 [ 'plaza', 234, 174, grid.heightAt(234, 174)],
 [ 'memorial', 350, 249, grid.heightAt(350, 249)],
 [ 'market', 150, 92, grid.heightAt(150, 92)],
 [ 'long-hall', 378, 303, grid.heightAt(378, 303)],
 [ 'castle', 460, 72, grid.heightAt(460, 72)],
] as const;
const results = [];
const thresholds = [6.5, 10, 17, 22.15];
const { classifyFreeWallSite, wallCellOf, wallCellCentre } = await import('../src/presence/snowfight');
const floorSet = new Set(floors);
function support(e: number, n: number) {
  let ground = grid.heightAt(e, n);
  for (const box of boxes.get(Math.floor(e / 16) + ':' + Math.floor(n / 16)) ?? []) {
    if (floorSet.has(box) && Math.hypot(Math.max(box.min[0] - e, e - box.max[0], 0),
      Math.max(box.min[2] + n, -n - box.max[2], 0)) < .27) ground = Math.max(ground, box.max[1]);
  }
  for (const ramp of ramps) {
    if (e < ramp.min[0] || e > ramp.max[0] || -n < ramp.min[2] || -n > ramp.max[2]) continue;
    const axis = ramp.axis === 'x' ? 0 : 2;
    const fraction = ((axis === 0 ? e : -n) - ramp.min[axis]) / (ramp.max[axis] - ramp.min[axis]);
    ground = Math.max(ground, ramp.min[1] + (ramp.max[1] - ramp.min[1]) *
      (ramp.ascending > 0 ? fraction : 1 - fraction));
  }
  return ground;
}
for (const [name, east, north, height] of starts) {
  for (let heading = 0; heading < 360; heading += 3) {
    const angle = heading * Math.PI / 180;
    const ride = createSledRide({
      height: support,
      surface(e, n) { return { surface: grid.surfaces[Math.round(n) * grid.gridWidth + Math.round(e)] ?? 0, deepSnow: false }; },
      blocked(e, n, y) {
        if (!canEnter(e, n) || forest.blocked(e, n) || district.blocked(e, n) ||
            scenery.blocked(e, n) || streets.blocked(e, n)) return true;
        return boxes.get(Math.floor(e / 16) + ':' + Math.floor(n / 16))?.some(({min,max}) =>
          y + .025 < max[1] && y + .9 > min[1] &&
          Math.hypot(Math.max(min[0] - e, e - max[0], 0), Math.max(min[2] + n, -n - max[2], 0)) < .35) ?? false;
      },
      snow() {},
      stopped() {},
    });
    if (!ride.mount(east, north, height, angle)) continue;
    let maximum = 0;
    let lastSpeed = 0;
    let stalledTicks = 0;
    let airborne = false;
    const milestones = [];
    let fourLayerTarget;
    for (let i = 0; i < 3900 && ride.active(); i++) {
      ride.step(1 / 60, {forward: 1, turn: 0});
      const speed = ride.speed();
      if (!fourLayerTarget && speed > 22.15) {
        const { x, n, y } = ride.spot;
        const cell = [wallCellOf(x), wallCellOf(n)];
        const [we, wn] = cell.map(wallCellCentre);
        const wallGround = grid.heightAt(we, wn);
        if (!classifyFreeWallSite(we, wn) && y >= wallGround && y < wallGround + 1.85)
          fourLayerTarget = { cell, we, wn, y, wallGround, speed, x, n };
      }
      maximum = Math.max(maximum, speed);
      airborne ||= ride.airborne();
      if (milestones.length < thresholds.length && speed >= thresholds[milestones.length]) {
        milestones.push({ speed, seconds: i / 60, airborne: ride.airborne(), ...ride.spot });
      }
      if (Math.abs(speed - lastSpeed) < .000001 && speed < .2) stalledTicks++;
      else stalledTicks = 0;
      lastSpeed = speed;
      if (stalledTicks > 180) break;
    }
    if (milestones.length) results.push({name, east, north, height, heading, maximum, airborne, milestones, fourLayerTarget });
  }
}
results.sort((a,b) => b.maximum - a.maximum);
console.log(JSON.stringify({ top: results.slice(0, 20), topTargets: results.filter(r => r.fourLayerTarget).slice(0, 20) }, null, 2));
