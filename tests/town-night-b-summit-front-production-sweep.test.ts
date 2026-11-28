import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Group,InstancedMesh,Matrix4,Vector3} from 'three';
import {createTerrainGrid,worldBounds} from '../tools/voxel-tavern/town-blockout/terrain';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import {createTownRailway} from '../tools/voxel-tavern/town-blockout/town-railway';
import {buildCraterRailExtension} from '../tools/voxel-tavern/town-blockout/town-crater-rail-extension';
import {mountProductionRidge} from '../tools/voxel-tavern/town-blockout/town-d-r30-production-ridge';
import {mountRidgeCableFacilities,externalCableDockSupport} from '../tools/voxel-tavern/town-blockout/town-d-r30-cable-facilities';
import {mountNorthRidgeMiddleStation} from '../tools/voxel-tavern/town-blockout/north-ridge-middle-station';
import {mountRidgeRoadFurniture} from '../tools/voxel-tavern/town-blockout/town-d-r30-road-furniture';
import {mountRidgeRetainingBanks} from '../tools/voxel-tavern/town-blockout/town-d-r30-retaining-banks';
import {mountRidgeCloudTerrace} from '../tools/voxel-tavern/town-blockout/town-d-r30-cloud-terrace';
import {buildRailwayStation} from '../tools/voxel-tavern/town-blockout/landmark-station';
import {auditNightBFrontOpenFacilities} from '../tools/voxel-tavern/town-blockout/town-night-b-summit-front-sweep';
import {createNightBProductionController,nightBProductionAuthority} from '../tools/voxel-tavern/town-blockout/town-night-b-production-controller';
import {createZa36CableRepair,type Za36CableRepairEvent} from '../src/shared/za36-cable-repair';
import {installNightBFrontOperation} from '../tools/voxel-tavern/town-blockout/town-night-b-summit-front-install';
test('front production field and actual rail, station, forest, roads, banks and terrace audit',()=>{
 const grid=createTerrainGrid(),root=new Group(),west=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n));
 const rail=createTownRailway(grid,()=>0),branch=buildCraterRailExtension(grid,west,rail.route.points);
 const ridge=mountProductionRidge(root,grid,{loop:rail.route.points,branch:branch.samples});
 assert.ok(ridge.facilities&&ridge.stationReady&&ridge.serviceExit);assert.equal(ridge.transportReady,false);
 const owner=new Group(),field=ridge.field,allowed=(e:number,n:number)=>ridge.ownership.distance(e,n)>0;
 const facility=mountRidgeCableFacilities(owner,field,true,false,true),station=mountNorthRidgeMiddleStation(owner);
 const furniture=ridge.roads.map((r,i)=>mountRidgeRoadFurniture(field,r.route,allowed,i===ridge.roads.length-1?{title:'后坡施工终点',returnTo:'基站'}:i===1?{title:'中山施工终点',returnTo:'中站'}:undefined));
 const banks=ridge.roads.map(r=>mountRidgeRetainingBanks(field,r.route,allowed));
 const terrace=mountRidgeCloudTerrace(owner,field,()=>false,true);
 const hall=buildRailwayStation(),boxes=[...(hall.userData.colliders??[]),...(hall.userData.floors??[])].map(q=>({min:[q.min[0]+526,q.min[1]+26,q.min[2]-329],max:[q.max[0]+526,q.max[1]+26,q.max[2]-329]}));
 const all=[...boxes,...rail.group.userData.colliders,...rail.group.userData.floors,...branch.group.userData.colliders,...branch.group.userData.floors];
 const matrix=new Matrix4(),pos=new Vector3(),scale=new Vector3(),stationBoxes:{east:number;north:number;height:number;w:number;d:number;h:number}[]=[];
 for(const mesh of station.group.children){if(!(mesh instanceof InstancedMesh))continue;for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);pos.setFromMatrixPosition(matrix);scale.setFromMatrixScale(matrix);if(pos.y+scale.y/2>140.10)stationBoxes.push({east:pos.x,north:-pos.z,height:pos.y,w:scale.x,d:scale.z,h:scale.y});}}
 const hits:Record<string,number>={},first:Record<string,unknown>={};
 const mark=(kind:string,p:unknown)=>{hits[kind]=(hits[kind]??0)+1;first[kind]??=p;};
 const externalBlocked:NonNullable<Parameters<typeof auditNightBFrontOpenFacilities>[2]>=(p,w,d,top)=>{
  const found=new Set<string>();
  if(stationBoxes.some(x=>Math.abs(p.east-x.east)<w+x.w/2&&Math.abs(p.north-x.north)<d+x.d/2&&p.height+top>x.height-x.h/2&&p.height<x.height+x.h/2))found.add('station-rendered');
  if(all.some(x=>p.east+w>x.min[0]&&p.east-w<x.max[0]&&-p.north+d>x.min[2]&&-p.north-d<x.max[2]&&p.height+top>x.min[1]&&p.height<x.max[1]))found.add('rail');
  for(let i=0;i<=6;i++)for(let j=0;j<=8;j++)for(const dh of [0,top-1.8]){
   const e=p.east+(i/3-1)*w,n=p.north+(j/4-1)*d,h=p.height+dh;
   if(ridge.forest.blocked(e,n,h,.025))found.add('forest');
   if(station.blocked(e,n,h,.025))found.add('station');
   if(terrace.blocked(e,n,h,.025))found.add('terrace');
   if(furniture.some(f=>f.blocked(e,n,h,.025)))found.add('road-furniture');
   if(banks.some(b=>b.blocked(e,n,h,.025)))found.add('retaining-bank');
  }
  for(const key of found)mark(key,p);return found.size>0;
 };
 const audit=auditNightBFrontOpenFacilities(field,facility,externalBlocked);
 const docks=facility.survey.towers.filter(p=>p.station).flatMap(p=>[-1,1].map(s=>{const e=p.east+s*1.55,n=p.north-2.1,h=p.height;return {e,n,h,support:externalCableDockSupport(e,n)??station.surfaceAt(e,n)??field.heightAt(e,n),blocked:facility.blocked(e,n,h)||ridge.forest.blocked(e,n,h,.27)||station.blocked(e,n,h,.27)||terrace.blocked(e,n,h,.27)||furniture.some(f=>f.blocked(e,n,h,.27))||banks.some(b=>b.blocked(e,n,h,.27))}}));
 console.log(JSON.stringify({audit,hits,first,docks}));
 assert.equal(audit.groundHits,0);assert.equal(audit.ownHits,0);assert.equal(audit.obstacleHits,0,JSON.stringify({hits,first}));assert.ok(audit.candidateEnvelopeClear);assert.ok(docks.every(p=>p.support===p.h&&!p.blocked));
 // Same real walking colliders at the mount, not a synthetic dock flag.
 const dockClear=(_station:string,p:{east:number;north:number;height:number})=>{
  const {east:e,north:n,height:h}=p;
  const support=externalCableDockSupport(e,n)??station.surfaceAt(e,n)??field.heightAt(e,n);
  if(support===undefined||Math.abs(support-h)>.04)return false;
  return !ridge.forest.blocked(e,n,h,.27)&&!station.blocked(e,n,h,.27)&&!terrace.blocked(e,n,h,.27)&&!furniture.some(f=>f.blocked(e,n,h,.27))&&!banks.some(b=>b.blocked(e,n,h,.27))&&!all.some(x=>h+1.775>x.min[1]&&h+.025<x.max[1]&&Math.hypot(Math.max(0,x.min[0]-e,e-x.max[0]),Math.max(0,x.min[2]+n,-n-x.max[2]))<.27);
 };
 const checkPath=(from:{east:number;north:number;height:number},to:{east:number;north:number;height:number})=>{
  // Bounded 0.1m straight-foot probes for the station approach itself.
  const steps=Math.ceil(Math.hypot(to.east-from.east,to.north-from.north)/.1);
  for(let i=0;i<=steps;i++){const t=i/steps,p={east:from.east+(to.east-from.east)*t,north:from.north+(to.north-from.north)*t,height:to.height};if(!dockClear('',p)||facility.blocked(p.east,p.north,p.height))return false;}return true;
 };
 const closed=ridge.facilities!,originalParent=closed.group.parent;
 const input={field,closed,authorized:false,externalBlocked,dockClear,certifyApproaches:()=>false,firstRun:{wokeAt:()=>undefined,openedAt:()=>undefined,dawnEpoch:()=>undefined},state:()=>undefined,now:()=>undefined,daylight:()=>undefined};
 const rejected=installNightBFrontOperation(input);assert.equal(rejected.ready,false);assert.equal(closed.group.parent,originalParent);
 const badProps=installNightBFrontOperation({...input,authorized:true,repairProps:{anchors:{brake:{east:524.6,north:326.6},cableWheel:{east:483,north:424.5},weightTower:{east:436.8,north:523.2},weightFrame:{east:440.6,north:517.4}},supportAt:()=>undefined,blocked:()=>false}});assert.equal(badProps.ready,false);assert.equal(badProps.reason,'repair-fixture-site:brake');assert.equal(closed.group.parent,originalParent);
 const routeRejected=installNightBFrontOperation({...input,authorized:true});assert.equal(routeRejected.ready,false);assert.equal(routeRejected.reason,'walking-route-not-certified');assert.equal(closed.group.parent,originalParent);
 const epoch=Date.UTC(2026,0,1),authority=createZa36CableRepair(1);
 let now:number|undefined=epoch+1000,wokeAt:number|undefined,openedAt:number|undefined,reported=0,activity=-1;
 const presence:Parameters<typeof createNightBProductionController>[0]['presence']={
  getCableLineState:line=>line===1&&now!==undefined?authority.snapshot():undefined,cableServerNow:()=>now,
  getTownNightWindow:()=>now===undefined?undefined:{phase:'day',shift:'day',canEnterRestricted:false,layersOverlap:false,chapterGatesLocked:true,beaconAt:null,morningBellAt:null},
  getCableLineWokeAt:()=>wokeAt,getCableLineOpenedAt:()=>openedAt,getTownWeatherDawnEpoch:()=>epoch,
  sampleCableRide:()=>{reported++;return true;},setActivityPose:v=>{activity=v;},
  sendSummitCableRelease:()=>false,sendCableRepair:(line,event)=>{if(line!==1||now===undefined)return false;const result=authority.apply(event);if(result.accepted&&event.kind==='wake')wokeAt=now;if(result.opened)openedAt=now;return result.accepted;}
 };
 const accepted=installNightBFrontOperation({...input,...nightBProductionAuthority(presence,1),authorized:true,certifyApproaches:entries=>entries.every(d=>{
  const gate=d.station==='base'?{east:d.approach.east,north:346,height:26}:d.station==='middle'?{east:d.approach.east,north:517,height:140}:{east:d.approach.east,north:636,height:347};
  return checkPath(gate,d.approach)&&checkPath(d.approach,d.board);
 })});
 assert.ok(accepted.ready,JSON.stringify(accepted.ready?{}:{reason:accepted.reason,docks:accepted.docks}));
 // Newly installed dormant cars must already be at the upper station
 // before the first viewer tick, and legacy frame writers cannot move them.
 for(const side of [-1,1]){
  const car:import('three').Object3D=accepted.facilities.group.getObjectByName('d-r30-cable-cabin-'+side)!;
  const batch=car.children[0] as InstancedMesh;
  assert.equal(car.children.length,1);assert.ok(batch instanceof InstancedMesh&&batch.count>20);
  assert.equal(car.position.y,347);
 }
 const beforeLegacy=accepted.facilities.update(18000);
 assert.ok(beforeLegacy.every(c=>c.station==='summit'&&c.height===347));
 accepted.facilities.setNight(true);
 accepted.facilities.group.traverse(o=>{if('isPointLight'in o)assert.equal((o as any).intensity,0);});
