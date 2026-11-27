import {CatmullRomCurve3,Vector3} from 'three';
import {surveyRailGrade,type RailSample} from './town-a-r30-rail-strip';
type LoopPoint=Readonly<{x:number;y:number;z:number}>;
type EN=Readonly<{east:number;north:number}>;
type Ground=(east:number,north:number)=>number;
const gap=(a:EN,b:EN)=>Math.hypot(a.east-b.east,a.north-b.north);
const valid=(p:RailSample)=>[p.east,p.north,p.y,p.ground].every(Number.isFinite);
export function railRadius(points:readonly EN[]){
 let min=Infinity;
 for(let i=1;i<points.length-1;i++){
  const a=points[i-1]!,b=points[i]!,c=points[i+1]!;
  const area=Math.abs((b.east-a.east)*(c.north-a.north)-(b.north-a.north)*(c.east-a.east));
  if(area>1e-7)min=Math.min(min,gap(a,b)*gap(b,c)*gap(a,c)/(2*area));
 }
 return min;
}
function distanceSegment(p:EN,a:EN,b:EN){
 const de=b.east-a.east,dn=b.north-a.north,t=Math.max(0,Math.min(1,((p.east-a.east)*de+(p.north-a.north)*dn)/(de*de+dn*dn||1)));
 return Math.hypot(p.east-a.east-t*de,p.north-a.north-t*dn);
}
export type JunctionPlan=Readonly<{
 samples:readonly RailSample[];spliceIndex:number;loopIndex:number;throatLength:number;minRadius:number;
 maxGrade:number;maxFill:number;length:number;outsideClearance:number;stockHeadMismatch:number;platformIntrusion:boolean;geometryCandidate:true;
}>;
/** Solve the north-east approach only. Preserve the old downstream
 * sample objects and both station elevations. No second train route,
 * clock, or permission to modify the frozen ring. */
