import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Raycaster,Vector3,PointLight} from 'three';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road.js';
import {mountUndergroundDomainHost} from '../tools/voxel-tavern/town-blockout/underground-domain-host.js';
import {crystalCavernToWorld,crystalCavernTrailEast,crystalCavernTrailHeight,CRYSTAL_CAVERN_CANT_RAD} from '../tools/voxel-tavern/town-blockout/underground-crystal-cavern.js';
import {r30CrystalDomain} from '../tools/voxel-tavern/town-blockout/town-c-r30-crystal-support.js';
test('low crystals have supported roots and exact canonical tilt, real collision, no additional light or ore authority',()=>{
 const parent=new Group();let foot:{domainId:string;east:number;north:number;height:number}|undefined;
 const h=mountUndergroundDomainHost({parent,road:mountWestCraterRoad(260,()=>10.7773),readAcceptedDomainFoot:()=>foot,
 crystalBridge:{acceptsFrame:()=>true,readGateStage:()=>'open'}});
 assert.equal(h.kind,'ready');if(h.kind!=='ready')assert.fail();
 try{
  h.mounted.sync();const ch=h.crystalHost,c=ch.contract!,g=ch.grove!;
  foot={...c.crystal};h.mounted.sync();parent.updateMatrixWorld(true);
  assert.equal(g.clusters.length,14);assert.equal(g.parts.length,428);assert.equal(g.group.children.length,3);
  assert.ok(g.parts.filter(p=>p.family!=='root').every(p=>p.angle===CRYSTAL_CAVERN_CANT_RAD));
  assert.ok(g.clusters.every(c=>c.height>=.5&&c.height<=1.5));
  const p=(e:number,n:number,y=crystalCavernTrailHeight(n))=>crystalCavernToWorld(c.frame,[e,y,n]);
  for(const cluster of g.clusters){
   const world=p(cluster.e,cluster.n);
   assert.equal(ch.passageAt(r30CrystalDomain,world.east,world.north),undefined);
   const crystal=g.solid.find(p=>p.family==='crystal'&&Math.hypot(p.e-cluster.e,p.n-cluster.n)<.45)!;
   assert.ok(crystal,'actual growth near cluster centre');
   const local=crystalCavernToWorld(c.frame,[crystal.e,crystalCavernTrailHeight(cluster.n)+1.6,crystal.n]);
   assert.ok(new Raycaster(new Vector3(local.east,local.height,-local.north),new Vector3(0,-1,0),0,1.65).intersectObject(g.group,true).length);
  }
  for(let n=-3;n<22;n+=.08){
   const world=p(crystalCavernTrailEast(n),n);
   assert.ok(ch.passageAt(r30CrystalDomain,world.east,world.north));
  }
  let lights=0;g.group.traverse(o=>{if(o instanceof PointLight)lights++});assert.equal(lights,0);
  assert.equal(ch.mounted!.lights.length,6);
 }finally{h.mounted.dispose()}
 assert.equal(parent.children.length,0);
});
