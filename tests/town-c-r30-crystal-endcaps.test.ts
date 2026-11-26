import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Raycaster,Vector3} from 'three';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road.js';
import {mountUndergroundDomainHost} from '../tools/voxel-tavern/town-blockout/underground-domain-host.js';
import {crystalCavernToWorld,crystalCavernTrailHeight} from '../tools/voxel-tavern/town-blockout/underground-crystal-cavern.js';
test('actual rock closes both cavern ends except original mouth, while terminal and quay remain walkable',()=>{
 const parent=new Group();let foot:{domainId:string;east:number;north:number;height:number}|undefined;
 const h=mountUndergroundDomainHost({parent,road:mountWestCraterRoad(260,()=>10.7773),readAcceptedDomainFoot:()=>foot,
  crystalBridge:{acceptsFrame:()=>true,readGateStage:()=>'open'}});
 assert.equal(h.kind,'ready');if(h.kind!=='ready')assert.fail();
 try{
  h.mounted.sync();const ch=h.crystalHost,c=ch.contract!,art=ch.endcaps!;
  foot={...c.crystal};h.mounted.sync();parent.updateMatrixWorld(true);
  const world=(e:number,y:number,n:number)=>{const p=crystalCavernToWorld(c.frame,[e,y,n]);return new Vector3(p.east,p.height,-p.north)};
  const cast=(e:number,y:number,n:number,to:number)=>new Raycaster(world(e,y,n),world(e,y,to).sub(world(e,y,n)).normalize(),0,Math.abs(to-n)).intersectObject(art.group,true);
  for(let e=-88;e<=88;e+=2.1)for(const y of [.5,4,15,28,32]){
   if(Math.abs(e)>2||y>3.436)assert.ok(cast(e,y,-8,-14).length,'front wall '+e+'/'+y);
   assert.ok(cast(e,y,105,112).length,'rear wall '+e+'/'+y);
  }
  for(const e of [-1.8,0,1.8])for(const y of [.2,1.5,3.3])assert.equal(cast(e,y,-8,-14).length,0,'original mouth');
  const pass=(e:number,n:number)=>{const p=crystalCavernToWorld(c.frame,[e,crystalCavernTrailHeight(n),n]);return ch.passageAt(c.crystal.domainId,p.east,p.north)};
  assert.ok(pass(8.7,98.5));assert.ok(pass(32.5,76));assert.ok(pass(33.55,76));
  assert.equal(pass(8.7,98.85),undefined);assert.equal(pass(33.95,76),undefined);
  for(const b of art.boundary){assert.ok(art.blocks(b.e,b.n,b.y-b.h/2,.27,1.8))}
  assert.ok(art.parts.length>700);
 }finally{h.mounted.dispose()}
 assert.equal(parent.children.length,0);
});
