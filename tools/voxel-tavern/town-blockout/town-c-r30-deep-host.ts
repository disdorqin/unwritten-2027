import {Group} from 'three';
import {mountRegisteredSecondMineDomain} from './town-c-second-mine-domain.js';
import {readUndergroundWaterPresentation,type AcceptedWaterReader} from '../../../src/shared/town-c-water-snapshot-port.js';
import {secondMineDomainId,isSecondMinePresenceFoot,secondMineConnections} from '../../../src/shared/underground-second-mine-presence-domain.js';
import type {R30Point} from './town-c-r30-deep-layer-contract.js';

type AcceptedFoot=R30Point&Readonly<{domainId:string}>;
type Mounted=Extract<ReturnType<typeof mountRegisteredSecondMineDomain>,{kind:'ready'}>;
type HostOptions=Readonly<{
 parent:Group;
 /** True only for the actual mounted first-to-second certified geometry. */
 seamRegistered:boolean;
 readAcceptedWater:AcceptedWaterReader;
 /** The movement/Presence owner supplies its accepted domain and foot.
  * This is deliberately NOT the camera, current target, or local height. */
 readAcceptedFoot?:()=>AcceptedFoot|undefined;
}>;
/** One render lifecycle for the registered second mine, independent of
 * delayed snapshots. No independent clock or movement authority. */
export function createR30DeepHost(options:HostOptions){
 let second:Mounted|undefined,disposed=false,active=false;
 let status:'unregistered-seam'|'awaiting-water'|'awaiting-domain'|'ready'|'disposed'=
   options.seamRegistered?'awaiting-water':'unregistered-seam';
 const clear=()=>{active=false;if(second)second.group.visible=false};
 function sync(){
  if(disposed)return false;
  if(!options.seamRegistered){status='unregistered-seam';clear();return false}
  // Capture a single source snapshot per sync; the scene adapter consumes
  // exactly this value, not a second time-varying read from the network.
  const raw=options.readAcceptedWater();
  const water=readUndergroundWaterPresentation(()=>raw);
  if(!water){status='awaiting-water';clear();return false}
  snapshot=raw;
  if(!second){
   const m=mountRegisteredSecondMineDomain({parent:options.parent,readAcceptedWater:()=>snapshot});
   if(m.kind!=='ready'){status='awaiting-water';clear();return false}
   second=m;
  }
  if(!second.sync()){status='awaiting-water';clear();return false}
  const p=options.readAcceptedFoot?.();
  active=!!p&&p.domainId===secondMineDomainId&&isSecondMinePresenceFoot(p.east,p.north,p.height);
  second.group.visible=active;
  status=active?'ready':'awaiting-domain';
  return active;
 }
 let snapshot:ReturnType<AcceptedWaterReader>;
 return {
  sync,status:()=>status,
  /** Preflight support for the sole transfer authority; no domain switch. */
  supportsArrival(domainId:string,foot:R30Point){
   if(disposed||!options.seamRegistered||!second||status==='awaiting-water'||domainId!==secondMineDomainId||
    !isSecondMinePresenceFoot(foot.east,foot.north,foot.height))return false;
   const p=second.passageAt(foot.east,foot.north);
   return p!==undefined&&Math.abs(p.floor-foot.height)<.02;
  },
  passageAt(domainId:string,east:number,north:number,radius=.27){
   if(disposed||!active||domainId!==secondMineDomainId)return;
   return second?.passageAt(east,north,radius);
  },
  connection:options.seamRegistered?secondMineConnections:undefined,
  get mounted(){return second},
  dispose(){if(disposed)return;disposed=true;clear();second?.dispose();second=undefined;status='disposed';snapshot=undefined},
 } as const;
}
