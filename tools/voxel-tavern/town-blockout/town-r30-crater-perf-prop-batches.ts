import {BoxGeometry,BufferAttribute,Camera,Color,Frustum,InstancedMesh,Material,Matrix4,Mesh,MeshLambertMaterial,Object3D,Sphere,Vector3} from 'three';
const approved=new Set(['town-fill-lake-east','za32-street-props','town-fill-rime-grove','town-fill-south-gate','town-fill-reed-marsh','town-fill-plum-slope','town-fill-north-west']);
type Leaf={mesh:Mesh;matrix:Matrix4;world:Matrix4;sphere:Sphere;geometry:BoxGeometry;material:MeshLambertMaterial;mask:number;position:BufferAttribute;version:number;index:BufferAttribute;indexVersion:number;color?:Color};
type Job={root:Object3D;world:Matrix4;leaves:Leaf[];colored:boolean};
type Batch=Job&{proxy:InstancedMesh};
function eligible(o:Object3D,geometryChecks:Map<BoxGeometry,boolean>,materialChecks:Map<MeshLambertMaterial,boolean>):o is Mesh<BoxGeometry,MeshLambertMaterial>{
 if(!(o instanceof Mesh)||o instanceof InstancedMesh||o.children.length||o.castShadow||o.receiveShadow||o.renderOrder!==0||!o.frustumCulled||o.onBeforeRender!==Object3D.prototype.onBeforeRender||o.onAfterRender!==Object3D.prototype.onAfterRender)return false;
 const g=o.geometry,m=o.material;
 if(!(g instanceof BoxGeometry)||!(m instanceof MeshLambertMaterial))return false;
 let gOK=geometryChecks.get(g);if(gOK===undefined){gOK=g.index instanceof BufferAttribute&&g.index.count===36&&g.getAttribute('position') instanceof BufferAttribute&&g.getAttribute('position').count===24&&g.drawRange.start===0&&g.drawRange.count>=36&&!Object.keys(g.morphAttributes).length;geometryChecks.set(g,gOK);}
 let mOK=materialChecks.get(m);if(mOK===undefined){mOK=m.visible&&!m.transparent&&!m.wireframe&&m.depthWrite&&m.depthTest&&m.onBeforeCompile===Material.prototype.onBeforeCompile&&m.customProgramCacheKey===Material.prototype.customProgramCacheKey&&!m.displacementMap&&!m.clippingPlanes?.length;materialChecks.set(m,mOK);}
 return gOK&&mOK;
}
function pathVisible(o:Object3D,root:Object3D){let p:Object3D|null=o,found=false;while(p&&p.visible&&p.renderOrder===0){if(p===root)found=true;p=p.parent;}return !p&&found;}
function orthogonal(m:Matrix4){
 const e=m.elements,x=new Vector3(e[0],e[1],e[2]),y=new Vector3(e[4],e[5],e[6]),z=new Vector3(e[8],e[9],e[10]),a=x.length(),b=y.length(),c=z.length();
 return a>0&&b>0&&c>0&&m.determinant()>0&&Math.abs(x.dot(y))<a*b*1e-6&&Math.abs(y.dot(z))<b*c*1e-6&&Math.abs(z.dot(x))<c*a*1e-6;
}
/** Only surveyed, authored static fill/prop roots. Exact geometry/material,
 * per-leaf model transforms and original collision/interaction identities.
 * Rendering substitutes a spatial instance batch for compatible box leaves. */
