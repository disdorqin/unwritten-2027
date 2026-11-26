import {createFrontRidgeR30FieldFromRaster,frontRidgeR30Bounds,type FrontRidgeR30Field} from './town-d-r30-front-ridge';
import {auditRidgeRoadSurface,ridgeRoadProject} from './town-d-r30-roadbed';
import {auditRidgeRoadCrossings,type RidgeRoadPoint} from './town-d-r30-road-survey';

type EN={east:number;north:number};
type Allowed=(e:number,n:number)=>boolean;
const B=frontRidgeR30Bounds,half=2.8,shoulder=8,cutLimit=8,axisSlope=.12/Math.sqrt(2)-.00015;
// Survey waypoint is not a new gameplay anchor. It is the end of the
// first middle-to-upper switchback construction section.
export const middleEastRoadControls=Object.freeze([
 {east:440,north:524},{east:440,north:531},{east:450,north:533},
 {east:469,north:533},{east:481,north:531},{east:493,north:526},
 {east:505,north:526}
]);
function smoothPath(controls:readonly EN[]){
 let path=[...controls];
 for(let i=0;i<3;i++){
  const next=[path[0]!];
  for(let j=1;j<path.length;j++){
   const a=path[j-1]!,b=path[j]!;
   for(const t of [.25,.75])next.push({east:a.east+(b.east-a.east)*t,north:a.north+(b.north-a.north)*t});
  }
  next.push(path.at(-1)!);path=next;
 }
 return path;
}
function pin(e:number,n:number){return e>=425&&e<=455&&n>=508&&n<=532}
type Core={e:number;n:number;lo:number;hi:number;natural:number};
/** Cut/fill the actual raster with fixed station pad and protected
 * vertices. Feasible interval propagation enforces a conservative
 * triangle gradient bound, not just a nominal centreline profile.
 * No road overlay, no write to the source array, no authority claim. */
export function buildMiddleEastRoadbed(field:FrontRidgeR30Field,allowed:Allowed,controls:readonly EN[]=middleEastRoadControls){
 if(controls.length<2)throw new RangeError('road controls');
 const path=smoothPath(controls);
 let cum=0;
 const route:RidgeRoadPoint[]=path.map((p,i)=>{if(i)cum+=Math.hypot(p.east-path[i-1]!.east,p.north-path[i-1]!.north);return {...p,cum,height:field.heightAt(p.east,p.north)??NaN}});
 if(route.some(p=>!Number.isFinite(p.height))||auditRidgeRoadCrossings(route).length)return {ok:false as const,reason:'invalid or crossing plan',route};
 const minE=Math.floor(Math.min(...path.map(p=>p.east))-shoulder),maxE=Math.ceil(Math.max(...path.map(p=>p.east))+shoulder);
 const minN=Math.floor(Math.min(...path.map(p=>p.north))-shoulder),maxN=Math.ceil(Math.max(...path.map(p=>p.north))+shoulder);
 if(minE<=B.west||maxE>=B.east||minN<=B.south||maxN>=B.north)return {ok:false as const,reason:'outer boundary',route};
 const ix=(e:number,n:number)=>(n-B.south)*field.width+e;
 const core=new Map<number,Core>(),near=new Map<number,{e:number;n:number;distance:number}>();
 const endpoints=[route[0]!,route.at(-1)!];
 for(let n=minN;n<=maxN;n++)for(let e=minE;e<=maxE;e++){
  const p=ridgeRoadProject(route,e,n);if(!p||p.distance>=shoulder)continue;
  const id=ix(e,n),old=field.vertexAt(e,n);near.set(id,{e,n,distance:p.distance});
  if(p.distance>half)continue;
  const fixed=pin(e,n)||!allowed(e,n)||endpoints.some(a=>a.east===e&&a.north===n);
  core.set(id,{e,n,natural:old,lo:fixed?old:old-cutLimit,hi:fixed?old:old+cutLimit});
 }
 const queue=[...core.keys()],queued=new Set(queue);
 for(let k=0;k<queue.length;k++){
  const id=queue[k]!,a=core.get(id)!;queued.delete(id);
  if(a.lo>a.hi+1e-7)return {ok:false as const,reason:'incompatible actual grade and cut/fill',east:a.e,north:a.n,lower:a.lo,upper:a.hi,route};
  for(const next of [id-1,id+1,id-field.width,id+field.width]){
   const b=core.get(next);if(!b)continue;
   const lo=Math.max(b.lo,a.lo-axisSlope),hi=Math.min(b.hi,a.hi+axisSlope);
   if(lo>b.lo+1e-8||hi<b.hi-1e-8){b.lo=lo;b.hi=hi;if(!queued.has(next)){queue.push(next);queued.add(next)}}
  }
 }
 const elevation=field.elevation.slice(),weights=field.weights.slice();
 for(const [id,p]of core)elevation[id]=(p.lo+p.hi)/2;
 // Extend from the nearest solved core, then blend to natural ground.
 // Protected ground and station pad remain byte-identical.
 for(const [id,p]of near){
  if(core.has(id)||pin(p.e,p.n)||!allowed(p.e,p.n))continue;
  let nearest:number|undefined,distance=Infinity;
  for(let dn=-8;dn<=8;dn++)for(let de=-8;de<=8;de++){
   const k=ix(p.e+de,p.n+dn),d=Math.hypot(de,dn);if(d<distance&&core.has(k)){nearest=k;distance=d}
  }
  if(nearest===undefined)continue;
  const t=Math.max(0,Math.min(1,(p.distance-half)/(shoulder-half))),w=1-t*t*(3-2*t);
  const old=field.elevation[id]!,target=old+(elevation[nearest]!-old)*w;
  elevation[id]=old+Math.max(-cutLimit,Math.min(cutLimit,target-old));
 }
 const graded=createFrontRidgeR30FieldFromRaster(elevation,weights);
 const finalRoute=route.map(p=>({...p,height:graded.heightAt(p.east,p.north)!}));
 const audit=auditRidgeRoadSurface(graded,finalRoute);
 let cut=0,fill=0,changed=0,protectedChanges=0;
 for(const [id,p]of near){const d=elevation[id]!-field.elevation[id]!;cut=Math.max(cut,-d);fill=Math.max(fill,d);if(Math.abs(d)>1e-6){changed++;if(pin(p.e,p.n)||!allowed(p.e,p.n))protectedChanges++}}
 const ok=audit.maxGrade<=.12+1e-6&&protectedChanges===0&&cut<=cutLimit+1e-5&&fill<=cutLimit+1e-5;
 return {ok,reason:ok?'certified section candidate':'actual surface grade or protection failed',route:finalRoute,field:graded,audit,cut,fill,changed,protectedChanges,roadAt(e:number,n:number){if(e<minE||e>maxE||n<minN||n>maxN)return false;return (ridgeRoadProject(finalRoute,e,n)?.distance??Infinity)<=1.75}};
}
