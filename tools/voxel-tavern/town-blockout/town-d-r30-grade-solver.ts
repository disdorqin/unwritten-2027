/** Feasibility solver for the real raster triangles. The fast conservative
 * box solver is retained; fallback relaxes only the sufficient condition
 * |dx|,|dz| <= grade/sqrt(2), never the true Euclidean gradient limit.
 * It may fail to find a feasible solution; it never certifies by iteration
 * count or the nominal centerline. */
export type GradeInterval={lo:number;hi:number};
type Failure={id:number;lo:number;hi:number};
const grade=.11994;
type Core=Map<number,GradeInterval>;
function propagate(source:Core,width:number,limit:number){
 const core=new Map([...source].map(([id,p])=>[id,{...p}]));
 const queue=[...core.keys()],queued=new Set(queue);
 for(let k=0;k<queue.length;k++){
  const id=queue[k]!,a=core.get(id)!;queued.delete(id);
  if(a.lo>a.hi+1e-7)return {failure:{id,lo:a.lo,hi:a.hi}};
  for(const next of [id-1,id+1,id-width,id+width]){
   const b=core.get(next);if(!b)continue;
   const lo=Math.max(b.lo,a.lo-limit),hi=Math.min(b.hi,a.hi+limit);
   if(lo>b.lo+1e-8||hi<b.hi-1e-8){b.lo=lo;b.hi=hi;if(!queued.has(next)){queue.push(next);queued.add(next)}}
  }
 }
 return {core};
}
export function solveRidgeGradeCore(source:Core,width:number,opts:{forceTriangle?:boolean;maxSweeps?:number}={}):
 {ok:true;heights:Map<number,number>;mode:'box'|'triangle';sweeps:number}|{ok:false;failure:Failure;reason:string}{
 // Preserve the former production solver's exact slope margin.
 const fast=opts.forceTriangle?undefined:propagate(source,width,.12/Math.SQRT2-.00015);
 if(fast?.core)return {ok:true,heights:new Map([...fast.core].map(([id,p])=>[id,(p.lo+p.hi)/2])),mode:'box',sweeps:0};
 const relaxed=propagate(source,width,grade);
 if(!relaxed.core)return {ok:false,failure:relaxed.failure!,reason:'incompatible actual grade and cut/fill'};
 const ids=[...relaxed.core.keys()],index=new Map(ids.map((id,i)=>[id,i])),lo=new Float64Array(ids.length),hi=new Float64Array(ids.length),v=new Float64Array(ids.length);
 for(let i=0;i<ids.length;i++){const p=relaxed.core.get(ids[i]!)!;lo[i]=p.lo;hi[i]=p.hi;v[i]=(p.lo+p.hi)/2}
 const faces:number[][]=[],edges:number[][]=[];
 for(const id of ids){
  const a=index.get(id)!,b=index.get(id+1),c=index.get(id+width);
  if(b!==undefined)edges.push([a,b]);if(c!==undefined)edges.push([a,c]);
  if(b!==undefined&&c!==undefined)faces.push([a,b,c]);
  const left=index.get(id-1),down=index.get(id-width);
  if(left!==undefined&&down!==undefined)faces.push([a,left,down]);
 }
 const clamp=(i:number,h:number)=>Math.max(lo[i]!,Math.min(hi[i]!,h));
 // Projection is onto a mean-preserving gradient disk, then bounds.
 // Alternating bounded sweeps are heuristic; independent validation
 // of every face/edge below is the sole acceptance criterion.
 function face(a:number,b:number,c:number){
  const x=v[b]!-v[a]!,z=v[c]!-v[a]!,norm=Math.hypot(x,z);
  if(norm<=grade)return;
  const mean=(v[a]!+v[b]!+v[c]!)/3,f=grade/norm,base=mean-f*(x+z)/3;
  v[a]=clamp(a,base);v[b]=clamp(b,base+x*f);v[c]=clamp(c,base+z*f);
 }
 function edge(a:number,b:number){
  const d=v[b]!-v[a]!;if(Math.abs(d)<=grade)return;
  const mid=(v[a]!+v[b]!)/2,half=Math.sign(d)*grade/2;
  v[a]=clamp(a,mid-half);v[b]=clamp(b,mid+half);
 }
 function worst(){
  let excess=0,bad=0;
  for(const [a,b,c] of faces){const x=Math.hypot(v[b!]!-v[a!]!,v[c!]!-v[a!]!)-grade;if(x>excess){excess=x;bad=a!}}
  for(const [a,b]of edges){const x=Math.abs(v[b!]!-v[a!]!)-grade;if(x>excess){excess=x;bad=a!}}
  return {excess,bad};
 }
 const max=opts.maxSweeps??160;
 for(let sweep=0;sweep<=max;sweep++){
  if(sweep%4===0||sweep===max){const w=worst();if(w.excess<=.000005)return {ok:true,heights:new Map(ids.map((id,i)=>[id,v[i]!])),mode:'triangle',sweeps:sweep};
   if(sweep===max)return {ok:false,failure:{id:ids[w.bad]!,lo:lo[w.bad]!,hi:hi[w.bad]!},reason:'triangle projection did not certify'};}
  for(const [a,b,c]of faces)face(a!,b!,c!);for(const [a,b]of edges)edge(a!,b!);
  for(let i=faces.length-1;i>=0;i--){const [a,b,c]=faces[i]!;face(a!,b!,c!)}
 }
 throw Error('unreachable grade solver');
}
