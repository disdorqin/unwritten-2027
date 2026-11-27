import {BufferGeometry,Float32BufferAttribute} from 'three';

export type RailSample=Readonly<{east:number;north:number;y:number;ground:number}>;
export type RailSection=Readonly<{east:number;north:number;y:number;me:number;mn:number;distance:number}>;

/** Shared miter sections: both adjoining spans use exactly the same four
 * vertices, so curves cannot leave gaps or overlapping square rail ends.
 * Horizontal miter keeps the gauge independent of longitudinal slope. */
export function railSections(samples:readonly RailSample[]):RailSection[]{
  if(samples.length<2)throw new RangeError('rail requires two samples');
  const directions=samples.slice(1).map((b,i)=>{
    const a=samples[i]!,de=b.east-a.east,dn=b.north-a.north,run=Math.hypot(de,dn);
    if(run<1e-6)throw new RangeError('duplicate rail sample');
    return {e:dn/run,n:-de/run,run};
  });
  let distance=0;
  return samples.map((s,i)=>{
    const a=directions[Math.max(0,i-1)]!,b=directions[Math.min(i,directions.length-1)]!;
    if(i)distance+=Math.hypot(a.run,s.y-samples[i-1]!.y);
    const len=Math.hypot(a.e+b.e,a.n+b.n);
    if(len<1e-4)throw new RangeError('rail reverses at a section');
    const ne=(a.e+b.e)/len,nn=(a.n+b.n)/len,scale=1/(ne*b.e+nn*b.n);
    if(scale>2.5)throw new RangeError('rail curve too acute for a continuous strip');
    return {east:s.east,north:s.north,y:s.y,me:ne*scale,mn:nn*scale,distance};
  });
}

type Vertex=readonly [number,number,number];
export type RailLateralBounds=Readonly<{lo:number;hi:number}>;
export function buildRailVariableStrip(sections:readonly RailSection[],bounds:readonly RailLateralBounds[],low:number,high:number,uvSpan=1){
  if(sections.length!==bounds.length||sections.length<2)throw new RangeError('invalid rail cross sections');
  const vertices=sections.map((s,i)=>{
    const {lo,hi}=bounds[i]!;
    if(!(hi>lo))throw new RangeError('degenerate rail width');
    const point=(x:number,y:number):Vertex=>[s.east+x*s.me,s.y+y,-s.north-x*s.mn];
    return [point(lo,low),point(hi,low),point(hi,high),point(lo,high)] as const;
  });
  const p:number[]=[],uv:number[]=[];
  const emit=(a:Vertex,u:number,v:number)=>{p.push(...a);uv.push(u,v);};
  const quad=(a:Vertex,b:Vertex,c:Vertex,d:Vertex,u0:number,u1:number,v0:number,v1:number)=>{
    emit(a,u0,0);emit(b,u1,0);emit(c,u1,v1);
    emit(a,u0,0);emit(c,u1,v1);emit(d,u0,v0);
  };
  for(let i=1;i<vertices.length;i++){
    const a=vertices[i-1]!,b=vertices[i]!,u0=sections[i-1]!.distance/uvSpan,u1=sections[i]!.distance/uvSpan;
    for(let k=0;k<4;k++){
      const j=(k+1)%4,wa=bounds[i-1]!.hi-bounds[i-1]!.lo,wb=bounds[i]!.hi-bounds[i]!.lo;
      quad(a[k]!,b[k]!,b[j]!,a[j]!,u0,u1,(k%2===0?wa:high-low)/uvSpan,(k%2===0?wb:high-low)/uvSpan);
    }
  }
  const a=vertices[0]!,b=vertices.at(-1)!;
  quad(a[0],a[1],a[2],a[3],0,(bounds[0]!.hi-bounds[0]!.lo)/uvSpan,(high-low)/uvSpan,(high-low)/uvSpan);
  quad(b[1],b[0],b[3],b[2],0,(bounds.at(-1)!.hi-bounds.at(-1)!.lo)/uvSpan,(high-low)/uvSpan,(high-low)/uvSpan);
  const geo=new BufferGeometry();
  geo.setAttribute('position',new Float32BufferAttribute(p,3));
  geo.setAttribute('uv',new Float32BufferAttribute(uv,2));
  geo.computeVertexNormals();geo.computeBoundingSphere();
  return geo;
}
export function buildRailStrip(sections:readonly RailSection[],offset:number,width:number,low:number,high:number,uvSpan=1){
  return buildRailVariableStrip(sections,sections.map(()=>({lo:offset-width/2,hi:offset+width/2})),low,high,uvSpan);
}

/** Sample the turnout more finely than the long plain rail, without
 * changing the surveyed centreline or its longitudinal profile. */
