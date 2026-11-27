import type {FrontRidgeR30Field} from './town-d-r30-front-ridge';
import {auditRidgeRoadCrossings,type RidgeRoadPoint} from './town-d-r30-road-survey';
type EN={east:number;north:number};
type Node=RidgeRoadPoint&{heading:number;cost:number;score:number;prev?:Node};
const dirs=[[1,0],[2,1],[1,1],[1,2],[0,1],[-1,2],[-1,1],[-2,1],[-1,0],[-2,-1],[-1,-1],[-1,-2],[0,-1],[1,-2],[1,-1],[2,-1]] as const;
class Heap{
 private a:Node[]=[];
 push(v:Node){let i=this.a.length;this.a.push(v);while(i){const p=(i-1)>>1;if(this.a[p]!.score<=v.score)break;this.a[i]=this.a[p]!;i=p}this.a[i]=v}
 pop(){const t=this.a[0],v=this.a.pop();if(v&&this.a.length){let i=0;while(i*2+1<this.a.length){let j=i*2+1;if(j+1<this.a.length&&this.a[j+1]!.score<this.a[j]!.score)j++;if(this.a[j]!.score>=v.score)break;this.a[i]=this.a[j]!;i=j}this.a[i]=v}return t}
}
/** Bounded survey, not a runtime pathfinder or a permission to grade.
 * A route is only eligible for raster construction after planar and
 * full-width cut/fill checks. Quantized elevations are search labels. */
