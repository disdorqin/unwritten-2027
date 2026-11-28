import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createNightBPryHold} from '../tools/voxel-tavern/town-blockout/town-night-b-pry-hold';
import {createZa36CableRepair,type Za36CableRepairEvent} from '../src/shared/za36-cable-repair';
test('real reducer hold charges only over active time; early release halves lift',()=>{
 const m=createZa36CableRepair(2);m.apply({kind:'wake',impact:'sled'});
 let t=0,online=true;
 const h=createNightBPryHold({state:()=>online?m.snapshot():undefined,send:(_l,e)=>m.apply(e).accepted,now:()=>t});
 assert.ok(h.begin(2));assert.equal(h.begin(2),false);
 const frames=(n:number)=>{for(let i=0;i<n;i++){t+=100;h.update(true,2);}};
 frames(2);assert.equal(m.snapshot().cableHeight,0);
 frames(4);assert.equal(m.snapshot().cableHeight,.25);
 h.update(false,2);assert.equal(m.snapshot().cableHeight,.125);assert.equal(h.active(),false);
 assert.ok(h.begin(2));frames(30);assert.equal(m.snapshot().cableAligned,true);
 h.update(false,2);assert.equal(m.snapshot().cableHeight,1);
});
test('unacknowledged events never replay, and wrong domain cancels hold',()=>{
 const m=createZa36CableRepair(1);m.apply({kind:'wake',impact:'sled'});let t=0;
 const sent:Za36CableRepairEvent[]=[];
 const h=createNightBPryHold({state:()=>m.snapshot(),send:(_l,e)=>{sent.push(e);return true;},now:()=>t});
 assert.ok(h.begin(1));
 for(let i=0;i<30;i++){t+=100;h.update(true,1);}
 assert.equal(sent.length,1);assert.equal(h.active(),false);
 assert.ok(h.begin(1));h.update(true,2);assert.equal(h.active(),false);
});
