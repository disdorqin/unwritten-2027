import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Group} from 'three';
import {mountMeteorCraterSurface} from '../tools/voxel-tavern/town-blockout/meteor-crater-surface';
import {mountUndergroundDomainHost,undergroundMineSpec} from '../tools/voxel-tavern/town-blockout/underground-domain-host';
import {createUndergroundMineLayout} from '../tools/voxel-tavern/town-blockout/underground-mine-layout';
import {resolveUndergroundCampPickaxeSite} from '../src/shared/underground-camp-pickaxe';
import type {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';

const liveAnchor={east:-120,north:185,rimHeight:10.7773,yaw:0}as const;
function actualSurfaceRoad():ReturnType<typeof mountWestCraterRoad>{
  const terrain=mountMeteorCraterSurface(liveAnchor);
  return {anchor:liveAnchor,heightAt:(e:number,n:number)=>terrain.heightAt(e,n)} as unknown as ReturnType<typeof mountWestCraterRoad>;
}

test('default-viewer early mine mount must NOT read TDZ x/n/ground before startup finishes',context=>{
  const mine=createUndergroundMineLayout(undergroundMineSpec);
  const site=resolveUndergroundCampPickaxeSite(mine,undergroundMineSpec.camp);
  assert.ok(site);
  let ready=false;
  let foot: {east:number;north:number;height:number}|undefined;
  let readCount=0;
  let notice=0;
  const result=mountUndergroundDomainHost({
    parent:new Group(),road:actualSurfaceRoad(),
    campBridge:{
      now:()=>5000,
      readWorldFoot(){
        readCount++;
        if(!ready)throw new ReferenceError("Cannot access 'x' before initialization");
        return foot;
      },
      sit:()=>true,stand:()=>true,onSeatedChange:()=>{},
      isAimingAt:()=>true,showPickupNotice:()=>{notice++},onRested:()=>{},
    },
  });
  assert.equal(result.kind,'ready');
  if(result.kind!=='ready')return;
  context.after(result.mounted.dispose);
  // viewer.ts invokes mounted.sync() synchronously near early boot, before
  // its top-level player-position bindings are initialized. No entry crash.
  assert.doesNotThrow(()=>result.mounted.sync());
  assert.equal(result.mounted.campPrompt(),undefined);
  ready=true;
  foot=result.mounted.toWorld(site.approach);
  assert.ok(foot);
  result.mounted.sync();
  assert.equal(result.mounted.campPrompt()?.id,'mine-camp-old-pickaxe');
  assert.equal(notice,0);
  assert.ok(readCount>=2,'boot and later gameplay both consult the same host');
});

test('C underground host only swallows exact known boot TDZ, never normal errors',context=>{
  let broke=false;
  const result=mountUndergroundDomainHost({
    parent:new Group(),road:actualSurfaceRoad(),
    campBridge:{
      now:()=>5000,
      readWorldFoot(){
        if(broke)throw new Error('Unexpected inventory host fault');
        return undefined;
      },
      sit:()=>true,stand:()=>true,onSeatedChange:()=>{},
      isAimingAt:()=>false,showPickupNotice:()=>{},onRested:()=>{},
    },
  });
  assert.equal(result.kind,'ready');
  if(result.kind!=='ready')return;
  context.after(result.mounted.dispose);
  broke=true;
  assert.throws(()=>result.mounted.sync(),/Unexpected inventory host fault/,
    'Unexpected real host failures must remain visible to integration');
});
