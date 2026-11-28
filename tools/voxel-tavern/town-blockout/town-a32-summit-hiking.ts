import {finishNightBAudit} from './town-night-b-audit-slices';
export type HikingFoot=Readonly<{east:number;north:number;height:number}>;
export type HikingPoint=Pick<HikingFoot,'east'|'north'>;
export type HikingSurface={
 surfaceAt(e:number,n:number):number|undefined;
 supportAt(e:number,n:number,r?:number):number|undefined;
 blocked(e:number,n:number,h:number,r?:number,b?:number):boolean;
};
const radius=.27,body=1.8;
export const hikingStart={east:0,north:-8},hikingEnd={east:30,north:982};
// Surveyed on the installed 59a2601c four-sector host, not guessed terrain.
export const hikingWaypoints:readonly HikingPoint[]=Object.freeze([
 [0,-8],[0,36],[-4,44],[44,76],[56,80],[56,128],[56,176],[60,220],[60,268],
 [60,316],[60,364],[92,412],[96,412],[100,444],[80,452],[84,456],[72,456],[80,464],
 [72,464],[80,472],[64,472],[72,480],[44,492],[44,540],[44,588],[40,636],[40,684],
 [40,732],[40,780],[40,828],[40,876],[40,924],[36,972],[30,982],
].map(([east,north])=>Object.freeze({east:east!,north:north!})));
/** A pedestrian trail certificate, not a graded 12% road certificate.
 * Every edge is checked in both directions with the production foot radius,
 * four footprint support probes, clearance and actual height. No jump. */
export function createHikingProbe(host:HikingSurface,maxGrade=.70){
 let samples=0,maxObserved=0;
 function foot(e:number,n:number):HikingFoot|undefined{
  samples++;
  const h=host.supportAt(e,n,radius);
  if(h===undefined||!Number.isFinite(h)||host.blocked(e,n,h,radius,body))return;
  for(const [de,dn] of [[radius,0],[-radius,0],[0,radius],[0,-radius]])
   if(host.surfaceAt(e+de!,n+dn!)===undefined)return;
  return {east:e,north:n,height:h};
 }
 function edge(a:HikingFoot,b:HikingFoot,spacing=.25){
  const d=Math.hypot(a.east-b.east,a.north-b.north);
  if(d<1e-8)return Math.abs(a.height-b.height)<.001;
  const count=Math.ceil(d/spacing);
  let prev=a,grade=0;
  for(let j=1;j<=count;j++){
   const t=j/count,p=j===count?b:foot(a.east+(b.east-a.east)*t,a.north+(b.north-a.north)*t);
   if(!p)return false;
   const g=Math.abs(p.height-prev.height)/(d/count);
   if(g>maxGrade+1e-6)return false;
   grade=Math.max(grade,g);prev=p;
  }
  maxObserved=Math.max(maxObserved,grade);return true;
 }
 return {foot,edge,samples:()=>samples,maxGrade:()=>maxObserved};
}
export function* certifyHikingSteps(host:HikingSurface,points:readonly HikingPoint[],maxGrade=.70){
 const probe=createHikingProbe(host,maxGrade),path:HikingFoot[]=[];
 let metres=0;
 for(let i=0;i<points.length;i++){
  yield;
  const p=points[i]!,f=probe.foot(p.east,p.north),prev=path.at(-1);
  if(!f||prev&&!probe.edge(prev,f))return {ready:false as const,failed:i,samples:probe.samples(),path:[] as HikingFoot[],metres:0,maxGrade:0};
  if(prev)metres+=Math.hypot(f.east-prev.east,f.north-prev.north);
  path.push(f);
 }
 return {ready:path.length>=2,path,metres,maxGrade:probe.maxGrade(),samples:probe.samples()};
}
export function certifyHiking(host:HikingSurface,points:readonly HikingPoint[],maxGrade=.70){return finishNightBAudit(certifyHikingSteps(host,points,maxGrade));}
/** Offline deterministic survey. This is not invoked during the game.
 * Use a coarse A* grid only to propose waypoints, then certify the actual
 * edges at .25 m with the same public host. */