export function searchRidgeRoad(field:FrontRidgeR30Field,from:EN,to:EN,
 allowed:(e:number,n:number)=>boolean,opts:{bounds:{west:number;east:number;south:number;north:number};maxNodes?:number;avoid?:readonly EN[];step?:number;earthworkCap?:number;budgetMs?:number;preferClimb?:boolean;heuristicWeight?:number}){
 const {bounds}=opts,step=opts.step??8,cap=opts.earthworkCap??6,grade=.108;
 if(!Number.isFinite(cap)||cap<=0||cap>8||!Number.isFinite(step)||step<3||step>12)throw new RangeError('ridge survey bounds');
 const started=performance.now();
 const at=field.heightAt,start=at(from.east,from.north),end=at(to.east,to.north);
 const invalid=(p:EN)=>p.east<bounds.west||p.east>bounds.east||p.north<bounds.south||p.north>bounds.north;
 if(start===undefined||end===undefined||invalid(from)||invalid(to))return {route:[] as RidgeRoadPoint[],visited:0,maxReached:start??0,reason:'endpoint outside'};
 const key=(p:Node)=>p.east+','+p.north+','+p.height.toFixed(2)+','+p.heading;
 const estimate=(e:number,n:number,h:number)=>Math.max(Math.hypot(e-to.east,n-to.north),Math.abs(h-end)/grade);
 const open=new Heap(),best=new Map<string,number>();
 const initial:Node={...from,height:start,cum:0,cost:0,score:estimate(from.east,from.north,start),heading:-1};
 open.push(initial);best.set(key(initial),0);
 let visited=0,maxReached=start,frontier=initial;
 // Sample projected center and both shoulder lines. Protected vertices
 // cannot be altered; a small grade deviation there is not excused.
 type Slice={t:number;lo:number;hi:number;mean:number};
 const edgeCache=new Map<string,Slice[]|null>();
 // The geometry of a directed segment is independent of its height label.
 // Cache the three cross-section samples and intersect the affine height
 // intervals once per incoming label, instead of repeating terrain and
 // railway-mask queries for every proposed outgoing height.
 function crossSections(a:EN,b:EN){
  const id=a.east+','+a.north+'>'+b.east+','+b.north;
  if(edgeCache.has(id))return edgeCache.get(id);
  const de=b.east-a.east,dn=b.north-a.north,len=Math.hypot(de,dn),steps=Math.ceil(len/2),rows:Slice[]=[];
  const fail=()=>{edgeCache.set(id,null);return null};
  if(len<.001)return fail();
  for(let i=0;i<=steps;i++){
   const t=i/steps,e=a.east+de*t,n=a.north+dn*t;
   let lo=-Infinity,hi=Infinity,mean=0;
   for(const off of [-2.8,0,2.8]){
    const x=e-dn/len*off,z=n+de/len*off,g=at(x,z);
    if(g===undefined)return fail();
    const c=allowed(x,z)?cap:.25;lo=Math.max(lo,g-c);hi=Math.min(hi,g+c);mean+=g/3;
   }
   if(lo>hi||opts.avoid?.some(p=>Math.hypot(e-p.east,n-p.north)<8&&Math.hypot(e-from.east,n-from.north)>18))return fail();
   rows.push({t,lo,hi,mean});
  }
  edgeCache.set(id,rows);return rows;
 }
 while(visited<(opts.maxNodes??180000)){
  if(visited%128===0&&performance.now()-started>(opts.budgetMs??60000))break;
  const a=open.pop();if(!a)break;
  if(best.get(key(a))!==a.cost)continue;
  visited++;if(Math.abs(a.height-end)<Math.abs(frontier.height-end))frontier=a;maxReached=Math.max(maxReached,a.height);
  if(a.east===to.east&&a.north===to.north){
   const route:RidgeRoadPoint[]=[];for(let p:Node|undefined=a;p;p=p.prev)route.push({east:p.east,north:p.north,height:p.height,cum:p.cum});
   route.reverse();if(!auditRidgeRoadCrossings(route).length)return {route,visited,maxReached,reason:'survey'};
   continue;
  }
  const ns:({east:number;north:number;heading:number})[]=dirs.map(([x,z],heading)=>({east:Math.round(a.east/step)*step+x*step,north:Math.round(a.north/step)*step+z*step,heading}));
  if(Math.hypot(a.east-to.east,a.north-to.north)<step*1.8)ns.push({...to,heading:Math.round(Math.atan2(to.north-a.north,to.east-a.east)*8/Math.PI+16)%16});
  for(const b of ns){
   if(invalid(b))continue;
   const turn=a.heading<0?0:Math.min(Math.abs(a.heading-b.heading),16-Math.abs(a.heading-b.heading));
   if(turn>4)continue;
   const len=Math.hypot(a.east-b.east,a.north-b.north);if(len<.01||len>step*2.9)continue;
   let repeats=false;
   // Reject remote self-approach before entering a new search state.
   for(let p=a.prev;p;p=p.prev)if(a.cum-p.cum>24&&Math.hypot(p.east-b.east,p.north-b.north)<10){repeats=true;break}
   if(repeats)continue;
   const g=at(b.east,b.north);if(g===undefined)continue;
   let lo=Math.max(g-cap,a.height-grade*len),hi=Math.min(g+cap,a.height+grade*len);
   const rows=crossSections(a,b);if(!rows)continue;
   for(const q of rows){
    if(q.t===0){if(a.height<q.lo||a.height>q.hi){lo=Infinity;break}}
    else{lo=Math.max(lo,(q.lo-(1-q.t)*a.height)/q.t);hi=Math.min(hi,(q.hi-(1-q.t)*a.height)/q.t)}
   }
   if(lo>hi)continue;
   const heights=b.east===to.east&&b.north===to.north?[end]:Array.from({length:Math.max(0,Math.floor(hi*4)-Math.ceil(lo*4)+1)},(_,i)=>(Math.ceil(lo*4)+i)/4);
   for(const h of heights){
    if(h<lo-1e-8||h>hi+1e-8)continue;
    const earth=rows.reduce((sum,q)=>sum+Math.abs(q.mean-(a.height+(h-a.height)*q.t)),0)/rows.length;
    const cost=a.cost+len*(1+.08*earth)+turn*2;
    const node:Node={...b,height:h,cum:a.cum+len,cost,score:cost+estimate(b.east,b.north,h)*(opts.heuristicWeight??(opts.preferClimb?2.8:1.2)),prev:a};
    const k=key(node);if(cost>=(best.get(k)??Infinity))continue;
    best.set(k,cost);open.push(node);
   }
  }
 }
 const frontierRoute:RidgeRoadPoint[]=[];for(let p:Node|undefined=frontier;p;p=p.prev)frontierRoute.push({east:p.east,north:p.north,height:p.height,cum:p.cum});
 return {route:[] as RidgeRoadPoint[],visited,maxReached,reason:'no certified survey within search budget',frontierRoute:frontierRoute.reverse(),cachedEdges:edgeCache.size,elapsedMs:performance.now()-started};
}
