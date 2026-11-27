import type {FrontRidgeR30Field} from './town-d-r30-front-ridge';
import {auditRidgeRoadCrossings,type RidgeRoadPoint} from './town-d-r30-road-survey';
type EN={east:number;north:number};
type Node=RidgeRoadPoint&{heading:number;cost:number;score:number;prev?:Node};
const dirs=[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]] as const;
class Heap{
 private a:Node[]=[];
 push(v:Node){let i=this.a.length;this.a.push(v);while(i){const p=(i-1)>>1;if(this.a[p]!.score<=v.score)break;this.a[i]=this.a[p]!;i=p}this.a[i]=v}
 pop(){const t=this.a[0],v=this.a.pop();if(v&&this.a.length){let i=0;while(i*2+1<this.a.length){let j=i*2+1;if(j+1<this.a.length&&this.a[j+1]!.score<this.a[j]!.score)j++;if(this.a[j]!.score>=v.score)break;this.a[i]=this.a[j]!;i=j}this.a[i]=v}return t}
}
/** Bounded survey, not a runtime pathfinder or a permission to grade.
 * A route is only eligible for raster construction after planar and
 * full-width cut/fill checks. Quantized elevations are search labels. */
export function searchRidgeRoad(field:FrontRidgeR30Field,from:EN,to:EN,
 allowed:(e:number,n:number)=>boolean,opts:{bounds:{west:number;east:number;south:number;north:number};maxNodes?:number;avoid?:readonly EN[];step?:number}){
 const {bounds}=opts,step=opts.step??8,cap=6,grade=.108;
 const at=field.heightAt,start=at(from.east,from.north),end=at(to.east,to.north);
 const invalid=(p:EN)=>p.east<bounds.west||p.east>bounds.east||p.north<bounds.south||p.north>bounds.north;
 if(start===undefined||end===undefined||invalid(from)||invalid(to))return {route:[] as RidgeRoadPoint[],visited:0,maxReached:start??0,reason:'endpoint outside'};
 const key=(p:Node)=>p.east+','+p.north+','+p.height.toFixed(2)+','+p.heading;
 const estimate=(e:number,n:number,h:number)=>Math.max(Math.hypot(e-to.east,n-to.north),Math.abs(h-end)/grade);
 const open=new Heap(),best=new Map<string,number>();
 const initial:Node={...from,height:start,cum:0,cost:0,score:estimate(from.east,from.north,start),heading:-1};
 open.push(initial);best.set(key(initial),0);
 let visited=0,maxReached=start;
 // Sample projected center and both shoulder lines. Protected vertices
 // cannot be altered; a small grade deviation there is not excused.
 function edge(a:Node,b:EN,h:number){
  const de=b.east-a.east,dn=b.north-a.north,len=Math.hypot(de,dn),steps=Math.ceil(len/2);
  if(len<.001||Math.abs(h-a.height)>len*grade+1e-7)return;
  let earth=0;
  for(let i=0;i<=steps;i++){
   const t=i/steps,y=a.height+(h-a.height)*t,e=a.east+de*t,n=a.north+dn*t;
   for(const off of [-2.8,0,2.8]){
    const x=e-dn/len*off,z=n+de/len*off,g=at(x,z);
    if(g===undefined||Math.abs(g-y)>cap||!allowed(x,z)&&Math.abs(g-y)>.25)return;
    earth+=Math.abs(g-y);
   }
   if(opts.avoid?.some(p=>Math.hypot(e-p.east,n-p.north)<8&&Math.hypot(e-from.east,n-from.north)>18))return;
  }
  return earth/(3*(steps+1));
 }
 while(visited<(opts.maxNodes??180000)){
  const a=open.pop();if(!a)break;
  if(best.get(key(a))!==a.cost)continue;
  visited++;maxReached=Math.max(maxReached,a.height);
  if(a.east===to.east&&a.north===to.north){
   const route:RidgeRoadPoint[]=[];for(let p:Node|undefined=a;p;p=p.prev)route.push({east:p.east,north:p.north,height:p.height,cum:p.cum});
   route.reverse();if(!auditRidgeRoadCrossings(route).length)return {route,visited,maxReached,reason:'survey'};
   continue;
  }
  const ns:({east:number;north:number;heading:number})[]=dirs.map(([x,z],heading)=>({east:Math.round(a.east/step)*step+x*step,north:Math.round(a.north/step)*step+z*step,heading}));
  if(Math.hypot(a.east-to.east,a.north-to.north)<step*1.8)ns.push({...to,heading:Math.round(Math.atan2(to.north-a.north,to.east-a.east)*4/Math.PI+8)%8});
  for(const b of ns){
   if(invalid(b))continue;
   const turn=a.heading<0?0:Math.min(Math.abs(a.heading-b.heading),8-Math.abs(a.heading-b.heading));
   if(turn>2)continue;
   const len=Math.hypot(a.east-b.east,a.north-b.north);if(len<.01||len>step*2.3)continue;
   let repeats=false;
   // Reject remote self-approach before entering a new search state.
   for(let p=a.prev;p;p=p.prev)if(a.cum-p.cum>24&&Math.hypot(p.east-b.east,p.north-b.north)<10){repeats=true;break}
   if(repeats)continue;
   const g=at(b.east,b.north);if(g===undefined)continue;
   const lo=Math.max(g-cap,a.height-grade*len),hi=Math.min(g+cap,a.height+grade*len);
   const heights=b.east===to.east&&b.north===to.north?[end]:Array.from({length:Math.max(0,Math.floor(hi*2)-Math.ceil(lo*2)+1)},(_,i)=>(Math.ceil(lo*2)+i)/2);
   for(const h of heights){
    const earth=edge(a,b,h);if(earth===undefined)continue;
    const cost=a.cost+len*(1+.08*earth)+turn*2;
    const node:Node={...b,height:h,cum:a.cum+len,cost,score:cost+estimate(b.east,b.north,h)*1.2,prev:a};
    const k=key(node);if(cost>=(best.get(k)??Infinity))continue;
    best.set(k,cost);open.push(node);
   }
  }
 }
 return {route:[] as RidgeRoadPoint[],visited,maxReached,reason:'no certified survey within search budget'};
}
