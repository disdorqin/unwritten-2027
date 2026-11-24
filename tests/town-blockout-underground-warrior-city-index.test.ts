import test from 'node:test';
import assert from 'node:assert/strict';
import {createWarriorCityCandidate} from '../tools/voxel-tavern/town-blockout/underground-warrior-city-candidate.js';
import {createStaticFootIndex} from '../tools/voxel-tavern/town-blockout/town-c-static-foot-index.js';
test('city retains every physical instance and indexed clearance equals exhaustive boxes',()=>{
 const city=createWarriorCityCandidate(),shell=city.shell;
 try{
  assert.equal(city.instancedPieces,17292);assert.equal(shell.count,7614);
  const boxes=[...city.colliders,...shell.solids.map(p=>({min:[p.e-p.w/2,p.y-p.h/2,-p.n-p.d/2],max:[p.e+p.w/2,p.y+p.h/2,-p.n+p.d/2]}))];
  const index=createStaticFootIndex(boxes);
  let worst=0;
  for(let i=0;i<3500;i++){
   const e=.3+(i*17.177%179.4),n=-29.7+(i*23.311%59.4),y=i%7===0?7.12:0,r=.27;
   const brute=boxes.some(b=>b.max[1]>y+.025&&b.min[1]<y+1.8&&Math.hypot(Math.max(0,b.min[0]-e,e-b.max[0]),Math.max(0,b.min[2]+n,-n-b.max[2]))<r);
   assert.equal(index.blocks(e,n,y,r),brute,'point '+i);
   assert.equal(city.canStand(e,n,y,r),!brute,'city '+i);
   worst=Math.max(worst,index.candidates(e,n,r).size);
  }
  assert.ok(worst<boxes.length*.12,'index did not narrow broad phase');
  for(let e=1;e<179;e+=.25)assert.ok(city.canStand(e,0));
 }finally{city.dispose()}
});
