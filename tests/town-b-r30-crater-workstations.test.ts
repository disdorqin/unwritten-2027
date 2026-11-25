import assert from 'node:assert/strict';
import test from 'node:test';
import {createTerrainGrid,worldBounds} from '../tools/voxel-tavern/town-blockout/terrain';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import {buildCraterRailExtension} from '../tools/voxel-tavern/town-blockout/town-crater-rail-extension';
import {installCraterWorkshopWorld} from '../tools/voxel-tavern/town-blockout/town-b-r30-crater-workstations';

test('R30 recovers five physical tools on the live crater and rail, with an idempotent shared collider attachment',()=>{
  const grid=createTerrainGrid();
  const road=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n));
  const rail=buildCraterRailExtension(grid,road);
  const original=[...road.group.userData.colliders];
  const station=installCraterWorkshopWorld(road,rail);
  assert.equal(station.sites.length,5);
  assert.equal(installCraterWorkshopWorld(road,rail),station);
  assert.equal(road.group.userData.colliders.length,original.length+5);
  for(const site of station.sites){
    assert.ok(site.railClearance>=1.65&&site.bodyClearance>=.55);
    const de=site.target.east-site.foot.east,dn=site.target.north-site.foot.north;
    const yaw=Math.atan2(de,dn);
    const pitch=Math.atan2(site.target.height-site.foot.height-1.65,Math.hypot(de,dn));
    assert.equal(station.aim(site.foot,yaw,pitch,1.65),site.id);
    assert.equal(station.aim(site.foot,yaw+Math.PI,pitch,1.65),null);
  }
  station.show({bellowsStroke:.7,bellowsPressure:.64,gaugeNeedle:.6,calibrationAngles:[1,2,3],
    calibrationLocked:[true,false,true],sortingFill:[.2,.5,1],weighingNeedle:.7,turnout:'branch'});
  station.dispose();station.dispose();
  assert.deepEqual(road.group.userData.colliders,original);
});
