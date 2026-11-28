import {nightBCableDispatch,type CableDispatchInput} from './town-night-b-summit-dispatch';
import {cableFirstRunTimeline,cableFirstRunServiceDispatch,type CableFirstRunInput} from './town-night-b-summit-first-run';
import {summitCableSpec,type SummitCablePoint} from './main-summit-cable';
import type {SummitCableRide} from './main-summit-cable-travel';
import type {createTownD2R30Ropeway} from './town-d2-r30-ropeway';
import type {Za36CableRepairState} from './town-za36-cable-repair';

type Ropeway=ReturnType<typeof createTownD2R30Ropeway>;
type Station='cloud-deck'|'summit';
export type SummitSweepProbe=Readonly<{cabin:0|1;feet:SummitCablePoint;heading:number;halfWidth:number;halfLength:number;bodyTop:number;distance:number;terminalDistance:number}>;
export type NightBSummitSweepAudit=Readonly<{samples:number;minClearance:number;minMoving:number;groundHits:number;obstacleHits:number;missingHeights:number;firstGround?:SummitSweepProbe;firstObstacle?:SummitSweepProbe;externalSurveyed:boolean;candidateEnvelopeClear:boolean}>;
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
/** Station floor contact is intentional. Clearance ramps from zero at the
 * exact terminal to .25 m at 8 m along the rope. This is a measured sample
 * gate, not a proof of continuous external obstacle clearance. */
