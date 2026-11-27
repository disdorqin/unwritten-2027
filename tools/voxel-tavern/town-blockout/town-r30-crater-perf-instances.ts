import {Box3,BufferAttribute,Camera,Color,Frustum,InstancedBufferAttribute,InstancedMesh,Material,Matrix4,MeshBasicMaterial,MeshLambertMaterial,MeshStandardMaterial,Object3D,Sphere,StaticDrawUsage,Vector3} from 'three';
import {sphereBehindCraterWall} from './town-r30-crater-perf-occlusion';
type Ring=Parameters<typeof sphereBehindCraterWall>[0];
type Chunk={mesh:InstancedMesh;box:Box3;count:number;worldBox?:Box3;worldSphere?:Sphere};
type Snapshot={mesh:InstancedMesh;matrixVersion:number;colorVersion:number;count:number;geometry:InstancedMesh['geometry'];material:InstancedMesh['material'];matrixAttribute:InstancedMesh['instanceMatrix'];colorAttribute:InstancedMesh['instanceColor'];position:ReturnType<InstancedMesh['geometry']['getAttribute']>;positionVersion:number;index:InstancedMesh['geometry']['index'];indexVersion:number;drawStart:number;drawCount:number;receiveShadow:boolean;order:number};
type CompactRequest={key:string;cells:Chunk[];count:number};
type CompactBuild={request:CompactRequest;chunk:Chunk;cell:number;cursor:number;written:number};
type Source=Snapshot&{chunks:Chunk[];world?:Matrix4;whole?:Box3;worldWhole?:Sphere;selection?:string;stable?:number;request?:CompactRequest;compact?:{key:string;chunk:Chunk};building?:CompactBuild};
type Build={snap:Snapshot;bins:Map<string,number[]>;cursor:number;entries?:number[][];part:number;chunks:Chunk[];single:Box3;geometryBox:Box3;current?:{mesh:InstancedMesh;box:Box3;cursor:number;indices:number[]}};
const attrVersion=(a:ReturnType<InstancedMesh['geometry']['getAttribute']>)=>a instanceof BufferAttribute?a.version:a.data.version;
const ordinary=(m:Material)=> (m instanceof MeshStandardMaterial||m instanceof MeshLambertMaterial||m instanceof MeshBasicMaterial)&&!m.transparent&&!m.wireframe&&m.depthTest&&m.depthWrite&&!(m as MeshStandardMaterial).displacementMap&&m.onBeforeCompile===Material.prototype.onBeforeCompile;
function eligible(o:Object3D):o is InstancedMesh{
 return o instanceof InstancedMesh&&o.count>=24&&o.frustumCulled&&!o.castShadow&&!Array.isArray(o.material)&&ordinary(o.material)&&o.instanceMatrix.usage===StaticDrawUsage&&o.morphTexture===null&&
  !Object.values(o.geometry.attributes).some(a=>a instanceof InstancedBufferAttribute)&&!o.geometry.morphAttributes.position?.length&&
  o.onBeforeRender===Object3D.prototype.onBeforeRender&&o.onAfterRender===Object3D.prototype.onAfterRender;
}
function snapshot(m:InstancedMesh):Snapshot{
 const position=m.geometry.getAttribute('position');
 return {mesh:m,matrixVersion:m.instanceMatrix.version,colorVersion:m.instanceColor?.version??-1,count:m.count,geometry:m.geometry,material:m.material,matrixAttribute:m.instanceMatrix,colorAttribute:m.instanceColor,position,positionVersion:attrVersion(position),index:m.geometry.index,indexVersion:m.geometry.index?.version??-1,drawStart:m.geometry.drawRange.start,drawCount:m.geometry.drawRange.count,receiveShadow:m.receiveShadow,order:m.renderOrder};
}
function unchanged(s:Snapshot){
 const m=s.mesh;
 return m.count===s.count&&m.geometry===s.geometry&&m.material===s.material&&m.instanceMatrix===s.matrixAttribute&&m.instanceColor===s.colorAttribute&&m.instanceMatrix.version===s.matrixVersion&&(m.instanceColor?.version??-1)===s.colorVersion&&m.geometry.getAttribute('position')===s.position&&attrVersion(s.position)===s.positionVersion&&m.geometry.index===s.index&&(m.geometry.index?.version??-1)===s.indexVersion&&m.geometry.drawRange.start===s.drawStart&&m.geometry.drawRange.count===s.drawCount&&m.receiveShadow===s.receiveShadow&&m.renderOrder===s.order&&eligible(m);
}
/** Exact static instance partition. Source is never removed or modified;
 * child cells share original geometry/material and exact matrices/colors.
 * Initialization is incremental; an unfinished or mutated source stays
 * on its original render path. Non-rendered proxies have layer zero. */
