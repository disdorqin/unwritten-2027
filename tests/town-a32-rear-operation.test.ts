import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createTownD2R30ProductionHost} from '../tools/voxel-tavern/town-blockout/town-d2-r30-production-host';
import {createA32SouthSectorInstaller} from '../tools/voxel-tavern/town-blockout/town-a32-south-installer';
import {createWestSectorInstaller,createEastSectorInstaller} from '../tools/voxel-tavern/town-blockout/town-d2-r30-sector-installers';
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
  h.uninstallCable();assert.equal(paint?.geometry,original);
  assert.equal(h.group.getObjectByName('night-b-public-rear-cable'),undefined);
 }finally{h.dispose();}
});
