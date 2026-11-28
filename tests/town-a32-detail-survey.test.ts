import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Mesh} from 'three';
import {createMainSummitBlock,mainSummitLayout} from '../tools/voxel-tavern/town-blockout/main-summit-block';
import {createMainSummitTrail} from '../tools/voxel-tavern/town-blockout/main-summit-trail';
import {createTownD2R30Strata} from '../tools/voxel-tavern/town-blockout/town-d2-r30-strata';
import {surveyTownD2R30SledGates,createTownD2R30SledGateSupport} from '../tools/voxel-tavern/town-blockout/town-d2-r30-sled-gate-support';
test('canonical reused survey preserves every strata vertex and sled gate',()=>{
 const block=createMainSummitBlock(mainSummitLayout,347,100);
 try{
  const points=createMainSummitTrail(block.heightAt,347).points;
  assert.deepEqual(surveyTownD2R30SledGates(347,points),surveyTownD2R30SledGates(347));
  for(const [old,next] of [[createTownD2R30Strata(),createTownD2R30Strata({trailPoints:points})],[createTownD2R30SledGateSupport(),createTownD2R30SledGateSupport({trailPoints:points})]] as const){
   try{
    assert.deepEqual(next.stats(),old.stats());
    const snapshot=(root:typeof old.group)=>{const result:unknown[]=[];root.traverse(o=>{const m=o as Mesh;if(!m.isMesh)return;result.push({name:m.name,position:m.geometry.getAttribute('position').array,color:m.geometry.getAttribute('color')?.array,index:m.geometry.index?.array});});return result;};
    assert.deepEqual(snapshot(next.group),snapshot(old.group));
   }finally{old.dispose();next.dispose();}
  }
 }finally{block.dispose();}
});
