import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Group} from 'three';
import {createTerrainGrid} from '../tools/voxel-tavern/town-blockout/terrain';
import {buildFrontRidgeR30Field} from '../tools/voxel-tavern/town-blockout/town-d-r30-front-ridge';
import {mountRidgeCableFacilities} from '../tools/voxel-tavern/town-blockout/town-d-r30-cable-facilities';
import {mountRidgeCloudTerrace,ridgeCloudHandoff,ridgeCloudFootAt} from '../tools/voxel-tavern/town-blockout/town-d-r30-cloud-terrace';
test('canonical terrace anchors, grounded route, real station collision and I3 boundary',()=>{
 const grid=createTerrainGrid(),field=buildFrontRidgeR30Field(grid.groundHeightAt,()=>1),owner=new Group();
 const cable=mountRidgeCableFacilities(owner,field),model=mountRidgeCloudTerrace(owner,field,cable.blocked);
 try{
  assert.ok(model.paving>300);
  for(const p of [ridgeCloudHandoff.terminal,...ridgeCloudHandoff.lookouts,ridgeCloudHandoff.assemblyVisitor,ridgeCloudHandoff.runway.start,ridgeCloudHandoff.runway.end]){
   assert.equal(ridgeCloudFootAt(field,p.east,p.north),347);
   const route=model.survey(ridgeCloudHandoff.terminal,p,1.2);
   assert.ok(route.length>0,JSON.stringify(p));
   for(const [i,q]of route.entries()){
    assert.equal(q.height,field.heightAt(q.east,q.north));assert.equal(model.blocked(q.east,q.north,q.height),false);
    if(i){const a=route[i-1]!;assert.ok(Math.hypot(q.east-a.east,q.north-a.north)<=.251)}
   }
  }
  const gate=ridgeCloudHandoff.gate;
  assert.equal(model.footAt(gate.east,gate.north),undefined);
  assert.ok(model.survey(ridgeCloudHandoff.terminal,{...gate,north:gate.north-1},1.2).length);
  assert.equal(model.footAt(320,600),undefined);
  assert.equal(model.footAt(NaN,640),undefined);
  assert.equal(model.action({east:336,north:640,height:347}),undefined);
  for(const p of ridgeCloudHandoff.lookouts){const path=model.survey(ridgeCloudHandoff.terminal,p,1.2);assert.equal(model.action(path.at(-1)!)?.title,p.title)}
  assert.equal(model.art.inspect('ring','touch',{east:-8,north:-15,height:347},false).accepted,false);
 }finally{model.dispose();cable.dispose()}
});
