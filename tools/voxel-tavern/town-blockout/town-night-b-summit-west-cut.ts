import {BufferGeometry,Float32BufferAttribute} from 'three';
import {buildMainSummitTrailCut} from './main-summit-trail-cut';
const cell=32;
type Vertex={x:number;z:number;r:number;g:number;b:number};
type Triangle=readonly [Vertex,Vertex,Vertex];
const key=(x:number,z:number)=>Math.floor(x/cell)+','+Math.floor(z/cell);
const cross=(a:Vertex,b:Vertex,x:number,z:number)=>(b.x-a.x)*(z-a.z)-(b.z-a.z)*(x-a.x);
/** Preserve the actual terrain palette when the original P3 cutter splits
 * source triangles. No second layer, no flat fallback material. The D2
 * geometry owner installs the returned buffer and disposes the old one. */
export function cutNightBWestTerrain(source:BufferGeometry,tread:BufferGeometry){
 if(!source.boundingBox)source.computeBoundingBox();
 if(!tread.boundingBox)tread.computeBoundingBox();
 const a=source.boundingBox!,b=tread.boundingBox!;
 if(a.max.x<b.min.x||a.min.x>b.max.x||a.max.z<b.min.z||a.min.z>b.max.z)return {geometry:source,refinedTriangles:0,loweredVertices:0};
 const pos=source.getAttribute('position'),color=source.getAttribute('color'),index=source.getIndex();
 if(!color||color.itemSize!==3||color.count!==pos.count||!index)throw new TypeError('West cut requires indexed canonical vertex colors');
 const result=buildMainSummitTrailCut(source,tread);
 if(!result.refinedTriangles){result.geometry.dispose();return {...result,geometry:source};}
 try{
  const vertices:Vertex[]=Array.from({length:pos.count},(_,i)=>({x:pos.getX(i),z:pos.getZ(i),r:color.getX(i),g:color.getY(i),b:color.getZ(i)}));
  const buckets=new Map<string,Triangle[]>();
  for(let i=0;i<index.count;i+=3){
   const t=[vertices[index.getX(i)]!,vertices[index.getX(i+1)]!,vertices[index.getX(i+2)]!] as const;
   if(Math.abs(cross(t[0],t[1],t[2].x,t[2].z))<1e-9)continue;
   const minX=Math.min(...t.map(v=>v.x)),maxX=Math.max(...t.map(v=>v.x)),minZ=Math.min(...t.map(v=>v.z)),maxZ=Math.max(...t.map(v=>v.z));
   for(let x=Math.floor((minX-.002)/cell);x<=Math.floor((maxX+.002)/cell);x++)for(let z=Math.floor((minZ-.002)/cell);z<=Math.floor((maxZ+.002)/cell);z++){
    const k=x+','+z,bucket=buckets.get(k)??[];bucket.push(t);buckets.set(k,bucket);
   }
  }
  const out=result.geometry.getAttribute('position'),rgb:number[]=[];
  for(let i=0;i<out.count;i++){
   const x=out.getX(i),z=out.getZ(i);let selected:{t:Triangle;u:number;v:number;w:number;error:number}|undefined;
   for(const t of buckets.get(key(x,z))??[]){
    const [a,b,c]=t,d=cross(a,b,c.x,c.z),u=cross(b,c,x,z)/d,v=cross(c,a,x,z)/d,w=1-u-v,error=Math.max(0,-u,-v,-w);
    if(error<=.0002&&(!selected||error<selected.error))selected={t,u,v,w,error};
    if(error===0)break;
   }
   if(!selected)throw new Error('West cut color lacks original terrain triangle at '+[x,z]);
   const {t,u,v,w}=selected;
   for(const k of ['r','g','b'] as const)rgb.push(t[0][k]*u+t[1][k]*v+t[2][k]*w);
  }
  result.geometry.setAttribute('color',new Float32BufferAttribute(rgb,3));result.geometry.name=source.name+'-west-cut';result.geometry.userData={...source.userData};
  return result;
 }catch(error){result.geometry.dispose();throw error;}
}
