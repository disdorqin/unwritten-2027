import type {SouthProtection} from './town-night-a-summit-landform';
type Point=Readonly<{east:number;north:number}>;
type Corridor=Readonly<{points:readonly Point[];radius:number}>;
type Pad=Readonly<{west:number;east:number;south:number;north:number}>;
/** Spatially bounded, exact point-to-segment reservation. Consume the
 * C2 surveyed road and B surveyed cable/footprint lists, not a second
 * road or station survey. The caller explicitly provides their widths. */
export function createSouthReservation(corridors:readonly Corridor[],pads:readonly Pad[]):SouthProtection{
 const cell=32;
 type Segment={a:Point;b:Point;radius:number};
 const bins=new Map<string,Segment[]>();
 for(const {points,radius} of corridors){
  if(!Number.isFinite(radius)||radius<0||points.length<2||points.some(p=>![p.east,p.north].every(Number.isFinite)))throw Error('Invalid southern reservation');
  for(let i=1;i<points.length;i++){
   const a=points[i-1]!,b=points[i]!,s={a,b,radius};
   for(let e=Math.floor((Math.min(a.east,b.east)-radius)/cell);e<=Math.floor((Math.max(a.east,b.east)+radius)/cell);e++)
    for(let n=Math.floor((Math.min(a.north,b.north)-radius)/cell);n<=Math.floor((Math.max(a.north,b.north)+radius)/cell);n++){
     const k=e+','+n,list=bins.get(k)??[];list.push(s);bins.set(k,list);
    }
  }
 }
 if(pads.some(p=>![p.west,p.east,p.south,p.north].every(Number.isFinite)||p.west>p.east||p.south>p.north))throw Error('Invalid reserved facility');
 return (e,n)=>{
  if(pads.some(p=>e>=p.west&&e<=p.east&&n>=p.south&&n<=p.north))return true;
  return (bins.get(Math.floor(e/cell)+','+Math.floor(n/cell))??[]).some(({a,b,radius})=>{
   const de=b.east-a.east,dn=b.north-a.north,t=Math.max(0,Math.min(1,((e-a.east)*de+(n-a.north)*dn)/(de*de+dn*dn||1)));
   return Math.hypot(e-a.east-de*t,n-a.north-dn*t)<=radius;
  });
 };
}
