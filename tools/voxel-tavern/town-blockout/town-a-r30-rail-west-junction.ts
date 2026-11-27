import {CubicBezierCurve3,Vector3} from 'three';
import {railRadius} from './town-a-r30-rail-junction-plan';
import {surveyRailGrade,type RailSample} from './town-a-r30-rail-strip';
type EN=Readonly<{east:number;north:number}>;
type LoopPoint=Readonly<{x:number;y:number;z:number}>;
type Solid=Readonly<{min:readonly number[];max:readonly number[]}>;
type Survey=Readonly<{loopIndex:number;spliceIndex:number;length:number;minRadius:number;maxFill:number;maxGrade:number;throatLength:number;maxStockMismatch:number;underpassLength:number;minUnderpassClearance:number;solidConflicts:number;protectedIntrusions:number;minPostThroatGap:number}>;
const dist=(a:EN,b:EN)=>Math.hypot(a.east-b.east,a.north-b.north);
const finite=(p:RailSample)=>[p.east,p.north,p.y,p.ground].every(Number.isFinite);
const bounded=(v:number)=>Math.min(1,Math.max(0,v));
/** Alternate departure on the west side of the original ring, leaving
 * the existing east platform untouched. A later crossing must pass under
 * the real ring with sufficient train clearance AND no existing piers.
 * This survey is not permission to change the ring, build a tall bridge,
 * or create a branch train clock. */
