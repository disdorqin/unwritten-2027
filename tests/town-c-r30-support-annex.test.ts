import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Raycaster,Vector3} from 'three';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road.js';
import {mountUndergroundDomainHost} from '../tools/voxel-tavern/town-blockout/underground-domain-host.js';
import {r30SupportAnnexPath,r30SupportAnnexFixtures} from '../src/shared/town-c-r30-support-annex.js';
test('support annex furniture fits registered obstruction volumes and loop has continuous actual floor',()=>{
 const parent=new Group(),road=mountWestCraterRoad(260,()=>10.7773),h=mountUndergroundDomainHost({parent,road});
 assert.equal(h.kind,'ready');if(h.kind!=='ready')assert.fail();
 try{
  const annex=h.mounted.supportAnnex!;assert.ok(annex.parts.length>350);assert.equal(annex.fixtures.length,4);
  for(const p of annex.parts){
   if(!p.fixture){assert.ok(p.y-p.h/2>=-91+1.8);continue}
   const c=annex.rearStorage!;
   const a=p.fixture==='rear-storage'?{x:c.x,z:c.z,width:c.w,depth:c.d,height:c.h}:r30SupportAnnexFixtures.find(f=>f.id===p.fixture)!;
   assert.ok(p.x-p.w/2>=a.x-a.width/2-1e-6&&p.x+p.w/2<=a.x+a.width/2+1e-6,'x '+p.fixture);
   assert.ok(p.z-p.d/2>=a.z-a.depth/2-1e-6&&p.z+p.d/2<=a.z+a.depth/2+1e-6,'z '+p.fixture);
   assert.ok(p.y-p.h/2>=-91-1e-6&&p.y+p.h/2<=-91+a.height+1e-6,'y '+p.fixture);
  }
  const world=(x:number,z:number)=>h.mounted.toWorld([x,-91,z])!;
  const meshes=['underground-mine-rock','underground-mine-rail'].map(name=>h.mounted.group.getObjectByName(name)!);
  parent.updateMatrixWorld(true);
  let foot=world(...r30SupportAnnexPath[0]);
  for(let i=1;i<r30SupportAnnexPath.length;i++){
   const [ax,az]=r30SupportAnnexPath[i-1],[bx,bz]=r30SupportAnnexPath[i],n=Math.ceil(Math.hypot(bx-ax,bz-az)/.1);
   for(let k=1;k<=n;k++){
    const next=world(ax+(bx-ax)*k/n,az+(bz-az)*k/n),step=h.resolveMineStep(foot,next,'standing');
    assert.ok(step,'loop blocked '+i+'/'+k);
    const hit=new Raycaster(new Vector3(next.east,-90.7,-next.north),new Vector3(0,-1,0),0,.6).intersectObjects(meshes)[0];
    assert.ok(hit&&Math.abs(hit.point.y+91)<.001,'no actual floor '+i+'/'+k);
    foot=step.foot;
   }
  }
  for(const a of r30SupportAnnexFixtures){const p=world(a.x,a.z);assert.equal(h.passageAt(p.east,p.north),undefined)}
  const rear=world(annex.rearStorage!.x,annex.rearStorage!.z);assert.equal(h.passageAt(rear.east,rear.north),undefined);assert.equal(h.passageAt(rear.east,rear.north,'crouching'),undefined);
  const old=world(-1.85,104.5);assert.ok(h.passageAt(old.east,old.north));
 }finally{h.mounted.dispose()}
 assert.equal(parent.children.length,0);
});
