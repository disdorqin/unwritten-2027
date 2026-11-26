import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildFrontRidgeR30Field} from '../tools/voxel-tavern/town-blockout/town-d-r30-front-ridge';
import {mountRidgeForest,planRidgeForest,ridgeForestRouteClearance} from '../tools/voxel-tavern/town-blockout/town-d-r30-forest';
test('forest uses actual terrain and excludes the complete protected corridor',()=>{
 const field=buildFrontRidgeR30Field(()=>18,()=>1);
 const clear=ridgeForestRouteClearance([[{east:240,north:280},{east:240,north:790}]]);
 const model=mountRidgeForest(field,clear);
 try{
  assert.ok(model.placements.length>100);
  for(const p of model.placements){
   assert.equal(p.height,field.heightAt(p.east,p.north));assert.ok(clear(p.east,p.north,p.radius));
   if(p.kind==='pine'||p.kind==='flagpine'){assert.ok(p.height<205);assert.ok(model.blocked(p.east,p.north,p.height))}
  }
  assert.equal(planRidgeForest(field,()=>false).length,0);
  const p=model.placements[0]!;model.updateView(p.east,p.north);assert.ok(model.detailCounts().near>0);
  model.updateView(-2000,-2000);assert.equal(model.detailCounts().near,0);
  assert.deepEqual(model.placements,planRidgeForest(field,clear));
 }finally{model.dispose();model.dispose()}
});
