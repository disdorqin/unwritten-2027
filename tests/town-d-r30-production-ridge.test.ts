import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Group} from 'three';
import {createTerrainGrid,worldBounds} from '../tools/voxel-tavern/town-blockout/terrain';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import {createTownRailway} from '../tools/voxel-tavern/town-blockout/town-railway';
import {buildCraterRailExtension} from '../tools/voxel-tavern/town-blockout/town-crater-rail-extension';
import {mountProductionRidge} from '../tools/voxel-tavern/town-blockout/town-d-r30-production-ridge';
import {addTerrainMeshes} from '../tools/voxel-tavern/town-blockout/terrain-mesh';
test('production ridge consumes real railway mask and replaces only owned terrain cells',()=>{
 const grid=createTerrainGrid(),before=grid.elevation.slice(),root=new Group();
 const west=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n));
 const rail=createTownRailway(grid,()=>0),branch=buildCraterRailExtension(grid,west,rail.route.points);
 const ridge=mountProductionRidge(root,grid,{loop:rail.route.points,branch:branch.samples});
 assert.ok(ridge.changedVertices>100000);assert.equal(ridge.roads.length,2);assert.equal(ridge.stationReady,true);
 assert.equal(ridge.transportReady,false);
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
