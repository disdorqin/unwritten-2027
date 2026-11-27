import {Box3,BufferAttribute,BufferGeometry,Camera,Frustum,Material,Matrix4,Mesh,MeshStandardMaterial,Object3D,Sphere,Vector3,DynamicDrawUsage} from 'three';
import {sphereBehindCraterWall} from './town-r30-crater-perf-occlusion';
type Ring=Parameters<typeof sphereBehindCraterWall>[0];
type Cell={box:Box3;ids:number[];worldBox:Box3;sphere:Sphere};
type Source={mesh:Mesh;attributes:Record<string,unknown>;geometry:BufferGeometry;position:BufferAttribute;index:BufferAttribute;pv:number;iv:number;material:MeshStandardMaterial;world:Matrix4;wholeSphere:Sphere;cells:Cell[];proxy:Mesh;buffer:BufferAttribute;key:string;stable:number;ready:string;request?:{key:string;cells:Cell[];count:number}};
function eligible(o:Object3D):o is Mesh<BufferGeometry,MeshStandardMaterial>{
 if(!(o instanceof Mesh)||(o as Mesh&{isInstancedMesh?:boolean;isSkinnedMesh?:boolean;isBatchedMesh?:boolean}).isInstancedMesh||(o as Mesh&{isSkinnedMesh?:boolean}).isSkinnedMesh||(o as Mesh&{isBatchedMesh?:boolean}).isBatchedMesh||o.children.length||o.castShadow||!o.frustumCulled||!/^crater-(outer|mouth)-.*-all$/.test(o.name)||o.onBeforeRender!==Object3D.prototype.onBeforeRender||o.onAfterRender!==Object3D.prototype.onAfterRender)return false;
 const m=o.material,g=o.geometry,p=g.getAttribute('position'),i=g.index;
 return m instanceof MeshStandardMaterial&&m.visible&&!m.transparent&&!m.wireframe&&m.depthWrite&&m.depthTest&&!m.displacementMap&&!m.clippingPlanes?.length&&m.onBeforeCompile===Material.prototype.onBeforeCompile&&m.customProgramCacheKey===Material.prototype.customProgramCacheKey&&p instanceof BufferAttribute&&i instanceof BufferAttribute&&i.count>=6000&&i.count%3===0&&g.drawRange.start===0&&g.drawRange.count>=i.count&&!g.groups.length&&!Object.keys(g.morphAttributes).length;
}
function visible(o:Object3D,root:Object3D){let p:Object3D|null=o,found=false;while(p&&p.visible){if(p===root)found=true;p=p.parent;}return !p&&found;}
/** Render-only index selection for the authored merged industrial shells.
 * The authoritative Mesh retains the full original indices and all state.
 * A single cached draw uses an exact subset of original indexed triangles. */
