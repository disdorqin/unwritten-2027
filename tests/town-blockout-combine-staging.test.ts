import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Group} from 'three';
import {createStarportAssembly,starportAssemblyParts,type StarportAssemblyState} from '../src/shared/starport-assembly';
import {createCombineFlags} from '../src/shared/town-combine-flags';
import {createOrdinaryTownNightSchedule,createTownNightWindow,townDayMs} from '../src/shared/town-night-window';
import {mountStarportAssemblySite} from '../tools/voxel-tavern/town-blockout/starport-assembly-site';
import {createCombineStagingControls,type CombineStagingFacts,type CombineStagingRequest} from '../tools/voxel-tavern/town-blockout/town-combine-staging';

function fixture(){
  const anchor={east:324,north:657,height:347};
  const rack=mountStarportAssemblySite(new Group(),anchor);
  const scheduleAt=createOrdinaryTownNightSchedule({dawnEpoch:0,beaconOffsetsAfterDusk:Array(12).fill(60_000),cueFreshnessMs:2_000});
  let now=0,keyOne=false,available=true;
  let feet={...anchor};
  let profile:StarportAssemblyState={revision:0,carried:[...starportAssemblyParts],installed:[],ignited:false};
  const window=createTownNightWindow({now:()=>now,scheduleAt});
  const flags=createCombineFlags({scheduleAt,hasStoryKey:()=>keyOne});
  const requests:CombineStagingRequest[]=[];
  const assembly=createStarportAssembly(rack.site,{
    read:id=>id==='pilot'?profile:undefined,
    pose:id=>id==='pilot'?feet:undefined,
    readIgnition:()=>({keyOne,layersOverlap:window.snapshot().layersOverlap}),
    commit(id,revision,next,guard){
      if(id!=='pilot'||revision!==profile.revision||!guard())return false;
      profile=next;return true;
    },
  });
  const facts=():CombineStagingFacts|undefined=>available?{assembly:profile,flags:flags.snapshot(now),night:window.snapshot(),keyOne}:undefined;
  const controls=createCombineStagingControls(rack,{
    facts,pose:()=>feet,
    async request(req){
      requests.push(req);
      if(req.expectedRevision!==profile.revision)return {accepted:false};
      if(req.kind==='place'){
        const result=await assembly.place('pilot',req.part);
        if(result.kind==='placed'&&profile.installed.length===3)flags.assemblyCompleted();
        return {accepted:result.kind==='placed'};
      }
      // Fixture only: the real server owns the transaction and later
      // orbit gate. This test does not authorize a production transition.
      if(!window.snapshot().layersOverlap||!keyOne||req.beaconAt!==window.snapshot().beaconAt)
        return {accepted:false};
      if(req.mode==='daily')return {accepted:flags.ignite(now)};
      const result=await assembly.ignite('pilot');
      return {accepted:result.kind==='ignited'&&flags.ignite(now)};
    },
  });
  function face(target:keyof typeof rack.targets,behind=false):[number,number,number]{
    const p=rack.targets[target];
    feet={east:p.east,north:p.north+(behind?1.4:-1.4),height:anchor.height};
    const eye=1.65,dx=p.east-feet.east,dn=p.north-feet.north;
    return [Math.atan2(dx,dn),Math.atan2(p.height-feet.height-eye,Math.hypot(dx,dn)),eye];
  }
  return {rack,controls,requests,face,flags,facts,
    setKey(v:boolean){keyOne=v},setAvailable(v:boolean){available=v},
    setTime(v:number){now=v},
    openNight(day:number){now=scheduleAt(day*townDayMs)!.beaconAt;assert.ok(window.recordBeacon(now));return now},
  };
}

test('batch 91: the existing rack exposes three different native physical actions; no forging or ownership is invented',async t=>{
  const f=fixture();t.after(()=>f.rack.dispose());
  assert.equal(f.controls.action(...f.face('snow-wing')),undefined);
  assert.equal((await f.controls.interact(...f.face('snow-wing'))).accepted,false);
  assert.equal(f.requests.length,0);
  f.flags.forgeCompleted();
  assert.equal(f.controls.presentation().carryProcession,true);
  assert.equal(f.controls.action(...f.face('snow-wing',true)),undefined);
  const names=[];
  for(const part of starportAssemblyParts){
    const aim=f.face(part);
    names.push(f.controls.action(...aim)?.label);
    assert.equal((await f.controls.interact(...aim)).accepted,true);
    assert.equal(f.controls.action(...aim),undefined);
  }
  assert.deepEqual(names,['推正雪翼，入卡槽','搭手抬助推器，上挂架','将导航芯嵌入船徽凹位']);
  assert.equal(f.requests.length,3);
  assert.equal(f.controls.presentation().carryProcession,false);
  assert.equal(f.controls.presentation().crowdAtApron,true);
  assert.equal(f.controls.presentation().aircraftAssembled,true);
});
test('batch 91: ignition requires committed shared beacon and key; daily reopening never replays first procession',async t=>{
  const f=fixture();t.after(()=>f.rack.dispose());
  f.flags.forgeCompleted();
  for(const part of starportAssemblyParts)assert.equal((await f.controls.interact(...f.face(part))).accepted,true);
  const aim=f.face('ignition');
  assert.equal(f.controls.action(...aim),undefined);
  const beacon=f.openNight(0);
  assert.equal(f.controls.action(...aim),undefined);
  f.setKey(true);
  f.setTime(beacon+60_000);
  assert.equal((await f.controls.interact(...aim)).accepted,false);
  const next=f.openNight(1);
  assert.deepEqual(f.controls.action(...aim),{kind:'ignite',mode:'first',label:'启动点火'});
  assert.equal((await f.controls.interact(...aim)).accepted,true);
  assert.equal(f.controls.presentation().mode,'daily');
  assert.equal(f.controls.presentation().crowdAtApron,false);
  assert.equal(f.controls.presentation().carryProcession,false);
  f.setTime(next+60_000);
  assert.equal(f.controls.action(...aim),undefined);
  f.openNight(2);
  assert.deepEqual(f.controls.action(...aim),{kind:'ignite',mode:'daily',label:'启动点火'});
  assert.equal((await f.controls.interact(...aim)).accepted,true);
  f.setAvailable(false);
  assert.equal((await f.controls.interact(...aim)).accepted,false);
});
test('batch 91: duplicate in-flight presses submit only one placement request',async t=>{
  const f=fixture();t.after(()=>f.rack.dispose());
  f.flags.forgeCompleted();
  const aim=f.face('snow-wing');
  const [a,b]=await Promise.all([f.controls.interact(...aim),f.controls.interact(...aim)]);
  assert.equal(a.accepted,true);
  assert.deepEqual(b,{accepted:false,reason:'pending'});
  assert.equal(f.requests.length,1);
});
