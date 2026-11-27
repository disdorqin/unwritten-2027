import {createFrontRidgeR30FieldFromRaster,type FrontRidgeR30Field} from './town-d-r30-front-ridge';
import {auditRidgeRoadCrossings,type RidgeRoadPoint} from './town-d-r30-road-survey';

// Candidate local earthwork allowance, subject to A's protection review.
const half=2.75,shoulder=8,grade=.115,cap=8;
type Allowed=(e:number,n:number)=>boolean;
type Node=RidgeRoadPoint&{cost:number;previous?:Node;dn:number};
/** Lower road uses east-monotone strips, so loops and crossings are impossible.
 * Search real heights at every strip, not the old elliptical cone.
 * Full-width clearance and earthwork are mandatory, including station apron. */
export function solveLowerRidgeRoad(field:FrontRidgeR30Field,allowed:Allowed){
 const from={east:290,north:300},to={east:526,north:329};
 const start=field.heightAt(from.east,from.north)!,end=field.heightAt(to.east,to.north)!;
 const hAt=field.heightAt;const step=4;
 let current:Node[]=[{...from,height:start,cum:0,cost:0,dn:0}];
 let maxEast=from.east;
 for(let east=from.east+step;east<=to.east;east+=step){
  const next=new Map<string,Node>(),last=east===to.east;
  for(const a of current){
   for(const north of last?[to.north]:[-8,-4,0,4,8].map(d=>a.north+d)){
    const dn=north-a.north;
    if(north<278||north>385||Math.abs(dn)>8||Math.abs(dn-a.dn)>8)continue;
    if(Math.abs(to.north-north)>2*(to.east-east))continue;
    const len=Math.hypot(step,dn),g=hAt(east,north);
    if(g===undefined)continue;
    const heights=last?[end]:Array.from({length:Math.floor(2*grade*len/.25)+2},(_,i)=>Math.ceil((a.height-grade*len)*4)/4+i*.25);
    for(const height of heights){
     if(Math.abs(height-a.height)>grade*len+1e-8||Math.abs(height-end)>grade*Math.hypot(to.east-east,(to.east-east)*2)+1e-8||Math.abs(height-g)>cap)continue;
     let earth=0,ok=true;
     for(const t of [0,.5,1]){
      const pe=a.east+step*t,pn=a.north+dn*t,ph=a.height+(height-a.height)*t;
      for(const off of [-half,0,half]){
       const x=pe-dn/len*off,z=pn+step/len*off,ground=hAt(x,z);
       if(ground===undefined||!allowed(x,z)||Math.abs(ground-ph)>cap){ok=false;break}
       earth+=Math.abs(ground-ph);
      }
      if(!ok)break;
     }
     if(!ok)continue;
     const cost=a.cost+len+.24*earth+Math.abs(a.dn-dn)*2.2;
     const key=north+','+height.toFixed(3)+','+dn;
     if(cost<(next.get(key)?.cost??Infinity))next.set(key,{east,north,height,cum:a.cum+len,cost,previous:a,dn});
    }
   }
  }
  current=[...next.values()];if(!current.length)return {route:[] as RidgeRoadPoint[],maxEast};
  maxEast=east;
 }
 const best=current.sort((a,b)=>a.cost-b.cost)[0];const route:RidgeRoadPoint[]=[];
 for(let p:Node|undefined=best;p;p=p.previous)route.push({east:p.east,north:p.north,height:p.height,cum:p.cum});
 let smooth=route.reverse();
 // Twice-rounded corner cutting, preserving the exact terminal pins.
 for(let k=0;k<2;k++){
  const next:RidgeRoadPoint[]=[smooth[0]!];
  for(let i=1;i<smooth.length;i++){
   const a=smooth[i-1]!,b=smooth[i]!;
   for(const t of [.25,.75])next.push({east:a.east+(b.east-a.east)*t,north:a.north+(b.north-a.north)*t,height:a.height+(b.height-a.height)*t,cum:0});
  }
  next.push(smooth.at(-1)!);smooth=next;
 }
 let cum=0;smooth=smooth.map((p,i)=>{if(i)cum+=Math.hypot(p.east-smooth[i-1]!.east,p.north-smooth[i-1]!.north);return {...p,cum}});
  // Reproject onto a grade-limited longitudinal profile after rounding.
 const total=smooth.at(-1)!.cum,design=.10;
 let prior=start;
 smooth=smooth.map((p,i)=>{
  if(i===0)return {...p,height:start};
  const d=p.cum-smooth[i-1]!.cum;
  const lo=Math.max(prior-design*d,end-design*(total-p.cum));
  const hi=Math.min(prior+design*d,end+design*(total-p.cum));
  prior=Math.max(lo,Math.min(hi,p.height));
  return {...p,height:i===smooth.length-1?end:prior};
 });
 return {route:smooth,maxEast};
}
export function ridgeRoadProject(route:readonly RidgeRoadPoint[],e:number,n:number){
 let best:{distance:number;height:number;cum:number}|undefined;
 for(let i=1;i<route.length;i++){
  const a=route[i-1]!,b=route[i]!,de=b.east-a.east,dn=b.north-a.north,len2=de*de+dn*dn;
  if(!len2)continue;
  const t=Math.max(0,Math.min(1,((e-a.east)*de+(n-a.north)*dn)/len2)),distance=Math.hypot(e-a.east-de*t,n-a.north-dn*t);
  if(!best||distance<best.distance)best={distance,height:a.height+(b.height-a.height)*t,cum:a.cum+(b.cum-a.cum)*t};
 }
 return best;
}
/** Cut/fill is built into the actual elevation raster, not a floating ribbon.
 * Caller must provide an approved protection predicate for every changed vertex.
 * Refuse invalid or incomplete lower path. */