export function createCraterInstanceCells(cellSize=32,maxExtraDraws=36){
 if(!Number.isFinite(cellSize)||cellSize<=0||!Number.isInteger(maxExtraDraws)||maxExtraDraws<0)throw Error('Invalid instance cell budget');
 const allowedRoots=new Set<Object3D>();
 const sources:Source[]=[],seen=new Set<InstancedMesh>(),queue:InstancedMesh[]=[],masked:{object:InstancedMesh;mask:number}[]=[],active:InstancedMesh[]=[];
 const frustum=new Frustum(),vp=new Matrix4(),matrix=new Matrix4(),sphere=new Sphere(),box=new Box3(),eye=new Vector3(),center=new Vector3(),tint=new Color();
 let job:Build|undefined;
 const geometryBounds=new WeakMap<InstancedMesh['geometry'],{attribute:Snapshot['position'];version:number;bounds:Box3}>();
 let last={sources:0,submitted:0,savedInstances:0,extraDraws:0,compactSources:0};
 function restore(){for(const m of masked)m.object.layers.mask=m.mask;masked.length=0;for(const m of active){m.visible=false;m.layers.mask=0;}active.length=0;}
 function enqueue(roots:readonly Object3D[]){
  for(const root of roots){allowedRoots.add(root);root.traverse(o=>{if(eligible(o)&&!seen.has(o)&&!o.userData.p2InstanceCell){seen.add(o);queue.push(o);}});}
 }
 function discard(){
  if(!job)return;for(const c of job.chunks)c.mesh.dispose();job.current?.mesh.dispose();job=undefined;
 }
 function step(){
  if(!job){
   const source=queue.shift();if(!source)return;
   if(!eligible(source))return;
   const snap=snapshot(source),g=source.geometry;let cached=geometryBounds.get(g);
   if(!cached||cached.attribute!==snap.position||cached.version!==snap.positionVersion){g.computeBoundingBox();if(!g.boundingBox||g.boundingBox.isEmpty())return;cached={attribute:snap.position,version:snap.positionVersion,bounds:g.boundingBox.clone()};geometryBounds.set(g,cached);}
   job={snap,bins:new Map(),cursor:0,part:0,chunks:[],single:new Box3(),geometryBox:cached.bounds};
  }
  const j=job,source=j.snap.mesh,g=j.snap.geometry;
  if(!j.entries){
   if(j.cursor<j.snap.count){
    const i=j.cursor++;source.getMatrixAt(i,matrix);
    if(!matrix.elements.every(Number.isFinite)||matrix.determinant()<=0){discard();return;}
    center.setFromMatrixPosition(matrix);const k=Math.floor(center.x/cellSize)+','+Math.floor(center.z/cellSize);
    const a=j.bins.get(k)??[];a.push(i);j.bins.set(k,a);
    if(j.bins.size===1)j.single.union(box.copy(j.geometryBox).applyMatrix4(matrix));
    if(j.bins.size>256){discard();return;}
    return;
   }
   if(j.bins.size<2){
    // A one-cell source needs no duplicate GPU buffers; keep its exact
    // bound for whole-source wall rejection instead of discarding it.
    if(unchanged(j.snap)&&!j.single.isEmpty())sources.push({...j.snap,chunks:[],whole:j.single.clone()});
    job=undefined;return;
   }j.entries=[...j.bins.values()];
  }
  if(j.part===j.entries.length){
   if(!unchanged(j.snap)){discard();return;}
   for(const c of j.chunks){source.add(c.mesh);c.mesh.updateWorldMatrix(true,false);}
   sources.push({...j.snap,chunks:j.chunks});job=undefined;return;
  }
  if(!j.current){
   const indices=j.entries[j.part],mesh=new InstancedMesh(g,source.material,indices.length);
   mesh.name='p2-instance-cell';mesh.userData.p2InstanceCell=true;mesh.layers.mask=0;mesh.receiveShadow=source.receiveShadow;mesh.renderOrder=source.renderOrder;mesh.matrixAutoUpdate=false;mesh.visible=false;mesh.raycast=()=>{};
   j.current={mesh,box:new Box3(),cursor:0,indices};
  }
  const c=j.current,i=c.cursor++;
  source.getMatrixAt(c.indices[i],matrix);c.mesh.setMatrixAt(i,matrix);c.box.union(box.copy(j.geometryBox).applyMatrix4(matrix));
  if(source.instanceColor){source.getColorAt(c.indices[i],tint);c.mesh.setColorAt(i,tint);}
  if(c.cursor===c.indices.length){
   c.mesh.instanceMatrix.needsUpdate=true;if(c.mesh.instanceColor)c.mesh.instanceColor.needsUpdate=true;
   c.mesh.boundingBox=c.box.clone();c.mesh.boundingSphere=c.box.getBoundingSphere(new Sphere());
   j.chunks.push({mesh:c.mesh,box:c.box,count:c.indices.length});j.current=undefined;j.part++;
  }
 }
 /** Work budget is both time and operation bounded. Call after rendering,
  * so completed cells are visible only at the next normal render. */
 function warmStep(maxWork=1400,maxMs=2){
  const start=performance.now();let n=0;
  while((queue.length||job)&&n<maxWork){
   if(n%64===0){if(performance.now()-start>=maxMs)break;if(job&&!unchanged(job.snap)){discard();continue;}}
   step();n++;
  }
  return n;
 }
 // Synchronous only for tests and explicitly warmed diagnostic sessions.
 function register(roots:readonly Object3D[]){enqueue(roots);while(queue.length||job)warmStep(Infinity,Infinity);}
 function begin(camera:Camera,ring?:Ring,wholeEnabled=true,compactEnabled=true){
  restore();last={sources:0,submitted:0,savedInstances:0,extraDraws:0,compactSources:0};eye.setFromMatrixPosition(camera.matrixWorld);
  frustum.setFromProjectionMatrix(vp.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
  const choices:{s:Source;cells:Chunk[];saved:number;tris:number;compact?:boolean}[]=[];
  for(const s of sources){
   const previous=s.selection;s.request=undefined;s.selection=undefined;
   const m=s.mesh;if(!m.parent||!m.visible||!camera.layers.test(m.layers)||!unchanged(s))continue;
   let ancestor:Object3D|null=m,approved=false;while(ancestor&&ancestor.visible){if(allowedRoots.has(ancestor))approved=true;ancestor=ancestor.parent;}if(ancestor||!approved)continue;
   if(!m.boundingSphere)m.computeBoundingSphere();
   if(m.boundingSphere&&!frustum.intersectsSphere(sphere.copy(m.boundingSphere).applyMatrix4(m.matrixWorld)))continue;
   if(!s.world||!s.world.equals(m.matrixWorld)){
    (s.world??=new Matrix4()).copy(m.matrixWorld);
    if(s.whole)box.copy(s.whole).applyMatrix4(m.matrixWorld).getBoundingSphere(s.worldWhole??=new Sphere());
    for(const c of s.chunks){(c.worldBox??=new Box3()).copy(c.box).applyMatrix4(m.matrixWorld);c.worldBox.getBoundingSphere(c.worldSphere??=new Sphere());}
   }
   if(s.whole){
    if(wholeEnabled&&ring&&s.worldWhole&&sphereBehindCraterWall(ring,eye,s.worldWhole))choices.push({s,cells:[],saved:s.count,tris:s.count*(m.geometry.index?.count??m.geometry.getAttribute('position').count)/3});
    continue;
   }
   const cells:Chunk[]=[],ids:number[]=[];let n=0;
   for(let i=0;i<s.chunks.length;i++){const c=s.chunks[i];if(!frustum.intersectsBox(c.worldBox!))continue;
    if(ring&&sphereBehindCraterWall(ring,eye,c.worldSphere!))continue;cells.push(c);ids.push(i);n+=c.count;}
   const saved=s.count-n,triangles=(m.geometry.index?.count??m.geometry.getAttribute('position').count)/3;
   const extra=Math.max(0,cells.length-1),savedTris=saved*triangles;
   // A stable visible subset can be copied once into one compact instance
   // stream, avoiding the previous extra-draw tradeoff. Never upload in
   // begin(); until ready use the original proven cell-selection policy.
   if(compactEnabled&&cells.length>=2&&n<=2048&&saved>=s.count*.25&&savedTris>=5000){
    const key=ids.join(',');s.selection=key;s.stable=previous===key?(s.stable??0)+1:1;
    if(s.compact?.key===key){choices.push({s,cells:[s.compact.chunk],saved,tris:savedTris,compact:true});continue;}
    if(s.stable>=12)s.request={key,cells,count:n};
   }else{s.stable=0;}
   if(saved>0&&((extra===0&&(cells.length===0||savedTris>=2000))||(extra>0&&saved>=s.count*.30&&savedTris>=extra*2500)))choices.push({s,cells,saved,tris:savedTris});
  }
  choices.sort((a,b)=>b.tris-a.tris);
  for(const {s,cells,saved,compact} of choices){
   const extra=Math.max(0,cells.length-1);if(last.extraDraws+extra>maxExtraDraws)continue;
   masked.push({object:s.mesh,mask:s.mesh.layers.mask});s.mesh.layers.mask=0;
   for(const c of cells){c.mesh.layers.mask=masked.at(-1)!.mask;c.mesh.visible=true;active.push(c.mesh);}
   last.sources++;last.submitted+=cells.length;last.savedInstances+=saved;last.extraDraws+=extra;if(compact)last.compactSources++;
  }
  return last;
 }
 function dropCompact(s:Source){if(s.building){s.building.chunk.mesh.dispose();s.building=undefined;}if(s.compact){s.compact.chunk.mesh.removeFromParent();s.compact.chunk.mesh.dispose();s.compact=undefined;}}
 function warmCompacts(maxWork=256,maxMs=1){
  const started=performance.now();let work=0;
  for(const s of sources){
   if(work>=maxWork)break;
   const r=s.request;
   if(s.building&&(!r||s.building.request.key!==r.key||!unchanged(s))){s.building.chunk.mesh.dispose();s.building=undefined;}
   if(!r||s.compact?.key===r.key||!unchanged(s))continue;
   if(performance.now()-started>=maxMs)break;
   if(!s.building){
    const m=new InstancedMesh(s.geometry,s.material,r.count);m.name='p2-instance-cell-compact';m.userData.p2InstanceCell=true;m.visible=false;m.layers.mask=0;m.matrixAutoUpdate=false;m.receiveShadow=s.mesh.receiveShadow;m.renderOrder=s.mesh.renderOrder;m.raycast=()=>{};
    const b=new Box3();for(const c of r.cells)b.union(c.box);m.boundingBox=b.clone();m.boundingSphere=b.getBoundingSphere(new Sphere());
    s.building={request:r,chunk:{mesh:m,box:b,count:r.count},cell:0,cursor:0,written:0};
   }
   const b=s.building;
   while(b.cell<b.request.cells.length&&work<maxWork&&performance.now()-started<maxMs){
    const c=b.request.cells[b.cell];c.mesh.getMatrixAt(b.cursor,matrix);b.chunk.mesh.setMatrixAt(b.written,matrix);
    if(s.colorAttribute){c.mesh.getColorAt(b.cursor,tint);b.chunk.mesh.setColorAt(b.written,tint);}
    b.written++;b.cursor++;work++;if(b.cursor===c.count){b.cursor=0;b.cell++;}
   }
   if(b.written===b.request.count){
    if(s.compact){s.compact.chunk.mesh.removeFromParent();s.compact.chunk.mesh.dispose();}
    const m=b.chunk.mesh;m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;s.mesh.add(m);m.updateWorldMatrix(true,false);s.compact={key:b.request.key,chunk:b.chunk};s.building=undefined;
   }
  }return work;
 }
 function dispose(){restore();discard();queue.length=0;for(const s of sources){dropCompact(s);for(const c of s.chunks){c.mesh.removeFromParent();c.mesh.dispose();}}sources.length=0;seen.clear();allowedRoots.clear();}
 function replaceRoots(roots:readonly Object3D[]){
  restore();allowedRoots.clear();for(const r of roots)allowedRoots.add(r);
  const approved=(o:Object3D)=>{let p:Object3D|null=o;while(p){if(allowedRoots.has(p))return true;p=p.parent;}return false;};
  for(let i=sources.length-1;i>=0;i--){const s=sources[i];if(approved(s.mesh))continue;dropCompact(s);for(const c of s.chunks){c.mesh.removeFromParent();c.mesh.dispose();}seen.delete(s.mesh);sources.splice(i,1);}
  for(let i=queue.length-1;i>=0;i--)if(!approved(queue[i])){seen.delete(queue[i]);queue.splice(i,1);}
  if(job&&!approved(job.snap.mesh)){seen.delete(job.snap.mesh);discard();}
  enqueue(roots);
 }
 return {register,enqueue,warmStep,warmCompacts,begin,restore,dispose,replaceRoots,get sourceCount(){return sources.length;},get pendingSources(){return queue.length+Number(!!job);},get stats(){return last;}};
}
