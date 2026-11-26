import test from 'node:test';
import assert from 'node:assert/strict';
import {mountUndergroundDescent} from '../tools/voxel-tavern/town-blockout/underground-descent.js';

function makeDocument(){
 let next=0;
 const frames=new Map<number,()=>void>();
 class Element {
  hidden=false;dataset:Record<string,string>={};style={};textContent='';isConnected=true;
  children:Element[]=[];listeners=new Map<string,()=>void>();
  append(...e:Element[]){this.children.push(...e)}
  setAttribute(){}
  remove(){this.isConnected=false}
  getContext(){return null}
  addEventListener(name:string,cb:()=>void){this.listeners.set(name,cb)}
  removeEventListener(name:string){this.listeners.delete(name)}
  click(){if(!this.hidden)this.listeners.get('click')?.()}
 }
 const doc={createElement:()=>new Element(),defaultView:{
  requestAnimationFrame(cb:()=>void){frames.set(++next,cb);return next},
  cancelAnimationFrame(id:number){frames.delete(id)}
 }};
 const parent=Object.assign(new Element(),{ownerDocument:doc});
 function paint(){const batch=[...frames.values()];frames.clear();batch.forEach(f=>f())}
 return {parent:parent as unknown as HTMLElement,paint};
}
const drain=async()=>{await Promise.resolve();await Promise.resolve()};
test('failed landing exposes an actual retry control and keeps blackout until same-trip receipt',async()=>{
 const {parent,paint}=makeDocument();
 let calls=0,errors=0,locked=false;
 const descent=mountUndergroundDescent({parent,setControlsLocked:v=>{locked=v},cameraMotion:()=>{},reducedMotion:()=>true,
  requestMineLanding:id=>{calls++;return calls===1?undefined:calls===2?{tripId:id+1,destination:'mine',fallDamage:0}:{tripId:id,destination:'mine',fallDamage:0}},
  onHandoffError:()=>{errors++}});
 try{
  assert.ok(descent.start({id:1,first:true,departedAt:0,travelMs:25000},0));assert.ok(locked);
  assert.equal(descent.update(22000)?.blackout,true);paint();paint();
  descent.update(24999);assert.equal(calls,0);
  descent.update(25000);assert.equal(calls,1);await drain();
  assert.equal(errors,1);assert.equal(descent.retryButton.hidden,false);assert.ok(locked);
  descent.update(26000);assert.equal(calls,1,'no uncontrolled repeat dispatch');
  descent.retryButton.click();assert.equal(descent.retryButton.hidden,true);assert.equal(descent.retry(),false);
  descent.update(26001);assert.equal(calls,2);await drain();
  assert.equal(errors,2);assert.equal(descent.retryButton.hidden,false);assert.ok(locked);
  descent.retryButton.click();descent.update(26002);await drain();
  assert.equal(calls,3);assert.equal(descent.status.hidden,true);
  assert.equal(descent.update(26003)?.phase,'waking');assert.ok(locked);
  assert.equal(descent.update(28103)?.phase,'complete');assert.equal(locked,false);
  assert.equal(descent.retryButton.hidden,true);assert.equal(descent.retry(),false);
 }finally{descent.dispose()}
 assert.equal(descent.retryButton.isConnected,false);
});
test('dispose aborts outstanding handoff and releases control without a stale retry',async()=>{
 const {parent,paint}=makeDocument();let signal:AbortSignal|undefined,locked=false;
 let complete!:(r:undefined)=>void;
 const descent=mountUndergroundDescent({parent,setControlsLocked:v=>{locked=v},cameraMotion:()=>{},reducedMotion:()=>true,
  requestMineLanding:(_id,s)=>{signal=s;return new Promise(resolve=>{complete=resolve})}});
 assert.ok(descent.start({id:1,first:false,departedAt:0,travelMs:25000},0));
 descent.update(25000);paint();paint();descent.update(25001);
 assert.ok(signal);assert.ok(locked);descent.dispose();
 assert.equal(signal.aborted,true);assert.equal(locked,false);
 complete(undefined);await drain();assert.equal(descent.retry(),false);assert.equal(descent.retryButton.isConnected,false);
});
