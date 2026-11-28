import assert from 'node:assert/strict';
import {test} from 'node:test';
import {InstancedMesh,Matrix4,Vector3,Quaternion,Euler} from 'three';
import {buildSouthReviewWorld} from '../tools/voxel-tavern/town-blockout/town-night-a-summit-r1-review-world';
import {mountSouthRavine} from '../tools/voxel-tavern/town-blockout/town-a33-south-ravine';
import {southGullyNorth} from '../tools/voxel-tavern/town-blockout/town-night-a-summit-landform';
test('ravine solid ledges sit on the shared field and leave the protected ice trough clear',()=>{
 const w=buildSouthReviewWorld(),ravine=mountSouthRavine(w.ground,w.protectedAt);
 try{
  assert.ok(ravine.stats.ledges>10&&ravine.stats.chips>10);
  const matrix=new Matrix4(),pos=new Vector3(),q=new Quaternion(),s=new Vector3();
  let count=0;
  for(const mesh of ravine.group.children as InstancedMesh[])for(let i=0;i<mesh.count;i++){
   mesh.getMatrixAt(i,matrix);matrix.decompose(pos,q,s);
   const hit=ravine.pieces.find(p=>Math.hypot(pos.x-p.e,pos.z+p.n,pos.y-p.y-p.h/2)<.0002&&Math.abs(s.x-p.w)<.0001&&Math.abs(s.y-p.h)<.0001&&Math.abs(s.z-p.d)<.0001);
   assert.ok(hit);assert.ok(q.angleTo(new Quaternion().setFromEuler(new Euler(0,hit.yaw,0)))<.001);
   assert.equal(w.protectedAt(hit.e,hit.n),false);
   assert.ok(ravine.blocked(hit.e,hit.n,hit.y+hit.h*.5,.05,.10));
   count++;
  }
  assert.equal(count,ravine.pieces.length);
  for(let e=-615;e<120;e+=.5){
   const n=southGullyNorth(e),h=w.ground(e,n);
   if(h!==undefined)assert.equal(ravine.blocked(e,n,h),false);
  }
  console.log(JSON.stringify({ravine:ravine.stats}));
 }finally{ravine.dispose();w.dispose();}
});