assert.equal(closed.group.parent,null);assert.equal(accepted.facilities.group.parent,originalParent);assert.equal(accepted.service.serviceOpen(),false);
 let domain:'town'|'mountain'|'summit'='town',inputClock=0;
 const controller=createNightBProductionController({presence,inputNow:()=>inputClock,front:accepted,upperOrigin:{east:300,north:676},domain:()=>domain,acceptLanding:(_l,p,s)=>dockClear(s,p),frontRepair:{anchors:{brake:accepted.docks[0]!.approach,cableWheel:accepted.docks[2]!.approach,weightTower:accepted.docks[3]!.approach,weightFrame:accepted.docks[2]!.approach},surfaceAt:(e,n)=>externalCableDockSupport(e,n)??station.surfaceAt(e,n)??field.heightAt(e,n),clear:p=>dockClear('',p)}});
 const summit=accepted.docks.find(d=>d.station==='summit'&&d.cabin===0)!.approach;
 assert.equal(controller.action('board-0',summit).accepted,false);
 assert.equal(controller.reportFrontImpact('snowball',summit),false);
 assert.equal(controller.reportFrontImpact('sled',{...summit,height:999}),false);
 assert.equal(controller.reportFrontImpact('sled',{east:0,north:0,height:26}),false);
 assert.equal(controller.reportFrontImpact('sled',summit),true);
 domain='mountain';assert.equal(controller.action('board-0',summit).accepted,false);
 now=wokeAt!+20000;assert.equal(controller.tick(0),undefined);assert.equal(accepted.service.present()[0]!.station,null);
 now=wokeAt!+accepted.service.firstMs;assert.equal(accepted.service.present()[0]!.station,'middle');
 domain='town';
 assert.equal(controller.action('strike-rust',{...accepted.docks[0]!.approach,height:999}).accepted,false);
 const act=(id:string,at:number)=>{controller.tick(0);assert.equal(controller.action(id,accepted.docks[at]!.approach).accepted,true,id);};
 for(let i=0;i<9;i++)act('strike-rust',0);
 act('pull-brake',0);
 const wheel=accepted.docks[2]!.approach;
 const holdFrames=(n:number)=>{for(let i=0;i<n;i++){inputClock+=100;controller.updateRepairHold(true,wheel);}};
 act('pry-cable',2);assert.equal(authority.snapshot().cableHeight,0);
 holdFrames(6);assert.equal(authority.snapshot().cableHeight,.25);
 controller.updateRepairHold(false,wheel);assert.equal(authority.snapshot().cableHeight,.125);
 assert.equal(controller.repairHolding(),false);
 act('pry-cable',2);holdFrames(30);assert.equal(authority.snapshot().cableAligned,true);
 controller.updateRepairHold(false,wheel);
 for(let i=0;i<3;i++)act('tighten-cable',2);
 for(let i=0;i<4;i++){act('take-weight',3);act('hang-weight',2);}
 assert.equal(authority.snapshot().stage,'full-line');
 now=openedAt!+accepted.service.repositionMs;controller.tick(0);
 const base=accepted.docks[0]!.approach;
 assert.equal(controller.action('board-0',base).accepted,true);
 const firstRideFrame=controller.tick(0)!;assert.ok(firstRideFrame.synchronized&&reported===1);
 now+=20000;assert.equal(controller.tick(0)?.station,null);
 const actual=controller.pose()!.feet;const legacy=accepted.facilities.update(0)[0]!;assert.deepEqual({east:legacy.east,north:legacy.north,height:legacy.height},actual);
 assert.equal(controller.action('exit',base).accepted,false);assert.deepEqual(controller.actions(base),[]);
 const sameDomainFeet=controller.pose()!.feet;domain='summit';assert.equal(controller.pose()?.synchronized,false);assert.deepEqual(controller.pose()?.feet,sameDomainFeet);assert.deepEqual(controller.actions(base),[]);domain='town';
 const held=controller.pose()!.feet;now=undefined;assert.deepEqual(controller.tick(0)?.feet,held);assert.equal(controller.pose()?.synchronized,false);
 now=openedAt!+accepted.service.repositionMs+accepted.service.clock.oneWayMs;const arrived=controller.action('exit',base);assert.ok(arrived.accepted&&arrived.landing);assert.equal(activity,0);
 console.log('six local approach links certified; production controller uses authoritative E and repair events, holds last foot during reconnect');
 accepted.facilities.dispose();facility.dispose();station.dispose();terrace.dispose();
});
