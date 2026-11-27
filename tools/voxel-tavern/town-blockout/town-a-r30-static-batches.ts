import {BufferAttribute,BufferGeometry,Mesh,type Group,type Material} from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

/** Preserve authored vertices, normals, UVs and winding. Geometry is
 * consumed by this builder; materials remain owned by the scene. */
function indexed(g:BufferGeometry){
 if(!g.index){const count=g.getAttribute('position').count;
  const index=count>65535?new Uint32Array(count):new Uint16Array(count);
  for(let i=0;i<count;i++)index[i]=i;
  g.setIndex(new BufferAttribute(index,1));
 }
 return g;
}
function partition(g:BufferGeometry,cell:number){
 indexed(g);const p=g.getAttribute('position'),index=g.index!;
 g.computeBoundingBox();const bounds=g.boundingBox!;
 // A small prop belongs to one cell; long strips must actually split,
 // otherwise the large bounding sphere defeats the whole optimization.
 const key=(e:number,z:number)=>Math.floor(e/cell)+','+Math.floor(-z/cell);
 if(bounds.max.x-bounds.min.x<=cell*.75&&bounds.max.z-bounds.min.z<=cell*.75)
  return [[key((bounds.min.x+bounds.max.x)/2,(bounds.min.z+bounds.max.z)/2),g] as const];
 const bins=new Map<string,number[]>();
 for(let i=0;i<index.count;i+=3){
  const a=index.getX(i),b=index.getX(i+1),c=index.getX(i+2);
  const k=key((p.getX(a)+p.getX(b)+p.getX(c))/3,(p.getZ(a)+p.getZ(b)+p.getZ(c))/3);
  const list=bins.get(k)??[];list.push(a,b,c);bins.set(k,list);
 }
 if(bins.size===1)return [[bins.keys().next().value!,g] as const];
 const out:[string,BufferGeometry][]=[];
 for(const [k,oldIndex] of bins){
  const map=new Map<number,number>(),oldVertices:number[]=[],indices:number[]=[];
  for(const old of oldIndex){let v=map.get(old);if(v===undefined){v=oldVertices.length;map.set(old,v);oldVertices.push(old);}indices.push(v);}
  const next=new BufferGeometry();
  for(const [name,attr] of Object.entries(g.attributes)){
   if(!(attr instanceof BufferAttribute)&&('isInterleavedBufferAttribute' in attr&&attr.isInterleavedBufferAttribute))throw Error('Static batch requires ordinary attributes');
   const size=attr.itemSize,src=attr.array;
   const ArrayType=src.constructor as {new(length:number):typeof src};
   const dst=new ArrayType(oldVertices.length*size);
   for(let i=0;i<oldVertices.length;i++)for(let j=0;j<size;j++)dst[i*size+j]=src[oldVertices[i]!*size+j]!;
   next.setAttribute(name,new BufferAttribute(dst,size,attr.normalized));
  }
  next.setIndex(indices);out.push([k,next]);
 }
 g.dispose();return out;
}
/** Spatially cull long static networks while preserving triangle topology.
 * Small batches stay material-merged when cellSize is omitted. */
export function mountAR30StaticBatches<M extends Material>(group:Group,batches:Map<M,BufferGeometry[]>,prefix:string,cellSize?:number,maxDraws=Infinity){
 let existing=0;group.traverse(o=>{if((o as Mesh).isMesh)existing++;});
 // Preserve the original one-mesh-per-material baseline, then spend only
 // the available extra draws on spatial culling. Count existing signs too.
 let extra=Math.max(0,maxDraws-existing-batches.size);
 for(const [mat,parts] of batches){
  const bins=new Map<string,BufferGeometry[]>();
  // Keep small material batches whole: spatial subdivision of a few
  // screws/signs costs more draw calls than it saves in vertex work.
  const triangles=parts.reduce((n,g)=>n+(g.index?.count??g.getAttribute('position').count)/3,0);
  const spatial=cellSize&&triangles>=12000&&extra>0?cellSize:undefined;
  for(const part of parts){
   const entries=spatial?partition(part,spatial):[['all',indexed(part)] as const];
   for(const [k,g] of entries){const list=bins.get(k)??[];list.push(g);bins.set(k,list);}
  }
  // Coalesce nearest cells until the legacy draw budget is respected.
  // No triangles are removed; the only tradeoff is culling granularity.
  while(bins.size>extra+1){
   const keys=[...bins.keys()];let pair=[keys[0]!,keys[1]!],best=Infinity;
   for(let i=0;i<keys.length;i++)for(let j=i+1;j<keys.length;j++){
    const [ae,an]=keys[i]!.split(',').map(Number),[be,bn]=keys[j]!.split(',').map(Number);
    const d=(ae!-be!)**2+(an!-bn!)**2;
    if(d<best){best=d;pair=[keys[i]!,keys[j]!];}
   }
   bins.get(pair[0]!)!.push(...bins.get(pair[1]!)!);bins.delete(pair[1]!);
  }
  extra-=Math.max(0,bins.size-1);
  for(const [k,geos] of bins){
   const merged=mergeGeometries(geos);
   for(const g of geos)g.dispose();
   if(!merged)throw Error('Incompatible static batch '+prefix+'/'+k);
   merged.computeBoundingSphere();
   const mesh=new Mesh(merged,mat);mesh.name=prefix+'-'+mat.uuid.slice(0,6)+'-'+k;group.add(mesh);
  }
 }
 batches.clear();
}
