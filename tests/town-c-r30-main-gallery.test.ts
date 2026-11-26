import test from 'node:test';
import assert from 'node:assert/strict';
import {Group} from 'three';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road.js';
import {mountUndergroundDomainHost} from '../tools/voxel-tavern/town-blockout/underground-domain-host.js';
test('mine support detail is mounted, posts collide and both approach and branch routes stay open',()=>{
 const parent=new Group(),road=mountWestCraterRoad(260,()=>10.7773),h=mountUndergroundDomainHost({parent,road});
 assert.equal(h.kind,'ready');if(h.kind!=='ready')assert.fail();
 try{
  const art=h.mounted.galleryArt!;assert.equal(art.frames.length,13);assert.ok(art.parts.length>1400);
  assert.ok(!art.parts.some(p=>p.family==='wood'&&p.w===1.65&&p.z>=48.2&&(p.z<=68||p.z>=111&&p.z<=137.3)),'no duplicate sleepers on running line');
  for(let z=12.5;z<=138.3;z+=.1){
   if(z>34.7&&z<46.3)continue; // occupied camp has its own approach layout
   const p=h.mounted.toWorld([0,-91,z])!;
   assert.ok(h.passageAt(p.east,p.north,z>=31.6&&z<=35.4?'crouching':'standing'),'blocked at '+z);
  }
  for(const z of [52,76,94,109,131]){
   for(let x=-3.5;x<=3.5;x+=.1){
    const p=h.mounted.toWorld([x,-91,z])!;assert.ok(h.passageAt(p.east,p.north),'branch at '+x+'/'+z);
   }
  }
  const p=h.mounted.toWorld([1.83,-90,17.8])!;assert.equal(h.passageAt(p.east,p.north),undefined);
 }finally{h.mounted.dispose()}
 assert.equal(parent.children.length,0);
});
