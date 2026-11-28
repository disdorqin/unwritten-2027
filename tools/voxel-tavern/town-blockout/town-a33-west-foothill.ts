/** A33 terrain-only footprint: EN metres. No new surface, no relay frame
 * expansion. The north end remains inside the existing west room (N540). */
export const a33WestFoothillRoute=[[-90,350],[-93,371],[-103,398],[-108,425],[-103,453],[-91,481],[-86,507],[-86,526]] as const;
/** Existing rail curves into town south of this north-side crossing.
 * N536 stays below the west-room N540 limit, and the complete body fits.
 * It is a walking route along real terrain, not a new railway crossing. */
export const a33WestReturnRoute=[[-86,526],[-88,536],[-62,536],[-36,536],[-12,536],[2,536]] as const;
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const smooth=(v:number)=>{const t=clamp(v);return t*t*(3-2*t);};
export function a33WestTrailDistance(e:number,n:number){
 let best=Infinity;
 for(let i=1;i<a33WestFoothillRoute.length;i++){
  const a=a33WestFoothillRoute[i-1]!,b=a33WestFoothillRoute[i]!,de=b[0]-a[0],dn=b[1]-a[1];
  const t=clamp(((e-a[0])*de+(n-a[1])*dn)/(de*de+dn*dn));
  best=Math.min(best,Math.hypot(e-a[0]-de*t,n-a[1]-dn*t));
 }
 return best;
}
function lens(e:number,n:number,ce:number,cn:number,rx:number,rn:number,angle:number){
 const x=e-ce,z=n-cn,c=Math.cos(angle),s=Math.sin(angle);
 return Math.exp(-(((x*c+z*s)/rx)**2)-(((-x*s+z*c)/rn)**2));
}
/** Raised asymmetric snow/rock spurs with a single eroded saddle. Preserve
 * the old trail's approach and a 3m-wide walking lane. The owner applies
 * the rail/outer boundary masks, and samples this onto its SAME raster. */
export function a33WestFoothillDelta(e:number,n:number){
 const path=a33WestTrailDistance(e,n);
 const envelope=smooth((n-350)/30)*(1-smooth((n-530)/30));
 const ridge=17*lens(e,n,-186,430,37,89,-.35)+11*lens(e,n,-155,510,35,65,.52)
 +8*lens(e,n,-137,380,22,46,-.45);
 const channel=-3.5*lens(e,n,-131,455,16,92,.15);
 const strata=(1.4*Math.sin(e*.28+n*.087+Math.sin(n*.032)*1.8)+.55*Math.sin(e*.63-n*.17))
  *lens(e,n,-167,451,62,100,-.22);
 return envelope*smooth((path-3)/16)*(ridge+channel+strata);
}
export function a33WestTrailWear(e:number,n:number){
 return smooth((n-350)/5)*(1-smooth((n-526)/3))*(1-smooth((a33WestTrailDistance(e,n)-.9)/1.2));
}
