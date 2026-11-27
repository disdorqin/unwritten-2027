import {BufferGeometry, Color, Float32BufferAttribute, Group, Mesh, MeshLambertMaterial} from 'three';
import {northRidgeSummit,northRidgeMidStation,northRidgeNorthWall,northRidgeCableAnchors,northRidgeProfileHeight,sampleNorthRidge350} from './north-ridge-350-terrain';
import {frontRidgeSurfaceColorAt,makeFrontRidgePixelTexture} from './town-front-ridge-surface';

/** D-R01 real terrain candidate. World easting/northing, render (E,Y,-N).
 * A supplies the ground-only H0 and ownership mask; neither old bridges nor
 * a visual proxy constitute terrain authority. No public mounting here. */
export const frontRidgeR30Bounds=Object.freeze({west:0,east:640,south:270,north:800,step:1,chunk:64});
const B=frontRidgeR30Bounds, clamp=(v:number)=>Math.min(1,Math.max(0,v));
const smooth=(v:number)=>{const t=clamp(v);return t*t*(3-2*t)};
type GroundAt=(east:number,north:number)=>number;
type Ownership=(east:number,north:number)=>number;
type Point={east:number;north:number;height:number};
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
function hill(e:number,n:number,ce:number,cn:number,re:number,rn:number,angle:number,power=1.5){
 const x=e-ce,z=n-cn,c=Math.cos(angle),s=Math.sin(angle);
 const d=Math.hypot((x*c+z*s)/re,(-x*s+z*c)/rn);
 return Math.max(0,1-d)**power;
}
function rectWeight(e:number,n:number,ce:number,cn:number,w:number,d:number,blend:number){
 return 1-smooth(Math.hypot(Math.max(0,Math.abs(e-ce)-w/2),Math.max(0,Math.abs(n-cn)-d/2))/blend);
}
/** Shared valley axes, reused by erosion, material and grounded scree.
 * They describe dry/frosted channels, not a second river authority. */
export function ridgeR30GullyAxis(n:number,side:'west'|'east'){
 return side==='west'?231+23*Math.sin(n*.019)+7*Math.sin(n*.053):416+18*Math.sin(n*.017+1);
}
export function ridgeR30GullyWeight(e:number,n:number){
 const w=Math.exp(-(((e-ridgeR30GullyAxis(n,'west'))/12)**2))*smooth((n-326)/52)*(1-smooth((n-598)/69));
 const q=Math.exp(-(((e-ridgeR30GullyAxis(n,'east'))/13)**2))*smooth((n-349)/62)*(1-smooth((n-625)/49));
 return Math.max(w,q);
}
/** Real asymmetric massif, subordinate spurs, drainage valleys and exposed
 * rock ribs. Pin existing survey pads rather than moving stations. */
