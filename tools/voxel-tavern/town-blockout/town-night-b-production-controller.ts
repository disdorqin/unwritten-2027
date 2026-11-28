import type {createTownPresence} from './town-presence';
import {createNightBCableRideHost,type CableRideFrame} from './town-night-b-summit-ride-host';
import type {installNightBFrontOperation} from './town-night-b-summit-front-install';
import type {installNightBUpperOperation} from './town-night-b-summit-upper-install';
import type {createTownD2R30Ropeway} from './town-d2-r30-ropeway';
import type {mountMainSummitCableWorkshop} from './main-summit-cable-workshop';
import {createCableRepairHost,cableWakeEvent,type RepairAnchors} from './town-cable-repair-host';
import {createNightBPryHold} from './town-night-b-pry-hold';
import {createNightBFrontBoardPresenter} from './town-night-b-front-boards';
import type {mountNightBUpperDispatcher} from './town-night-b-upper-dispatcher';
import {summitReleaseApproaches} from '../../../src/shared/za22-summit-presence-domain';
type Foot={east:number;north:number;height:number};
type Presence=Pick<ReturnType<typeof createTownPresence>,'getCableLineState'|'cableServerNow'|'getTownNightWindow'|'getCableLineWokeAt'|'getCableLineOpenedAt'|'getTownWeatherDawnEpoch'|'sampleCableRide'|'setActivityPose'|'sendSummitCableRelease'|'sendCableRepair'>;
type Domain='town'|'mountain'|'summit'|undefined;
type Front=ReturnType<typeof installNightBFrontOperation>;
type Upper=ReturnType<typeof installNightBUpperOperation>;
type Input={
 presence:Presence;
 front?:Front;
 upper?:Upper & {dispatcher?:ReturnType<typeof mountNightBUpperDispatcher>};
 ropeway?:ReturnType<typeof createTownD2R30Ropeway>;
 workshop?:ReturnType<typeof mountMainSummitCableWorkshop>;
 frontRepair?:{anchors:RepairAnchors;surfaceAt:(e:number,n:number)=>number|undefined;clear:(p:Foot)=>boolean};
 upperOrigin:Readonly<{east:number;north:number}>;
 domain:()=>Domain;
 acceptLanding:(line:1|2,feet:Foot,station:string)=>boolean;
 inputNow?:()=>number;
};
export function nightBProductionAuthority(p:Presence,line:1|2){
 return {state:()=>p.getCableLineState(line),now:p.cableServerNow,
  daylight:()=>{const s=p.getTownNightWindow();return s===undefined?undefined:s.phase==='day';},
  firstRun:{wokeAt:()=>p.getCableLineWokeAt(line),openedAt:()=>p.getCableLineOpenedAt(line),dawnEpoch:p.getTownWeatherDawnEpoch}};
}
/** Single public viewer adapter. Call action at the *current* world foot on E;
 * do not keep an old action or let the legacy cloudRoute also handle E.
 * tick owns the authoritative pose; the caller owns movement/camera and the
 * actual accepted scene/domain transfer, never a speculative teleport. */
