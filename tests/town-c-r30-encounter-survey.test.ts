import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Vector3,Raycaster} from 'three';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road.js';
import {mountUndergroundDomainHost} from '../tools/voxel-tavern/town-blockout/underground-domain-host.js';
import {createMineBestiaryEncounter,mineBestiary} from '../src/shared/mine-bestiary.js';
type Actor=ReturnType<ReturnType<typeof createMineBestiaryEncounter>['snapshot']>[number];
test('sixteen actual groups and 28 renderable actors use existing bestiary authority, not local combat',()=>{
 const parent=new Group(),road=mountWestCraterRoad(260,()=>10.7773);
 let actors:Actor[]=[],approved=false;
 const h=mountUndergroundDomainHost({parent,road,encounterBridge:{acceptGroup:g=>approved?'fixture-room/'+g.id:undefined,readActors:()=>actors}});
 assert.equal(h.kind,'ready');if(h.kind!=='ready'||!h.encounterSurvey||!h.encounterArt||h.oreSurvey.kind!=='ready')assert.fail();
 try{
  const s=h.encounterSurvey,art=h.encounterArt;assert.equal(s.ready,true);assert.deepEqual(s.failures,[]);assert.equal(s.groups.length,16);assert.equal(art.models.size,28);assert.ok(art.parts>1200);
  assert.equal(s.buildSpawns(()=>undefined),undefined);assert.equal(s.buildSpawns(()=>'one-room'),undefined);
  const spawns=s.buildSpawns(g=>'fixture-room/'+g.id)!;assert.equal(spawns.length,28);
  const floorMeshes=['underground-mine-rock','underground-mine-rail'].map(n=>h.mounted.group.getObjectByName(n)!);
  parent.updateMatrixWorld(true);
  for(const g of s.groups)for(const m of g.members){
   assert.ok(h.passageAt(m.at.east,m.at.north));
   const hit=new Raycaster(new Vector3(m.at.east,m.at.height+.3,-m.at.north),new Vector3(0,-1,0),0,.6).intersectObjects(floorMeshes)[0];
   assert.ok(hit&&Math.abs(hit.point.y-m.at.height)<.001);
   if(g.species==='snow-clump')assert.ok(h.oreSurvey.ordinary.every(o=>Math.hypot(m.at.east-o.target.at.east,m.at.north-o.target.at.north)>=15));
  }
  const sk=s.groups.filter(g=>g.species==='skeleton-miner');
  for(const o of h.oreSurvey.ordinary)assert.equal(sk.filter(g=>Math.hypot(g.center.east-o.target.at.east,g.center.north-o.target.at.north)<=25).length,1);
  const authority=createMineBestiaryEncounter(spawns,{hasSpawnSite:(section,room,habitat,p)=>section==='mine'&&spawns.some(s=>s.room===room&&s.habitat===habitat&&Math.hypot(s.at.east-p.east,s.at.north-p.north)<1e-8),
   moveAllowed:(_id,_room,_from,p)=>!!h.passageAt(p.east,p.north),seesPlayer:()=>true,hearsMining:()=>false,insideCampfire:()=>false});
  const sync=()=>{actors=authority.snapshot();h.mounted.sync()};
  sync();assert.ok([...art.models.values()].every(m=>!m.group.visible));approved=true;sync();assert.equal(art.accepted().length,28);
  for(const m of spawns){const pos=art.models.get(m.id)!.group.getWorldPosition(new Vector3());assert.ok(Math.hypot(pos.x-m.at.east,pos.z+m.at.north)<1e-6)}
  const snow=spawns.find(s=>s.species==='snow-clump')!,skel=spawns.find(s=>s.species==='skeleton-miner')!;
  let tick=0;
  const frame=(target:typeof snow,tool:'pickaxe'|'snowball')=>authority.advance({tick:tick++,mode:'survival',section:'mine',player:{room:target.room,at:target.at,action:'quiet',health:100,maxHealth:100},contact:{target:target.id,tool}});
  assert.equal(frame(snow,'pickaxe').hit,'wrong-tool');sync();assert.ok(art.models.get(snow.id)!.group.visible);
  assert.equal(frame(snow,'snowball').hit,'defeated');sync();assert.equal(art.models.get(snow.id)!.group.visible,false);assert.equal(art.fragments.mesh.count,8);sync();assert.equal(art.fragments.mesh.count,8);
  assert.equal(frame(skel,'pickaxe').hit,'damaged');sync();assert.equal(art.accepted().find(a=>a.id===skel.id)?.remainingHits,1);
  assert.equal(frame(skel,'pickaxe').hit,'defeated');sync();assert.equal(art.models.get(skel.id)!.group.visible,false);
  actors=actors.map(a=>({...a,room:'forged-room'}));h.mounted.sync();assert.equal(art.accepted().length,0);
  sync();approved=false;h.mounted.sync();assert.ok([...art.models.values()].every(m=>!m.group.visible));assert.equal(art.fragments.mesh.count,0);
 }finally{h.mounted.dispose()}
 assert.equal(parent.children.length,0);
});
