import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {InstancedMesh,Mesh,MeshLambertMaterial} from 'three';
import {mountSouthSector} from '../tools/voxel-tavern/town-blockout/town-night-a-summit-sector';
import {createSouthSnowAppearance} from '../tools/voxel-tavern/town-blockout/town-night-a-summit-snow-appearance';
const clear=()=>({targetCover:.18,pilingRate:.25}),heavy=()=>({targetCover:1,pilingRate:1.25});
test('fixed-position weather cover is bounded, eased and quantized',()=>{
 const updates:number[]=[];const s=createSouthSnowAppearance(22,33,347,c=>updates.push(c));
 s.update(1,(e,n,h)=>{assert.deepEqual([e,n,h],[22,33,347]);return clear();});
 assert.equal(updates.length,0);s.update(150,clear);assert.equal(s.cover(),.18);assert.equal(updates.at(-1),3/16);
 s.update(100,heavy);assert.equal(s.cover(),1);assert.equal(updates.at(-1),1);
 s.update(1,()=>({targetCover:NaN,pilingRate:1}));assert.equal(s.cover(),1);
});
test('real south caps change thickness while preserving instance budget, support and central ice',()=>{
 const s=mountSouthSector({heightAt:()=>347,reserved:()=>false,legacySouthVegetationExcluded:true});
 try{
  const forest=s.forest.group.children as InstancedMesh[];
  const before=forest.map(m=>Float32Array.from(m.instanceMatrix.array));
  const gully=s.gully.group.children as Mesh[];
  const colors=gully.map(m=>Float32Array.from(m.geometry.getAttribute('color').array));
  const positions=gully.map(m=>Float32Array.from(m.geometry.getAttribute('position').array));
  const entry=s.entry.group.children.map(m=>(m as Mesh).material as MeshLambertMaterial);
  const snow=entry.find(m=>m.color?.getHexString()==='dce6eb')!;
  assert.ok(snow);
  const b=s.forest.bodies[0]!,collision=s.blocked(b.east,b.north,347);
  s.updateSnow(150,clear);
  let changed=0,unchanged=0;
  for(const [j,m] of forest.entries()){
   const old=before[j]!,next=m.instanceMatrix.array;
   assert.equal(next.length,old.length);
   for(let i=0;i<next.length;i+=16){
    if(next[i+5]!==old[i+5]){
     changed++;assert.ok(next[i+5]!<old[i+5]!);
     assert.ok(Math.abs((next[i+13]!-next[i+5]!/2)-(old[i+13]!-old[i+5]!/2))<.00008);
    }else unchanged++;
   }
  }
  assert.ok(changed>100&&unchanged>100);
  assert.equal(s.blocked(b.east,b.north,347),collision);
  assert.ok(gully.some((m,i)=>m.geometry.getAttribute('color').array.some((v,j)=>v!==colors[i]![j])));
  for(const [i,m] of gully.entries())assert.deepEqual(m.geometry.getAttribute('position').array,positions[i]);
  assert.notEqual(snow.color.getHexString(),'dce6eb');
  s.updateSnow(100,heavy);
  for(const [i,m] of forest.entries())assert.deepEqual(m.instanceMatrix.array,before[i]);
  for(const [i,m] of gully.entries())assert.deepEqual(m.geometry.getAttribute('color').array,colors[i]);
  assert.equal(snow.color.getHexString(),'dce6eb');
  s.dispose();s.updateSnow(1,()=>{throw Error('released sector may not sample weather');});
 }finally{s.dispose();}
});
