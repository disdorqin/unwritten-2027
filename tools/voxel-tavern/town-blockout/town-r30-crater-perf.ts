import {BufferGeometry,Camera,Frustum,Group,Matrix4,Mesh,MeshStandardMaterial,Object3D,PointLight,Scene,Sphere,Vector3,WebGLRenderer} from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createCraterExteriorOcclusion} from './town-r30-crater-perf-occlusion';
const exteriorSessions=new WeakMap<Group,ReturnType<typeof createCraterExteriorOcclusion>>();
/** D registers explicitly approved exterior roots after normal scene assembly. */
export function setCraterExteriorRenderRoots(root:Group,roots:readonly Object3D[]){const session=exteriorSessions.get(root);if(!session)return false;session.refresh(roots);session.prepare();return !!session.ring;}

const comparison=()=>typeof location!=='undefined'&&new URLSearchParams(location.search).has('profile')&&new URLSearchParams(location.search).has('pPerfCompare');
type Batch={original:Mesh[];mesh:Mesh};
/** Only the authored static lamp-room timber/metal/stone, never a
 * dynamic sign face, light, collision object or interactive host. */
export function batchCraterLampRoom(root:Group,retainOriginals=false){
 root.updateMatrixWorld(true);
 const inverse=new Matrix4().copy(root.matrixWorld).invert(),bins=new Map<string,Mesh[]>();
 const eligible=(o:Object3D):o is Mesh=>o instanceof Mesh&&!(o as Mesh&{isInstancedMesh?:boolean}).isInstancedMesh&&o.children.length===0&&o.material instanceof MeshStandardMaterial&&o.visible&&o.onBeforeRender===Object3D.prototype.onBeforeRender&&o.onAfterRender===Object3D.prototype.onAfterRender;
 root.traverse(o=>{
  if(!eligible(o))return;
  const g=o.geometry as BufferGeometry;
  const key=[(o.material as MeshStandardMaterial).uuid,o.castShadow,o.receiveShadow,o.layers.mask,o.renderOrder,o.frustumCulled,g.index!==null,Object.keys(g.attributes).sort().map(k=>k+':'+g.attributes[k].itemSize+':'+g.attributes[k].normalized+':'+g.attributes[k].array.constructor.name).join('|')].join('/');
  const a=bins.get(key)??[];a.push(o);bins.set(key,a);
 });
 const batches:Batch[]=[];
 for(const originals of bins.values()){
  if(originals.length<2)continue;
  // Do not hide any retained descendant by batching its parent.
  if(originals.some(o=>{let unsafe=false;o.traverse(x=>{if(x!==o&&x instanceof Mesh&&!eligible(x))unsafe=true;if(x instanceof PointLight)unsafe=true;});return unsafe;}))continue;
  const clones=originals.map(o=>o.geometry.clone().applyMatrix4(new Matrix4().multiplyMatrices(inverse,o.matrixWorld)));
  const g=mergeGeometries(clones);clones.forEach(x=>x.dispose());if(!g)continue;
  g.computeBoundingBox();g.computeBoundingSphere();
  const a=originals[0],m=new Mesh(g,a.material);m.name='p1-lamp-room-batch';m.castShadow=a.castShadow;m.receiveShadow=a.receiveShadow;m.layers.mask=a.layers.mask;m.renderOrder=a.renderOrder;m.frustumCulled=a.frustumCulled;m.updateMatrix();m.matrixAutoUpdate=false;
  root.add(m);batches.push({original:originals,mesh:m});
 }
 const originals=new Set(batches.flatMap(b=>b.original));
 function enable(on:boolean){
  for(const b of batches){b.mesh.visible=on;for(const o of b.original)o.visible=!on;}
 }
 if(retainOriginals)enable(false);
 else{
  // Reparent remaining children (e.g. a singleton trim material) before
  // removal, preserving their exact world transform. Never dispose a
  // shared material or geometry still referenced elsewhere.
  for(const o of originals){
   for(const child of [...o.children])root.attach(child);
   o.removeFromParent();
  }
  const stillUsed=new Set<BufferGeometry>();root.traverse(o=>{if(o instanceof Mesh)stillUsed.add(o.geometry);});
  for(const g of new Set([...originals].map(o=>o.geometry)))if(!stillUsed.has(g))g.dispose();
 }
 return {before:[...originals].length,after:batches.length,enable,retained:retainOriginals};
}

/** Actual Three render-list items, grouped by owning scene branch. The
 * list is diagnostic (shadow/extra passes may differ from renderer.info). */
