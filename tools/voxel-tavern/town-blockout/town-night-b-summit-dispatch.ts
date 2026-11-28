import {townDayMs,townDaylightMs} from '../../../src/shared/town-night-window';
export type CableDispatch=Readonly<{virtualMs:number;boarding:boolean;parked:boolean}>;
export type CableDispatchInput=Readonly<{openedAt:()=>number|undefined;dawnEpoch:()=>number|undefined}>;
/** Deterministic complete daytime legs. Do not start a trip that cannot
 * reach a station before dusk; park at that terminal through the night.
 * No local accumulated delta, no jump from a parked cab on repair or join.
 * The public host must supply its actual server opening and calendar epochs. */
export function nightBCableDispatch(realNow:number,openedAt:number|undefined,dawnEpoch:number|undefined,legMs:number):CableDispatch|undefined{
 if(!Number.isFinite(realNow)||!Number.isSafeInteger(openedAt)||!Number.isSafeInteger(dawnEpoch)||openedAt===undefined||dawnEpoch===undefined||dawnEpoch<0||openedAt<dawnEpoch||!Number.isFinite(legMs)||legMs<=0||legMs>townDaylightMs)return;
 if(realNow<openedAt)return {virtualMs:0,boarding:false,parked:true};
 const first=Math.floor((openedAt-dawnEpoch)/townDayMs),today=Math.floor((realNow-dawnEpoch)/townDayMs);
 const firstStart=openedAt-dawnEpoch-first*townDayMs;
 const firstLegs=Math.max(0,Math.floor((townDaylightMs-firstStart)/legMs));
 const ordinaryLegs=Math.floor(townDaylightMs/legMs);
 const before=today===first?0:firstLegs+(today-first-1)*ordinaryLegs;
 const start=today===first?firstStart:0,capacity=today===first?firstLegs:ordinaryLegs;
 const elapsed=Math.max(0,realNow-dawnEpoch-today*townDayMs-start);
 const active=capacity>0&&elapsed<capacity*legMs&&realNow-dawnEpoch-today*townDayMs>=start;
 const completed=active?Math.floor(elapsed/legMs):capacity;
 const local=active?elapsed-completed*legMs:0;
 // A bounded phase avoids accumulated floating-point loss at exact docks.
 const virtualMs=((before+completed)%2)*legMs+local;
 return {virtualMs,boarding:active,parked:!active};
}
