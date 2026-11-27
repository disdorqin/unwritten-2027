import {Box3,Camera,Color,Frustum,Group,InstancedBufferAttribute,InstancedMesh,Material,Matrix4,MeshBasicMaterial,MeshLambertMaterial,MeshStandardMaterial,Object3D,Sphere,StaticDrawUsage,Vector3} from 'three';
import {sphereBehindCraterWall} from './town-r30-crater-perf-occlusion';
type Ring=Parameters<typeof sphereBehindCraterWall>[0];
type Chunk={mesh:InstancedMesh;box:Box3;count:number};
type Source={mesh:InstancedMesh;chunks:Chunk[];matrixVersion:number;colorVersion:number;count:number;geometry:InstancedMesh['geometry'];material:InstancedMesh['material'];matrixAttribute:InstancedMesh['instanceMatrix'];colorAttribute:InstancedMesh['instanceColor']};
const ordinary=(m:Material)=> (m instanceof MeshStandardMaterial||m instanceof MeshLambertMaterial||m instanceof MeshBasicMaterial)&&!m.transparent&&!m.wireframe&&m.depthTest&&m.depthWrite&&!(m as MeshStandardMaterial).displacementMap&&m.onBeforeCompile===Material.prototype.onBeforeCompile;
function eligible(o:Object3D):o is InstancedMesh{
 return o instanceof InstancedMesh&&o.count>=24&&o.frustumCulled&&!o.castShadow&&!Array.isArray(o.material)&&ordinary(o.material)&&o.instanceMatrix.usage===StaticDrawUsage&&o.morphTexture===null&&
  !Object.values(o.geometry.attributes).some(a=>a instanceof InstancedBufferAttribute)&&!o.geometry.morphAttributes.position?.length&&
  o.onBeforeRender===Object3D.prototype.onBeforeRender&&o.onAfterRender===Object3D.prototype.onAfterRender;
}
/** Exact static instance partition. Source is never removed or modified;
 * child cells share the original material/geometry and carry exact matrices
 * and colors. Source mutations fail open, and source owns all resources. */
