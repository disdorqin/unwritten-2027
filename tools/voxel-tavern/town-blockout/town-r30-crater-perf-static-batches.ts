import {BufferAttribute,BufferGeometry,Camera,Frustum,Material,Matrix4,Mesh,MeshBasicMaterial,MeshLambertMaterial,MeshStandardMaterial,Object3D,Sphere,Vector3} from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
type Leaf={mesh:Mesh;world:Matrix4;geometry:BufferGeometry;material:Material;mask:number;tris:number;version:string;attributes:Record<string,unknown>;index:BufferGeometry['index'];receiveShadow:boolean;renderOrder:number;sphere:Sphere};
type Job={root:Object3D;leaves:Leaf[]};
type Batch=Job&{proxy:Mesh;rootWorld:Matrix4};
const version=(g:BufferGeometry)=>[g.index?.version,...Object.values(g.attributes).map(a=>a instanceof BufferAttribute?a.version:-1)].join('/');
const triangles=(g:BufferGeometry)=>(g.index?.count??g.getAttribute('position').count)/3;
function safe(o:Object3D):o is Mesh{
 if(!(o instanceof Mesh)||o.children.length||o.userData.p3MeshBatch||!o.frustumCulled||o.castShadow||o.onBeforeRender!==Object3D.prototype.onBeforeRender||o.onAfterRender!==Object3D.prototype.onAfterRender)return false;
 const f=o as Mesh&{isInstancedMesh?:boolean;isSkinnedMesh?:boolean;isBatchedMesh?:boolean};if(f.isInstancedMesh||f.isSkinnedMesh||f.isBatchedMesh)return false;
 const m=o.material,g=o.geometry;if(Array.isArray(m)||!(m instanceof MeshStandardMaterial||m instanceof MeshLambertMaterial||m instanceof MeshBasicMaterial)||m.transparent||m.wireframe||!m.depthWrite||!m.depthTest||m.clippingPlanes?.length||m.onBeforeCompile!==Material.prototype.onBeforeCompile||(m as MeshStandardMaterial).displacementMap||Object.keys(g.morphAttributes).length)return false;
 if(!g.getAttribute('position')||g.drawRange.start!==0||g.drawRange.count<(g.index?.count??g.getAttribute('position').count)||triangles(g)>512||triangles(g)<1||Object.values(g.attributes).some(a=>!(a instanceof BufferAttribute)))return false;
 return o.matrixWorld.determinant()>0;
}
function visible(o:Object3D){let p:Object3D|null=o;while(p){if(!p.visible)return false;p=p.parent;}return true;}
function under(o:Object3D,root:Object3D){let p:Object3D|null=o;while(p){if(p===root)return true;p=p.parent;}return false;}
/** Render-only exact geometry consolidation of approved low-poly leaves.
 * Never deletes an authored object. A change in transform, material, mask
 * or visibility fails open for the whole batch. Only switch when at least
 * three originals actually intersect the frustum and extra triangles are
 * negligible. No shadow or raycast replacement. */
