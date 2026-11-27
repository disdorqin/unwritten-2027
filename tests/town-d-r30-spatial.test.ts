import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRidgeRoadProximity,createRidgeSpatialIndex} from '../tools/voxel-tavern/town-blockout/town-d-r30-spatial';
import {ridgeRoadProject} from '../tools/voxel-tavern/town-blockout/town-d-r30-roadbed';
test('local ridge broad phase matches exhaustive road projection including exact boundary',()=>{
 const route=Array.from({length:301},(_,i)=>({east:i*2-200,north:Math.sin(i*.12)*12,height:10,cum:i*2}));
 const near=createRidgeRoadProximity(route);
 let seed=42;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 const points=Array.from({length:15000},()=>[random()*720-260,random()*80-40,random()*9]);
 const start=performance.now(),expected=points.map(([e,n,r])=>(ridgeRoadProject(route,e!,n!)?.distance??Infinity)<=r!);
 const exhaustiveMs=performance.now()-start,localStart=performance.now();
 const found=points.map(([e,n,r])=>near(e!,n!,r!));
 const indexedMs=performance.now()-localStart;assert.deepEqual(found,expected);
 const straight=createRidgeRoadProximity([{east:0,north:0},{east:16,north:0}]);
 assert.equal(straight(8,2,2),true);assert.equal(straight(8,2,2,false),false);
 console.log('ridge projection comparison',JSON.stringify({probes:points.length,exhaustiveMs,indexedMs}));
});
test('static index handles negative positions, boundary-spanning objects and arbitrary player radius',()=>{
 const items=[{west:-9,east:-7,south:-1,north:1},{west:7,east:9,south:7,north:9},{west:20,east:31,south:2,north:7}];
 const index=createRidgeSpatialIndex(items,x=>x);
 for(let e=-15;e<35;e+=.5)for(let n=-6;n<13;n+=.5)for(const r of [0,.27,1.2,9]){
  const hit=(b:typeof items[number])=>Math.hypot(Math.max(0,b.west-e,e-b.east),Math.max(0,b.south-n,n-b.north))<=r;
  assert.equal(index.some(e,n,r,hit),items.some(hit));
 }
});
