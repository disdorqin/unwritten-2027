/** Static broad phase for ridge geometry. Buckets only reject disjoint
 * horizontal bounding boxes; callers retain their exact narrow phase. */
export type RidgeBounds={west:number;east:number;south:number;north:number};
export function createRidgeSpatialIndex<T>(items:readonly T[],bounds:(item:T)=>RidgeBounds,size=8){
 if(!(size>0&&Number.isFinite(size)))throw new RangeError('ridge cell size');
 const bins=new Map<string,T[]>();
 for(const item of items){
  const b=bounds(item);
  if(![b.west,b.east,b.south,b.north].every(Number.isFinite)||b.east<b.west||b.north<b.south)throw new RangeError('ridge spatial bounds');
  for(let x=Math.floor(b.west/size);x<=Math.floor(b.east/size);x++)
   for(let z=Math.floor(b.south/size);z<=Math.floor(b.north/size);z++){
    const key=x+','+z,list=bins.get(key)??[];list.push(item);bins.set(key,list);
   }
 }
 return {some(e:number,n:number,r:number,hit:(item:T)=>boolean){
  if(![e,n,r].every(Number.isFinite)||r<0)return false;
  for(let x=Math.floor((e-r)/size);x<=Math.floor((e+r)/size);x++)
   for(let z=Math.floor((n-r)/size);z<=Math.floor((n+r)/size);z++)
    for(const item of bins.get(x+','+z)??[])if(hit(item))return true;
  return false;
 }};
}
type EN={east:number;north:number};
/** Exact radius predicate over the actual polyline; distant buckets
 * do not participate. Strict boundary is selectable for collision
 * clearances, inclusive for road-surface coloring. */
export function createRidgeRoadProximity(route:readonly EN[]){
 const segments=route.slice(1).map((b,i)=>({a:route[i]!,b})).filter(({a,b})=>a.east!==b.east||a.north!==b.north);
 const index=createRidgeSpatialIndex(segments,({a,b})=>({west:Math.min(a.east,b.east),east:Math.max(a.east,b.east),south:Math.min(a.north,b.north),north:Math.max(a.north,b.north)}));
 return (e:number,n:number,r:number,inclusive=true)=>index.some(e,n,r,({a,b})=>{
  const dx=b.east-a.east,dn=b.north-a.north,t=Math.max(0,Math.min(1,((e-a.east)*dx+(n-a.north)*dn)/(dx*dx+dn*dn)));
  const d=Math.hypot(e-a.east-t*dx,n-a.north-t*dn);
  return inclusive?d<=r:d<r;
 });
}