export function createCraterStaticMeshBatches(cell=20){
 const pending:Job[]=[],batches:Batch[]=[],roots=new Set<Object3D>();
 const masked:{mesh:Mesh;mask:number}[]=[],active:Mesh[]=[];
 const frustum=new Frustum(),vp=new Matrix4(),center=new Vector3(),inverse=new Matrix4(),transform=new Matrix4();
 let stats={batches:0,sourceDraws:0,savedDraws:0,extraTriangles:0};
 function restore(){for(const m of masked)m.mesh.layers.mask=m.mask;masked.length=0;for(const m of active){m.visible=false;m.layers.mask=0;}active.length=0;}
 function clear(){restore();for(const b of batches){b.proxy.removeFromParent();b.proxy.geometry.dispose();}batches.length=0;pending.length=0;roots.clear();}
 function register(input:readonly Object3D[]){
  clear();
  // The approved roots must be disjoint; an ancestor already covers a
  // descendant. Workstation state and render proxies are owned elsewhere.
  for(const root of input){if(input.some(other=>other!==root&&under(root,other)))continue;roots.add(root);}
  for(const root of roots){
   root.updateWorldMatrix(true,true);const bins=new Map<string,Leaf[]>();
   root.traverse(o=>{
    if(!safe(o)||!visible(o)||!o.layers.mask)return;
    let p:Object3D|null=o;while(p&&p!==root){if(p.name==='b-r30-crater-workstations'||p.name.startsWith('p2-')||p.name.startsWith('p3-'))return;p=p.parent;}
    const g=o.geometry,m=o.material as Material;if(!g.boundingSphere)g.computeBoundingSphere();if(!g.boundingSphere)return;
    const sphere=g.boundingSphere.clone().applyMatrix4(o.matrixWorld);center.copy(sphere.center);
    if(sphere.radius>cell*.45)return;
    const attrs=Object.entries(g.attributes).sort(([a],[b])=>a.localeCompare(b)).map(([n,a])=>n+':'+a.itemSize+':'+a.normalized+':'+a.array.constructor.name).join('|');
    const k=[Math.floor(center.x/cell),Math.floor(center.y/cell),Math.floor(center.z/cell),m.uuid,o.layers.mask,o.receiveShadow,o.renderOrder,!!g.index,attrs].join('/');
    const a=bins.get(k)??[];a.push({mesh:o,world:o.matrixWorld.clone(),geometry:g,material:m,mask:o.layers.mask,tris:triangles(g),version:version(g),attributes:{...g.attributes},index:g.index,receiveShadow:o.receiveShadow,renderOrder:o.renderOrder,sphere});bins.set(k,a);
   });
   for(const leaves of bins.values())for(let i=0;i<leaves.length;i+=24){const part=leaves.slice(i,i+24);if(part.length>=3)pending.push({root,leaves:part});}
  }
 }
 function valid(l:Leaf,root:Object3D){const o=l.mesh;return safe(o)&&under(o,root)&&o.geometry===l.geometry&&o.material===l.material&&o.layers.mask===l.mask&&o.matrixWorld.equals(l.world)&&o.geometry.index===l.index&&o.receiveShadow===l.receiveShadow&&o.renderOrder===l.renderOrder&&Object.keys(o.geometry.attributes).length===Object.keys(l.attributes).length&&Object.entries(l.attributes).every(([k,a])=>o.geometry.attributes[k]===a)&&version(o.geometry)===l.version&&visible(o);}
 function warmStep(maxJobs=1,maxMs=2){
  const start=performance.now();let done=0;
  while(pending.length&&done<maxJobs&&performance.now()-start<maxMs){
   const job=pending.shift()!;done++;if(!roots.has(job.root)||!job.leaves.every(l=>valid(l,job.root)))continue;
   inverse.copy(job.root.matrixWorld).invert();
   const cloned=job.leaves.map(l=>l.geometry.clone().applyMatrix4(transform.multiplyMatrices(inverse,l.world)));
   const geometry=mergeGeometries(cloned);for(const g of cloned)g.dispose();if(!geometry)continue;
   geometry.computeBoundingSphere();geometry.computeBoundingBox();
   const first=job.leaves[0],proxy=new Mesh(geometry,first.material);proxy.name='p3-static-mesh-batch';proxy.userData.p3MeshBatch=true;proxy.visible=false;proxy.layers.mask=0;proxy.matrixAutoUpdate=false;proxy.receiveShadow=first.mesh.receiveShadow;proxy.renderOrder=first.mesh.renderOrder;proxy.raycast=()=>{};
   job.root.add(proxy);proxy.updateWorldMatrix(true,false);batches.push({...job,proxy,rootWorld:job.root.matrixWorld.clone()});
  }
 }
 function warmAll(){while(pending.length)warmStep(Infinity,Infinity);}
 function begin(camera:Camera){
  restore();stats={batches:0,sourceDraws:0,savedDraws:0,extraTriangles:0};frustum.setFromProjectionMatrix(vp.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
  for(const b of batches){
   if(!b.root.matrixWorld.equals(b.rootWorld)||!visible(b.root)||!camera.layers.test(b.leaves[0].mesh.layers))continue;
   let n=0,extra=0,total=0;
   for(const l of b.leaves){total+=l.tris;if(frustum.intersectsSphere(l.sphere))n++;else extra+=l.tris;}
   if(n<3||extra>Math.min(512,total*.15)||!b.leaves.every(l=>valid(l,b.root)))continue;
   for(const l of b.leaves){masked.push({mesh:l.mesh,mask:l.mask});l.mesh.layers.mask=0;}
   b.proxy.layers.mask=b.leaves[0].mask;b.proxy.visible=true;active.push(b.proxy);
   stats.batches++;stats.sourceDraws+=n;stats.savedDraws+=n-1;stats.extraTriangles+=extra;
  }
  return stats;
 }
 return {register,warmStep,warmAll,begin,restore,dispose:clear,get pending(){return pending.length;},get count(){return batches.length;},get stats(){return stats;}};
}
