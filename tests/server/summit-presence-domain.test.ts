import assert from 'node:assert/strict';
import {once} from 'node:events';
import {test,type TestContext} from 'node:test';
import {WebSocket} from 'ws';
import {createPresenceServer} from '../../src/presence/server';
import {createCableLineAuthority} from '../../src/presence/cable-line-authority';
import {summitPresenceBounds,summitPresenceFrame,summitReleaseApproaches,toSummitPresencePose,fromSummitPresencePose,isSummitCableReleaseRecord} from '../../src/shared/za22-summit-presence-domain';
import {writePresencePose,visitPresenceSnapshot} from '../../tools/voxel-tavern/town-blockout/town-presence-motion';
import {authorizeOutdoorCableRepair,authorizeRearCableRepair,r30WorkshopRepairAnchors} from '../../src/shared/za22-summit-repair-position';
import {createMainSummitCable} from '../../tools/voxel-tavern/town-blockout/main-summit-cable';
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
type Point={east:number;north:number;height:number};
type Frame={type:string;self?:boolean;id?:number;presenceFrame?:string;line?:number;stage?:string;wokeAt?:number;openedAt?:number;sentAt?:number};
function encode(p:Point,seq:number){
 const wire=toSummitPresencePose({...p,yaw:0});assert.ok(wire);const v=new DataView(new ArrayBuffer(12));writePresencePose(wire,seq,v);return v.buffer;
}
test('full rear domain preserves west coordinates, 800m summit and both true release anchors',()=>{
 const c=createMainSummitCable(0,10000,347);
 for(const [i,r] of c.ropes.entries()){const p=r.dock('summit').approach;assert.deepEqual({east:p.east+300,north:p.north+676,height:p.height},summitReleaseApproaches[i]);}
 for(const p of [{east:-800,north:2466,height:130},{east:1400,north:666,height:347},{east:326.772724,north:1669.454551,height:800}]){
  const v=new DataView(encode(p,1)),decoded=fromSummitPresencePose({east:v.getUint16(2,true)/100,north:v.getUint16(4,true)/100,height:v.getUint16(6,true)/100})!;
  assert.ok(Math.abs(decoded.east-p.east)<=.020001&&Math.abs(decoded.north-p.north)<=.020001&&Math.abs(decoded.height-p.height)<=.010001);
 }
 assert.equal(toSummitPresencePose({east:1400.1,north:660,height:350}),undefined);
 assert.equal(toSummitPresencePose({east:0,north:660,height:851}),undefined);
});
async function connect(t:TestContext,server:Awaited<ReturnType<typeof createPresenceServer>>,name:string,frame?:string){
 const socket=new WebSocket('ws://127.0.0.1:'+server.address().port+'/presence'),frames:Frame[]=[],snapshots:Map<number,Point>[]=[];
 socket.on('message',(raw,binary)=>{if(binary){const b=Buffer.from(raw as Buffer),s=new Map<number,Point>();visitPresenceSnapshot(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength) as ArrayBuffer,(id,east,north,height)=>{const p=fromSummitPresencePose({east,north,height});if(p)s.set(id,p)});snapshots.push(s)}else frames.push(JSON.parse(raw.toString()))});
 t.after(()=>socket.terminate());await once(socket,'open');socket.send(JSON.stringify({type:'join',name,presenceFrame:frame}));
 async function until<T>(fn:()=>T|undefined){for(let i=0;i<100;i++){const p=fn();if(p!==undefined)return p;await sleep(25)}throw Error('summit room timeout')}
 const join=await until(()=>frames.find(f=>f.type==='join'&&f.self));
 return {socket,frames,snapshots,join,until,pose:(p:Point,seq:number)=>socket.send(encode(p,seq)),event:(kind:string,extra:object={})=>socket.send(JSON.stringify({type:'event',kind,...extra}))};
}
test('real summit room wire preserves interest distances and authorizes release only at accepted summit dock',{timeout:15000},async t=>{
 const authority=createCableLineAuthority(),summit=await createPresenceServer({...summitPresenceBounds,summitRoom:true,cableLineAuthority:authority,requireSummitCableRelease:true,authorizeSummitCableRelease:isSummitCableReleaseRecord,authorizeCableRepair:authorizeRearCableRepair,connectionLog(){}});
 t.after(()=>summit.close());
 const town=await createPresenceServer({cableLineAuthority:authority,requireSummitCableRelease:true,authorizeCableRepair:authorizeOutdoorCableRepair,connectionLog(){}});t.after(()=>town.close());
 const a=await connect(t,summit,'西峰甲',summitPresenceFrame),b=await connect(t,summit,'西峰乙',summitPresenceFrame),c=await connect(t,town,'镇上丙');
 const joinUrl='http://127.0.0.1:'+summit.address().port+'/presence/poll/join';
 const post=(url:string,body:unknown,session?:string)=>fetch(url,{method:'POST',headers:{'content-type':'application/json',...(session?{'x-presence-session':session}:{})},body:JSON.stringify(body)});
 assert.equal((await post(joinUrl,{name:'旧客户端'})).status,400);
 const poll=await post(joinUrl,{name:'轮询丁',presenceFrame:summitPresenceFrame});assert.equal(poll.status,200);
 const pollJoin=await poll.json() as {session:string;id:number;messages:{t:string;d:string}[]};
 assert.ok(pollJoin.messages.some(m=>m.t==='text'&&JSON.parse(m.d).presenceFrame===summitPresenceFrame));
 const pollURL=joinUrl.replace('/join','');
 assert.equal((await post(pollURL,{state:Buffer.from(encode({east:-480,north:1400,height:560},1)).toString('base64')},pollJoin.session)).status,200);
 await post(pollURL+'/leave',{},pollJoin.session);
 assert.equal(a.join.presenceFrame,summitPresenceFrame);assert.equal(c.join.presenceFrame,undefined);
 const near={east:-500,north:1400,height:560};
 a.pose(near,1);b.pose({...near,east:near.east+60},1);
 const visible=await a.until(()=>a.snapshots.find(s=>s.has(b.join.id!)));assert.equal(visible.get(b.join.id!)!.east,near.east+60);
 await sleep(150);b.pose({...near,east:near.east+100},2);await a.until(()=>a.snapshots.at(-1)?.size===0?true:undefined);
 // No incorrect scaled 320m interest radius, nor clamp to valid world boundaries.
 await sleep(120);b.socket.send(Buffer.from(new Uint16Array([999,65535,400,400,0,3]).buffer));await sleep(150);assert.equal(a.snapshots.at(-1)?.size,0);
 a.event('cable-release-summit');c.event('cable-release-summit');a.event('cable-repair',{line:2,event:{kind:'wake',impact:'sled'}});await sleep(100);assert.equal(authority.snapshot(2).stage,'dormant');
 a.pose(summitReleaseApproaches[0]!,2);a.event('cable-release-summit');
 const accepted=await a.until(()=>a.frames.find(f=>f.type==='cable-line'&&f.line===2&&f.stage==='one-station'));
 const other=await c.until(()=>c.frames.find(f=>f.type==='cable-line'&&f.line===2&&f.stage==='one-station'));assert.equal(accepted.wokeAt,other.wokeAt);
 a.socket.send(JSON.stringify({type:'clock',sentAt:123}));await a.until(()=>a.frames.find(f=>f.type==='clock'&&f.sentAt===123));
 a.socket.terminate();const rejoin=await connect(t,summit,'西峰甲',summitPresenceFrame);const hello=await rejoin.until(()=>rejoin.frames.find(f=>f.type==='cable-line'&&f.line===2));
 assert.equal(hello.wokeAt,accepted.wokeAt);assert.equal(hello.stage,'one-station');
 const strike={line:2,event:{kind:'strike-rust'}};
 c.event('cable-repair',strike);rejoin.event('cable-repair',strike);b.event('cable-repair',strike);
 await sleep(150);assert.equal(authority.snapshot(2).impacts,0);
 const brake=r30WorkshopRepairAnchors.brake,atBrake={east:brake.east+300,north:brake.north+676,height:347};
 rejoin.pose({...atBrake,height:800},1);rejoin.event('cable-repair',strike);await sleep(150);assert.equal(authority.snapshot(2).impacts,0);
 rejoin.pose(atBrake,2);rejoin.event('cable-repair',strike);
 await rejoin.until(()=>authority.snapshot(2).impacts===1?true:undefined);
 assert.equal(authority.snapshot(2).impacts,1);
});
