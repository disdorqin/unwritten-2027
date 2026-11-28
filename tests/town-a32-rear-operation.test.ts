import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createTownD2R30ProductionHost} from '../tools/voxel-tavern/town-blockout/town-d2-r30-production-host';
import {createA32SouthSectorInstaller} from '../tools/voxel-tavern/town-blockout/town-a32-south-installer';
import {createWestSectorInstaller,createEastSectorInstaller} from '../tools/voxel-tavern/town-blockout/town-d2-r30-sector-installers';
import {resolveTownSledRacks} from '../tools/voxel-tavern/town-blockout/town-sled-racks';
import {certifyHiking,hikingWaypoints} from '../tools/voxel-tavern/town-blockout/town-a32-summit-hiking';
import {retireA31LegacySectorOverlays} from '../tools/voxel-tavern/town-blockout/town-a31-summit-visual-ownership';
test('rear actual four-sector host consumes full B async operation and restores paint on uninstall',async()=>{
 const h=createTownD2R30ProductionHost({includeRopeway:false,deferDetails:true});
 try{
  for(const name of h.pendingDetails())h.mountDetails(name);
  h.install('A',createA32SouthSectorInstaller());h.install('B',createWestSectorInstaller());h.install('C2',createEastSectorInstaller());
  retireA31LegacySectorOverlays(h.group);
  assert.equal(h.group.getObjectByName('main-summit-machine-room'),undefined);
  const paint=h.group.getObjectByName('main-summit-paint') as import('three').Mesh|undefined,original=paint?.geometry;
  let slices=0;
  const result=await h.preparePublicCable({state:()=>undefined,now:()=>undefined,daylight:()=>undefined,firstRun:{wokeAt:()=>undefined,openedAt:()=>undefined,dawnEpoch:()=>undefined}},{yieldTask:async()=>{},onSlice:()=>{slices++;}});
  assert.ok(result.boardable,JSON.stringify(result));assert.ok(slices>1);
  assert.equal(h.group.getObjectByName('night-b-public-rear-cable')?.parent,h.group);
  assert.ok(h.cableOperation?.ready);
  const hike=certifyHiking(h,hikingWaypoints);assert.ok(hike.ready,JSON.stringify(hike));
  assert.ok(hike.metres>1100&&hike.samples>4400&&hike.maxGrade<=.70);assert.equal(hike.path.at(-1)?.height,800);
  assert.ok(certifyHiking(h,[...hikingWaypoints].reverse()).ready);
  const racks=resolveTownSledRacks('summit',(e,n)=>{const y=h.supportAt(e-300,n-676,.36);return y!==undefined&&!h.blocked(e-300,n-676,y,.36,1.8)?y:undefined;},undefined,true);
  assert.deepEqual(racks.map(r=>r.id),['rear-arrival','rear-summit']);
  assert.ok(racks[0]!.n>=668&&Math.abs(racks[0]!.y-347)<.01&&racks[1]!.y>799);
  h.uninstallCable();assert.equal(paint?.geometry,original);
  assert.equal(h.group.getObjectByName('night-b-public-rear-cable'),undefined);
 }finally{h.dispose();}
});