export function createCraterPropBatches(cell=48){
 const jobs:Job[]=[],batches:Batch[]=[],masked:{m:Mesh;mask:number}[]=[],active:InstancedMesh[]=[];
 const inverse=new Matrix4(),relative=new Matrix4(),frustum=new Frustum(),vp=new Matrix4();
 const white=new MeshLambertMaterial(),reference=new MeshLambertMaterial(),plainCache=new Map<MeshLambertMaterial,boolean>();
 // Three adds a dispose listener when a material first enters the real
 // renderer. This EventDispatcher bookkeeping is not a shader property.
 const ignored=new Set(['uuid','name','userData','version','color','_listeners']);
 const keys=Object.keys(reference).filter(k=>!ignored.has(k)),keySet=new Set(keys);
 const geometryChecks=new Map<BoxGeometry,boolean>(),materialChecks=new Map<MeshLambertMaterial,boolean>(),rootChecks=new Map<Object3D,Map<Object3D,boolean>>();
 function resetChecks(){plainCache.clear();geometryChecks.clear();materialChecks.clear();rootChecks.clear();}
 function parentVisible(p:Object3D|null,root:Object3D):boolean{if(!p)return false;let cache=rootChecks.get(root);if(!cache){cache=new Map();rootChecks.set(root,cache);}const old=cache.get(p);if(old!==undefined)return old;const ok=p===root?pathVisible(root,root):p.visible&&p.renderOrder===0&&parentVisible(p.parent,root);cache.set(p,ok);return ok;}
 function plain(m:MeshLambertMaterial){
  const old=plainCache.get(m);if(old!==undefined)return old;
  const a=m as unknown as Record<string,unknown>,b=reference as unknown as Record<string,unknown>;
  const same=Object.getPrototypeOf(m)===MeshLambertMaterial.prototype&&Object.keys(m).every(k=>ignored.has(k)||keySet.has(k))&&keys.every(k=>{const x=a[k],y=b[k];return x===y||(!!x&&!!y&&typeof x==='object'&&typeof (x as {equals?:unknown}).equals==='function'&&(x as {equals:(v:unknown)=>boolean}).equals(y));});
  plainCache.set(m,same);return same;
 }
 let stats={batches:0,savedDraws:0,extraTriangles:0};
 function restore(){for(const x of masked)x.m.layers.mask=x.mask;masked.length=0;for(const p of active){p.visible=false;p.layers.mask=0;}active.length=0;}
 function dispose(){restore();for(const b of batches){b.proxy.removeFromParent();b.proxy.dispose();}batches.length=0;jobs.length=0;resetChecks();white.dispose();}
 function register(roots:readonly Object3D[]){
  dispose();const targets=new Set<Object3D>();
  for(const r of roots){if(approved.has(r.name))targets.add(r);for(const child of r.children)if(approved.has(child.name))targets.add(child);}
  for(const root of targets){
   root.updateWorldMatrix(true,true);inverse.copy(root.matrixWorld).invert();const bins=new Map<string,Leaf[]>();
   root.traverse(o=>{
    if(!eligible(o,geometryChecks,materialChecks)||!o.visible||!parentVisible(o.parent,root)||!o.layers.mask)return;
    const g=o.geometry,p=g.getAttribute('position') as BufferAttribute,index=g.index!;if(!g.boundingSphere)g.computeBoundingSphere();if(!g.boundingSphere)return;
    if(!orthogonal(relative.multiplyMatrices(inverse,o.matrixWorld)))return;
    const s=g.boundingSphere.clone().applyMatrix4(o.matrixWorld);if(![s.center.x,s.center.y,s.center.z,s.radius].every(Number.isFinite)||s.radius>cell*.3)return;
    const colored=plain(o.material),key=[Math.floor(s.center.x/cell),Math.floor(s.center.z/cell),g.uuid,colored?'plain-lambert-color':o.material.uuid,o.layers.mask].join('/');
    const a=bins.get(key)??[];a.push({mesh:o,matrix:relative.clone(),world:o.matrixWorld.clone(),sphere:s,geometry:g,material:o.material,mask:o.layers.mask,position:p,version:p.version,index,indexVersion:index.version,color:colored?o.material.color.clone():undefined});bins.set(key,a);
   });
   for(const list of bins.values())for(let i=0;i<list.length;i+=96){const leaves=list.slice(i,i+96);if(leaves.length>=2)jobs.push({root,world:root.matrixWorld.clone(),leaves,colored:!!leaves[0].color});}
  }
 }
 function valid(l:Leaf,root:Object3D){const m=l.mesh;return eligible(m,geometryChecks,materialChecks)&&m.visible&&parentVisible(m.parent,root)&&m.layers.mask===l.mask&&m.geometry===l.geometry&&m.material===l.material&&m.matrixWorld.equals(l.world)&&m.geometry.getAttribute('position')===l.position&&l.position.version===l.version&&m.geometry.index===l.index&&l.index.version===l.indexVersion&&(!l.color||(plain(l.material)&&l.color.equals(l.material.color)));}
 function warmStep(maxJobs=2,maxMs=1){
  resetChecks();const start=performance.now();let n=0;
  while(jobs.length&&n<maxJobs&&performance.now()-start<maxMs){const j=jobs.shift()!;n++;if(!j.root.matrixWorld.equals(j.world)||!j.leaves.every(l=>valid(l,j.root)))continue;
   const first=j.leaves[0],p=new InstancedMesh(first.geometry,j.colored?white:first.material,j.leaves.length);p.name='p4-static-prop-instances';p.userData.p4PropBatch=true;p.visible=false;p.layers.mask=0;p.matrixAutoUpdate=false;p.raycast=()=>{};
   j.leaves.forEach((l,i)=>{p.setMatrixAt(i,l.matrix);if(l.color)p.setColorAt(i,l.color);});p.instanceMatrix.needsUpdate=true;if(p.instanceColor)p.instanceColor.needsUpdate=true;p.computeBoundingSphere();j.root.add(p);p.updateWorldMatrix(true,false);batches.push({...j,proxy:p});
  }return n;
 }
 function begin(camera:Camera){
  restore();resetChecks();stats={batches:0,savedDraws:0,extraTriangles:0};frustum.setFromProjectionMatrix(vp.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
  for(const b of batches){
   if(!b.root.matrixWorld.equals(b.world)||!pathVisible(b.root,b.root)||!(camera.layers.mask&b.leaves[0].mask))continue;
   let seen=0;for(const l of b.leaves)if(frustum.intersectsSphere(l.sphere))seen++;
   const extra=(b.leaves.length-seen)*12;
   // A few extra box triangles are cheap; never submit a mostly invisible
   // batch, or trade one draw for another with no reduction.
   if(seen<2||extra>Math.min(384,b.leaves.length*12*.5)||!b.leaves.every(l=>valid(l,b.root)))continue;
   for(const l of b.leaves){masked.push({m:l.mesh,mask:l.mask});l.mesh.layers.mask=0;}
   b.proxy.layers.mask=b.leaves[0].mask;b.proxy.visible=true;active.push(b.proxy);stats.batches++;stats.savedDraws+=seen-1;stats.extraTriangles+=extra;
  }return stats;
 }
 return {register,warmStep,begin,restore,dispose,get pending(){return jobs.length;},get count(){return batches.length;},get stats(){return stats;}};
}
