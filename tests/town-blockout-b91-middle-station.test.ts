import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Group} from 'three';
import {mountNorthRidgeMiddleStation,middleStationFoot,middleStationWaitingPoints} from '../tools/voxel-tavern/town-blockout/north-ridge-middle-station';
import {createZa22CloudRoute,createZa22NorthRidgeLine,cloudTerminal,za22StationApproach} from '../tools/voxel-tavern/town-blockout/town-za22-cloud-route';

test('B91 middle station has real deck, clear waiting positions and gated boarding/exit on the shared clock',()=>{
  const station=mountNorthRidgeMiddleStation(new Group());
  try{
    for(const p of [middleStationFoot,middleStationWaitingPoints.up,middleStationWaitingPoints.down]){
      assert.equal(station.surfaceAt(p.east,p.north),140);
      assert.equal(station.blocked(p.east,p.north,140,.27),false);
    }
  }finally{station.dispose()}
  const line=createZa22NorthRidgeLine(26);
  const epoch=Date.UTC(2026,0,1);
  let now=epoch,ready=false;
  const transfers:{terminal:string;at:{east:number;north:number;height:number}}[]=[];
  const route=createZa22CloudRoute({
    now:()=>now,middleStationReady:()=>ready,
    enterOrExit(terminal,at){transfers.push({terminal,at})},view(){},
  });
  assert.equal(route.action(middleStationWaitingPoints.up),undefined);
  ready=true;
  route.action(za22StationApproach)?.run();
  route.update(za22StationApproach);
  assert.ok(route.riding());
  assert.ok(route.requestMiddleExit());
  now=epoch+8000+line.lowerMetres*200+100;
  route.update(za22StationApproach);
  assert.equal(route.riding(),false);
  assert.deepEqual(transfers.at(-1),{terminal:'base',at:middleStationFoot});
  route.action(middleStationWaitingPoints.up)?.run();
  route.update(middleStationWaitingPoints.up);
  assert.ok(route.riding());
  now=epoch+line.legMs;
  route.update(middleStationWaitingPoints.up);
  assert.deepEqual(transfers.at(-1),{terminal:'summit',at:cloudTerminal});
  route.action(cloudTerminal)?.run();
  route.update(cloudTerminal);
  now+=line.legMs;
  route.update(cloudTerminal);
  assert.deepEqual(transfers.at(-1),{terminal:'base',at:za22StationApproach});
});
