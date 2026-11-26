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
function hill(e:number,n:number,ce:number,cn:number,re:number,rn:number,angle:number){
 const x=e-ce,z=n-cn,c=Math.cos(angle),s=Math.sin(angle);
 const d=Math.hypot((x*c+z*s)/re,(-x*s+z*c)/rn);
 return Math.max(0,1-d)**1.5;
}
function rectWeight(e:number,n:number,ce:number,cn:number,w:number,d:number,blend:number){
 return 1-smooth(Math.hypot(Math.max(0,Math.abs(e-ce)-w/2),Math.max(0,Math.abs(n-cn)-d/2))/blend);
}
/** Real asymmetric massif, subordinate spurs, drainage valleys and exposed
 * rock ribs. Pin existing survey pads rather than moving stations. */
export function frontRidgeR30NaturalHeight(e:number,n:number){
 const old=sampleNorthRidge350(e,n);
 const west=hill(e,n,182,586,174,245,-.32)*208;
 const east=hill(e,n,470,607,150,225,.35)*170;
 const south=hill(e,n,315,474,153,172,.12)*98;
 const main=northRidgeProfileHeight(e,n)-18;
 const high=Math.max(main,west,east,south);
 const blend=(main+west+east+south-high)*.075;
 const envelope=smooth(high/65);
 const westGully=17*Math.exp(-(((e-(245+20*Math.sin(n*.022))) / 19)**2))*smooth((n-350)/70)*(1-smooth((n-606)/48));
 const eastGully=21*Math.exp(-(((e-(397+18*Math.sin(n*.019+1))) / 24)**2))*smooth((n-365)/65)*(1-smooth((n-620)/44));
 const ribs=(5.4*Math.sin(e*.095+n*.024)+3.2*Math.sin(e*.16-n*.052)+2.2*Math.sin(e*.27+n*.11))*envelope;
 let h=18+high+blend+ribs-westGully-eastGully;
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
 const padWeight=rectWeight(e,n,summit.east,summit.north,summit.width,summit.depth,n>summit.north?25:84);
 h=mix(h,pad,padWeight*(1-wallWeight));
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
export function buildFrontRidgeR30Field(heightBelow:GroundAt,ownership:Ownership){
 const width=B.east-B.west+1,depth=B.north-B.south+1;
 const elevation=new Float32Array(width*depth);
 const weights=new Float32Array(elevation.length);
 const get=(e:number,n:number)=>elevation[(n-B.south)*width+e]!;
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
/** Spatial chunks share the same 1m vertices and cross-boundary normals.
 * No bottomless shell, doubled road surface or DoubleSide workaround. */
export function mountFrontRidgeR30(field:FrontRidgeR30Field){
 const group=new Group();group.name='town-d-r30-front-ridge';
 const texture=makeFrontRidgePixelTexture(),material=new MeshLambertMaterial({vertexColors:true,map:texture});
 const moss=new Color('#62765b'),snow=new Color('#dbe4e6');
 const geometries:BufferGeometry[]=[];
 for(let n0=B.south;n0<B.north;n0+=B.chunk)for(let e0=B.west;e0<B.east;e0+=B.chunk){
   const e1=Math.min(B.east,e0+B.chunk),n1=Math.min(B.north,n0+B.chunk),cols=e1-e0+1,rows=n1-n0+1;
   const p=new Float32Array(cols*rows*3),normal=new Float32Array(p.length),color=new Float32Array(p.length),uv=new Float32Array(cols*rows*2),indices:number[]=[];
   for(let n=n0;n<=n1;n++)for(let e=e0;e<=e1;e++){
     const i=(n-n0)*cols+e-e0,h=field.vertexAt(e,n),norm=field.normalAt(e,n);
     p.set([e,h,-n],i*3);normal.set(norm,i*3);
     const tint=frontRidgeSurfaceColorAt(e,n,h,1-norm[1]);
     const low=smooth((110-h)/86),patch=.3+.7*smooth((Math.sin(e*.061+n*.039)+Math.cos(n*.049-e*.024)+1.1)/2.4);
     tint.lerp(moss,low*patch*.46);
     const upper=smooth((h-238)/83),sheltered=smooth((norm[1]-.54)/.42);
     tint.lerp(snow,upper*sheltered*(.28+.60*patch));
     // Expose coherent broad drainage grooves and uphill wind pockets;
     // palette is the same existing rock/snow family.
     const shade=.91+.09*(.5+.5*Math.sin(e*.088+n*.023));
     tint.multiplyScalar(shade);color.set([tint.r,tint.g,tint.b],i*3);
     uv.set([e/2,(n*.84+h*.32)/2],i*2);
     if(e<e1&&n<n1)indices.push(i,i+1,i+cols,i+1,i+cols+1,i+cols);
   }
   const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(p,3));g.setAttribute('normal',new Float32BufferAttribute(normal,3));g.setAttribute('color',new Float32BufferAttribute(color,3));g.setAttribute('uv',new Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeBoundingSphere();
   const mesh=new Mesh(g,material);mesh.name='d-r30-ridge-'+e0+'-'+n0;group.add(mesh);geometries.push(g);
 }
 let disposed=false;
 return {group,field,dispose(){if(disposed)return;disposed=true;group.removeFromParent();group.clear();geometries.forEach(g=>g.dispose());texture.dispose();material.dispose()}};
}