export function frontRidgeR30NaturalHeight(e:number,n:number){
 const old=sampleNorthRidge350(e,n);
 // M01–M03: distinct connected western/eastern ridges, a broken
 // south-facing buttress and a lower foothill fan. A broad secondary
 // saddle avoids the old single-table silhouette.
 const west=hill(e,n,176,581,186,245,-.32,1.20)*226;
 const east=hill(e,n,474,598,155,220,.35,1.22)*194;
 const south=hill(e,n,293,457,173,178,.17,1.30)*110;
 const upperWest=hill(e,n,242,625,105,158,-.48,1.05)*270;
 const upperEast=hill(e,n,391,616,108,168,.42,1.08)*254;
 const main=northRidgeProfileHeight(e,n)-18;
 const peaks=[main,west,east,south,upperWest,upperEast];
 const high=Math.max(...peaks);
 const blend=(peaks.reduce((s,v)=>s+v,0)-high)*.046;
 const envelope=smooth(high/60);
 const westAxis=ridgeR30GullyAxis(n,'west');
 const eastAxis=ridgeR30GullyAxis(n,'east');
 const westGully=22*Math.exp(-(((e-westAxis)/18)**2))*smooth((n-326)/52)*(1-smooth((n-598)/69));
 const eastGully=25*Math.exp(-(((e-eastAxis)/20)**2))*smooth((n-349)/62)*(1-smooth((n-625)/49));
 const minor=5.6*Math.sin(e*.077+n*.036)+3.1*Math.sin(e*.16-n*.052)+1.9*Math.sin(e*.31+n*.091);
 // Geological striation follows a warped inclined bed, not random squares.
 const bed=(n*.044+e*.021+Math.sin(e*.025)*1.15);
 const strata=3.4*Math.sin(bed*3.0)+1.2*Math.sin(bed*6.0+.8);
 let h=18+high+blend+(minor+strata)*envelope-westGully-eastGully;
 h=Math.min(350,Math.max(18,h));
 // Preserve the surveyed 55-degree northern climbing face at its original
 // coordinates, with an 18m feather outside the reserved rectangle.
 const wall=northRidgeNorthWall;
 const wallWeight=rectWeight(e,n,(wall.west+wall.east)/2,(wall.south+wall.north)/2,wall.east-wall.west,wall.north-wall.south,18);
 h=mix(h,old,wallWeight);
 const mid=northRidgeMidStation,summit=northRidgeSummit;
 h=mix(h,mid.height,rectWeight(e,n,mid.east,mid.north,mid.width,mid.depth,13));
 // Broad buttresses rise under the summit terrace; the old 6m
 // shoulder produced a visibly cylindrical cap. Retain the entire pad
 // datum, but blend into the massif over 84m on the south and sides.
 const pad=Math.max(347,northRidgeProfileHeight(e,n));
 // Extend the central plateau only where the established terminal
 // footprint requires it. The outer skirt is deliberately asymmetric.
 const southBlend=95+24*Math.sin((e-320)*.043);
 const padWeight=rectWeight(e,n,summit.east,summit.north,summit.width,summit.depth,n>summit.north?25:southBlend);
 h=mix(h,pad,padWeight*(1-wallWeight));
 // Preserve the authorized cloud apron at its actual built datum.
 // The 350m survey peak is outside the flat route claim and stays pinned.
 const apron=rectWeight(e,n,319.5,660,68,14,6);
 const southWalk=rectWeight(e,n,317.5,645,4,26,3);
 const southView=rectWeight(e,n,319,634,8,6,3);
 const peakExclusion=smooth(Math.hypot(e-320,n-650)/2);
 h=mix(h,347,Math.max(apron,southWalk,southView)*peakExclusion);
 h=mix(h,18,rectWeight(e,n,northRidgeCableAnchors[0][0],northRidgeCableAnchors[0][1],14,12,14));
 return h;
}
export function frontRidgeR30Weight(e:number,n:number){
 if(e<=B.west||e>=B.east||n<=B.south||n>=B.north)return 0;
 const rect=smooth(Math.min(e-B.west,B.east-e,n-B.south,B.north-n)/24);
 const natural=frontRidgeR30NaturalHeight(e,n);
 // Feather the whole mountain skirt; no vertical curtain at its footprint.
 return rect*smooth((natural-18)/22);
}
/** Request to A: local cloud-apron feather of 34m, blended back to
 * the existing ownership over 14m. It NEVER claims protected core.
 * This is opt-in and is not applied inside buildFrontRidgeR30Field.
 * Only A may adopt the returned weight after checking its own distances. */
