import {Mesh,Plane,Vector3,type Group,type Material} from 'three';
type Foot=Readonly<{east:number;north:number;height:number}>;
export type RearPresentation='far'|'exterior'|'apron'|'rear';
/** Presentation is independent from the room gate. A low side approach
 * sees the real canonical body beyond the town carrier. */
export function a33RearPresentation(p:Foot,active:boolean,ready:boolean,previous:RearPresentation):RearPresentation{
 if(!ready||![p.east,p.north,p.height].every(Number.isFinite))return 'far';
 if(active)return 'rear';
 const wasApron=previous==='apron';
 if(p.height>=(wasApron?332:340)&&p.north>=(wasApron?610:625)&&p.east>=245&&p.east<=405)return 'apron';
 const retained=previous==='exterior'||wasApron;
 if(p.north>=(retained?535:560)&&p.east>=-240&&p.east<=640)return 'exterior';
 return 'far';
}
/** Visual partition of the actual single host, not a second LOD mesh.
 * Outside the certified high apron the town owns its rectangle to N800.
 * No change to collision, room or authority. */
export function createA33RearExterior(root:Group,townNorth:number){
 if(!Number.isFinite(townNorth))throw Error('Invalid town north boundary');
 const plane=new Plane(new Vector3(0,0,-1),-townNorth);
 const materials=new Map<Material,Plane[]|null>();
 root.traverse(o=>{const m=o as Mesh;if(!m.isMesh)return;for(const mat of Array.isArray(m.material)?m.material:[m.material])if(!materials.has(mat))materials.set(mat,mat.clippingPlanes??null);});
 let enabled=false;
 function set(next:boolean){
  if(next===enabled)return;enabled=next;
  for(const [m,original] of materials){m.clippingPlanes=next?[...(original??[]),plane]:original;m.needsUpdate=true;}
 }
 return {set,active:()=>enabled,materials:materials.size,dispose(){set(false);materials.clear();}};
}
