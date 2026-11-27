import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nightBCableDispatch} from '../tools/voxel-tavern/town-blockout/town-night-b-summit-dispatch';
import {createMainSummitCable} from '../tools/voxel-tavern/town-blockout/main-summit-cable';
import {createNorthRidgeCableClock} from '../tools/voxel-tavern/town-blockout/north-ridge-cable-clock';
import {townDayMs,townDaylightMs} from '../src/shared/town-night-window';
const epoch=Date.UTC(2026,0,1);
test('late repairs, reconnects and dusk dispatch preserve exact terminal poses on both measured clocks',()=>{
 const line1=createNorthRidgeCableClock(240.031,286.053,0,10000),line2=createMainSummitCable(0,10000,347);
 for(const line of [{leg:line1.oneWayMs,cabinsAt:line1.cabinsAt},{leg:line2.legMs,cabinsAt:line2.cabinsAt}]){
  const open=epoch+5000,legs=Math.floor((townDaylightMs-5000)/line.leg),t=epoch+5000+line.leg*legs;
  assert.equal(nightBCableDispatch(open-1,open,epoch,line.leg)?.boarding,false);
  assert.equal(nightBCableDispatch(open,open,epoch,line.leg)?.virtualMs,0);
  const parked=nightBCableDispatch(t+1,open,epoch,line.leg)!;assert.ok(parked.parked);assert.ok(!parked.boarding);
  assert.ok(line.cabinsAt(parked.virtualMs).every(c=>c.station!==null));
  for(const n of [epoch+townDaylightMs,epoch+townDayMs-1])assert.deepEqual(nightBCableDispatch(n,open,epoch,line.leg),parked);
  const dawn=nightBCableDispatch(epoch+townDayMs,open,epoch,line.leg)!;
  assert.equal(dawn.virtualMs,parked.virtualMs);assert.ok(dawn.boarding);
  const long=nightBCableDispatch(epoch+townDayMs*101+1234,open,epoch,line.leg);assert.deepEqual(long,nightBCableDispatch(epoch+townDayMs*101+1234,open,epoch,line.leg));
  const tooLate=epoch+townDaylightMs-1000;
  assert.deepEqual(nightBCableDispatch(tooLate,tooLate,epoch,line.leg),{virtualMs:0,boarding:false,parked:true});
  assert.deepEqual(nightBCableDispatch(epoch+townDayMs,tooLate,epoch,line.leg),{virtualMs:0,boarding:true,parked:false});
  assert.equal(nightBCableDispatch(epoch+1,undefined,epoch,line.leg),undefined);
 }
});