export function gradeLowerRidgeRoad(field:FrontRidgeR30Field,route:readonly RidgeRoadPoint[],allowed:Allowed){
 if(route.length<2||route[0]!.east!==290||route[0]!.north!==300||route.at(-1)!.east!==526||route.at(-1)!.north!==329||
    auditRidgeRoadCrossings(route).length||route.some((p,i)=>i>0&&(p.east<=route[i-1]!.east||Math.abs(p.height-route[i-1]!.height)/Math.hypot(p.east-route[i-1]!.east,p.north-route[i-1]!.north)>.12+1e-8)))throw new RangeError('Uncertified lower ridge alignment');
 const elevation=field.elevation.slice(),weights=field.weights.slice();
 let cut=0,fill=0,vertices=0;
 for(let n=270;n<=393;n++)for(let e=282;e<=534;e++){
  const p=ridgeRoadProject(route,e,n);if(!p||p.distance>=shoulder)continue;
  if(n===270||!allowed(e,n))throw new RangeError('Road shoulder intersects protected land at '+e+','+n);
  const t=Math.max(0,Math.min(1,(p.distance-half)/(shoulder-half)));
  const w=1-t*t*(3-2*t),idx=(n-270)*field.width+e;
  const old=elevation[idx]!,delta=(p.height-old)*w;
  if(p.distance<=half&&Math.abs(delta)>cap+1e-6)throw new RangeError('Road core exceeds survey cap at '+e+','+n);
  const height=old+Math.max(-cap,Math.min(cap,delta));
  cut=Math.max(cut,old-height);fill=Math.max(fill,height-old);
  if(Math.abs(height-old)>cap+1e-6)throw new RangeError('Road earthwork exceeds survey cap at '+e+','+n);
  elevation[idx]=height;vertices++;
 }
 const graded=createFrontRidgeR30FieldFromRaster(elevation,weights);
 const audit=auditRidgeRoadSurface(graded,route);
 return {field:graded,cut,fill,vertices,audit,certified:audit.maxGrade<=.12+1e-6,roadAt(e:number,n:number){if(e<282||e>534||n<270||n>393)return false;const p=ridgeRoadProject(route,e,n);return !!p&&p.distance<=1.75}};
}
/** Measure the actual triangulated field along center and two full-width
 * walking lines. A nominal centerline grade is not sufficient. */
export function auditRidgeRoadSurface(field:FrontRidgeR30Field,route:readonly RidgeRoadPoint[]){
 let centerGrade=0,maxGrade=0,samples=0;
 for(let i=1;i<route.length;i++){
  const a=route[i-1]!,b=route[i]!,dx=b.east-a.east,dn=b.north-a.north,len=Math.hypot(dx,dn);
  const count=Math.max(1,Math.ceil(len/.25));
  for(const off of [-1.25,0,1.25]){
   let prev:number|undefined;
   for(let j=0;j<=count;j++){
    const t=j/count,y=field.heightAt(a.east+dx*t-dn/len*off,a.north+dn*t+dx/len*off);
    if(y===undefined)return {centerGrade:Infinity,maxGrade:Infinity,samples};
    if(prev!==undefined){const g=Math.abs(y-prev)/(len/count);maxGrade=Math.max(maxGrade,g);if(!off)centerGrade=Math.max(centerGrade,g);samples++}
    prev=y;
   }
  }
 }
 return {centerGrade,maxGrade,samples};
}
/** Stronger raster feasibility proof: constrain both grid-axis differences
 * so that the gradient of each actual triangle is <= 12%. Bounds include
 * natural-ground cut/fill cap and pinned endpoints. A contradictory core
 * is rejected, never installed as a walking surface. */
