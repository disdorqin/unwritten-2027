import {Group} from 'three';
import type {RepairAnchors} from './town-cable-repair-host';
import {mountNightBFrontRepairProps} from './town-night-b-front-repair-props';
import type {FrontRidgeR30Field} from './town-d-r30-front-ridge';
import {mountRidgeCableFacilities} from './town-d-r30-cable-facilities';
import {finishNightBAudit,finishNightBAuditAsync,type NightBAuditSliceOptions} from './town-night-b-audit-slices';
import {auditNightBFrontOpenFacilities,nightBFrontOpenFacilitySteps} from './town-night-b-summit-front-sweep';
import {createNightBFrontService,type FrontCableServiceInput} from './town-night-b-summit-front-service';
type Facility=ReturnType<typeof mountRidgeCableFacilities>;
type Foot={east:number;north:number;height:number};
type Station='base'|'middle'|'summit';
type Dock=Readonly<{station:Station;cabin:0|1;board:Foot;approach:Foot}>;
type Inputs=Omit<FrontCableServiceInput,'survey'|'audit'|'dockClear'|'dispatch'|'firstRun'>&{
 field:FrontRidgeR30Field;
 closed:Facility;
 /** Only true for a host with actual complete external obstacle ownership. */
 authorized:boolean;
 /** All actual non-facility colliders, not the parked-car boxes. */
 externalBlocked:NonNullable<Parameters<typeof auditNightBFrontOpenFacilities>[2]>;
 /** Support and external obstacle checks for each actual player foot. */
 dockClear:(station:Station,foot:Foot)=>boolean;
 /** Host's continuous route certification (not just isolated endpoints). */
 certifyApproaches:(docks:readonly Dock[],facilities:Facility,repairAnchors?:RepairAnchors)=>boolean;
 firstRun:NonNullable<FrontCableServiceInput['firstRun']>;
 /** Production caller supplies the actual floor layer and complete external collision. */
 repairProps?:Omit<Parameters<typeof mountNightBFrontRepairProps>[0],'owner'|'cablePath'>;
};
/** Production ridge owner calls at mount time, after other actual scene
 * assets are present. On rejection retain original CLOSED instance.
 * On success return the new instance to ALL update/collision consumers;
 * never retain the disposed old facility or mount both versions. */
export function* frontOperationSteps(input:Inputs){
 const parent=input.closed.group.parent;
 const reject=(reason:string,audit?:ReturnType<typeof auditNightBFrontOpenFacilities>,docks?:readonly Dock[])=>({ready:false as const,facilities:input.closed,reason,audit,docks});
 if(!input.authorized||!parent)return reject('host-not-authorized');
 if(!input.closed.group.getObjectByName('ridge-cable-parked-car-batch'))return reject('expected-closed-instance');
 const staging=new Group(),facilities=mountRidgeCableFacilities(staging,input.field,true,false,true);
 let installed=false;
 try{
  const originalBlocked=facilities.blocked,originalDispose=facilities.dispose;
  const props=input.repairProps&&mountNightBFrontRepairProps({...input.repairProps,owner:facilities.group,cablePath:facilities.survey.path,blocked:(e,n,h,r,b)=>originalBlocked(e,n,h,r)||input.repairProps!.blocked(e,n,h,r,b)});
  if(props&&!props.ready)return reject(props.reason);
  if(props?.ready){facilities.blocked=(e,n,h,r=.27)=>originalBlocked(e,n,h,r)||props.blocked(e,n,h,r);facilities.dispose=()=>{props.dispose();originalDispose();};props.sync(input.state());}
  yield;
  const audit=yield* nightBFrontOpenFacilitySteps(input.field,facilities,input.externalBlocked);
  if(!audit.candidateEnvelopeClear)return reject('external-or-facility-envelope',audit);
  const dockClear=(station:Station,p:Foot)=>input.dockClear(station,p)&&!facilities.blocked(p.east,p.north,p.height);
  const stations:Station[]=['base','middle','summit'];
  const docks:Dock[]=facilities.survey.towers.filter(p=>p.station).flatMap((p,i)=>([0,1] as const).map(cabin=>{
   const board={east:p.east+(cabin===0?-1.55:1.55),north:p.north,height:p.height};
   return {station:stations[i]!,cabin,board,approach:{...board,north:board.north-2.1}};
  }));
  if(docks.length!==6||!docks.every(d=>dockClear(d.station,d.board)&&dockClear(d.station,d.approach)))return reject('dock-support-or-obstruction',audit,docks);
  if(input.certifyApproaches(docks,facilities,props?.ready?props.anchors:undefined)!==true)return reject('walking-route-not-certified',audit,docks);
  const service=createNightBFrontService({survey:facilities.survey,audit,firstRun:input.firstRun,state:input.state,now:input.now,daylight:input.daylight,dockClear});
  if(!service.physical)return reject('service-physical-gate',audit,docks);
  if(!facilities.presentOperational(service.present()))return reject('initial-cabin-presentation',audit,docks);
  if(input.closed.group.parent!==parent)return reject('owner-changed-during-certification',audit,docks);
  parent.add(facilities.group);input.closed.dispose();installed=true;
  return {ready:true as const,facilities,service,audit,docks,repairProps:props?.ready?props:undefined};
 }finally{if(!installed)facilities.dispose();}
}
export function installNightBFrontOperation(input:Inputs){return finishNightBAudit(frontOperationSteps(input));}
export function installNightBFrontOperationAsync(input:Inputs,options?:NightBAuditSliceOptions){return finishNightBAuditAsync(frontOperationSteps(input),options);}
