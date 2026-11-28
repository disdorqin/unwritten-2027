import {BufferGeometry,Float32BufferAttribute,Group,Mesh,MeshStandardMaterial,DoubleSide} from 'three';
import type {HikingFoot,HikingSurface} from './town-a32-summit-hiking';
/** Trail paint is only a wayfinding layer, never a floor/collider. Each
 * small chevron is seated on the same final support the walking probe reads.
 * Skip paint where the footprint is not clear, rather than drawing a bridge. */
export function mountHikingGuides(host:HikingSurface,path:readonly HikingFoot[]){
 const group=new Group();group.name='a32-certified-hiking-guides';
 const mat=new MeshStandardMaterial({color:'#efbc6a',emissive:'#89521e',emissiveIntensity:.30,roughness:.9,side:DoubleSide,polygonOffset:true,polygonOffsetFactor:-2});
 const chunks=new Map<string,number[]>();let markers=0,skipped=0,carry=0,metres=0;
 for(let i=1;i<path.length;i++){
  const a=path[i-1]!,b=path[i]!,de=b.east-a.east,dn=b.north-a.north,d=Math.hypot(de,dn);
  if(d<1e-8)continue;
  const ue=de/d,un=dn/d;
  for(let s=carry;s<d;s+=4){
   if(metres+s<3)continue;
   const e=a.east+ue*s,n=a.north+un*s,h=host.supportAt(e,n);
   if(h===undefined||host.blocked(e,n,h,.27,1.8)){skipped++;continue;}
   // A symmetric double chevron supports the same wayfinding on return.
   const verts: number[]=[];
   for(const dir of [-1,1])for(const side of [-1,1]){
    for(const [along,across] of [[dir*.44,0],[-dir*.04,side*.33],[-dir*.13,side*.20]]){
     const x=e+ue*along!-un*across!,z=n+un*along!+ue*across!,y=host.supportAt(x,z);
     if(y===undefined||!Number.isFinite(y)||Math.abs(y-h)>.40||host.blocked(x,z,y,.06,1.8))continue;
     verts.push(x,y+.035,-z);
    }
   }
   if(verts.length!==36){skipped++;continue;}
   const key=Math.floor(e/96)+','+Math.floor(n/96),bin=chunks.get(key)??[];bin.push(...verts);chunks.set(key,bin);markers++;
  }
  carry=(carry-d)%4;if(carry<0)carry+=4;metres+=d;
 }
 for(const [key,vertices] of chunks){
  const geo=new BufferGeometry();geo.setAttribute('position',new Float32BufferAttribute(vertices,3));geo.computeVertexNormals();geo.computeBoundingSphere();
  const mesh=new Mesh(geo,mat);mesh.name='hiking-guide:'+key;group.add(mesh);
 }
 group.userData={visualOnly:true,includesWorldCollision:false,markers,skipped,length:metres};
 let disposed=false;
 return {group,markers,skipped,dispose(){if(disposed)return;disposed=true;group.removeFromParent();for(const mesh of group.children)if((mesh as Mesh).isMesh)(mesh as Mesh).geometry.dispose();mat.dispose();group.clear();}};
}
