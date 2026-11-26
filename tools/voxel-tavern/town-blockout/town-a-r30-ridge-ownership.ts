import {layout,riverX,isWater} from './terrain';
import {extensionRoads,extensionPlots} from './town-extension';
import {railPlatforms} from './town-rail-stops';
type EN=Readonly<{east:number;north:number}>;
type Segment={a:EN;b:EN;radius:number};
const clamp=(t:number)=>Math.max(0,Math.min(1,t));
const smooth=(t:number)=>{const x=clamp(t);return x*x*(3-2*x);};
const dRect=(e:number,n:number,x0:number,n0:number,x1:number,n1:number)=>Math.hypot(Math.max(x0-e,e-x1,0),Math.max(n0-n,n-n1,0));
function segmentGap(e:number,n:number,s:Segment){
 const de=s.b.east-s.a.east,dn=s.b.north-s.a.north,t=clamp(((e-s.a.east)*de+(n-s.a.north)*dn)/(de*de+dn*dn||1));
 return Math.hypot(e-s.a.east-t*de,n-s.a.north-t*dn)-s.radius;
}
/** Candidate I1 ownership: frozen town footprint, actual river/bridge,
 * plot/road approaches and current A tracks have zero weight. The ramp
 * is deliberately wide: it is a land reservation, not a cut permit.
 * D's field consumes this pure function and A's H0 once. */
export function createAR30RidgeOwnership(options:{loop:readonly Readonly<{x:number;z:number}>[];branch:readonly EN[];feather?:number}){
 const feather=options.feather??55;
 if(!Number.isFinite(feather)||feather<24||!options.loop.length||!options.branch.length)throw Error('Missing surveyed ridge ownership inputs');
 const routes:Segment[]=[];
 function route(points:readonly EN[],radius:number,closed=false){
  if(points.length<2||points.some(p=>![p.east,p.north].every(Number.isFinite)))throw Error('Invalid ridge ownership route');
  for(let i=0;i<points.length-(closed?0:1);i++)routes.push({a:points[i]!,b:points[(i+1)%points.length]!,radius});
 }
 route(options.loop.map(p=>({east:p.x,north:-p.z})),5,true);route(options.branch,5);
 for(const r of [...layout.roads,...extensionRoads])route(r.points.map(p=>({east:p[0]!,north:p[1]!})),r.width/2+3);
 for(const p of railPlatforms)if('trail' in p)route(p.trail.map(q=>({east:q[0]!,north:q[1]!})),4);
 const rects=[...layout.plots,...extensionPlots].map(p=>({x0:p.origin[0]!-p.footprint[0]!/2-5,n0:p.origin[1]!-p.footprint[1]!/2-5,x1:p.origin[0]!+p.footprint[0]!/2+5,n1:p.origin[1]!+p.footprint[1]!/2+5}));
 rects.push({x0:0,n0:0,x1:layout.width,n1:layout.depth});
 for(const p of railPlatforms){
  const e=p.axis==='east'?p.halfLength+6:9,n=p.axis==='north'?p.halfLength+6:9;
  rects.push({x0:p.east-e,n0:p.north-n,x1:p.east+e,n1:p.north+n});
 }
 // Actual A north extension station reservations; do not move their pads.
 rects.push({x0:278,n0:486,x1:314,n1:526});
 for(const b of layout.bridges)rects.push({x0:b.west-4,n0:b.north-8,x1:b.east+4,n1:b.north+8});
 const cell=32,bins=new Map<string,Segment[]>();
 for(const s of routes){
  const pad=s.radius+feather;
  for(let e=Math.floor((Math.min(s.a.east,s.b.east)-pad)/cell);e<=Math.floor((Math.max(s.a.east,s.b.east)+pad)/cell);e++)
   for(let n=Math.floor((Math.min(s.a.north,s.b.north)-pad)/cell);n<=Math.floor((Math.max(s.a.north,s.b.north)+pad)/cell);n++){
    const k=e+','+n,b=bins.get(k)??[];b.push(s);bins.set(k,b);
   }
 }
 function distance(e:number,n:number){
  if(!Number.isFinite(e)||!Number.isFinite(n))return 0;
  if(isWater(e,n))return 0;
  let d=Math.abs(e-riverX(n))-16;
  for(const r of rects)d=Math.min(d,dRect(e,n,r.x0,r.n0,r.x1,r.n1));
  for(const s of bins.get(Math.floor(e/cell)+','+Math.floor(n/cell))??[])d=Math.min(d,segmentGap(e,n,s));
  return Math.max(0,d);
 }
 return {weight:(e:number,n:number)=>smooth(distance(e,n)/feather),distance,feather,routeSegments:routes.length,protectedRectangles:rects.length};
}
