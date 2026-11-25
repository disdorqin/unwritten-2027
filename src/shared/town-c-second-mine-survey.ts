import {secondMineAnchors,secondMineRooms,secondMineRiver} from './underground-second-mine-layout.js';
import {secondMineDrySites} from './underground-second-mine-dry-wings.js';
/** Read-only survey of C's actual -140 model. All coordinates are in its ENY
 * local metre frame. The registration callback must be supplied by the existing
 * world host; this data cannot create a Presence room or issue a transition. */
export type MinePoint=Readonly<{east:number;north:number;height:number}>;
export type SecondMineFrame=MinePoint&Readonly<{domainId:string;yaw:number}>;
export const secondMineSurvey=Object.freeze({
 depth:-140 as const,
 bounds:Object.freeze({
   minEast:Math.min(...secondMineRooms.map(r=>r.x0)),maxEast:Math.max(...secondMineRooms.map(r=>r.x1)),
   minNorth:Math.min(...secondMineRooms.map(r=>r.n0)),maxNorth:Math.max(...secondMineRooms.map(r=>r.n1)),
   minHeight:secondMineRiver.bed,maxHeight:Math.max(...secondMineRooms.map(r=>r.ceiling))+1
 }),
 // Exact surveyed wet geometry, NOT state heights. C2 exclusively owns phase art.
 river:Object.freeze({minEast:secondMineRiver.x0,maxEast:secondMineRiver.x1,minNorth:secondMineRiver.n0,maxNorth:secondMineRiver.n1,bed:secondMineRiver.bed}),
 anchors:Object.freeze({...secondMineAnchors,...secondMineDrySites}),
});
export type SurveyRegistration=Readonly<{
 frame:SecondMineFrame;
 acceptsGeometry(frame:SecondMineFrame,survey:typeof secondMineSurvey):boolean;
 acceptsFoot(frame:SecondMineFrame,role:'entry'|'exit'|'nearPier'|'farPier',foot:MinePoint):boolean;
}>;
const valid=(p:MinePoint)=>[p.east,p.north,p.height].every(Number.isFinite);
export function resolveSecondMineSurvey(registration?:SurveyRegistration){
 if(!registration)return {kind:'unregistered'} as const;
 const {frame:input,acceptsGeometry,acceptsFoot}=registration;
 if(!input.domainId.trim()||input.domainId==='underground/mine'||!valid(input)||!Number.isFinite(input.yaw)||input.height!==-140)return {kind:'invalid-frame'} as const;
 const frame=Object.freeze({...input});
 if(!acceptsGeometry(frame,secondMineSurvey))return {kind:'unsupported-geometry'} as const;
 const c=Math.cos(frame.yaw),s=Math.sin(frame.yaw);
 function toWorld(local:MinePoint):MinePoint{
   return {east:frame.east+c*local.east-s*local.north,north:frame.north+s*local.east+c*local.north,height:frame.height+local.height};
 }
 function toLocal(world:MinePoint):MinePoint{
   const e=world.east-frame.east,n=world.north-frame.north;
   return {east:c*e+s*n,north:-s*e+c*n,height:world.height-frame.height};
 }
 const required=['entry','exit','nearPier','farPier'] as const;
 const anchors=Object.fromEntries(required.map(role=>[role,toWorld({...secondMineAnchors[role],height:0})])) as Record<typeof required[number],MinePoint>;
 if(required.some(role=>!acceptsFoot(frame,role,anchors[role])))return {kind:'unsupported-foot'} as const;
 return {kind:'ready',frame,survey:secondMineSurvey,toWorld,toLocal,anchors:Object.freeze(anchors)} as const;
}
