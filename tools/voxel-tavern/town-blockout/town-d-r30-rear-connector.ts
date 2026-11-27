import {createFrontRidgeR30FieldFromRaster,frontRidgeR30Bounds,type FrontRidgeR30Field} from './town-d-r30-front-ridge';
import {buildMiddleEastRoadbed} from './town-d-r30-upper-roadbed';
import {auditRidgeRoadCrossings,type RidgeRoadPoint} from './town-d-r30-road-survey';
import {auditRidgeRoadSurface} from './town-d-r30-roadbed';
import {auditRidgeCableSweep,surveyRidgeCableSpans} from './town-d-r30-cable-facilities';
const B=frontRidgeR30Bounds;
export const rearConnectorControls=Object.freeze([[294,752],[285,745],[286,739],[300,738],[340,740],[380,741],[420,735],[450,725],[475,715],[500,702],[520,685],[535,660],[545,630],[548,600],[552,570],[551,544],[546,518],[540,500],[530,490],[515,486],[500,489],[485,496],[471,504],[458,508],[447,508],[440,512],[440,516]].map(([east,north])=>({east:east!,north:north!})));
const smooth=(x:number)=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x)};
type Road={route:readonly RidgeRoadPoint[]};
/** Explicit separate landform engineering candidate, not ordinary 8m
 * road grading. Callers must retain both original and reshaped baselines.
 * No terrain mutation or runtime authority grant in this function. */
export function buildRearRidgeConnector(field:FrontRidgeR30Field,roads:readonly Road[],protectedDistance:(e:number,n:number)=>number){
 let path=[...rearConnectorControls];
 for(let k=0;k<3;k++){const next=[path[0]!];for(let j=1;j<path.length;j++){
  const a=path[j-1]!,b=path[j]!;for(const t of [.25,.75])next.push({east:a.east+(b.east-a.east)*t,north:a.north+(b.north-a.north)*t});
 }next.push(path.at(-1)!);path=next;}
 let cum=0;
 const start=field.heightAt(294,752),end=field.heightAt(440,516);
 if(start===undefined||end===undefined||Math.abs(start-87.5)>.001||Math.abs(end-140)>.001)return {ok:false as const,reason:'existing endpoint not certified'};
 const route=path.map((q,i)=>{if(i)cum+=Math.hypot(q.east-path[i-1]!.east,q.north-path[i-1]!.north);return {...q,cum,height:0}});
 for(const q of route)q.height=start+(end-start)*q.cum/cum;
 if(auditRidgeRoadCrossings(route).length)return {ok:false as const,reason:'connector crossing'};
 const W=field.width,N=field.elevation.length,ix=(e:number,n:number)=>(n-B.south)*W+e;
 function raster(routes:readonly (readonly RidgeRoadPoint[])[],radius:number){
  const d=new Float32Array(N).fill(Infinity),y=new Float32Array(N);
  for(const road of routes)for(let j=1;j<road.length;j++){
   const a=road[j-1]!,b=road[j]!,de=b.east-a.east,dn=b.north-a.north,l2=de*de+dn*dn;if(!l2)continue;
   for(let n=Math.max(B.south,Math.floor(Math.min(a.north,b.north)-radius));n<=Math.min(B.north,Math.ceil(Math.max(a.north,b.north)+radius));n++)
    for(let e=Math.max(B.west,Math.floor(Math.min(a.east,b.east)-radius));e<=Math.min(B.east,Math.ceil(Math.max(a.east,b.east)+radius));e++){
     const t=Math.max(0,Math.min(1,((e-a.east)*de+(n-a.north)*dn)/l2)),dist=Math.hypot(e-a.east-de*t,n-a.north-dn*t),i=ix(e,n);
     if(dist<radius&&dist<d[i]!){d[i]=dist;y[i]=a.height+(b.height-a.height)*t;}
    }
  }return {d,y};
 }
 const width=20,core=4,newRoad=raster([route],width+1),old=raster(roads.map(r=>r.route),20);
 const allowed=(e:number,n:number)=>e>B.west&&e<B.east&&n>B.south&&n<B.north&&protectedDistance(e,n)>0&&old.d[ix(e,n)]!>3.6&&!(e>=425&&e<=455&&n>=508&&n<=532);
 const elevation=field.elevation.slice();
 for(let n=B.south;n<=B.north;n++)for(let e=B.west;e<=B.east;e++){
  const i=ix(e,n),d=newRoad.d[i]!;if(d>=width||!allowed(e,n))continue;
  const w=(1-smooth((d-core)/(width-core)))*smooth((old.d[i]!-3.6)/5)*smooth(protectedDistance(e,n)/8);
  elevation[i]=field.elevation[i]!+(newRoad.y[i]!-field.elevation[i]!)*w;
 }
 const landform=createFrontRidgeR30FieldFromRaster(elevation,field.weights.slice());
 const road=buildMiddleEastRoadbed(landform,allowed,rearConnectorControls,{startHeight:start,endHeight:end});
 if(!road.ok||!('field'in road))return {ok:false as const,reason:road.reason};
 let max=0,changed=0,cut=0,fill=0,oldMax=0,frozen=0,roadMax=0;
 for(let n=B.south;n<=B.north;n++)for(let e=B.west;e<=B.east;e++){
  const i=ix(e,n),d=road.field.elevation[i]!-field.elevation[i]!;
  max=Math.max(max,Math.abs(d));roadMax=Math.max(roadMax,Math.abs(road.field.elevation[i]!-landform.elevation[i]!));
  if(Math.abs(d)>.00001){changed++;cut+=Math.max(0,-d);fill+=Math.max(0,d);if(!allowed(e,n))frozen++;}
  if(old.d[i]!<=3.6)oldMax=Math.max(oldMax,Math.abs(d));
 }
 const oldGrades=roads.map(r=>auditRidgeRoadSurface(road.field,r.route).maxGrade);
 const cable=auditRidgeCableSweep(road.field,surveyRidgeCableSpans(road.field,true));
 const audit={length:road.route.at(-1)!.cum,maxChange:max,changed,cutVolumeApprox:cut,fillVolumeApprox:fill,oldMax,frozen,roadMax,oldGrades,cable};
 const ok=frozen===0&&oldMax===0&&roadMax<=8.00001&&oldGrades.every(g=>g<=.120001)&&cable.groundHits===0&&cable.minMoving>=.25;
 return {ok,reason:ok?'landform and graded corridor candidate':'failed existing road or cable/protection audit',road,landform,audit};
}
