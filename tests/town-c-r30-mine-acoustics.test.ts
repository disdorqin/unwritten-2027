import test from 'node:test';
import assert from 'node:assert/strict';
import {Group} from 'three';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road.js';
import {mountUndergroundDomainHost} from '../tools/voxel-tavern/town-blockout/underground-domain-host.js';
import {createR30MineAcoustics,type R30MineAudioBridge} from '../tools/voxel-tavern/town-blockout/town-c-r30-mine-acoustics.js';
function audioFixture(){
 const context={state:'suspended',sampleRate:16000,currentTime:0};
 const samples:Float32Array[]=[],voices:ReturnType<typeof voice>[]=[],panners:ReturnType<typeof panner>[]=[],gains:ReturnType<typeof gain>[]=[];
 function node(){return{disconnected:false,connect<T>(target:T){return target},disconnect(){this.disconnected=true}}}
 function voice(){return{...node(),loop:false,buffer:undefined as unknown,onended:null as (()=>void)|null,starts:0,stops:0,start(){this.starts++},stop(){this.stops++}}}
 function panner(){return{...node(),positionX:{value:0},positionY:{value:0},positionZ:{value:0},maxDistance:0}}
 function gain(){return{...node(),gain:{value:0,setTargetAtTime(level:number){this.value=level}}}}
 const output={context};
 Object.assign(context,{createBufferSource(){const v=voice();voices.push(v);return v},createPanner(){const p=panner();panners.push(p);return p},
  createGain(){const g=gain();gains.push(g);return g},createBuffer(_channels:number,n:number){const data=new Float32Array(n);samples.push(data);return{getChannelData:()=>data}}});
 return {context:context as unknown as BaseAudioContext,raw:context,output:output as unknown as AudioNode,samples,voices,panners,gains};
}
test('the mounted mine uses real acoustic sites, existing audio bus and accepted cue edges only',()=>{
 const a=audioFixture(),parent=new Group();
 type Foot={east:number;north:number;height:number;domainId:string};
 let foot:Foot|undefined,cues:NonNullable<ReturnType<NonNullable<R30MineAudioBridge['readCues']>>>=[],reach=true;
 const bridge:R30MineAudioBridge={getContext:()=>a.context,output:()=>a.output,readCues:()=>cues,reaches:()=>reach};
 const h=mountUndergroundDomainHost({parent,road:mountWestCraterRoad(260,()=>10.7773),readAcceptedDomainFoot:()=>foot,audioBridge:bridge});
 assert.equal(h.kind,'ready');if(h.kind!=='ready'||!h.acoustics)assert.fail();
 try{
  assert.equal(h.soundSites.length,5);
  const set=(x:number,z:number)=>{const p=h.mounted.toWorld([x,-91,z])!,q=h.passageAt(p.east,p.north,'crouching');assert.ok(q);foot={...p,height:q.floor,domainId:'underground/mine'}};
  set(0,8);h.mounted.sync();assert.equal(a.voices.length,0);
  a.raw.state='running';
  const edge=(sequence:number,kind:'walk'|'mining'='mining')=>({actorId:'p1',sequence,kind,domainId:'underground/mine',point:{...foot!}});
  cues=[edge(1)];h.mounted.sync();assert.deepEqual(h.acoustics.stats().ambient,['pool-drip']);assert.equal(h.acoustics.stats().echoes,0);
  cues=[edge(2),edge(3,'walk')];h.mounted.sync();assert.equal(h.acoustics.stats().echoes,2);
  h.mounted.sync();assert.equal(a.voices.length,3);a.voices[1].onended?.();assert.equal(h.acoustics.stats().echoes,1);
  reach=false;cues=[edge(4)];h.mounted.sync();assert.equal(h.acoustics.stats().ambient.length,0);assert.equal(h.acoustics.stats().echoes,1);
  reach=true;set(5.8,125);h.mounted.sync();assert.ok(h.acoustics.stats().ambient.includes('gate-rumble'));assert.ok(h.acoustics.stats().ambient.length<=3);
  const s=h.soundSites.find(s=>s.id==='bank-drip-1')!,p=a.panners.find(p=>p.positionX.value===s.point.east)!;
  assert.equal(p.positionZ.value,-s.point.north);
  assert.ok(a.samples.every(b=>b.every(v=>Number.isFinite(v)&&Math.abs(v)<=.181)&&b.some(v=>Math.abs(v)>.005)));
  foot={...foot!,domainId:'west'};h.mounted.sync();assert.deepEqual(h.acoustics.stats(),{ambient:[],echoes:0});assert.ok(a.voices.every(v=>v.disconnected));
 }finally{h.mounted.dispose()}
 assert.equal(parent.children.length,0);assert.equal(a.raw.state,'running');
});
test('seated camp mix changes only gains on the same shared audio nodes',()=>{
 const a=audioFixture();a.raw.state='running';let seated=false;
 const f={east:1,north:2,height:-91,domainId:'underground/mine'};
 const sound=createR30MineAcoustics([{id:'fire',kind:'hearth',point:f,radius:8},{id:'room',kind:'drip',point:f,radius:8}],
  {getContext:()=>a.context,output:()=>a.output},()=>f,()=>seated);
 sound.sync();assert.deepEqual(a.gains.map(g=>g.gain.value),[.2,1]);
 seated=true;sound.sync();assert.deepEqual(a.gains.map(g=>g.gain.value),[.38,.63]);assert.equal(a.voices.length,2);
 sound.dispose();assert.ok(a.voices.every(v=>v.disconnected));
});
