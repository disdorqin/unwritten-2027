import {townDayMs,townDaylightMs} from '../../../src/shared/town-night-window';
import {nightBCableDispatch,type CableDispatch} from './town-night-b-summit-dispatch';
export type CableFirstRunInput=Readonly<{wokeAt:()=>number|undefined;openedAt:()=>number|undefined;dawnEpoch:()=>number|undefined}>;
export type CableFirstRunTimeline=Readonly<{phase:'dormant'|'first'|'waiting-repair'|'reposition'|'service';elapsed:number;boarding:boolean;dispatch?:CableDispatch}>;
/** Return first instant at which this complete run fits within daylight.
 * The original line-one impact exception runs empty even in the night;
 * all ordinary passenger dispatch and line-two release wait for daylight. */
export function nextCableDayRun(at:number,dawn:number,duration:number){
 if(!Number.isSafeInteger(at)||!Number.isSafeInteger(dawn)||at<dawn||!Number.isFinite(duration)||duration<=0||duration>townDaylightMs)return;
 const phase=(at-dawn)%townDayMs;
 return phase+duration<=townDaylightMs?at:at+townDayMs-phase;
}
/** One initial downhill trip, then an optional measured empty reposition.
 * Full-line repair cannot jump a car past either physical leg. A late joiner
 * computes precisely the same stage from immutable authority timestamps. */
export function cableFirstRunTimeline(realNow:number,wokeAt:number|undefined,openedAt:number|undefined,dawn:number|undefined,firstMs:number,repositionMs:number,nightWake=false):CableFirstRunTimeline|undefined{
 if(!Number.isFinite(realNow)||!Number.isSafeInteger(dawn)||dawn===undefined||!Number.isSafeInteger(firstMs)||firstMs<=0||!Number.isSafeInteger(repositionMs)||repositionMs<0)return;
 if(wokeAt===undefined)return {phase:'dormant',elapsed:0,boarding:false};
 if(!Number.isSafeInteger(wokeAt)||wokeAt<dawn)return;
 const start=nightWake?wokeAt:nextCableDayRun(wokeAt,dawn,firstMs);if(start===undefined)return;
 if(realNow<start)return {phase:'dormant',elapsed:0,boarding:false};
 const firstEnd=start+firstMs;
 if(realNow<firstEnd)return {phase:'first',elapsed:realNow-start,boarding:(realNow-dawn)%townDayMs<townDaylightMs&&(start-dawn)%townDayMs+firstMs<=townDaylightMs};
 if(openedAt===undefined)return {phase:'waiting-repair',elapsed:firstMs,boarding:false};
 if(!Number.isSafeInteger(openedAt)||openedAt<wokeAt)return;
 const ready=Math.max(openedAt,firstEnd);
 if(repositionMs===0)return {phase:'service',elapsed:0,boarding:false};
 const repositionStart=nextCableDayRun(ready,dawn,repositionMs);if(repositionStart===undefined)return;
 if(realNow<repositionStart)return {phase:'waiting-repair',elapsed:firstMs,boarding:false};
 if(realNow<repositionStart+repositionMs)return {phase:'reposition',elapsed:realNow-repositionStart,boarding:false};
 return {phase:'service',elapsed:0,boarding:false};
}
export function cableFirstRunServiceDispatch(realNow:number,wokeAt:number|undefined,openedAt:number|undefined,dawn:number|undefined,firstMs:number,repositionMs:number,legMs:number,nightWake=false){
 if(wokeAt===undefined||openedAt===undefined||dawn===undefined||!Number.isSafeInteger(wokeAt)||!Number.isSafeInteger(openedAt)||!Number.isSafeInteger(dawn)||wokeAt<dawn||openedAt<wokeAt||!Number.isSafeInteger(firstMs)||firstMs<=0||!Number.isSafeInteger(repositionMs)||repositionMs<0)return;
 const start=nightWake?wokeAt:nextCableDayRun(wokeAt,dawn,firstMs);if(start===undefined)return;
 const ready=Math.max(start+firstMs,openedAt);
 const repositionStart=repositionMs?nextCableDayRun(ready,dawn,repositionMs):ready;
 if(repositionStart===undefined||realNow<repositionStart+repositionMs)return;
 return nightBCableDispatch(realNow,repositionStart+repositionMs,dawn,legMs);
}
