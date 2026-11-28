import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildSouthReviewWorld} from '../tools/voxel-tavern/town-blockout/town-night-a-summit-r1-review-world';
test('R1 south relief preserves the surveyed gate, trail, cable reservations and other sectors',()=>{
 const a=buildSouthReviewWorld();try{
  let changed=0;
  for(let n=-10;n<=1790;n+=8)for(let e=-1100;e<=1100;e+=8){
   const d=a.delta(e,n);
   assert.ok(Number.isFinite(a.collision.surfaceAt(e,n)));
   if(n>=480||e===-1100||e===1100||n===-10||a.protectedAt(e,n))assert.equal(d,0);
   if(Math.abs(d)>.1)changed++;
  }
  assert.ok(changed>8000);assert.ok(a.gully.triangles>100);assert.ok(a.gully.shelfCount>30);
  for(const mesh of a.gully.group.children){const p=(mesh as import('three').Mesh).geometry.getAttribute('position');for(let i=0;i<p.count;i++){const e=p.getX(i),n=-p.getZ(i),h=a.ground(e,n)!;assert.ok(p.getY(i)-h>=-.001&&p.getY(i)-h<.172);assert.ok(!a.protectedAt(e,n));}}
  for(let n=-14;n<=35;n+=.25){assert.ok(!a.blocked(0,n,a.ground(0,n)!));}
  for(let e=0;e<=7.25;e+=.25)assert.ok(!a.blocked(e,7,a.ground(e,7)!));
  assert.ok(a.blocked(2.75,-5,347));assert.ok(a.entry.blocked(24,23,347));
  console.log(JSON.stringify({...a.stats,changedByAudit:changed}));
 }finally{a.dispose();}
});
