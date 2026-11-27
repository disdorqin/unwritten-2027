import type {RidgeRoadPoint} from './town-d-r30-road-survey';
type EN={east:number;north:number};
type Support=(east:number,north:number)=>number|undefined;
type Node=RidgeRoadPoint&{cost:number;score:number;previous?:Node};
const step=2,half=1.25,maxGrade=.12;
const id=(e:number,n:number)=>e.toFixed(4)+','+n.toFixed(4);
class Queue{
 private data:Node[]=[];
 push(v:Node){let i=this.data.length;this.data.push(v);while(i>0){const p=(i-1)>>1;if(this.data[p]!.score<=v.score)break;this.data[i]=this.data[p]!;i=p}this.data[i]=v}
 pop(){const top=this.data[0],last=this.data.pop();if(this.data.length&&last){let i=0;while(i*2+1<this.data.length){let j=i*2+1;if(j+1<this.data.length&&this.data[j+1]!.score<this.data[j]!.score)j++;if(this.data[j]!.score>=last.score)break;this.data[i]=this.data[j]!;i=j}this.data[i]=last}return top}
}
/** A frozen road is not a cut permit. This survey can only consume an
 * actual accepted support callback (including the host's collisions).
 * It never writes a vertex, adds a ramp, or chooses a different level.
 * Results are route candidates, not a permission to enter the station. */
export function surveyProtectedFootApproach(support:Support,from:EN,to:EN,bounds:{west:number;east:number;south:number;north:number}){
 const cache=new Map<string,number|undefined>();
 const at=(e:number,n:number)=>{
  const k=id(e,n);if(!cache.has(k)){const h=support(e,n);cache.set(k,typeof h==='number'&&Number.isFinite(h)?h:undefined)}return cache.get(k);
 };
 const start=at(from.east,from.north),end=at(to.east,to.north);
 if(start===undefined||end===undefined)return {route:[] as RidgeRoadPoint[],visited:0,samples:cache.size,reason:'unsupported endpoint'};
 function edge(a:EN,b:EN){
  const de=b.east-a.east,dn=b.north-a.north,len=Math.hypot(de,dn),count=Math.max(1,Math.ceil(len/.25));
  if(len<1e-6)return false;
  for(const offset of [-half,0,half]){
   let prev:number|undefined;
   for(let i=0;i<=count;i++){
    const e=a.east+de*i/count-dn/len*offset,n=a.north+dn*i/count+de/len*offset,h=at(e,n);
    if(h===undefined||prev!==undefined&&Math.abs(h-prev)>maxGrade*len/count+1e-6)return false;
    prev=h;
   }
  }
  return true;
 }
 const estimate=(e:number,n:number)=>Math.hypot(e-to.east,n-to.north);
 const open=new Queue(),best=new Map<string,number>();
 open.push({...from,height:start,cum:0,cost:0,score:estimate(from.east,from.north)});
 best.set(id(from.east,from.north),0);let visited=0;
 while(visited<60000){
  const a=open.pop();if(!a)break;
  if(a.cost!==best.get(id(a.east,a.north)))continue;
  visited++;
  if(a.east===to.east&&a.north===to.north){
   const route:RidgeRoadPoint[]=[];for(let p:Node|undefined=a;p;p=p.previous)route.push({east:p.east,north:p.north,height:p.height,cum:p.cum});
   return {route:route.reverse(),visited,samples:cache.size,reason:'candidate' as const};
  }
  const neighbors:EN[]=[];
  for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)if(dx||dz)neighbors.push({east:a.east+step*dx,north:a.north+step*dz});
  if(estimate(a.east,a.north)<=step*2)neighbors.push(to);
  for(const b of neighbors){
   if(b.east<bounds.west||b.east>bounds.east||b.north<bounds.south||b.north>bounds.north)continue;
   const h=at(b.east,b.north),len=Math.hypot(b.east-a.east,b.north-a.north);
   if(h===undefined||len<.01||Math.abs(h-a.height)>maxGrade*len+1e-6)continue;
   const cost=a.cost+len,k=id(b.east,b.north);
   if(cost>=(best.get(k)??Infinity)||!edge(a,b))continue;
   best.set(k,cost);open.push({...b,height:h,cum:cost,cost,score:cost+estimate(b.east,b.north),previous:a});
  }
 }
 return {route:[] as RidgeRoadPoint[],visited,samples:cache.size,reason:'no certified reused route'};
}