export function proposeRidgeCloudApronOwnership(ownership:Ownership,protectedDistance:GroundAt):Ownership{
 return (e,n)=>{
  const w=ownership(e,n),distance=protectedDistance(e,n);
  if(!Number.isFinite(w)||!Number.isFinite(distance)||distance<=0||w<=0)return w;
  const local=rectWeight(e,n,319.5,660,70,18,14);
  return mix(w,Math.max(w,smooth(distance/34)),local);
 };
}
export function buildFrontRidgeR30Field(heightBelow:GroundAt,ownership:Ownership){
 const width=B.east-B.west+1,depth=B.north-B.south+1;
 const elevation=new Float32Array(width*depth);
 const weights=new Float32Array(elevation.length);
 for(let n=B.south;n<=B.north;n++)for(let e=B.west;e<=B.east;e++){
   const i=(n-B.south)*width+e,h0=heightBelow(e,n),allowed=ownership(e,n);
   if(!Number.isFinite(h0)||!Number.isFinite(allowed))throw new RangeError('D-R01 requires finite ground-only H0 and ownership');
   const h=frontRidgeR30NaturalHeight(e,n);
   // Station pad is an explicit positive claim even at low altitude,
   // but the host's ownership remains the final gate.
   const basePad=rectWeight(e,n,526,329,14,12,14);
   const weight=Math.max(frontRidgeR30Weight(e,n),basePad)*clamp(allowed);
   weights[i]=weight;
   elevation[i]=mix(h0,h,weight);
 }
 return createFrontRidgeR30FieldFromRaster(elevation,weights);
}
/** One raster authority for terrain mesh and support; engineering callers
 * must preserve the outer boundary and supply their own protection check. */
export function createFrontRidgeR30FieldFromRaster(elevation:Float32Array,weights:Float32Array){
 const width=B.east-B.west+1,depth=B.north-B.south+1;
 if(elevation.length!==width*depth||weights.length!==elevation.length)throw new RangeError('Invalid ridge raster');
 const get=(e:number,n:number)=>elevation[(n-B.south)*width+e]!;
 function heightAt(e:number,n:number):number|undefined{
   if(!Number.isFinite(e)||!Number.isFinite(n)||e<B.west||e>B.east||n<B.south||n>B.north)return;
   const x=Math.min(Math.floor(e),B.east-1),z=Math.min(Math.floor(n),B.north-1),u=e-x,v=n-z;
   const a=get(x,z),b=get(x+1,z),c=get(x,z+1),d=get(x+1,z+1);
   // The exact same diagonal used by every mesh cell.
   return u+v<=1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v);
 }
 function edge(side:'south'|'north'|'west'|'east'):Point[]{
   const horizontal=side==='south'||side==='north';
   const count=horizontal?width:depth;
   return Array.from({length:count},(_,i)=>{
     const east=horizontal?B.west+i:side==='west'?B.west:B.east;
     const north=horizontal?(side==='south'?B.south:B.north):B.south+i;
     return {east,north,height:get(east,north)};
   });
 }
 function normalAt(e:number,n:number){
   const l=Math.max(B.west,e-1),r=Math.min(B.east,e+1),s=Math.max(B.south,n-1),t=Math.min(B.north,n+1);
   const dx=(get(r,n)-get(l,n))/(r-l),dn=(get(e,t)-get(e,s))/(t-s);
   const len=Math.hypot(dx,1,dn);
   return [-dx/len,1/len,dn/len] as const;
 }
 return {elevation,weights,width,depth,heightAt,edge,normalAt,vertexAt:get};
}
export type FrontRidgeR30Field=ReturnType<typeof buildFrontRidgeR30Field>;
/** Far geometry reuses the fine vertex buffer. Every exterior one-metre
 * edge vertex is referenced, even when a neighbouring chunk stays fine.
 * In the boundary strip a fan stitches coarse interior cells to that edge. */
