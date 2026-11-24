import test from 'node:test';
import assert from 'node:assert/strict';
import {Group} from 'three';
import {createUndergroundMineLayout} from '../src/shared/underground-mine-layout.js';
import {firstMineDeepWorks as d} from '../src/shared/town-c-first-mine-deep-works.js';
import {mountFirstMineDeepWorks} from '../tools/voxel-tavern/town-blockout/town-c-first-mine-deep-works.js';
import {undergroundMineSpec as spec} from '../tools/fixtures/underground-first-mine-survey-spec.js';
function waterArea(mesh:Float32Array){let a=0;for(let i=0;i<mesh.length;i+=9)a+=Math.abs((mesh[i+5]-mesh[i+2])*(mesh[i+6]-mesh[i])-(mesh[i+3]-mesh[i])*(mesh[i+8]-mesh[i+2]))/2;return a}
test('canonical deep dry workings connect without moving the old wet rectangle or tutorials',()=>{
 const m=createUndergroundMineLayout(spec),old=createUndergroundMineLayout({...spec,camp:{...spec.camp,crystalGate:false}});
 assert.ok(m.expansion?.deepWorks);assert.equal(old.expansion?.deepWorks,false);
 assert.deepEqual(m.anchors,old.anchors);assert.deepEqual(m.route,old.route);
 assert.ok(Math.abs(waterArea(m.mesh.water)-waterArea(old.mesh.water))<.0001);
 const parent=new Group(),art=mountFirstMineDeepWorks(parent,true);
 try{
  assert.equal(art.pieces,2585);
  for(const p of art.parts){
   if(p.y+p.h/2<=-90.975)continue;
   assert.ok(d.fixtures.some(s=>Math.abs(p.x-s.x)+p.w/2<=s.width/2+1e-8&&Math.abs(p.z-s.z)+p.d/2<=s.depth/2+1e-8&&p.y+p.h/2<=s.y+s.height+1e-8));
  }
  for(const f of d.fixtures){
   assert.equal(m.queryPassage(f.x,f.z,.27,1.8,'open'),undefined);
   assert.ok(m.queryPassage(f.foot[0],f.foot[2],.27,1.8,'open'));
  }
  for(const route of [d.westPath,d.eastDryPath])for(let i=1;i<route.length;i++){
   const [x,z]=route[i-1],[e,n]=route[i],steps=Math.ceil(Math.hypot(e-x,n-z)*10);
   for(let k=0;k<=steps;k++)assert.equal(m.queryPassage(x+(e-x)*k/steps,z+(n-z)*k/steps,.27,1.8,'closed')?.waterDepth,0);
  }
  for(const p of [...d.zombies,...d.snakes]){
   assert.equal(m.queryPassage(p.east,p.north,.27,1.8,'closed')?.floor,p.height);
   for(const safe of [m.anchors.campRecovery.position,m.supportStation!.foot])assert.ok(Math.hypot(p.east-safe[0],p.north-safe[2])>=30);
  }
  for(const p of d.snakes)assert.ok(Math.hypot(Math.max(0,4.2-p.east,p.east-7.4),Math.max(0,113.4-p.north,p.north-137))<=10);
 }finally{art.dispose()}
 assert.equal(parent.children.length,0);
});
