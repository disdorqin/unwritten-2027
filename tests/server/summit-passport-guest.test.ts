import assert from 'node:assert/strict';
import {once} from 'node:events';
import {test} from 'node:test';
import {WebSocket} from 'ws';
import {createPresenceServer} from '../../src/presence/server';
import {createSummitPassportGuestAuthority,summitGuestPassportPosition} from '../../src/presence/summit-passport-guest';
import type {SummitPassportStage} from '../../src/presence/summit-passport-authority';
import {mountainPresenceBounds} from '../../src/shared/za22-mountain-domain';
import {summitPresenceBounds,toSummitPresencePose,summitPresenceFrame} from '../../src/shared/za22-summit-presence-domain';
import {readSummitPassportReply,type SummitPassportAction} from '../../src/shared/summit-passport';
type Point={east:number;north:number;height:number};
type Frame={type:string;self?:boolean;passportCredential?:string;summitPassport?:boolean;kind?:string;action?:string};
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
function wire(p:Point,seq:number){const b=Buffer.alloc(12);[0,Math.round(p.east*100),Math.round(p.north*100),Math.round(p.height*100),0,seq].forEach((v,i)=>b.writeUInt16LE(v,i*2));return b;}
const event=(action:SummitPassportAction)=>JSON.stringify({type:'event',kind:'summit-passport',action,profileKey:'forged',progress:{snowWingEligible:true}});
test('signed guest passport uses one durable transaction across actual front WS and rear polling; tampered token cannot inherit progress',{timeout:15000},async t=>{
 const stages=new Map<string,SummitPassportStage>(),secret=Buffer.alloc(32,31);
 const store={async load(key:string){return stages.get(key);},async save(key:string,s:SummitPassportStage){stages.set(key,s);}};
 const authority=createSummitPassportGuestAuthority(secret,store);
 const front=await createPresenceServer({...mountainPresenceBounds,summitPassportGuest:{authority,room:'mountain'},connectionLog(){}});
 const rear=await createPresenceServer({...summitPresenceBounds,summitRoom:true,summitPassportGuest:{authority,room:'summit'},connectionLog(){}});
 t.after(()=>Promise.all([front.close(),rear.close()]));
 const ws=new WebSocket('ws://127.0.0.1:'+front.address().port+'/presence'),frames:Frame[]=[];
 ws.on('message',(raw,binary)=>{if(!binary)frames.push(JSON.parse(raw.toString()));});
 t.after(()=>ws.terminate());await once(ws,'open');ws.send(JSON.stringify({type:'join',name:'游客甲'}));
 async function until<T>(fn:()=>T|undefined){for(let i=0;i<100;i++){const v=fn();if(v!==undefined)return v;await sleep(20);}throw Error('passport response timeout');}
 const hello=await until(()=>frames.find(f=>f.type==='join'&&f.self));assert.ok(hello.summitPassport&&hello.passportCredential);
 ws.send(wire({east:306,north:119,height:347},1));ws.send(event('cloud-stamp'));
 const stamp=await until(()=>frames.map(readSummitPassportReply).find(f=>f?.action==='cloud-stamp'));assert.equal(stamp.result,'ok');assert.equal(stamp.progress.cloudStamped,true);
 assert.equal(stages.size,1);
 const base='http://127.0.0.1:'+rear.address().port+'/presence/poll';
 async function post(path:string,body:unknown,session?:string){const res=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json',...(session?{'x-presence-session':session}:{})},body:JSON.stringify(body)});assert.equal(res.status,200);return res.json() as Promise<{session?:string;messages:{t:string;d:string}[]}>;}
 async function connect(credential?:string){const j=await post('/join',{name:'游客甲',presenceFrame:summitPresenceFrame,passportCredential:credential});const self=j.messages.filter(f=>f.t==='text').map(f=>JSON.parse(f.d) as Frame).find(f=>f.self);assert.ok(self?.passportCredential);let seq=0;
  return {self,async request(action:SummitPassportAction,p?:Point){if(p)await sleep(120);const state=p?wire(toSummitPresencePose(p)!,++seq).toString('base64'):undefined;const f=await post('',{state,events:[{t:'text',d:event(action)}]},j.session);return f.messages.filter(m=>m.t==='text').map(m=>readSummitPassportReply(JSON.parse(m.d))).find(Boolean)!;}};
 }
 const a=await connect(hello.passportCredential),b=await connect(hello.passportCredential!.slice(0,-1)+(hello.passportCredential!.endsWith('0')?'1':'0'));
 assert.equal(a.self.passportCredential,hello.passportCredential);
 assert.notEqual(b.self.passportCredential,a.self.passportCredential);
 assert.equal((await b.request('status')).progress.cloudStamped,false);
 assert.equal((await a.request('status')).progress.cloudStamped,true);
 assert.equal((await a.request('register-summit',{east:362.5,north:1690,height:800})).result,'previous-stamp');
 assert.equal((await a.request('summit-stamp',{east:350,north:1674,height:799})).result,'position');
 assert.equal((await a.request('summit-stamp',{east:350,north:1674,height:800})).progress.summitStamped,true);
 assert.equal((await a.request('register-summit',{east:362.5,north:1690,height:800})).progress.snowWingEligible,true);
 const c=await connect(hello.passportCredential);assert.equal((await c.request('status')).progress.summitRegistered,true);
 const restarted=createSummitPassportGuestAuthority(secret,store),binding=restarted.bind(hello.passportCredential);
 assert.equal((await restarted.request(binding.profileKey,undefined,'status')).progress.snowWingEligible,true);
 assert.equal(frames.filter(f=>f.type==='join'&&!f.self).some(f=>f.passportCredential),false);
});
test('guest passport accepts only a recent stationary record in the actual frame',()=>{
 const record={east:30600,north:11900,height:34700};
 assert.deepEqual(summitGuestPassportPosition('mountain',record,1500,0),{area:'cloud-deck',east:306,north:659,height:347});
 assert.equal(summitGuestPassportPosition('mountain',record,1501,0),undefined);
 assert.equal(summitGuestPassportPosition('mountain',record,0,5),undefined);
 assert.equal(summitGuestPassportPosition('mountain',undefined,0,0),undefined);
});
