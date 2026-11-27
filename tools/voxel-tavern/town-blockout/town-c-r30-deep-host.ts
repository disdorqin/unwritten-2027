import {Group} from 'three';
import {mountRegisteredSecondMineDomain} from './town-c-second-mine-domain.js';
import {readUndergroundWaterPresentation,type AcceptedWaterReader} from '../../../src/shared/town-c-water-snapshot-port.js';
import {secondMineDomainId,isSecondMinePresenceFoot,secondMineConnections} from '../../../src/shared/underground-second-mine-presence-domain.js';
import type {R30Point} from './town-c-r30-deep-layer-contract.js';
import type {SecondMineLiftAperturePort} from './underground-second-mine.js';

type AcceptedFoot=R30Point&Readonly<{domainId:string}>;
type Mounted=Extract<ReturnType<typeof mountRegisteredSecondMineDomain>,{kind:'ready'}>;
type HostOptions=Readonly<{
 parent:Group;
 /** True only for the actual mounted first-to-second certified geometry. */
 seamRegistered:boolean;
 readAcceptedWater:AcceptedWaterReader;
 liftAperture?:SecondMineLiftAperturePort;
 /** The movement/Presence owner supplies its accepted domain and foot.
  * This is deliberately NOT the camera, current target, or local height. */
 readAcceptedFoot?:()=>AcceptedFoot|undefined;
 blocks?:(domain:string,point:R30Point,radius:number)=>boolean;
}>;
/** One render lifecycle for the registered second mine, independent of
 * delayed snapshots. No independent clock or movement authority. */
export function createR30DeepHost(options:HostOptions){
 let second:Mounted|undefined,disposed=false,active=false;
 let status:'unregistered-seam'|'awaiting-water'|'awaiting-domain'|'ready'|'disposed'=
   options.seamRegistered?'awaiting-water':'unregistered-seam';
 const clear=()=>{active=false;if(second)second.group.visible=false};
 // A new effective water level must first update the real river mesh and its
 // collision. Reject queries in the interval between network receipt and sync.
 let presented:ReturnType<typeof readUndergroundWaterPresentation>;
 const mouthCache=new Map<string,boolean>();
 function waterCurrent(){
  const latest=readUndergroundWaterPresentation(options.readAcceptedWater);
  return !!latest&&!!presented&&latest.nightOrdinal===presented.nightOrdinal&&latest.level===presented.level;
 }
 function acceptedDomainNow(){
  const f=options.readAcceptedFoot?.();
  return !!f&&f.domainId===secondMineDomainId&&isSecondMinePresenceFoot(f.east,f.north,f.height);
 }
 function sync(){
  if(disposed)return false;
  if(!options.seamRegistered){status='unregistered-seam';clear();return false}
  // Capture a single source snapshot per sync; the scene adapter consumes
  // exactly this value, not a second time-varying read from the network.
  const raw=options.readAcceptedWater();
  const water=readUndergroundWaterPresentation(()=>raw);
  if(!water){status='awaiting-water';clear();return false}
  snapshot=raw?{...raw}:undefined;
  if(!second){
   const m=mountRegisteredSecondMineDomain({parent:options.parent,readAcceptedWater:()=>snapshot,liftAperture:options.liftAperture});
   if(m.kind!=='ready'){status='awaiting-water';clear();return false}
   second=m;
  }
  if(!second.sync()){status='awaiting-water';clear();return false}
  if(presented?.level!==water.level||presented?.nightOrdinal!==water.nightOrdinal)mouthCache.clear();
  presented=water;
  active=acceptedDomainNow();
  second.group.visible=active;
  status=active?'ready':'awaiting-domain';
  return active;
 }
 let snapshot:ReturnType<AcceptedWaterReader>;
 return {
  sync,status:()=>status,
  /** Preflight support for the sole transfer authority; no domain switch. */
  supportsArrival(domainId:string,foot:R30Point){
   if(disposed||!options.seamRegistered||!second||status==='awaiting-water'||!waterCurrent()||domainId!==secondMineDomainId||
    !isSecondMinePresenceFoot(foot.east,foot.north,foot.height))return false;
   const p=second.passageAt(foot.east,foot.north);
   return p!==undefined&&Math.abs(p.floor-foot.height)<.02&&!options.blocks?.(domainId,foot,.27);
  },
  lowerApertureReady:()=>!disposed&&waterCurrent()&&second?.lowerAperturePrepared()===true,
  acceptsMouth(mouth:unknown){
   if(disposed||!waterCurrent()||!second||!mouth||typeof mouth!=='object')return false;
   const m=mouth as Record<string,unknown>;
   const values=[m.layer,m.axis,m.at,m.centre,m.width,m.height];
   if(typeof m.layer!=='string'||typeof m.axis!=='string'||!values.slice(2).every(v=>typeof v==='number'&&Number.isFinite(v)))return false;
   const key=values.join('/');if(!mouthCache.has(key))mouthCache.set(key,second.acceptsMouth(mouth));
   return mouthCache.get(key)===true;
  },
  passageAt(domainId:string,east:number,north:number,radius=.27,height=1.8){
   if(disposed||!active||!waterCurrent()||!acceptedDomainNow()||domainId!==secondMineDomainId)return;
   const p=second?.passageAt(east,north,radius,height);
   if(p&&options.blocks?.(domainId,{east,north,height:p.floor},radius))return;
   return p;
  },
  connection:options.seamRegistered?secondMineConnections:undefined,
  get mounted(){return second},
  dispose(){if(disposed)return;disposed=true;clear();second?.dispose();second=undefined;status='disposed';snapshot=undefined},
 } as const;
}
