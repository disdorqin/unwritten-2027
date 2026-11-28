import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sampleTownD2R30Height} from '../tools/voxel-tavern/town-blockout/town-d2-r30-domain';
import {composeNightBWestHeight,westCableDistance,nightBWestBounds} from '../tools/voxel-tavern/town-blockout/town-night-b-summit-west-relief';
import {createNightBWestDressing} from '../tools/voxel-tavern/town-blockout/town-night-b-summit-west-dressing';
test('west forest, rock and snow belt is grounded, reserved and spatially culled without removing collision',()=>{
 const height=composeNightBWestHeight((e,n)=>sampleTownD2R30Height(e,n));
 const reserve=(e:number,n:number,r:number)=>Math.abs(e+650)<r+5;
 const assets=createNightBWestDressing(height,reserve);
 try{
  const s=assets.stats;assert.ok(s.trees>100&&s.rocks>100&&s.snow>50&&s.excluded>0);assert.equal(s.triangles,s.instances*12);
  assert.equal(assets.group.children.length,s.cells);
  for(const p of assets.bodies){assert.ok(p.e>=nightBWestBounds.west+32&&p.e<nightBWestBounds.east-32&&p.n>=nightBWestBounds.south+32);assert.ok(westCableDistance(p.e,p.n)>=25);assert.equal(reserve(p.e,p.n,8),false);const ground=height(p.e,p.n)!;assert.ok(p.y<ground&&p.y+p.h>ground);assert.equal(assets.blocked(p.e,p.n,ground),true);}
  const p=assets.bodies[0]!;assets.updateView(0,0,50);assert.equal(assets.group.children.filter(c=>c.visible).length,0);assert.equal(assets.blocked(p.e,p.n,height(p.e,p.n)!),true);
  assets.updateView(-750,1000,300);assert.ok(assets.group.children.some(c=>c.visible));assert.ok(assets.group.children.some(c=>!c.visible));console.log(JSON.stringify(s));
 }finally{assets.dispose();}assert.equal(assets.group.children.length,0);
});
