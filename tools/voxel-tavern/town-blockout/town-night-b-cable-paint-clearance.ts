import {Box3,Vector3,type Object3D,type Mesh,type BufferGeometry} from 'three';
import {createNightBMountedClearance} from './town-night-b-mounted-clearance';
import {auditNightBSummitCable} from './town-night-b-summit-line2-service';
import type {createTownD2R30Ropeway} from './town-d2-r30-ropeway';
type Rope=ReturnType<typeof createTownD2R30Ropeway>;
/** The canonical massif already owns its four-band surface colours. The
 * legacy coarse overlay is physically .4m above ground. Remove ONLY its
 * triangles intersecting the actual cabin envelope; keep the other paint,
 * never omit the entire mesh from clearance. Own the clone until rollback
 * or host teardown, before the original facility is disposed. */
export function stageNightBCablePaintClearance(owner:Object3D,ropeway:Rope,groundAt:(e:number,n:number)=>number|undefined){
 const paint=owner.getObjectByName('main-summit-paint') as Mesh<BufferGeometry>|undefined;
 if(!paint?.isMesh)return {removed:0,restore(){}};
 const original=paint.geometry,index=original.getIndex();
 if(!index)throw Error('Unexpected canonical paint index');
 const excluded:Object3D[]=[];
 for(let p:Object3D|null=paint;p&&p!==owner;p=p.parent){
  if(!p.parent)throw Error('Paint detached from owner');
  for(const child of p.parent.children)if(child!==p)excluded.push(child);
 }
 const corridor=ropeway.cable.ropes.flatMap(r=>r.points.slice(1).map((p,i)=>{const a=r.points[i]!;return new Box3().setFromPoints([new Vector3(a.east,a.height,-a.north),new Vector3(p.east,p.height,-p.north)]).expandByScalar(5);}));
 const scan=createNightBMountedClearance(owner,excluded,corridor),removed=new Set<number>();
 auditNightBSummitCable(ropeway,groundAt,p=>!!scan.firstHit(p,(object,triangle)=>{if(object===paint)removed.add(triangle);}));
 if(!removed.size)return {removed:0,restore(){}};
 const geometry=original.clone(),keep:number[]=[];
 for(let i=0;i+2<index.count;i+=3)if(!removed.has(i/3))keep.push(index.getX(i),index.getX(i+1),index.getX(i+2));
 geometry.setIndex(keep);paint.geometry=geometry;
 let restored=false;
 return {removed:removed.size,restore(){if(restored)return;restored=true;if(paint.geometry===geometry)paint.geometry=original;geometry.dispose();}};
}
