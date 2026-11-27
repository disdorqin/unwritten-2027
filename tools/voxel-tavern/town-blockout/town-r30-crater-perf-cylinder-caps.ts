import {BufferAttribute,BufferGeometry,Camera,CylinderGeometry,FrontSide,InstancedMesh,Material,Matrix4,MeshLambertMaterial,PerspectiveCamera,Vector3} from 'three';
type CapGeometry={g:CylinderGeometry;p:BufferAttribute;i:BufferAttribute;pv:number;iv:number;top:number;bottom:number;groups:string;attrs:Record<string,unknown>;variants:Map<number,BufferGeometry>};
type Envelope={cert:CapGeometry;origin:Vector3;min:Vector3;max:Vector3;topMin:number;bottomMax:number;count:number;valid:boolean};
const groupsOf=(g:BufferGeometry)=>g.groups.map(x=>[x.start,x.count,x.materialIndex].join(':')).join(',');
function current(c:CapGeometry){const g=c.g;return g.getAttribute('position')===c.p&&c.p.version===c.pv&&g.index===c.i&&c.i.version===c.iv&&g.drawRange.start===0&&g.drawRange.count>=c.i.count&&groupsOf(g)===c.groups&&Object.keys(g.attributes).length===Object.keys(c.attrs).length&&Object.entries(c.attrs).every(([n,a])=>g.attributes[n]===a);}
const x=new Vector3(),z=new Vector3(),normal=new Vector3(),point=new Vector3();
/** A directional interval enclosure of ALL instance cap planes, not a
 * camera-facing heuristic. For transformed cap normal n, every instance
 * has min<=n<=max componentwise and topMin<=n·top, n·bottom<=bottomMax.
 * Only remove a cap when the entire interval is strictly back-facing. */
export function extendCylinderCapEnvelope(e:Envelope,m:Matrix4){
 if(!e.valid)return;const a=m.elements;if(!a.every(Number.isFinite)||a[3]!==0||a[7]!==0||a[11]!==0||a[15]!==1||m.determinant()<=0){e.valid=false;return;}
 x.set(a[0],a[1],a[2]);z.set(a[8],a[9],a[10]);normal.crossVectors(z,x);if(normal.lengthSq()<1e-20){e.valid=false;return;}normal.normalize();
 e.min.min(normal);e.max.max(normal);point.set(0,e.cert.top,0).applyMatrix4(m).sub(e.origin);e.topMin=Math.min(e.topMin,normal.dot(point));
 point.set(0,e.cert.bottom,0).applyMatrix4(m).sub(e.origin);e.bottomMax=Math.max(e.bottomMax,normal.dot(point));e.count++;
}
export function createCraterCylinderCaps(){
 const certs=new Map<BufferGeometry,CapGeometry>(),masked:{mesh:InstancedMesh;geometry:BufferGeometry}[]=[];
 const a=new Vector3(),b=new Vector3(),c=new Vector3(),n=new Vector3(),eye=new Vector3(),inverse=new Matrix4();
 function restore(){for(const x of masked)x.mesh.geometry=x.geometry;masked.length=0;}
 function drop(c:CapGeometry){for(const g of c.variants.values()){for(const k of Object.keys(g.attributes))g.deleteAttribute(k);g.dispose();}}
 function certify(g:BufferGeometry){
  const old=certs.get(g);if(old&&current(old))return old;if(old){drop(old);certs.delete(g);}
  if(!(g instanceof CylinderGeometry)||g.parameters.openEnded||g.groups.length!==3||!g.index||g.drawRange.start!==0||g.drawRange.count<g.index.count||Object.keys(g.morphAttributes).length)return;
  const p=g.getAttribute('position'),i=g.index;if(!(p instanceof BufferAttribute)||!(i instanceof BufferAttribute))return;
  g.computeBoundingBox();const box=g.boundingBox;if(!box)return;const top=box.max.y,bottom=box.min.y;
  let cursor=0;const seen=new Set<number>();for(const group of g.groups){const k=group.materialIndex;if(k===undefined||k<0||k>2||seen.has(k)||group.start!==cursor||group.count%3!==0||group.count===0)return;seen.add(k);cursor+=group.count;
   if(k===0)continue;const y=k===1?top:bottom,sign=k===1?1:-1;
   for(let j=group.start;j<group.start+group.count;j+=3){a.fromBufferAttribute(p,i.getX(j));b.fromBufferAttribute(p,i.getX(j+1));c.fromBufferAttribute(p,i.getX(j+2));if(a.y!==y||b.y!==y||c.y!==y)return;n.crossVectors(b.sub(a),c.sub(a));if(n.x!==0||n.z!==0||n.y*sign<=0)return;}
  }if(cursor!==i.count)return;
  const cert={g,p,i,pv:p.version,iv:i.version,top,bottom,groups:groupsOf(g),attrs:{...g.attributes},variants:new Map<number,BufferGeometry>()};certs.set(g,cert);return cert;
 }
 function envelope(g:BufferGeometry,origin:Vector3):Envelope|undefined{const cert=certify(g);if(!cert)return;return {cert,origin:origin.clone(),min:new Vector3(Infinity,Infinity,Infinity),max:new Vector3(-Infinity,-Infinity,-Infinity),topMin:Infinity,bottomMax:-Infinity,count:0,valid:true};}
 function apply(camera:Camera,m:InstancedMesh,e:Envelope|undefined){
  if(!e||!e.valid||e.count!==m.count||m.geometry!==e.cert.g||!current(e.cert)||!(camera instanceof PerspectiveCamera)||m.castShadow||!(m.material instanceof MeshLambertMaterial)||m.material.side!==FrontSide||m.material.transparent||m.material.wireframe||m.material.onBeforeCompile!==Material.prototype.onBeforeCompile||m.material.customProgramCacheKey!==Material.prototype.customProgramCacheKey||m.material.displacementMap||m.material.clippingPlanes?.length||m.matrixWorld.determinant()<=0)return 0;
  eye.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(inverse.copy(m.matrixWorld).invert()).sub(e.origin);
  const hi=eye.x*(eye.x>=0?e.max.x:e.min.x)+eye.y*(eye.y>=0?e.max.y:e.min.y)+eye.z*(eye.z>=0?e.max.z:e.min.z),lo=eye.x*(eye.x>=0?e.min.x:e.max.x)+eye.y*(eye.y>=0?e.min.y:e.max.y)+eye.z*(eye.z>=0?e.min.z:e.max.z);
  const mask=Number(hi<e.topMin-1e-4)+2*Number(lo>e.bottomMax+1e-4);if(!mask)return 0;
  const cert=e.cert;let g=cert.variants.get(mask);if(!g){g=new BufferGeometry();for(const [k,a] of Object.entries(cert.g.attributes))g.setAttribute(k,a);const ids:number[]=[];for(const group of cert.g.groups)if(group.materialIndex===0||!(mask&group.materialIndex!))for(let j=group.start;j<group.start+group.count;j++)ids.push(cert.i.getX(j));g.setIndex(ids);g.boundingBox=cert.g.boundingBox?.clone()??null;g.boundingSphere=cert.g.boundingSphere?.clone()??null;cert.variants.set(mask,g);}
  masked.push({mesh:m,geometry:m.geometry});m.geometry=g;return (cert.i.count-g.index!.count)/3*m.count;
 }
 function dispose(){restore();for(const c of certs.values())drop(c);certs.clear();}
 return {envelope,apply,restore,dispose};
}