export function surveyAR30WestJunction(old:readonly RailSample[],loop:readonly LoopPoint[],solids:readonly Solid[],ground:(e:number,n:number)=>number,options:{maxFill?:number}={}){
 if(old.length<150||!old.every(finite)||loop.length<3||loop.some(p=>![p.x,p.y,p.z].every(Number.isFinite))||!solids.length||solids.some(b=>b.min.length!==3||b.max.length!==3||!b.min.every((v,i)=>Number.isFinite(v)&&Number.isFinite(b.max[i])&&v<=b.max[i]!)))throw Error('Missing exact ring geometry');
 const maxFill=options.maxFill??4.2;
 if(!Number.isFinite(maxFill)||maxFill<=0)throw Error('Invalid fill limit');
 const l=loop.map(p=>({east:p.x,north:-p.z,y:p.y}));
 const possible=l.flatMap((p,i)=>p.east>475&&p.east<480&&p.north>=311&&p.north<=325?[i]:[]);
 const cell=12;
 type Segment={a:typeof l[number];b:typeof l[number]};
 const cells=new Map<string,Segment[]>(),boxCells=new Map<string,Solid[]>();
 const index=<T>(map:Map<string,T[]>,v:T,e0:number,n0:number,e1:number,n1:number)=>{
  for(let e=Math.floor(e0/cell);e<=Math.floor(e1/cell);e++)for(let n=Math.floor(n0/cell);n<=Math.floor(n1/cell);n++){
   const key=e+','+n,list=map.get(key)??[];list.push(v);map.set(key,list);
  }
 };
 for(let j=0;j<l.length;j++){
  const a=l[j]!,b=l[(j+1)%l.length]!;
  index(cells,{a,b},Math.min(a.east,b.east)-5,Math.min(a.north,b.north)-5,Math.max(a.east,b.east)+5,Math.max(a.north,b.north)+5);
 }
 for(const b of solids)index(boxCells,b,b.min[0]!-2,-b.max[2]!-2,b.max[0]!+2,-b.min[2]!+2);
 function nearest(p:EN){
  let d=Infinity,y=0;
  for(const {a,b} of cells.get(Math.floor(p.east/cell)+','+Math.floor(p.north/cell))??[]){
   const de=b.east-a.east,dn=b.north-a.north,t=bounded(((p.east-a.east)*de+(p.north-a.north)*dn)/(de*de+dn*dn||1));
   const g=Math.hypot(p.east-a.east-de*t,p.north-a.north-dn*t);
   if(g<d){d=g;y=a.y+(b.y-a.y)*t;}
  }return {d,y};
 }
 let best:Survey|undefined,plan:{survey:Survey;samples:RailSample[]}|undefined,attempts=0,geometries=0;
 const rejects={radius:0,throat:0,protected:0,ground:0,endpoints:0,grade:0};
 const limit=.1199;
 for(const loopIndex of possible)for(const spliceIndex of [113,116,120,124,130,135,140])for(const firstLead of [30,40,50,60,70,80])for(const lastLead of [45,55,65,75,85,95]){
  attempts++;
  const start=l[loopIndex]!,prev=l[(loopIndex+l.length-1)%l.length]!,next=l[(loopIndex+1)%l.length]!,end=old[spliceIndex]!,before=old[spliceIndex-1]!,after=old[spliceIndex+1]!;
  const a=dist(prev,next),b=dist(before,after);
  const c0={east:start.east+(next.east-prev.east)/a*firstLead,north:start.north+(next.north-prev.north)/a*firstLead};
  const c1={east:end.east-(after.east-before.east)/b*lastLead,north:end.north-(after.north-before.north)/b*lastLead};
  // Endpoint derivatives are exactly the real stock and downstream
  // tangents. A cubic avoids the artificial sharp corner of a short
  // Catmull-Rom lead and allows a smooth lateral divergence.
  const v=(p:EN)=>new Vector3(p.east,0,-p.north);
  const curve=new CubicBezierCurve3(v(start),v(c0),v(c1),v(end));curve.arcLengthDivisions=600;
  const length=curve.getLength(),count=Math.ceil(length/1.15),pts=Array.from({length:count+1},(_,i)=>{const p=curve.getPointAt(i/count);return {east:p.x,north:-p.z};});
  const radius=railRadius([...pts,after]);if(radius<22){rejects.radius++;continue;}
  const ds=[0];for(let i=1;i<pts.length;i++)ds.push(ds[i-1]!+dist(pts[i-1]!,pts[i]!));
  const near=pts.map(nearest);
  let throat=0;while(throat+1<pts.length&&near[throat+1]!.d<3.4)throat++;
  if(ds[throat]!>42||throat===pts.length-1){rejects.throat++;continue;}
  let protectedIntrusions=0;
  for(const p of pts){
   if(p.east<450&&p.north<386||p.north>=308&&p.north<=332&&p.east>477.12&&p.east<487)protectedIntrusions++;
  }
  if(protectedIntrusions){rejects.protected++;continue;}
  const base=pts.map(p=>Math.max(...[[0,0],[1.4,0],[-1.4,0],[0,1.4],[0,-1.4]].map(([e,n])=>ground(p.east+e!,p.north+n!))));
  if(!base.every(Number.isFinite)){rejects.ground++;continue;}
  const y=base.map(h=>h+.62);
  // Share the ring head through the initial throat; no hovering or
  // bifurcating vertically while the actual rail widths still overlap.
  for(let i=0;i<=throat;i++)if(near[i]!.d<1.90)y[i]=Math.max(y[i]!,near[i]!.y);
  y[0]=Math.max(y[0]!,start.y);y[y.length-1]=Math.max(y.at(-1)!,end.y);
  for(let i=1;i<y.length;i++)y[i]=Math.max(y[i]!,y[i-1]!-limit*(ds[i]!-ds[i-1]!));
  for(let i=y.length-2;i>=0;i--)y[i]=Math.max(y[i]!,y[i+1]!-limit*(ds[i+1]!-ds[i]!));
  if(Math.abs(y[0]!-start.y)>.00001||Math.abs(y.at(-1)!-end.y)>.00001){rejects.endpoints++;continue;}
  let maxStockMismatch=0,underpassLength=0,minUnderpassClearance=Infinity,solidConflicts=0,minPostThroatGap=Infinity;
  for(let i=0;i<pts.length;i++){
   const p=pts[i]!,q=near[i]!,h=y[i]!;
   if(i<=throat){
    if(q.d<1.90)maxStockMismatch=Math.max(maxStockMismatch,Math.abs(h-q.y));
    continue;
   }
   if(q.d<3.4){
    underpassLength+=ds[i]!-ds[i-1]!;
    minUnderpassClearance=Math.min(minUnderpassClearance,q.y-h-.65);
   }else minPostThroatGap=Math.min(minPostThroatGap,q.d);
   // Actual ring supports, platform, stair and track collision boxes;
   // use conservative train + ballast envelope (2m lateral, 3.6m above).
   for(const box of boxCells.get(Math.floor(p.east/cell)+','+Math.floor(p.north/cell))??[]){
    const dx=Math.max(box.min[0]!-p.east,p.east-box.max[0]!,0),dz=Math.max(box.min[2]!+p.north,-p.north-box.max[2]!,0);
    if(Math.hypot(dx,dz)<1.75&&box.max[1]!>h-.65&&box.min[1]!<h+3.6){solidConflicts++;break;}
   }
  }
  const samples=[...pts.slice(0,-1).map((p,i)=>({...p,y:y[i]!,ground:base[i]!})),...old.slice(spliceIndex)];
  if(surveyRailGrade(samples).violations.length){rejects.grade++;continue;}
  geometries++;
  const fill=Math.max(...pts.map((_,i)=>y[i]!-base[i]!));
  const grade=Math.max(...samples.slice(1).map((p,i)=>Math.abs(p.y-samples[i]!.y)/dist(p,samples[i]!)));
  const survey={loopIndex,spliceIndex,length:ds.at(-1)!,minRadius:radius,maxFill:fill,maxGrade:grade,throatLength:ds[throat]!,maxStockMismatch,underpassLength,minUnderpassClearance:Number.isFinite(minUnderpassClearance)?minUnderpassClearance:999,solidConflicts,protectedIntrusions,minPostThroatGap:Number.isFinite(minPostThroatGap)?minPostThroatGap:999};
  const score=(s:Survey)=>s.solidConflicts*10+Math.max(0,4.25-s.minUnderpassClearance)*25+s.maxStockMismatch*100+s.maxFill;
  if(!best||score(survey)<score(best))best=survey;
  if(fill<=maxFill&&maxStockMismatch<=.03&&!solidConflicts&&survey.minUnderpassClearance>=4.25&&(!plan||fill<plan.survey.maxFill))plan={samples,survey};
 }
 return {attempts,geometries,rejects,best,plan};
}
