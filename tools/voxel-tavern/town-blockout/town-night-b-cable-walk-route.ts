import {finishNightBAudit} from './town-night-b-audit-slices';
type Foot=Readonly<{east:number;north:number;height:number}>;
type Point=Readonly<{east:number;north:number}>;
type Bounds=Readonly<{west:number;east:number;south:number;north:number}>;
type Ground=(e:number,n:number)=>number|undefined;
type Block=(e:number,n:number,h:number,r:number,b:number)=>boolean;
type Goal=Readonly<{id:string;foot:Foot;reach?:number;accept?:(foot:Foot)=>boolean}>;
type Input={start:Foot;goals:readonly Goal[];bounds:Bounds;supportAt:Ground;blocked:Block;step?:number;maxGrade?:number;maxHeightDrift?:number;allowsSupportedStep?:(from:Foot,to:Foot)=>boolean};
/** Bounded reachability on the real walking authority. No straight-line
 * assumption, fake height or jump. Every edge samples its midpoint and
 * exact endpoints with the player footprint. The returned paths can be
 * replayed in the actual viewer; this is geometric evidence, not a browser walk. */
export function* nightBCableWalkRouteSteps(input:Input){
 const step=input.step??.25,grade=input.maxGrade??.85,drift=input.maxHeightDrift??.15,r=.27,body=1.8;
 if(!Number.isFinite(step)||step<.1||step>.5||!Number.isFinite(grade)||grade<=0||!Number.isFinite(drift)||drift<0)throw Error('Invalid cable walking survey');
 const b=input.bounds,cols=Math.floor((b.east-b.west)/step)+1,rows=Math.floor((b.north-b.south)/step)+1;
 if(cols<1||rows<1||cols*rows>250000)throw Error('Unbounded cable walking survey');
 const inside=(p:Point)=>p.east>=b.west-1e-8&&p.east<=b.east+1e-8&&p.north>=b.south-1e-8&&p.north<=b.north+1e-8;
 let samples=0;const reasons={unsupported:0,height:0,blocked:0,grade:0};
 function feet(p:Point):Foot|undefined{
  if(!inside(p))return;
  samples++;const h=input.supportAt(p.east,p.north);
  if(h===undefined||!Number.isFinite(h)){reasons.unsupported++;return;}
  if(Math.abs(h-input.start.height)>drift){reasons.height++;return;}
  // Check whole body footprint support, not just centre. Respect the
  // host's actual floor layer and reject edge or cliff across the foot.
  for(const [dx,dn] of [[r,0],[-r,0],[0,r],[0,-r]]){
   const s=input.supportAt(p.east+dx!,p.north+dn!);
   if(s===undefined||!Number.isFinite(s)||Math.abs(s-h)>.25){reasons.unsupported++;return;}
  }
  if(input.blocked(p.east,p.north,h,r,body)){reasons.blocked++;return;}
  return {...p,height:h};
 }
 const id=(e:number,n:number)=>n*cols+e;
 const point=(i:number):Point=>({east:b.west+(i%cols)*step,north:b.south+Math.floor(i/cols)*step});
 const cache=new Map<number,Foot|undefined>(),sample=(i:number)=>{if(!cache.has(i))cache.set(i,feet(point(i)));return cache.get(i);};
 function edge(a:Foot,c:Foot){
  const d=Math.hypot(a.east-c.east,a.north-c.north);
  const legal=(x:Foot,y:Foot,dist:number)=>Math.abs(x.height-y.height)<=grade*dist+.001||(Math.abs(x.height-y.height)<=.43&&input.allowsSupportedStep?.(x,y)===true);
  if(!legal(a,c,d)){reasons.grade++;return false;}
  if(d<1e-8)return true;
  const mid=feet({east:(a.east+c.east)/2,north:(a.north+c.north)/2});
  if(!mid||!legal(a,mid,d/2)||!legal(mid,c,d/2)){reasons.grade++;return false;}
  return true;
 }
 function near(p:Point){
  const x=Math.round((p.east-b.west)/step),y=Math.round((p.north-b.south)/step),out:number[]=[];
  for(let n=y-1;n<=y+1;n++)for(let e=x-1;e<=x+1;e++)if(e>=0&&e<cols&&n>=0&&n<rows)out.push(id(e,n));
  return out;
 }
 const start=feet(input.start),parent=new Map<number,number>(),q:number[]=[];
 if(start&&Math.abs(start.height-input.start.height)<=.08)for(const k of near(start)){const p=sample(k);if(p&&edge(start,p)){parent.set(k,-1);q.push(k);}}
 const targets=input.goals.map(g=>{if(g.reach!==undefined&&(!Number.isFinite(g.reach)||g.reach<=0||g.reach>2.2))throw Error('Invalid repair reach');return {g,foot:g.reach===undefined?feet(g.foot):undefined,ids:g.reach===undefined?near(g.foot):[],end:undefined as number|undefined};});
 for(let i=0;i<q.length;i++){
  if(i%16===0)yield;
  const k=q[i]!,a=sample(k)!;
  for(const target of targets){
   if(target.end!==undefined)continue;
   if(target.g.reach!==undefined){
    if(Math.hypot(a.east-target.g.foot.east,a.north-target.g.foot.north)<=target.g.reach&&Math.abs(a.height-target.g.foot.height)<=.08&&target.g.accept?.(a)===true){target.foot=a;target.end=k;}
   }else if(target.foot&&Math.abs(target.foot.height-target.g.foot.height)<=.08&&target.ids.includes(k)&&edge(a,target.foot))target.end=k;
  }
  if(targets.every(t=>t.end!==undefined))break;
  const e=k%cols,n=Math.floor(k/cols);
  for(const [de,dn] of [[1,0],[-1,0],[0,1],[0,-1]]){
   const u=e+de!,v=n+dn!;if(u<0||u>=cols||v<0||v>=rows)continue;
   const j=id(u,v);if(parent.has(j))continue;
   const p=sample(j);if(p&&edge(a,p)){parent.set(j,k);q.push(j);}
  }
 }
 const routes=targets.map(t=>{
  if(t.end===undefined||!t.foot||!start)return {id:t.g.id,reachable:false as const,target:t.g.foot,reason:!start?'start-unsupported-or-blocked':t.g.reach!==undefined?'no-reachable-interaction-foot':!t.foot?'target-unsupported-or-blocked':'no-continuous-path'};
  const path:Foot[]=[t.foot];for(let k=t.end;k!==-1;k=parent.get(k)!){const p=sample(k)!;if(Math.hypot(p.east-path.at(-1)!.east,p.north-path.at(-1)!.north)>1e-8)path.push(p);}
  path.push(start);path.reverse();
  let metres=0,maxGrade=0;for(let i=1;i<path.length;i++){const a=path[i-1]!,p=path[i]!,d=Math.hypot(p.east-a.east,p.north-a.north);metres+=d;if(d>1e-8)maxGrade=Math.max(maxGrade,Math.abs(p.height-a.height)/d);}
  return {id:t.g.id,reachable:true as const,target:t.g.foot,interactionFoot:t.foot,path,metres,maxGrade};
 });
 return {ready:routes.length>0&&routes.every(p=>p.reachable),start:input.start,visited:parent.size,samples,reasons,routes};
}
export function auditNightBCableWalkRoutes(input:Input){return finishNightBAudit(nightBCableWalkRouteSteps(input));}
