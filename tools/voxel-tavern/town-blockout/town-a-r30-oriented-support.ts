/** Exact yawed rectangular footprint, with AABB retained for spatial indexing.
 * Center is derived from bounds so the existing offsetBox transform preserves it.
 * Only opt-in new A-owned pieces use the narrow phase; other boxes unchanged. */
export type OrientedSupportBox={min:number[];max:number[];footprint?:Readonly<{yaw:number;halfX:number;halfZ:number}>};
export function orientedSupportBox(e:number,n:number,yaw:number,w:number,d:number,low:number,high:number):OrientedSupportBox{
  const c=Math.abs(Math.cos(yaw)),s=Math.abs(Math.sin(yaw)),hx=(c*w+s*d)/2,hz=(s*w+c*d)/2;
  return {min:[e-hx,low,-n-hz],max:[e+hx,high,-n+hz],footprint:{yaw,halfX:w/2,halfZ:d/2}};
}
export function supportFootprintOverlaps(e:number,n:number,b:OrientedSupportBox,radius:number){
  // Every oriented support retains its enclosing world AABB. Reject
  // distant candidates from the coarse cell before rotating the point.
  const r2=radius*radius;
  const bx=Math.max(b.min[0]-e,e-b.max[0],0);
  const bz=Math.max(b.min[2]+n,-n-b.max[2],0);
  if(bx*bx+bz*bz>=r2)return false;
  const p=b.footprint;
  if(!p)return bx*bx+bz*bz<r2;
  const x=e-(b.min[0]+b.max[0])/2,z=-n-(b.min[2]+b.max[2])/2;
  const c=Math.cos(p.yaw),s=Math.sin(p.yaw);
  const dx=Math.max(Math.abs(c*x-s*z)-p.halfX,0);
  const dz=Math.max(Math.abs(s*x+c*z)-p.halfZ,0);
  return dx*dx+dz*dz<r2;
}
