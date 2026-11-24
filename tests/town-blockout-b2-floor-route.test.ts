import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildB2FloorRoute} from '../tools/verify-b2-floor-route';
import {meteorCraterDepth,meteorCraterFloorRadius,meteorCraterRimRadius} from '../tools/voxel-tavern/town-blockout/meteor-crater';

const route=buildB2FloorRoute();

test('B-2 surveys the entire real B-01 trail, not just the A-5 near-crystal waypoint',()=>{
  assert.equal(route.points[0].t,0);
  assert.equal(route.points.at(-1)?.t,1);
  assert.ok(route.points.length>100);
  assert.ok(route.points.every(p=>[p.east,p.north,p.height].every(Number.isFinite)));
  assert.ok(route.points.every((p,i,a)=>i===0||p.t>a[i-1].t));
  assert.ok(Math.abs(Math.hypot(route.lip.east-route.center.east,route.lip.north-route.center.north)-meteorCraterRimRadius)<.01);
  assert.ok(Math.abs(route.points.at(-1)!.height-route.floorHeight)<.02);
});

test('B-2 floor eye lies on the physical bottom apron, away from the central shaft',()=>{
  const r=Math.hypot(route.floor.east-route.center.east,route.floor.north-route.center.north);
  assert.ok(r>meteorCraterFloorRadius/2 && r<meteorCraterFloorRadius);
  assert.ok(Math.abs(route.floor.height-(route.rimHeight-meteorCraterDepth))<.02);
  const out=[Math.sin(route.floorYaw),Math.cos(route.floorYaw)];
  assert.ok(out[0]*(route.floor.east-route.center.east)+out[1]*(route.floor.north-route.center.north)>0);
});

test('B-2 survey height decreases continuously across the complete spiral',()=>{
  const first=route.points[0],last=route.points.at(-1)!;
  assert.ok(Math.abs(first.height-last.height-meteorCraterDepth)<.04);
  for(let i=1;i<route.points.length;i++){
    const a=route.points[i-1],b=route.points[i];
    assert.ok(b.height-a.height<.06, `unexpected rise at t=${b.t}`);
    assert.ok(Math.hypot(b.east-a.east,b.north-a.north)<12.5,`oversize walk chord at t=${b.t}`);
  }
});