export function createNightBProductionController(input:Input){
 const p=input.presence,front=input.front?.ready?input.front:undefined,upper=input.upper?.ready?input.upper:undefined;
 // Only the exact objects certified by the installer may drive repair or ride.
 if(upper&&(input.ropeway&&input.ropeway!==upper.ropeway||input.workshop&&input.workshop!==upper.workshop))throw Error('Mismatched certified upper operation assets');
 const workshop=upper?.workshop;
 const pry=createNightBPryHold({state:p.getCableLineState,send:p.sendCableRepair,now:input.inputNow});
 const ride=createNightBCableRideHost({front:front?.service,frontFacilities:front?.facilities,upper:upper?.service,upperRopeway:upper?.ropeway,upperOrigin:input.upperOrigin,
 domain:()=>{const d=input.domain();return d==='mountain'?'town':d;},acceptLanding:input.acceptLanding});
 const repair=input.frontRepair&&createCableRepairHost(1,input.frontRepair.anchors);
 const boards=front&&createNightBFrontBoardPresenter(front.facilities.group.parent??front.facilities.group,front.facilities.survey);
 let boardStatus:Parameters<ReturnType<typeof createNightBFrontBoardPresenter>>[0]|undefined;
 const local=(f:Foot)=>({...f,east:f.east-input.upperOrigin.east,north:f.north-input.upperOrigin.north});
 function tick(yaw:number):CableRideFrame|undefined{
  if(upper)upper.update();
  ride.updateVisuals(!!upper);
  const s=p.getCableLineState(1);if(s)repair?.sync(s);
  if(front&&boards){const status=!s||p.cableServerNow()===undefined?'offline':s.stage==='dormant'?'dormant':s.stage==='one-station'||front.service.firstRun()?.phase==='reposition'?'repair':front.service.serviceOpen()?'running':'parked';if(status!==boardStatus){boards(status);boardStatus=status;}}
  const frame=ride.pose();if(frame)p.sampleCableRide(frame,yaw);return frame;
 }
 function actions(feet:Foot){
  if(![feet.east,feet.north,feet.height].every(Number.isFinite))return [];
  if(ride.riding())return ride.exitCandidate()?[{id:'exit',label:'下车'}]:[];
  const d=input.domain(),line=d==='summit'?2:1;
  if(d!=='town'&&d!=='mountain'&&d!=='summit')return [];
  const available:{id:string;label:string}[]=[];
  for(const cabin of [0,1] as const)if(ride.boardCandidate(feet,line,cabin))available.push({id:'board-'+cabin,label:'登乘'+(cabin+1)+'号车厢'});
  if(line===2&&upper&&p.getCableLineState(2)?.stage==='dormant'&&p.cableServerNow()!==undefined&&summitReleaseApproaches[0]&&Math.hypot(feet.east-summitReleaseApproaches[0].east,feet.north-summitReleaseApproaches[0].north)<=1.35&&Math.abs(feet.height-800)<=.43)available.push({id:'release',label:'放下绝顶缆车'});
  if(line===2&&upper?.dispatcher?.available(local(feet)))available.push({id:'dispatcher',label:'询问调度员 · 班次'});
  if(line===2&&upper&&workshop&&p.getCableLineState(2)?.stage==='one-station')for(const a of workshop.repairActions(local(feet)))available.push({id:a.id,label:a.id==='pry-cable'?'按住 E 撬正缆绳':a.label});
  if(line===1&&front&&input.frontRepair&&repair&&Math.abs(feet.height-(input.frontRepair.surfaceAt(feet.east,feet.north)??Infinity))<=.43&&input.frontRepair.clear(feet)){
   const s=p.getCableLineState(1);if(s)for(const a of repair.actions(s,feet))available.push({id:a.id,label:a.id==='pry-cable'?'按住 E 撬正缆绳':a.label});
  }
  return available;
 }
 function action(id:string,feet:Foot):{accepted:boolean;landing?:Foot;notice?:string}{
  if(!actions(feet).some(a=>a.id===id))return {accepted:false};
  if(id==='exit'){const landing=ride.exit();if(!landing)return {accepted:false};p.setActivityPose(0);return {accepted:true,landing};}
  const line=input.domain()==='summit'?2:1;
  if(id==='board-0'||id==='board-1')return {accepted:ride.board(feet,line,id==='board-0'?0:1)};
  if(id==='dispatcher')return {accepted:true,notice:upper?.dispatcher?.notice()};
  if(id==='release')return {accepted:p.sendSummitCableRelease()};
  if(id==='pry-cable')return {accepted:pry.begin(line)};
  const state=p.getCableLineState(line);
  const list=line===2?workshop?.repairActions(local(feet)):state&&repair?.actions(state,feet);
  const a=list?.find(a=>a.id===id);
  return {accepted:!!a&&p.sendCableRepair(line,a.event)};
 }
 /** Call every input frame, including key-up/blur; suppress legacy repeat-E. */
 function updateRepairHold(held:boolean,feet:Foot){
  if(!pry.active())return;
  const eligible=actions(feet).some(a=>a.id==='pry-cable')?(input.domain()==='summit'?2:1):undefined;
  pry.update(held,eligible);
 }
 return {tick,actions,action,updateRepairHold,repairHolding:pry.active,riding:ride.riding,pose:ride.pose,
  /** Only the verified physical impact listener may call this. */
  reportFrontImpact(kind:'sled'|'big-snowball'|'snowball'|'snow-wall',impact:Foot){
   const domain=input.domain();if(!front||(domain!=='town'&&domain!=='mountain')||ride.riding()||p.getCableLineState(1)?.stage!=='dormant'||![impact.east,impact.north,impact.height].every(Number.isFinite))return false;
   // Include the actual surveyed base dock and original station hall.
   const stations=[...front.facilities.survey.towers.filter(t=>t.station),{east:526,north:329,height:26}];
   if(!stations.some(s=>Math.hypot(impact.east-s.east,impact.north-s.north)<=15&&Math.abs(impact.height-s.height)<=5))return false;
   const event=cableWakeEvent(kind);return !!event&&p.sendCableRepair(1,event);
  }};
}
