import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCraterMouthWorks, type CraterHitBox } from '../tools/voxel-tavern/town-blockout/town-crater-mouth-works';
import { buildCraterOuterWorks } from '../tools/voxel-tavern/town-blockout/town-crater-outer-works';
import { mountWestCraterRoad } from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import { createTerrainGrid, worldBounds } from '../tools/voxel-tavern/town-blockout/terrain';
import { supportFootprintOverlaps } from '../tools/voxel-tavern/town-blockout/town-a-r30-oriented-support';

const terrain = createTerrainGrid();

// S-1 (分支窗 A): crater-outside collision boxes. Built on a flat stub road
// (height 12 everywhere) so every site exists and the geometry is exact.
const anchor = { east: -120, north: 185, rimHeight: 12, yaw: 1.364 };
const stubRoad = { anchor, heightAt: (_east: number, _north: number) => 12 };
const mouth = buildCraterMouthWorks(stubRoad as never);
const outer = buildCraterOuterWorks(stubRoad as never);

const d2r = (deg: number) => deg * Math.PI / 180;
function siteAt(bearingDeg: number, radius: number) {
  const b = d2r(bearingDeg);
  return { east: anchor.east + radius * Math.sin(b), north: anchor.north + radius * Math.cos(b) };
}
/** Same local-frame math as the builders: +dz toward the facing bearing. */
function frameAt(origin: { east: number; north: number }, faceDeg: number, dx: number, dz: number) {
  const f = d2r(faceDeg);
  const fwd = { e: Math.sin(f), n: Math.cos(f) };
  const right = { e: Math.cos(f), n: -Math.sin(f) };
  return {
    east: origin.east + right.e * dx + fwd.e * dz,
    north: origin.north + right.n * dx + fwd.n * dz,
  };
}
/** Point-in-AABB at body-mid height, mirroring obstructed()'s y overlap. */
function blocked(boxes: CraterHitBox[], east: number, north: number, y = 13.5) {
  return boxes.some(box => east >= box.min[0] && east <= box.max[0] &&
    y >= box.min[1] && y <= box.max[1] && -north >= box.min[2] && -north <= box.max[2]);
}
function floorTopAt(boxes: CraterHitBox[], east: number, north: number) {
  let top = -Infinity;
  for (const box of boxes) {
    if (east >= box.min[0] && east <= box.max[0] && -north >= box.min[2] && -north <= box.max[2]) {
      top = Math.max(top, box.max[1]);
    }
  }
  return top;
}

test('supply station: walls block, the 2.8 m doorway and interior stay open', () => {
  const supply = siteAt(150, 74);
  const wallPoint = frameAt(supply, 330, -2.55, 2.8);
  assert.equal(blocked(mouth.colliders, wallPoint.east, wallPoint.north), true, 'front wall segment blocks');
  const doorPoint = frameAt(supply, 330, 0, 2.8);
  assert.equal(blocked(mouth.colliders, doorPoint.east, doorPoint.north), false, 'doorway stays open');
  assert.equal(blocked(mouth.colliders, supply.east, supply.north), false, 'interior is enterable');
  const counter = frameAt(supply, 330, 1.4, 1.1);
  assert.equal(blocked(mouth.colliders, counter.east, counter.north), true, 'counter blocks');
  // Interior slab and four real treads share the production support list.
  assert.ok(mouth.floors.some(f=>Math.abs(f.max[1]-12.91)<.01&&supportFootprintOverlaps(supply.east,supply.north,f,.01)), 'interior slab beneath the separate roof deck');
  const route=mouth.supplyInteriorRoute;
  assert.equal(route.length,8);
  for(const p of route.slice(1,5))
    assert.ok(mouth.floors.some(f=>Math.abs(f.max[1]-p.height)<.01&&supportFootprintOverlaps(p.east,p.north,f,.01)),'physical tread');
  assert.ok(!mouth.ramps.some(r=>doorPoint.east>=r.min[0]&&doorPoint.east<=r.max[0]&&-doorPoint.north>=r.min[2]&&-doorPoint.north<=r.max[2]),'no hidden doorway ramp');
});

test('guard shed: back wall and posts block, the open sides stay open', () => {
  const shed = siteAt(358, 64);
  const back = frameAt(shed, 178, 0, -1.25);
  assert.equal(blocked(mouth.colliders, back.east, back.north), true, 'back wall blocks');
  assert.equal(blocked(mouth.colliders, shed.east, shed.north), false, 'shed interior open');
});

test('mouth-works fence: continuous arc including the chained gate, open beyond its ends', () => {
  const onArc = siteAt(170, 90);
  assert.equal(blocked(mouth.colliders, onArc.east, onArc.north), true, 'fence panel blocks');
  const gate = siteAt(165, 90);
  assert.equal(blocked(mouth.colliders, gate.east, gate.north), true, 'chained gate blocks');
  const assembly = siteAt(165, 70);
  assert.equal(blocked(mouth.colliders, assembly.east, assembly.north), false, 'assembly ground inside stays open');
});