export function refineRailSections(sections:readonly RailSection[],firstMetres=34,spacing=.18){
  const out:RailSection[]=[sections[0]!];
  for(let i=1;i<sections.length;i++){
    const a=sections[i-1]!,b=sections[i]!,steps=a.distance<firstMetres?Math.ceil((b.distance-a.distance)/spacing):1;
    for(let j=1;j<=steps;j++){
      const t=j/steps,mix=(x:number,y:number)=>x+(y-x)*t;
      out.push({east:mix(a.east,b.east),north:mix(a.north,b.north),y:mix(a.y,b.y),
        me:mix(a.me,b.me),mn:mix(a.mn,b.mn),distance:mix(a.distance,b.distance)});
    }
  }
  return out;
}
export function distanceToRail(sections:readonly RailSection[],e:number,n:number,offset=0){
  let best=Infinity;
  for(let i=1;i<sections.length;i++){
    const a=sections[i-1]!,b=sections[i]!,ae=a.east+offset*a.me,an=a.north+offset*a.mn;
    const de=b.east+offset*b.me-ae,dn=b.north+offset*b.mn-an;
    const t=Math.max(0,Math.min(1,((e-ae)*de+(n-an)*dn)/(de*de+dn*dn||1)));
    best=Math.min(best,Math.hypot(e-ae-t*de,n-an-t*dn));
  }
  return best;
}

/** Generate only exposed turnout rail width, tapering at the stock rail
 * and crossing frog instead of drawing two full intersecting bars.
 * The stock rail is unchanged; no claim of operational switching. */
export function buildTurnoutRailStrips(branch:readonly RailSection[],stock:readonly RailSection[],offset:number,width:number,stockGauge:number,low:number,high:number){
  const dense=refineRailSections(branch),result:BufferGeometry[]=[];
  let sections:RailSection[]=[],bounds:RailLateralBounds[]=[];
  const flush=()=>{if(sections.length>=2)result.push(buildRailVariableStrip(sections,bounds,low,high));sections=[];bounds=[];};
  for(const s of dense){
    const e=s.east+offset*s.me,n=s.north+offset*s.mn;
    const d=Math.min(distanceToRail(stock,e,n,stockGauge/2),distanceToRail(stock,e,n,-stockGauge/2));
    const h=Math.min(width/2,Math.max(0,d-width/2-.008));
    if(h<.004){flush();continue;}
    sections.push(s);bounds.push({lo:offset-h,hi:offset+h});
  }
  flush();return result;
}

/** Branch ballast grows from the outside of the existing stock ballast.
 * The branch diverges to its positive lateral side; preserve stock bed
 * and do not leave a duplicate coplanar top across the shared throat. */
export function buildTurnoutBallast(branch:readonly RailSection[],stock:readonly RailSection[],width:number){
  const dense=refineRailSections(branch,34,.45),sections:RailSection[]=[],bounds:RailLateralBounds[]=[];
  for(const s of dense){
    const w=Math.min(width,Math.max(0,distanceToRail(stock,s.east,s.north)-.006));
    if(w<.025)continue;
    sections.push(s);bounds.push({lo:width/2-w,hi:width/2});
  }
  return sections.length>1?buildRailVariableStrip(sections,bounds,-.63,-.37,1):undefined;
}

/**
 * Repair only a bounded, already surveyed railway corridor. The existing
 * station/terrain anchors are immutable. The least raise-only Lipschitz
 * envelope is rounded at the valley bottom by arc-length averaging;
 * taking the maximum of the two Lipschitz functions preserves the grade.
 * If the current terrain invalidates either endpoint or the agreed low
 * bridge envelope, return the original profile with an explicit blocker.
 */
