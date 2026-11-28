import {Color,InstancedMesh,Matrix4,Mesh,type Group} from 'three';

/** The four sector packages own their own ground-facing art. Restrict the
 * explicitly visual-only legacy D2 road and lowland forest to D2's central
 * quadrant. Never modify the authoritative terrain or the sector meshes.
 * Preserve original index/colour storage for D2's own material night hooks. */
export function retireA31LegacySectorOverlays(root:Group){
 const central=(e:number,n:number)=>n>=480&&e>=-300&&e<300;
 let triangles=0,instances=0;
 const remaps:{mesh:InstancedMesh;keep:number[]}[]=[];
 const trail=root.getObjectByName('town-d2-r30-trail-support');
 if(trail?.userData.visualOnly===true&&trail.userData.includesWorldCollision===false){
  trail.traverse(node=>{
   if(!(node instanceof Mesh)||node instanceof InstancedMesh)return;
   const g=node.geometry,index=g.getIndex(),p=g.getAttribute('position');
   if(!index||!p)return;
   const kept:number[]=[];
   for(let i=0;i+2<index.count;i+=3){
    const a=index.getX(i),b=index.getX(i+1),c=index.getX(i+2);
    const e=(p.getX(a)+p.getX(b)+p.getX(c))/3,n=-(p.getZ(a)+p.getZ(b)+p.getZ(c))/3;
    if(central(e,n))kept.push(a,b,c);else triangles++;
   }
   g.setIndex(kept);node.visible=kept.length>0;
  });
 }
 const forest=root.getObjectByName('town-d2-r30-lowland-forest');
 if(forest?.userData.visualOnly===true&&forest.userData.includesWorldCollision===false){
  const matrix=new Matrix4(),color=new Color();
  forest.traverse(node=>{
   if(!(node instanceof InstancedMesh))return;
   const keep:number[]=[],count=node.count;
   for(let i=0;i<count;i++){
    node.getMatrixAt(i,matrix);
    if(!central(matrix.elements[12]!,-matrix.elements[14]!))continue;
    const at=keep.length;keep.push(i);node.setMatrixAt(at,matrix);
    if(node.instanceColor){node.getColorAt(i,color);node.setColorAt(at,color);}
   }
   instances+=count-keep.length;node.count=keep.length;node.visible=keep.length>0;
   node.instanceMatrix.needsUpdate=true;if(node.instanceColor)node.instanceColor.needsUpdate=true;
   if(keep.length)node.computeBoundingSphere();
   remaps.push({mesh:node,keep});
  });
 }
 return {removedTrailTriangles:triangles,removedForestInstances:instances,
  /** D2 setNight rewrites the full original colour buffer on a change. */
  afterNightChange(){
   for(const {mesh,keep} of remaps){
    const rgb=mesh.instanceColor;if(!rgb)continue;
    const full=Float32Array.from(rgb.array);
    for(const [i,j] of keep.entries())rgb.setXYZ(i,full[3*j]!,full[3*j+1]!,full[3*j+2]!);
    rgb.needsUpdate=true;
   }
  }};
}
