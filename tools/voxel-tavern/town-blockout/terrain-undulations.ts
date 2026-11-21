import expansion from '../../../docs/p0-layout-draft.json';
import layout from './layout.json';
import { districtParcels, districtStreets, extensionPlots, extensionRoads } from './town-extension';

/**
 * ZA-34 / R1: real, deterministic wildland relief on the shared 1m terrain grid.
 * B1 is the surveyed first-person pilot; B2 lake-east and B4 northwest are
 * isolated R1 candidate landscapes, pending real ride/walk acceptance.
 * B3 is deliberately restricted to its south town-side strip (N440–540).
 * B3 north of N540, summit/mountain and crater are held for ZA-36's seam survey.
 * Never displace roads, rail, built plots, lake/river or district houses.
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
const [plazaWest,plazaSouth,plazaEast,plazaNorth]=layout.plaza.bounds;
const protectedPlots:Protection[]=[
  // Plaza pavers are part of the immutable spawn datum. The original R1
  // mask missed this large area because it is neither a road nor a plot.
  {east:(plazaWest+plazaEast)/2,north:(plazaSouth+plazaNorth)/2,
    halfEast:(plazaEast-plazaWest)/2,halfNorth:(plazaNorth-plazaSouth)/2},
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
/** The B1 pilot boundary, blended over 35–45m. */
function b1Envelope(e:number,n:number) {
  return smooth((e-447)/42)*smooth((n-205)/40)
    *smooth((640-e)/35)*smooth((540-n)/35);
}
/**
 * Exact zero within 5m of built footings/path edges; 36m eased apron outside.
 * At the rail reserve we keep a 10m zero band past the approved corridor.
 * The broad falloff protects road shoulders from discontinuities.
 */
export function terrainBuildProtection(e:number,n:number) {
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
  const safety=terrainBuildProtection(e,n);
  if(safety===0)return 0;
  // Three superposed 132–188m modes: broad knolls, a cross-wind fold and
  // lower diagonal ridges. Geometry and movement sample this SAME shape;
  // the paved/rail/house apron masks remain identical to the R1 pilot.
  const broad=3.0*Math.sin((e-512)*Math.PI*2/174)
    *Math.cos((n-250)*Math.PI*2/180);
  const cross=.76*Math.sin((e-501)*Math.PI*2/132)
    *Math.cos((n-309)*Math.PI*2/188);
  const diagonal=.45*Math.cos((e+n-745)*Math.PI*2/176);
  return (broad+cross+diagonal)*envelope*safety;
}

/** Backwards-compatible name used by the original B1 clearance audit. */
export const b1BuildProtection=terrainBuildProtection;

/** B2: east-lake wilds, E440–640/N0–160; blend 32–40m to existing terrain. */
function b2Envelope(e:number,n:number) {
  return smooth((e-440)/40)*smooth((640-e)/36)
    *smooth(n/38)*smooth((160-n)/34);
}
export function b2TerrainReliefOffset(e:number,n:number) {
  if(e<=440||e>=640||n<=0||n>=160)return 0;
  const envelope=b2Envelope(e,n);
  if(envelope===0)return 0;
  const safety=terrainBuildProtection(e,n);
  if(safety===0)return 0;
  // Two smooth 80–200m modes; shoreline, housing, baths and curved rail
  // are zeroed by the common mask. No new primitive meshes or draw calls.
  // The older 5.35 + 1.95m constructive bound reached 7.3m and violated
  // the current <=6m A-1 acceptance threshold. Keep both modes and phase,
  // but guarantee an analytic maximum <=4.65+1.30 = 5.95m.
  // Preserve a >=2m real visible landscape after the footprint masks.
  // Keep the strongest snow-knoll lobe away from the actual railway apron:
  // E≈610/N≈25 has usable open ground; E560–590 is mostly reserved rail.
  const wave=4.65*Math.sin((e-490)*Math.PI*2/162)
    *Math.cos((n-30)*Math.PI*2/184)
    +1.30*Math.cos((e+n-538)*Math.PI*2/194);
  return wave*envelope*safety;
}

