import {Group,InstancedMesh,Mesh,MeshStandardMaterial} from 'three';
type StateSet={leaves:readonly Mesh[];materials:readonly MeshStandardMaterial[]};
/** Batch explicitly declared mechanical presentation leaves. Original
 * Mesh identities, visible flags and materials remain the state projection;
 * only their render layers are replaced. No interaction or rule is owned. */
export function instanceWorkshopStateParts(sets:readonly StateSet[],compare=false){
 const batches:{leaves:readonly Mesh[];masks:number[];proxies:InstancedMesh[];materials:readonly MeshStandardMaterial[];signature:string}[]=[];
 let enabled=!compare;
 for(const {leaves,materials} of sets){
  if(leaves.length<2||!materials.length)continue;
  const first=leaves[0],parent=first.parent;
  if(!(parent instanceof Group)||leaves.some(m=>m.parent!==parent||m.geometry!==first.geometry||m.layers.mask!==first.layers.mask||m.castShadow||m.receiveShadow!==first.receiveShadow||m.renderOrder!==first.renderOrder||m.children.length))throw Error('Invalid state instance set');
  const proxies=materials.map(mat=>{
   const m=new InstancedMesh(first.geometry,mat,leaves.length);m.name='p3-workshop-state-instance';m.userData.p3WorkshopState=true;
   m.layers.mask=first.layers.mask;m.receiveShadow=first.receiveShadow;m.renderOrder=first.renderOrder;m.visible=false;
   leaves.forEach((leaf,i)=>{leaf.updateMatrix();m.setMatrixAt(i,leaf.matrix);});m.computeBoundingSphere();
   m.count=0;parent.add(m);return m;
  });
  batches.push({leaves,masks:leaves.map(m=>m.layers.mask),proxies,materials,signature:''});
 }
 function sync(){
  for(const b of batches){
   const sig=b.leaves.map(m=>m.visible?b.materials.indexOf(m.material as MeshStandardMaterial):-2);
   const safe=enabled&&sig.every(i=>i!==-1);
   const key=(safe?'1:':'0:')+sig.join(',');
   if(key===b.signature)continue;b.signature=key;
   b.leaves.forEach((m,i)=>{m.layers.mask=safe?0:b.masks[i];});
   for(let i=0;i<b.proxies.length;i++){
    const p=b.proxies[i];let count=0;
    if(safe)for(let j=0;j<b.leaves.length;j++)if(sig[j]===i){const leaf=b.leaves[j];leaf.updateMatrix();p.setMatrixAt(count++,leaf.matrix);}
    p.count=count;p.visible=count>0;p.instanceMatrix.needsUpdate=true;
   }
  }
 }
 const onControl=(e:Event)=>{const d=(e as CustomEvent<{enabled:boolean;p2Enabled?:boolean;p3Enabled?:boolean}>).detail;enabled=d?.p3Enabled??d?.p2Enabled??!!d?.enabled;sync();};
 if(compare)document.addEventListener('town-p1-perf-control',onControl);
 sync();
 return {sync,get sourceCount(){return batches.reduce((a,b)=>a+b.leaves.length,0)},get visibleDraws(){return batches.reduce((a,b)=>a+b.proxies.filter(p=>p.visible).length,0)},dispose(){if(compare)document.removeEventListener('town-p1-perf-control',onControl);for(const b of batches){b.leaves.forEach((m,i)=>m.layers.mask=b.masks[i]);for(const p of b.proxies){p.removeFromParent();p.dispose();}}}};
}
