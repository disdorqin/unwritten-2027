import {CatmullRomCurve3,Vector3} from 'three';
export type RailControl=readonly (readonly [number,number])[];

/** Original passenger branch control points, shared by the geometry and
 * all corridor reservations. No new train movement authority. */
export const craterBranchControlLine:RailControl=[
  [492,318],[477,335],[468,392],[452,448],[420,482],[372,500],[326,508],
  [296,502],[262,506],[200,522],[140,532],[80,539],[20,536],[-8,524],
  [-24,470],[-32,395],[-36,318],[-38,248],[-41,196],[-46,158],[-52,138],
];

export function sampleRailCenterline(control:RailControl){
  const curve=new CatmullRomCurve3(control.map(([e,n])=>new Vector3(e,0,-n)),false,'centripetal');
  curve.arcLengthDivisions=2400;
  const length=curve.getLength(),count=Math.max(8,Math.ceil(length/1.7));
  const points=Array.from({length:count+1},(_,i)=>{
    const p=curve.getPointAt(i/count);return {east:p.x,north:-p.z};
  });
  return {length,count,step:length/count,points};
}

/** Siding leaves an exact existing sample with matching first tangent,
 * then gradually diverges over the real west snow carrier. The cubic
 * Hermite transition avoids the old disconnected freight dead-end. */
export function freightSidingControlLine(main=sampleRailCenterline(craterBranchControlLine).points):RailControl{
  let i=0;
  for(let j=1;j<main.length;j++)if(Math.abs(main[j]!.north-238)<Math.abs(main[i]!.north-238))i=j;
  const start=main[i]!,a=main[Math.max(0,i-1)]!,b=main[Math.min(main.length-1,i+1)]!;
  const m0=(b.east-a.east)/(b.north-a.north),m1=4/26,L=184-start.north;
  const transition=Array.from({length:13},(_,k)=>{
    const t=k/12,t2=t*t,t3=t2*t;
    const e=(2*t3-3*t2+1)*start.east+(t3-2*t2+t)*L*m0+(-2*t3+3*t2)*(-50)+(t3-t2)*L*m1;
    return [e,start.north+t*L] as const;
  });
  return [...transition,[-54,158],[-56.15,142.4]];
}
export function freightTurnoutKeepout(){
  // Only the new northern section, outside R59, participates in the
  // existing A-mounted visual-dressing exclusion mechanism.
  return sampleRailCenterline(freightSidingControlLine()).points
    .filter(p=>p.north>=184).map(p=>({...p,radius:1.95}));
}
