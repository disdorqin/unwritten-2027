import {nightBCableDispatch,type CableDispatchInput} from './town-night-b-summit-dispatch';
import {summitCableSpec,type SummitCablePoint} from './main-summit-cable';
import {createMainSummitCableTravel,type SummitCableRide} from './main-summit-cable-travel';
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
 daylight:()=>boolean|undefined;
 /** Includes the final terrain, station, other buildings and route owner collision. */
 dockClear:(station:Station,feet:SummitCablePoint)=>boolean;
}>;
export function createNightBLine2Service(input:NightBLine2ServiceInput){
 const r=input.ropeway;
 const physical=input.audit.candidateEnvelopeClear&&input.audit.externalSurveyed&&r.decks.length===4&&r.decks.every(d=>!d.interference);
 const dispatch=()=>{const t=input.now();if(typeof t!=='number'||!Number.isFinite(t))return;return input.dispatch?nightBCableDispatch(t,input.dispatch.openedAt(),input.dispatch.dawnEpoch(),r.cable.legMs):{virtualMs:t,boarding:true,parked:false};};
 const time=()=>dispatch()?.virtualMs;
 const serviceOpen=()=>{const state=input.state();return physical&&state?.line===2&&state.stage==='full-line'&&input.daylight()===true&&dispatch()?.boarding===true};
 const travel=createMainSummitCableTravel(r.cable,({station,cabinIndex})=>{
  if(!serviceOpen())return false;
  const d=r.cable.ropes[cabinIndex].dock(station);
  return input.dockClear(station,d.approach)&&input.dockClear(station,d.board);
 });
 const valid=(ride:SummitCableRide)=>ride.cabinIndex===0||ride.cabinIndex===1;
 let lastPresentation=0;
 function present(){const t=time();if(physical&&t!==undefined)lastPresentation=t;return r.update(lastPresentation);}
 return {physical,serviceOpen,present,dispatch,
  board(feet:SummitCablePoint,cabin:0|1){const t=time();if(t===undefined||!serviceOpen()||![feet.east,feet.north,feet.height].every(Number.isFinite)||(cabin!==0&&cabin!==1))return;const at=r.cable.cabinsAt(t)[cabin];if(!at.station||!input.dockClear(at.station,feet))return;return travel.attemptBoard(t,cabin,feet);},
  ridePose(ride:SummitCableRide){const t=time();if(t!==undefined&&valid(ride))return travel.ridePose(t,ride);},
  exit(ride:SummitCableRide){const t=time();if(t===undefined||!valid(ride))return;const at=r.cable.cabinsAt(t)[ride.cabinIndex];if(!at.station)return;const feet=travel.exit(t,ride);if(feet&&input.dockClear(at.station,feet))return feet;},
 };
}
