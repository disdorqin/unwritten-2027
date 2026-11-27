import test from 'node:test';
import assert from 'node:assert/strict';
import {buildR30TownSkyline} from '../tools/voxel-tavern/town-blockout/town-d2-r30-skyline';
import {sampleTownD2R30Height} from '../tools/voxel-tavern/town-blockout/town-d2-r30-domain';
import {describeTownRelease} from '../tools/voxel-tavern/town-blockout/town-entry';
test('default town skyline uses D2 height source and finite vertex colors',()=>{
 const g=buildR30TownSkyline();
 try{
  const p=g.getAttribute('position'),c=g.getAttribute('color'),k=g.userData.r30TopVertexCount;
  assert.ok(k>1000&&k<p.count);assert.equal(c.count,p.count);
  for(let i=0;i<k;i++){assert.ok(Math.abs(p.getY(i)-sampleTownD2R30Height(p.getX(i),-p.getZ(i),347)!)<.0001);}
  assert.ok([...c.array,...p.array].every(Number.isFinite));
  assert.ok(g.getIndex()!.count/3<10000);
 }finally{g.dispose()}
});
test('release indicator requires exact server revision, not version label',()=>{
 const a='a'.repeat(40),b='b'.repeat(40);
 assert.equal(describeTownRelease(a,'town-preview '+a).matched,true);
 assert.equal(describeTownRelease(a,'town-preview '+b).matched,false);
 assert.equal(describeTownRelease(a,undefined).matched,false);
 assert.equal(describeTownRelease(a,'<html>town-preview '+a).matched,false);
 assert.equal(describeTownRelease('local','town-preview '+a).matched,false);
});
