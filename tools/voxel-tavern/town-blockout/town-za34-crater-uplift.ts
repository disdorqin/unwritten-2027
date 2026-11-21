import { meteorCraterRimRadius } from './meteor-crater';

/**
 * ZA-34 R1 standalone WEST-domain relief candidate, sampled in metres.
 *
 * The crater's real collision/rendering authority is mountWestCraterRoad; this
 * module deliberately does NOT mutate that active ZA-36 host. A single-writer
 * integration must pass this sample to both its ground mesh and heightAt,
 * preserving the r<=55 crater cut-out, industrial sites, rail and access road.
 *
 * Radial uplift (r55–110) is steep toward impact and gentle toward wilderness;
 * a second wave (r105–180) keeps the surrounding western wilds from being flat.
 * The E>-24 seam to the town is zero and the active industrial sector
 * (bearing 100–230 deg) is held exactly level until a site survey approves it.
 */
export type CraterReliefAnchor = Readonly<{ east:number; north:number }>;

const smooth=(value:number)=>{
  const x=Math.max(0,Math.min(1,value));
  return x*x*(3-2*x);
};
const DEG=Math.PI/180;
const fullTurn=2*Math.PI;

function angleDistance(a:number,b:number) {
  const diff=Math.abs(a-b)%fullTurn;
  return Math.min(diff,fullTurn-diff);
}

/** 0 in protected industrial azimuths (100°–230°), eased over 30° each side. */
export function craterIndustrialProtection(east:number,north:number,anchor:CraterReliefAnchor) {
  const bearing=Math.atan2(east-anchor.east,north-anchor.north);
  const centre=165*DEG;
  const distance=angleDistance(bearing,centre);
  if(distance<=65*DEG+1e-12)return 0;
  return smooth((distance-65*DEG)/(30*DEG));
}

/** Only the already existing west-domain mesh; zero at the town seam. */
export function craterWestBoundaryEnvelope(east:number,north:number) {
  if(east<=-240||east>=-24||north<=0||north>=540)return 0;
  return smooth((east+240)/25)*smooth((-24-east)/28)
    *smooth(north/32)*smooth((540-north)/32);
}

/** Bare rising-ring shape, independent of road/rail clearance and mesh slicing. */
export function craterImpactRing(east:number,north:number,anchor:CraterReliefAnchor) {
  const dx=east-anchor.east,dn=north-anchor.north;
  const radius=Math.hypot(dx,dn);
  if(radius<=meteorCraterRimRadius||radius>=110)return 0;
  const bearing=Math.atan2(dx,dn);
  const inner=smooth((radius-meteorCraterRimRadius)/22);
  const outer=1-smooth((radius-82)/28);
  const natural=0.9+0.07*Math.cos(bearing*6.0)+0.03*Math.sin(bearing*9.0);
  return 4.5*natural*inner*outer;
}

/** Outer rolling wave beyond the crater crown, fading before the management rim. */
export function craterWestBelt(east:number,north:number,anchor:CraterReliefAnchor) {
  const radius=Math.hypot(east-anchor.east,north-anchor.north);
  if(radius<=105||radius>=180)return 0;
  const envelope=smooth((radius-105)/30)*(1-smooth((radius-151)/29));
  const wave=2.8*Math.sin((east+158)*Math.PI*2/172)
    *Math.cos((north-190)*Math.PI*2/184)
    +0.95*Math.sin((east+north+20)*Math.PI*2/192);
  return wave*envelope;
}

/**
 * Proposed AUTHORITATIVE offset when ZA-36 accepts the overlap and location
 * reservations. Do not call from current viewer/Presence until the same height
 * calculation can be shared by the physical crater mesh and all moving actors.
 */
export function craterWestUpliftCandidate(east:number,north:number,anchor:CraterReliefAnchor) {
  const range=craterWestBoundaryEnvelope(east,north);
  if(range===0)return 0;
  const industrial=craterIndustrialProtection(east,north,anchor);
  if(industrial===0)return 0;
  return (craterImpactRing(east,north,anchor)+craterWestBelt(east,north,anchor))*range*industrial;
}
