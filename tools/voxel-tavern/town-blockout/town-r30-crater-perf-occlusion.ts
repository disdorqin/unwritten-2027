import {Box3,BufferAttribute,Camera,InstancedBufferAttribute,InstancedMesh,Material,Matrix4,Mesh,MeshBasicMaterial,MeshLambertMaterial,MeshStandardMaterial,Object3D,Sphere,StaticDrawUsage,Vector3} from 'three';
type Ring=Readonly<{east:number;north:number;radius:number;inradius:number;minHeight:number;segments:number;tight?:boolean}>;
type Ground=(east:number,north:number)=>number|undefined;
const attributeVersion=(p:ReturnType<Mesh['geometry']['getAttribute']>)=>p instanceof BufferAttribute?p.version:p.data.version;
const authoredWallShaders=new WeakMap<MeshStandardMaterial,MeshStandardMaterial['onBeforeCompile']>();
/** Only the authored crater surface may certify its color/roughness-only shader. */
export function registerCraterOpaqueWallShader(material:MeshStandardMaterial){authoredWallShaders.set(material,material.onBeforeCompile);}
function wallMaterial(m:Mesh['material']):m is MeshStandardMaterial{return m instanceof MeshStandardMaterial&&!m.transparent&&!m.wireframe&&m.depthWrite&&m.depthTest&&m.colorWrite&&m.alphaTest===0&&!m.alphaToCoverage&&!m.displacementMap&&!m.clippingPlanes?.length&&(m.onBeforeCompile===Material.prototype.onBeforeCompile||authoredWallShaders.get(m)===m.onBeforeCompile);}

/** A closed, opaque polygon barrier certified against the FINAL cut walk
 * triangles, not a height estimate or a cylindrical proxy. Every edge
 * must be covered by a union of triangle intersections. The minimum
 * interpolated surface height on all those intersections is conservative. */
export function certifyCraterWallRing(mesh:Mesh,east:number,north:number,radius=52,segments=64):Ring|undefined{
 if(![east,north,radius,segments].every(Number.isFinite)||radius<=0||segments<16||!Number.isInteger(segments))return;
 const material=mesh.material;
 if(!wallMaterial(material)||mesh.geometry.morphAttributes.position?.length)return;
 mesh.updateWorldMatrix(true,false);
 const g=mesh.geometry,p=g.getAttribute('position'),index=g.index;
 if(!p||p.itemSize!==3||!index||g.drawRange.start!==0||g.drawRange.count<index.count)return;
 const world=new Float64Array(p.count*3),v=new Vector3();
 for(let i=0;i<p.count;i++)v.fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld).toArray(world,i*3);
 const rim=Array.from({length:segments},(_,i)=>[east+radius*Math.cos(i*2*Math.PI/segments),-north+radius*Math.sin(i*2*Math.PI/segments)]);
 let minHeight=Infinity;
 for(let k=0;k<segments;k++){
  const [sx,sz]=rim[k],[ex,ez]=rim[(k+1)%segments];
  const lowX=Math.min(sx,ex)-1e-7,highX=Math.max(sx,ex)+1e-7,lowZ=Math.min(sz,ez)-1e-7,highZ=Math.max(sz,ez)+1e-7;
  const intervals:[number,number][]=[];
  for(let i=0;i<index.count;i+=3){
   const a=index.getX(i)*3,b=index.getX(i+1)*3,c=index.getX(i+2)*3;
   const ax=world[a],az=world[a+2],bx=world[b],bz=world[b+2],cx=world[c],cz=world[c+2];
   if(Math.max(ax,bx,cx)<lowX||Math.min(ax,bx,cx)>highX||Math.max(az,bz,cz)<lowZ||Math.min(az,bz,cz)>highZ)continue;
   const det=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);
   if(Math.abs(det)<1e-12)continue;
   const u=(x:number,z:number)=>((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/det;
   const w=(x:number,z:number)=>((cz-az)*(x-cx)+(ax-cx)*(z-cz))/det;
   const u0=u(sx,sz),u1=u(ex,ez),v0=w(sx,sz),v1=w(ex,ez);
   let lo=0,hi=1;
   for(const [start,end] of [[u0,u1],[v0,v1],[1-u0-v0,1-u1-v1]]){
    const slope=end-start;
    if(Math.abs(slope)<1e-13){if(start< -1e-9){lo=2;break;}}
    else if(slope>0)lo=Math.max(lo,(-1e-9-start)/slope);
    else hi=Math.min(hi,(-1e-9-start)/slope);
   }
   if(lo>hi||lo>1||hi<0)continue;
   lo=Math.max(0,lo);hi=Math.min(1,hi);
   const height=(t:number)=>{const u=u0+(u1-u0)*t,v=v0+(v1-v0)*t;return u*world[a+1]+v*world[b+1]+(1-u-v)*world[c+1];};
   minHeight=Math.min(minHeight,height(lo),height(hi));intervals.push([lo,hi]);
  }
  intervals.sort((a,b)=>a[0]-b[0]);
  let reach=0;
  for(const [a,b] of intervals){if(a>reach+1e-7)break;reach=Math.max(reach,b);}
  if(reach<1-1e-7)return; // Any hole fails open, never culls the world.
 }
 if(!Number.isFinite(minHeight))return;
 return {east,north,radius,inradius:radius*Math.cos(Math.PI/segments),minHeight:minHeight-.12,segments};
}

