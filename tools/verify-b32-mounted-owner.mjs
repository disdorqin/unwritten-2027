import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {Box3,Group,Vector3} from 'three';
import {auditNightBCableWalkRoutes} from './voxel-tavern/town-blockout/town-night-b-cable-walk-route.ts';
import {auditNightBRearCableAccess} from './voxel-tavern/town-blockout/town-night-b-rear-cable-access.ts';
import {mountNightBPublicRearCable,mountNightBPublicRearCableAsync} from './voxel-tavern/town-blockout/town-night-b-public-rear-cable.ts';
import {mountNorthRidgeMiddleStation} from './voxel-tavern/town-blockout/north-ridge-middle-station.ts';
import {createNightBMountedClearance} from './voxel-tavern/town-blockout/town-night-b-mounted-clearance.ts';
import {createTownD2R30Ropeway} from './voxel-tavern/town-blockout/town-d2-r30-ropeway.ts';
import {auditNightBSummitCable} from './voxel-tavern/town-blockout/town-night-b-summit-line2-service.ts';
import {auditNightBFrontOpenFacilities} from './voxel-tavern/town-blockout/town-night-b-summit-front-sweep.ts';
import {externalCableDockSupport,mountRidgeCableFacilities} from './voxel-tavern/town-blockout/town-d-r30-cable-facilities.ts';
const here=fileURLToPath(new URL('../',import.meta.url));
const scope=process.argv[2];
const paired=path.resolve(here,process.argv[4]==='d2'?'../window-d2':process.argv[4]==='c2'?'../window-c2':'../window-a-a0-a6'),expected=process.argv[3];
const git=(...args)=>execFileSync('git',['-C',paired,...args],{encoding:'utf8'}).trim();
assert.ok(expected&&git('rev-parse','HEAD')===expected&&git('status','--porcelain','--untracked-files=no')==='','Paired owner must be exact tracked-clean SHA');
const load=name=>import(pathToFileURL(path.join(paired,'tools','voxel-tavern','town-blockout',name+'.ts')).href);
if(scope==='rear'||scope==='rear-mount'||scope==='rear-routes'){
 const [{createTownD2R30ProductionHost},{createSouthSectorInstaller,createWestSectorInstaller,createEastSectorInstaller},{retireA31LegacySectorOverlays}]=await Promise.all([load('town-d2-r30-production-host'),load('town-d2-r30-sector-installers'),import(pathToFileURL(path.resolve(here,'../window-a-a0-a6/tools/voxel-tavern/town-blockout/town-a31-summit-visual-ownership.ts')).href)]);
 const host=createTownD2R30ProductionHost({includeRopeway:false});
 try{
  host.install('A',createSouthSectorInstaller());host.install('B',createWestSectorInstaller());host.install('C2',createEastSectorInstaller());
  const visual=retireA31LegacySectorOverlays(host.group);
  if(scope==='rear-mount'||scope==='rear-routes'){
   const old=host.group.getObjectByName('main-summit-machine-room');assert.ok(old);const oldParent=old.parent;old.removeFromParent();
   const originalPaint=host.group.getObjectByName('main-summit-paint')?.geometry;
   let routeAudit;
   const slices=[],asyncMode=process.env.B32_ASYNC==='1';
   const input={owner:host.group,groundAt:host.surfaceAt,supportAt:host.supportAt,
    blocked:(e,n,h,r,b)=>host.blocked(e,n,h,r,b)||!!host.assembly.northWall?.blocked(e,n,h,r,b),
    groundMeshes:host.tiles,authorized:true,authority:{state:()=>undefined,now:()=>undefined,daylight:()=>undefined,firstRun:{wokeAt:()=>undefined,openedAt:()=>undefined,dawnEpoch:()=>undefined}},
    certifyRoutes:(docks,repair,supportAt,blocked,repairFootClear,dispatcherFoot)=>{
     if(scope!=='rear-routes')return false;
     const a=auditNightBRearCableAccess({docks,repair,supportAt,blocked,repairFootClear,dispatcherFoot,gate:{east:0,north:-8,height:347},summitLanding:host.trail.at(-1)}),l=a.lower,u=a.upper;
     const compact=a=>({...a,routes:a.routes.map(({path,...p})=>({...p,points:path?.length,turns:path?.filter((x,i)=>i===0||i===path.length-1||i%20===0)}))});
     routeAudit={lower:compact(l),upper:compact(u)};
     return l.ready&&u.ready;
    }};
   const result=asyncMode?await mountNightBPublicRearCableAsync(input,{budgetMs:6,onSlice:ms=>slices.push(ms)}):mountNightBPublicRearCable(input);
   console.log(JSON.stringify({scope:'actual four-sector host with paired B real mount; legacy room detached only in ephemeral object; no browser entry or live authority claim',paired:expected,asyncMode,sliceStats:slices.length?{count:slices.length,max:Math.max(...slices),median:[...slices].sort((a,b)=>a-b)[Math.floor(slices.length/2)]}:undefined,routeAudit,result:result.ready?{ready:true,audit:result.cableOperation.audit,meshAudit:result.meshAudit}:result,paintRestored:host.group.getObjectByName('main-summit-paint')?.geometry===originalPaint,remainingCable:!!host.group.getObjectByName('night-b-public-rear-cable')}));
   if(result.ready){result.dispose();assert.equal(host.group.getObjectByName('main-summit-paint')?.geometry,originalPaint);assert.equal(host.group.getObjectByName('night-b-public-rear-cable'),undefined);console.log('Accepted cable teardown restored original paint geometry and removed the sole cable group.');}oldParent.add(old);
  }else{
  const ropeway=createTownD2R30Ropeway({heightAt:host.surfaceAt,controlPointSupports:false});
  const corridor=ropeway.cable.ropes.flatMap(r=>r.points.slice(1).map((p,i)=>{const a=r.points[i];return new Box3().setFromPoints([new Vector3(a.east,a.height,-a.north),new Vector3(p.east,p.height,-p.north)]).expandByScalar(5)}));
  const scan=createNightBMountedClearance(host.group,host.tiles,corridor);
  try{
   const first={};const audit=auditNightBSummitCable(ropeway,host.surfaceAt,p=>{const name=scan.firstHit(p);if(name){first[name]??=p;return true;}return false;});
   console.log(JSON.stringify({scope:'actual A four-sector production owner, final rendered triangle sweep; legacy machine room retained; no service certification or walking claim',paired:expected,live:host.sectorLiveCheck(),visual:{removedTrailTriangles:visual.removedTrailTriangles,removedForestInstances:visual.removedForestInstances},audit,meshAudit:scan.stats(),first}));
  }finally{ropeway.dispose();}
  }
 }finally{host.dispose();}
}else if(scope==='front'||scope==='front-public'){
 const [{createTerrainGrid,worldBounds},{mountWestCraterRoad},{createTownRailway},{buildCraterRailExtension},{mountProductionRidge},{buildRailwayStation}]=await Promise.all([load('terrain'),load('town-za22-crater-road'),load('town-railway'),load('town-crater-rail-extension'),load('town-d-r30-production-ridge'),load('landmark-station')]);
 const grid=createTerrainGrid(),root=new Group(),west=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n)),rail=createTownRailway(grid,()=>0),branch=buildCraterRailExtension(grid,west,rail.route.points),hall=buildRailwayStation();
 hall.position.set(526,26,-329);root.add(rail.group,branch.group,hall);
 const ridge=mountProductionRidge(root,grid,{loop:rail.route.points,branch:branch.samples});
 assert.ok(ridge.facilities&&ridge.serviceExit);
 if(scope==='front-public'){
  assert.equal(typeof ridge.preparePublicFrontCable,'function');const oldFacility=ridge.facilities,old=oldFacility.group;
  const ready=await ridge.preparePublicFrontCable({state:()=>undefined,now:()=>undefined,daylight:()=>undefined,firstRun:{wokeAt:()=>undefined,openedAt:()=>undefined,dawnEpoch:()=>undefined}});
  console.log(JSON.stringify({scope:'actual C2 public preparePublicFrontCable on production root, rail and hall',paired:expected,ready,transportReady:ridge.transportReady,reason:ridge.frontCablePrepareResult,closedRetained:old.parent===root,operation:ridge.frontOperation?.audit,hostRouteAudit:ridge.frontRouteAudit,roadLengths:ridge.roads.map(r=>r.route.at(-1)?.cum)}));
  assert.equal(ready,ridge.transportReady);if(!ready)assert.equal(old.parent,root);
  if(ready){
   const hallBoxes=(qs)=>qs.map(q=>({min:[q.min[0]+526,q.min[1]+26,q.min[2]-329],max:[q.max[0]+526,q.max[1]+26,q.max[2]-329]}));
   const floors=[...hallBoxes(hall.userData.floors??[]),...(rail.group.userData.floors??[]),...(branch.group.userData.floors??[])];
   const boxes=[...floors,...hallBoxes(hall.userData.colliders??[]),...(rail.group.userData.colliders??[]),...(branch.group.userData.colliders??[])];
   const overlaps=(e,n,r,b)=>Math.hypot(Math.max(0,b.min[0]-e,e-b.max[0]),Math.max(0,b.min[2]+n,-n-b.max[2]))<r;
   const {createNightBFrontFloorSupport}=await import('./voxel-tavern/town-blockout/town-night-b-front-floor-support.ts');
   const supportAt=createNightBFrontFloorSupport((e,n)=>grid.heightAt(e,n),floors);
   const fix=process.env.B32_FRONT_FIX==='1';
   const allowsSupportedStep=(a,b)=>(fix||process.env.B32_FRONT_HOST_STEP==='1')&&(a.height>grid.heightAt(a.east,a.north)+.04||b.height>grid.heightAt(b.east,b.north)+.04)&&ridge.allowsUphill(a,b)&&ridge.allowsUphill(b,a);
   if(fix)oldFacility.blocked=(...args)=>ridge.facilities.blocked(...args); // paired ephemeral equivalent of C2's active reference correction
   const existingBlocked=(e,n,h,r,b)=>ridge.blocked(e,n,h,r)||boxes.some(x=>h+.025<x.max[1]&&h+b-.025>x.min[1]&&overlaps(e,n,r,x));
   let props;
   if(process.env.B32_FRONT_PROPS==='1'){
    assert.ok(fix,'Props survey requires corrected host floor and active facility reference');
    const {mountNightBFrontRepairProps}=await import('./voxel-tavern/town-blockout/town-night-b-front-repair-props.ts');
    props=mountNightBFrontRepairProps({owner:ridge.facilities.group,cablePath:ridge.facilities.survey.path,anchors:ridge.frontRepair.anchors,supportAt,blocked:existingBlocked});
    assert.ok(props.ready,JSON.stringify(props));
    const propAudit=auditNightBFrontOpenFacilities(ridge.field,ridge.facilities,(p,w,d,top)=>{for(let i=0;i<=6;i++)for(let j=0;j<=8;j++)if(props.blocked(p.east+(i/3-1)*w,p.north+(j/4-1)*d,p.height,.025,top))return true;return false;});
    console.log(JSON.stringify({scope:'actual C2 owner with B staged repair fixtures (not committed C2 integration)',paired:expected,sites:props.sites,propAudit}));
    assert.ok(propAudit.candidateEnvelopeClear);
   }
   const blocked=(e,n,h,r,b)=>existingBlocked(e,n,h,r,b)||!!props?.blocked(e,n,h,r,b);
   const goals=station=>ridge.frontOperation.docks.filter(d=>d.station===station).flatMap(d=>['board','approach'].map(k=>({id:station+'-'+d.cabin+'-'+k,foot:d[k]})));
   const repair=(key)=>{const a=(props?.anchors??ridge.frontRepair.anchors)[key];return {id:key,foot:{...a,height:supportAt(a.east,a.north)},reach:2.2,accept:p=>fix?Math.abs((supportAt(p.east,p.north)??Infinity)-p.height)<=.08&&!blocked(p.east,p.north,p.height,.27,1.8):ridge.frontRepair.clear(p)};};
   const lowRoad=ridge.roads.at(-1).route,midRoad=ridge.roads[0].route;
   const base=lowRoad[0],middle=midRoad[0],top={east:324,north:655,height:347};
   const wheel=repair('cableWheel'),wheelIndex=lowRoad.reduce((best,p,i)=>Math.hypot(p.east-wheel.foot.east,p.north-wheel.foot.north)<Math.hypot(lowRoad[best].east-wheel.foot.east,lowRoad[best].north-wheel.foot.north)?i:best,0),wheelStart=lowRoad[wheelIndex];
   const result=[
    auditNightBCableWalkRoutes({start:base,goals:[...goals('base'),repair('brake')],bounds:{west:498,east:552,south:312,north:375},supportAt,blocked,allowsSupportedStep,maxHeightDrift:12}),
    auditNightBCableWalkRoutes({start:middle,goals:[...goals('middle'),repair('weightTower'),repair('weightFrame')],bounds:{west:420,east:460,south:500,north:540},supportAt,blocked,maxHeightDrift:12}),
    auditNightBCableWalkRoutes({start:top,goals:goals('summit'),bounds:{west:284,east:354,south:628,north:665},supportAt,blocked,maxHeightDrift:.15}),
    auditNightBCableWalkRoutes({start:wheelStart,goals:[wheel],bounds:{west:Math.floor(Math.min(wheelStart.east,wheel.foot.east)-12),east:Math.ceil(Math.max(wheelStart.east,wheel.foot.east)+12),south:Math.floor(Math.min(wheelStart.north,wheel.foot.north)-12),north:Math.ceil(Math.max(wheelStart.north,wheel.foot.north)+12)},supportAt,blocked,maxHeightDrift:30,step:.5})
   ];
   let roadFailure,roadSamples=0;
   for(let i=0;i<wheelIndex&&!roadFailure;i++){const a=lowRoad[i],b=lowRoad[i+1],count=Math.max(1,Math.ceil(Math.hypot(b.east-a.east,b.north-a.north)/.25));for(let j=0;j<=count;j++){const t=j/count,e=a.east+(b.east-a.east)*t,n=a.north+(b.north-a.north)*t,h=supportAt(e,n);roadSamples++;if(!Number.isFinite(h)||Math.abs(h-(a.height+(b.height-a.height)*t))>.25||blocked(e,n,h,.27,1.8)){roadFailure={east:e,north:n,height:h};break;}}}
   const footDiagnosis=(p)=>{const {east:e,north:n}=p,h=supportAt(e,n);return {...p,support:h,grid:grid.heightAt(e,n),repairSurface:ridge.frontRepair.surfaceAt(e,n),repairClear:ridge.frontRepair.clear({...p,height:h}),facility:ridge.facilities.blocked(e,n,h,.27),terrace:ridge.terrace?.blocked(e,n,h,.27),external:ridge.externalObstacles(e,n,h,.27,1.8),boxes:boxes.filter(x=>h+.025<x.max[1]&&h+1.8-.025>x.min[1]&&overlaps(e,n,.27,x)),footprint:[[.27,0],[-.27,0],[0,.27],[0,-.27]].map(([x,z])=>supportAt(e+x,n+z))};};
   console.log(JSON.stringify({scope:'front failed target diagnosis',paired:expected,feet:[{east:527.55,north:354,height:26},{east:334.45,north:640,height:347},{east:524.6,north:326.6,height:26.14},{east:524.6,north:328,height:26.14},{east:524.6,north:324.9,height:26.14}].map(footDiagnosis)}));
   console.log(JSON.stringify({scope:'stricter front terminal local paths, real C2 public host collision + station and rail boxes; not actual browser walk',paired:expected,ephemeralHostFix:fix,repairProps:!!props?.ready,roadSamples,roadFailure,wheelStart,result:result.map(({routes,...a})=>({...a,routes:routes.map(({path,...r})=>({...r,points:path?.length}))}))}));
   props?.dispose();
  }
  ridge.dispose();
 }else{
 // Replace only the old station's rendered body in this ephemeral paired owner.
 const old=root.getObjectByName('north-ridge-middle-station');assert.ok(old);old.removeFromParent();const revised=mountNorthRidgeMiddleStation(root);
 const scan=createNightBMountedClearance(root,[ridge.model.group,ridge.facilities.group]),stage=new Group(),op=mountRidgeCableFacilities(stage,ridge.field,true,false,true);
 try{
  const first={};const audit=auditNightBFrontOpenFacilities(ridge.field,op,(feet,w,d,top)=>{const name=scan.firstHit({feet,heading:0,halfWidth:w,halfLength:d,bodyTop:top});if(name){first[name]??=feet;return true;}return false;});
  console.log(JSON.stringify({scope:'actual A front production owner including railway, with exact B replacement middle station body; actual mounted triangle scan, not route certification or ordinary entry',paired:expected,audit,meshAudit:scan.stats(),first,roads:ridge.roads.map(r=>r.route.at(-1)?.cum)}));
 }finally{op.dispose();revised.dispose();}
 }
}else throw Error('Choose front or rear');
assert.equal(git('rev-parse','HEAD'),expected);assert.equal(git('status','--porcelain','--untracked-files=no'),'');