export function planAR30RailJunction(old:readonly RailSample[],loop:readonly LoopPoint[],groundAt:Ground,options:{maxFill?:number;minRadius?:number}={}):{plan:JunctionPlan|undefined;best:Omit<JunctionPlan,'samples'|'geometryCandidate'>|undefined;attempts:number}{
 if(old.length<150||loop.length<3||!old.every(valid)||loop.some(p=>![p.x,p.y,p.z].every(Number.isFinite)))throw Error('Missing surveyed rail data');
 const maxFill=options.maxFill??4.2,minRadius=options.minRadius??22,limit=.1199;
 if(!Number.isFinite(maxFill)||maxFill<=0||!Number.isFinite(minRadius)||minRadius<=0)throw Error('Invalid engineering bounds');
 const l=loop.map(p=>({east:p.x,north:-p.z,y:p.y}));
 const candidates=l.flatMap((p,i)=>p.east>475&&p.east<480&&p.north>=314&&p.north<=331?[i]:[]);
 let best:JunctionPlan|undefined,approved:JunctionPlan|undefined,attempts=0;
 const memo=new Map<string,number>();
 function ground(e:number,n:number){
  const k=e.toFixed(5)+','+n.toFixed(5);let h=memo.get(k);
  if(h===undefined){h=Math.max(...[[0,0],[-1.4,0],[1.4,0],[0,-1.4],[0,1.4]].map(([de,dn])=>groundAt(e+de!,n+dn!)));memo.set(k,h);}
  return h;
 }
 for(const loopIndex of candidates)for(const spliceIndex of [113,116,120,124,130])for(const east of [483,488,493,498])for(const middle of [370,388,406]){
  attempts++;
  const start=l[loopIndex]!,next=l[(loopIndex+1)%l.length]!,prev=l[(loopIndex+l.length-1)%l.length]!;
  const end=old[spliceIndex]!,after=old[spliceIndex+1]!,before=old[spliceIndex-1]!;
  const st=Math.hypot(next.east-prev.east,next.north-prev.north),et=gap(before,after);
  const startLead={east:start.east+(next.east-prev.east)/st*5,north:start.north+(next.north-prev.north)/st*5};
  const endLead={east:end.east-(after.east-before.east)/et*9,north:end.north-(after.north-before.north)/et*9};
  if(startLead.north>=middle-12||endLead.north<=middle+18)continue;
  const controls=[start,startLead,{east:east-4,north:start.north+25},{east,north:middle},{east:east-8,north:middle+27},{east:(east+end.east)/2+4,north:end.north-25},endLead,end];
  const c=new CatmullRomCurve3(controls.map(p=>new Vector3(p.east,0,-p.north)),false,'centripetal');c.arcLengthDivisions=600;
  const length=c.getLength(),count=Math.ceil(length/1.4);
  const pts=Array.from({length:count+1},(_,i)=>{const p=c.getPointAt(i/count);return {east:p.x,north:-p.z};});
  const radius=railRadius([...pts,after]);if(radius<minRadius)continue;
  const ds=[0];for(let i=1;i<pts.length;i++)ds.push(ds[i-1]!+gap(pts[i-1]!,pts[i]!));
  // One contiguous stock throat only. After separating, no re-entry to
  // the ring's horizontal clearance envelope is allowed.
  let throatLength=0,outsideClearance=Infinity,separated=false,overlap=false;
  for(let i=0;i<pts.length;i++){
   const p=pts[i]!;let d=Infinity;
   for(let j=0;j<l.length;j++){
    const a=l[j]!,b=l[(j+1)%l.length]!;
    if(Math.abs(p.east-a.east)>9&&Math.abs(p.east-b.east)>9||Math.abs(p.north-a.north)>9&&Math.abs(p.north-b.north)>9)continue;
    d=Math.min(d,distanceSegment(p,a,b));
   }
   if(d<3.4){if(separated){overlap=true;break;}throatLength=ds[i]!;}
   else {separated=true;outsideClearance=Math.min(outsideClearance,d);}
  }
  if(overlap||!separated||throatLength>42)continue;
  const base=pts.map(p=>ground(p.east,p.north));
  const y=base.map(h=>h+.62);y[0]=Math.max(y[0]!,start.y);y[y.length-1]=Math.max(y.at(-1)!,end.y);
  for(let i=1;i<y.length;i++)y[i]=Math.max(y[i]!,y[i-1]!-limit*(ds[i]!-ds[i-1]!));
  for(let i=y.length-2;i>=0;i--)y[i]=Math.max(y[i]!,y[i+1]!-limit*(ds[i+1]!-ds[i]!));
  if(Math.abs(y[0]!-start.y)>.00001||Math.abs(y.at(-1)!-end.y)>.00001)continue;
  if(!base.every(Number.isFinite))continue;
  const prefix=pts.slice(0,-1).map((p,i)=>({...p,y:y[i]!,ground:base[i]!}));
  // The old east-side station platform is a frozen real structure.
  // Reject any diverging route envelope on its platform, and rail-head
  // mismatches while the two tracks physically overlap.
  let stockHeadMismatch=0,platformIntrusion=false;
  for(const p of prefix){
   if(p.north>=309&&p.north<=331&&p.east>477.12&&p.east<485)platformIntrusion=true;
   let nearest=Infinity,at=0;
   for(let j=0;j<l.length;j++){
    const a=l[j]!,b=l[(j+1)%l.length]!,de=b.east-a.east,dn=b.north-a.north,t=Math.max(0,Math.min(1,((p.east-a.east)*de+(p.north-a.north)*dn)/(de*de+dn*dn||1)));
    const d=Math.hypot(p.east-a.east-t*de,p.north-a.north-t*dn);
    if(d<nearest){nearest=d;at=a.y+t*(b.y-a.y);}
   }
   if(nearest<1.90)stockHeadMismatch=Math.max(stockHeadMismatch,Math.abs(p.y-at));
  }
  const samples=[...prefix,...old.slice(spliceIndex)];
  const v=surveyRailGrade(samples);
  if(v.violations.length)continue;
  const fill=Math.max(...prefix.map(p=>p.y-p.ground));
  const grade=Math.max(...samples.slice(1).map((p,i)=>Math.abs(p.y-samples[i]!.y)/gap(p,samples[i]!)));
  const result:JunctionPlan={samples,spliceIndex,loopIndex,throatLength,minRadius:radius,maxGrade:grade,maxFill:fill,length:ds.at(-1)!,outsideClearance,stockHeadMismatch,platformIntrusion,geometryCandidate:true};
  if(!best||fill<best.maxFill-1e-6||Math.abs(fill-best.maxFill)<1e-6&&result.length<best.length)best=result;
  if(fill<=maxFill&&stockHeadMismatch<=.03&&!platformIntrusion&&(!approved||fill<approved.maxFill-1e-6||Math.abs(fill-approved.maxFill)<1e-6&&result.length<approved.length))approved=result;
 }
 if(best){const {samples,geometryCandidate,...metrics}=best;return {plan:approved,best:metrics,attempts};}
 return {plan:undefined,best:undefined,attempts};
}
