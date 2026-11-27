import {BufferAttribute,Camera,Color,Frustum,InstancedBufferAttribute,InstancedMesh,Material,Matrix4,MeshBasicMaterial,MeshLambertMaterial,MeshStandardMaterial,Object3D,Sphere,StaticDrawUsage,Vector3} from 'three';
type Source={mesh:InstancedMesh;world:Matrix4;count:number;matrix:InstancedMesh['instanceMatrix'];matrixVersion:number;color:InstancedMesh['instanceColor'];colorVersion:number;geometry:InstancedMesh['geometry'];material:Material;mask:number;order:number;receiveShadow:boolean;bounds:Sphere;triangles:number;position:ReturnType<InstancedMesh['geometry']['getAttribute']>;positionVersion:number;index:InstancedMesh['geometry']['index'];indexVersion:number;drawStart:number;drawCount:number};
type Job={root:Object3D;rootWorld:Matrix4;sources:Source[]};
type Batch=Job&{proxy:InstancedMesh};
const ordinary=(m:Material)=>(m instanceof MeshStandardMaterial||m instanceof MeshLambertMaterial||m instanceof MeshBasicMaterial)&&m.visible&&!m.transparent&&!m.wireframe&&m.depthTest&&m.depthWrite&&m.onBeforeCompile===Material.prototype.onBeforeCompile&&m.customProgramCacheKey===Material.prototype.customProgramCacheKey&&!(m as MeshStandardMaterial).displacementMap&&!m.clippingPlanes?.length;
function eligible(o:Object3D,wide=false):o is InstancedMesh{
 return o instanceof InstancedMesh&&o.count>=1&&o.count<=(wide?4096:256)&&o.frustumCulled&&!o.castShadow&&!Array.isArray(o.material)&&ordinary(o.material)&&o.instanceMatrix.usage===StaticDrawUsage&&(!o.instanceColor||o.instanceColor.usage===StaticDrawUsage)&&o.morphTexture===null&&!o.userData.p2InstanceCell&&!o.userData.p4Coalesced&&!o.name.startsWith('p3-')&&!o.name.startsWith('p2-')&&!Object.values(o.geometry.attributes).some(a=>a instanceof InstancedBufferAttribute)&&!Object.keys(o.geometry.morphAttributes).length&&o.onBeforeRender===Object3D.prototype.onBeforeRender&&o.onAfterRender===Object3D.prototype.onAfterRender;
}
function visible(o:Object3D,root:Object3D){let p:Object3D|null=o,found=false;while(p&&p.visible){if(p===root)found=true;p=p.parent;}return !p&&found;}
const version=(p:Source['position'])=>p instanceof BufferAttribute?p.version:p.data.version;
function uniform(m:Matrix4){
 const e=m.elements,x=new Vector3(e[0],e[1],e[2]),y=new Vector3(e[4],e[5],e[6]),z=new Vector3(e[8],e[9],e[10]),s=x.lengthSq();
 return s>0&&m.determinant()>0&&Math.abs(y.lengthSq()-s)<s*1e-6&&Math.abs(z.lengthSq()-s)<s*1e-6&&Math.abs(x.dot(y))<s*1e-6&&Math.abs(y.dot(z))<s*1e-6&&Math.abs(z.dot(x))<s*1e-6;
}
/** Coalesce already-instanced static sources using the exact shared geometry
 * and material. Proxies exist only in render layers; authored identities,
 * collision queries and source state are preserved. No per-frame uploads.
 * A source changed/hidden by a higher-priority pass falls back as a group. */