export function auditNightBSummitCable(ropeway:Ropeway,groundAt:(e:number,n:number)=>number|undefined,externalBlocked?:(probe:SummitSweepProbe)=>boolean):NightBSummitSweepAudit{
 let samples=0,minClearance=Infinity,minMoving=Infinity,groundHits=0,obstacleHits=0,missingHeights=0,firstGround:SummitSweepProbe|undefined,firstObstacle:SummitSweepProbe|undefined;
 for(const [index,r] of ropeway.cable.ropes.entries()){
  const steps=Math.ceil(r.totalMetres/.5);
  // Include every original rope corner, with both segment orientations.
  const distances=new Set<number>(Array.from({length:steps+1},(_,i)=>r.totalMetres*i/steps));
  let along=0;for(let i=1;i<r.points.length;i++){const a=r.points[i-1]!,b=r.points[i]!;along+=Math.hypot(b.east-a.east,b.north-a.north,b.height-a.height);distances.add(along);if(along<r.totalMetres)distances.add(Math.min(r.totalMetres,along+.000001));}
  for(const distance of [...distances].sort((a,b)=>a-b)){
   const p=r.sample(distance),terminalDistance=Math.min(distance,r.totalMetres-distance);
   const feet={east:p.east,north:p.north,height:p.height-summitCableSpec.cabinFloorBelowRope};
   const probe:SummitSweepProbe={cabin:index as 0|1,feet,heading:p.heading,halfWidth:1.22,halfLength:1.52,bodyTop:2.48,distance,terminalDistance};
   let max=-Infinity,unknown=false;
   for(let i=0;i<=6;i++)for(let j=0;j<=8;j++){
    const x=(i/3-1)*probe.halfWidth,z=(j/4-1)*probe.halfLength;
    const h=groundAt(feet.east+x*Math.cos(p.heading)+z*Math.sin(p.heading),feet.north-x*Math.sin(p.heading)+z*Math.cos(p.heading));samples++;
    if(h===undefined||!Number.isFinite(h)){missingHeights++;unknown=true;}else max=Math.max(max,h);
   }
   const margin=unknown?-Infinity:feet.height-max;
   minClearance=Math.min(minClearance,margin);if(terminalDistance>=8)minMoving=Math.min(minMoving,margin);
   if(margin+.001<.25*clamp(terminalDistance/8)){groundHits++;firstGround??=probe;}
   if(externalBlocked?.(probe)){obstacleHits++;firstObstacle??=probe;}
  }
 }
 return Object.freeze({samples,minClearance,minMoving,groundHits,obstacleHits,missingHeights,firstGround,firstObstacle,externalSurveyed:!!externalBlocked,candidateEnvelopeClear:!!externalBlocked&&groundHits===0&&obstacleHits===0&&missingHeights===0&&minMoving>=.25-.001});
}
export type NightBLine2ServiceInput=Readonly<{
 ropeway:Ropeway; audit:NightBSummitSweepAudit;
 state:()=>Za36CableRepairState|undefined;
 /** Authoritative service clock. Undefined while not synchronized. */
 now:()=>number|undefined;
 dispatch?:CableDispatchInput;
 firstRun?:CableFirstRunInput;
 daylight:()=>boolean|undefined;
 /** Includes the final terrain, station, other buildings and route owner collision. */
 dockClear:(station:Station,feet:SummitCablePoint)=>boolean;
}>;
export function createNightBLine2Service(input:NightBLine2ServiceInput){
 const r=input.ropeway;
 const physical=input.audit.candidateEnvelopeClear&&input.audit.externalSurveyed&&r.decks.length===4&&r.decks.every(d=>!d.interference);
 const firstMs=r.cable.legMs;
 const first=()=>{const t=input.now(),f=input.firstRun,state=input.state();if(!f||t===undefined||state?.line!==2||(state.stage!=='dormant'&&f.wokeAt()===undefined))return;return cableFirstRunTimeline(t,state.stage==='dormant'?undefined:f.wokeAt(),state.stage==='full-line'?f.openedAt():undefined,f.dawnEpoch(),firstMs,0);};
 const dispatch=()=>{const t=input.now();if(typeof t!=='number'||!Number.isFinite(t))return;
  if(input.firstRun){const f=input.firstRun,state=input.state();if(state?.line!==2||state.stage!=='full-line')return;return cableFirstRunServiceDispatch(t,f.wokeAt(),f.openedAt(),f.dawnEpoch(),firstMs,0,r.cable.legMs);}
  return input.dispatch?nightBCableDispatch(t,input.dispatch.openedAt(),input.dispatch.dawnEpoch(),r.cable.legMs):{virtualMs:t,boarding:true,parked:false};};
 const phaseAt=(t:number)=>r.cable.cabinsAt((input.firstRun||input.dispatch)?r.epochMs+t:t);
 const time=()=>dispatch()?.virtualMs;
 const serviceOpen=()=>{const state=input.state();return physical&&state?.line===2&&state.stage==='full-line'&&input.daylight()===true&&dispatch()?.boarding===true};
 type States=ReturnType<typeof r.cable.cabinsAt>;
 const upper=()=>r.cable.cabinsAt(r.epochMs+r.cable.legMs)[0];
 const other=()=>({...r.cable.cabinsAt(r.epochMs)[1],canBoardOrExit:false});
 const dormant=():States=>[{...upper(),canBoardOrExit:false},other()];
 let lastStates:States=input.firstRun?dormant():r.cable.cabinsAt(r.epochMs);
 function cabinStates():States|undefined{
  if(!physical)return;
  const t=time();if(t!==undefined)return phaseAt(t);
  if(!input.firstRun)return;
  const f=first();if(!f)return;
  if(f.phase==='dormant')return dormant();
  if(f.phase==='first'){
   const active=r.cable.cabinsAt(r.epochMs+r.cable.legMs+f.elapsed)[0];
   return [{...active,canBoardOrExit:active.canBoardOrExit&&f.boarding},other()];
  }
  if(f.phase==='waiting-repair')return [r.cable.cabinsAt(r.epochMs)[0],other()];
 }
 const valid=(ride:SummitCableRide)=>ride.cabinIndex===0||ride.cabinIndex===1;
 function present(){const states=cabinStates();if(states)lastStates=states;return r.updateStates(lastStates);}
 const near=(a:SummitCablePoint,b:SummitCablePoint)=>Math.hypot(a.east-b.east,a.north-b.north)<=.900000001&&Math.abs(a.height-b.height)<=.430000001;
 return {physical,ropeway:r,serviceOpen,present,dispatch,cabinStates,firstRun:first,firstMs,
  board(feet:SummitCablePoint,cabin:0|1){
   if(!physical||![feet.east,feet.north,feet.height].every(Number.isFinite)||(cabin!==0&&cabin!==1))return;
   const f=first(),at=cabinStates()?.[cabin];
   const firstBoard=input.firstRun&&cabin===0&&f?.phase==='first'&&f.boarding&&f.elapsed<r.terminalDwellMs&&input.daylight()===true;
   if((!serviceOpen()&&!firstBoard)||!at?.station||!input.dockClear(at.station,feet))return;
   const d=r.cable.ropes[cabin].dock(at.station);
   if(input.dockClear(at.station,d.approach)&&input.dockClear(at.station,d.board)&&(near(feet,d.approach)||near(feet,d.board)))return {cabinIndex:cabin};
  },
  ridePose(ride:SummitCableRide){if(!valid(ride))return;const at=cabinStates()?.[ride.cabinIndex];if(!at)return;const {east,north,height,heading}=at.ropePoint;return {...at,feet:{east,north,height:height-summitCableSpec.cabinFloorBelowRope},heading,whiteout:at.phase==='whiteout'};},
  exit(ride:SummitCableRide){if(!valid(ride))return;const at=cabinStates()?.[ride.cabinIndex];if(!at?.station||!at.canBoardOrExit)return;const feet=r.cable.ropes[ride.cabinIndex].dock(at.station).approach;if(input.dockClear(at.station,feet))return feet;},
 };
}
