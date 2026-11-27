type EN=Readonly<{east:number;north:number}>;
/** Measured B-R02 candidate. A's production movement remains authoritative. */
export const bR30MoundRoutePlan=[
 [-137.62417573244022,194.45454545454544],[-134.12417573244022,189.95454545454544],
 [-117.62417573244022,175.45454545454544],[-111.12417573244022,181.95454545454544],
 [-110.62417573244022,185.95454545454544],[-112.12417573244022,189.45454545454544],[-120,196],
] as const;
const smooth=(x:number)=>{const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t);};
const upper=bR30MoundRoutePlan.slice(3);
/** A subtle foot-worn trace on the upper slope only. No new tread on
 * C's lower work area, no altered ground or invented traversable surface. */
export function bR30MoundTrailWear(p:EN,moundRise:number,haulTread:number){
 if(moundRise<=.45||haulTread>=.95)return 0;
 let distance=Infinity;
 for(let i=1;i<upper.length;i++){
  const [e,n]=upper[i-1],[be,bn]=upper[i],dx=be-e,dn=bn-n;
  const t=Math.max(0,Math.min(1,((p.east-e)*dx+(p.north-n)*dn)/(dx*dx+dn*dn)));
  distance=Math.min(distance,Math.hypot(p.east-e-t*dx,p.north-n-t*dn));
 }
 return (1-smooth((distance-.33)/.83))*smooth((moundRise-.45)/.80)*(1-smooth(haulTread/.95));
}