export function createCraterInstanceCells(cellSize=32,maxExtraDraws=36){
 if(!Number.isFinite(cellSize)||cellSize<=0||!Number.isInteger(maxExtraDraws)||maxExtraDraws<0)throw Error('Invalid instance cell budget');
 const sources:Source[]=[],seen=new Set<InstancedMesh>(),masked:{object:InstancedMesh;mask:number}[]=[],active:InstancedMesh[]=[];
 const frustum=new Frustum(),vp=new Matrix4(),matrix=new Matrix4(),sphere=new Sphere(),box=new Box3(),eye=new Vector3();
 let last={sources:0,submitted:0,savedInstances:0,extraDraws:0};
 function restore(){for(const m of masked)m.object.layers.mask=m.mask;masked.length=0;for(const m of active)m.visible=false;active.length=0;}
 function register(roots:readonly Object3D[]){
  const candidates:InstancedMesh[]=[];
  for(const root of roots)root.traverse(o=>{if(eligible(o)&&!seen.has(o)&&!o.userData.p2InstanceCell){seen.add(o);candidates.push(o);}});
  for(const source of candidates){
   const g=source.geometry;if(!g.boundingBox)g.computeBoundingBox();if(!g.boundingBox)continue;
   const bins=new Map<string,number[]>(),center=new Vector3(),tint=new Color();
   for(let i=0;i<source.count;i++){
    source.getMatrixAt(i,matrix);if(matrix.determinant()<=0){bins.clear();break;}
    center.setFromMatrixPosition(matrix);const k=Math.floor(center.x/cellSize)+','+Math.floor(center.z/cellSize);
    const a=bins.get(k)??[];a.push(i);bins.set(k,a);
   }
   if(bins.size<2||bins.size>256)continue;
   const chunks:Chunk[]=[];
   for(const indices of bins.values()){
    const mesh=new InstancedMesh(g,source.material,indices.length);mesh.name='p2-instance-cell';mesh.userData.p2InstanceCell=true;
    mesh.layers.mask=source.layers.mask;mesh.receiveShadow=source.receiveShadow;mesh.renderOrder=source.renderOrder;
    mesh.matrixAutoUpdate=false;mesh.visible=false;
    const local=new Box3();
    for(let i=0;i<indices.length;i++){
     source.getMatrixAt(indices[i],matrix);mesh.setMatrixAt(i,matrix);
     local.union(box.copy(g.boundingBox).applyMatrix4(matrix));
     if(source.instanceColor){source.getColorAt(indices[i],tint);mesh.setColorAt(i,tint);}
    }
    mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    mesh.boundingBox=local.clone();mesh.boundingSphere=local.getBoundingSphere(new Sphere());
    source.add(mesh);chunks.push({mesh,box:local,count:indices.length});
   }
   sources.push({mesh:source,chunks,matrixVersion:source.instanceMatrix.version,colorVersion:source.instanceColor?.version??-1,count:source.count,geometry:source.geometry,material:source.material,matrixAttribute:source.instanceMatrix,colorAttribute:source.instanceColor});
  }
 }
 function begin(camera:Camera,ring?:Ring){
  restore();last={sources:0,submitted:0,savedInstances:0,extraDraws:0};eye.setFromMatrixPosition(camera.matrixWorld);
  frustum.setFromProjectionMatrix(vp.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
  // Highest triangle savings first, under a strict extra submission budget.
  const choices:{s:Source;cells:Chunk[];saved:number;tris:number}[]=[];
  for(const s of sources){
   const m=s.mesh;if(!m.parent||!m.visible||!camera.layers.test(m.layers)||m.count!==s.count||m.geometry!==s.geometry||m.material!==s.material||m.instanceMatrix!==s.matrixAttribute||m.instanceColor!==s.colorAttribute||m.instanceMatrix.version!==s.matrixVersion||(m.instanceColor?.version??-1)!==s.colorVersion||!eligible(m))continue;
   let ancestor:Object3D|null=m.parent;while(ancestor&&ancestor.visible)ancestor=ancestor.parent;if(ancestor)continue;
   if(!m.boundingSphere)m.computeBoundingSphere();
   if(m.boundingSphere&&!frustum.intersectsSphere(sphere.copy(m.boundingSphere).applyMatrix4(m.matrixWorld)))continue;
   const cells:Chunk[]=[];let n=0;
   for(const c of s.chunks){box.copy(c.box).applyMatrix4(m.matrixWorld);if(!frustum.intersectsBox(box))continue;
    box.getBoundingSphere(sphere);if(ring&&sphereBehindCraterWall(ring,eye,sphere))continue;cells.push(c);n+=c.count;}
   const saved=s.count-n,triangles=(m.geometry.index?.count??m.geometry.getAttribute('position').count)/3;
   if(saved>0&&(cells.length<=1||saved>=s.count*.30))choices.push({s,cells,saved,tris:saved*triangles});
  }
  choices.sort((a,b)=>b.tris-a.tris);
  for(const {s,cells,saved} of choices){
   const extra=Math.max(0,cells.length-1);if(last.extraDraws+extra>maxExtraDraws)continue;
   masked.push({object:s.mesh,mask:s.mesh.layers.mask});s.mesh.layers.mask=0;
   for(const c of cells){c.mesh.layers.mask=masked.at(-1)!.mask;c.mesh.visible=true;active.push(c.mesh);}
   last.sources++;last.submitted+=cells.length;last.savedInstances+=saved;last.extraDraws+=extra;
  }
  return last;
 }
 function dispose(){restore();for(const s of sources)for(const c of s.chunks){c.mesh.removeFromParent();c.mesh.dispose();}sources.length=0;seen.clear();}
 return {register,begin,restore,dispose,get sourceCount(){return sources.length;},get stats(){return last;}};
}
