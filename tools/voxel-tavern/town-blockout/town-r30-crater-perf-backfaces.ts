import {Box3,BoxGeometry,BufferAttribute,BufferGeometry,Camera,FrontSide,InstancedMesh,Material,Matrix4,MeshBasicMaterial,MeshLambertMaterial,MeshStandardMaterial,PerspectiveCamera,Vector3} from 'three';
type Face={axis:0|1|2;sign:number;indices:number[]};
type Certificate={position:BufferAttribute;index:BufferAttribute;pv:number;iv:number;groups:string;attrs:Record<string,unknown>;faces:Face[];variants:Map<number,BufferGeometry>};
const component=(v:Vector3,i:number)=>i===0?v.x:i===1?v.y:v.z;
export function axisAlignedInstance(m:Matrix4){const e=m.elements;return e[0]>0&&e[5]>0&&e[10]>0&&e[1]===0&&e[2]===0&&e[4]===0&&e[6]===0&&e[8]===0&&e[9]===0&&e[3]===0&&e[7]===0&&e[11]===0&&e[15]===1;}
/** Only six certified outward faces of a front-sided box. No LOD, no
 * occlusion assumption. Every removed face is strictly back-facing for
 * every instance in the selected cell, using its complete union bounds. */
export function createCraterBoxBackfaces(){
 const cache=new Map<BufferGeometry,Certificate|null>(),masked:{mesh:InstancedMesh;geometry:BufferGeometry}[]=[];
 const eye=new Vector3(),local=new Vector3(),inverse=new Matrix4(),a=new Vector3(),b=new Vector3(),c=new Vector3(),normal=new Vector3();
 let saved=0;
 function restore(){for(const s of masked)s.mesh.geometry=s.geometry;masked.length=0;}
 function drop(cert:Certificate|null|undefined){if(cert)for(const g of cert.variants.values()){for(const n of Object.keys(g.attributes))g.deleteAttribute(n);g.dispose();}}
 function certify(g:BufferGeometry){
  if(!(g instanceof BoxGeometry)||g.groups.length!==6||g.index?.count!==36||g.drawRange.start!==0||g.drawRange.count<36)return;
  const p=g.getAttribute('position'),i=g.index;if(!(p instanceof BufferAttribute)||!(i instanceof BufferAttribute)||p.count!==24||p.itemSize!==3)return;
  const groups=g.groups.map(x=>x.start+':'+x.count).join(',');const old=cache.get(g);if(old&&old.position===p&&old.index===i&&old.pv===p.version&&old.iv===i.version&&old.groups===groups&&Object.keys(g.attributes).length===Object.keys(old.attrs).length&&Object.entries(old.attrs).every(([n,a])=>g.attributes[n]===a))return old;
  if(old===null)return;drop(old);const faces:Face[]=[],unique=new Set<string>();
  g.computeBoundingBox();const box=g.boundingBox;if(!box||box.isEmpty())return;
  for(const group of g.groups){
   if(group.count!==6||group.start<0||group.start+6>36)return;
   const indices=Array.from({length:6},(_,k)=>i.getX(group.start+k));
   a.fromBufferAttribute(p,indices[0]);b.fromBufferAttribute(p,indices[1]).sub(a);c.fromBufferAttribute(p,indices[2]).sub(a);normal.crossVectors(b,c);
   const axis=([0,1,2] as const).find(k=>component(normal,k)!==0&&([0,1,2] as const).every(l=>l===k||component(normal,l)===0));if(axis===undefined)return;
   const sign=Math.sign(component(normal,axis)),plane=component(sign>0?box.max:box.min,axis),key=axis+':'+sign;
   if(unique.has(key)||indices.some(k=>k<0||k>=p.count||component(a.fromBufferAttribute(p,k),axis)!==plane))return;
   a.fromBufferAttribute(p,indices[3]);b.fromBufferAttribute(p,indices[4]).sub(a);c.fromBufferAttribute(p,indices[5]).sub(a);normal.crossVectors(b,c);
   if(component(normal,axis)*sign<=0||([0,1,2] as const).some(k=>k!==axis&&component(normal,k)!==0))return;
   unique.add(key);faces.push({axis,sign,indices});
  }
  const cert={position:p,index:i,pv:p.version,iv:i.version,groups,attrs:{...g.attributes},faces,variants:new Map<number,BufferGeometry>()};cache.set(g,cert);return cert;
 }
 function begin(camera:Camera){restore();saved=0;eye.setFromMatrixPosition(camera.matrixWorld);}
 function apply(camera:Camera,m:InstancedMesh,bounds:Box3,aligned:boolean){
  if(!aligned||!(camera instanceof PerspectiveCamera)||m.count<100||m.castShadow||Array.isArray(m.material)||!(m.material instanceof MeshStandardMaterial||m.material instanceof MeshLambertMaterial||m.material instanceof MeshBasicMaterial)||m.material.side!==FrontSide||m.material.transparent||m.material.wireframe||m.material.onBeforeCompile!==Material.prototype.onBeforeCompile||m.material.customProgramCacheKey!==Material.prototype.customProgramCacheKey||(m.material as MeshStandardMaterial).displacementMap||m.material.clippingPlanes?.length||m.matrixWorld.determinant()<=0)return 0;
  const g=m.geometry,cert=certify(g);if(!cert)return 0;
  local.copy(eye).applyMatrix4(inverse.copy(m.matrixWorld).invert());let mask=0;
  for(let k=0;k<cert.faces.length;k++){const f=cert.faces[k],x=component(local,f.axis),lo=component(bounds.min,f.axis),hi=component(bounds.max,f.axis);const back=f.sign>0?x<lo-1e-4:x>hi+1e-4;if(!back)mask|=1<<k;}
  if(mask===63||mask===0)return 0;
  let variant=cert.variants.get(mask);if(!variant){variant=new BufferGeometry();for(const [n,attr] of Object.entries(g.attributes))variant.setAttribute(n,attr);variant.setIndex(cert.faces.flatMap((f,k)=>mask&(1<<k)?f.indices:[]));variant.boundingSphere=g.boundingSphere?.clone()??null;variant.boundingBox=g.boundingBox?.clone()??null;cert.variants.set(mask,variant);}
  masked.push({mesh:m,geometry:g});m.geometry=variant;const n=(36-variant.index!.count)/3*m.count;saved+=n;return n;
 }
 function dispose(){restore();for(const c of cache.values())drop(c);cache.clear();}
 return {begin,apply,restore,dispose,get savedTriangles(){return saved;}};
}