export function repairBoundedRailGrade(samples:readonly RailSample[],first:number,last:number,limit=.12,maxFill=4.2){
  if(first<0||last>=samples.length||last-first<2||!(limit>0)||!(maxFill>0))throw new RangeError('invalid bounded rail grade repair');
  const selected=samples.slice(first,last+1),d=[0],old=selected.map(p=>p.y);
  for(let i=1;i<selected.length;i++){
    const a=selected[i-1]!,b=selected[i]!,run=Math.hypot(b.east-a.east,b.north-a.north);
    if(!(run>0))throw new RangeError('duplicate bounded rail sample');
    d.push(d[i-1]!+run);
  }
  const slope=limit-1e-5,env=[...old];
  for(let i=1;i<env.length;i++)env[i]=Math.max(env[i]!,env[i-1]!-slope*(d[i]!-d[i-1]!));
  for(let i=env.length-2;i>=0;i--)env[i]=Math.max(env[i]!,env[i+1]!-slope*(d[i+1]!-d[i]!));
  const interp=(x:number)=>{
    if(x<=0)return env[0]!;
    if(x>=d.at(-1)!)return env.at(-1)!;
    const i=d.findIndex(v=>v>=x);
    return env[i-1]!+(env[i]!-env[i-1]!)*(x-d[i-1]!)/(d[i]!-d[i-1]!);
  };
  // A 6m transition spreads the V-shaped change of gradient; only raise
  // the repaired envelope, leaving the approach and departure unchanged.
  const rounded=env.map((y,i)=>{
    if(y-old[i]!<1e-8)return y;
    const x=d[i]!;
    const smooth=(interp(x-3)+2*interp(x-1.5)+3*y+2*interp(x+1.5)+interp(x+3))/9;
    return Math.max(y,smooth);
  });
  const maxGrade=(ys:readonly number[])=>Math.max(...ys.slice(1).map((y,i)=>Math.abs(y-ys[i]!)/(d[i+1]!-d[i]!)));
  const blocked=rounded[0]!>old[0]!+1e-7||rounded.at(-1)!>old.at(-1)!+1e-7?'fixed-endpoint':
    Math.max(...rounded.map((y,i)=>y-selected[i]!.ground))>maxFill?'fill-envelope':
    maxGrade(rounded)>limit+1e-8?'grade-transition':undefined;
  const ys=blocked?old:rounded;
  const changed=ys.flatMap((y,i)=>y-old[i]!>1e-7?[first+i]:[]);
  const profile=samples.map((p,i)=>i>=first&&i<=last?{...p,y:ys[i-first]!}:p);
  return {profile,first,last,changed,blocked,length:d.at(-1)!,maxGradeBefore:maxGrade(old),maxGradeAfter:maxGrade(ys),
    maxFill:Math.max(...ys.map((y,i)=>y-selected[i]!.ground))};
}

/** Greatest grade-constrained profile no higher than the existing
 * repaired line or the requested ground clearance cap. A two-pass
 * min-envelope is exact on the sampled chain. Refuse any change that
 * cuts below the required clearance or moves either fixed endpoint. */
export function capRepairedRailProfile(samples:readonly RailSample[],first:number,last:number,maxFill=2.6,minFill=.5,limit=.12){
 if(first<0||last>=samples.length||last-first<2||![maxFill,minFill,limit].every(Number.isFinite)||maxFill<=minFill||limit<=.00001)throw RangeError('invalid rail cap');
 const s=samples.slice(first,last+1),y=s.map(p=>Math.min(p.y,p.ground+maxFill-1e-6));
 const run=s.slice(1).map((p,i)=>Math.hypot(p.east-s[i]!.east,p.north-s[i]!.north));
 if(s.some(p=>![p.east,p.north,p.y,p.ground].every(Number.isFinite))||run.some(d=>d<=0))throw RangeError('invalid rail samples');
 for(let i=1;i<y.length;i++)y[i]=Math.min(y[i]!,y[i-1]!+(limit-1e-5)*run[i-1]!);
 for(let i=y.length-2;i>=0;i--)y[i]=Math.min(y[i]!,y[i+1]!+(limit-1e-5)*run[i]!);
 const minClearance=Math.min(...y.map((v,i)=>v-s[i]!.ground));
 const blocked=Math.abs(y[0]!-s[0]!.y)>1e-7||Math.abs(y.at(-1)!-s.at(-1)!.y)>1e-7?'fixed-endpoint':minClearance<minFill?'ground-envelope':undefined;
 const profile=blocked?samples:samples.map((p,i)=>i>=first&&i<=last?{...p,y:y[i-first]!}:p);
 const changed=blocked?[]:y.flatMap((v,i)=>Math.abs(v-s[i]!.y)>1e-7?[first+i]:[]);
 return {profile,first,last,changed,blocked,minClearance,maxClearance:Math.max(...y.map((v,i)=>v-s[i]!.ground)),maxGrade:Math.max(...run.map((d,i)=>Math.abs(y[i+1]!-y[i]!)/d))};
}

type LoopPoint=Readonly<{x:number;y:number;z:number}>;
/** Geometric commissioning gate: consume the existing loop's actual
 * samples, never the old approximate divergence coordinate. The audit
 * is read-only and cannot grant train movement authority. */
