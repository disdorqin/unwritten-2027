import {firstMineDownFoot,firstMineDownFootLocal,firstMineConnectionDatum,secondMineConnections,secondMineRegisteredFeet,secondMineWorldFrame,secondMinePresenceOrigin,secondMinePresenceBounds,resolveRegisteredSecondMine} from '../../../src/shared/underground-second-mine-presence-domain.js';
import {minePresenceOrigin,minePresenceBounds,isMinePresenceFoot} from '../../../src/shared/underground-mine-presence-domain.js';
import type {resolveUndergroundShaftRegistration} from '../../../src/presence/underground-shaft-registration.js';
import type {surveyZa31CraterWinch} from './town-za31-crater-winch.js';
type Point=Readonly<{east:number;north:number;height:number}>;
type DomainPoint=Point&Readonly<{domainId:string}>;
type Local=readonly [number,number,number];
type Registration=ReturnType<typeof resolveUndergroundShaftRegistration>;
type Winch=NonNullable<ReturnType<typeof surveyZa31CraterWinch>>;
type Protection=Readonly<{id:string;centre:Point;radius:number}>;
type Options=Readonly<{
 registration:Registration;winch:Winch;mineYaw:number;
 toWorld(local:Local):Point|undefined;
 supportsMineFoot(local:Local):boolean;
 supportAt(east:number,north:number):number|undefined;
 lampRoom?:Readonly<{east:number;north:number;radius:number}>;
}>;
const finite=(p:Point)=>[p.east,p.north,p.height].every(Number.isFinite);
const close=(a:Point,b:Point,eps=.01)=>Math.hypot(a.east-b.east,a.north-b.north,a.height-b.height)<=eps;
function segmentDistance(e:number,n:number,a:Point,b:Point){
 const x=b.east-a.east,z=b.north-a.north,d=x*x+z*z;
 const t=d===0?0:Math.max(0,Math.min(1,((e-a.east)*x+(n-a.north)*z)/d));
 return Math.hypot(e-a.east-t*x,n-a.north-t*z);
}
/** Geometry/placement contract only. B consumes protected areas; A/authority
 * consume registered endpoints. Neither a matching footprint nor a valid
 * coordinate grants a well open, story unlock, movement or room transfer. */
export function resolveR30ShaftContract(o:Options){
 if(o.registration.kind!=='ready')return {kind:'unregistered-shaft'} as const;
 const {shaftFoot,winch,firstFallLanding,depthLine}=o.registration.connection;
 if(![shaftFoot,winch,firstFallLanding].every(finite)||!Number.isFinite(o.mineYaw))return {kind:'invalid-datum'} as const;
 if(!close(winch,o.winch.useFoot)||!close(firstFallLanding,firstMineConnectionDatum.landing))return {kind:'mismatched-datum'} as const;
 const supported=(p:Point)=>{const h=o.supportAt(p.east,p.north);return h!==undefined&&Number.isFinite(h)&&Math.abs(h-p.height)<=.01};
 if(![shaftFoot,o.winch.useFoot,o.winch.plinth,o.winch.crane,...o.winch.descentApproach,o.winch.snakeStoneReservation].every(supported))return {kind:'unsupported-surface'} as const;
 const protection:Protection[]=[
  {id:'shaft',centre:shaftFoot,radius:55/30+.75},
  {id:'winch-machine',centre:o.winch.plinth,radius:1.2},
  {id:'crane',centre:o.winch.crane,radius:1.2},
  {id:'winch-use',centre:o.winch.useFoot,radius:.7+.27},
  {id:'snake-stone',centre:o.winch.snakeStoneReservation,radius:o.winch.snakeStoneReservation.radius+.27},
 ];
 if(o.lampRoom){
  const {east,north,radius}=o.lampRoom,height=o.supportAt(east,north);
  if(height===undefined||![east,north,radius,height].every(Number.isFinite)||radius<=0)return {kind:'unsupported-lamp-room'} as const;
  protection.push({id:'lamp-room',centre:{east,north,height},radius:radius+.4});
 }
 const approach=o.winch.descentApproach.map(p=>Object.freeze({...p}));
 function protectedAt(east:number,north:number,margin=0){
  if(![east,north,margin].every(Number.isFinite)||margin<0)return true;
  return protection.some(p=>Math.hypot(east-p.centre.east,north-p.centre.north)<=p.radius+margin)||
   approach.slice(1).some((p,i)=>segmentDistance(east,north,approach[i],p)<=1.25+margin);
 }
 // The already registered second mine is reused. No independent transform
 // may be minted by this host; a shifted mine frame blocks only this seam.
 const down=o.toWorld(firstMineDownFootLocal);
 const second=resolveRegisteredSecondMine();
 const headingMatches=Math.abs(Math.atan2(Math.sin(o.mineYaw-firstMineConnectionDatum.yaw),Math.cos(o.mineYaw-firstMineConnectionDatum.yaw)))<1e-6;
 const deep=headingMatches&&down&&close(down,firstMineDownFoot)&&
   o.supportsMineFoot(firstMineDownFootLocal)&&isMinePresenceFoot(down.east,down.north,down.height)&&second.kind==='ready'
   ?{kind:'registered' as const,frame:secondMineWorldFrame,room:{origin:secondMinePresenceOrigin,bounds:secondMinePresenceBounds},connections:secondMineConnections,feet:secondMineRegisteredFeet}
   :{kind:'blocked' as const,reason:'first-mine-seam-mismatch-or-unready'};
 const point=(p:DomainPoint)=>Object.freeze({...p});
 return {kind:'ready',surface:{shaft:point(shaftFoot),winch:Object.freeze({...winch}),depthLine,
   protection:Object.freeze(protection.map(p=>Object.freeze({...p,centre:Object.freeze({...p.centre})}))),
   approach:Object.freeze(approach),approachHalfWidth:1.25,protectedAt},
  firstMine:{entry:point(firstFallLanding),returnToSurface:point(shaftFoot),room:{origin:minePresenceOrigin,bounds:minePresenceBounds}},
  deep,
 } as const;
}