/** If EVERY point of a bounding sphere is beyond the closed wall, every
 * camera ray to it must cross the certified polygon. The maximum possible
 * crossing height is bounded using the farthest wall point and nearest
 * point of the sphere. If that bound is below the wall, the mesh cannot
 * contribute a visible pixel. Tall skyline and near/partly visible objects
 * are deliberately retained. */
export function sphereBehindCraterWall(ring:Ring,eye:Vector3,sphere:Sphere){
 const eyeR=Math.hypot(eye.x-ring.east,eye.z+ring.north),r=sphere.radius,c=sphere.center;
 if(![eye.x,eye.y,eye.z,r,c.x,c.y,c.z].every(Number.isFinite)||r<0||eyeR>=ring.inradius-.5||eye.y>=ring.minHeight-.35)return false;
 if(Math.hypot(c.x-ring.east,c.z+ring.north)-r<=ring.radius+.5)return false;
 const dx=c.x-eye.x,dz=c.z-eye.z,centerDistance=Math.hypot(dx,dz),distance=centerDistance-r;
 if(distance<=0)return false;
 let maxExit=ring.radius+eyeR;
 if(ring.tight!==false&&eyeR>1e-8){
  // All horizontal rays to the sphere lie in an angular cone of
  // half-angle asin(r/centerDistance). Minimize e·u over that cone,
  // then use the positive circle-exit root (the certified polygon
  // lies INSIDE the circle). This is an upper bound on every exit.
  const ex=eye.x-ring.east,ez=eye.z+ring.north,ux=dx/centerDistance,uz=dz/centerDistance;
  const sn=Math.min(1,r/centerDistance),cs=Math.sqrt(Math.max(0,1-sn*sn));
  const dot=ex*ux+ez*uz,cross=Math.abs(ex*uz-ez*ux);
  const minDot=dot<=-eyeR*cs?-eyeR:Math.max(-eyeR,dot*cs-cross*sn-1e-7);
  const exit=-minDot+Math.sqrt(Math.max(0,minDot*minDot+ring.radius*ring.radius-eyeR*eyeR));
  maxExit=Math.min(maxExit,exit+1e-6);
 }
 const t=Math.min(1,maxExit/distance);
 const crossing=eye.y+Math.max(0,c.y+r-eye.y)*t;
 return crossing<ring.minHeight-.35;
}

function opaqueMesh(o:Object3D):o is Mesh{
 if(!(o instanceof Mesh)||!o.frustumCulled||o.castShadow||o.geometry.morphAttributes.position?.length||o.onBeforeRender!==Object3D.prototype.onBeforeRender||o.onAfterRender!==Object3D.prototype.onAfterRender)return false;
 const flags=o as Mesh&{isInstancedMesh?:boolean;isSkinnedMesh?:boolean;isBatchedMesh?:boolean};
 if(flags.isSkinnedMesh||flags.isBatchedMesh)return false;
 if(flags.isInstancedMesh){
  const m=o as InstancedMesh;
  // Small sources never enter the existing >=24 instance-cell partition.
  // A whole-source conservative bound can eliminate their draw entirely.
  if(m.count<1||m.count>=24||m.instanceMatrix.usage!==StaticDrawUsage||m.morphTexture!==null||Object.values(m.geometry.attributes).some(a=>a instanceof InstancedBufferAttribute))return false;
 }
 const mats=Array.isArray(o.material)?o.material:[o.material];
 return mats.every(m=>(m instanceof MeshStandardMaterial||m instanceof MeshLambertMaterial||m instanceof MeshBasicMaterial)&&m.depthTest&&m.depthWrite&&!m.transparent&&!m.wireframe&&
  !(m as MeshStandardMaterial).displacementMap&&m.onBeforeCompile===Material.prototype.onBeforeCompile);
}

