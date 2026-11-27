import {Box3,BufferAttribute,BufferGeometry,Camera,Frustum,Matrix4,Mesh,Sphere,Vector3} from 'three';
type Cell={mesh:Mesh;bounds:Box3;triangles:number};
/** Render cells retain the exact final ground indices, local attributes,
 * material and transformation. The authoritative full mesh remains the
 * only collision, height, cut and seam input; never decimate the road. */
export function createCraterGroundCells(source:Mesh,cellSize=28){
 const original=source.geometry,idx=original.index,p=original.getAttribute('position'),cells:Cell[]=[];
 const indexVersion=idx?.version,positionVersion=p instanceof BufferAttribute?p.version:p?.data.version;
 const frustum=new Frustum(),vp=new Matrix4(),box=new Box3(),v=new Vector3(),sphere=new Sphere();
 let mask:number|undefined,active:Cell[]=[],saved=0;
 if(!idx||!p||Array.isArray(source.material)||original.drawRange.start!==0||original.drawRange.count<idx.count||cellSize<=0)return;
 const bins=new Map<string,{indices:number[];bounds:Box3}>();
 for(let i=0;i<idx.count;i+=3){
  const a=idx.getX(i),b=idx.getX(i+1),c=idx.getX(i+2);
  const k=Math.floor((p.getX(a)+p.getX(b)+p.getX(c))/3/cellSize)+','+Math.floor((p.getZ(a)+p.getZ(b)+p.getZ(c))/3/cellSize);
  const bin=bins.get(k)??{indices:[],bounds:new Box3()};
  bin.indices.push(a,b,c);for(const j of [a,b,c])bin.bounds.expandByPoint(v.fromBufferAttribute(p,j));bins.set(k,bin);
 }
 for(const bin of bins.values()){
  const g=new BufferGeometry();for(const [name,a] of Object.entries(original.attributes))g.setAttribute(name,a);
  g.setIndex(bin.indices);g.boundingBox=bin.bounds.clone();g.boundingSphere=bin.bounds.getBoundingSphere(new Sphere());
  const m=new Mesh(g,source.material);m.name='p2-ground-cell';m.visible=false;m.matrixAutoUpdate=false;m.receiveShadow=source.receiveShadow;m.renderOrder=source.renderOrder;
  m.layers.mask=0;m.raycast=()=>{};source.add(m);cells.push({mesh:m,bounds:bin.bounds,triangles:bin.indices.length/3});
 }
 function restore(){if(mask!==undefined){source.layers.mask=mask;mask=undefined;}for(const c of active){c.mesh.visible=false;c.mesh.layers.mask=0;}active=[];}
 function begin(camera:Camera){
  restore();saved=0;
  if(!source.visible||!camera.layers.test(source.layers)||source.geometry!==original||original.index!==idx||idx?.version!==indexVersion||original.getAttribute('position')!==p||(p instanceof BufferAttribute?p.version:p.data.version)!==positionVersion||original.drawRange.start!==0||original.drawRange.count<idx!.count||source.material!==cells[0]?.mesh.material||source.castShadow)return 0;
  const total=idx!.count/3,chosen:Cell[]=[];let count=0;
  frustum.setFromProjectionMatrix(vp.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
  if(!original.boundingSphere)original.computeBoundingSphere();
  if(original.boundingSphere&&!frustum.intersectsSphere(sphere.copy(original.boundingSphere).applyMatrix4(source.matrixWorld)))return 0;
  for(const c of cells){if(frustum.intersectsBox(box.copy(c.bounds).applyMatrix4(source.matrixWorld))){chosen.push(c);count+=c.triangles;}}
  // Do not trade excessive draw calls for modest savings. The exact
  // full mesh stays faster for wide views where most cells are visible.
  if(count>total*.65||chosen.length>8)return 0;
  mask=source.layers.mask;source.layers.mask=0;active=chosen;
  for(const c of chosen){c.mesh.layers.mask=mask;c.mesh.visible=true;}
  saved=total-count;return saved;
 }
 return {begin,restore,get savedTriangles(){return saved;},get cellCount(){return cells.length;},dispose(){restore();for(const c of cells){c.mesh.removeFromParent();c.mesh.geometry.dispose();}}};
}
