type Point=Readonly<{east:number;north:number;height:number;cum:number}>;
type Ground=(e:number,n:number)=>number|undefined;
/** Exact minimax reprofile on C2's existing plan, without moving either
 * anchor or the centreline. A feasible interval is propagated per station;
 * binary search gives the minimum possible maximum cut/fill on this plan.
 * This is a candidate EARTHWORK survey, never a second ground authority. */
export function fitA33FrontAscent(points:readonly Point[],groundAt:Ground,grade:number,start=140,end=347){
 if(points.length<2||!Number.isFinite(grade)||grade<=0||![start,end].every(Number.isFinite))throw Error('Invalid ascent grade pins');
 const ground=points.map(p=>groundAt(p.east,p.north)),runs=points.map((p,i)=>i?Math.hypot(p.east-points[i-1]!.east,p.north-points[i-1]!.north):0);
 if(ground.some(h=>h===undefined||!Number.isFinite(h))||runs.slice(1).some(d=>!Number.isFinite(d)||d<=0))throw Error('Ascent left real ground or repeated station');
 const length=runs.reduce((a,b)=>a+b,0),hs=ground as number[],n=points.length;
 if(Math.abs(end-start)>grade*length+1e-8)throw Error('Plan too short for both fixed pins');
 function feasible(cap:number){
  const low=new Float64Array(n),high=new Float64Array(n);
  for(let i=0;i<n;i++){
   const g=hs[i]!,l=g-cap,u=g+cap;
   let a=i===0?start:Math.max(l,low[i-1]!-grade*runs[i]!),b=i===0?start:Math.min(u,high[i-1]!+grade*runs[i]!);
   if(i===n-1){a=Math.max(a,end);b=Math.min(b,end);}
   if(a>b+1e-9||a<l-1e-9||b>u+1e-9)return;
   low[i]=a;high[i]=b;
  }
  return {low,high};
 }
 let lo=0,hi=Math.max(...hs.map(h=>Math.max(Math.abs(h-start),Math.abs(h-end))))+1;
 for(let i=0;i<46;i++){const mid=(lo+hi)/2;if(feasible(mid))hi=mid;else lo=mid;}
 const intervals=feasible(hi+.000001)!;
 const profile=new Float64Array(n);profile[n-1]=end;
 for(let i=n-2;i>=0;i--){
  const a=Math.max(intervals.low[i]!,profile[i+1]!-grade*runs[i+1]!),b=Math.min(intervals.high[i]!,profile[i+1]!+grade*runs[i+1]!);
  profile[i]=Math.min(b,Math.max(a,hs[i]!));
 }
 profile[0]=start;
 let cut=0,fill=0,actualGrade=0,cutAt=0,fillAt=0,over8=0;
 for(let i=0;i<n;i++){
  const d=profile[i]!-hs[i]!;
  if(d< -cut){cut=-d;cutAt=i;}if(d>fill){fill=d;fillAt=i;}
  if(Math.abs(d)>8)over8++;
  if(i)actualGrade=Math.max(actualGrade,Math.abs(profile[i]!-profile[i-1]!)/runs[i]!);
 }
 return {points:points.map((p,i)=>({...p,height:profile[i]!})),length,minimumMaxEarthwork:hi,cut,fill,cutAt,fillAt,actualGrade,over8,possibleAt8m:!!feasible(8)};
}
