import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Group,Scene} from 'three';
import {createTerrainGrid,worldBounds} from '../tools/voxel-tavern/town-blockout/terrain';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import {createTownRailway} from '../tools/voxel-tavern/town-blockout/town-railway';
import {buildCraterRailExtension} from '../tools/voxel-tavern/town-blockout/town-crater-rail-extension';
import {mountProductionRidge} from '../tools/voxel-tavern/town-blockout/town-d-r30-production-ridge';
import {buildRailwayStation} from '../tools/voxel-tavern/town-blockout/landmark-station';
import {createA31PublicSummitRoute} from '../tools/voxel-tavern/town-blockout/town-a31-public-summit';
test('real C2 gate at E300 only opens after same-foot rear and continuous front path certify, and returns',async()=>{
 const grid=createTerrainGrid(),town=new Scene(),rail=createTownRailway(grid,()=>0),west=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n)),branch=buildCraterRailExtension(grid,west,rail.route.points);
 const hall=buildRailwayStation();hall.position.set(526,26,-329);town.add(rail.group,branch.group,hall);
 const ridge=mountProductionRidge(town,grid,{loop:rail.route.points,branch:branch.samples,rearConnectorCandidate:true});
 const rear=createA31PublicSummitRoute({town,skyline:new Group(),now:()=>0,yieldFrame:async()=>{},cableAuthority:{state:()=>undefined,now:()=>undefined,daylight:()=>undefined,firstRun:{wokeAt:()=>undefined,openedAt:()=>undefined,dawnEpoch:()=>undefined}}});
 try{
  assert.equal(ridge.cloudSeam.domainReady,false);
  assert.equal(ridge.blocked(300,663.25,347),true);
  assert.equal(ridge.certifyPublicSeam(()=>undefined),false);
  assert.equal(ridge.blocked(300,663.25,347),true);
  assert.ok(await rear.prepare());assert.ok(rear.seamReady(),JSON.stringify(rear.seamCertificate()));
  const h=(e:number,n:number)=>{const y=rear.surveyedSupport(e,n);return y!==undefined&&!rear.surveyedBlocked(e,n,y)?y:undefined;};
  assert.equal(await ridge.preparePublicFrontCable({state:()=>undefined,now:()=>undefined,daylight:()=>undefined,firstRun:{wokeAt:()=>undefined,openedAt:()=>undefined,dawnEpoch:()=>undefined}},[rail.group,branch.group,hall],{yieldTask:async()=>{}}),true);
  assert.equal(ridge.certifyPublicSeam(h),true,JSON.stringify(ridge.cloudSeam));assert.equal(ridge.cloudSeam.domainReady,true);
  assert.equal(ridge.blocked(300,663.25,347),false);
  assert.equal(ridge.blocked(296.2,663.25,347),true);
  assert.ok(town.getObjectByName('cloud-deck-registration-monument'));
  assert.equal(ridge.blocked(306,659,347),false);
  assert.ok(rear.enterAt({east:300,north:668,height:347},()=>true));
  assert.ok(rear.leaveAt({east:300,north:667.9,height:347},()=>true));
 }finally{rear.dispose();ridge.dispose();}
});
