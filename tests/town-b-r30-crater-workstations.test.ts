import assert from 'node:assert/strict';
import test from 'node:test';
import {createTerrainGrid,worldBounds} from '../tools/voxel-tavern/town-blockout/terrain';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import {buildCraterRailExtension} from '../tools/voxel-tavern/town-blockout/town-crater-rail-extension';
import {Group} from 'three';
import {installCraterWorkshopWorld,surveyCraterWorkstations} from '../tools/voxel-tavern/town-blockout/town-b-r30-crater-workstations';

test('R30 recovers five physical tools on the live crater and rail, with an idempotent shared collider attachment',()=>{
  const grid=createTerrainGrid();
  const road=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n));
  const rail=buildCraterRailExtension(grid,road);
  const original=[...road.group.userData.colliders];
  const station=installCraterWorkshopWorld(road,rail);
  assert.equal(station.sites.length,5);
  assert.deepEqual(['星尘','废料','碎石'].map(label=>station.group.getObjectByName('b-r30-label-'+label)!.position.x),[-.61,0,.61]);
  assert.equal(station.group.getObjectByName('b-r30-scale-needle')!.position.y,.99);
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
  const oldGrip={...station.targets.find(t=>t.station==='bellows')!.point};
  station.show({bellowsStroke:.7,bellowsPressure:.64,gaugeNeedle:.6,calibrationAngles:[1,2,3],
    calibrationLocked:[true,false,true],sortingFill:[.2,.5,1],weighingNeedle:.7,turnout:'branch'});
  const newGrip=station.targets.find(t=>t.station==='bellows')!.point;
  assert.ok(Math.abs(newGrip.height-oldGrip.height)>.08);
  const b=station.sites.find(s=>s.id==='bellows')!,p=b.foot;
  const de=newGrip.east-p.east,dn=newGrip.north-p.north;
  assert.equal(station.aimControl(p,Math.atan2(de,dn),Math.atan2(newGrip.height-p.height-1.65,Math.hypot(de,dn)),1.65)?.station,'bellows');
  station.dispose();station.dispose();
  assert.deepEqual(road.group.userData.colliders,original);
  const s=rail.samples[0]!;
  assert.throws(()=>surveyCraterWorkstations(road,{...rail,sidingSamples:[
    {...s,east:b.center.east-2,north:b.center.north},
    {...s,east:b.center.east+2,north:b.center.north},
  ]}),/Occupied workshop pad: bellows/);
  const railGroup=new Group();
  railGroup.userData.colliders=[{min:[p.east-.1,p.height,-p.north-.1],max:[p.east+.1,p.height+1,-p.north+.1]}];
  assert.throws(()=>surveyCraterWorkstations(road,{...rail,group:railGroup}),/Occupied workshop pad: bellows/);
  assert.throws(()=>surveyCraterWorkstations(road,{...rail,stationWalkRoutes:[{id:'fixture-existing-walk',points:[
    {...b.center,east:b.center.east-3},{...b.center,east:b.center.east+3},
  ]}]}),/Workshop pad crosses an existing walk route: bellows/);
  const surveyed=surveyCraterWorkstations(road,{...rail,stationWalkRoutes:[{id:'fixture-above',points:[
    {...b.center,east:b.center.east-3,height:b.center.height+3},{...b.center,east:b.center.east+3,height:b.center.height+3},
  ]}]});
  assert.equal(surveyed.length,5);
});
