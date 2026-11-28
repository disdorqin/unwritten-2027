import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Group} from 'three';
import {createCableLineAuthority} from '../src/presence/cable-line-authority';
import {summitReleaseApproaches,toSummitPresencePose,isSummitCableReleaseRecord} from '../src/shared/za22-summit-presence-domain';
import {authorizeRearCableRepair} from '../src/shared/za22-summit-repair-position';
import {townDayMs,townDaylightMs} from '../src/shared/town-night-window';
import {createTerrainGrid,worldBounds} from '../tools/voxel-tavern/town-blockout/terrain';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import {createTownRailway} from '../tools/voxel-tavern/town-blockout/town-railway';
import {buildCraterRailExtension} from '../tools/voxel-tavern/town-blockout/town-crater-rail-extension';
import {mountProductionRidge} from '../tools/voxel-tavern/town-blockout/town-d-r30-production-ridge';
import {buildRailwayStation} from '../tools/voxel-tavern/town-blockout/landmark-station';
import {createTownD2R30ProductionHost} from '../tools/voxel-tavern/town-blockout/town-d2-r30-production-host';
import {createA32SouthSectorInstaller} from '../tools/voxel-tavern/town-blockout/town-a32-south-installer';
import {createWestSectorInstaller,createEastSectorInstaller} from '../tools/voxel-tavern/town-blockout/town-d2-r30-sector-installers';
import {retireA31LegacySectorOverlays} from '../tools/voxel-tavern/town-blockout/town-a31-summit-visual-ownership';
import {readA31FrontCable,readA31UpperCable} from '../tools/voxel-tavern/town-blockout/town-a31-cable-binding';
import {createNightBProductionController} from '../tools/voxel-tavern/town-blockout/town-night-b-production-controller';
import type {CableRideFrame} from '../tools/voxel-tavern/town-blockout/town-night-b-summit-ride-host';
import type {Za36CableRepairEvent} from '../src/shared/za36-cable-repair';
type Foot={east:number;north:number;height:number};
/** Deterministic actual-owner integration, NOT a browser walk. The test
 * supplies verified fixture feet and advances the authority clock; the
 * installed controllers, car motion, repairs and gate are production code. */
