import type {Object3D} from 'three';
import {externalCableDockSupport} from './town-d-r30-cable-facilities';
import {finishNightBAudit,finishNightBAuditAsync,type NightBAuditCertificate,type NightBAuditSliceOptions} from './town-night-b-audit-slices';
import {installNightBFrontOperation,frontOperationSteps} from './town-night-b-summit-front-install';
import {nightBMountedClearanceSteps} from './town-night-b-mounted-clearance';
import type {nightBProductionAuthority} from './town-night-b-production-controller';
import type {RepairAnchors} from './town-cable-repair-host';
type Installer=Parameters<typeof installNightBFrontOperation>[0];
type Foot={east:number;north:number;height:number};
type Input={
 owner:Object3D;field:Installer['field'];closed:Installer['closed'];
 /** Exact canonical terrain meshes; all other real scenery is scanned. */
 groundMeshes:readonly Object3D[];
 authority:ReturnType<typeof nightBProductionAuthority>;
 authorized:boolean;
 supportAt:(e:number,n:number)=>number|undefined;
 /** Real host external obstacle query, excludes only obsolete closed facility. */
 blocked:(e:number,n:number,h:number,r:number,body:number)=>boolean;
 repairAnchors:RepairAnchors;
 certifyRoutes:(docks:Parameters<Installer['certifyApproaches']>[0],repair:RepairAnchors,walkClear:(foot:Foot)=>boolean)=>NightBAuditCertificate;
};
/** C2 invokes from the existing production-ridge closure, not a preview.
 * On success replace its facilities reference with result.facilities,
 * retain the same group parent and expose frontOperation/frontRepair.
 * Failure retains original closed facility and never grants transportReady. */
function* publicFrontCableSteps(input:Input){
 const scan=yield* nightBMountedClearanceSteps(input.owner,[...input.groundMeshes,input.closed.group]);
 const surfaceAt=(e:number,n:number)=>externalCableDockSupport(e,n)??input.supportAt(e,n);
 const clear=(p:Foot)=>Math.abs((surfaceAt(p.east,p.north)??Infinity)-p.height)<=.08&&!input.blocked(p.east,p.north,p.height,.27,1.8);
 const op=yield* frontOperationSteps({...input.authority,field:input.field,closed:input.closed,authorized:input.authorized,
  externalBlocked:(feet,w,d,top)=>{
   if(scan.blocked({feet,heading:0,halfWidth:w,halfLength:d,bodyTop:top}))return true;
   for(let i=0;i<=6;i++)for(let j=0;j<=8;j++)if(input.blocked(feet.east+(i/3-1)*w,feet.north+(j/4-1)*d,feet.height,.025,top))return true;
   return false;
  },
  repairProps:{anchors:input.repairAnchors,supportAt:surfaceAt,blocked:input.blocked},
  dockClear:(_station,p)=>clear(p),
  certifyApproaches:(docks,facilities,anchors)=>input.certifyRoutes(docks,anchors??input.repairAnchors,p=>clear(p)&&!facilities.blocked(p.east,p.north,p.height,.27))});
 const meshAudit=scan.stats();
 if(!op.ready)return {ready:false as const,reason:op.reason,audit:op.audit,docks:op.docks,meshAudit};
 return {ready:true as const,facilities:op.facilities,frontOperation:op,frontRepair:{anchors:op.repairProps?.anchors??input.repairAnchors,surfaceAt,clear:(p:Foot)=>clear(p)&&!op.facilities.blocked(p.east,p.north,p.height,.27)},meshAudit};
}
export function prepareNightBPublicFrontCable(input:Input){return finishNightBAudit(publicFrontCableSteps(input));}
export function prepareNightBPublicFrontCableAsync(input:Input,options?:NightBAuditSliceOptions){return finishNightBAuditAsync(publicFrontCableSteps(input),options);}
