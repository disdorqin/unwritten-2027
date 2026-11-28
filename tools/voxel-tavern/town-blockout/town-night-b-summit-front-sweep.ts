import {auditRidgeCableSweep,type mountRidgeCableFacilities} from './town-d-r30-cable-facilities';
import type {FrontRidgeR30Field} from './town-d-r30-front-ridge';
type Point={east:number;north:number;height:number};
type ExternalBlocked=(foot:Point,halfWidth:number,halfDepth:number,top:number)=>boolean;
/** Scan the actual open facility's collision volumes as well as the final
 * host's non-facility obstacles. The latter MUST be supplied by C2/A;
 * the isolated facility result alone never grants operating authority. */
export function auditNightBFrontOpenFacilities(field:FrontRidgeR30Field,facilities:ReturnType<typeof mountRidgeCableFacilities>,externalBlocked?:ExternalBlocked){
 const open=[-1,1].every(s=>{const g=facilities.group.getObjectByName('d-r30-cable-cabin-'+s);return !!g&&!g.getObjectByName('ridge-cable-parked-car-batch')});
 let ownHits=0,externalHits=0,probes=0;
 const measured=auditRidgeCableSweep(field,facilities.survey,(p,w,d,top)=>{
  let own=false;
  for(let i=0;i<=6;i++)for(let j=0;j<=8;j++)for(const h of [0,top-1.8]){
   const e=p.east+(i/3-1)*w,n=p.north+(j/4-1)*d;probes++;
   if(facilities.blocked(e,n,p.height+h,.025))own=true;
  }
  if(own)ownHits++;
  const other=externalBlocked?.(p,w,d,top)===true;if(other)externalHits++;
  return own||other;
 });
 return {...measured,ownHits,externalHits,probes,open,externalSurveyed:!!externalBlocked,candidateEnvelopeClear:open&&!!externalBlocked&&measured.candidateEnvelopeClear};
}
