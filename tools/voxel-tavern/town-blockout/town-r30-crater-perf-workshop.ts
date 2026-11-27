import {BufferAttribute,BufferGeometry,Group,InstancedMesh,Material,Mesh,MeshStandardMaterial,Object3D} from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
/** Only fixed local children of each mechanism are instanced. Moving
 * parent pivots retain their motion, live leaves keep their identities,
 * and label meshes retain names/placement for the production contract. */
export function instanceWorkshopParts(root:Group,protectedLeaves:ReadonlySet<Object3D>,stableMaterials:ReadonlySet<MeshStandardMaterial>,compare=false){
 const batches:{original:Mesh[];mesh:InstancedMesh|Mesh;ownsGeometry?:boolean}[]=[];
 const parents:Object3D[]=[];root.traverse(o=>parents.push(o));
 for(const parent of parents){
  const byGeometry=new Map<string,Mesh[]>();
  for(const o of parent.children){
   if(!(o instanceof Mesh)||o instanceof InstancedMesh||o.children.length||o.name||!o.visible||protectedLeaves.has(o)||!(o.material instanceof MeshStandardMaterial)||!stableMaterials.has(o.material)||o.castShadow||o.onBeforeRender!==Object3D.prototype.onBeforeRender)continue;
   const key=o.geometry.uuid+'/'+o.material.uuid+'/'+o.layers.mask+'/'+o.receiveShadow+'/'+o.renderOrder;
   const bin=byGeometry.get(key)??[];bin.push(o);byGeometry.set(key,bin);
  }
  for(const originals of byGeometry.values()){
   if(originals.length<2)continue;
   const first=originals[0],mesh=new InstancedMesh(first.geometry,first.material,originals.length);
   mesh.name='p2-workshop-local-instances';mesh.layers.mask=first.layers.mask;mesh.receiveShadow=first.receiveShadow;mesh.renderOrder=first.renderOrder;
   for(let i=0;i<originals.length;i++){originals[i].updateMatrix();mesh.setMatrixAt(i,originals[i].matrix);}
   mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();parent.add(mesh);batches.push({original:originals,mesh});
   if(!compare)for(const o of originals)o.removeFromParent();
  }
  // Combine remaining fixed siblings of different geometry under the same
  // moving pivot, never a named/control/state leaf. No cross-pivot baking.
  const residual=new Map<string,Mesh[]>(),already=new Set(batches.flatMap(b=>b.original));
  for(const o of parent.children){
   if(!(o instanceof Mesh)||o instanceof InstancedMesh||o.children.length||o.name||!o.visible||already.has(o)||protectedLeaves.has(o)||!(o.material instanceof MeshStandardMaterial)||!stableMaterials.has(o.material)||o.castShadow||o.onBeforeRender!==Object3D.prototype.onBeforeRender||o.onAfterRender!==Object3D.prototype.onAfterRender||o.material.transparent||o.material.displacementMap||o.material.onBeforeCompile!==Material.prototype.onBeforeCompile)continue;
   const g=o.geometry as BufferGeometry,p=g.getAttribute('position');if(!p||Object.keys(g.morphAttributes).length||g.drawRange.start!==0||g.drawRange.count<(g.index?.count??p.count)||Object.values(g.attributes).some(a=>!(a instanceof BufferAttribute)))continue;
   o.updateMatrix();if(o.matrix.determinant()<=0)continue;
   const key=[o.material.uuid,o.layers.mask,o.receiveShadow,o.renderOrder,o.frustumCulled,!!g.index,Object.entries(g.attributes).sort(([a],[b])=>a.localeCompare(b)).map(([n,a])=>n+':'+a.itemSize+':'+a.normalized+':'+a.array.constructor.name).join('|')].join('/');
   const list=residual.get(key)??[];list.push(o);residual.set(key,list);
  }
  for(const originals of residual.values()){
   if(originals.length<2)continue;const clones=originals.map(o=>o.geometry.clone().applyMatrix4(o.matrix));const g=mergeGeometries(clones);clones.forEach(c=>c.dispose());if(!g)continue;
   const first=originals[0],m=new Mesh(g,first.material);m.name='p4-workshop-fixed-merge';m.layers.mask=first.layers.mask;m.receiveShadow=first.receiveShadow;m.renderOrder=first.renderOrder;m.frustumCulled=first.frustumCulled;g.computeBoundingSphere();parent.add(m);batches.push({original:originals,mesh:m,ownsGeometry:true});if(!compare)for(const o of originals)o.removeFromParent();
  }
 }
 function setEnabled(on:boolean){for(const b of batches){b.mesh.visible=on;if(compare)for(const o of b.original)o.visible=!on;}}
 setEnabled(!compare);
 const onControl=(e:Event)=>{const d=(e as CustomEvent<{enabled:boolean;p2Enabled?:boolean}>).detail;setEnabled(d?.p2Enabled??!!d?.enabled);};
 if(compare)document.addEventListener('town-p1-perf-control',onControl);
 return {before:batches.reduce((n,b)=>n+b.original.length,0),after:batches.length,dispose(){if(compare)document.removeEventListener('town-p1-perf-control',onControl);for(const b of batches){if(b.mesh instanceof InstancedMesh)b.mesh.dispose();if(b.ownsGeometry)b.mesh.geometry.dispose();}}};
}
