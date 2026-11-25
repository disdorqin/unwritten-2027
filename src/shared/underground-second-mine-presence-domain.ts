import {secondMineAnchors,canStandSecondMine} from './underground-second-mine-layout.js';
import {resolveSecondMineSurvey,secondMineSurvey,type MinePoint,type SurveyRegistration} from './town-c-second-mine-survey.js';

/** Batch98/103 production datum. B-01 road derives this yaw from the
 * canonical rim radius 55, seam N159, centre N185, start bearing .7.
 * Actual mounted first mine host must agree before any transfer is enabled. */
export const firstMineConnectionDatum=Object.freeze({
 landing:Object.freeze({east:-119,north:189,height:-90}),
 localPool:Object.freeze([0,-90,2] as const),
 yaw:Math.atan2(Math.sqrt(55**2-26**2),-26)-.7,
});
export const firstMineDownFootLocal=Object.freeze([-13,-91,134] as const);
function firstMineWorld(local:readonly [number,number,number]):MinePoint{
 const {landing,yaw,localPool}=firstMineConnectionDatum,c=Math.cos(yaw),s=Math.sin(yaw);
 const x=local[0]-localPool[0],z=local[2]-localPool[2];
 return {east:landing.east+c*x+s*z,north:landing.north+s*x-c*z,height:landing.height+local[1]-localPool[1]};
}
export const firstMineDownFoot=Object.freeze(firstMineWorld(firstMineDownFootLocal));
export const secondMineDomainId='underground/mine-2';
export const secondMinePresencePath='/presence-mine-2';
export function secondMinePresenceEndpoint(path:string){
 if(path!=='/presence'&&!path.startsWith('/presence/'))throw Error('Invalid presence route');
 return secondMinePresencePath+path.slice('/presence'.length);
}
const yaw=firstMineConnectionDatum.yaw+Math.PI;
const c=Math.cos(yaw),s=Math.sin(yaw);
// Entry local (0,2,0) vertically aligned to the -91 departure foot.
// No lateral jump, no overlap with the crystal gate; the actual shaft/corridor
// crossing is separately accepted by the existing movement authority.
export const secondMineWorldFrame=Object.freeze({
 domainId:secondMineDomainId,east:firstMineDownFoot.east+s*secondMineAnchors.entry.north,
 north:firstMineDownFoot.north-c*secondMineAnchors.entry.north,height:-140,yaw,
});
export function secondMineToWorld(p:MinePoint):MinePoint{
 return {east:secondMineWorldFrame.east+c*p.east-s*p.north,north:secondMineWorldFrame.north+s*p.east+c*p.north,height:secondMineWorldFrame.height+p.height};
}
export function secondMineToLocal(p:MinePoint):MinePoint{
 const e=p.east-secondMineWorldFrame.east,n=p.north-secondMineWorldFrame.north;
 return {east:c*e+s*n,north:-s*e+c*n,height:p.height-secondMineWorldFrame.height};
}
export const secondMinePresenceOrigin=Object.freeze({east:-20,north:30,height:-155});
export const secondMinePresenceBounds=Object.freeze({width:240,depth:190,height:26});
/** Feet room. Visual roof may extend above the foot box. Room ends at -129:
 * first mine starts -128, the -165 city is below -155, so no overlap. */
export function isSecondMinePresenceFoot(east:number,north:number,height:number){
 const o=secondMinePresenceOrigin,b=secondMinePresenceBounds;
 return [east,north,height].every(Number.isFinite)&&east>=o.east&&east<=o.east+b.width&&north>=o.north&&north<=o.north+b.depth&&height>=o.height&&height<=o.height+b.height;
}
type Position={east:number;north:number;height:number};
export function toSecondMinePresencePose<T extends Position>(p:T):T|undefined{
 if(!isSecondMinePresenceFoot(p.east,p.north,p.height))return;
 const o=secondMinePresenceOrigin;
 return {...p,east:p.east-o.east,north:p.north-o.north,height:p.height-o.height};
}
export function fromSecondMinePresencePose<T extends Position>(p:T):T|undefined{
 const o=secondMinePresenceOrigin,q={...p,east:p.east+o.east,north:p.north+o.north,height:p.height+o.height};
 return isSecondMinePresenceFoot(q.east,q.north,q.height)?q:undefined;
}
const required=['entry','exit','nearPier','farPier'] as const;
export const secondMineRegisteredFeet=Object.freeze(Object.fromEntries(required.map(k=>[k,Object.freeze(secondMineToWorld({...secondMineAnchors[k],height:0}))])) as Record<typeof required[number],MinePoint>);
export const secondMineConnections=Object.freeze({
 downFromFirst:Object.freeze({fromDomain:'underground/mine',from:firstMineDownFoot,toDomain:secondMineDomainId,to:secondMineRegisteredFeet.entry}),
 returnToFirst:Object.freeze({fromDomain:secondMineDomainId,from:secondMineRegisteredFeet.entry,toDomain:'underground/mine',to:firstMineDownFoot}),
 towardWarrior:Object.freeze({fromDomain:secondMineDomainId,from:secondMineRegisteredFeet.exit,targetDepth:-165,arrivalStatus:'awaiting-city-registration' as const}),
 ferry:Object.freeze({near:secondMineRegisteredFeet.nearPier,far:secondMineRegisteredFeet.farPier}),
});
function same(a:MinePoint,b:MinePoint){return Math.hypot(a.east-b.east,a.north-b.north,a.height-b.height)<1e-6}
/** Actual domain registration for the existing second-mine layout; the
 * connection points are facts, NOT permission to teleport. */
export const secondMineProductionRegistration:SurveyRegistration=Object.freeze({
 frame:secondMineWorldFrame,
 acceptsGeometry(frame,survey){
  if(frame.domainId!==secondMineDomainId||frame.yaw!==yaw||!same(frame,secondMineWorldFrame)||survey!==secondMineSurvey)return false;
  const b=survey.bounds;
  return [b.minEast,b.maxEast].every(e=>[b.minNorth,b.maxNorth].every(n=>{
    const p=secondMineToWorld({east:e,north:n,height:b.minHeight});
    return isSecondMinePresenceFoot(p.east,p.north,p.height);
  }));
 },
 acceptsFoot(frame,role,foot){
  if(frame.domainId!==secondMineDomainId||!same(foot,secondMineRegisteredFeet[role])||!isSecondMinePresenceFoot(foot.east,foot.north,foot.height))return false;
  const p=secondMineToLocal(foot);
  return (['high','middle','low'] as const).every(state=>canStandSecondMine(p.east,p.north,state));
 },
});
export function resolveRegisteredSecondMine(){return resolveSecondMineSurvey(secondMineProductionRegistration)}
