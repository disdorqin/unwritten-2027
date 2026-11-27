import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Raycaster,Vector3} from 'three';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road.js';
import {mountUndergroundDomainHost} from '../tools/voxel-tavern/town-blockout/underground-domain-host.js';
import {createUndergroundWaterState} from '../src/presence/underground-water-state.js';
import {townDayMs} from '../src/shared/town-night-window.js';
test('water readout consumes the original overlay, pump offset and dawn without a second clock or collider for water',()=>{
 let now=0,accepted=true;
 const water=createUndergroundWaterState({dawnEpoch:0,now:()=>now}),parent=new Group();
 const h=mountUndergroundDomainHost({parent,road:mountWestCraterRoad(260,()=>10.7773),
  waterBridge:{readWaterSnapshot:()=>accepted?water.tonight():undefined}});
 assert.equal(h.kind,'ready');if(h.kind!=='ready'||!h.waterReadout)assert.fail();
 try{
  const r=h.waterReadout,overlay=h.mounted.waterOverlay!;
  assert.equal(r.boards.length,3);assert.equal(r.baseline,-91);assert.ok(r.face&&r.pointer);
  const world=(x:number,z:number)=>h.mounted.toWorld([x,-91,z])!;
  const check=(level:'low'|'mid'|'high',phase:'rise'|'level'|'fall',rise:number,visible:boolean)=>{
   h.mounted.sync();assert.deepEqual(r.state(),{level,phase,visualRise:rise,configured:true});
   assert.equal(overlay.stats().level,level);assert.equal(r.pointer!.visible,visible);
   if(visible){assert.equal(r.pointer!.position.y,rise);parent.updateMatrixWorld(true);assert.ok(Math.abs(r.pointer!.getWorldPosition(new Vector3()).y-(-91+rise))<1e-6)}
   // Existing passage stays usable. Gauge does not create an independent
   // flooded movement contract; high-rise physical wading is still external.
   const p=world(5.8,r.face!.z);assert.ok(h.passageAt(p.east,p.north));
  };
  check('high','rise',1,true);water.shiftPump(-1);check('mid','rise',0,true);
  water.shiftPump(-1);check('low','rise',0,false);
  now=townDayMs;check('mid','level',0,true);now=2*townDayMs;check('low','fall',0,false);
  water.shiftPump(1);check('mid','fall',0,true);water.shiftPump(1);check('high','fall',1,true);
  const blocked=world(7.06,r.face.z);assert.equal(h.passageAt(blocked.east,blocked.north),undefined);
  accepted=false;h.mounted.sync();assert.equal(r.state().configured,false);assert.equal(r.pointer.visible,false);
  assert.equal(overlay.stats().configuration,'unconfigured');
 }finally{h.mounted.dispose()}
 assert.equal(parent.children.length,0);
});
