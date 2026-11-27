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
  // Compare real collision queries against the exact authored narrow phase.
  const p0=model.placements[0]!;
  let seed=42;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  const probes=Array.from({length:12000},(_,i)=>{
   const p=model.placements[i%model.placements.length]??p0;
   return [p.east+(random()-.5)*8,p.north+(random()-.5)*8,p.height+(random()-.5)*5,.27+random()*.9] as const;
  });
  const start=performance.now(),expected=probes.map(([e,n,y,r])=>model.placements.some(p=>{
   const core=(p.kind==='pine'||p.kind==='flagpine'?.30:p.kind==='rock'?.92:0)*p.scale;
   return core>0&&y>=p.height-.6&&y<p.height+(p.kind==='rock'?1.4:3.2)*p.scale&&Math.hypot(e-p.east,n-p.north)<core+r;
  })),exhaustiveMs=performance.now()-start,localStart=performance.now();
  const actual=probes.map(([e,n,y,r])=>model.blocked(e,n,y,r)),indexedMs=performance.now()-localStart;
  assert.deepEqual(actual,expected);console.log('forest collision comparison',JSON.stringify({probes:probes.length,exhaustiveMs,indexedMs}));
  assert.equal(planRidgeForest(field,()=>false).length,0);
  const p=model.placements[0]!;model.updateView(p.east,p.north);assert.ok(model.detailCounts().near>0);
  model.updateView(-2000,-2000);assert.equal(model.detailCounts().near,0);
  assert.deepEqual(model.placements,planRidgeForest(field,clear));
 }finally{model.dispose();model.dispose()}
});
