/** A-R02. Shape the existing west carrier, not a new visual-only landscape.
 * All ground weights vanish on B's agreed apron and the original civil
 * infrastructure. The actual building placements still sample the same field.
 */
type Point=readonly [number,number];
type Anchor=Readonly<{east:number;north:number}>;
const unit=(x:number)=>Math.max(0,Math.min(1,x));
const smooth=(x:number)=>{const u=unit(x);return u*u*(3-2*u)};
const rad=(deg:number)=>deg*Math.PI/180;

// The current canonical site specifications (see outer/mouth works).
// The third dimension is the actual pad radius, larger than the site's
// interaction radius. These pads are level before structure generation.
export const westLandscapePads=[
  {id:'smelter-plant',bearing:207,radius:88,pad:23},
  {id:'instrument-plant',bearing:127,radius:88,pad:21},
  {id:'ore-yard',bearing:186,radius:86,pad:17},
  {id:'ruined-shed',bearing:196,radius:94,pad:9},
  {id:'assembly-ground',bearing:168,radius:70,pad:13},
  {id:'supply-station',bearing:150,radius:74,pad:11},
  {id:'guard-shed',bearing:358,radius:64,pad:8},
  {id:'north-tower',bearing:358,radius:67.5,pad:6},
  {id:'west-tower',bearing:262,radius:64,pad:6},
] as const;

function segmentDistance(e:number,n:number,a:Point,b:Point){
  const dx=b[0]-a[0],dn=b[1]-a[1];
  const t=unit(((e-a[0])*dx+(n-a[1])*dn)/(dx*dx+dn*dn||1));
  return Math.hypot(e-a[0]-dx*t,n-a[1]-dn*t);
}
function mound(e:number,n:number,ce:number,cn:number,re:number,rn:number,h:number){
  return h*Math.exp(-(((e-ce)/re)**2+((n-cn)/rn)**2));
}
export function createWestLandscape(anchor:Anchor,apronRadius:number,northLimit:number,
  beltCorridor:readonly Point[]){
  const polar=(bearing:number,radius:number):Point=>[
    anchor.east+radius*Math.sin(rad(bearing)),anchor.north+radius*Math.cos(rad(bearing))];
  const pads=westLandscapePads.map(p=>({id:p.id,center:polar(p.bearing,p.radius),radius:p.pad}));
  const belt=beltCorridor.map(([b,r])=>polar(b,r));
  function protectionAt(e:number,n:number){
    // Original E0 seam, town wall, station and west railway approach remain
    // bit-identical. The R59 B apron also has a full interpolation-cell guard.
    if(e>=-58||e<=-240||n<=0||n>=northLimit)return 0;
    const r=Math.hypot(e-anchor.east,n-anchor.north);
    // The seam collar ends on a square integer-lattice perimeter. Keep its
    // complete triangulated interior and one adjacent cell at the agreed H0.
    const collarHalf=Math.ceil(apronRadius)+5;
    const collarOutside=Math.max(Math.abs(e-anchor.east),Math.abs(n-anchor.north))-collarHalf;
    let weight=smooth((collarOutside-1)/10)*smooth((r-apronRadius-1.5)/12)
      *smooth((-e-58)/22)*smooth((e+240)/16)
      *smooth(n/22)*smooth((northLimit-n)/18);
    if(weight===0)return 0;
    // Preserve the old east-west entrance's horizontal grade and the
    // whole varying-radius isolation fence, including its gate/collapse gaps.
    const approachDistance=segmentDistance(e,n,[0,159],[-77,159]);
    weight*=smooth((approachDistance-6)/14);
    const fenceDistance=Math.max(0,88-r,r-106);
    weight*=smooth((fenceDistance-2)/10);
    if(weight===0)return 0;
    for(const p of pads){
      const d=Math.hypot(e-p.center[0],n-p.center[1])-p.radius;
      weight=Math.min(weight,smooth(d/11));
    }
    for(let i=1;i<belt.length;i++)
      weight=Math.min(weight,smooth((segmentDistance(e,n,belt[i-1]!,belt[i]!)-5)/9));
    return weight;
  }
  function offsetAt(e:number,n:number){
    const w=protectionAt(e,n);
    if(w===0)return 0;
    // Two asymmetrical ejecta ridges; a lower, elongated erosion hollow
    // between them; north snowdrifts and a broad south outwash fan.
    const broad=mound(e,n,-202,265,38,47,4.8)
      +mound(e,n,-213,117,33,36,3.9)
      +mound(e,n,-146,305,34,24,3.1)
      +mound(e,n,-148,47,37,30,2.9)
      +mound(e,n,-180,181,21,40,1.6)
      -mound(e,n,-220,202,16,48,2.8)
      -mound(e,n,-88,293,22,29,1.9)
      -mound(e,n,-196,71,29,21,1.8);
    const drift=.52*Math.sin((e+180)*.068+(n-160)*.044)
      +.28*Math.sin((e-n)*.112+.8);
    return w*(broad+drift);
  }
  return {offsetAt,protectionAt,pads};
}
