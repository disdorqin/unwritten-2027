import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {Mesh} from 'three';
import {createTownD2R30Massif} from '../tools/voxel-tavern/town-blockout/town-d2-r30-massif';
import {createTownD2R30Collision,sampleD2CanonicalCollision} from '../tools/voxel-tavern/town-blockout/town-d2-r30-collision';
import {createTownD2R30ProductionHost} from '../tools/voxel-tavern/town-blockout/town-d2-r30-production-host';
import {createMainSummitBlock,mainSummitLayout} from '../tools/voxel-tavern/town-blockout/main-summit-block';
import {createMainSummitTrail} from '../tools/voxel-tavern/town-blockout/main-summit-trail';
import {packCutGeometry} from '../tools/voxel-tavern/town-blockout/town-a32-cut-wire';
test('transferred canonical ground, trail, normals, and collision use exactly the original samples',()=>{
 const original=createTownD2R30Massif(),collision=createTownD2R30Collision(),survey=createMainSummitBlock(mainSummitLayout,347,100);
 const trail=createMainSummitTrail(survey.heightAt,347);survey.dispose();
 const prepared=structuredClone({arrivalHeight:347,trail:{points:trail.points,metrics:trail.metrics},massif:original.group.children.map(o=>({name:o.name,wire:packCutGeometry((o as Mesh).geometry)})),heights:sampleD2CanonicalCollision(),ms:0});
 const h=createTownD2R30ProductionHost({preparedCanonical:prepared,deferDetails:true});
 try{
  assert.deepEqual(h.trail,trail.points);
  assert.equal(h.tiles.length,original.tiles.length);
  for(let i=0;i<h.tiles.length;i++){
   const a=h.tiles[i]!,b=original.tiles[i]!;
   assert.equal(a.name,b.name);
   for(const k of ['position','color','normal'])assert.deepEqual(a.geometry.getAttribute(k).array,b.geometry.getAttribute(k).array);
   assert.deepEqual(a.geometry.index?.array,b.geometry.index?.array);
  }
  for(let n=0;n<1790;n+=13)for(let e=-1099;e<1099;e+=19){
   assert.equal(h.assembly.collision.surfaceAt(e,n),collision.surfaceAt(e,n));
  }
 }finally{h.dispose();original.dispose();collision.dispose();}
});
