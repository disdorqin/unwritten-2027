import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Raycaster,Vector3} from 'three';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road.js';
import {mountUndergroundDomainHost} from '../tools/voxel-tavern/town-blockout/underground-domain-host.js';
import {crystalCavernToWorld,crystalCavernTrailEast,crystalCavernTrailHeight} from '../tools/voxel-tavern/town-blockout/underground-crystal-cavern.js';
import {r30CrystalDomain,r30CrystalReturnSwitch} from '../tools/voxel-tavern/town-blockout/town-c-r30-crystal-support.js';
test('vestibule solid piers and curbs preserve full accepted spine, quay and return switch access',()=>{
 const parent=new Group();let foot:{domainId:string;east:number;north:number;height:number}|undefined;
 const h=mountUndergroundDomainHost({parent,road:mountWestCraterRoad(260,()=>10.7773),readAcceptedDomainFoot:()=>foot,
  crystalBridge:{acceptsFrame:()=>true,readGateStage:()=>'open'}});
 assert.equal(h.kind,'ready');if(h.kind!=='ready')assert.fail();
 try{
  h.mounted.sync();const host=h.crystalHost,c=host.contract!,art=host.vestibule!;
  assert.ok(art.parts.length>=240);assert.ok(art.bounds.length>=50);
  const point=(e:number,n:number)=>({domainId:r30CrystalDomain,...crystalCavernToWorld(c.frame,[e,crystalCavernTrailHeight(n),n])});
  foot={...c.crystal};h.mounted.sync();
  const walk=(e:number,n:number)=>{
   const p=point(e,n),d=Math.hypot(p.east-foot!.east,p.north-foot!.north),steps=Math.max(1,Math.ceil(d/.08)),a=foot!;
   for(let i=1;i<=steps;i++){
    const q={east:a.east+(p.east-a.east)*i/steps,north:a.north+(p.north-a.north)*i/steps};
    const next=h.resolveUndergroundStep(foot!,q,'standing');assert.ok(next,'blocked '+e+'/'+n+' at '+i);
    foot=next.foot;
   }
  };
  // Same foot accepted for each movement proposal, no teleport between waypoints.
  for(let n=-9.8;n<=98.0;n+=.2)walk(crystalCavernTrailEast(n),n);
  walk(crystalCavernTrailEast(98),98);
  for(let n=97.8;n>=76;n-=.2)walk(crystalCavernTrailEast(n),n);
  walk(crystalCavernTrailEast(76),76);walk(24.5,76);walk(32.5,76);walk(crystalCavernTrailEast(76),76);
  for(let n=75.8;n>=-7.8;n-=.2)walk(crystalCavernTrailEast(n),n);
  walk(0,-7.8);walk(.76,-7.8);
  const sw=point(r30CrystalReturnSwitch.east,r30CrystalReturnSwitch.north);
  assert.ok(Math.hypot(foot!.east-sw.east,foot!.north-sw.north)<.9);
  assert.equal(host.passageAt(r30CrystalDomain,sw.east,sw.north),undefined);
  parent.updateMatrixWorld(true);
  for(const b of art.bounds){
   const p=point(b.e,b.n);
   assert.equal(host.passageAt(r30CrystalDomain,p.east,p.north),undefined);
   const hits=new Raycaster(new Vector3(p.east,c.frame.height+b.maxY+.2,-p.north),new Vector3(0,-1,0),0,b.maxY-b.minY+.4).intersectObject(art.group,true);
   assert.ok(hits.length,'visible collider '+b.e+'/'+b.n);
  }
 }finally{h.mounted.dispose()}
 assert.equal(parent.children.length,0);
});
