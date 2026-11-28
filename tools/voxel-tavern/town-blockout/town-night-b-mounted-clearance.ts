import {Box3,Matrix4,Triangle,Vector3,type Object3D,type BufferGeometry,type Mesh,type InstancedMesh} from 'three';
import {finishNightBAudit,finishNightBAuditAsync,type NightBAuditSliceOptions} from './town-night-b-audit-slices';
type Foot={east:number;north:number;height:number};
type Envelope={feet:Foot;heading:number;halfWidth:number;halfLength:number;bodyTop:number};
type Entry={name:string;object:Object3D;geometry:BufferGeometry;matrix:Matrix4;box:Box3;triangles?:Map<string,number[]>;wideTriangles?:number[]};
const step=32,key=(x:number,z:number)=>x+','+z;
/** Build once from the *actual mounted* production meshes, in the host's
 * local frame. Include hidden LOD meshes (conservative); only explicit
 * identity exclusions supplied by the owner are omitted, e.g. canonical
 * terrain already sampled by groundAt and the obsolete closed facility.
 * Test transformed real triangles, not a giant union AABB. No renderer,
 * additional geometry or second collision authority is created. */
export function* nightBMountedClearanceSteps(root:Object3D,excluded:readonly Object3D[]=[],corridor?:readonly Box3[]){
 root.updateWorldMatrix(true,true);
 const inv=root.matrixWorld.clone().invert(),skip=new Set(excluded);
 const cells=new Map<string,Entry[]>(),large:Entry[]=[];
 let meshes=0,instances=0,invalid=0,queries=0,triangleChecks=0;
 const hits=new Map<string,number>();
 const m=new Matrix4(),matrix=new Matrix4();
 function add(o:Mesh,mat:Matrix4){
  const g=o.geometry;if(!g?.getAttribute('position')){invalid++;return;}
  if(!g.boundingBox)g.computeBoundingBox();if(!g.boundingBox||g.boundingBox.isEmpty())return;
  const box=g.boundingBox.clone().applyMatrix4(mat);
  if(![...box.min.toArray(),...box.max.toArray()].every(Number.isFinite)){invalid++;return;}
  if(corridor&&!corridor.some(b=>b.intersectsBox(box)))return;
  const e={name:o.name||o.parent?.name||o.uuid,object:o,geometry:g,matrix:mat.clone(),box};
  const x0=Math.floor(box.min.x/step),x1=Math.floor(box.max.x/step),z0=Math.floor(box.min.z/step),z1=Math.floor(box.max.z/step);
  if((x1-x0+1)*(z1-z0+1)>64){large.push(e);return;}
  for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++){const k=key(x,z),b=cells.get(k)??[];b.push(e);cells.set(k,b);}
 }
 function* visit(o:Object3D):Generator<void,void,unknown>{
  if(skip.has(o))return;
  const mesh=o as Mesh;
  if(mesh.isMesh){
   meshes++;
   matrix.multiplyMatrices(inv,o.matrixWorld);
   const inst=o as InstancedMesh;
   if(inst.isInstancedMesh){
    for(let i=0;i<inst.count;i++){inst.getMatrixAt(i,m);const composed=matrix.clone().multiply(m);if(Math.abs(composed.determinant())<1e-12)continue;instances++;add(mesh,composed);yield;}
   }else{instances++;add(mesh,matrix);yield;}
  }
  for(const child of o.children)yield* visit(child);
 }
 yield* visit(root);
 const broad=new Box3(),cab=new Box3(),p0=new Vector3(),p1=new Vector3(),p2=new Vector3(),tri=new Triangle(p0,p1,p2),toCab=new Matrix4(),localMat=new Matrix4();
 const triBounds=new Box3();
 function triangleIds(a:Entry,b:Box3){
  const pos=a.geometry.getAttribute('position'),ix=a.geometry.getIndex(),n=ix?.count??pos.count;
  if(n<=900)return Array.from({length:Math.floor(n/3)},(_,i)=>3*i);
  if(!a.triangles){
   a.triangles=new Map();a.wideTriangles=[];
   for(let j=0;j+2<n;j+=3){
    const at=(k:number)=>ix?ix.getX(k):k;
    p0.fromBufferAttribute(pos,at(j)).applyMatrix4(a.matrix);p1.fromBufferAttribute(pos,at(j+1)).applyMatrix4(a.matrix);p2.fromBufferAttribute(pos,at(j+2)).applyMatrix4(a.matrix);
    triBounds.makeEmpty().expandByPoint(p0).expandByPoint(p1).expandByPoint(p2);
    if(corridor&&!corridor.some(c=>c.intersectsBox(triBounds)))continue;
    const x0=Math.floor(triBounds.min.x/step),x1=Math.floor(triBounds.max.x/step),z0=Math.floor(triBounds.min.z/step),z1=Math.floor(triBounds.max.z/step);
    if((x1-x0+1)*(z1-z0+1)>64){a.wideTriangles.push(j);continue;}
    for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++){const k=key(x,z),list=a.triangles.get(k)??[];list.push(j);a.triangles.set(k,list);}
   }
  }
  const ids=new Set(a.wideTriangles);
  for(let x=Math.floor(b.min.x/step);x<=Math.floor(b.max.x/step);x++)for(let z=Math.floor(b.min.z/step);z<=Math.floor(b.max.z/step);z++)for(const j of a.triangles.get(key(x,z))??[])ids.add(j);
  return ids;
 }
 function firstHit(e:Envelope,collect?:(object:Object3D,triangleIndex:number)=>void){
  let found:string|undefined;
  queries++;
  if(invalid||!Object.values(e.feet).every(Number.isFinite)||![e.heading,e.halfWidth,e.halfLength,e.bodyTop].every(Number.isFinite))return 'invalid-production-mesh-or-probe';
  const {east,north,height}=e.feet,c=Math.cos(e.heading),s=Math.sin(e.heading),w=Math.abs(c)*e.halfWidth+Math.abs(s)*e.halfLength,d=Math.abs(s)*e.halfWidth+Math.abs(c)*e.halfLength;
  // Dock floor is intentional contact; everything above it is tested.
  broad.min.set(east-w,height+.025,-north-d);broad.max.set(east+w,height+e.bodyTop,-north+d);
  cab.min.set(-e.halfWidth,.025,-e.halfLength);cab.max.set(e.halfWidth,e.bodyTop,e.halfLength);
  // Local cabin x and z are inverse of the sampled heading in Three axes.
  toCab.makeRotationY(e.heading).multiply(new Matrix4().makeTranslation(-east,-height,north));
  const candidates=new Set<Entry>(large);
  for(let x=Math.floor(broad.min.x/step);x<=Math.floor(broad.max.x/step);x++)for(let z=Math.floor(broad.min.z/step);z<=Math.floor(broad.max.z/step);z++)for(const a of cells.get(key(x,z))??[])candidates.add(a);
  for(const a of candidates){
   if(!broad.intersectsBox(a.box))continue;
   const g=a.geometry,pos=g.getAttribute('position'),ix=g.getIndex();
   localMat.multiplyMatrices(toCab,a.matrix);
   for(const j of triangleIds(a,broad)){
    const at=(k:number)=>ix?ix.getX(k):k;
    p0.fromBufferAttribute(pos,at(j)).applyMatrix4(localMat);p1.fromBufferAttribute(pos,at(j+1)).applyMatrix4(localMat);p2.fromBufferAttribute(pos,at(j+2)).applyMatrix4(localMat);triangleChecks++;
    if(cab.intersectsTriangle(tri)){hits.set(a.name,(hits.get(a.name)??0)+1);if(!collect)return a.name;found??=a.name;collect(a.object,j/3);}
   }
  }
  return found;
 }
 return {firstHit,blocked:(e:Envelope)=>firstHit(e)!==undefined,stats:()=>({meshes,instances,invalid,queries,triangleChecks,hits:Object.fromEntries(hits)})};
}
export function createNightBMountedClearance(...args:Parameters<typeof nightBMountedClearanceSteps>){return finishNightBAudit(nightBMountedClearanceSteps(...args));}
export function createNightBMountedClearanceAsync(root:Object3D,excluded:readonly Object3D[]=[],corridor?:readonly Box3[],options?:NightBAuditSliceOptions){return finishNightBAuditAsync(nightBMountedClearanceSteps(root,excluded,corridor),options);}
