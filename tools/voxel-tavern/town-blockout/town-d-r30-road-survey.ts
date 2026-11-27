import type {FrontRidgeR30Field} from './town-d-r30-front-ridge';
import {northRidgeCableAnchors} from './north-ridge-350-terrain';
export type RidgeRoadPoint={east:number;north:number;height:number;cum:number};
type PlanPoint={east:number;north:number};
type Node=RidgeRoadPoint&{g:number;f:number;heading:number;previous?:Node};
const step=8,gradeCap=.115,edgeMax=26,earthworkCap=6;
const dirs:PlanPoint[]=[];
for(let a=-4;a<=4;a++)for(let b=-4;b<=4;b++){
 if(!a&&!b)continue;
 if(Math.hypot(a,b)*step<=edgeMax)dirs.push({east:a*step,north:b*step});
}
const key=(e:number,n:number,h:number,heading:number)=>e+','+n+','+h.toFixed(3)+','+heading;
const headingOf=(de:number,dn:number)=>Math.round(Math.atan2(de,dn)*4/Math.PI);
const turnDistance=(a:number,b:number)=>Math.min(Math.abs(a-b),8-Math.abs(a-b));
class Heap{
 private a:Node[]=[];
 push(v:Node){let i=this.a.length;this.a.push(v);while(i>0){const p=(i-1)>>1;if(this.a[p]!.f<=v.f)break;this.a[i]=this.a[p]!;i=p}this.a[i]=v}
 pop(){const top=this.a[0],last=this.a.pop();if(this.a.length&&last){let i=0;while(i*2+1<this.a.length){let j=i*2+1;if(j+1<this.a.length&&this.a[j+1]!.f<this.a[j]!.f)j++;if(this.a[j]!.f>=last.f)break;this.a[i]=this.a[j]!;i=j}this.a[i]=last}return top}
}
/** Audit strict planar crossings; grade and net width also need to be
 * checked on the final rounded road, not only on its survey polyline. */
export function auditRidgeRoadCrossings(route:readonly RidgeRoadPoint[]){
 const crossing:{first:number;second:number}[]=[];
 const orient=(a:PlanPoint,b:PlanPoint,c:PlanPoint)=>(b.east-a.east)*(c.north-a.north)-(b.north-a.north)*(c.east-a.east);
 const on=(a:PlanPoint,b:PlanPoint,c:PlanPoint)=>Math.abs(orient(a,b,c))<1e-7&&c.east>=Math.min(a.east,b.east)-1e-7&&c.east<=Math.max(a.east,b.east)+1e-7&&c.north>=Math.min(a.north,b.north)-1e-7&&c.north<=Math.max(a.north,b.north)+1e-7;
 for(let i=0;i+1<route.length;i++)for(let j=i+2;j+1<route.length;j++){
   const a=route[i]!,b=route[i+1]!,c=route[j]!,d=route[j+1]!;
   if((orient(a,b,c)*orient(a,b,d)<0&&orient(c,d,a)*orient(c,d,b)<0)||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b))crossing.push({first:i,second:j});
 }
 return crossing;
}
export const frontRidgeR30RoadSpec=Object.freeze({surveyStep:step,maxGrade:gradeCap,halfWidth:1.75,earthworkCap,anchors:[{east:290,north:300},...northRidgeCableAnchors.map(([east,north])=>({east,north}))]});
/** R02 preliminary route search on the accepted R01 height field. Every
 * edge is checked at <=2m spacing for grade and local cut/fill. Route
 * planning does not itself authorize any earthwork or change a host.
 * Even a successful result still needs crossing, radius, net-width and
 * protected-land review before a continuous physical road is built. */
