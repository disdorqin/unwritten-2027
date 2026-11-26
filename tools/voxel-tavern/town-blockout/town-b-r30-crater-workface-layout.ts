/**
 * World EN survey for R30 workface. Shared by the physical kit and its
 * ground material; not a new navigation/interaction or underground authority.
 */
export const bR30WorkfacePads=Object.freeze([
  {id:'abandoned-ore-cart',east:-131,north:172,w:2.8,d:2.6,h:1.55},
  {id:'repair-rack',east:-115,north:169,w:2.6,d:2.25,h:1.85},
  {id:'material-bay',east:-136,north:178,w:2.6,d:2.4,h:1.3},
] as const);
type Point={east:number;north:number};
const smooth=(v:number)=>{const t=Math.min(1,Math.max(0,v));return t*t*(3-2*t);};
function project(p:Point,a:Point,b:Point){
  const e=b.east-a.east,n=b.north-a.north;
  const t=Math.min(1,Math.max(0,((p.east-a.east)*e+(p.north-a.north)*n)/(e*e+n*n||1)));
  return Math.hypot(p.east-a.east-t*e,p.north-a.north-t*n);
}
/** Preserve C's surveyed passage. Compaction/soot is a color treatment of
 * the authoritative ground, never a raised road or additional floor mesh. */
export function bR30WorkfaceMasks(p:Point,relativeHeight:number,route:readonly Point[],shaft:Point){
  const r=Math.hypot(p.east-shaft.east,p.north-shaft.north);
  const floor=(1-smooth((relativeHeight+35-.18)/.65))*smooth((r-1.87)/.35);
  let passage=0;
  for(let i=1;i<route.length;i++){
    const distance=project(p,route[i-1],route[i]);
    passage=Math.max(passage,1-smooth((distance-.88)/.68));
  }
  // A worn, feathered apron around the existing operation area, not a new
  // circular decorative foundation; keep the actual sealed opening clear.
  const apron=smooth((r-1.87)/.55)*(1-smooth((r-3.4)/1.2));
  let pad=0;
  for(const s of bR30WorkfacePads){
    const de=Math.max(0,Math.abs(p.east-s.east)-s.w*.5);
    const dn=Math.max(0,Math.abs(p.north-s.north)-s.d*.5);
    pad=Math.max(pad,1-smooth(Math.hypot(de,dn)/1.15));
  }
  const worn=Math.max(passage,.70*apron,.78*pad)*floor;
  return {worn,apron:apron*floor,pad:pad*floor};
}
