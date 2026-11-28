import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createTownD2R30ProductionHost} from '../tools/voxel-tavern/town-blockout/town-d2-r30-production-host';
import {createA32SouthSectorInstaller,prepareA32SouthSectorInstaller} from '../tools/voxel-tavern/town-blockout/town-a32-south-installer';
import {surveyA32SouthRoadJoint} from '../tools/voxel-tavern/town-blockout/town-a32-south-road';
test('A32 replacement mounts on the real D2 canonical faces without a second terrain and has supported centreline',()=>{
 const host=createTownD2R30ProductionHost();
 try{
  const survey=surveyA32SouthRoadJoint(host.trail,host.surfaceAt);
  assert.equal(survey.originalFirst,1539);assert.equal(survey.originalLast,2262);
  assert.ok(survey.grade.length>754&&survey.grade.length<756);
  assert.ok(survey.grade.maxGrade<.12);
  const original=host.tiles.map(t=>t.geometry);
  const settlement=host.install('A',createA32SouthSectorInstaller());
  assert.ok(settlement.insideSector&&settlement.cutTiles>6);
  const body=host.group.getObjectByName('night-a-south-sector')!;
  assert.equal(body.userData.a32Road.connected,false);assert.equal(body.userData.a32Road.intervalComplete,true);
  for(const p of survey.grade.profile){
   const h=host.supportAt(p.east,p.north,.27);
   assert.ok(h!==undefined&&Math.abs(h-p.height-.055)<.001);
   assert.equal(host.blocked(p.east,p.north,h,.27,1.8),false);
  }
  host.uninstall('A');
  assert.ok(host.tiles.every((t,i)=>t.geometry===original[i]));
 }finally{host.dispose();}
});
test('cooperative south transaction never publishes partial geometry and cancels cleanly',async()=>{
 const h=createTownD2R30ProductionHost({deferDetails:true}),abort=new AbortController(),old=h.tiles.map(t=>t.geometry);
 try{
  const prepared=await prepareA32SouthSectorInstaller(h.port,abort.signal);
  let yields=0;
  await assert.rejects(h.installAsync('A',(port,valid)=>prepared.installAsync(port,{valid,budgetMs:.1,yieldTask:async()=>{
   assert.deepEqual(h.installed(),[]);assert.ok(h.tiles.every((t,i)=>t.geometry===old[i]));
   assert.equal(h.group.getObjectByName('night-a-south-sector'),undefined);
   if(++yields===20)abort.abort();
  }})),/cancelled/);
  assert.equal(yields,20);assert.deepEqual(h.installed(),[]);assert.ok(h.tiles.every((t,i)=>t.geometry===old[i]));
  const retry=await prepareA32SouthSectorInstaller(h.port,new AbortController().signal);let slices=0;
  const settled=await h.installAsync('A',(port,valid)=>retry.installAsync(port,{valid,budgetMs:2,yieldTask:async()=>{},onSlice:()=>{slices++;}}));
  assert.equal(settled.sector,'A');assert.ok(slices>10);assert.ok(h.package('A'));
  h.uninstall('A');assert.ok(h.tiles.every((t,i)=>t.geometry===old[i]));
 }finally{h.dispose();}
});
