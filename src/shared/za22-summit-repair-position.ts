import {fromSummitPresencePose} from './za22-summit-presence-domain.js';
import type {Za36CableRepairEvent,Za36CableRepairLine} from './za36-cable-repair.js';
/** Shared with the actual R30 workshop. Local frame (assembly origin
 * E300/N676), not compressed room coordinates. */
export const r30WorkshopAnchor=Object.freeze({east:-21,north:22,floor:347});
const local=(x:number,z:number)=>Object.freeze({east:r30WorkshopAnchor.east+z,north:r30WorkshopAnchor.north+x});
export const r30WorkshopRepairAnchors=Object.freeze({brake:local(-1.25,-2.28),cableWheel:local(-1.25,1.25),weightTower:local(1.25,2.2),weightFrame:local(.8,-2.8)});
type Record=Readonly<{east:number;north:number;height:number}>;
/** Server-accepted pose location gate (not proof of an unmodified client).
 * 2.2m action reach plus a small wire quantization allowance. */
export function isSummitWorkshopRepairRecord(event:Za36CableRepairEvent,record?:Record){
 if(!record||event.kind==='wake')return false;
 const p=fromSummitPresencePose({east:record.east/100,north:record.north/100,height:record.height/100});
 if(!p||Math.abs(p.height-r30WorkshopAnchor.floor)>.48)return false;
 const a=event.kind==='strike-rust'||event.kind==='pull-brake'?r30WorkshopRepairAnchors.brake:
 event.kind==='take-weight'?r30WorkshopRepairAnchors.weightTower:event.kind==='hang-weight'?r30WorkshopRepairAnchors.weightFrame:r30WorkshopRepairAnchors.cableWheel;
 return Math.hypot(p.east-300-a.east,p.north-676-a.north)<=2.24;
}
/** Production town/mountain/west do not accept second-line repair events. */
export function authorizeOutdoorCableRepair(line:Za36CableRepairLine){return line===1;}
export function authorizeRearCableRepair(line:Za36CableRepairLine,event:Za36CableRepairEvent,record?:Record){return line===2&&isSummitWorkshopRepairRecord(event,record);}
