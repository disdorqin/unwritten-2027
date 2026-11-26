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
  // These are the already surveyed civil routes, not new gameplay anchors.
  // The broad road to the gate and the industrial footways follow the
  // actual entrance / station / warehouse approach. Keep the new B apron
  // and frozen town seam byte-for-byte the old snow color.
  const civilRoutes:readonly {points:readonly Point[];half:number;strength:number}[]=[
    {points:[[-40,159],[-37,168],[-39,175],[-62,201],[-68,220],[-83,235],[-98,243],[-120,256],[-123.84,255.71]],half:1.25,strength:.63},
    {points:[[-40,159],[-80,126],[-95,128],[-110,124],[-126,123],[-151,129],[-170,148],[-178,163],[-186.63,174.61]],half:1.25,strength:.63},
    {points:[[0,159],[-12,159],[-40,159],[-67,159]],half:3.5,strength:1},
    {points:[[-29,159],[-35,164],[-36,167],[-37.21,167.05]],half:1.6,strength:.78},
    {points:[[-29,159],[-36,145],[-38,145],[-48,143.5],[-54.5,140.5],[-58.11,138.36]],half:1.45,strength:.7},
    {points:[[-43,159],[-67,136],[-76.5,126],[-74,117.5],[-75.3019,116.6406]],half:1.45,strength:.78},
    {points:[[-67,136],[-86.025,126.15357]],half:1.45,strength:.72},
    {points:[[-43,159],[-67,136],[-144,105],[-151.75,112.34]],half:1.75,strength:.7},
    {points:[[-57.9,146],[-59.25,146],[-64,146]],half:1.9,strength:.8},
  ];
  const workYards=pads.filter(p=>p.id==='smelter-plant'||p.id==='instrument-plant'||p.id==='ore-yard')
    .map(p=>({...p,radius:p.radius*.72}));
  function surfaceWeightsAt(e:number,n:number){
    const radial=Math.hypot(e-anchor.east,n-anchor.north);
    const seam=smooth((radial-apronRadius-1.2)/5)*smooth(-e/9)
      *smooth((e+240)/8)*smooth(n/8)*smooth((northLimit-n)/8);
    if(seam===0)return {packed:0,ballast:0,yard:0};
    let packed=0,ballast=0,yard=0;
    for(const route of civilRoutes)for(let i=1;i<route.points.length;i++){
      const d=segmentDistance(e,n,route.points[i-1]!,route.points[i]!);
      packed=Math.max(packed,route.strength*(1-smooth((d-route.half*.68)/1.8)));
    }
    for(let i=1;i<belt.length;i++){
      const d=segmentDistance(e,n,belt[i-1]!,belt[i]!);
      ballast=Math.max(ballast,1-smooth((d-.9)/2.2));
    }
    for(const p of workYards){
      const d=Math.hypot(e-p.center[0],n-p.center[1]);
      yard=Math.max(yard,1-smooth((d-p.radius*.55)/(p.radius*.6)));
    }
    return {packed:seam*packed,ballast:seam*ballast,yard:seam*yard};
  }
  return {offsetAt,protectionAt,pads,surfaceWeightsAt};
}
