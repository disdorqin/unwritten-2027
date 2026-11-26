import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createAR30CraterPlay,createAR30PlayInput,type CraterAcceptedFrame,type CraterPlayAuthority,type CraterPlayLeaves,type CraterPose,type WorkshopIntent} from '../tools/voxel-tavern/town-blockout/town-a-r30-crater-play';
function harness(){
 let now=1000,kind='calibration',local:CraterPose|undefined={east:-60,north:150,height:10,heading:0,pitch:0,eyeHeight:1.65};
 let accepted:CraterAcceptedFrame|undefined={session:'s1',domain:'west',revision:'r1',receivedAt:now,pose:local,workshop:{dayIndex:1,bellows:{pressure:.3,heldMs:0,inBand:false,cast:false,stroke:0},calibration:{angles:[0,0,0],locked:[false,false,false]},sorting:{bins:{stardust:0,scrap:0,rubble:0}},scale:{kg:0},track:{thrown:false}},rubbing:{progress:0,complete:false},mound:{flagStraight:false,overlookKnown:false}};
 const sent:unknown[]=[],holds:boolean[]=[];let active=true;
 const authority:CraterPlayAuthority={read:()=>accepted,async request(f,intent){sent.push({session:f.session,intent});return {accepted:true};},setHeld(_f,_m,held){holds.push(held);}};
 const intent=(direction:-1|1=1):WorkshopIntent=>kind==='calibration'?{kind:'turn-dial',index:0,direction}:{kind:'pump-bellows'};
 const leaves:CraterPlayLeaves={
 aimWorkshop:()=>kind==='calibration'?{station:'calibration',index:0}:kind==='bellows'?{station:'bellows'}:null,
 aimPaper:()=>kind==='paper',aimFlag:()=>kind==='flag',atSummit:()=>kind==='summit',
 workshop(host){return {action:()=>host.pose()&&host.facts()?intent():undefined,refresh(){},interact(d){return host.request(intent(d));}};},
 mound(host){const action=(k:'reach-overlook'|'straighten-flag')=>host.pose()&&host.facts()?(k==='reach-overlook'?{kind:k,site:'crater-mound-overlook'} as const:{kind:k,site:'mound-old-work-flag'} as const):undefined;return {action,refresh(){},async interact(k){const i=action(k);return i?host.request(i):{accepted:false};}};},
 rubbing(host){let held=false;return {frame(key){const next=!!(key&&host.pose()&&host.facts());if(next!==held){held=next;host.setHeld('actual-marker',held);}return {held,aim:kind==='paper',shown:0};},release(){if(held)host.setHeld('actual-marker',false);held=false;}};}
 };
 const play=createAR30CraterPlay(leaves,{localPose:()=>local,authority:()=>active?authority:undefined,now:()=>now,notify(){}});
 const input=createAR30PlayInput(()=>play);
 return {play,input,sent,holds,setKind:(v:string)=>kind=v,disconnect:()=>active=false,connect:()=>active=true,expire:()=>now+=1001,move:()=>local=undefined,newSession(){accepted={...accepted!,session:'s2'};},sync(){accepted={...accepted!,receivedAt:now};}};
}
test('E and Q target capture, no retarget or unintended repeat',async()=>{
 const h=harness();h.input.update();
 assert.equal(h.input.down('E'),true);h.input.down('E');h.input.up('E');
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.input.down('Q',-1),true);h.input.up('Q');
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(h.sent,[{session:'s1',intent:{kind:'turn-dial',index:0,direction:1}},{session:'s1',intent:{kind:'turn-dial',index:0,direction:-1}}]);
 h.input.down('E');h.setKind('bellows');h.input.update();h.input.up('E');
 assert.equal(h.sent.length,2);assert.equal(h.input.down('Q',-1),false);
});
test('paper hold owns E until release and cancels on aim loss, no rearm while held',()=>{
 const h=harness();h.setKind('paper');h.input.update();assert.equal(h.input.down('E'),true);h.input.update();
 assert.deepEqual(h.holds,[true]);h.setKind('bellows');h.input.update();assert.deepEqual(h.holds,[true,false]);
 h.setKind('paper');h.input.update();h.input.up('E');assert.deepEqual(h.holds,[true,false]);assert.equal(h.sent.length,0);
 h.input.down('touch-4');h.input.cancelSource('touch-4');assert.deepEqual(h.holds,[true,false,true,false]);
});
test('expired accepted frame and disconnect fail closed and release original marker',()=>{
 const h=harness();h.setKind('paper');h.input.update();h.input.down('E');h.expire();h.input.update();
 assert.deepEqual(h.holds,[true,false]);h.input.up('E');assert.equal(h.play.target()?.available,false);
 h.sync();h.input.update();h.input.down('E');h.disconnect();h.input.update();assert.deepEqual(h.holds,[true,false,true,false]);h.input.up('E');
 h.setKind('bellows');assert.equal(h.input.down('E'),true);h.input.up('E');assert.equal(h.sent.length,0);
});
test('session change invalidates discrete press and disables stale facts',()=>{
 const h=harness();h.input.update();h.input.down('E');h.newSession();h.input.up('E');assert.equal(h.sent.length,0);
 h.input.down('E');h.input.up('E');assert.equal(h.sent.length,1);
 h.move();assert.equal(h.play.target(),undefined);assert.equal(h.input.down('E'),false);
});
test('summit registers through one request per entry, never invented flag state',async()=>{
 const h=harness();h.setKind('summit');h.input.update();h.input.update();assert.equal(h.sent.length,1);
 await new Promise(resolve=>setImmediate(resolve));
 h.setKind('flag');h.input.update();h.input.down('E');h.input.up('E');assert.equal(h.sent.length,2);
 assert.deepEqual(h.sent[1],{session:'s1',intent:{kind:'straighten-flag',site:'mound-old-work-flag'}});
});
