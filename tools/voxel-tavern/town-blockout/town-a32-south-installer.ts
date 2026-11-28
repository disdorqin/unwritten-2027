import {createMainSummitCable} from './main-summit-cable';
import type {TownD2SectorInstaller,TownD2SectorPackage,TownD2SectorHostPort} from './town-d2-r30-production-host';
import {mountSouthProduction,prepareSouthRoads} from './town-night-a-summit-production';
import {createSouthReservation} from './town-night-a-summit-reservation';
import {proposeSouthRoadGrade} from './town-night-a-summit-road-grade';
import {createNightBWestCutSurface,cutNightBWestTerrain} from './town-night-b-summit-west-cut';
import {surveyA32SouthRoadJoint} from './town-a32-south-road';
import {prepareA32CutCache} from './town-a32-cut-preload';
function plan(port:TownD2SectorHostPort){
 const first=1,last=834,grade=proposeSouthRoadGrade(port.trail,first,last,port.groundAt);
 if(!grade.ok)throw Error('Accepted southern road no longer fits');
 const trail=[...port.trail.slice(0,first),...grade.profile,...port.trail.slice(last+1)];
 const extension=surveyA32SouthRoadJoint(port.trail,port.groundAt);
 return {first,last,trail,extension};
}
type Plan=ReturnType<typeof plan>;
type PreparedRoad=ReturnType<typeof prepareSouthRoads>;
function mount(port:TownD2SectorHostPort,p:Plan,preparedRoad?:PreparedRoad,cache?:Awaited<ReturnType<typeof prepareA32CutCache>>,workerFailure?:string):TownD2SectorPackage{
 const {extension}=p,cable=createMainSummitCable(0,10000,port.arrivalHeight);
 const reserved=createSouthReservation([{points:port.trail,radius:18},{points:extension.trail,radius:18},...cable.ropes.map(rope=>({points:rope.points,radius:40}))],[{west:-42,east:42,south:-10,north:55}]);
 const south=mountSouthProduction({owner:port.owner,groundAt:port.groundAt,reserved,...p,preparedRoad,nearTiles:port.tiles,legacySouthVegetationExcluded:true,legacyTreadExcluded:true,cutTerrain:cache?.cut??cutNightBWestTerrain,createCutSurface:createNightBWestCutSurface});
 south.group.userData.a32Road={length:extension.grade.length,originalFirst:extension.originalFirst,originalLast:extension.originalLast,grade:extension.grade.maxGrade,cap:extension.cap,intervalComplete:true,connected:false,cutPreparation:cache?.stats??{mode:'sync',workerFailure}};
 return {sector:'A',group:south.group,groundAt:south.groundAt,coversCut:south.coversCut,cutGroundAt:south.cutGroundAt,deckAt:south.deckAt,supportAt:south.supportAt,blocked:south.blocked,updateView:south.updateView,setNight:south.setNight,updateSnow:(...args:unknown[])=>(south.updateSnow as (...args:unknown[])=>void)(...args),dispose:south.dispose};
}
/** Synchronous path for Node tests and unsupported browsers. */
export function createA32SouthSectorInstaller():TownD2SectorInstaller{return port=>mount(port,plan(port));}
/** Real B cutter is executed off the render thread; its exact buffers are
 * atomically consumed by the existing D2 installer and CPU cut index.
 * No worker-generated alternate ground authority. */
export async function prepareA32SouthSectorInstaller(port:TownD2SectorHostPort,signal:AbortSignal){
 const p=plan(port),road=prepareSouthRoads({...p,groundAt:port.groundAt});
 let cache:Awaited<ReturnType<typeof prepareA32CutCache>>,workerFailure:string|undefined;
 try{cache=await prepareA32CutCache(port.tiles,road.cutTread,signal);}
 catch(error){if(signal.aborted){road.dispose();throw error;}workerFailure=error instanceof Error?error.message:String(error);}
 let taken=false;
 return {install(next:TownD2SectorHostPort){
  if(taken)throw Error('Prepared southern road already consumed');
  if(signal.aborted||next.owner!==port.owner||next.trail!==port.trail||next.tiles!==port.tiles){road.dispose();throw Error('Stale south staging owner');}
  taken=true;
  try{return mount(next,p,road,cache,workerFailure);}catch(error){road.dispose();throw error;}
 },dispose(){if(!taken)road.dispose();}};
}
