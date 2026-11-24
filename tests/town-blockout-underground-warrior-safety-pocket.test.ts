import test from 'node:test';
import assert from 'node:assert/strict';
import {createWarriorCityCandidate} from '../tools/voxel-tavern/town-blockout/underground-warrior-city-candidate.js';
import {warriorSafetyPocket as pocket,distanceToWarriorSafetyPocket as distance,inWarriorSafetyPocket as contains} from '../src/shared/town-c-warrior-safety-pocket.js';
import {encounterPlacementPlan} from '../src/shared/underground-encounter-placement-plan.js';
test('three candidate safe sites and cold street are connected; all six groups remain outside the geometric pocket',()=>{
 const city=createWarriorCityCandidate();
 try{
  for(const route of pocket.paths)for(let i=1;i<route.length;i++){
   const [e,n]=route[i-1],[ee,nn]=route[i],steps=Math.ceil(Math.hypot(ee-e,nn-n)*10);
   for(let k=0;k<=steps;k++){const x=e+(ee-e)*k/steps,z=n+(nn-n)*k/steps;assert.ok(contains(x,z));assert.ok(city.canStand(x,z));}
  }
  for(const p of pocket.lampFeet){assert.ok(!contains(p.east,p.north));assert.ok(!city.canStand(p.east,p.north));}
  const groups=encounterPlacementPlan.filter(g=>g.layer==='165');
  assert.equal(groups.length,6);
  for(const g of groups){
   const p=g.candidate!.at;
   assert.ok(city.canStand(p.east,p.north));assert.ok(!contains(p.east,p.north));
   if(g.family==='165-A')assert.ok(distance(p.east,p.north)>=15,g.id);
   if(g.family==='165-C')assert.ok(Math.hypot(p.east-98.1,p.north+9.65)>=30);
   if(g.family==='165-B'&&'patrol' in g.candidate!&&g.candidate.patrol){
    const [a,b]=g.candidate.patrol;
    for(let k=0;k<=280;k++){
     const e=a.east+(b.east-a.east)*k/280,n=a.north+(b.north-a.north)*k/280;
     assert.ok(city.canStand(e,n)&&!contains(e,n)&&Math.hypot(e-98.1,n+9.65)>=10);
    }
   }
  }
 }finally{city.dispose()}
});
