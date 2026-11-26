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
export function buildRailStrip(sections:readonly RailSection[],offset:number,width:number,low:number,high:number,uvSpan=1){
  const vertices=sections.map(s=>{
    const point=(x:number,y:number):Vertex=>[s.east+x*s.me,s.y+y,-s.north-x*s.mn];
    return [point(offset-width/2,low),point(offset+width/2,low),point(offset+width/2,high),point(offset-width/2,high)] as const;
  });
  const p:number[]=[],uv:number[]=[];
  const emit=(a:Vertex,u:number,v:number)=>{p.push(...a);uv.push(u,v);};
  const quad=(a:Vertex,b:Vertex,c:Vertex,d:Vertex,u0:number,u1:number,v:number)=>{
    emit(a,u0,0);emit(b,u1,0);emit(c,u1,v);
    emit(a,u0,0);emit(c,u1,v);emit(d,u0,v);
  };
  for(let i=1;i<vertices.length;i++){
    const a=vertices[i-1]!,b=vertices[i]!,u0=sections[i-1]!.distance/uvSpan,u1=sections[i]!.distance/uvSpan;
    for(let k=0;k<4;k++){
      const j=(k+1)%4;
      quad(a[k]!,b[k]!,b[j]!,a[j]!,u0,u1,(k%2===0?width:high-low)/uvSpan);
    }
  }
  // Both exposed terminal caps, never cap internal joints.
  const a=vertices[0]!,b=vertices.at(-1)!;
  quad(a[0],a[1],a[2],a[3],0,width/uvSpan,(high-low)/uvSpan);
  quad(b[1],b[0],b[3],b[2],0,width/uvSpan,(high-low)/uvSpan);
  const geo=new BufferGeometry();
  geo.setAttribute('position',new Float32BufferAttribute(p,3));
  geo.setAttribute('uv',new Float32BufferAttribute(uv,2));
  geo.computeVertexNormals();geo.computeBoundingSphere();
  return geo;
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
