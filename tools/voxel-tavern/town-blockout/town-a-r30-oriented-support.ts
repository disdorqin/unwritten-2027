/** Exact yawed rectangular footprint, with AABB retained for spatial indexing.
 * Center is derived from bounds so the existing offsetBox transform preserves it.
 * Only opt-in new A-owned pieces use the narrow phase; other boxes unchanged. */
export type OrientedSupportBox={min:number[];max:number[];footprint?:Readonly<{yaw:number;halfX:number;halfZ:number}>};
export function orientedSupportBox(e:number,n:number,yaw:number,w:number,d:number,low:number,high:number):OrientedSupportBox{
  const c=Math.abs(Math.cos(yaw)),s=Math.abs(Math.sin(yaw)),hx=(c*w+s*d)/2,hz=(s*w+c*d)/2;
  return {min:[e-hx,low,-n-hz],max:[e+hx,high,-n+hz],footprint:{yaw,halfX:w/2,halfZ:d/2}};
}
export function supportFootprintOverlaps(e:number,n:number,b:OrientedSupportBox,radius:number){
  const p=b.footprint;
  let dx:number,dz:number;
  if(p){
    const x=e-(b.min[0]+b.max[0])/2,z=-n-(b.min[2]+b.max[2])/2;
    const c=Math.cos(p.yaw),s=Math.sin(p.yaw);
    dx=Math.max(Math.abs(c*x-s*z)-p.halfX,0);
    dz=Math.max(Math.abs(s*x+c*z)-p.halfZ,0);
  }else{
    dx=Math.max(b.min[0]-e,e-b.max[0],0);
    dz=Math.max(b.min[2]+n,-n-b.max[2],0);
  }
  return dx*dx+dz*dz<radius*radius;
}