function renderBreakdown(renderer:WebGLRenderer,scene:Scene,crater:Group){
 const list=renderer.renderLists.get(scene,0),groups=new Map<string,{items:number;triangles:number;transparent:number}>();
 for(const [kind,items] of [['opaque',list.opaque],['transparent',list.transparent],['transmissive',list.transmissive]] as const){
  for(const item of items){
   const o=item.object;
   let top=o,child=o;
   while(top.parent&&top.parent!==scene){child=top;top=top.parent;}
   const key=top===crater||top.name==='underground-domain-host'?(top.name+'/'+(child.name||child.type)):top.name||`${top.type}#${top.id}:${top.children[0]?.name||top.children[0]?.type||''}`;
   const row=groups.get(key)??{items:0,triangles:0,transparent:0};
   row.items++;if(kind!=='opaque')row.transparent++;
   if(o instanceof Mesh&&item.geometry){
    const g=item.geometry,count=g.index?.count??g.getAttribute('position')?.count??0;
    const part=item.group as unknown as {start:number;count:number}|null;
    const start=Math.max(g.drawRange.start,part?.start??0),end=Math.min(count,g.drawRange.start+g.drawRange.count,part?part.start+part.count:Infinity);
    const instances=(o as Mesh&{isInstancedMesh?:boolean;count?:number}).isInstancedMesh?(o as Mesh&{count:number}).count:1;
    row.triangles+=Math.max(0,end-start)/3*instances;
   }
   groups.set(key,row);
  }
 }
 return [...groups].map(([name,v])=>({name,...v})).sort((a,b)=>b.items-a.items);
}
type Lod=(camera:Camera)=>void;
type GPUQuery={query:WebGLQuery;generation:number};
type TimerExtension={TIME_ELAPSED_EXT:number;GPU_DISJOINT_EXT:number};
type Profile={enabled:boolean;camera?:{position:number[];target:number[]};crosslineProbe?:boolean};
type GroundSource={mesh:Mesh;anchor:{east:number;north:number};heightAt:(east:number,north:number)=>number|undefined};
/** A root-owned scene hook, called before Three collects render items.
 * No viewer patch, no changes to physics, night authority or scene
 * geometry. Only finite non-shadow-casting lights whose influence
 * sphere cannot meet the current frustum are excluded for this pass. */
