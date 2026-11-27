import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Mesh} from 'three';
import {buildSouthReviewWorld} from '../tools/voxel-tavern/town-blockout/town-night-a-summit-r1-review-world';
test('southern forest is grounded, sector-owned, reserved, spatially culled without changing collision',()=>{
 const w=buildSouthReviewWorld();try{
  const f=w.forest;assert.ok(f.stats.trees>600&&f.stats.rocks>200);
  for(const b of f.bodies){
   assert.ok(b.east-b.radius>-1100&&b.east+b.radius<1100&&b.north+b.radius<480);
   assert.ok(b.bottom<=w.ground(b.east,b.north)!&&b.top>w.ground(b.east,b.north)!);
   assert.equal(w.protectedAt(b.east,b.north),false);
   assert.ok(f.blocked(b.east,b.north,w.ground(b.east,b.north)!));
  }
  f.updateView(0,0,200);assert.ok(f.group.children.some(c=>!c.visible));
  const p=f.bodies.at(-1)!;assert.ok(f.blocked(p.east,p.north,w.ground(p.east,p.north)!));
  for(const m of w.gully.group.children as Mesh[]){
   const p=m.geometry.getAttribute('position');
   for(let i=0;i<p.count;i++)assert.ok(Math.abs(p.getY(i)-w.ground(p.getX(i),-p.getZ(i))!-.022)<.001);
  }
  console.log(JSON.stringify({forest:f.stats,gully:w.gully.triangles}));
 }finally{w.dispose();}
});
