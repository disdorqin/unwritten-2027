import {Group,InstancedMesh,Mesh,MeshStandardMaterial,Object3D} from 'three';
/** Only fixed local children of each mechanism are instanced. Moving
 * parent pivots retain their motion, live leaves keep their identities,
 * and label meshes retain names/placement for the production contract. */
export function instanceWorkshopParts(root:Group,protectedLeaves:ReadonlySet<Object3D>,stableMaterials:ReadonlySet<MeshStandardMaterial>,compare=false){
 const batches:{original:Mesh[];mesh:InstancedMesh}[]=[];
 const parents:Object3D[]=[];root.traverse(o=>parents.push(o));
 for(const parent of parents){
  const byGeometry=new Map<string,Mesh[]>();
  for(const o of parent.children){
   if(!(o instanceof Mesh)||o instanceof InstancedMesh||o.children.length||o.name||!o.visible||protectedLeaves.has(o)||!(o.material instanceof MeshStandardMaterial)||!stableMaterials.has(o.material)||o.castShadow||o.onBeforeRender!==Object3D.prototype.onBeforeRender)continue;
   const key=o.geometry.uuid+'/'+o.material.uuid+'/'+o.layers.mask+'/'+o.receiveShadow+'/'+o.renderOrder;
   const bin=byGeometry.get(key)??[];bin.push(o);byGeometry.set(key,bin);
  }
  for(const originals of byGeometry.values()){
   if(originals.length<3)continue;
   const first=originals[0],mesh=new InstancedMesh(first.geometry,first.material,originals.length);
   mesh.name='p2-workshop-local-instances';mesh.layers.mask=first.layers.mask;mesh.receiveShadow=first.receiveShadow;mesh.renderOrder=first.renderOrder;
   for(let i=0;i<originals.length;i++){originals[i].updateMatrix();mesh.setMatrixAt(i,originals[i].matrix);}
   mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();parent.add(mesh);batches.push({original:originals,mesh});
   if(!compare)for(const o of originals)o.removeFromParent();
  }
 }
 function setEnabled(on:boolean){for(const b of batches){b.mesh.visible=on;if(compare)for(const o of b.original)o.visible=!on;}}
 setEnabled(!compare);
 const onControl=(e:Event)=>{const d=(e as CustomEvent<{enabled:boolean;p2Enabled?:boolean}>).detail;setEnabled(d?.p2Enabled??!!d?.enabled);};
 if(compare)document.addEventListener('town-p1-perf-control',onControl);
 return {before:batches.reduce((n,b)=>n+b.original.length,0),after:batches.length,dispose(){if(compare)document.removeEventListener('town-p1-perf-control',onControl);for(const b of batches)b.mesh.dispose();}};
}
