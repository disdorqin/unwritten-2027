import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildFrontRidgeR30Field,mountFrontRidgeR30,frontRidgeR30Bounds} from '../tools/voxel-tavern/town-blockout/town-d-r30-front-ridge';
test('D-R01 one height field preserves the survey pads and shared boundaries',()=>{
 const h0=(e:number,n:number)=>Math.fround(12+e*.001+n*.002);
 const f=buildFrontRidgeR30Field(h0,()=>1);
 for(const [e,n,h] of [[320,650,350],[440,520,140],[526,329,18],[336,640,347]])assert.equal(f.heightAt(e!,n!),h);
 for(const side of ['south','north','west','east'] as const)for(const p of f.edge(side))assert.equal(p.height,h0(p.east,p.north));
 assert.equal(f.heightAt(320,269),undefined);
 const m=mountFrontRidgeR30(f);
 try{
  assert.equal(m.group.children.length,90);
  for(const mesh of m.group.children as import('three').Mesh[]){
   const pos=mesh.geometry.getAttribute('position'),norm=mesh.geometry.getAttribute('normal');
   for(let i=0;i<pos.count;i+=97){
    assert.equal(pos.getY(i),f.heightAt(pos.getX(i),-pos.getZ(i)));
    assert.ok(norm.getY(i)>0);
   }
  }
 }finally{m.dispose()}
});
test('host protection has final authority, even at a survey pad',()=>{
 const f=buildFrontRidgeR30Field(()=>12,(e,n)=>e===440&&n===520?0:1);
 assert.equal(f.heightAt(440,520),12);
});
