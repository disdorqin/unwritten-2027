import {test} from 'node:test';
import assert from 'node:assert/strict';
import {solveRidgeGradeCore} from '../tools/voxel-tavern/town-blockout/town-d-r30-grade-solver';
test('real triangle solver accepts safe axial grade rejected by the sufficient box constraint',()=>{
 const width=128,core=new Map<number,{lo:number;hi:number}>();
 for(let z=1;z<=8;z++)for(let x=1;x<=100;x++){const h=.11*x;core.set(z*width+x,{lo:h,hi:h});}
 const r=solveRidgeGradeCore(core,width);assert.ok(r.ok);assert.equal(r.mode,'triangle');
 for(const [id,p]of core)assert.equal(r.heights.get(id),p.lo);
});
test('triangle solver does not certify a combined gradient above 12%',()=>{
 const width=8,core=new Map([[9,{lo:0,hi:0}],[10,{lo:.10,hi:.10}],[17,{lo:.10,hi:.10}],[18,{lo:.20,hi:.20}]]);
 const r=solveRidgeGradeCore(core,width);assert.equal(r.ok,false);
 core.delete(9);assert.equal(solveRidgeGradeCore(core,width).ok,false,'upper triangle remains constrained even without lower corner');
});
test('bounded fallback solves mixed intervals without violating real face or fixed points',()=>{
 const width=32,core=new Map<number,{lo:number;hi:number}>();
 for(let z=1;z<=4;z++)for(let x=1;x<=20;x++){
  const h=.1*x+.04*z;core.set(z*width+x,x===1||x===20?{lo:h,hi:h}:{lo:h-.02,hi:h+.02});
 }
 const r=solveRidgeGradeCore(core,width,{forceTriangle:true});assert.ok(r.ok);
 for(const [id,p]of core){const h:number=r.heights.get(id)!;assert.ok(h>=p.lo-1e-8&&h<=p.hi+1e-8);const a=r.heights.get(id+1),b=r.heights.get(id+width);if(a!==undefined&&b!==undefined)assert.ok(Math.hypot(a-h,b-h)<=.12);}
});
