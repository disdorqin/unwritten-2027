import type {MainSummitTrailPoint as Point} from './main-summit-trail';
import type {SouthGround} from './town-night-a-summit-landform';
const grade=.1199;
/** Fixed EN centreline and fixed endpoints; necessary and sufficient
 * interval certificate for the bounded discrete 12% grade problem.
 * This is a proposed elevation profile for C2, not a new route authority. */
export function proposeSouthRoadGrade(points:readonly Point[],first:number,last:number,groundAt:SouthGround,cap=5,northLimit=448){
 if(first<1||last>=points.length-1||first>=last||!Number.isFinite(cap)||cap<=0||!Number.isFinite(northLimit)||northLimit>480||northLimit<448)throw Error('Invalid road range');
 const rows=points.slice(first,last+1).map((p,j)=>{
  const i=first+j,a=points[i-1]!,b=points[i+1]!,dx=b.east-a.east,dn=b.north-a.north,l=Math.hypot(dx,dn);
  if(!l||p.north>=northLimit||Math.abs(p.east)>1068)throw Error('Route leaves south core');
  const samples=[-1.5,-.75,0,.75,1.5].map(t=>groundAt(p.east-dn/l*t,p.north+dx/l*t));
  if(samples.some(v=>v===undefined||!Number.isFinite(v)))throw Error('Missing ground');
  return {p,min:Math.min(...samples as number[]),max:Math.max(...samples as number[])};
 });
 const lo=rows.map(r=>r.max-cap),hi=rows.map(r=>r.min+cap);
 // Endpoint datums must themselves satisfy cut/fill envelope.
 const lastIdx=lo.length-1;
 for(const j of [0,lastIdx]){const h=rows[j]!.p.height;lo[j]=Math.max(lo[j]!,h);hi[j]=Math.min(hi[j]!,h);}
 const distances=rows.slice(1).map((r,j)=>Math.hypot(r.p.east-rows[j]!.p.east,r.p.north-rows[j]!.p.north));
 for(let i=1;i<lo.length;i++){const d=distances[i-1]!*grade;lo[i]=Math.max(lo[i]!,lo[i-1]!-d);hi[i]=Math.min(hi[i]!,hi[i-1]!+d);}
 for(let i=lo.length-2;i>=0;i--){const d=distances[i]!*grade;lo[i]=Math.max(lo[i]!,lo[i+1]!-d);hi[i]=Math.min(hi[i]!,hi[i+1]!+d);}
 const deficit=Math.max(...lo.map((v,i)=>v-hi[i]!)),length=distances.reduce((a,b)=>a+b,0);
 if(deficit>1e-7)return {ok:false as const,first,last,length,cap,deficit};
 const profile=rows.map((r,i)=>({...r.p,height:(lo[i]!+hi[i]!)/2}));
 let cut=0,fill=0,maxGrade=0;
 for(let i=0;i<profile.length;i++){
  const p=profile[i]!,r=rows[i]!;cut=Math.max(cut,r.max-p.height);fill=Math.max(fill,p.height-r.min);
  if(i)maxGrade=Math.max(maxGrade,Math.abs(p.height-profile[i-1]!.height)/distances[i-1]!);
 }
 return {ok:true as const,first,last,length,cap,deficit,profile,cut,fill,maxGrade};
}
