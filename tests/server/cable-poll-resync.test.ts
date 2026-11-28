import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createPresenceServer} from '../../src/presence/server';
import {createCableLineAuthority} from '../../src/presence/cable-line-authority';
import {buildPollBody,retryablePollEvents} from '../../tools/voxel-tavern/town-blockout/town-presence-poll';
type Frame={type:string;line?:number;state?:{version:number;impacts:number;carriedWeight:number|null;carriedBySelf?:boolean};wokeAt?:number;openedAt?:number;openedNow?:boolean};
test('lost accepted HTTP repair response is recovered by fresh personalized snapshots without duplicate actions',{timeout:15000},async t=>{
 const authority=createCableLineAuthority(),server=await createPresenceServer({cableLineAuthority:authority,connectionLog(){}});
 t.after(()=>server.close());
 const base='http://127.0.0.1:'+server.address().port+'/presence/poll';
 async function join(name:string){const response=await fetch(base+'/join',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name})});assert.equal(response.status,200);return (await response.json() as {session:string}).session;}
 async function poll(session:string,events:string[]=[],resync=false){const response=await fetch(base,{method:'POST',headers:{'content-type':'application/json','x-presence-session':session},body:buildPollBody(undefined,events,resync)});assert.equal(response.status,200);const {messages}=await response.json() as {messages:{t:string;d:string}[]};return messages.filter(m=>m.t==='text').map(m=>JSON.parse(m.d) as Frame).filter(m=>m.type==='cable-line');}
 const a=await join('测试甲'),b=await join('测试乙');
 const event=(kind:string,extra:object={})=>JSON.stringify({type:'event',kind:'cable-repair',line:1,event:{kind,...extra}});
 await poll(a,[event('wake',{impact:'sled'})]);await poll(b);
 const strike=event('strike-rust');
 // Simulate a response lost after the server has accepted the action and
 // drained the peer outbox. Client deliberately discards this response.
 await poll(a,[strike]);assert.equal(authority.snapshot(1).impacts,1);
 const empty=await poll(a);assert.equal(empty.length,0);
 const retry=retryablePollEvents([strike]);assert.equal(retry.length,0);
 const fresh=await poll(a,[],true);
 assert.deepEqual(fresh.map(f=>f.line),[1,2]);assert.equal(fresh[0]!.state!.version,2);assert.equal(fresh[0]!.state!.impacts,1);assert.equal(fresh[0]!.wokeAt,authority.hello(1).wokeAt);assert.equal(fresh[0]!.openedNow,false);
 assert.equal(authority.snapshot(1).impacts,1);
 const observed=await poll(b);assert.equal(observed.filter(f=>f.line===1).length,1);
 // Personal carrying authority must remain distinct in recovery frames.
 await poll(a,[event('take-weight',{index:0})]);await poll(b);
 const [mine,theirs]=await Promise.all([poll(a,[],true),poll(b,[],true)]);
 assert.equal(mine[0]!.state!.carriedWeight,0);assert.equal(mine[0]!.state!.carriedBySelf,true);assert.equal(theirs[0]!.state!.carriedBySelf,false);
});