test('mounted both lines complete real controller repair, round trips, release and gate handoff', {timeout:120000},async()=>{
 const dawn=1795850000000;let now=dawn+1000,inputNow=0,room:'town'|'summit'='town',foot:Foot={east:526,north:329,height:26};
 const authority=createCableLineAuthority(()=>now),actor={};
 const grid=createTerrainGrid(),root=new Group(),west=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n)),rail=createTownRailway(grid,()=>now),branch=buildCraterRailExtension(grid,west,rail.route.points),hall=buildRailwayStation();
 hall.position.set(526,26,-329);root.add(rail.group,branch.group,hall);
 const front=mountProductionRidge(root,grid,{loop:rail.route.points,branch:branch.samples,rearConnectorCandidate:true});
 const rear=createTownD2R30ProductionHost({includeRopeway:false,deferDetails:true});
 const port=(line:1|2)=>({state:()=>authority.snapshotFor(line,actor),now:()=>now,daylight:()=>((now-dawn)%townDayMs)<townDaylightMs,firstRun:{wokeAt:()=>authority.hello(line).wokeAt??undefined,openedAt:()=>authority.hello(line).openedAt??undefined,dawnEpoch:()=>dawn}});
 try{
  for(const name of rear.pendingDetails())rear.mountDetails(name);
  rear.install('A',createA32SouthSectorInstaller());rear.install('B',createWestSectorInstaller());rear.install('C2',createEastSectorInstaller());retireA31LegacySectorOverlays(rear.group);
  assert.ok(await front.preparePublicFrontCable(port(1),[rail.group,branch.group,hall],{yieldTask:async()=>{}}));
  assert.ok((await rear.preparePublicCable(port(2),{yieldTask:async()=>{}})).boardable);
  const bindings=readA31FrontCable(front),upper=readA31UpperCable(rear);
  assert.ok(bindings.front&&bindings.frontRepair&&upper);
  const world=(p:Foot)=>({...p,east:p.east+300,north:p.north+676});
  const rearSupport=(e:number,n:number)=>{const h=rear.supportAt(e-300,n-676);return h!==undefined&&!rear.blocked(e-300,n-676,h)?h:undefined;};
  assert.ok(front.certifyPublicSeam(rearSupport));
  const record=()=>{const p=toSummitPresencePose(foot);assert.ok(p);return {east:Math.round(p.east*100),north:Math.round(p.north*100),height:Math.round(p.height*100)};};
  let frame:CableRideFrame|undefined;
  const controller=createNightBProductionController({...bindings,upper,upperOrigin:{east:300,north:676},domain:()=>room,inputNow:()=>inputNow,
   acceptLanding:(line,f)=>line===1?bindings.frontRepair!.clear(f)&&!front.blocked(f.east,f.north,f.height):Math.abs((rearSupport(f.east,f.north)??Infinity)-f.height)<=.08,
   presence:{
    getCableLineState:line=>authority.snapshotFor(line,actor),cableServerNow:()=>now,getTownNightWindow:()=>({phase:((now-dawn)%townDayMs)<townDaylightMs?'day':'night-window'} as never),
    getCableLineWokeAt:line=>authority.hello(line).wokeAt??undefined,getCableLineOpenedAt:line=>authority.hello(line).openedAt??undefined,getTownWeatherDawnEpoch:()=>dawn,
    sampleCableRide:f=>{frame=f;return true;},setActivityPose:()=>{},
    sendSummitCableRelease:()=>room==='summit'&&isSummitCableReleaseRecord(record())&&!!authority.applyEvent(2,{kind:'wake',impact:'sled'},actor),
    sendCableRepair:(line,event:Za36CableRepairEvent)=>((room==='summit'&&authorizeRearCableRepair(line,event,record()))||(room==='town'&&line===1))&&!!authority.applyEvent(line,event,actor),
   }});
  const tick=()=>controller.tick(0);
  const act=(id:string)=>{tick();assert.ok(controller.actions(foot).some(a=>a.id===id),JSON.stringify({room,foot,id,actions:controller.actions(foot)}));const r=controller.action(id,foot);assert.ok(r.accepted,id);return r;};
  function locate(id:string,a:{east:number;north:number},line:1|2){
   tick();
   for(let r=0;r<=2.1;r+=.25)for(let i=0;i<32;i++){
    const angle=i*Math.PI/16,e=a.east+r*Math.cos(angle),n=a.north+r*Math.sin(angle);
    const h=line===1?bindings.frontRepair!.surfaceAt(e,n):rearSupport(e,n);
    if(h===undefined)continue;
    const candidate={east:e,north:n,height:h};
    if(controller.actions(candidate).some(a=>a.id===id)){foot=candidate;return;}
   }
   assert.fail('No actual clear repair action '+id+' '+JSON.stringify(a));
  }
  function repair(line:1|2,anchors:{brake:{east:number;north:number};cableWheel:{east:number;north:number};weightTower:{east:number;north:number};weightFrame:{east:number;north:number}}){
   for(let j=0;j<9;j++){locate('strike-rust',anchors.brake,line);act('strike-rust');}
   act('pull-brake');locate('pry-cable',anchors.cableWheel,line);act('pry-cable');
   // The real held input path earns .125 per quarter second, with actual
   // authority reconciliation. A tap/release must not align the cable.
   for(let i=0;i<5;i++){inputNow+=100;controller.updateRepairHold(true,foot);}
   assert.ok(authority.snapshot(line).cableHeight>0&&authority.snapshot(line).cableHeight<1);
   inputNow+=100;controller.updateRepairHold(false,foot);assert.ok(!controller.repairHolding());
   act('pry-cable');for(let i=0;i<100&&!authority.snapshot(line).cableAligned;i++){inputNow+=100;controller.updateRepairHold(true,foot);}
   assert.ok(authority.snapshot(line).cableAligned);controller.updateRepairHold(false,foot);
   for(let i=0;i<3;i++)act('tighten-cable');
   for(let i=0;i<4;i++){locate('take-weight',anchors.weightTower,line);act('take-weight');tick();locate('hang-weight',anchors.weightFrame,line);act('hang-weight');}
   assert.equal(authority.snapshot(line).stage,'full-line');
  }
  function boardAndRide(line:1|2,start:string,end:string){
   const service=line===1?bindings.front!.service:upper!.service;
   let boarded=false;
   for(let i=0;i<1800;i++,now+=1000){
    const states=service.cabinStates();
    for(const cabin of [0,1] as const){
     const s=states?.[cabin];if(s?.station!==start)continue;
     const p=line===1?bindings.front!.service.exit({cabin}):upper!.service.exit({cabinIndex:cabin});
     if(!p)continue;foot=line===1?p:world(p);
     if(!controller.actions(foot).some(a=>a.id==='board-'+cabin))continue;
     act('board-'+cabin);boarded=true;break;
    }
    if(boarded)break;
   }
   assert.ok(boarded,'No board at '+start);
   let moving=false,completed=false;
   for(let i=0;i<1000;i++,now+=1000){
    const f=tick();assert.ok(f?.synchronized&&frame?.line===line);
    if(!f.station)moving=true;
    if(f.station===end&&controller.actions(foot).some(a=>a.id==='exit')){
     foot=act('exit').landing!;completed=true;break;
    }
   }
   assert.ok(moving&&completed,'No completed ride '+start+' -> '+end);assert.ok(!controller.riding());
  }
  assert.equal(controller.reportFrontImpact('snowball',foot),false);
  assert.ok(controller.reportFrontImpact('sled',foot));repair(1,bindings.frontRepair.anchors);
  boardAndRide(1,'base','summit');
  assert.ok(rear.enterRear({east:300,north:668,height:347}).ok);room='summit';
  // Both actual release approaches are accepted by the same server gate.
  for(const approach of summitReleaseApproaches){foot={...approach};assert.ok(controller.actions(foot).some(a=>a.id==='release'));}
  foot={...summitReleaseApproaches[0]!};act('release');
  const a=upper.workshop.repairAnchors,offset=(p:{east:number;north:number})=>({east:p.east+300,north:p.north+676});
  repair(2,{brake:offset(a.brake),cableWheel:offset(a.cableWheel),weightTower:offset(a.weightTower),weightFrame:offset(a.weightFrame)});
  boardAndRide(2,'cloud-deck','summit');boardAndRide(2,'summit','cloud-deck');
  assert.ok(rear.exitRear().ok);room='town';boardAndRide(1,'summit','base');
  assert.deepEqual(authority.flags(),{cableLine1Open:true,cableLine2Open:true});
 }finally{rear.dispose();front.dispose();}
});
