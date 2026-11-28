import {test} from 'node:test';
import assert from 'node:assert/strict';
import {auditNightBCableWalkRoutes} from '../tools/voxel-tavern/town-blockout/town-night-b-cable-walk-route';
const base={start:{east:0,north:0,height:347},bounds:{west:-1,east:5,south:-2,north:2},supportAt:()=>347,blocked:()=>false};
test('continuous route rejects a disconnected floor and steep step even when both endpoints are valid',()=>{
 const goals=[{id:'dock',foot:{east:4,north:0,height:347}}];
 assert.ok(auditNightBCableWalkRoutes({...base,goals}).ready);
 assert.equal(auditNightBCableWalkRoutes({...base,goals,blocked:(e)=>e>1.5&&e<2.5}).ready,false);
 assert.equal(auditNightBCableWalkRoutes({...base,goals,supportAt:e=>e>1.5&&e<2.5?348:347}).ready,false);
});
test('repair target can be solid; only an eligible connected standable foot within actual reach counts',()=>{
 const foot={east:3,north:0,height:347},blocked=(e:number,n:number)=>Math.hypot(e-3,n)<.5;
 const exact=auditNightBCableWalkRoutes({...base,blocked,goals:[{id:'frame',foot}]});
 assert.equal(exact.ready,false);
 const r=auditNightBCableWalkRoutes({...base,blocked,goals:[{id:'frame',foot,reach:2.2,accept:p=>p.east>2&&p.north>.5}]});
 assert.ok(r.ready);const p=r.routes[0]!;assert.ok(p.reachable);assert.ok(p.interactionFoot.east>2);assert.ok(p.interactionFoot.north>.5);assert.ok(Math.hypot(p.interactionFoot.east-3,p.interactionFoot.north)<=2.2);
 assert.equal(auditNightBCableWalkRoutes({...base,blocked,goals:[{id:'frame',foot,reach:2.2,accept:()=>false}]}).ready,false);
});
