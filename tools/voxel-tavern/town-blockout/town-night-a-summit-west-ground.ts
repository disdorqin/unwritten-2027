import {BufferGeometry,Color,Float32BufferAttribute,Group,Mesh,MeshLambertMaterial} from 'three';
import type {SouthGround} from './town-night-a-summit-landform';
import {westNorthConnectorBounds} from './town-a-r30-north-connector';
type Bounds={west:number;east:number;south:number;north:number};
type EN=Readonly<{east:number;north:number}>;
/** Same track reservation in the native route and real viewer. */
export function westMountainTrackProtection(tracks:readonly (readonly EN[])[]){
 const cells=new Map<string,EN[]>();
 for(const track of tracks)for(const p of track){
  const k=Math.floor(p.east/16)+','+Math.floor(p.north/16),v=cells.get(k)??[];v.push(p);cells.set(k,v);
 }
 return (e:number,n:number)=>{
  const x=Math.floor(e/16),z=Math.floor(n/16);
  for(let i=x-1;i<=x+1;i++)for(let j=z-1;j<=z+1;j++)if(cells.get(i+','+j)?.some(p=>Math.hypot(e-p.east,n-p.north)<12))return true;
  return false;
 };
}
const smooth=(v:number)=>{const t=Math.max(0,Math.min(1,v));return t*t*(3-2*t);};
/** Fill only the missing part of the surveyed west carrier. Preserve
 * the existing crater and 64m rail strip. Mesh and support share one
 * cached Float32 raster; there is no visual-only terrain. */
export function mountWestMountainGround(base:SouthGround,bounds:Bounds,protectedAt:(e:number,n:number)=>boolean){
 const {west,east,south,north}=bounds;
 if(![west,east,south,north].every(Number.isInteger)||east!==0||south!==westNorthConnectorBounds.south||north<=south||west>=westNorthConnectorBounds.west)throw Error('Invalid surveyed west terrain bounds');
 const strip=westNorthConnectorBounds;
 const group=new Group();group.name='night-a-west-mountain-real-ground';
 const material=new MeshLambertMaterial({vertexColors:true});
 const width=east-west+1,depth=north-south+1,heights=new Float32Array(width*depth);
 const id=(e:number,n:number)=>(n-south)*width+e-west;
 const ownsCell=(e:number,n:number)=>e>=west&&e<east&&n>=south&&n<north&&!(e>=strip.west&&n<strip.north);
 function ownedVertex(e:number,n:number){
  return e>west&&e<east&&n>south&&n<north&&!(e>=strip.west&&n<=strip.north);
 }
 for(let n=south;n<=north;n++)for(let e=west;e<=east;e++){
  const h=base(e,n);if(h===undefined||!Number.isFinite(h))throw Error('Missing source sample E'+e+' N'+n);
  const dStrip=Math.hypot(Math.max(strip.west-e,0),Math.max(n-strip.north,0));
  const d=Math.min(e-west,east-e,n-south,north-n,dStrip);
  const mask=ownedVertex(e,n)&&!protectedAt(e,n)?smooth(d/32):0;
  const broad=5.2*Math.exp(-(((e+165)/74)**2)-(((n-470)/95)**2))+3.6*Math.exp(-(((e+104)/68)**2)-(((n-664)/113)**2));
  const ravine=-1.9*Math.exp(-(((e+115-18*Math.sin(n*.014))/24)**2));
  const roll=1.1*Math.sin(e*.083+n*.028)*Math.cos(n*.046);
  heights[id(e,n)]=h+mask*(broad+ravine+roll);
 }
 const snow=new Color('#c5d2dc'),rock=new Color('#777f80'),tint=new Color();
 let cells=0;
 for(let n0=south;n0<north;n0+=64)for(let e0=west;e0<east;e0+=64){
  const n1=Math.min(north,n0+64),e1=Math.min(east,e0+64),cols=e1-e0+1;
  const positions:number[]=[],colors:number[]=[],indices:number[]=[];
  for(let n=n0;n<=n1;n++)for(let e=e0;e<=e1;e++){
   const h=heights[id(e,n)]!;positions.push(e,h,-n);
   const slope=Math.hypot(heights[id(Math.min(east,e+1),n)]!-heights[id(Math.max(west,e-1),n)]!,heights[id(e,Math.min(north,n+1))]!-heights[id(e,Math.max(south,n-1))]!)*.5;
   tint.copy(snow).lerp(rock,Math.min(.56,slope*.75)).multiplyScalar(.96+.04*Math.sin(e*.27+n*.19));colors.push(tint.r,tint.g,tint.b);
   if(e===e1||n===n1||!ownsCell(e,n))continue;
   const a=(n-n0)*cols+e-e0,b=a+1,c=a+cols,d=c+1;indices.push(a,b,c,b,d,c);cells++;
  }
  if(!indices.length)continue;
  const geo=new BufferGeometry();geo.setAttribute('position',new Float32BufferAttribute(positions,3));geo.setAttribute('color',new Float32BufferAttribute(colors,3));geo.setIndex(indices);geo.computeVertexNormals();geo.computeBoundingSphere();
  const mesh=new Mesh(geo,material);mesh.name='west-mountain-ground:'+e0+','+n0;group.add(mesh);
 }
 const readyAt=(e:number,n:number)=>Number.isFinite(e)&&Number.isFinite(n)&&e>=west&&e<=east&&n>=south&&n<=north&&(e<=strip.west||n>=strip.north);
 function heightAt(e:number,n:number){
  if(!readyAt(e,n))return;
  const x=Math.min(east-1,Math.floor(e)),z=Math.min(north-1,Math.floor(n)),u=e-x,v=n-z;
  const a=heights[id(x,z)]!,b=heights[id(x+1,z)]!,c=heights[id(x,z+1)]!,d=heights[id(x+1,z+1)]!;
  return u+v<=1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v);
 }
 let disposed=false;
 return {group,readyAt,heightAt,ownsCell,stats:{cells,triangles:cells*2,chunks:group.children.length},dispose(){if(disposed)return;disposed=true;group.removeFromParent();group.traverse(o=>{if(o instanceof Mesh)o.geometry.dispose();});material.dispose();group.clear();}};
}