export function createCraterInstanceBatches(cell=96,wide=false){
 const jobs:Job[]=[],batches:Batch[]=[],masked:{m:InstancedMesh;mask:number}[]=[],active:InstancedMesh[]=[];
 const frustum=new Frustum(),vp=new Matrix4(),inverse=new Matrix4(),relative=new Matrix4(),matrix=new Matrix4(),color=new Color();
 let stats={batches:0,savedDraws:0,extraTriangles:0};
 let building:{job:Job;proxy:InstancedMesh;source:number;cursor:number;written:number}|undefined;
 const wideName=(o:Object3D)=>/^(Forest trunks and branches|Snow forest pine crowns|Pine bough snow|Forest stones, snow and flowers) \[/.test(o.name)||o.parent?.name==='district-infill'||o.name.startsWith('tour-train-track-');
 function restore(){for(const x of masked)x.m.layers.mask=x.mask;masked.length=0;for(const m of active){m.visible=false;m.layers.mask=0;}active.length=0;}
 function dispose(){restore();if(building){building.proxy.dispose();building=undefined;}for(const b of batches){b.proxy.removeFromParent();b.proxy.dispose();}batches.length=0;jobs.length=0;}
 function register(roots:readonly Object3D[]){
  dispose();
  for(const root of new Set(roots)){
   root.updateWorldMatrix(true,true);inverse.copy(root.matrixWorld).invert();const bins=new Map<string,Source[]>();
   root.traverse(o=>{
    if(!eligible(o,wide)||(wide&&!wideName(o))||!visible(o,root)||!o.layers.mask||Array.isArray(o.material))return;
    if(!uniform(relative.multiplyMatrices(inverse,o.matrixWorld)))return;
    // Source bounds computed by Three from all exact instance matrices.
    // Reject unbounded or oversized sources rather than inflating a batch.
    o.computeBoundingSphere();if(!o.boundingSphere)return;
    const b=o.boundingSphere.clone().applyMatrix4(o.matrixWorld);
    if(![b.center.x,b.center.y,b.center.z,b.radius].every(Number.isFinite)||b.radius>cell*.6)return;
    const g=o.geometry,p=g.getAttribute('position');if(!p)return;
    const t=(g.index?.count??p.count)/3;
    if(t<1||t*o.count>(wide?200000:24000))return;
    const k=[Math.floor(b.center.x/cell),Math.floor(b.center.z/cell),wide?o.parent?.uuid:'',g.uuid,o.material.uuid,!!o.instanceColor,o.layers.mask,o.receiveShadow,o.renderOrder].join('/');
    const list=bins.get(k)??[];list.push({mesh:o,world:o.matrixWorld.clone(),count:o.count,matrix:o.instanceMatrix,matrixVersion:o.instanceMatrix.version,color:o.instanceColor,colorVersion:o.instanceColor?.version??-1,geometry:g,material:o.material,mask:o.layers.mask,order:o.renderOrder,receiveShadow:o.receiveShadow,bounds:b,triangles:t*o.count,position:p,positionVersion:version(p),index:g.index,indexVersion:g.index?.version??-1,drawStart:g.drawRange.start,drawCount:g.drawRange.count});bins.set(k,list);
   });
   for(const list of bins.values()){
    let part:Source[]=[],count=0;
    const flush=()=>{if(part.length>=2)jobs.push({root,rootWorld:root.matrixWorld.clone(),sources:part});part=[];count=0;};
    for(const s of list){if(part.length>=12||count+s.count>(wide?4096:1024))flush();part.push(s);count+=s.count;}flush();
   }
  }
 }
 function valid(s:Source,root:Object3D){const m=s.mesh;return eligible(m,wide)&&visible(m,root)&&m.matrixWorld.equals(s.world)&&m.count===s.count&&m.geometry===s.geometry&&m.material===s.material&&m.instanceMatrix===s.matrix&&m.instanceMatrix.version===s.matrixVersion&&m.instanceColor===s.color&&(m.instanceColor?.version??-1)===s.colorVersion&&m.layers.mask===s.mask&&m.renderOrder===s.order&&m.receiveShadow===s.receiveShadow&&m.geometry.getAttribute('position')===s.position&&version(s.position)===s.positionVersion&&m.geometry.index===s.index&&(s.index?.version??-1)===s.indexVersion&&m.geometry.drawRange.start===s.drawStart&&m.geometry.drawRange.count===s.drawCount;}
 function warmStep(maxJobs=1,maxMs=1){
  const start=performance.now();let n=0,work=0;
  while((jobs.length||building)&&n<maxJobs&&performance.now()-start<maxMs&&work<(wide?512:Infinity)){
   if(!building){const j=jobs.shift()!;
   if(!j.root.matrixWorld.equals(j.rootWorld)||!j.sources.every(s=>valid(s,j.root))){n++;continue;}
   const first=j.sources[0],count=j.sources.reduce((a,b)=>a+b.count,0),proxy=new InstancedMesh(first.geometry,first.material,count);
   proxy.name='p4-coalesced-instances';proxy.userData.p4Coalesced=true;proxy.visible=false;proxy.layers.mask=0;proxy.matrixAutoUpdate=false;proxy.receiveShadow=first.receiveShadow;proxy.renderOrder=first.order;proxy.raycast=()=>{};
   building={job:j,proxy,source:0,cursor:0,written:0};}
   const b=building,{job:j,proxy}=b;if(!j.root.matrixWorld.equals(j.rootWorld)||!j.sources.every(s=>valid(s,j.root))){proxy.dispose();building=undefined;n++;continue;}
   inverse.copy(j.rootWorld).invert();let ok=true;
   while(b.source<j.sources.length&&performance.now()-start<maxMs&&work<(wide?512:Infinity)){
    const s=j.sources[b.source];relative.multiplyMatrices(inverse,s.world);s.mesh.getMatrixAt(b.cursor,matrix);matrix.premultiply(relative);if(!matrix.elements.every(Number.isFinite)||matrix.determinant()<=0){ok=false;break;}proxy.setMatrixAt(b.written,matrix);if(s.color){s.mesh.getColorAt(b.cursor,color);proxy.setColorAt(b.written,color);}b.written++;b.cursor++;work++;if(b.cursor===s.count){b.source++;b.cursor=0;}
   }
   if(!ok){proxy.dispose();building=undefined;n++;continue;}if(b.source!==j.sources.length)break;
   proxy.instanceMatrix.needsUpdate=true;if(proxy.instanceColor)proxy.instanceColor.needsUpdate=true;proxy.computeBoundingSphere();
   j.root.add(proxy);proxy.updateWorldMatrix(true,false);batches.push({...j,proxy});building=undefined;n++;
  }return n;
 }
 function begin(camera:Camera){
  restore();stats={batches:0,savedDraws:0,extraTriangles:0};frustum.setFromProjectionMatrix(vp.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
  for(const b of batches){
   if(!b.root.matrixWorld.equals(b.rootWorld)||!visible(b.root,b.root)||!(camera.layers.mask&b.sources[0].mask))continue;
   let seen=0,extra=0,total=0;
   for(const s of b.sources){total+=s.triangles;if(frustum.intersectsSphere(s.bounds))seen++;else extra+=s.triangles;}
   // Only choose a genuinely smaller draw submission. At most 10% or
   // 2048 extra triangles for a batch of otherwise culled sources.
   if(seen<2||extra>(wide?0:Math.min(2048,total*.10))||!b.sources.every(s=>valid(s,b.root)))continue;
   for(const s of b.sources){masked.push({m:s.mesh,mask:s.mask});s.mesh.layers.mask=0;}
   b.proxy.layers.mask=b.sources[0].mask;b.proxy.visible=true;active.push(b.proxy);stats.batches++;stats.savedDraws+=seen-1;stats.extraTriangles+=extra;
  }return stats;
 }
 return {register,warmStep,begin,restore,dispose,get pending(){return jobs.length+Number(!!building);},get count(){return batches.length;},get stats(){return stats;}};
}
