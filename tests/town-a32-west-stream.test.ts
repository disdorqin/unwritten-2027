import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createTownD2R30ProductionHost} from '../tools/voxel-tavern/town-blockout/town-d2-r30-production-host';
import {createA32SouthSectorInstaller} from '../tools/voxel-tavern/town-blockout/town-a32-south-installer';
import {createWestSectorInstaller,installWestSectorAsync} from '../tools/voxel-tavern/town-blockout/town-d2-r30-sector-installers';
test('west staged generation aborts without touching the mounted A terrain; retry equals synchronous west',async()=>{
 const h=createTownD2R30ProductionHost({deferDetails:true});
 try{
  h.install('A',createA32SouthSectorInstaller());
  const old=h.tiles.map(t=>t.geometry),abort=new AbortController();
  let yields=0;
  await assert.rejects(h.installAsync('B',(port,valid)=>installWestSectorAsync(port,{valid,signal:abort.signal,budgetMs:.1,yieldTask:async()=>{
   assert.deepEqual(h.installed(),['A']);assert.ok(h.tiles.every((t,i)=>t.geometry===old[i]));
   assert.equal(h.group.getObjectByName('night-b-west-sector'),undefined);
   if(++yields===15)abort.abort();
  }})),/cancelled/);
  assert.equal(yields,15);assert.ok(h.tiles.every((t,i)=>t.geometry===old[i]));
  assert.deepEqual(h.installed(),['A']);
  h.install('B',createWestSectorInstaller());
  const changed=h.tiles.map((t,i)=>t.geometry===old[i]?undefined:{position:Array.from(t.geometry.getAttribute('position').array),color:Array.from(t.geometry.getAttribute('color').array),indices:Array.from(t.geometry.index!.array)});
  assert.ok(changed.some(Boolean));
  h.uninstall('B');assert.ok(h.tiles.every((t,i)=>t.geometry===old[i]));
  let slices=0;
  await h.installAsync('B',(port,valid)=>installWestSectorAsync(port,{valid,budgetMs:2,yieldTask:async()=>{
   assert.ok(h.tiles.every((t,i)=>t.geometry===old[i]));
   assert.equal(h.group.getObjectByName('night-b-west-sector'),undefined);
  },onSlice:()=>slices++}));
  assert.ok(slices>5);assert.deepEqual(h.installed(),['A','B']);
  for(let i=0;i<h.tiles.length;i++){
   const g=h.tiles[i]!.geometry,c=changed[i];
   if(!c){assert.equal(g,old[i]);continue;}
   assert.deepEqual(Array.from(g.getAttribute('position').array),c.position);
   assert.deepEqual(Array.from(g.getAttribute('color').array),c.color);
   assert.deepEqual(Array.from(g.index!.array),c.indices);
  }
  h.uninstall('B');assert.ok(h.tiles.every((t,i)=>t.geometry===old[i]));
 }finally{h.dispose();}
});
