import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Vector3,PointLight} from 'three';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road.js';
import {mountUndergroundDomainHost} from '../tools/voxel-tavern/town-blockout/underground-domain-host.js';
test('the certified host mounts a hidden shaft and solid wreck, and samples the existing trip through the bore',()=>{
 const parent=new Group(),road=mountWestCraterRoad(260,()=>10.7773),h=mountUndergroundDomainHost({parent,road});
 assert.equal(h.kind,'ready');if(h.kind!=='ready')assert.fail();
 try{
  const shaft=h.mounted.shaftRide!,wreck=h.mounted.wreck!;
  assert.ok(shaft.parts>400&&wreck.parts>20);
  assert.equal(shaft.root.visible,false);
  const p=h.mounted.toWorld([2.31,-91.2,1.48])!,pool=h.mounted.poolWorld;
  assert.equal(h.passageAt(p.east,p.north),undefined);
  assert.ok(h.passageAt(pool.east,pool.north));
  const trip={id:1,first:true,departedAt:1000,travelMs:25_000,direction:'down' as const};
  const a=shaft.sample(trip,1000)!,b=shaft.sample(trip,13500)!,c=shaft.sample(trip,24000)!;
  assert.ok(a.eye.height>b.eye.height&&b.eye.height>c.eye.height);
  assert.equal(c.blackout,true);assert.equal(shaft.root.visible,true);
  parent.updateMatrixWorld(true);const actual=shaft.cage.getWorldPosition(new Vector3());
  assert.ok(Math.hypot(actual.x-c.eye.east,actual.z+c.eye.north,actual.y+1.59-c.eye.height)<1e-6);
  assert.equal(shaft.sample(trip,26000)?.visible,false);
  const up=shaft.sample({...trip,id:2,first:false,direction:'up'},1000)!;
  assert.ok(up.eye.height<a.eye.height);
  shaft.hide();let active=0;shaft.root.traverse(o=>{if(o instanceof PointLight&&o.visible)active++});assert.equal(active,0);
 }finally{h.mounted.dispose()}
 assert.equal(parent.children.length,0);
});