export function ridgeFarIndices(cols:number,rows:number,step=4){
 const result:number[]=[];const v=(x:number,z:number)=>z*cols+x;
 for(let z=0;z<rows-1;z+=step)for(let x=0;x<cols-1;x+=step){
   const r=Math.min(cols-1,x+step),b=Math.min(rows-1,z+step);
   if(r-x<2||b-z<2){for(let j=z;j<b;j++)for(let i=x;i<r;i++)result.push(v(i,j),v(i+1,j),v(i,j+1),v(i+1,j),v(i+1,j+1),v(i,j+1));continue}
   const top=z===0,right=r===cols-1,bottom=b===rows-1,left=x===0;
   if(!top&&!right&&!bottom&&!left){result.push(v(x,z),v(r,z),v(x,b),v(r,z),v(r,b),v(x,b));continue}
   const ring:number[]=[v(x,z)];
   if(top)for(let i=x+1;i<=r;i++)ring.push(v(i,z));else ring.push(v(r,z));
   if(right)for(let j=z+1;j<=b;j++)ring.push(v(r,j));else ring.push(v(r,b));
   if(bottom)for(let i=r-1;i>=x;i--)ring.push(v(i,b));else ring.push(v(x,b));
   if(left)for(let j=b-1;j>z;j--)ring.push(v(x,j));
   const center=v(Math.floor((x+r)/2),Math.floor((z+b)/2));
   for(let i=0;i<ring.length;i++)result.push(ring[i]!,ring[(i+1)%ring.length]!,center);
 }
 return result;
}
/** Spatial chunks share the same 1m vertices and cross-boundary normals.
 * No bottomless shell, doubled road surface or DoubleSide workaround. */
