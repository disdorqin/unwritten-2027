import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createTerrainGrid,worldBounds} from '../tools/voxel-tavern/town-blockout/terrain';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import {supportFootprintOverlaps,type OrientedSupportBox} from '../tools/voxel-tavern/town-blockout/town-a-r30-oriented-support';
import type {IndustryPoint} from '../tools/voxel-tavern/town-blockout/town-a-r30-industrial-shell';
import {smelterFootway} from '../tools/voxel-tavern/town-blockout/town-a-r30-west-landscape';
import {buildCraterRailExtension} from '../tools/voxel-tavern/town-blockout/town-crater-rail-extension';
const grid=createTerrainGrid(),road=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n));
const rail=buildCraterRailExtension(grid,road);
const boxes=[...road.group.userData.colliders,...rail.group.userData.colliders] as OrientedSupportBox[],floors=[...road.group.userData.floors,...rail.group.userData.floors] as OrientedSupportBox[];
function walk(id:string,path:readonly IndustryPoint[]){
 let h=path[0]!.height;
 for(let j=1;j<path.length;j++){
  const a=path[j-1]!,b=path[j]!,steps=Math.ceil(Math.hypot(b.east-a.east,b.north-a.north)/.025);
  // Broad-phase only: exact 2.5cm sampling and original body rules unchanged.
  const nearby=(q:OrientedSupportBox)=>q.min[0]<=Math.max(a.east,b.east)+.28&&q.max[0]>=Math.min(a.east,b.east)-.28&&q.min[2]<=-Math.min(a.north,b.north)+.28&&q.max[2]>=-Math.max(a.north,b.north)-.28;
  const segmentFloors=floors.filter(nearby),segmentBoxes=boxes.filter(nearby),segmentAll=[...segmentBoxes,...segmentFloors];
  for(let i=1;i<=steps;i++){
   const t=i/steps,e=a.east+(b.east-a.east)*t,n=a.north+(b.north-a.north)*t;
   let v=road.heightAt(e,n)!;
   const overlap=(q:OrientedSupportBox)=>supportFootprintOverlaps(e,n,q,.27);
   for(const f of segmentFloors)if(f.max[1]<=h+.43&&overlap(f))v=Math.max(v,f.max[1]);
   for(const c of segmentBoxes)if(c.max[1]<=h+.025&&overlap(c))v=Math.max(v,c.max[1]);
   const hit=segmentAll.find(q=>v+.025<q.max[1]&&v+1.8-.025>q.min[1]&&overlap(q));
   assert.ok(!hit&&Math.abs(v-h)<=.43001,JSON.stringify({id,j,i,e,n,h,v,hit}));
   h=v;
  }
 }
 assert.ok(Math.abs(h-path.at(-1)!.height)<.03,JSON.stringify({id,h,last:path.at(-1)}));
}
test('instrument public road bends around actual masonry and approaches the open entrance',()=>{
 const route=road.outerWorks.industrialRoutes.find(r=>r.id==='instrument-plant')!;
 const access=[[-36,145],[-38,145],[-48,143.5],[-54.5,140.5]].map(([east,north])=>({east,north,height:road.heightAt(east,north)!}));
 walk(route.id,[...access,...route.points]);walk(route.id,[...access,...route.points].reverse());
});
test('smelter public approach avoids the actual freight and fence geometry',()=>{
 const route=road.outerWorks.industrialRoutes.find(r=>r.id==='smelter-plant')!;
 const access=smelterFootway.map(([east,north])=>({east,north,height:road.heightAt(east,north)!}));
 walk(route.id,[...access,...route.points]);walk(route.id,[...access,...route.points].reverse());
});
test('gatehouse bench has a grounded stand point and actual seat',()=>{
 const [seat]=road.outerWorks.gatehouseSeats;
 assert.ok(seat);
 const route=road.outerWorks.industrialRoutes.find(r=>r.id==='gatehouse')!;
 const points=[...route.points,{east:seat.useEast,north:seat.useNorth,height:seat.height}];
 walk(route.id,points);walk(route.id,[...points].reverse());
 assert.ok(boxes.some(b=>supportFootprintOverlaps(seat.east,seat.north,b,.27)&&Math.abs(b.max[1]-(seat.height+.48))<.01));
});
for(const route of road.outerWorks.industrialRoutes)test(route.id+' physical entry, interior route and return',()=>{
 walk(route.id,route.points);walk(route.id,[...route.points].reverse());
});
for(const id of ['transfer-dock','ore-yard-dock'])test(id+' is reachable and returnable through the combined town, freight and industrial collision index',()=>{
 const route=rail.stationWalkRoutes.find(r=>r.id===id)!;
 assert.ok(route);
 walk(id,route.points);walk(id,[...route.points].reverse());
});
for(const route of road.mouthWorks.guardShedRoutes)test(route.id+' actual deck approach and return',()=>{
 walk(route.id,route.points);walk(route.id,[...route.points].reverse());
});
test('guard shed bench and brazier have distinct accessible interaction points',()=>{
 const s=road.mouthWorks.guardShedSeats[0]!;
 const fire=road.mouthWorks.guardShedRoutes.find(r=>r.id==='guard-firewood')!.points.at(-1)!;
 assert.ok(boxes.some(b=>supportFootprintOverlaps(s.east,s.north,b,.27)&&Math.abs(b.max[1]-s.height-.50)<.01));
 assert.equal(road.craterActions.actionAt(fire.east,fire.north,fire.height)?.id,'firewood');
 assert.notEqual(road.craterActions.actionAt(s.useEast,s.useNorth,s.height)?.id,'firewood');
 assert.notEqual(road.craterActions.actionAt(fire.east,fire.north,fire.height+2)?.id,'firewood');
 assert.equal(road.craterActions.firewood(),true);
 assert.equal(road.craterActions.firewood(),false);
});
for(const route of road.outerWorks.landscapeRoutes)test(route.id+' scenic ground walk and return through actual supports',()=>{
 walk(route.id,route.points);walk(route.id,[...route.points].reverse());
});
test('assembly registration notice has a real unobstructed approach and return',()=>{
 const r=road.mouthWorks.assemblyRoutes[0]!;
 walk(r.id,r.points);walk(r.id,[...r.points].reverse());
 const p=r.points.at(-1)!;
 assert.equal(road.craterActions.actionAt(p.east,p.north,p.height)?.label,'阅读入坑告示');
 assert.notEqual(road.craterActions.actionAt(p.east,p.north,p.height+2)?.label,'阅读入坑告示');
});
