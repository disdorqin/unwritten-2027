/** South-sector terrain contribution, consumed once by D2's canonical
 * 8m field. No mesh, world transform, independent ground or road authority. */
export type SouthGround=(east:number,north:number)=>number|undefined;
export type SouthProtection=(east:number,north:number)=>boolean;
export const southSector=Object.freeze({west:-1100,east:1100,south:-10,north:480,feather:32});
const smooth=(v:number)=>{const t=Math.max(0,Math.min(1,v));return t*t*(3-2*t);};
const directions=Array.from({length:16},(_,i)=>[Math.cos(i*Math.PI/8),Math.sin(i*Math.PI/8)] as const);
const bump=(e:number,n:number,x:number,z:number,rx:number,rn:number)=>Math.exp(-(((e-x)/rx)**2)-((n-z)/rn)**2);
export function southGullyNorth(e:number){return 350+.22*(e+250)-17*Math.sin((e+250)*.011);}
export function createSouthHeightDelta(protectedAt:SouthProtection){
 if(typeof protectedAt!=='function')throw Error('South landform requires shared protected-route predicate');
 return (e:number,n:number)=>{
  if(!Number.isFinite(e)||!Number.isFinite(n)||e<=southSector.west||e>=southSector.east||n<=southSector.south||n>=southSector.north)return 0;
  const boundary=Math.min(e+1100,1100-e,n+10,480-n);
  // No construction change at the sector border, gate, plaza, lower station,
  // or any C2/B canonical road and transport reservation.
  const arrival=Math.hypot(Math.max(Math.abs(e)-42,0),Math.max(-10-n,n-52,0));
  if(arrival<32||protectedAt(e,n))return 0;
  let weight=1;
  for(const radius of [8,16,24,32]){
   if(directions.some(([x,z])=>protectedAt(e+radius*x,n+radius*z))){weight=smooth((radius-8)/32);break;}
  }
  const mask=smooth(boundary/32)*smooth((arrival-32)/48)*weight;
  // Broad unequal foothill shoulders and lower glacial apron, not a cone
  // or vertical skirt. Deepen the existing surveyed south gully modestly.
  const shoulders=32*bump(e,n,-690,218,255,155)+24*bump(e,n,630,258,275,168)+14*bump(e,n,-360,115,170,88);
  const terraces=5*Math.sin(e*.013+n*.026)*bump(e,n,0,230,830,200);
  const channel=-15*Math.exp(-(((n-southGullyNorth(e))/31)**2))*Math.exp(-(((e+250)/420)**4));
  const apron=-9*bump(e,n,30,106,260,65);
  return mask*(shoulders+terraces+channel+apron);
 };
}
/** D2 owns final composition, clamping and 8m surface/collision sampling.
 * This adapter is also useful for standalone proof against the same source. */
export function southComposedCandidate(base:SouthGround,protectedAt:SouthProtection):SouthGround{
 const delta=createSouthHeightDelta(protectedAt);
 return (e,n)=>{const h=base(e,n);return h===undefined?undefined:Math.max(150,Math.min(800,h+delta(e,n)));};
}
