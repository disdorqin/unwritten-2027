import assert from 'node:assert/strict';
import {test} from 'node:test';
import {a31GateCrossing,a31GateEligible,a31GateFoot} from '../tools/voxel-tavern/town-blockout/town-a31-gate-handoff';
const before={east:300,north:667.9,height:347},after={east:300,north:668.1,height:347};
const flat=()=>347;
test('gate transfer detects either walking direction, excludes the low northern ridge',()=>{
 assert.equal(a31GateCrossing(false,before,after),true);
 assert.equal(a31GateCrossing(true,after,before),true);
 assert.equal(a31GateCrossing(false,after,before),false);
 assert.equal(a31GateCrossing(false,{...before,height:90},{...after,height:90}),false);
 assert.equal(a31GateFoot({...after,east:301.8}),false);
});
test('gate requires actual common endpoints and midpoint before the bounded physical step',()=>{
 assert.equal(a31GateEligible(false,before,after,flat,flat),false);
 assert.equal(a31GateEligible(true,before,after,flat,flat),true);
 assert.equal(a31GateEligible(true,after,before,flat,flat),true);
 assert.equal(a31GateEligible(true,before,after,(_e,n)=>Math.abs(n-668)<.02?undefined:347,flat),false);
 assert.equal(a31GateEligible(true,before,after,flat,()=>347.1),false);
 assert.equal(a31GateEligible(true,before,{...after,north:669},flat,flat),false);
 assert.equal(a31GateEligible(true,before,{...after,east:301.8},flat,flat),false);
});
