import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Mesh,MeshBasicMaterial,BufferGeometry} from 'three';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road.js';
import {mountUndergroundDomainHost} from '../tools/voxel-tavern/town-blockout/underground-domain-host.js';
type Foot={east:number;north:number;height:number;domainId:string};
test('camp fire ring consumes only matching accepted recovery contact and original registered anchor',()=>{
 const parent=new Group();let foot:Foot|undefined,approved=false,contact:{fireId:string;layer:string;foot:Foot}|undefined;
 const h=mountUndergroundDomainHost({parent,road:mountWestCraterRoad(260,()=>10.7773),
 readAcceptedDomainFoot:()=>foot,recoveryBridge:{acceptsSite:s=>approved&&s.fire.id==='fire/camp-recovery',readContact:()=>contact}});
 assert.equal(h.kind,'ready');if(h.kind!=='ready')assert.fail();
 try{
  const ring=h.mounted.group.getObjectByName('recovery-fire/fire/camp-recovery') as Mesh<BufferGeometry,MeshBasicMaterial>;
  assert.ok(ring);const fire=h.recoverySite.fire;
  assert.equal(fire.point.layer,'underground/mine');assert.equal(fire.healPerSecond,6);
  assert.ok(h.passageAt(fire.point.east,fire.point.north));assert.equal(h.recoverySite.radius,2.5);
  foot={...h.campFireWorld,domainId:fire.point.layer};contact={fireId:fire.id,layer:fire.point.layer,foot:{...foot}};
  h.mounted.sync();assert.equal(ring.material.opacity,.2);approved=true;h.mounted.sync();assert.equal(ring.material.opacity,.8);
  const saved={...contact};foot={...foot,east:foot.east+1};h.mounted.sync();assert.equal(ring.material.opacity,.2);
  foot=saved.foot;contact={...saved,layer:'underground/crystal'};h.mounted.sync();assert.equal(ring.material.opacity,.2);
  contact={...saved,fireId:'other-fire'};h.mounted.sync();assert.equal(ring.material.opacity,.2);
  contact=saved;h.mounted.sync();assert.equal(ring.material.opacity,.8);
  foot=undefined;h.mounted.sync();assert.equal(ring.material.opacity,.2);
 }finally{h.mounted.dispose()}
 assert.equal(parent.children.length,0);
});
