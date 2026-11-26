import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Raycaster,Vector3} from 'three';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road.js';
import {mountUndergroundDomainHost} from '../tools/voxel-tavern/town-blockout/underground-domain-host.js';
import {createUndergroundMining,type UndergroundMiningReward} from '../src/presence/underground-mining.js';
import type {UndergroundMiningTargetView,UndergroundMiningCore} from '../src/shared/underground-mining.js';
type Action=NonNullable<ReturnType<Parameters<typeof createUndergroundMining>[0]['accept']>>;
test('five measured ordinary ore faces, original mining receipts, real core support and regrowth',()=>{
 const parent=new Group(),road=mountWestCraterRoad(260,()=>10.7773);
 let targets:readonly UndergroundMiningTargetView[]=[],cores:readonly UndergroundMiningCore[]=[],accepted=false;
 const h=mountUndergroundDomainHost({parent,road,oreBridge:{acceptsSite:()=>accepted,readTargets:()=>targets,readCores:()=>cores}});
 assert.equal(h.kind,'ready');if(h.kind!=='ready'||h.oreSurvey.kind!=='ready'||!h.oreArt)assert.fail();
 try{
  const {ordinary,trace,distribution}=h.oreSurvey,art=h.oreArt;
  assert.equal(ordinary.length,5);assert.equal(trace.sites.length,2);assert.equal(trace.productionReady,false);
  assert.equal(distribution.layers[0].markers.length,5);assert.ok([...art.veins.values()].every(v=>!v.group.visible));
  const rock=h.mounted.group.getObjectByName('underground-mine-rock')!;
  const mesh=[rock,h.mounted.group.getObjectByName('underground-mine-rail')!];parent.updateMatrixWorld(true);
  for(const s of [...ordinary,...trace.sites]){
   const p=s.foot,at=s.face,n=s.normal;assert.ok(h.passageAt(p.east,p.north));
   const hit=new Raycaster(new Vector3(p.east,p.height+.3,-p.north),new Vector3(0,-1,0),0,.6).intersectObjects(mesh)[0];assert.ok(hit&&Math.abs(hit.point.y-p.height)<.001);
   const ray=new Raycaster(new Vector3(p.east,at.height,-p.north),new Vector3(-n.east,-n.height,n.north),0,1.6);
   assert.ok(ray.intersectObject(rock).some(q=>q.point.distanceTo(new Vector3(at.east,at.height,-at.north))<.001));
  }
  let now=1000,seq=0,action:Action|undefined,allow=true;
  const rewards:UndergroundMiningReward[]=[];
  const a=createUndergroundMining({ore:ordinary,openings:[],reach:2,regrowMs:1800000,now:()=>now,strikeDelayMs:()=>400,
   accept:()=>action,commit(_id,_state,reward){if(!allow)return false;if(reward)rewards.push(reward);return true}});
  const sync=()=>{const s=a.readLayer('underground/mine');targets=s.targets;cores=s.cores;h.mounted.sync()};
  sync();assert.ok([...art.veins.values()].every(v=>!v.group.visible));accepted=true;sync();
  for(const s of ordinary){
   const id=s.marker.id,v=art.veins.get(id)!;assert.equal(v.group.visible,true);
   const attempt=()=>{action={sequence:++seq,action:'strike',targetId:id,feet:s.coreAt,active:true,held:'pickaxe'};return a.apply('miner',seq)};
   for(let i=1;i<=3;i++){
    const r=attempt();assert.ok(r?.action==='strike'&&r.target.hits===i);now+=400;sync();
    assert.equal(v.group.getObjectByName('ore-cluster')!.visible,i<3);
    assert.equal(v.group.getObjectByName('ore-scar')!.visible,i===3);
    assert.equal(v.group.getObjectByName('ore-cracks')!.visible,i<3);
   }
   assert.equal(art.cores.size,1);const core=cores[0],m=art.cores.get(core.id)!;
   parent.updateMatrixWorld(true);const at=m.getWorldPosition(new Vector3());
   assert.ok(at.distanceTo(new Vector3(core.at.east,core.at.height+.14,-core.at.north))<1e-6);
   action={sequence:++seq,action:'pickup',targetId:core.id,feet:s.coreAt,active:true,held:null};
   allow=false;assert.equal(a.apply('miner',seq),undefined);sync();assert.equal(art.cores.size,1);
   allow=true;assert.ok(a.apply('miner',seq));sync();assert.equal(art.cores.size,0);assert.equal(a.apply('miner',seq),undefined);
  }
  assert.equal(rewards.filter(r=>r.kind==='fragment').length,15);assert.equal(rewards.filter(r=>r.kind==='core').length,5);
  now+=1800001;sync();assert.ok([...art.veins.values()].every(v=>v.group.getObjectByName('ore-cluster')!.visible));
  targets=targets.map(t=>({...t,at:{...t.at,east:t.at.east+1}}));h.mounted.sync();assert.ok([...art.veins.values()].every(v=>!v.group.visible));
  sync();accepted=false;h.mounted.sync();assert.equal(art.targets().length,0);
 }finally{h.mounted.dispose()}
 assert.equal(parent.children.length,0);
});