export function surveyFrontRidgeR30Road(field:FrontRidgeR30Field,blocked:(e:number,n:number)=>boolean=()=>false){
 const at=field.heightAt;
 function edge(a:PlanPoint,b:PlanPoint,ha:number,hb:number){
   const de=b.east-a.east,dn=b.north-a.north,len=Math.hypot(de,dn);
   if(len<.01||len>edgeMax+.001||Math.abs(hb-ha)/len>gradeCap)return;
   let deviation=0;
   const steps=Math.ceil(len/2);
   for(let i=0;i<=steps;i++){
     const t=i/steps,e=a.east+de*t,n=a.north+dn*t,road=ha+(hb-ha)*t;
     for(const off of [-1.75,0,1.75]){
       const x=e-dn/len*off,z=n+de/len*off,h=at(x,z);
       if(h===undefined||blocked(x,z))return;
       deviation=Math.max(deviation,Math.abs(h-road));if(deviation>earthworkCap)return;
     }
   }
   return {len,deviation};
 }
 function leg(from:PlanPoint,to:PlanPoint){
   const startH=at(from.east,from.north),targetH=at(to.east,to.north);
   if(startH===undefined||targetH===undefined)return;
   const estimate=(e:number,n:number,h:number)=>Math.max(Math.hypot(e-to.east,n-to.north),Math.abs(h-targetH)/gradeCap);
   const open=new Heap(),best=new Map<string,number>();
   const start:Node={...from,height:startH,cum:0,g:0,f:estimate(from.east,from.north,startH),heading:9};
   open.push(start);best.set(key(from.east,from.north,startH,9),0);
   let visited=0,maxReached=startH;
   while(visited<100000){
     const a=open.pop();if(!a)break;
     if(a.g!==best.get(key(a.east,a.north,a.height,a.heading)))continue;
     visited++;maxReached=Math.max(maxReached,a.height);
     if(a.east===to.east&&a.north===to.north&&a.height===targetH){
       const nodes:Node[]=[];for(let p:Node|undefined=a;p;p=p.previous)nodes.push(p);
       return {points:nodes.reverse().map(({east,north,height,cum})=>({east,north,height,cum})),visited,maxReached};
     }
     const aligned=a.east%step===0&&a.north%step===0;
     const neighbors=dirs.map(d=>({east:(aligned?a.east:Math.round(a.east/step)*step)+d.east,north:(aligned?a.north:Math.round(a.north/step)*step)+d.north}));
     if(Math.hypot(a.east-to.east,a.north-to.north)<=edgeMax)neighbors.push(to);
     for(const b of neighbors){
       const de=b.east-a.east,dn=b.north-a.north;if(Math.hypot(de,dn)<.01)continue;
       const heading=headingOf(de,dn);
       if(a.previous){const pe=a.east-a.previous.east,pn=a.north-a.previous.north;
         if(pe*de+pn*dn<-.000001)continue;
       }
       const ground=at(b.east,b.north);if(ground===undefined)continue;
       const anchor=b.east===to.east&&b.north===to.north;
       for(const h of anchor?[targetH]:[ground,ground-2,ground+2,ground-4,ground+4]){
         const measure=edge(a,b,a.height,h);if(!measure)continue;
         const g=a.g+measure.len*(1+.075*measure.deviation)+(a.heading===9?0:turnDistance(a.heading,heading)*2);
         const k=key(b.east,b.north,h,heading);if(g>=(best.get(k)??Infinity))continue;
         best.set(k,g);open.push({...b,height:h,cum:a.cum+measure.len,g,f:g+estimate(b.east,b.north,h),heading,previous:a});
       }
     }
   }
   return {points:[] as RidgeRoadPoint[],visited,maxReached};
 }
 const legs=[];const route:RidgeRoadPoint[]=[];
 for(let i=1;i<frontRidgeR30RoadSpec.anchors.length;i++){
   const a=frontRidgeR30RoadSpec.anchors[i-1]!,b=frontRidgeR30RoadSpec.anchors[i]!;
   const result=leg(a,b);legs.push({from:a,to:b,visited:result?.visited??0,maxReached:result?.maxReached,success:!!result?.points.length});
   if(!result?.points.length)return {complete:false,route,legs,crossings:auditRidgeRoadCrossings(route)};
   const offset=route.at(-1)?.cum??0;
   route.push(...result.points.slice(route.length?1:0).map(p=>({...p,cum:p.cum+offset})));
 }
 const crossings=auditRidgeRoadCrossings(route);
 return {complete:crossings.length===0,route,legs,crossings};
}
