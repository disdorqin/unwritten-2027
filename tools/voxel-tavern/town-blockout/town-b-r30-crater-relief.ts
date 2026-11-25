/**
 * 3.0-R B-R01: continuous impact relief in the canonical crater-local EN
 * frame. 55m is the immutable shared seam, not a circular cliff.
 * The visible break of slope is irregular and wholly inside that seam.
 * The legacy B-01 path, shaft apron and outer carrier remain fixed.
 */
export const bR30CraterDimensions = Object.freeze({rim:55,floor:20,depth:35});
const clamp=(v:number)=>Math.min(1,Math.max(0,v));
const smooth=(v:number)=>{const t=clamp(v);return t*t*(3-2*t);};
const distance=(a:number,b:number)=>Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));
const sector=(a:number,b:number,width:number)=>1-smooth(distance(a,b)/width);

/** Bearings are local, not an unauthorized change to the surveyed world yaw. */
export function bR30VisibleLipRadius(bearing:number) {
  return 52.1+1.35*Math.sin(3*bearing+.45)+.94*Math.sin(5*bearing-1.2)+.55*Math.cos(9*bearing+.8);
}
export function bR30CraterBed(east:number,north:number):number|undefined {
  if(!Number.isFinite(east)||!Number.isFinite(north))return;
  const r=Math.hypot(east,north),{rim,floor,depth}=bR30CraterDimensions;
  if(r>rim+1e-12)return;
  if(r>=rim)return 0;
  if(r<=floor)return -depth;
  const a=Math.atan2(east,north);
  const lip=bR30VisibleLipRadius(a);
  // The lip is a finite, irregular snow-covered shoulder rather than a vertical wall.
  // Keep a shallow slope between that break and the invariant shared boundary.
  const u=clamp((r-floor)/(lip-floor));
  const outer=smooth((rim-r)/Math.max(1,rim-lip));
  // Impact bowl plus skewed broad wall lobes, no global terrace plateaux.
  const warp=.09*Math.sin(a*2+.7)+.055*Math.sin(a*5-u*2.1);
  const t=clamp(u+warp*Math.sin(Math.PI*u));
  const bowl=-depth*(1-(.66*t+.34*smooth(t)));
  // Two local mining benches, each fading into intact wall. They are not rings.
  // Steeper inward cuts and flatter short working pads are part of the actual mesh.
  const cutA=sector(a,-1.08,.59),cutB=sector(a,2.56,.47);
  const bench=(center:number,width:number)=> {
    const x=(u-center)/width;
    return Math.abs(x)<1 ? -x*(1-smooth(Math.abs(x))) : 0;
  };
  const cut=depth*(.17*cutA*bench(.60,.19)+.15*cutB*bench(.37,.18));
  // Fractured rock ribs: coherent dip and taper, not independent random voxels.
  const ribs=(1.15*Math.sin(11*a+u*3.7)+.52*Math.sin(19*a-u*5.2)
    +.27*Math.cos(29*a+u*7.4))*Math.sin(Math.PI*u)**1.2;
  // A shallow variable shoulder at the outer lip; returns exactly zero at r=55.
  const shoulder=-1.55*outer*smooth((r-lip+3)/3);
  const blend=smooth((r-floor)/3.5)*smooth((rim-r)/2.2);
  return Math.max(-depth,Math.min(0,bowl+(cut+ribs)*blend+shoulder));
}

/** Rock layers dip across the crater instead of following horizontal radii.
 * Used by the real ground material; no extra mesh, light or collision. */
export function bR30StrataShade(east:number,height:number,north:number) {
  const r=Math.hypot(east,north);
  const a=Math.atan2(east,north);
  const strat=height+.105*east-.075*north+.68*Math.sin(a*3+height*.08);
  const layer=.5+.5*Math.sin(strat*2.35+.30*Math.sin(east*.31+north*.17));
  const fracture=Math.abs(Math.sin(east*1.19+north*.37+height*.43));
  const wall=smooth((r-20)/4)*smooth((55-r)/4);
  return 1-wall*(.09+.19*smooth((layer-.62)/.38)+.06*smooth((.18-fracture)/.18));
}
