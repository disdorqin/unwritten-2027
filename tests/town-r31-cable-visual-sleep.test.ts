import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createNightBProductionController} from '../tools/voxel-tavern/town-blockout/town-night-b-production-controller';

test('hidden rear cable skips visual sync, wakes immediately, and never suspends shared authority',()=>{
 let visible=false,updates=0,reads=0,clock=100;
 const input={
  presence:{getCableLineState(){reads++;return undefined;},cableServerNow:()=>clock,setActivityPose(){},sampleCableRide(){},sendCableRepair(){return false;},sendSummitCableRelease(){return false;}},
  upper:{ready:true,workshop:{},service:{physical:false},update(){updates++;assert.equal(clock,200);}},
  upperOrigin:{east:300,north:676},domain:()=>visible?'summit':'town',acceptLanding:()=>false,upperVisible:()=>visible
 } as unknown as Parameters<typeof createNightBProductionController>[0];
 const controller=createNightBProductionController(input);
 for(let i=0;i<120;i++)controller.tick(0);
 assert.equal(updates,0);
 assert.equal(reads,120);
 visible=true;clock=200;
 controller.tick(0);assert.equal(updates,1);
 visible=false;
 controller.tick(0);assert.equal(updates,1);
 assert.equal(reads,122);
});
