import test from 'node:test';
import assert from 'node:assert/strict';
import {buildR31PublicSkyline} from '../tools/voxel-tavern/town-blockout/town-r31-public-skyline';
import {sampleTownD2R30Height,townD2R30Spec} from '../tools/voxel-tavern/town-blockout/town-d2-r30-domain';
import {mainSummitBounds} from '../tools/voxel-tavern/town-blockout/main-summit-block';

test('public front view is a complete ground-connected terrain surface, not a suspended N600 wall',()=>{
 const g=buildR31PublicSkyline(800),p=g.getAttribute('position'),idx=g.getIndex()!;
 try{
  assert.equal(g.boundingBox!.min.y,-6);
  assert.equal(g.boundingBox!.max.y,800);
  assert.equal(g.boundingBox!.max.z,10);
  assert.equal(g.boundingBox!.min.z,-1790);
  assert.ok(idx.count/3<10000);
  const seen=new Set<string>();
  let maxGrade=0,canonical=0;
  for(let i=0;i<p.count;i++){
   const e=p.getX(i),n=-p.getZ(i),h=p.getY(i),key=e+':'+n;
   assert.ok(!seen.has(key),'vertical face or duplicate plan vertex');
   seen.add(key);
   if(n<=g.userData.joinSouth||e===mainSummitBounds.west||e===mainSummitBounds.east||n===mainSummitBounds.north)assert.equal(h,-6);
   if(n>=600&&n<=1550&&Math.abs(e)<=860){
    assert.ok(Math.abs(h-sampleTownD2R30Height(e,n,347)!)<1e-4);canonical++;
   }
  }
  for(let i=0;i<idx.count;i+=3){
   const a=idx.getX(i),b=idx.getX(i+1),c=idx.getX(i+2);
   const x=p.getX(b)-p.getX(a),z=p.getZ(b)-p.getZ(a),u=p.getX(c)-p.getX(a),v=p.getZ(c)-p.getZ(a);
   assert.ok(Math.abs(x*v-z*u)>0,'no vertical skirt or cap triangles');
   for(const [j,k] of [[a,b],[a,c],[b,c]]){
    const d=Math.hypot(p.getX(j)-p.getX(k),p.getZ(j)-p.getZ(k));
    maxGrade=Math.max(maxGrade,Math.abs(p.getY(j)-p.getY(k))/d);
   }
  }
  assert.ok(canonical>1000);
  assert.ok(maxGrade<4,'no extreme skyline slope: '+maxGrade);
  assert.equal(g.userData.includesWorldCollision,false);
 }finally{g.dispose();}
});