export function surveyRailJunction(branch:readonly RailSample[],loop:readonly LoopPoint[]){
  if(branch.length<2||loop.length<3)throw new RangeError('missing rail alignment');
  const cell=8,segments=loop.map((a,i)=>({a,b:loop[(i+1)%loop.length]!,i}));
  const bins=new Map<string,typeof segments>();
  for(const segment of segments){
    const {a,b}=segment;
    for(let e=Math.floor((Math.min(a.x,b.x)-3.2)/cell);e<=Math.floor((Math.max(a.x,b.x)+3.2)/cell);e++)
      for(let n=Math.floor((Math.min(-a.z,-b.z)-3.2)/cell);n<=Math.floor((Math.max(-a.z,-b.z)+3.2)/cell);n++){
        const key=e+','+n,items=bins.get(key)??[];items.push(segment);bins.set(key,items);
      }
  }
  function closest(p:Readonly<{east:number;north:number;y:number}>,pool:typeof segments){
    let best:{index:number;horizontal:number;vertical:number;loopY:number;loopEast:number;loopNorth:number;loopDe:number;loopDn:number}|undefined;
    for(const {a,b,i} of pool){
      const de=b.x-a.x,dn=a.z-b.z,run2=de*de+dn*dn;
      if(run2<1e-10)continue;
      const t=Math.max(0,Math.min(1,((p.east-a.x)*de+(p.north+a.z)*dn)/run2));
      const e=a.x+t*de,n=-a.z+t*dn,y=a.y+t*(b.y-a.y);
      const horizontal=Math.hypot(p.east-e,p.north-n);
      if(!best||horizontal<best.horizontal)best={index:i,horizontal,vertical:Math.abs(p.y-y),loopY:y,loopEast:e,loopNorth:n,loopDe:de,loopDn:dn};
    }
    return best;
  }
  const start=closest(branch[0]!,segments);
  if(!start)throw new RangeError('loop has no valid segment');
  const de=branch[1]!.east-branch[0]!.east,dn=branch[1]!.north-branch[0]!.north;
  const angle=Math.acos(Math.min(1,Math.abs(de*start.loopDe+dn*start.loopDn)/(Math.hypot(de,dn)*Math.hypot(start.loopDe,start.loopDn))))*180/Math.PI;
  const connectionMatches=start.horizontal<=.08&&start.vertical<=.03&&angle<=6;
  const overlapRuns:{from:number;to:number;minHorizontal:number;minVertical:number;east:number;north:number;samples:number}[]=[];
  let along=0,active:typeof overlapRuns[number]|undefined;
  for(let i=0;i<branch.length-1;i++){
    const a=branch[i]!,b=branch[i+1]!,run=Math.hypot(b.east-a.east,b.north-a.north),steps=Math.max(1,Math.ceil(run/.25));
    for(let j=0;j<steps;j++){
      const t=j/steps,p={east:a.east+t*(b.east-a.east),north:a.north+t*(b.north-a.north),y:a.y+t*(b.y-a.y)};
      const d=along+t*run,near=closest(p,bins.get(Math.floor(p.east/cell)+','+Math.floor(p.north/cell))??[]);
      // Clearance warning only: a future accepted turnout must replace
      // its own coincident initial shared rail, rather than duplicate it.
      if(near&&near.horizontal<3.2&&near.vertical<3.8){
        if(!active){active={from:d,to:d,minHorizontal:near.horizontal,minVertical:near.vertical,east:p.east,north:p.north,samples:0};overlapRuns.push(active);}
        active.to=d;active.minVertical=Math.min(active.minVertical,near.vertical);active.samples++;
        if(near.horizontal<active.minHorizontal){active.minHorizontal=near.horizontal;active.east=p.east;active.north=p.north;}
      }else active=undefined;
    }
    along+=run;
  }
  return {start:{horizontal:start.horizontal,vertical:start.vertical,loopY:start.loopY,east:start.loopEast,north:start.loopNorth,tangentDegrees:angle},
    connectionMatches,overlapRuns,geometryReady:connectionMatches&&overlapRuns.length===0};
}

/** Minimum fill-only grade-constrained envelope on the current ground.
 * This is a feasibility survey, NOT production authorization to erect an
 * 11m viaduct or modify another window's new terrain. */
export function surveyRailGrade(samples:readonly RailSample[],limit=.12,clearance=.62){
  if(samples.length<2||!(limit>0))throw new RangeError('invalid grade survey');
  const spans=samples.slice(1).map((b,i)=>Math.hypot(b.east-samples[i]!.east,b.north-samples[i]!.north));
  const minimum=samples.map(s=>s.ground+clearance);
  for(let i=1;i<minimum.length;i++)minimum[i]=Math.max(minimum[i]!,minimum[i-1]!-limit*spans[i-1]!);
  for(let i=minimum.length-2;i>=0;i--)minimum[i]=Math.max(minimum[i]!,minimum[i+1]!-limit*spans[i]!);
  const violations=spans.flatMap((run,i)=>{
    const grade=Math.abs(samples[i+1]!.y-samples[i]!.y)/run;
    return grade>limit+1e-6?[{index:i,grade,east:samples[i+1]!.east,north:samples[i+1]!.north}]:[];
  });
  return {limit,violations,minimum,maximumFill:Math.max(...minimum.map((y,i)=>y-samples[i]!.ground))};
}
