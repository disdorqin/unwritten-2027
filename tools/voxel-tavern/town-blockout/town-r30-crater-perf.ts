import {BufferGeometry,Camera,Frustum,Group,Matrix4,Mesh,MeshStandardMaterial,Object3D,PointLight,Scene,Sphere,Vector3,WebGLRenderer} from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createCraterExteriorOcclusion} from './town-r30-crater-perf-occlusion';
import {createCraterInstanceCells} from './town-r30-crater-perf-instances';
import {createCraterGroundCells} from './town-r30-crater-perf-ground';
import {createCraterStaticMeshBatches} from './town-r30-crater-perf-static-batches';
import {createCraterInstanceBatches} from './town-r30-crater-perf-instance-batches';
import {createCraterPropBatches} from './town-r30-crater-perf-prop-batches';
const localWallRoots=new Set(['crater-outer-works','crater-mouth-works','za31-crater-camp','za31-crater-rim-clusters','za36-crater-ejecta-landmarks','za36-crater-midground','crater-density-a2','meteor-crater-west-ground','za31-crater-entrance']);
const exteriorProps=new WeakMap<Group,ReturnType<typeof createCraterPropBatches>>();
const exteriorCoalescers=new WeakMap<Group,ReturnType<typeof createCraterInstanceBatches>>();
const sceneLightRefresh=new WeakMap<Group,()=>void>();
const exteriorCells=new WeakMap<Group,ReturnType<typeof createCraterInstanceCells>>();
const exteriorSessions=new WeakMap<Group,ReturnType<typeof createCraterExteriorOcclusion>>();
/** D registers explicitly approved exterior roots after normal scene assembly. */
export function setCraterExteriorRenderRoots(root:Group,roots:readonly Object3D[]){const session=exteriorSessions.get(root);if(!session)return false;const coalescer=exteriorCoalescers.get(root),props=exteriorProps.get(root);coalescer?.dispose();props?.dispose();session.refresh([...roots,...root.children.filter(o=>localWallRoots.has(o.name))]);session.prepare();exteriorCells.get(root)?.replaceRoots(roots);coalescer?.register(roots);props?.register(roots);sceneLightRefresh.get(root)?.();return !!session.ring;}

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
 const list=renderer.renderLists.get(scene,0),groups=new Map<string,{items:number;triangles:number;transparent:number}>(),details=new Map<string,{items:number;triangles:number;instanced:number}>();
 for(const [kind,items] of [['opaque',list.opaque],['transparent',list.transparent],['transmissive',list.transmissive]] as const){
  for(const item of items){
   const o=item.object;
   let top=o,child=o;
   while(top.parent&&top.parent!==scene){child=top;top=top.parent;}
   const key=top===crater||top.name==='underground-domain-host'?(top.name+'/'+(child.name||child.type)):top.name||`${top.type}#${top.id}:${top.children[0]?.name||top.children[0]?.type||''}`;
   const row=groups.get(key)??{items:0,triangles:0,transparent:0};
   row.items++;if(kind!=='opaque')row.transparent++;
   const detailKey=(top.name||('Group#'+top.id))+'/'+(child.name||child.children[0]?.name||child.type)+'/'+o.type;
   const detail=details.get(detailKey)??{items:0,triangles:0,instanced:0};detail.items++;if((o as Mesh&{isInstancedMesh?:boolean}).isInstancedMesh)detail.instanced++;details.set(detailKey,detail);
   if(o instanceof Mesh&&item.geometry){
    const g=item.geometry,count=g.index?.count??g.getAttribute('position')?.count??0;
    const part=item.group as unknown as {start:number;count:number}|null;
    const start=Math.max(g.drawRange.start,part?.start??0),end=Math.min(count,g.drawRange.start+g.drawRange.count,part?part.start+part.count:Infinity);
    const instances=(o as Mesh&{isInstancedMesh?:boolean;count?:number}).isInstancedMesh?(o as Mesh&{count:number}).count:1;
    const tris=Math.max(0,end-start)/3*instances;row.triangles+=tris;detail.triangles+=tris;
   }
   groups.set(key,row);
  }
 }
 return {groups:[...groups].map(([name,v])=>({name,...v})).sort((a,b)=>b.items-a.items),details:[...details].map(([name,v])=>({name,...v})).sort((a,b)=>b.items-a.items)};
}
type Lod=(camera:Camera)=>void;
type GPUQuery={query:WebGLQuery;generation:number};
type TimerExtension={TIME_ELAPSED_EXT:number;GPU_DISJOINT_EXT:number};
type Profile={enabled:boolean;camera?:{position:number[];target:number[]};crosslineProbe?:boolean;p2Enabled?:boolean;p3Enabled?:boolean;globalLights?:boolean;smallInstances?:boolean;coalesceInstances?:boolean;propBatches?:boolean;localWall?:boolean;compactCells?:boolean};
type GroundSource={mesh:Mesh;anchor:{east:number;north:number};heightAt:(east:number,north:number)=>number|undefined};
/** A root-owned scene hook, called before Three collects render items.
 * No viewer patch, no changes to physics, night authority or scene
 * geometry. Only finite non-shadow-casting lights whose influence
 * sphere cannot meet the current frustum are excluded for this pass. */
