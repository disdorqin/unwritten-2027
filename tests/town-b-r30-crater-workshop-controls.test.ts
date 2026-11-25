import assert from 'node:assert/strict';
import test from 'node:test';
import {createTerrainGrid,worldBounds} from '../tools/voxel-tavern/town-blockout/terrain';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import {buildCraterRailExtension} from '../tools/voxel-tavern/town-blockout/town-crater-rail-extension';
import {installCraterWorkshopWorld} from '../tools/voxel-tavern/town-blockout/town-b-r30-crater-workstations';
import {createBR30WorkshopControls,projectBR30Workshop,type BR30WorkshopFacts,type BR30WorkshopIntent} from '../tools/voxel-tavern/town-blockout/town-b-r30-crater-workshop-controls';
import {createBellows,createCalibration,createSorting,createScale,createTrackSwitch} from '../tools/voxel-tavern/town-blockout/town-crater-surface-play';

test('R30 physical subtargets forward existing rule actions without fabricating a held item',async()=>{
  const grid=createTerrainGrid(),road=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n));
  const station=installCraterWorkshopWorld(road,buildCraterRailExtension(grid,road));
  const bellows=createBellows(),calibration=createCalibration(7),sorting=createSorting(),scale=createScale(),track=createTrackSwitch();
  let pose:Parameters<typeof station.aimControl>[0]&{heading:number;pitch:number;eyeHeight:number}|undefined;
  let kg=0,held=false;
  const sent:BR30WorkshopIntent[]=[];
  const facts=():BR30WorkshopFacts=>({dayIndex:7,bellows:{...bellows.state(),stroke:0},
    calibration:{angles:calibration.angles() as [number,number,number],locked:calibration.locked() as [boolean,boolean,boolean]},
    sorting:sorting.state(),scale:{kg},track:{thrown:track.thrown()}});
  // Fixture uses the real existing rule leaves. Production dispatcher is A's.
  const controls=createBR30WorkshopControls(station,{pose:()=>pose,facts,async request(intent){
    sent.push(intent);
    switch(intent.kind){
      case 'pump-bellows':bellows.pump();break;
      case 'turn-dial':calibration.turn(intent.index,intent.direction*.08);break;
      case 'sort-carried-lump':if(!held)return {accepted:false};sorting.place('stardust',intent.bin);break;
      case 'weigh-carried-lump':if(!held)return {accepted:false};kg=scale.weigh(123).kg;break;
      case 'pull-track-switch':track.pull();break;
    }
    return {accepted:true};
  }});
  const aim=(id:string,index?:number)=>{
    const target=station.targets.find(t=>t.station===id&&t.index===index)!;
    const foot=station.sites.find(s=>s.id===id)!.foot;
    const de=target.point.east-foot.east,dn=target.point.north-foot.north;
    pose={...foot,heading:Math.atan2(de,dn),pitch:Math.atan2(target.point.height-foot.height-1.65,Math.hypot(de,dn)),eyeHeight:1.65};
    const hit=station.aimControl(pose,pose.heading,pose.pitch,pose.eyeHeight);
    assert.equal(hit?.station,id);assert.equal(hit?.index,index);
  };
  assert.equal((await controls.interact()).accepted,false);
  aim('bellows');assert.equal((await controls.interact()).accepted,true);
  assert.ok(bellows.state().pressure>.3);
  for(const i of [0,1,2]){aim('calibration',i);assert.equal((await controls.interact(-1)).accepted,true);}
  assert.deepEqual(calibration.angles(),[-.08,-.08,-.08]);
  for(const i of [0,1,2]){aim('sorting',i);assert.equal((await controls.interact()).accepted,false);}
  held=true;aim('sorting',0);assert.equal((await controls.interact()).accepted,true);
  assert.equal(sorting.state().bins.stardust,1);
  aim('weighing');assert.equal((await controls.interact()).accepted,true);assert.ok(kg>=2);
  const beforeGrip={...station.targets.find(t=>t.station==='turnout')!.point};
  aim('turnout');assert.equal((await controls.interact()).accepted,true);assert.equal(track.nextTrainRoute(),'siding');
  const afterGrip=station.targets.find(t=>t.station==='turnout')!.point;
  assert.ok(Math.hypot(afterGrip.east-beforeGrip.east,afterGrip.north-beforeGrip.north)>.5);
  assert.equal(projectBR30Workshop(facts()).turnout,'branch');
  aim('turnout');assert.equal((await controls.interact()).accepted,true);assert.equal(track.nextTrainRoute(),'main');
  const heldProjection=projectBR30Workshop({...facts(),bellows:{pressure:.65,heldMs:6000,inBand:true,cast:false,stroke:.2}});
  assert.equal(heldProjection.bellowsHeld,.6);assert.equal(heldProjection.bellowsInBand,true);
  assert.equal(projectBR30Workshop(facts()).sortingFill[0],1/6);
  assert.ok(sent.every(a=>!('lumpId' in a)));
  station.dispose();
});
