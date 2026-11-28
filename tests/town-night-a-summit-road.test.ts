import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildSouthReviewWorld} from '../tools/voxel-tavern/town-blockout/town-night-a-summit-r1-review-world';
import {proposeSouthRoadGrade} from '../tools/voxel-tavern/town-blockout/town-night-a-summit-road-grade';
test('south trail works construct only feasible original intervals and retain all failed sections',()=>{
 const w=buildSouthReviewWorld();try{
  const s=w.road.stats;assert.ok(s.length>50&&s.unbuilt>1000&&s.minGap<-8&&s.maxGap>40);
  for(const r of w.road.runs)for(let i=r.first;i<r.last;i++){
   const a=w.trail.points[i]!,b=w.trail.points[i+1]!;
   assert.ok(Math.abs(b.height-a.height)/Math.hypot(b.east-a.east,b.north-a.north)<=.12);
   assert.ok(w.road.sections.find(s=>s.index===i)?.valid);
  }
  const first=proposeSouthRoadGrade(w.trail.points,1,834,w.collision.surfaceAt,5);
  assert.ok(first.ok);
  if(first.ok){assert.ok(first.length>800&&first.maxGrade<=.12&&first.cut<=5.000001&&first.fill<=5.000001);
   assert.equal(first.profile[0]!.height,w.trail.points[1]!.height);
   assert.equal(first.profile.at(-1)!.height,w.trail.points[834]!.height);
   for(let i=0;i<first.profile.length;i++){assert.equal(first.profile[i]!.east,w.trail.points[i+1]!.east);assert.equal(first.profile[i]!.north,w.trail.points[i+1]!.north);}
  }
  const second=proposeSouthRoadGrade(w.trail.points,1539,2262,w.collision.surfaceAt,5);
  assert.equal(second.ok,false);
  console.log(JSON.stringify({road:s,first:first.ok?{length:first.length,cut:first.cut,fill:first.fill,maxGrade:first.maxGrade}:first,second}));
 }finally{w.dispose();}
});