export function createCraterIndexCells(root:Object3D,cellSize=24){
 const sources:Source[]=[],queue:Mesh<BufferGeometry,MeshStandardMaterial>[]=[],masked:{mesh:Mesh;mask:number;proxy:Mesh}[]=[];
 const vp=new Matrix4(),frustum=new Frustum(),eye=new Vector3(),v=new Vector3();
 let stats={sources:0,savedTriangles:0,uploads:0};
 let build:{mesh:Mesh<BufferGeometry,MeshStandardMaterial>;g:BufferGeometry;p:BufferAttribute;i:BufferAttribute;pv:number;iv:number;world:Matrix4;bins:Map<string,Cell>;cursor:number}|undefined;
 function restore(){for(const x of masked){x.mesh.layers.mask=x.mask;x.proxy.visible=false;x.proxy.layers.mask=0;}masked.length=0;}
 function register(){root.updateWorldMatrix(true,true);for(const child of root.children)if(['crater-outer-works','crater-mouth-works'].includes(child.name))child.traverse(o=>{if(eligible(o))queue.push(o);});}
 function valid(s:Source){const m=s.mesh,g=s.geometry;return m.geometry===g&&m.material===s.material&&Object.keys(g.attributes).length===Object.keys(s.attributes).length&&Object.entries(s.attributes).every(([n,a])=>g.attributes[n]===a)&&!g.groups.length&&!Object.keys(g.morphAttributes).length&&s.material.depthTest&&s.material.depthWrite&&!s.material.wireframe&&m.onBeforeRender===Object3D.prototype.onBeforeRender&&m.onAfterRender===Object3D.prototype.onAfterRender&&g.getAttribute('position')===s.position&&s.position.version===s.pv&&g.index===s.index&&s.index.version===s.iv&&g.drawRange.start===0&&g.drawRange.count>=s.index.count&&s.material.visible&&!s.material.transparent&&!s.material.displacementMap&&!s.material.clippingPlanes?.length&&s.material.onBeforeCompile===Material.prototype.onBeforeCompile&&s.material.customProgramCacheKey===Material.prototype.customProgramCacheKey&&m.frustumCulled&&!m.castShadow&&m.receiveShadow===s.proxy.receiveShadow&&m.renderOrder===s.proxy.renderOrder&&visible(m,root)&&m.matrixWorld.equals(s.world);}
 function warmStep(maxTriangles=512,maxMs=1){
  if(!build){const m=queue.shift();if(!m||!eligible(m))return;const g=m.geometry,p=g.getAttribute('position') as BufferAttribute,i=g.index!;build={mesh:m,g,p,i,pv:p.version,iv:i.version,world:m.matrixWorld.clone(),bins:new Map(),cursor:0};}
  const b=build,{mesh:m,g,p,i,world,bins}=b;
  if(!eligible(m)||m.geometry!==g||g.getAttribute('position')!==p||g.index!==i||p.version!==b.pv||i.version!==b.iv||!m.matrixWorld.equals(world)){build=undefined;return;}
  const start=performance.now();let work=0;
  for(;b.cursor<i.count&&work<maxTriangles&&performance.now()-start<maxMs;b.cursor+=3,work++){const j=b.cursor;
   const a=i.getX(j),d=i.getX(j+1),c=i.getX(j+2),key=Math.floor((p.getX(a)+p.getX(d)+p.getX(c))/3/cellSize)+','+Math.floor((p.getZ(a)+p.getZ(d)+p.getZ(c))/3/cellSize);
   let bin=bins.get(key);if(!bin){bin={ids:[],box:new Box3(),worldBox:new Box3(),sphere:new Sphere()};bins.set(key,bin);}
   bin.ids.push(a,d,c);for(const k of [a,d,c])bin.box.expandByPoint(v.fromBufferAttribute(p,k));
  }
  if(b.cursor<i.count)return;build=undefined;if(bins.size<2)return;
  for(const bin of bins.values()){bin.worldBox.copy(bin.box).applyMatrix4(world);bin.worldBox.getBoundingSphere(bin.sphere);}
  const geo=new BufferGeometry();for(const [n,a] of Object.entries(g.attributes))geo.setAttribute(n,a);
  const buf=new BufferAttribute(i.array instanceof Uint32Array?new Uint32Array(i.count):new Uint16Array(i.count),1);buf.setUsage(DynamicDrawUsage);geo.setIndex(buf);geo.setDrawRange(0,0);
  g.computeBoundingSphere();if(!g.boundingSphere){for(const n of Object.keys(geo.attributes))geo.deleteAttribute(n);geo.dispose();return;}geo.boundingSphere=g.boundingSphere.clone();const wholeSphere=g.boundingSphere.clone().applyMatrix4(world);
  const proxy=new Mesh(geo,m.material);proxy.name='p4-index-cell-proxy';proxy.visible=false;proxy.layers.mask=0;proxy.matrixAutoUpdate=false;proxy.receiveShadow=m.receiveShadow;proxy.renderOrder=m.renderOrder;proxy.raycast=()=>{};m.add(proxy);proxy.updateWorldMatrix(true,false);
  sources.push({mesh:m,attributes:{...g.attributes},geometry:g,position:p,index:i,pv:p.version,iv:i.version,material:m.material,world,wholeSphere,cells:[...bins.values()],proxy,buffer:buf,key:'',stable:0,ready:''});
 }
 function begin(camera:Camera,ring?:Ring,enabled=true){
  restore();stats={sources:0,savedTriangles:0,uploads:0};frustum.setFromProjectionMatrix(vp.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));eye.setFromMatrixPosition(camera.matrixWorld);
  for(const s of sources){
   s.request=undefined;if(!enabled||!valid(s)||!camera.layers.test(s.mesh.layers)||!frustum.intersectsSphere(s.wholeSphere)){s.key='';s.stable=0;continue;}
   const cells:Cell[]=[],ids:number[]=[];let count=0;
   for(let i=0;i<s.cells.length;i++){const c=s.cells[i];if(!frustum.intersectsBox(c.worldBox)||ring&&sphereBehindCraterWall(ring,eye,c.sphere))continue;cells.push(c);ids.push(i);count+=c.ids.length;}
   if(count>s.index.count*.70||s.index.count-count<6000){s.key='';s.stable=0;continue;}
   const key=ids.join(',')||'empty';s.stable=s.key===key?s.stable+1:1;s.key=key;
   if(count===0||s.ready===key){const mask=s.mesh.layers.mask;masked.push({mesh:s.mesh,mask,proxy:s.proxy});s.mesh.layers.mask=0;if(count){s.proxy.visible=true;s.proxy.layers.mask=mask;}stats.sources++;stats.savedTriangles+=(s.index.count-count)/3;}
   else if(s.stable>=12)s.request={key,cells,count};
  }return stats;
 }
 function warmSelection(){for(const s of sources){const r=s.request;if(!r||r.key===s.ready||!valid(s))continue;let offset=0;for(const c of r.cells){s.buffer.array.set(c.ids,offset);offset+=c.ids.length;}s.buffer.clearUpdateRanges();s.buffer.addUpdateRange(0,r.count);s.buffer.needsUpdate=true;s.proxy.geometry.setDrawRange(0,r.count);s.ready=r.key;stats.uploads++;return;}}
 function dispose(){restore();build=undefined;queue.length=0;for(const s of sources){s.proxy.removeFromParent();for(const n of Object.keys(s.proxy.geometry.attributes))s.proxy.geometry.deleteAttribute(n);s.proxy.geometry.dispose();}sources.length=0;}
 return {register,warmStep,warmSelection,begin,restore,dispose,get pending(){return queue.length+Number(!!build);},get count(){return sources.length;},get stats(){return stats;}};
}
