import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildSouthReviewWorld} from '../tools/voxel-tavern/town-blockout/town-night-a-summit-r1-review-world';
import {proposeSouthRoadGrade} from '../tools/voxel-tavern/town-blockout/town-night-a-summit-road-grade';
import {mountSouthEarthworks} from '../tools/voxel-tavern/town-blockout/town-night-a-summit-road-earthworks';
import {mountSouthSector} from '../tools/voxel-tavern/town-blockout/town-night-a-summit-sector';
test('southern sector refuses duplicate roads and uncut terrain; transfers one earthwork and its support',()=>{
 const w=buildSouthReviewWorld();
 const p=w.trail.points,proposal=proposeSouthRoadGrade(p,1,834,w.collision.surfaceAt);
 assert.ok(proposal.ok);if(!proposal.ok)throw Error('infeasible');
 const points=[...p.slice(0,1),...proposal.profile,...p.slice(835)];
 const earthworks=mountSouthEarthworks(points,1,834,w.collision.surfaceAt);
 const input={heightAt:w.collision.surfaceAt,reserved:w.protectedAt,legacySouthVegetationExcluded:true,legacyTreadExcluded:true,earthworks};
 try{
  assert.throws(()=>mountSouthSector({...input,legacySouthVegetationExcluded:false}),/vegetation/);
  assert.throws(()=>mountSouthSector({...input,legacyTreadExcluded:false}),/tread/);
  assert.throws(()=>mountSouthSector(input),/cut/);
  assert.throws(()=>mountSouthSector({...input,trailPoints:points,canonicalCutInstalled:true}),/Two southern/);
  // Ownership gate only. Actual terrain cut is tested in earthworks.test.
  const s=mountSouthSector({...input,canonicalCutInstalled:true});
  try{
   assert.equal(s.cutTread,earthworks.cutTread);assert.equal(earthworks.group.parent,s.group);
   for(const q of proposal.profile.slice(3,-3).filter((_,i)=>i%15===0)){
    const h=s.supportAt(q.east,q.north);assert.ok(h!==undefined&&Math.abs(h-q.height-.055)<.002);
    assert.equal(s.blocked(q.east,q.north,h!),false);
   }
  }finally{s.dispose();s.dispose();}
  assert.equal(earthworks.group.parent,null);
 }finally{earthworks.dispose();w.dispose();}
});
