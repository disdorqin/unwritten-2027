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