/** Render-only, explicitly registered scene roots; never touches physics,
 * geometry, material, authority or visibility flags. A new object that
 * has not yet been registered remains visible. All layer masks restored
 * after the render pass. Small static instance sets use their complete
 * transformed geometry bounds; dynamic instancing/skinning excluded. */
export function createCraterExteriorOcclusion(mesh:Mesh,anchor:{east:number;north:number},heightAt:Ground){
 let ring:Ring|undefined,certified=false,objects:Mesh[]=[],warmCursor=0;
 type Certificate={geometry:Mesh['geometry'];position:ReturnType<Mesh['geometry']['getAttribute']>;positionVersion:number;index:NonNullable<Mesh['geometry']['index']>;indexVersion:number;world:Matrix4;material:MeshStandardMaterial;side:number;shader:MeshStandardMaterial['onBeforeCompile']};
 let certificate:Certificate|undefined;
 function certificateCurrent(){const c=certificate,g=mesh.geometry,p=g.getAttribute('position');return !!c&&g===c.geometry&&p===c.position&&attributeVersion(p)===c.positionVersion&&g.index===c.index&&c.index.version===c.indexVersion&&g.drawRange.start===0&&g.drawRange.count>=c.index.count&&mesh.matrixWorld.equals(c.world)&&wallMaterial(mesh.material)&&mesh.material===c.material&&mesh.material.side===c.side&&mesh.material.onBeforeCompile===c.shader&&!g.morphAttributes.position?.length;}
 function prepare(){
  if(!certified){ring=certifyCraterWallRing(mesh,anchor.east,anchor.north);certified=true;const g=mesh.geometry,p=g.getAttribute('position');
   if(ring&&p&&g.index&&wallMaterial(mesh.material))certificate={geometry:g,position:p,positionVersion:attributeVersion(p),index:g.index,indexVersion:g.index.version,world:mesh.matrixWorld.clone(),material:mesh.material,side:mesh.material.side,shader:mesh.material.onBeforeCompile};}
  return certificateCurrent()?ring:undefined;
 }
 const roots=new Set<Object3D>(),masked:{mesh:Mesh;mask:number}[]=[];
 const eye=new Vector3(),box=new Box3(),instance=new Matrix4(),part=new Box3();
 type Bound={geometry:Mesh['geometry'];position:ReturnType<Mesh['geometry']['getAttribute']>;version:number;world:Matrix4;instanceAttribute?:InstancedMesh['instanceMatrix'];matrixVersion?:number;count?:number;sphere:Sphere};
 const bounds=new WeakMap<Mesh,Bound>();
 const geometryBounds=new WeakMap<Mesh['geometry'],{position:Bound['position'];version:number;box:Box3}>();
 function worldBound(o:Mesh,allowBuild=true){
  const g=o.geometry,p=g.getAttribute('position');if(!p)return;
  const version=p instanceof BufferAttribute?p.version:p.data.version;
  const m=o instanceof InstancedMesh?o:undefined,old=bounds.get(o);
  if(old&&old.geometry===g&&old.position===p&&old.version===version&&old.world.equals(o.matrixWorld)&&old.instanceAttribute===m?.instanceMatrix&&old.matrixVersion===m?.instanceMatrix.version&&old.count===m?.count)return old.sphere;
  if(!allowBuild)return;
  // Recompute from actual attributes, not a potentially stale cached box.
  let local=geometryBounds.get(g);
  if(!local||local.position!==p||local.version!==version){g.computeBoundingBox();if(!g.boundingBox||g.boundingBox.isEmpty())return;local={position:p,version,box:g.boundingBox.clone()};geometryBounds.set(g,local);}
  box.makeEmpty();
  if(m){for(let i=0;i<m.count;i++){m.getMatrixAt(i,instance);if(!instance.elements.every(Number.isFinite))return;box.union(part.copy(local.box).applyMatrix4(instance));}}else box.copy(local.box);
  const result=box.applyMatrix4(o.matrixWorld).getBoundingSphere(new Sphere());
  if(![result.center.x,result.center.y,result.center.z,result.radius].every(Number.isFinite))return;
  bounds.set(o,{geometry:g,position:p,version,world:o.matrixWorld.clone(),instanceAttribute:m?.instanceMatrix,matrixVersion:m?.instanceMatrix.version,count:m?.count,sphere:result});return result;
 }
 const restore=()=>{for(const x of masked)x.mesh.layers.mask=x.mask;masked.length=0;};
 function refresh(input:readonly Object3D[]){
  restore();roots.clear();for(const r of input)roots.add(r);
  // Lifecycle refresh is the explicit opportunity to recertify a replaced
  // wall. During render, invalidation only disables the optimization.
  if(certified&&!certificateCurrent()){certified=false;certificate=undefined;ring=undefined;}
  const set=new Set<Mesh>();
  for(const root of roots)root.traverse(o=>{if(o!==mesh&&opaqueMesh(o))set.add(o);});
  // Small sources first: they were absent from the previous cell warmup.
  objects=[...set].sort((a,b)=>Number(b instanceof InstancedMesh)-Number(a instanceof InstancedMesh));warmCursor=0;
 }
 function warmBounds(maxObjects=48,maxMs=1){
  const started=performance.now();let n=0;
  while(warmCursor<objects.length&&n<maxObjects&&performance.now()-started<maxMs){
   const o=objects[warmCursor++];n++;if(o.parent&&opaqueMesh(o))worldBound(o);
  }
  return n;
 }
 function ringForCamera(camera:Camera,tight=true){
  eye.setFromMatrixPosition(camera.matrixWorld);
  if(Math.hypot(eye.x-anchor.east,eye.z+anchor.north)>=50||!mesh.visible||!camera.layers.test(mesh.layers)||Array.isArray(mesh.material)||!mesh.material.visible||mesh.material.clippingPlanes?.length)return;
  const h=heightAt(eye.x,-eye.z);if(h===undefined||eye.y<h+.05||eye.y>h+4)return;
  let node:Object3D|null=mesh;while(node){if(!node.visible)return;node=node.parent;}
  const active=prepare();
  if(active&&eye.y<active.minHeight-.35)return tight?active:{...active,tight:false};
 }
 let smallInstanceCulled=0;
 function begin(camera:Camera,smallInstances=true,maxBuildMs=Infinity,excludedRoot?:Object3D,tight=true){
  restore();smallInstanceCulled=0;const activeRing=ringForCamera(camera,tight);if(!activeRing)return 0;
  const started=performance.now();
  for(const o of objects){
   if(!o.parent||!o.visible||!camera.layers.test(o.layers)||!opaqueMesh(o)||(!smallInstances&&o instanceof InstancedMesh))continue;
   let p:Object3D|null=o,approved=false,excluded=false;while(p&&p.visible){if(roots.has(p))approved=true;if(p===excludedRoot)excluded=true;p=p.parent;}if(p||!approved||excluded)continue;
   // Cache misses fail open once this frame's build budget is exhausted.
   const b=worldBound(o,performance.now()-started<maxBuildMs);if(!b)continue;
   if(sphereBehindCraterWall(activeRing,eye,b)){masked.push({mesh:o,mask:o.layers.mask});o.layers.mask=0;if(o instanceof InstancedMesh)smallInstanceCulled++;}
  }
  return masked.length;
 }
 return {refresh,begin,restore,prepare,ringForCamera,warmBounds,get pendingBounds(){return objects.length-warmCursor;},get ring(){return certificateCurrent()?ring:undefined;},get candidates(){return objects.length;},get smallInstanceCulled(){return smallInstanceCulled;}};
}

/** M calls this with real domain/transition/cover state, never a camera
 * height guess. Keep the shaft presentation when the cover is open or
 * an accepted descent/return/blackout is in flight. Sync/authority is
 * intentionally not paused here. */
export function applyCraterUndergroundRenderGate(parent:Object3D,state:{known:boolean;inMine:boolean;transition:boolean;coverOpen:boolean}){
 parent.visible=!state.known||state.inMine||state.transition||state.coverOpen;
 return parent.visible;
}