test('smelter and instrument plant: solid shells block as masses', () => {
  const smelter = siteAt(207, 88);
  assert.equal(blocked(outer.colliders, smelter.east, smelter.north), true, 'smelter mass blocks');
  const plant = siteAt(127, 88);
  assert.equal(blocked(outer.colliders, plant.east, plant.north), true, 'instrument mass blocks');
  const pile = frameAt(siteAt(186, 86), 366, -6, -2);
  assert.equal(blocked(outer.colliders, pile.east, pile.north), true, 'ore pile blocks');
});

test('town-era wall: segments block, the gate channel stays walkable', () => {
  assert.equal(blocked(outer.colliders, -18, 149), true, 'wall segment blocks');
  assert.equal(blocked(outer.colliders, -18, 159), false, 'gate channel open (the guard, not the door, turns you back)');
  assert.equal(blocked(outer.colliders, -18, 100), true, 'wall segment blocks');
});

test('gatehouse: walls block, doorway open, base is reached by physical steps', () => {
  const back = frameAt({ east: -13, north: 150.5 }, 90, 0, -1.93);
  assert.equal(blocked(outer.colliders, back.east, back.north), true, 'gatehouse back wall blocks');
  const door = frameAt({ east: -13, north: 150.5 }, 90, 0, 1.93);
  assert.equal(blocked(outer.colliders, door.east, door.north), false, 'gatehouse doorway open');
  assert.ok(Math.abs(floorTopAt(outer.floors, -13, 150.5) - 13) < .01, 'gatehouse base floor top');
  const route=outer.industrialRoutes.find(r=>r.id==='gatehouse');
  assert.ok(route,'gatehouse route exported');
  assert.equal(route.points.length,7);
  const steps=route.points.slice(1,5);
  for(const [i,p] of steps.entries()){
    assert.ok(Math.abs(p.height-(12+(i+1)/4))<.01,'one quarter metre riser on flat ground');
    assert.ok(outer.floors.some(b=>p.east>=b.min[0]&&p.east<=b.max[0]&&-p.north>=b.min[2]&&-p.north<=b.max[2]&&Math.abs(b.max[1]-p.height)<.01),'physical tread support');
  }
  assert.ok(!outer.ramps.some(r=>r.min[0]<=door.east&&r.max[0]>=door.east&&r.min[2]<=-door.north&&r.max[2]>=-door.north),'no invisible doorway ramp');
});

test('fence ring: panels block, station / rail / collapsed gaps stay open', () => {
  const panel = { east: anchor.east + 104 * Math.sin(d2r(200)), north: anchor.north + 104 * Math.cos(d2r(200)) };
  assert.equal(blocked(outer.colliders, panel.east, panel.north), true, 'ring panel blocks');
  const stationGap = { east: anchor.east + 97 * Math.sin(d2r(105.5)), north: anchor.north + 97 * Math.cos(d2r(105.5)) };
  assert.equal(blocked(outer.colliders, stationGap.east, stationGap.north), false, 'station crossing open');
  const railGap = { east: anchor.east + 97 * Math.sin(d2r(57)), north: anchor.north + 97 * Math.cos(d2r(57)) };
  assert.equal(blocked(outer.colliders, railGap.east, railGap.north), false, 'rail gap open');
  const collapsed = { east: anchor.east + 97 * Math.sin(d2r(21)), north: anchor.north + 97 * Math.cos(d2r(21)) };
  assert.equal(blocked(outer.colliders, collapsed.east, collapsed.north), false, 'collapsed gap open (passable at night)');
});

test('defense towers block as shaft masses', () => {
  const north = siteAt(358, 67.5);
  assert.equal(blocked(outer.colliders, north.east, north.north), true, 'north tower blocks');
  const gate = { east: -30, north: 174 };
  assert.equal(blocked(outer.colliders, gate.east, gate.north), true, 'gate tower blocks');
});

test('za22 top group carries the merged west walk geometry, all west of the seam', () => {
  const road = mountWestCraterRoad(worldBounds.depth, north => terrain.groundHeightAt(0, north));
  const { colliders, floors, ramps } = road.group.userData as {
    colliders: CraterHitBox[]; floors: CraterHitBox[]; ramps: CraterHitBox[];
  };
  assert.ok(colliders.length >= 200, `merged colliders (${colliders.length})`);
  assert.ok(floors.length >= 3, 'merged floors');
  assert.equal(ramps.length,road.mouthWorks.ramps.length+road.outerWorks.ramps.length,'merge all remaining ramps, not retired invisible door ramps');
  for (const box of [...colliders, ...floors, ...ramps]) {
    assert.ok(box.max[0] < 0, `box stays west of the seam (max east ${box.max[0]})`);
    assert.ok(box.min[0] < box.max[0] && box.min[1] < box.max[1] && box.min[2] < box.max[2], 'box is well-formed');
  }
});
