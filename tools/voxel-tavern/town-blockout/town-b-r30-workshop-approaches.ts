import type {WorkstationSite,CraterWorkstationId} from './town-b-r30-crater-workstations';
type EN=Readonly<{east:number;north:number}>;
type Point=EN&Readonly<{height:number}>;
type Box=Readonly<{min:readonly number[];max:readonly number[]}>;
type Route=Readonly<{id:string;points:readonly Point[]}>;
type Road=Readonly<{heightAt(east:number,north:number):number|undefined}>;
type Plan=Readonly<{id:CraterWorkstationId;routeId:string;points:readonly (readonly [number,number])[]}>;
/** Measured against A b41eecc6 real ground, industrial routes and all
 * three rail lines. Route starts at the accepted A tread, ends at the
 * physical operating foot. Re-survey after any host change. */
const plans:readonly Plan[]=[
 {id:'bellows',routeId:'cold-furnace',points:[[-165.75806451612902,117.43548387096774],[-165.5,118.55],[-165.5,120.05],[-164.5,121.55],[-162.5,123.05],[-160.5,124.05]]},
 {id:'calibration',routeId:'instrument-plant',points:[[-58.10574797133482,138.35933570571623],[-64.55,137.5],[-65.55,139]]},
 {id:'sorting',routeId:'ruined-shed',points:[[-143.07393857023595,100.6053747938497],[-143.05,100.5]]},
 {id:'weighing',routeId:'transfer-dock',points:[[-58.40909090909091,151.63636363636363],[-60,151.8]]},
 {id:'turnout',routeId:'kengkou-station',points:[[-37.211263643174355,167.0529929669279],[-37,167.05]]},
];
const gap=(p:EN,b:Box)=>Math.hypot(Math.max(b.min[0]-p.east,p.east-b.max[0],0),Math.max(b.min[2]+p.north,-p.north-b.max[2],0));
function projection(p:EN,a:EN,b:EN){
 const x=b.east-a.east,z=b.north-a.north,t=Math.max(0,Math.min(1,((p.east-a.east)*x+(p.north-a.north)*z)/(x*x+z*z||1)));
 return {t,distance:Math.hypot(p.east-a.east-x*t,p.north-a.north-z*t)};
}
export type BR30WorkshopApproach=Readonly<{id:CraterWorkstationId;routeId:string;points:readonly Point[];length:number;bodyGap:number;trackGap:number;maxGrade:number;samples:number}>;
/** No route or texture is claimed if any actual support, anchor or
 * collision check fails. Does not move the avatar or grant permissions. */
export function surveyBR30WorkshopApproaches(road:Road,sites:readonly WorkstationSite[],routes:readonly Route[],tracks:readonly (readonly EN[])[],solids:readonly Box[]){
 if(tracks.length!==3||tracks.some(t=>t.length<2))throw Error('R30 approaches require all three live rail routes');
 const walls=[...solids,...sites.map(s=>s.footprint)];
 const segments=tracks.flatMap(t=>t.slice(1).map((b,i)=>[t[i],b] as const));
 return plans.map(plan=>{
  const site=sites.find(s=>s.id===plan.id),route=routes.find(r=>r.id===plan.routeId);
  if(!site||!route||route.points.length<2)throw Error('Missing A approach datum '+plan.id);
  const points=plan.points.map(([east,north])=>{
   const height=road.heightAt(east,north);
   if(height===undefined||!Number.isFinite(height))throw Error('Missing approach support '+plan.id);
   return {east,north,height};
  });
  const start=points[0],end=points.at(-1)!;
  if(Math.hypot(end.east-site.foot.east,end.north-site.foot.north)>.015||Math.abs(end.height-site.foot.height)>.02)
   throw Error('Workshop foot moved '+plan.id);
  if(!route.points.slice(1).some((b,i)=>{const a=route.points[i],q=projection(start,a,b);
   return q.distance<.02&&Math.abs(a.height+(b.height-a.height)*q.t-start.height)<.1;
  }))throw Error('A walk anchor moved '+plan.id);
  let length=0,bodyGap=Infinity,trackGap=Infinity,maxGrade=0,samples=0;
  for(let i=1;i<points.length;i++){
   const a=points[i-1],b=points[i],d=Math.hypot(b.east-a.east,b.north-a.north),N=Math.max(1,Math.ceil(d/.08));length+=d;
   let previous=a.height;
   for(let j=0;j<=N;j++){
    const t=j/N,p={east:a.east+(b.east-a.east)*t,north:a.north+(b.north-a.north)*t},h=road.heightAt(p.east,p.north);
    if(h===undefined||!Number.isFinite(h))throw Error('Missing approach ground '+plan.id);
    if(j&&d>0)maxGrade=Math.max(maxGrade,Math.abs(h-previous)/(d/N));
    previous=h;samples++;
    for(const box of walls)if(box.min[1]<h+1.8&&box.max[1]>h+.025)bodyGap=Math.min(bodyGap,gap(p,box));
    for(const [x,z] of segments)trackGap=Math.min(trackGap,projection(p,x,z).distance);
   }
  }
  if(bodyGap<.40||trackGap<1.30||maxGrade>.15)throw Error('Obstructed workshop approach '+plan.id+' '+bodyGap+'/'+trackGap+'/'+maxGrade);
  return {id:plan.id,routeId:plan.routeId,points,length,bodyGap,trackGap,maxGrade,samples} satisfies BR30WorkshopApproach;
 });
}
/** A may consume this mask in its own terrain shading. No second floor,
 * mesh decal, path authority or new track crossing. */
export function sampleBR30WorkshopApproachWear(routes:readonly BR30WorkshopApproach[],east:number,north:number){
 let d=Infinity;
 for(const route of routes)for(let i=1;i<route.points.length;i++)
  d=Math.min(d,projection({east,north},route.points[i-1],route.points[i]).distance);
 const u=Math.max(0,Math.min(1,(d-.24)/.36));
 return 1-u*u*(3-2*u);
}