export function mountFrontRidgeR30(field:FrontRidgeR30Field,roadAt?:(east:number,north:number)=>boolean,ownsCell?:(east:number,north:number)=>boolean){
 const group=new Group();group.name='town-d-r30-front-ridge';
 const texture=makeFrontRidgePixelTexture(),material=new MeshLambertMaterial({vertexColors:true,map:texture});
 const moss=new Color('#59694b'),snow=new Color('#e0e8ed');
 const shale=new Color('#78838b'),sandstone=new Color('#b09a7b'),rust=new Color('#88624a'),frost=new Color('#c9d9e3'),gravel=new Color('#b5a58f');
 const geometries:BufferGeometry[]=[];
 const lod:{mesh:Mesh;fine:BufferGeometry;far:BufferGeometry;east:number;north:number}[]=[];
 for(let n0=B.south;n0<B.north;n0+=B.chunk)for(let e0=B.west;e0<B.east;e0+=B.chunk){
   const e1=Math.min(B.east,e0+B.chunk),n1=Math.min(B.north,n0+B.chunk),cols=e1-e0+1,rows=n1-n0+1;
   let owned=0;for(let n=n0;n<n1;n++)for(let e=e0;e<e1;e++)if(!ownsCell||ownsCell(e,n))owned++;
   if(!owned)continue;
   const full=owned===(cols-1)*(rows-1);
   const p=new Float32Array(cols*rows*3),normal=new Float32Array(p.length),color=new Float32Array(p.length),uv=new Float32Array(cols*rows*2),indices:number[]=[];
   for(let n=n0;n<=n1;n++)for(let e=e0;e<=e1;e++){
     const i=(n-n0)*cols+e-e0,h=field.vertexAt(e,n),norm=field.normalAt(e,n);
     p.set([e,h,-n],i*3);normal.set(norm,i*3);
     const tint=frontRidgeSurfaceColorAt(e,n,h,1-norm[1]);
     const patch=smooth((Math.sin(e*.051+n*.033)+Math.cos(n*.049-e*.024)+.75)/2.5);
     const small=.5+.5*Math.sin(e*.42+n*.38);
     const band=.5+.5*Math.sin(h*.26+n*.037-e*.019+Math.sin(e*.065)*.8);
     const bare=smooth((.93-norm[1])/.47),high=smooth((h-105)/135);
     // M08: sandstone and rust-stained ledges below the cold shale belt.
     tint.lerp(sandstone,(1-high)*(.22+.32*band)*bare);
     tint.lerp(rust,(1-high)*bare*smooth((band-.68)/.32)*.50);
     tint.lerp(shale,high*(.50+.32*bare)*(.75+.25*band));
     tint.lerp(moss,smooth((110-h)/86)*(.14+.48*patch)*(1-bare*.65));
     // Snow flows along the actual shelves and gully beds. Exposed steep
     // faces keep dark rock, wind-shadowed faces gather thicker drifts.
     const lee=smooth((norm[0]-.04)/.75),sheltered=smooth((norm[1]-.43)/.48);
     const alpine=smooth((h-132)/118)*(.72+.28*lee)*(.72+.28*patch);
     const foothill=smooth((norm[1]-.68)/.30)*(.25+.75*patch)*smooth((140-h)/105);
     const ledge=smooth((band-.56)/.44)*smooth((norm[1]-.32)/.48)*smooth((h-93)/125);
     // Narrow accumulation bands also follow sheltered rock fractures on
     // the steep upper face. Leave the actual northern climbing wall bare.
     const windChannel=smooth((Math.sin(e*.101+n*.028+Math.sin(n*.047)*1.2)-.25)/.75);
     const highLedge=smooth((h-174)/92)*smooth((band-.41)/.59)*smooth((norm[1]-.22)/.57);
     const wall= e>=northRidgeNorthWall.west&&e<=northRidgeNorthWall.east&&n>=northRidgeNorthWall.south&&n<=northRidgeNorthWall.north;
     const windFrost=wall?0:smooth((h-195)/80)*windChannel*(.17+.45*sheltered);
     const gully=ridgeR30GullyWeight(e,n);
     // Cold exposed streambed gravel and discontinuous frost on the
     // real eroded trough. No separate flat water or snow mesh.
     tint.lerp(shale,gully*.50);
     const gullyIce=gully*smooth((norm[1]-.65)/.32)*(.30+.60*patch);
     const snowWeight=Math.max(foothill*.84,alpine*sheltered,ledge*.90,highLedge*.93,windFrost,gullyIce*.86);
     tint.lerp(frost,Math.min(.78,snowWeight*1.25));
     tint.lerp(snow,smooth((snowWeight-.16)/.63));
     // broad-scale color continuity with a restrained small stone grain
     tint.multiplyScalar(.93+.07*small);
     if(roadAt?.(e,n))tint.copy(gravel).multiplyScalar(.90+.10*small);
     color.set([tint.r,tint.g,tint.b],i*3);
     uv.set([(e+h*.11)/2,(n*.72+h*.69)/2],i*2);
     if(e<e1&&n<n1&&(!ownsCell||ownsCell(e,n)))indices.push(i,i+1,i+cols,i+1,i+cols+1,i+cols);
   }
   const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(p,3));g.setAttribute('normal',new Float32BufferAttribute(normal,3));g.setAttribute('color',new Float32BufferAttribute(color,3));g.setAttribute('uv',new Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeBoundingSphere();
   const far=new BufferGeometry();
   for(const attr of ['position','normal','color','uv'])far.setAttribute(attr,g.getAttribute(attr));
   far.setIndex(full?ridgeFarIndices(cols,rows):indices);far.boundingSphere=g.boundingSphere?.clone()??null;
   const mesh=new Mesh(g,material);mesh.name='d-r30-ridge-'+e0+'-'+n0;group.add(mesh);geometries.push(g,far);
   lod.push({mesh,fine:g,far,east:(e0+e1)/2,north:(n0+n1)/2});
 }
 let disposed=false;
 function updateView(east:number,north:number){
   for(const chunk of lod){
     const d=Math.hypot(east-chunk.east,north-chunk.north);
     // A fine neighbourhood is always retained around a real player foot.
     if(chunk.mesh.geometry===chunk.fine&&d>192)chunk.mesh.geometry=chunk.far;
     else if(chunk.mesh.geometry===chunk.far&&d<160)chunk.mesh.geometry=chunk.fine;
   }
 }
 return {group,field,updateView,detailCounts:()=>({near:lod.filter(c=>c.mesh.geometry===c.fine).length,far:lod.filter(c=>c.mesh.geometry===c.far).length}),dispose(){if(disposed)return;disposed=true;group.removeFromParent();group.clear();geometries.forEach(g=>g.dispose());texture.dispose();material.dispose()}};
}