export function surveyHiking(host:HikingSurface,maxGrade=.70,spacing=4){
 const probe=createHikingProbe(host,maxGrade);
 const start=probe.foot(hikingStart.east,hikingStart.north),goal=probe.foot(hikingEnd.east,hikingEnd.north);
 if(!start||!goal)return {ready:false as const,reason:'endpoint',path:[] as HikingFoot[]};
 const west=-360,south=-8,cols=Math.floor(720/spacing)+1,rows=Math.floor(1040/spacing)+1;
 const id=(x:number,y:number)=>y*cols+x;
 const coord=(k:number)=>({east:west+(k%cols)*spacing,north:south+Math.floor(k/cols)*spacing});
 const near=(p:HikingPoint)=>id(Math.round((p.east-west)/spacing),Math.round((p.north-south)/spacing));
 const first=near(start),last=near(goal),cache=new Map<number,HikingFoot|undefined>();
 const at=(k:number)=>{if(!cache.has(k)){const p=coord(k);cache.set(k,probe.foot(p.east,p.north));}return cache.get(k);};
 const costs=new Map<number,number>([[first,0]]),parents=new Map<number,number>();
 const heap:{id:number;priority:number;cost:number}[]=[];
 function push(v:typeof heap[number]){let i=heap.length;heap.push(v);while(i>0){const p=(i-1)>>1;if(heap[p]!.priority<=v.priority)break;heap[i]=heap[p]!;i=p;}heap[i]=v;}
 function pop(){const top=heap[0]!,v=heap.pop()!;if(heap.length){let i=0;while(i*2+1<heap.length){let j=i*2+1;if(j+1<heap.length&&heap[j+1]!.priority<heap[j]!.priority)j++;if(heap[j]!.priority>=v.priority)break;heap[i]=heap[j]!;i=j;}heap[i]=v;}return top;}
 const heuristic=(k:number)=>{const p=coord(k);return Math.hypot(p.east-goal.east,p.north-goal.north);};
 const root=at(first),tail=at(last);
 if(!root||!tail||!probe.edge(start,root)||!probe.edge(tail,goal))return {ready:false as const,reason:'grid-endpoint',path:[] as HikingFoot[]};
 push({id:first,priority:heuristic(first),cost:0});
 let expanded=0;
 while(heap.length){
  const current=pop(),k=current.id;if(current.cost!==costs.get(k))continue;
  if(k===last){
   const path:HikingFoot[]=[goal];for(let j=k;;j=parents.get(j)!){path.push(at(j)!);if(j===first)break;}path.push(start);path.reverse();
   // Remove duplicate and greedily merge only when the complete direct
   // edge still passes the exact walking certificate.
   const compact:HikingFoot[]=[path[0]!];let j=0;
   while(j<path.length-1){let end=Math.min(path.length-1,j+12);while(end>j+1&&!probe.edge(path[j]!,path[end]!))end--;compact.push(path[end]!);j=end;}
   return {...certifyHiking(host,compact,maxGrade),expanded};
  }
  expanded++;
  const a=at(k)!,x=k%cols,y=Math.floor(k/cols);
  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
   const xx=x+dx!,yy=y+dy!;if(xx<0||xx>=cols||yy<0||yy>=rows)continue;
   const next=id(xx,yy),b=at(next);if(!b)continue;
   const d=Math.hypot(a.east-b.east,a.north-b.north),rise=Math.abs(a.height-b.height);
   if(rise>maxGrade*d)continue;
   const cost=current.cost+d+rise*.75;
   if(cost>=(costs.get(next)??Infinity)||!probe.edge(a,b))continue;
   costs.set(next,cost);parents.set(next,k);push({id:next,priority:cost+heuristic(next),cost});
  }
 }
 return {ready:false as const,reason:'no-path',path:[] as HikingFoot[],expanded};
}
