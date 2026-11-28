import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createTownD2R30ProductionHost} from '../tools/voxel-tavern/town-blockout/town-d2-r30-production-host';
import {createA32SouthSectorInstaller} from '../tools/voxel-tavern/town-blockout/town-a32-south-installer';
import {surveyA32SouthRoad} from '../tools/voxel-tavern/town-blockout/town-a32-south-road';
test('A32 replacement mounts on the real D2 canonical faces without a second terrain and has supported centreline',()=>{
 const host=createTownD2R30ProductionHost();
 try{
  const survey=surveyA32SouthRoad(host.trail,host.surfaceAt);
  assert.equal(survey.originalFirst,1765);assert.equal(survey.originalLast,2262);
  assert.ok(survey.grade.length>528&&survey.grade.length<530);
  assert.ok(survey.grade.maxGrade<.12);
  const original=host.tiles.map(t=>t.geometry);
  const settlement=host.install('A',createA32SouthSectorInstaller());
  assert.ok(settlement.insideSector&&settlement.cutTiles>6);
  const body=host.group.getObjectByName('night-a-south-sector')!;
  assert.equal(body.userData.a32Road.connected,false);
  for(const p of survey.grade.profile){
   const h=host.supportAt(p.east,p.north,.27);
   assert.ok(h!==undefined&&Math.abs(h-p.height-.055)<.001);
   assert.equal(host.blocked(p.east,p.north,h,.27,1.8),false);
  }
  host.uninstall('A');
  assert.ok(host.tiles.every((t,i)=>t.geometry===original[i]));
 }finally{host.dispose();}
});