export function installCraterRenderPerf(root:Group,lod:Lod,room?:Group,ground?:GroundSource){
 const exterior=ground?createCraterExteriorOcclusion(ground.mesh,ground.anchor,ground.heightAt):undefined;
 if(exterior)exteriorSessions.set(root,exterior);
 let crosslineProbe=false,culledExterior=0,undergroundProbe:{object:Object3D;visible:boolean}|undefined;
 function restorePresentation(){exterior?.restore();if(undergroundProbe){undergroundProbe.object.visible=undergroundProbe.visible;undergroundProbe=undefined;}}
 const compare=comparison(),batch=room?batchCraterLampRoom(room,compare):undefined;
 let enabled=!compare,scene:Scene|undefined,previousBefore:Scene['onBeforeRender']|undefined,previousAfter:Scene['onAfterRender']|undefined;
 let probe:Profile['camera'],savedPosition:Vector3|undefined,savedQuaternion:Camera['quaternion']|undefined;
 const frustum=new Frustum(),matrix=new Matrix4(),sphere=new Sphere(),lights:PointLight[]=[],masked:{light:PointLight;mask:number}[]=[];
 let started=0,gpu:WebGL2RenderingContext|undefined,ext:TimerExtension|null|undefined,active:WebGLQuery|null=null,pending:GPUQuery[]=[],lastGpu:number|null=null,generation=0;
 let breakdown:ReturnType<typeof renderBreakdown>|undefined;
 const profile=compare;
 const onControl=(event:Event)=>{
  const d=(event as CustomEvent<Profile>).detail;
  if(!d||typeof d.enabled!=='boolean')return;
  enabled=d.enabled;batch?.enable(enabled);probe=d.camera;crosslineProbe=!!d.crosslineProbe&&!!probe;
  if(compare&&exterior&&scene){exterior.refresh(crosslineProbe?scene.children.filter(o=>o!==root&&o.name!=='underground-domain-host'):[]);if(crosslineProbe)exterior.prepare();}
  generation++;breakdown=undefined;lastGpu=null;
 };
 if(compare)document.addEventListener('town-p1-perf-control',onControl);
 function restoreLights(){for(const p of masked)p.light.layers.mask=p.mask;masked.length=0;}
 function before(renderer:WebGLRenderer,s:Scene,camera:Camera,target:unknown){
  (previousBefore as ((...args:unknown[])=>void)|undefined)?.call(s,renderer,s,camera,target);
  if(probe&&probe.position.length===3&&probe.target.length===3&&[...probe.position,...probe.target].every(Number.isFinite)){
   savedPosition=camera.position.clone();savedQuaternion=camera.quaternion.clone();
   camera.position.fromArray(probe.position);camera.lookAt(new Vector3().fromArray(probe.target));camera.updateMatrixWorld(true);
  }
  restoreLights();restorePresentation();culledExterior=0;
  if(profile){
   started=performance.now();lastGpu=null;
   if(ext===undefined){gpu=renderer.getContext() as WebGL2RenderingContext;ext=gpu.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExtension|null;}
   if(ext&&gpu){
    while(pending.length&&gpu.getQueryParameter(pending[0].query,gpu.QUERY_RESULT_AVAILABLE)){
     const entry=pending.shift()!,q=entry.query;if(entry.generation===generation&&!gpu.getParameter(ext.GPU_DISJOINT_EXT))lastGpu=gpu.getQueryParameter(q,gpu.QUERY_RESULT)/1e6;gpu.deleteQuery(q);
    }
    if(pending.length<6){active=gpu.createQuery();if(active)gpu.beginQuery(ext.TIME_ELAPSED_EXT,active);}
   }
  }
  if(!enabled)return;
  lod(camera);
  if(exterior&&exterior.candidates)culledExterior=exterior.begin(camera);
  // Only the explicitly requested camera-only experiment simulates the
  // closed surface-domain presentation; D must supply real domain state.
  if(compare&&crosslineProbe&&probe&&ground){const p=camera.position,h=ground.heightAt(p.x,-p.z);if(Math.hypot(p.x-ground.anchor.east,p.z+ground.anchor.north)<50&&h!==undefined&&p.y>=h+.05&&p.y<=h+4){const u=s.getObjectByName('underground-domain-host');if(u){undergroundProbe={object:u,visible:u.visible};u.visible=false;}}}
  restoreLights();
  frustum.setFromProjectionMatrix(matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
  for(const l of lights){
   if(!l.visible||l.castShadow||l.distance<=0||!Number.isFinite(l.distance))continue;
   sphere.center.setFromMatrixPosition(l.matrixWorld);sphere.radius=l.distance+.10;
   if(l.intensity===0||!frustum.intersectsSphere(sphere)){masked.push({light:l,mask:l.layers.mask});l.layers.mask=0;}
  }
 }
 function after(renderer:WebGLRenderer,s:Scene,camera:Camera){
  if(active&&gpu&&ext){gpu.endQuery(ext.TIME_ELAPSED_EXT);pending.push({query:active,generation});active=null;}
  const excluded=masked.length,undergroundHidden=!!undergroundProbe;restoreLights();restorePresentation();
  if(profile){
   const info=renderer.info;
   const renderCpuMs=performance.now()-started;
   breakdown??=renderBreakdown(renderer,s,root);
   document.dispatchEvent(new CustomEvent('town-p1-render-profile',{detail:{enabled,renderCpuMs,gpuMs:lastGpu,breakdown,draws:info.render.calls,tris:info.render.triangles,geometries:info.memory.geometries,textures:info.memory.textures,excludedLights:excluded,culledExterior,undergroundHidden,crosslineProbe,ringHeight:exterior?.ring?.minHeight,lightCount:lights.length,roomBefore:batch?.before,roomAfter:batch?.after,probe:!!probe,canvas:[renderer.domElement.width,renderer.domElement.height]}}));
  }
  if(savedPosition&&savedQuaternion){camera.position.copy(savedPosition);camera.quaternion.copy(savedQuaternion);camera.updateMatrixWorld(true);savedPosition=undefined;savedQuaternion=undefined;}
  (previousAfter as ((...args:unknown[])=>void)|undefined)?.call(s,renderer,s,camera);
 }
 function detach(){
  restoreLights();restorePresentation();
  if(scene){if(scene.onBeforeRender===before)scene.onBeforeRender=previousBefore!;if(scene.onAfterRender===after)scene.onAfterRender=previousAfter!;}
  scene=undefined;lights.length=0;
  if(gpu){for(const p of pending)gpu.deleteQuery(p.query);}pending=[];ext=undefined;
 }
 function attach(){
  if(!(root.parent instanceof Scene)||scene===root.parent)return;
  detach();scene=root.parent;root.traverse(o=>{if(o instanceof PointLight)lights.push(o);});
  previousBefore=scene.onBeforeRender;previousAfter=scene.onAfterRender;
  scene.onBeforeRender=before;scene.onAfterRender=after;
 }
 root.addEventListener('added',attach);root.addEventListener('removed',detach);attach();
 return {batch,enabled:()=>enabled,dispose(){detach();exteriorSessions.delete(root);root.removeEventListener('added',attach);root.removeEventListener('removed',detach);if(compare)document.removeEventListener('town-p1-perf-control',onControl);}};
}
