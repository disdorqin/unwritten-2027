import {finishNightBAudit,finishNightBAuditAsync,type NightBAuditSliceOptions} from './town-night-b-audit-slices';
import {auditNightBSummitCable,nightBSummitSweepSteps,createNightBLine2Service,type NightBLine2ServiceInput,type SummitSweepProbe} from './town-night-b-summit-line2-service';
import type {createTownD2R30CableTowers} from './town-d2-r30-cable-towers';
import {mainSummitR30CableWorkshopAnchor,type mountMainSummitCableWorkshop} from './main-summit-cable-workshop';
type Foot={east:number;north:number;height:number};
type Station='cloud-deck'|'summit';
type Dock=Readonly<{station:Station;cabin:0|1;board:Foot;approach:Foot}>;
type Input=Omit<NightBLine2ServiceInput,'audit'|'dispatch'|'firstRun'|'dockClear'>&{
 authorized:boolean;
 firstRun:NonNullable<NightBLine2ServiceInput['firstRun']>;
 towers:ReturnType<typeof createTownD2R30CableTowers>;
 workshop:ReturnType<typeof mountMainSummitCableWorkshop>;
 /** Actual near-mesh/cut collision height. */
 groundAt:(e:number,n:number)=>number|undefined;
 /** All remaining mounted components, not just the west sector. */
 externalBlocked:(probe:SummitSweepProbe)=>boolean;
 dockClear:(station:Station,feet:Foot)=>boolean;
 certifyApproaches:(docks:readonly Dock[])=>boolean;
};
/** Bind the already mounted production ropeway; never add another rope or
 * machine room. On every rejected gate the car stays parked with doors closed,
 * including when legacy assembly update(now) is still called. */
export function* upperOperationSteps(input:Input){
 const r=input.ropeway,clock=r.claimOperationalClock();
 let disposed=false;
 const dispose=()=>{if(!disposed){disposed=true;clock.park();clock.release();}};
 const reject=(reason:string,audit?:ReturnType<typeof auditNightBSummitCable>,docks?:readonly Dock[])=>({ready:false as const,reason,audit,docks,dispose});
 try{
  if(!input.authorized)return reject('host-not-authorized');
  if(!r.group.parent||!input.towers.group.parent||!input.workshop.group.parent)return reject('missing-mounted-assets');
  if(input.towers.cable!==r.cable||!r.denseTowerMode)return reject('mismatched-or-duplicate-rope-supports');
  if(input.towers.stats().skipNearStation!==0||input.towers.stats().towers<25)return reject('incomplete-tower-survey');
  const a=input.workshop.anchor,expected=mainSummitR30CableWorkshopAnchor;
  if(a.east!==expected.east||a.north!==expected.north||a.floor!==expected.floor)return reject('legacy-workshop');
  const bodyBlocked=(e:number,n:number,h:number,radius:number,height:number)=>r.blocked(e,n,h,radius,height)||input.towers.blocked(e,n,h,radius,height)||input.workshop.blocked(e,n,h,radius,height);
  const audit=yield* nightBSummitSweepSteps(r,input.groundAt,p=>{
   if(input.externalBlocked(p))return true;
   for(let i=0;i<=6;i++)for(let j=0;j<=8;j++){
    const x=(i/3-1)*p.halfWidth,z=(j/4-1)*p.halfLength,e=p.feet.east+x*Math.cos(p.heading)+z*Math.sin(p.heading),n=p.feet.north-x*Math.sin(p.heading)+z*Math.cos(p.heading);
    if(bodyBlocked(e,n,p.feet.height,.025,p.bodyTop))return true;
   }return false;
  });
  if(!audit.candidateEnvelopeClear)return reject('external-or-facility-envelope',audit);
  const dockClear=(station:Station,p:Foot)=>input.dockClear(station,p)&&!bodyBlocked(p.east,p.north,p.height,.27,1.8);
  const docks:Dock[]=(['cloud-deck','summit'] as const).flatMap(station=>([0,1] as const).map(cabin=>{
   const {board,approach}=r.cable.ropes[cabin].dock(station);return {station,cabin,board,approach};
  }));
  if(!docks.every(d=>dockClear(d.station,d.board)&&dockClear(d.station,d.approach)))return reject('dock-support-or-obstruction',audit,docks);
  if(input.certifyApproaches(docks)!==true)return reject('walking-route-not-certified',audit,docks);
  if(!r.group.parent||!input.towers.group.parent||!input.workshop.group.parent)return reject('owner-changed-during-certification',audit,docks);
  const service=createNightBLine2Service({...input,audit,dockClear});
  if(!service.physical)return reject('service-physical-gate',audit,docks);
  return {ready:true as const,service,ropeway:r,workshop:input.workshop,audit,docks,update(){if(disposed)return;input.workshop.sync(input.state());return service.present();},dispose};
 }catch(e){dispose();throw e;}
}
export function installNightBUpperOperation(input:Input){return finishNightBAudit(upperOperationSteps(input));}
export function installNightBUpperOperationAsync(input:Input,options?:NightBAuditSliceOptions){return finishNightBAuditAsync(upperOperationSteps(input),options);}
