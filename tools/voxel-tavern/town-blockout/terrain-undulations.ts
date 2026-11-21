import expansion from '../../../docs/p0-layout-draft.json';
import layout from './layout.json';
import { districtParcels, districtStreets, extensionPlots, extensionRoads } from './town-extension';

/**
 * ZA-34 / R1: surveyed B1 northeast-wilds pilot. This is *real* terrain
 * displacement, consumed by the shared terrain grid, not a cosmetic snow skin.
 * All values are deterministic on client and Presence/server.
 *
 * R1 is deliberately restricted to B1 until the mounted scenery and sled routes
 * pass first-person clearance. B2/B3/B4, north mountainside and crater uplift are
 * reserved for the subsequent rounds; this function does not rewrite ZA-36.
 */
type Segment = Readonly<{ ax:number; an:number; dx:number; dn:number; len2:number; halfWidth:number }>;
type Protection = Readonly<{ east:number; north:number; halfEast:number; halfNorth:number }>;
const smooth = (t:number) => {
  const x=Math.max(0,Math.min(1,t));
  return x*x*(3-2*x);
};
const clamp=(n:number)=>Math.max(0,Math.min(1,n));

function segments(points:readonly (readonly number[])[], width:number):Segment[] {
  const result:Segment[]=[];
  for(let i=1;i<points.length;i++){
    const [ax,an]=points[i-1]!;
    const [bx,bn]=points[i]!;
    const dx=bx-ax,dn=bn-an,len2=dx*dx+dn*dn;
    if(len2>0)result.push({ax,an,dx,dn,len2,halfWidth:width*.5});
  }
  return result;
}
const pedestrianRoutes:Segment[]=[
  ...layout.roads.flatMap(r=>segments(r.points,r.width)),
  ...layout.plots.flatMap(p=>segments([p.connect,p.door],4)),
  ...extensionRoads.flatMap(r=>segments(r.points,r.width)),
  ...districtStreets.flatMap(r=>segments(r.points,r.width)),
];
// Rail line is the original approved centreline; extra 8m clearance covers
// Catmull-Rom bowing around the supplied control points. Station/road aprons
// are independently protected above.
const railRoutes=segments(expansion.extension.coasterGuideLine,16);
const protectedPlots:Protection[]=[
  ...layout.plots.map(p=>({
    east:p.origin[0],north:p.origin[1],halfEast:p.footprint[0]/2,halfNorth:p.footprint[1]/2,
  })),
  ...extensionPlots.map(p=>({
    east:p.origin[0],north:p.origin[1],halfEast:p.footprint[0]/2,halfNorth:p.footprint[1]/2,
  })),
  ...Object.values(districtParcels).flat().map(([east,north,w,d])=>({
    east,north,halfEast:w/2,halfNorth:d/2,
  })),
];
function distanceToLine(e:number,n:number,s:Segment) {
  const t=clamp(((e-s.ax)*s.dx+(n-s.an)*s.dn)/s.len2);
  return Math.max(0,Math.hypot(e-s.ax-t*s.dx,n-s.an-t*s.dn)-s.halfWidth);
}
function distanceToParcel(e:number,n:number,p:Protection) {
  return Math.hypot(Math.max(0,Math.abs(e-p.east)-p.halfEast),
    Math.max(0,Math.abs(n-p.north)-p.halfNorth));
}
/** The world-edge and B1-only rollout envelope, blended over 35-45m. */
function b1Envelope(e:number,n:number) {
  return smooth((e-447)/42)*smooth((n-205)/40)
    *smooth((640-e)/35)*smooth((540-n)/35);
}
/**
 * Exact zero within 5m of built footings/path edges; 36m eased apron outside.
 * At the rail reserve we keep a 10m zero band past the approved corridor.
 * The broad falloff protects road shoulders from discontinuities.
 */
export function b1BuildProtection(e:number,n:number) {
  let clearance=Infinity;
  for(const route of pedestrianRoutes) {
    // Avoid sqrt on distant route segments in the normal B1 loop.
    if(Math.abs(e-route.ax)>Math.abs(route.dx)+90||
       Math.abs(n-route.an)>Math.abs(route.dn)+90) continue;
    clearance=Math.min(clearance,distanceToLine(e,n,route));
  }
  for(const route of railRoutes) {
    if(Math.abs(e-route.ax)>Math.abs(route.dx)+90||
       Math.abs(n-route.an)>Math.abs(route.dn)+90) continue;
    clearance=Math.min(clearance,distanceToLine(e,n,route)-10);
  }
  for(const plot of protectedPlots) {
    if(Math.abs(e-plot.east)>plot.halfEast+90||
       Math.abs(n-plot.north)>plot.halfNorth+90) continue;
    clearance=Math.min(clearance,distanceToParcel(e,n,plot));
  }
  return smooth((clearance-5)/36);
}
export function b1TerrainReliefOffset(e:number,n:number) {
  if(e<447||e>640||n<205||n>540)return 0;
  const envelope=b1Envelope(e,n);
  if(envelope===0)return 0;
  const safety=b1BuildProtection(e,n);
  if(safety===0)return 0;
  // Single 174x180m rolling mode in the pilot; 3.2m displacement amplitude.
  // The remaining harmonics belong to R2 after sled / house apron verification.
  return 3.2*Math.sin((e-512)*Math.PI*2/174)
    *Math.cos((n-250)*Math.PI*2/180)*envelope*safety;
}
