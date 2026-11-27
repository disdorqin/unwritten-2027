import {nightBCableDispatch,type CableDispatchInput} from './town-night-b-summit-dispatch';
import {cableFirstRunTimeline,cableFirstRunServiceDispatch,type CableFirstRunInput} from './town-night-b-summit-first-run';
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
 /** Production first trip; mutually exclusive with the legacy dispatch adapter. */
 firstRun?:CableFirstRunInput;
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
 const firstMs=frontCableTerminalDwellMs+Math.ceil((s.length-s.lowerMetres)*200),repositionMs=Math.ceil(s.lowerMetres*200);
 const first=()=>{const t=input.now(),f=input.firstRun,state=input.state();if(!f||t===undefined||state?.line!==1||(state.stage!=='dormant'&&f.wokeAt()===undefined))return;return cableFirstRunTimeline(t,state.stage==='dormant'?undefined:f.wokeAt(),state.stage==='full-line'?f.openedAt():undefined,f.dawnEpoch(),firstMs,repositionMs,true);};
 const dispatch=()=>{const t=input.now();if(typeof t!=='number'||!Number.isFinite(t))return;
  if(input.firstRun){const f=input.firstRun,state=input.state();if(state?.line!==1||state.stage!=='full-line')return;return cableFirstRunServiceDispatch(t,f.wokeAt(),f.openedAt(),f.dawnEpoch(),firstMs,repositionMs,clock.oneWayMs,true);}
  return input.dispatch?nightBCableDispatch(t,input.dispatch.openedAt(),input.dispatch.dawnEpoch(),clock.oneWayMs):{virtualMs:t,boarding:true,parked:false};};
 const time=()=>dispatch()?.virtualMs;
 function serviceOpen(){const state=input.state();return physical&&state?.line===1&&state.stage==='full-line'&&input.daylight()===true&&dispatch()?.boarding===true;}
 function cabinsAt(t:number){return clock.cabinsAt(t).map((c,i)=>({...c,feet:sample(c.distanceMetres,i as Cabin)}));}
 type State=ReturnType<typeof cabinsAt>[number];
 const stopped=(cabin:Cabin,distanceMetres:number,station:Station|null):State=>({direction:'down',distanceMetres,station,feet:sample(distanceMetres,cabin)});
 const initial=()=>[stopped(0,s.length,'summit'),stopped(1,s.length,'summit')];
 let lastStates=initial();
 function cabinStates():State[]|undefined{
  if(!physical)return;
  const t=time();
  if(t!==undefined)return cabinsAt(t);
  if(!input.firstRun)return;
  const f=first();if(!f)return;
  const other=stopped(1,s.length,'summit');
  if(f.phase==='dormant')return initial();
  if(f.phase==='first'){
   const fraction=Math.max(0,Math.min(1,(f.elapsed-frontCableTerminalDwellMs)/(firstMs-frontCableTerminalDwellMs)));
   return [stopped(0,s.length-(s.length-s.lowerMetres)*fraction,f.elapsed<=frontCableTerminalDwellMs?'summit':null),other];
  }
  if(f.phase==='waiting-repair')return [stopped(0,s.lowerMetres,'middle'),other];
  if(f.phase==='reposition')return [stopped(0,s.lowerMetres*(1-f.elapsed/repositionMs),f.elapsed===0?'middle':null),other];
  return;
 }
 function present(){const states=cabinStates();if(states)lastStates=states;return lastStates;}
 /** Map the SAME timetable onto the existing production cabin presentation,
  * which consumes the original no-terminal-dwell clock. No speed changes. */
 function presentationMs(t:number){
  const p=((t%clock.cycleMs)+clock.cycleMs)%clock.cycleMs,down=p>=clock.oneWayMs;
  const leg=p-(down?clock.oneWayMs:0);return (down?legacy.oneWayMs:0)+Math.max(0,leg-frontCableTerminalDwellMs);
 }
 function board(foot:Foot,cabin:Cabin):Ride|undefined{
  if((cabin!==0&&cabin!==1)||!physical||![foot.east,foot.north,foot.height].every(Number.isFinite))return;
  const f=first(),at=cabinStates()?.[cabin];
  const firstBoard=input.firstRun&&cabin===0&&f?.phase==='first'&&f.boarding&&f.elapsed<frontCableTerminalDwellMs&&input.daylight()===true;
  if((!serviceOpen()&&!firstBoard)||!at?.station||!input.dockClear(at.station,foot))return;
  const approach={...at.feet,north:at.feet.north-2.1};
  const near=(p:Foot)=>Math.hypot(foot.east-p.east,foot.north-p.north)<=.900000001&&Math.abs(foot.height-p.height)<=.430000001;
  // The walking approach used on exit must also be a legal boarding point.
  if(!input.dockClear(at.station,approach)||!input.dockClear(at.station,at.feet)||(!near(at.feet)&&!near(approach)))return;
  return Object.freeze({cabin});
 }
 let lastPresentation=0;
 return {clock,survey:s,physical,serviceOpen,cabinsAt,presentationMs,board,dispatch,firstRun:first,firstMs,repositionMs,cabinStates,present,
  presentationTime(){const t=time();if(physical&&t!==undefined)lastPresentation=presentationMs(t);return lastPresentation;},
  ridePose(ride:Ride){return cabinStates()?.[ride.cabin];},
  exit(ride:Ride){const at=cabinStates()?.[ride.cabin];if(!at?.station)return;
   // The surveyed deck supports the cabin floor; host must supply actual clear exit.
   const p={...at.feet,north:at.feet.north-2.1};return input.dockClear(at.station,p)?p:undefined;
  }
 };
}
