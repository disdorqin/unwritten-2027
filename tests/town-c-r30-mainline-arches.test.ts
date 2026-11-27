import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Raycaster,Vector3} from 'three';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road.js';
import {mountUndergroundDomainHost} from '../tools/voxel-tavern/town-blockout/underground-domain-host.js';
test('new curved haulage frames and hazard signs have real obstruction feet and preserve swept clearance',()=>{
 const parent=new Group(),road=mountWestCraterRoad(260,()=>10.7773),h=mountUndergroundDomainHost({parent,road});
 assert.equal(h.kind,'ready');if(h.kind!=='ready'||h.mainline?.kind!=='ready')assert.fail();
 try{
  const {scene,route}=h.mainline,a=scene.r30Arches!;
  assert.equal(a.frames.length,9);assert.equal(a.warnings.length,4);assert.ok(a.parts>600);
  parent.updateMatrixWorld(true);
  for(const b of a.obstructions){
   assert.equal(h.passageAt(b.p.east,b.p.north),undefined);
   assert.ok(new Raycaster(new Vector3(b.p.east,b.p.height+.65,-b.p.north),new Vector3(0,-1,0),0,.7).intersectObject(a.group,true).length);
  }
  for(let m=0;m<route.length;m+=.1){
   const p=route.sample(m).position;
   assert.equal(a.blocks(p.east,p.north,p.height,.82,2.4),false);
   assert.ok(h.passageAt(p.east,p.north));
  }
  for(const m of a.frames){
   const p=route.sample(m).position;
   const beam=new Raycaster(new Vector3(p.east,p.height+2.4,-p.north),new Vector3(0,1,0),0,2).intersectObject(a.group,true)[0];
   assert.ok(beam&&beam.point.y>p.height+3.5&&beam.point.y<p.height+4.15);
  }
  for(const m of a.warnings)assert.ok(route.bends.some(b=>Math.abs(Math.max(2,b.chainage-4.2)-m)<1e-6));
 }finally{h.mounted.dispose()}
 assert.equal(parent.children.length,0);
});
