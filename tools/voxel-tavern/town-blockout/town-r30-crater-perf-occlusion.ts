import {Box3,Camera,Material,Mesh,MeshBasicMaterial,MeshLambertMaterial,MeshStandardMaterial,Object3D,Sphere,Vector3} from 'three';
type Ring=Readonly<{east:number;north:number;radius:number;inradius:number;minHeight:number;segments:number}>;
type Ground=(east:number,north:number)=>number|undefined;

/** A closed, opaque polygon barrier certified against the FINAL cut walk
 * triangles, not a height estimate or a cylindrical proxy. Every edge
 * must be covered by a union of triangle intersections. The minimum
 * interpolated surface height on all those intersections is conservative. */
export function certifyCraterWallRing(mesh:Mesh,east:number,north:number,radius=52,segments=64):Ring|undefined{
 if(![east,north,radius,segments].every(Number.isFinite)||radius<=0||segments<16||!Number.isInteger(segments))return;
 const material=mesh.material;
 if(!(material instanceof MeshStandardMaterial)||material.transparent||material.wireframe||!material.depthWrite||material.alphaTest>0||material.displacementMap)return;
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
 const distance=Math.hypot(c.x-eye.x,c.z-eye.z)-r;
 if(distance<=0)return false;
 const t=Math.min(1,(ring.radius+eyeR)/distance);
 const crossing=eye.y+Math.max(0,c.y+r-eye.y)*t;
 return crossing<ring.minHeight-.35;
}

function opaqueMesh(o:Object3D):o is Mesh{
 if(!(o instanceof Mesh)||!o.frustumCulled||o.castShadow||o.geometry.morphAttributes.position?.length||o.onBeforeRender!==Object3D.prototype.onBeforeRender||o.onAfterRender!==Object3D.prototype.onAfterRender)return false;
 const flags=o as Mesh&{isInstancedMesh?:boolean;isSkinnedMesh?:boolean;isBatchedMesh?:boolean};
 if(flags.isInstancedMesh||flags.isSkinnedMesh||flags.isBatchedMesh)return false;
 const mats=Array.isArray(o.material)?o.material:[o.material];
 return mats.every(m=>(m instanceof MeshStandardMaterial||m instanceof MeshLambertMaterial||m instanceof MeshBasicMaterial)&&m.depthTest&&m.depthWrite&&!m.transparent&&!m.wireframe&&
  !(m as MeshStandardMaterial).displacementMap&&m.onBeforeCompile===Material.prototype.onBeforeCompile);
}

/** Render-only, explicitly registered scene roots; never touches physics,
 * geometry, material, authority or visibility flags. A new object that
 * has not yet been registered remains visible. All layer masks restored
 * after the render pass. Dynamic instancing/skinning excluded. */
export function createCraterExteriorOcclusion(mesh:Mesh,anchor:{east:number;north:number},heightAt:Ground){
 let ring:Ring|undefined,certified=false,objects:Mesh[]=[];
 function prepare(){if(!certified){ring=certifyCraterWallRing(mesh,anchor.east,anchor.north);certified=true;}return ring;}
 const roots=new Set<Object3D>(),masked:{mesh:Mesh;mask:number}[]=[];
 const eye=new Vector3(),sphere=new Sphere(),box=new Box3();
 const restore=()=>{for(const x of masked)x.mesh.layers.mask=x.mask;masked.length=0;};
 function refresh(input:readonly Object3D[]){
  restore();roots.clear();for(const r of input)roots.add(r);
  const set=new Set<Mesh>();
  for(const root of roots)root.traverse(o=>{if(o!==mesh&&opaqueMesh(o))set.add(o);});
  objects=[...set];
 }
 function begin(camera:Camera){
  restore();eye.setFromMatrixPosition(camera.matrixWorld);
  if(Math.hypot(eye.x-anchor.east,eye.z+anchor.north)>=50||!mesh.visible||!camera.layers.test(mesh.layers)||Array.isArray(mesh.material)||!mesh.material.visible||mesh.material.clippingPlanes?.length)return 0;
  const h=heightAt(eye.x,-eye.z);if(h===undefined||eye.y<h+.05||eye.y>h+4)return 0;
  let node:Object3D|null=mesh;while(node){if(!node.visible)return 0;node=node.parent;}
  prepare();
  if(!ring||eye.y>=ring.minHeight-.35)return 0;
  for(const o of objects){
   if(!o.parent||!o.visible||!camera.layers.test(o.layers)||!opaqueMesh(o))continue;
   const g=o.geometry;if(!g.boundingBox)g.computeBoundingBox();
   if(!g.boundingBox)continue;
   box.copy(g.boundingBox).applyMatrix4(o.matrixWorld).getBoundingSphere(sphere);
   if(sphereBehindCraterWall(ring,eye,sphere)){masked.push({mesh:o,mask:o.layers.mask});o.layers.mask=0;}
  }
  return masked.length;
 }
 return {refresh,begin,restore,prepare,get ring(){return ring;},get candidates(){return objects.length;}};
}

/** M calls this with real domain/transition/cover state, never a camera
 * height guess. Keep the shaft presentation when the cover is open or
 * an accepted descent/return/blackout is in flight. Sync/authority is
 * intentionally not paused here. */
export function applyCraterUndergroundRenderGate(parent:Object3D,state:{known:boolean;inMine:boolean;transition:boolean;coverOpen:boolean}){
 parent.visible=!state.known||state.inMine||state.transition||state.coverOpen;
 return parent.visible;
}