/** B4: the narrow northwest frame edge, E0–40/N360–480. */
function b4Envelope(e:number,n:number) {
  return smooth(e/20)*smooth((40-e)/20)
    *smooth((n-360)/36)*smooth((480-n)/36);
}
export function b4TerrainReliefOffset(e:number,n:number) {
  if(e<=0||e>=40||n<=360||n>=480)return 0;
  const envelope=b4Envelope(e,n);
  if(envelope===0)return 0;
  const safety=terrainBuildProtection(e,n);
  if(safety===0)return 0;
  const wave=2.0*Math.sin((n-384)*Math.PI*2/158)
    *Math.cos((e-18)*Math.PI*2/145)
    +.67*Math.sin((e+n-411)*Math.PI*2/186);
  return wave*envelope*safety;
}

/**
 * B3 town-side mountain skirt: a real rolling foothill shoulder, but never a
 * fake replacement for the unbuilt N540–800 mountain profile. The town's
 * existing 540m north edge remains exactly untouched until ZA-36 widens the
 * Presence/collision/world grid and resolves the eastern bench-road seam.
 * E40–440 avoids overlap with the already-reviewed B1 northeast pilot.
 */
function b3TownEnvelope(e:number,n:number) {
  return smooth((e-40)/38)*smooth((440-e)/37)
    *smooth((n-440)/32)*smooth((540-n)/32);
}
export function b3TownSkirtReliefOffset(e:number,n:number) {
  if(e<=40||e>=440||n<=440||n>=540)return 0;
  const envelope=b3TownEnvelope(e,n);
  if(envelope===0)return 0;
  const safety=terrainBuildProtection(e,n);
  if(safety===0)return 0;
  // Two 80–200m harmonics; keep profiles deterministic for both ground
  // sampling and render geometry. The 36m infrastructure shoulder is shared.
  const wave=3.8*Math.sin((e-118)*Math.PI*2/174)
    *Math.cos((n-466)*Math.PI*2/162)
    +1.3*Math.cos((e-205)*Math.PI*2/188+(n-476)*Math.PI*2/188);
  return wave*envelope*safety;
}

/**
 * A-1: the existing first-person spawn -> west approach route through the
 * plaza exit, town's west loop, then the E0 west-domain handoff. The 7m
 * centreline is deliberately protected by terrainBuildProtection; the
 * neighbouring 40–80m wildland shoulders carry the relief, not the road.
 * The negative-east corridor remains owned by ZA-36 west ground and is
 * NOT silently replaced with a parallel terrain domain.
 */
const craterApproachLine=segments([
  [223,180],[192,180],[161,181],[151,156],[127,140],
  [108,114],[85,131],[77,164],[1,159],
],7);
const riverProtectionLine=segments(layout.river,16);
function approachWaterClearance(e:number,n:number) {
  let riverClearance=Infinity;
  for(const part of riverProtectionLine)riverClearance=Math.min(riverClearance,distanceToLine(e,n,part));
  const [cx,cn]=layout.lake.center;
  const [rx,rn]=layout.lake.radius;
  const lakeClearance=Math.max(0,(Math.hypot((e-cx)/rx,(n-cn)/rn)-1)*Math.min(rx,rn));
  return smooth((Math.min(riverClearance,lakeClearance)-5)/36);
}
/** A-1 surface-model offset. Analytic bound <5m, wavelength 116–180m. */
export function craterApproachReliefOffset(e:number,n:number) {
  // The town's 1m shared terrain only covers E>=0; true west terrain is
  // protected by the existing ZA-36 scene and must be joined by its owner.
  if(e<=0||e>=230||n<=58||n>=231)return 0;
  let distance=Infinity;
  for(const part of craterApproachLine)
    distance=Math.min(distance,distanceToLine(e,n,part));
  if(distance>=82)return 0;
  const window=smooth(e/25)*smooth((230-e)/30)
    *smooth((n-58)/29)*smooth((231-n)/30)
    *smooth((82-distance)/39);
  if(window===0)return 0;
  const build=terrainBuildProtection(e,n);
  if(build===0)return 0;
  const shore=approachWaterClearance(e,n);
  if(shore===0)return 0;
  const broad=4.22*Math.sin((e-32)*Math.PI*2/142)
    *Math.cos((n-137)*Math.PI*2/166);
  const detail=1.12*Math.sin((e+n-137)*Math.PI*2/178);
  return (broad+detail)*window*build*shore;
}

/** Authoritative relief for both mesh vertices and gameplay groundHeightAt. */
export function terrainReliefOffset(e:number,n:number) {
  return b1TerrainReliefOffset(e,n)
    +b2TerrainReliefOffset(e,n)
    +b4TerrainReliefOffset(e,n)
    +b3TownSkirtReliefOffset(e,n)
    +craterApproachReliefOffset(e,n);
}
