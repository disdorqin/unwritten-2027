import assert from 'node:assert/strict';
import {test} from 'node:test';
import {FrontSide,Raycaster,Vector3} from 'three';
import {createA33PublicRearFar} from '../tools/voxel-tavern/town-blockout/town-a33-public-rear-far';
import {sampleTownD2R30Height,townD2R30Spec} from '../tools/voxel-tavern/town-blockout/town-d2-r30-domain';
test('A33 canonical far top has no hand-drawn apron, duplicate join, hidden wall or collision claim',()=>{
 const far=createA33PublicRearFar(800);
 try{
  assert.equal(far.group.children.length,1);assert.equal(far.group.userData.visualOnly,true);assert.equal(far.group.userData.includesWorldCollision,false);
  assert.equal(far.stats.localSouth,124);assert.equal(far.stats.worldSouth,800);
  const g=far.mesh.geometry,p=g.getAttribute('position'),normal=g.getAttribute('normal');
  assert.equal(far.mesh.material.side,FrontSide);assert.equal(far.mesh.material.fog,true);
  assert.equal(p.count,far.stats.cols*far.stats.rows);
  assert.equal(g.index!.count,6*(far.stats.cols-1)*(far.stats.rows-1));
  let seam=0;const unique=new Set<string>();
  for(let i=0;i<p.count;i++){
   const e=p.getX(i),n=-p.getZ(i),h=p.getY(i),key=e+','+n;
   assert.ok(!unique.has(key));unique.add(key);
   assert.ok(n>=124);assert.ok(Math.abs(h-sampleTownD2R30Height(e,n,347)!)<.001);
   assert.ok(normal.getY(i)>0);
   if(n===600)seam++;
  }
  assert.equal(seam,far.stats.cols);
  assert.ok(far.stats.maxDrift<.001);
  const ray=new Raycaster(new Vector3(),new Vector3(0,-1,0));far.group.updateMatrixWorld(true);
  for(const n of [124.37,141.23,599.31,600.79,900.14,1789.43]){
   ray.ray.origin.set(13.71,1200,-n);assert.equal(ray.intersectObject(far.mesh,false).length,1);
  }
  const day=far.mesh.material.color.getHex();far.setNight(true);assert.notEqual(far.mesh.material.color.getHex(),day);far.setNight(false);assert.equal(far.mesh.material.color.getHex(),day);
  console.log(JSON.stringify({far:far.stats,canonicalAnchor:townD2R30Spec.worldAnchor}));
 }finally{far.dispose();far.dispose();}
});
