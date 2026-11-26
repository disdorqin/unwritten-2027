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
  for(let z=12.5;z<=136.1;z+=.1){
   if(z>34.7&&z<46.3)continue; // occupied camp has its own approach layout
   const p=h.mounted.toWorld([0,-91,z])!;
   assert.ok(h.passageAt(p.east,p.north,z>=31.6&&z<=35.4?'crouching':'standing'),'blocked at '+z);
  }
  // The new real terminal stop blocks the old centreline after the
  // track ends. Verify an entire pedestrian detour, not a pointwise OR.
  const bypass=[[0,136.1],[1.25,136.1],[1.25,138.3],[0,138.3]] as const;
  let foot=h.mounted.toWorld([0,-91,136.1])!;
  for(let i=1;i<bypass.length;i++){
   const a=bypass[i-1],b=bypass[i],n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.08);
   for(let k=1;k<=n;k++){
    const p=h.mounted.toWorld([a[0]+(b[0]-a[0])*k/n,-91,a[1]+(b[1]-a[1])*k/n])!;
    const step=h.resolveMineStep(foot,p,'standing');assert.ok(step,'terminal bypass '+i+'/'+k);foot=step.foot;
   }
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
