/** Exact broad phase for immutable axis-aligned city boxes, using scene X/Y/Z.
 * Spatial binning only narrows the candidates; the narrow phase is unchanged. */
export type StaticBox=Readonly<{min:readonly number[];max:readonly number[]}>;
export function createStaticFootIndex<T extends StaticBox>(boxes:readonly T[],cell=4){
 if(!(cell>0)||!Number.isFinite(cell))throw new RangeError('invalid cell');
 const grid=new Map<string,T[]>(),key=(x:number,z:number)=>x+','+z;
 for(const b of boxes){
   if(![...b.min,...b.max].every(Number.isFinite)||b.min.some((v,i)=>v>b.max[i]))throw new RangeError('invalid static box');
   for(let x=Math.floor(b.min[0]/cell);x<=Math.floor(b.max[0]/cell);x++)
    for(let z=Math.floor(b.min[2]/cell);z<=Math.floor(b.max[2]/cell);z++){
      const k=key(x,z),bucket=grid.get(k)??[];bucket.push(b);grid.set(k,bucket);
    }
 }
 function candidates(e:number,n:number,r:number){
   const z=-n,result=new Set<T>();
   if(![e,n,r].every(Number.isFinite)||r<0)return result;
   for(let i=Math.floor((e-r)/cell);i<=Math.floor((e+r)/cell);i++)
    for(let j=Math.floor((z-r)/cell);j<=Math.floor((z+r)/cell);j++)
      for(const b of grid.get(key(i,j))??[])result.add(b);
   return result;
 }
 function blocks(e:number,n:number,y=0,r=.27,h=1.8){
   if(![e,n,y,r,h].every(Number.isFinite)||r<=0||h<=0)return true;
   for(const b of candidates(e,n,r)){
     if(b.max[1]>y+.025&&b.min[1]<y+h&&Math.hypot(Math.max(0,b.min[0]-e,e-b.max[0]),Math.max(0,b.min[2]+n,-n-b.max[2]))<r)return true;
   }
   return false;
 }
 return {blocks,candidates,cellCount:grid.size};
}