export function tryConstrainedLowerRoadbed(field:FrontRidgeR30Field,route:readonly RidgeRoadPoint[],allowed:Allowed){
 const draft=gradeLowerRidgeRoad(field,route,allowed);
 const slope=.12/Math.sqrt(2)-.0001,core=new Map<number,{e:number;n:number;lo:number;hi:number}>();
 const ix=(e:number,n:number)=>(n-270)*field.width+e;
 for(let n=270;n<=393;n++)for(let e=282;e<=534;e++){
  const p=ridgeRoadProject(route,e,n);if(!p||p.distance>half)continue;
  const old=field.vertexAt(e,n),pin=(e===290&&n===300)||(e===526&&n===329);
  core.set(ix(e,n),{e,n,lo:pin?old:old-cap,hi:pin?old:old+cap});
 }
 const queue=[...core.keys()],queued=new Set(queue);
 for(let k=0;k<queue.length;k++){
  const id=queue[k]!,a=core.get(id)!;queued.delete(id);
  if(a.lo>a.hi+1e-7)return {ok:false as const,reason:'core slope/earthwork incompatible',east:a.e,north:a.n,lower:a.lo,upper:a.hi,draft};
  for(const key of [id-1,id+1,id-field.width,id+field.width]){
   const b=core.get(key);if(!b)continue;
   const lo=Math.max(b.lo,a.lo-slope),hi=Math.min(b.hi,a.hi+slope);
   if(lo>b.lo+1e-8||hi<b.hi-1e-8){b.lo=lo;b.hi=hi;if(!queued.has(key)){queue.push(key);queued.add(key)}}
  }
 }
 const elevation=draft.field.elevation.slice(),weights=field.weights.slice();
 const shoulderSmoothing:{id:number;weight:number}[]=[];
 for(const [id,p]of core)elevation[id]=(p.lo+p.hi)/2;
 // Shoulders remain a solid blend to the original field; extend the
 // constrained grade from the nearest core vertex rather than the old
 // centerline projection.
 for(let n=270;n<=393;n++)for(let e=282;e<=534;e++){
  const id=ix(e,n);if(core.has(id))continue;
  const p=ridgeRoadProject(route,e,n);if(!p||p.distance>=shoulder)continue;
  let nearest:number|undefined,distance=Infinity;
  for(let dz=-8;dz<=8;dz++)for(let dx=-8;dx<=8;dx++){
   const key=ix(e+dx,n+dz);if(!core.has(key))continue;
   const d=Math.hypot(dx,dz);if(d<distance){distance=d;nearest=key}
  }
  if(nearest===undefined)continue;
  const t=Math.max(0,Math.min(1,(p.distance-half)/(shoulder-half))),w=1-t*t*(3-2*t);
  const old=field.vertexAt(e,n),v=old+(elevation[nearest]!-old)*w;
  elevation[id]=old+Math.max(-cap,Math.min(cap,v-old));
  // Keep the entire walking raster, including its interpolation halo,
  // fixed. Smooth only the outer shoulder to remove isolated cut spikes.
  if(n>270&&allowed(e,n)&&p.distance>half+1.45&&p.distance<shoulder-.5)
   shoulderSmoothing.push({id,weight:.48*Math.sin(Math.PI*(p.distance-half-1.45)/(shoulder-half-1.95))});
 }
 for(let pass=0;pass<4;pass++){
  const previous=elevation.slice();
  for(const {id,weight}of shoulderSmoothing){
   const average=(previous[id-1]!+previous[id+1]!+previous[id-field.width]!+previous[id+field.width]!)/4;
   const old=field.elevation[id]!,v=previous[id]!+(average-previous[id]!)*weight;
   elevation[id]=old+Math.max(-cap,Math.min(cap,v-old));
  }
 }
 const graded=createFrontRidgeR30FieldFromRaster(elevation,weights),audit=auditRidgeRoadSurface(graded,route);
 let cut=0,fill=0;
 for(let i=0;i<elevation.length;i++){cut=Math.max(cut,field.elevation[i]!-elevation[i]!);fill=Math.max(fill,elevation[i]!-field.elevation[i]!)}
 return {ok:audit.maxGrade<=.12+1e-5,reason:'actual raster grade',field:graded,audit,cut,fill,draft};
}
