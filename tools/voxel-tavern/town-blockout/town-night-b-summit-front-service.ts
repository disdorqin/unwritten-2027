import {nightBCableDispatch,type CableDispatchInput} from './town-night-b-summit-dispatch';
import {createNorthRidgeCableClock} from './north-ridge-cable-clock';
import type {surveyRidgeCableSpans,auditRidgeCableSweep} from './town-d-r30-cable-facilities';
import type {Za36CableRepairState} from './town-za36-cable-repair';
type Survey=ReturnType<typeof surveyRidgeCableSpans>;
type Audit=ReturnType<typeof auditRidgeCableSweep>;
type Foot={east:number;north:number;height:number};
type Cabin=0|1;
type Station='base'|'middle'|'summit';
type Ride=Readonly<{cabin:Cabin}>;
export type FrontCableServiceInput=Readonly<{
 survey:Survey; audit:Audit;
 /** Must be the actual authoritative state and shared clock, not a local reducer. */
 state:()=>Za36CableRepairState|undefined;
 now:()=>number|undefined;
 dispatch?:CableDispatchInput;
 daylight:()=>boolean|undefined;
 /** The host certifies real deck/approach support and external obstruction. */
 dockClear:(station:Station,foot:Foot)=>boolean;
}>;
export const frontCableTerminalDwellMs=10_000;
export function createNightBFrontService(input:FrontCableServiceInput){
 const s=input.survey,clock=createNorthRidgeCableClock(s.lowerMetres,s.length-s.lowerMetres,0,frontCableTerminalDwellMs);
 const legacy=createNorthRidgeCableClock(s.lowerMetres,s.length-s.lowerMetres,0);
 if(s.path.length!==s.measure.length||s.path.length<2||s.measure[0]!==0||Math.abs(s.measure.at(-1)!-s.length)>.001||
    s.measure.some((m,i)=>!Number.isFinite(m)||(i>0&&m<=s.measure[i-1]!)))throw Error('Invalid surveyed cable measures');
 const physical=input.audit.externalSurveyed&&input.audit.candidateEnvelopeClear&&input.audit.groundHits===0&&input.audit.obstacleHits===0&&input.audit.minMoving>=.25;
 function sample(distance:number,cabin:Cabin):Foot{
  let lo=0,hi=s.measure.length-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(s.measure[mid]!<=distance)lo=mid;else hi=mid;}
  const a=s.path[lo]!,b=s.path[hi]!,t=Math.max(0,Math.min(1,(distance-s.measure[lo]!)/(s.measure[hi]!-s.measure[lo]!)));
  return {east:a.east+(b.east-a.east)*t+(cabin===0?-1.55:1.55),north:a.north+(b.north-a.north)*t,height:a.height+(b.height-a.height)*t};
 }
 const dispatch=()=>{const t=input.now();if(typeof t!=='number'||!Number.isFinite(t))return;return input.dispatch?nightBCableDispatch(t,input.dispatch.openedAt(),input.dispatch.dawnEpoch(),clock.oneWayMs):{virtualMs:t,boarding:true,parked:false};};
 const time=()=>dispatch()?.virtualMs;
 function serviceOpen(){const state=input.state();return physical&&state?.line===1&&state.stage==='full-line'&&input.daylight()===true&&dispatch()?.boarding===true;}
 function cabinsAt(t:number){return clock.cabinsAt(t).map((c,i)=>({...c,feet:sample(c.distanceMetres,i as Cabin)}));}
 /** Map the SAME timetable onto the existing production cabin presentation,
  * which consumes the original no-terminal-dwell clock. No speed changes. */
 function presentationMs(t:number){
  const p=((t%clock.cycleMs)+clock.cycleMs)%clock.cycleMs,down=p>=clock.oneWayMs;
  const leg=p-(down?clock.oneWayMs:0);return (down?legacy.oneWayMs:0)+Math.max(0,leg-frontCableTerminalDwellMs);
 }
 function board(foot:Foot,cabin:Cabin):Ride|undefined{
  const t=time();if(t===undefined||!serviceOpen()||(cabin!==0&&cabin!==1))return;
  const at=cabinsAt(t)[cabin]!;if(!at.station||!input.dockClear(at.station,foot))return;
  if(Math.hypot(foot.east-at.feet.east,foot.north-at.feet.north)>.9||Math.abs(foot.height-at.feet.height)>.43)return;
  return Object.freeze({cabin});
 }
 let lastPresentation=0;
 return {clock,physical,serviceOpen,cabinsAt,presentationMs,board,dispatch,
  presentationTime(){const t=time();if(physical&&t!==undefined)lastPresentation=presentationMs(t);return lastPresentation;},
  ridePose(ride:Ride){const t=time();if(t===undefined)return;return cabinsAt(t)[ride.cabin];},
  exit(ride:Ride){const t=time();if(t===undefined)return;const at=cabinsAt(t)[ride.cabin];if(!at?.station)return;
   // The surveyed deck supports the cabin floor; host must supply actual clear exit.
   const p={...at.feet,north:at.feet.north-2.1};return input.dockClear(at.station,p)?p:undefined;
  }
 };
}
