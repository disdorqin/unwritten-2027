import {r30InterlayerLiftSite,splitR30LiftAperture} from './town-c-r30-interlayer-lift.js';
type P=readonly [number,number];
function area(p:readonly P[]){
 let a=0;for(let i=0;i<p.length;i++){const b=p[(i+1)%p.length];a+=p[i][0]*b[1]-p[i][1]*b[0]}return Math.abs(a)/2;
}
function clip(poly:readonly P[],axis:0|1,bound:number,keepGreater:boolean):P[]{
 const out:P[]=[];
 for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length];
  const inside=(p:P)=>keepGreater?p[axis]>=bound:p[axis]<=bound;
  if(inside(a))out.push(a);
  if(inside(a)!==inside(b)){
   const t=(bound-a[axis])/(b[axis]-a[axis]);
   out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);
  }
 }
 return out;
}
/** Cut ONLY the actual horizontal upward-facing floor at the registered
 * upper shaft. All vertical walls, roof and other triangles are retained.
 * A missing or overlapping source floor fails closed, not a guessed hole. */
export function cutR30UpperLiftFloor(source:Float32Array){
 const h=r30InterlayerLiftSite.aperture.upper,out:number[]=[];
 let removed=0;
 for(let i=0;i<source.length;i+=9){
  const t=Array.from(source.slice(i,i+9));
  if(t.length!==9||!t.every(Number.isFinite))return {kind:'invalid-source'} as const;
  const [x0,y0,z0,x1,y1,z1,x2,y2,z2]=t;
  const cross=(z1-z0)*(x2-x0)-(x1-x0)*(z2-z0);
  const rect={minX:Math.min(x0,x1,x2),maxX:Math.max(x0,x1,x2),minZ:Math.min(z0,z1,z2),maxZ:Math.max(z0,z1,z2)};
  if([y0,y1,y2].some(y=>Math.abs(y-h.height)>.0001)||cross<=0||
    rect.maxX<=h.minX||rect.minX>=h.maxX||rect.maxZ<=h.minZ||rect.minZ>=h.maxZ){
   out.push(...t);continue;
  }
  const tri:P[]=[[x0,z0],[x1,z1],[x2,z2]];
  let kept=0;
  for(const r of splitR30LiftAperture(rect,h)){
   const p=clip(clip(clip(clip(tri,0,r.minX,true),0,r.maxX,false),1,r.minZ,true),1,r.maxZ,false);
   for(let j=1;j+1<p.length;j++){
    const piece=[p[0],p[j],p[j+1]],a=area(piece);
    if(a<1e-9)continue;kept+=a;
    for(const v of piece)out.push(v[0],h.height,v[1]);
   }
  }
  removed+=area(tri)-kept;
 }
 const expected=(h.maxX-h.minX)*(h.maxZ-h.minZ);
 if(Math.abs(removed-expected)>.001)return {kind:'unsupported-floor',removed} as const;
 return {kind:'ready',vertices:Float32Array.from(out),removed} as const;
}
