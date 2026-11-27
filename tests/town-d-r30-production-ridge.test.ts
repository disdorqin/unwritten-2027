import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Group} from 'three';
import {createTerrainGrid,worldBounds} from '../tools/voxel-tavern/town-blockout/terrain';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import {createTownRailway} from '../tools/voxel-tavern/town-blockout/town-railway';
import {buildCraterRailExtension} from '../tools/voxel-tavern/town-blockout/town-crater-rail-extension';
import {mountProductionRidge} from '../tools/voxel-tavern/town-blockout/town-d-r30-production-ridge';
import {addTerrainMeshes} from '../tools/voxel-tavern/town-blockout/terrain-mesh';
import {buildRailwayStation} from '../tools/voxel-tavern/town-blockout/landmark-station';
import {auditRidgeCableSweep} from '../tools/voxel-tavern/town-blockout/town-d-r30-cable-facilities';
test('production ridge consumes real railway mask and replaces only owned terrain cells',()=>{
 const grid=createTerrainGrid(),before=grid.elevation.slice(),root=new Group();
 const west=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n));
 const rail=createTownRailway(grid,()=>0),branch=buildCraterRailExtension(grid,west,rail.route.points);
 const ridge=mountProductionRidge(root,grid,{loop:rail.route.points,branch:branch.samples});
 assert.ok(ridge.changedVertices>100000);assert.equal(ridge.roads.length,3);assert.equal(ridge.stationReady,true);
 assert.equal(ridge.transportReady,false);
 assert.ok(ridge.facilities);const facilities=ridge.facilities!;
 const hall=buildRailwayStation(),boxes=[...(hall.userData.colliders??[]),...(hall.userData.floors??[])].map(q=>({min:[q.min[0]+526,q.min[1]+26,q.min[2]-329],max:[q.max[0]+526,q.max[1]+26,q.max[2]-329]}));
 const all=[...boxes,...rail.group.userData.colliders,...rail.group.userData.floors,...branch.group.userData.colliders,...branch.group.userData.floors];
 const sweep=auditRidgeCableSweep(ridge.field,facilities.survey,(q,w,d,t)=>all.some(x=>q.east+w>x.min[0]&&q.east-w<x.max[0]&&-q.north+d>x.min[2]&&-q.north-d<x.max[2]&&q.height+t>x.min[1]&&q.height<x.max[1]));
 assert.equal(sweep.groundHits,0);assert.equal(sweep.obstacleHits,0);assert.ok(sweep.candidateEnvelopeClear);
 assert.deepEqual(facilities.update(0),facilities.update(100000));
 assert.equal(facilities.group.userData.floors.length,1);
 facilities.updateView(526,354);const near=facilities.visibleInstances();facilities.updateView(0,0);const far=facilities.visibleInstances();assert.ok(near>far&&far>0);
 for(let n=346;n<=351;n+=.25)assert.equal(ridge.blocked(526,n,26),false);
 assert.equal(ridge.blocked(526,356.9,26),true);
 assert.ok(ridge.roads.some(r=>(r.route.at(-1)?.cum??0)>219));
 assert.ok(ridge.roads.some(r=>(r.route.at(-1)?.cum??0)>69&&(r.route.at(-1)?.cum??0)<70));assert.equal(ridge.serviceExit,true);
 for(let e=522;e<=526;e+=.25)assert.equal(ridge.blocked(e,355,26),false);
 let steep=0,roadSteps=0;
 for(let n=400;n<700;n+=3)for(let e=270;e<570;e+=3){
  const h=grid.groundHeightAt(e,n),h1=grid.groundHeightAt(e+.2,n);
  if(ridge.ownsCell(e,n)&&h1-h>.2){assert.equal(ridge.allowsUphill({east:e,north:n,height:h},{east:e+.2,north:n,height:h1}),false);steep++;}
 }
 for(const road of ridge.roads)for(let i=1;i<road.route.length;i++){
  const a=road.route[i-1]!,b=road.route[i]!;
  assert.equal(ridge.allowsUphill({...a,height:grid.heightAt(a.east,a.north)},{...b,height:grid.heightAt(b.east,b.north)}),true);roadSteps++;
 }
 assert.ok(steep>100&&roadSteps>100);
 let frozen=0,owned=0;
 for(let n=270;n<=800;n++)for(let e=0;e<=640;e++){
  const id=n*grid.gridWidth+e;
  if(ridge.ownership.distance(e,n)===0){assert.equal(grid.elevation[id],before[id]);frozen++;}
  assert.equal(grid.elevation[id],ridge.field.vertexAt(e,n));
  if(ridge.ownsCell(e,n))owned++;
 }
 assert.ok(frozen>10000&&owned>100000);
 for(let n=270.25;n<800;n+=7.5)for(let e=.25;e<640;e+=7.5)
  assert.ok(Math.abs(grid.groundHeightAt(e,n)-ridge.field.heightAt(e,n)!)<1e-6);
 let ridgeTriangles=0;
 ridge.model.group.traverse(o=>{const m=o as import('three').Mesh;if(m.isMesh)ridgeTriangles+=(m.geometry.index?.count??0)/3});
 assert.equal(ridgeTriangles,owned*2);
 const prepare=addTerrainMeshes(root,grid,ridge.ownsCell);
 // Test a real near town chunk that straddles the ridge footprint.
 prepare(320,300,false,false);
 const base=root.getObjectByName('Walkable terrain')!;
 base.traverse(o=>{const mesh=o as import('three').Mesh;if(!mesh.isMesh)return;const p=mesh.geometry.getAttribute('position');
  for(let i=0;i<p.count;i+=3){const e=Math.floor((p.getX(i)+p.getX(i+1)+p.getX(i+2))/3),n=Math.floor(-(p.getZ(i)+p.getZ(i+1)+p.getZ(i+2))/3);assert.equal(ridge.ownsCell(e,n),false);}
 });
 console.log(JSON.stringify({frozen,owned,changed:ridge.changedVertices,roads:ridge.roads.map(r=>r.route.at(-1)?.cum)}));
});
