import assert from 'node:assert/strict';
import {test} from 'node:test';
import {surveyProtectedFootApproach} from '../tools/voxel-tavern/town-blockout/town-d-r30-protected-approach';
const bounds={west:0,east:24,south:0,north:20};
test('reuse reads the real support without mutating it and preserves endpoint levels',()=>{
 const r=surveyProtectedFootApproach((e,n)=>e>=0&&e<=24&&n>=0&&n<=20?8+e*.08:undefined,{east:2,north:10},{east:22,north:10},bounds);
 assert.ok(r.route.length>1);assert.equal(r.route[0]!.height,8.16);assert.equal(r.route.at(-1)!.height,9.76);
 for(const p of r.route)assert.equal(p.height,8+p.east*.08);
});
test('frozen route refuses an unapproved crossing and excessive grade',()=>{
 const start={east:2,north:10},end={east:22,north:10};
 assert.equal(surveyProtectedFootApproach((e,n)=>e>=0&&e<=24&&n>=0&&n<=20&&Math.abs(e-12)>1?8:undefined,start,end,bounds).route.length,0);
 assert.equal(surveyProtectedFootApproach(e=>8+e*.17,start,end,{...bounds,south:10,north:10}).route.length,0);
 assert.equal(surveyProtectedFootApproach(()=>NaN,start,end,bounds).route.length,0);
});