export function installCraterRenderPerf(root:Group,lod:Lod,room?:Group,ground?:GroundSource){
 const exterior=ground?createCraterExteriorOcclusion(ground.mesh,ground.anchor,ground.heightAt):undefined;
 const localCells=createCraterInstanceCells(24,8),externalCells=createCraterInstanceCells(32,24);
 const localStatic=createCraterStaticMeshBatches(16),externalStatic=createCraterStaticMeshBatches(20);
 const coalescer=createCraterInstanceBatches(96),props=createCraterPropBatches(48);
 let groundCells:ReturnType<typeof createCraterGroundCells>;
 if(exterior){exteriorSessions.set(root,exterior);exteriorCells.set(root,externalCells);}
 let crosslineProbe=false,culledExterior=0,undergroundProbe:{object:Object3D;visible:boolean}|undefined;
 function restorePresentation(){props.restore();coalescer.restore();localStatic.restore();externalStatic.restore();localCells.restore();externalCells.restore();groundCells?.restore();exterior?.restore();if(undergroundProbe){undergroundProbe.object.visible=undergroundProbe.visible;undergroundProbe=undefined;}}
 const compare=comparison(),batch=room?batchCraterLampRoom(room,compare):undefined;
 if(!compare&&exterior&&typeof location!=='undefined'&&new URLSearchParams(location.search).has('pCoalesceCandidate'))exteriorCoalescers.set(root,coalescer);
 if(!compare&&exterior)exteriorProps.set(root,props);
 let enabled=!compare,p2Enabled=!compare,p3Enabled=!compare,globalLights=!compare,scene:Scene|undefined,previousBefore:Scene['onBeforeRender']|undefined,previousAfter:Scene['onAfterRender']|undefined;
 let probe:Profile['camera'],savedPosition:Vector3|undefined,savedQuaternion:Camera['quaternion']|undefined;
 const frustum=new Frustum(),matrix=new Matrix4(),sphere=new Sphere(),lights:PointLight[]=[],externalLights:PointLight[]=[],masked:{light:PointLight;mask:number}[]=[];
 let started=0,gpu:WebGL2RenderingContext|undefined,ext:TimerExtension|null|undefined,active:WebGLQuery|null=null,pending:GPUQuery[]=[],lastGpu:number|null=null,generation=0;
 let breakdown:ReturnType<typeof renderBreakdown>|undefined;
 const profile=compare||(typeof location!=='undefined'&&new URLSearchParams(location.search).has('profile')&&new URLSearchParams(location.search).has('pPerfMeasure'));
 let externalExcluded=0,consideredLights=0,smallInstances=true,coalesceInstances=exteriorCoalescers.has(root),propBatches=true,localWall=true,compactCells=true;
 function refreshSceneLights(){
  externalLights.length=0;if(!scene)return;
  const local=new Set(lights);
  scene.traverse(o=>{if(o instanceof PointLight&&!local.has(o))externalLights.push(o);});
 }
 sceneLightRefresh.set(root,refreshSceneLights);
 const onControl=(event:Event)=>{
  const d=(event as CustomEvent<Profile>).detail;
  if(!d||typeof d.enabled!=='boolean')return;
  smallInstances=d.smallInstances??true;coalesceInstances=exteriorCoalescers.has(root)&&(d.coalesceInstances??true);propBatches=d.propBatches??true;localWall=d.localWall??true;compactCells=d.compactCells??true;
  if(!compare){probe=d.camera;globalLights=d.globalLights??true;generation++;breakdown=undefined;lastGpu=null;return;}
  enabled=d.enabled;p2Enabled=d.p2Enabled??d.enabled;p3Enabled=d.p3Enabled??p2Enabled;globalLights=d.globalLights??p3Enabled;if(globalLights&&!externalLights.length)refreshSceneLights();batch?.enable(enabled);probe=d.camera;crosslineProbe=!!d.crosslineProbe&&!!probe;
  if(compare&&exterior&&scene){const roots=crosslineProbe?scene.children.filter(o=>o!==root&&o.name!=='underground-domain-host'):[];exterior.refresh(roots);externalCells.replaceRoots(roots);if(crosslineProbe){exterior.prepare();if(p2Enabled)externalCells.register(roots);}if(p3Enabled&&crosslineProbe){externalStatic.register(roots);externalStatic.warmAll();}else externalStatic.dispose();}
  generation++;breakdown=undefined;lastGpu=null;
 };
 if(profile)document.addEventListener('town-p1-perf-control',onControl);
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
  if(exterior&&exterior.candidates)culledExterior=exterior.begin(camera,smallInstances,compare?Infinity:1,localWall&&!compare?undefined:root);
  // Only the explicitly requested camera-only experiment simulates the
  // closed surface-domain presentation; D must supply real domain state.
  if(compare&&crosslineProbe&&probe&&ground){const p=camera.position,h=ground.heightAt(p.x,-p.z);if(Math.hypot(p.x-ground.anchor.east,p.z+ground.anchor.north)<50&&h!==undefined&&p.y>=h+.05&&p.y<=h+4){const u=s.getObjectByName('underground-domain-host');if(u){undergroundProbe={object:u,visible:u.visible};u.visible=false;}}}
  if(p2Enabled){const ring=exterior?.ringForCamera(camera);localCells.begin(camera,localWall&&!compare?ring:undefined,localWall,compactCells&&!compare);if(!compare||crosslineProbe)externalCells.begin(camera,ring,localWall,compactCells&&!compare);groundCells?.begin(camera);}
  if(compare&&p3Enabled){localStatic.begin(camera);if(crosslineProbe)externalStatic.begin(camera);}
  if(!compare&&coalesceInstances)coalescer.begin(camera);
  if(!compare&&propBatches)props.begin(camera);
  restoreLights();
  frustum.setFromProjectionMatrix(matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
  externalExcluded=0;consideredLights=0;
  function cullLight(l:PointLight,external:boolean){
   // Verify the light still belongs to this scene, and don't touch hidden
   // ancestors, shadow sources or unbounded lights. Three's finite
   // point-light attenuation is exactly zero outside its cutoff sphere.
   let p:Object3D|null=l;
   while(p&&p!==s&&p.visible)p=p.parent;
   if(p!==s||!camera.layers.test(l.layers)||l.castShadow||l.distance<=0||!Number.isFinite(l.distance))return;
   consideredLights++;
   sphere.center.setFromMatrixPosition(l.matrixWorld);sphere.radius=l.distance+.10;
   if(l.intensity===0||!frustum.intersectsSphere(sphere)){masked.push({light:l,mask:l.layers.mask});l.layers.mask=0;if(external)externalExcluded++;}
  }
  for(const l of lights)cullLight(l,false);
  if(globalLights)for(const l of externalLights)cullLight(l,true);
 }
 function after(renderer:WebGLRenderer,s:Scene,camera:Camera){
  if(active&&gpu&&ext){gpu.endQuery(ext.TIME_ELAPSED_EXT);pending.push({query:active,generation});active=null;}
  const excluded=masked.length,undergroundHidden=!!undergroundProbe;restoreLights();restorePresentation();
  if(profile){
   const info=renderer.info;
   const renderCpuMs=performance.now()-started;
   breakdown??=renderBreakdown(renderer,s,root);
   document.dispatchEvent(new CustomEvent('town-p1-render-profile',{detail:{enabled,p2Enabled,p3Enabled,localStatic:p3Enabled?localStatic.stats:null,externalStatic:p3Enabled&&(!compare||crosslineProbe)?externalStatic.stats:null,localCells:p2Enabled?localCells.stats:null,externalCells:p2Enabled&&(!compare||crosslineProbe)?externalCells.stats:null,pendingCells:localCells.pendingSources+externalCells.pendingSources,pendingOcclusionBounds:exterior?.pendingBounds??0,pendingCoalesced:coalescer.pending,coalesced:coalesceInstances?coalescer.stats:null,coalescedReady:coalescer.count,pendingProps:props.pending,propsReady:props.count,props:propBatches?props.stats:null,groundSaved:p2Enabled?groundCells?.savedTriangles:0,renderCpuMs,gpuMs:lastGpu,breakdown:breakdown.groups,breakdownDetails:breakdown.details,draws:info.render.calls,tris:info.render.triangles,geometries:info.memory.geometries,textures:info.memory.textures,excludedLights:excluded,externalExcluded,consideredLights,globalLights,externalLightCount:externalLights.length,culledExterior,localWall,compactCells,smallInstances,smallInstanceCulled:exterior?.smallInstanceCulled??0,undergroundHidden,crosslineProbe,ringHeight:exterior?.ring?.minHeight,lightCount:lights.length,roomBefore:batch?.before,roomAfter:batch?.after,probe:!!probe,canvas:[renderer.domElement.width,renderer.domElement.height]}}));
  }
  if(savedPosition&&savedQuaternion){camera.position.copy(savedPosition);camera.quaternion.copy(savedQuaternion);camera.updateMatrixWorld(true);savedPosition=undefined;savedQuaternion=undefined;}
  if(!compare){if(localCells.pendingSources)localCells.warmStep(800,1);else if(externalCells.pendingSources)externalCells.warmStep(1400,2);if(exterior?.pendingBounds)exterior.warmBounds(48,1);if(coalescer.pending)coalescer.warmStep(1,1);if(props.pending)props.warmStep(2,1);if(compactCells&&!localCells.pendingSources&&!externalCells.pendingSources){localCells.warmCompacts(128,.5);externalCells.warmCompacts(256,1);}}
  (previousAfter as ((...args:unknown[])=>void)|undefined)?.call(s,renderer,s,camera);
 }
 function detach(){
  restoreLights();restorePresentation();
  if(scene){if(scene.onBeforeRender===before)scene.onBeforeRender=previousBefore!;if(scene.onAfterRender===after)scene.onAfterRender=previousAfter!;}
  scene=undefined;lights.length=0;externalLights.length=0;
  if(gpu){for(const p of pending)gpu.deleteQuery(p.query);}pending=[];ext=undefined;
 }
 function attach(){
  if(!(root.parent instanceof Scene)||scene===root.parent)return;
  detach();scene=root.parent;root.traverse(o=>{if(o instanceof PointLight)lights.push(o);});
  if(compare)localCells.register([root]);else localCells.enqueue([root]);
  if(compare){localStatic.register(root.children.filter(o=>['crater-outer-works','crater-mouth-works'].includes(o.name)));localStatic.warmAll();}if(ground&&!groundCells)groundCells=createCraterGroundCells(ground.mesh);
  previousBefore=scene.onBeforeRender;previousAfter=scene.onAfterRender;
  scene.onBeforeRender=before;scene.onAfterRender=after;
 }
 root.addEventListener('added',attach);root.addEventListener('removed',detach);attach();
 return {batch,enabled:()=>enabled,refreshSceneLights,dispose(){detach();props.dispose();exteriorProps.delete(root);coalescer.dispose();exteriorCoalescers.delete(root);localCells.dispose();externalCells.dispose();localStatic.dispose();externalStatic.dispose();groundCells?.dispose();exteriorSessions.delete(root);exteriorCells.delete(root);sceneLightRefresh.delete(root);root.removeEventListener('added',attach);root.removeEventListener('removed',detach);if(profile)document.removeEventListener('town-p1-perf-control',onControl);}};
}
