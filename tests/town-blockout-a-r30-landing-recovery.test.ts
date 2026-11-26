import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createAR30LandingRecovery,type DreamFoot,type DreamLandingState} from '../tools/voxel-tavern/town-blockout/town-a-r30-landing-recovery';
const foot={east:-120,north:185,height:-24.22};
const settle=()=>new Promise<void>(resolve=>setImmediate(resolve));
test('return stays black on absent/rejected landing and requires explicit same-trip retry',async()=>{
 let requests:number[]=[],states:DreamLandingState[]=[],committed:DreamFoot[]=[],reply:DreamFoot|undefined;
 const h=createAR30LandingRecovery({async request(id){requests.push(id);return reply;},accept(id,p){if(id!==8)return false;committed.push(p);return true;},show(s){states.push(s);}});
 assert.equal(h.start(8),true);assert.equal(h.start(9),false);assert.equal(h.retry(),false);
 await settle();assert.equal(h.state(),'failed');assert.deepEqual(committed,[]);
 reply={...foot,height:NaN};assert.equal(h.retry(),true);await settle();assert.equal(h.state(),'failed');
 reply=foot;assert.equal(h.retry(),true);await settle();assert.equal(h.state(),'idle');
 assert.deepEqual(requests,[8,8,8]);assert.deepEqual(committed,[foot]);
 assert.deepEqual(states,['waiting','failed','waiting','failed','waiting','complete']);
});
test('disposal and stale response cannot commit or unlock another trip',async()=>{
 let complete:(p:DreamFoot)=>void=()=>{};let accepted=0;const states:DreamLandingState[]=[];
 const h=createAR30LandingRecovery({request:()=>new Promise(resolve=>{complete=resolve}),accept(){accepted++;return true;},show(s){states.push(s);}});
 h.start(1);h.dispose();complete(foot);await settle();
 assert.equal(accepted,0);assert.deepEqual(states,['waiting','idle']);assert.equal(h.retry(),false);
});
