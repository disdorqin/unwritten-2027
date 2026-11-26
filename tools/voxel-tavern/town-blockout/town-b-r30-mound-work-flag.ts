import {BoxGeometry,BufferGeometry,DataTexture,Group,Mesh,MeshStandardMaterial,NearestFilter,Ray,SRGBColorSpace,Vector3} from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {Box} from './landmark-kit';
import type {mountWestCraterRoad} from './town-za22-crater-road';
type Road=ReturnType<typeof mountWestCraterRoad>;
type Point=Readonly<{east:number;north:number;height:number}>;
export type BR30MoundPose=Point&Readonly<{heading:number;pitch:number;eyeHeight:number}>;
export const moundWorkFlagId='mound-old-work-flag';
export const moundOverlookId='crater-mound-overlook';
const axis={east:-120.5,north:197.8},footEN={east:-120,north:196};
const gap=(p:Point,b:Box)=>Math.hypot(Math.max(b.min[0]-p.east,p.east-b.max[0],0),Math.max(b.min[2]+p.north,-p.north-b.max[2],0));
type Family='stone'|'wood'|'iron'|'cloth'|'stitch';
const colors:Record<Family,number>={stone:0x76685e,wood:0x5c4534,iron:0x514a45,cloth:0x9c5941,stitch:0xc3a57b};
function material(f:Family){
 const n=16,bytes=new Uint8Array(n*n*4),c=colors[f];
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const grain=f==='wood'?Math.sin(x*1.8+Math.sin(y*.6)):Math.sin(x*.7+y*.6);
  const v=.86+.11*grain+(f==='cloth'&&(x+y)%3===0?.06:0);
  bytes.set([Math.round((c>>16&255)*v),Math.round((c>>8&255)*v),Math.round((c&255)*v),255],(y*n+x)*4);
 }
 const map=new DataTexture(bytes,n,n);map.colorSpace=SRGBColorSpace;map.magFilter=map.minFilter=NearestFilter;map.needsUpdate=true;
 return new MeshStandardMaterial({map,roughness:.96,metalness:f==='iron'?.12:0});
}
/** One original old work flag, separate from the three wind flags.
 * Install after surveyed forest and physical kit, before A builds its
 * sole west collision index. Never writes inventory, atlas or persistence. */
export function installBR30MoundWorkFlag(road:Road){
 const parent=road.moundPlanting.group;
 if(parent.getObjectByName(moundWorkFlagId))throw Error('Mound work flag already mounted');
 const solids=road.group.userData.colliders as Box[];
 if(!Array.isArray(solids))throw Error('Missing existing west collider list');
 const h=road.heightAt(axis.east,axis.north),fh=road.heightAt(footEN.east,footEN.north);
 if(h===undefined||fh===undefined||!Number.isFinite(h)||!Number.isFinite(fh)||Math.abs(h-fh)>.10)throw Error('Mound flag support missing');
 const at={...axis,height:h},foot={...footEN,height:fh};
 for(const e of [-.38,0,.38])for(const n of [-.38,0,.38]){
  const y=road.heightAt(axis.east+e,axis.north+n);
  if(y===undefined||!Number.isFinite(y)||Math.abs(y-h)>.10)throw Error('Mound flag footing not level');
 }
 const relevant=solids.filter(b=>b.min[1]<h+3&&b.max[1]>h-.10);
 if(relevant.some(b=>gap(at,b)<1.05||gap(foot,b)<.45))throw Error('Mound flag conflicts with old solids');
 // Both pole poses lean north, away from the south-side operating foot.
 // The lower body envelope is tight; the cloth flies overhead.
 const boxes:Box[]=[{min:[at.east-.39,h-.06,-at.north-.39],max:[at.east+.39,h+.31,-at.north+.39]},
 {min:[at.east-.09,h+.14,-at.north-.74],max:[at.east+.09,h+2.73,-at.north+.09]}];
 if(boxes.some(b=>gap(foot,b)<.45))throw Error('Mound flag blocks summit route');
 const group=new Group();group.name=moundWorkFlagId;group.position.set(at.east,h,-at.north);
 const pivot=new Group();pivot.name='mound-old-work-flag-pivot';pivot.position.y=.19;group.add(pivot);
 const mats=Object.fromEntries(Object.keys(colors).map(f=>[f,material(f as Family)])) as Record<Family,MeshStandardMaterial>;
 let parts=0;
 const fixed=new Map<Family,BufferGeometry[]>(),moving=new Map<Family,BufferGeometry[]>();
 function part(batch:Map<Family,BufferGeometry[]>,f:Family,x:number,y:number,z:number,w:number,hh:number,d:number,yaw=0,roll=0){
  const source=new BoxGeometry(w,hh,d),g=source.toNonIndexed();source.dispose();
  g.rotateY(yaw).rotateZ(roll).translate(x,y,z);
  const list=batch.get(f)??[];list.push(g);batch.set(f,list);parts++;
 }
 const base=(f:Family,x:number,y:number,z:number,w:number,hh:number,d:number,yaw=0)=>part(fixed,f,x,y,z,w,hh,d,yaw);
 const pole=(f:Family,x:number,y:number,z:number,w:number,hh:number,d:number,yaw=0,roll=0)=>part(moving,f,x,y,z,w,hh,d,yaw,roll);
 // Split stone socket with actual iron collar and four fasteners.
 base('stone',0,.06,0,.76,.22,.76);
 base('stone',0,.19,0,.48,.13,.48);
 base('iron',0,.27,0,.28,.09,.28);
 for(const x of [-.14,.14])for(const z of [-.14,.14])base('iron',x,.284,z,.055,.045,.055);
 // Weathered old timber pole, iron foot and repaired joint straps.
 pole('wood',0,1.22,0,.105,2.48,.105);
 for(const y of [.15,.74,1.65,2.32])pole('iron',0,y,0,.137,.09,.137);
 pole('iron',0,2.49,0,.14,.08,.14);
 // Work flag deliberately larger than the separate three wind pennants.
 // Rectangular cloth, torn flying edge and reinforced stitched hoist.
 for(let i=0;i<5;i++){
  const x=.132+i*.225,z=(i%2?.026:-.026),hh=.61-(i===4?.18:i===3?.06:0);
  pole('cloth',x,2.12-(i===4?.065:0),z,.25,hh,.036,i%2?.14:-.14);
  pole('stitch',x,2.12+hh/2-.032,z+.028,.23,.04,.019,i%2?.14:-.14);
  pole('stitch',x,2.12-hh/2+.028,z+.028,.23,.033,.019,i%2?.14:-.14);
 }
 pole('stitch',.08,2.12,.038,.043,.59,.02);
 // An abstract stitched stripe, not a new faction/name or lore inscription.
 for(let i=0;i<3;i++)pole('stitch',.27+i*.22,2.13,.058,.18,.055,.016);
 for(const y of [1.84,2.39])pole('iron',.07,y,0,.15,.05,.14);
 for(const [batch,target] of [[fixed,group],[moving,pivot]] as const)for(const [f,list] of batch){
  const geometry=mergeGeometries(list);list.forEach(g=>g.dispose());
  if(!geometry)throw Error('Mound flag batch failed');geometry.computeBoundingSphere();
  const mesh=new Mesh(geometry,mats[f]);mesh.name=moundWorkFlagId+'/'+f;target.add(mesh);
 }
 let straight=false;
 function show(restored:boolean){straight=restored;pivot.rotation.x=restored?0:-.29;group.updateWorldMatrix(true,true);}
 const target=()=>{const v=pivot.localToWorld(new Vector3(0,1.42,0));return {east:v.x,north:-v.z,height:v.y};};
 function atSummit(p:Point){
  return [p.east,p.north,p.height].every(Number.isFinite)&&Math.hypot(p.east-foot.east,p.north-foot.north)<=1.35&&Math.abs(p.height-foot.height)<=.25;
 }
 function aimed(p:BR30MoundPose){
  if(!atSummit(p)||![p.heading,p.pitch,p.eyeHeight].every(Number.isFinite)||p.eyeHeight<.5||p.eyeHeight>2.2)return false;
  const q=target(),eye=new Vector3(p.east,p.height+p.eyeHeight,-p.north),dir=new Vector3(Math.sin(p.heading)*Math.cos(p.pitch),Math.sin(p.pitch),-Math.cos(p.heading)*Math.cos(p.pitch));
  const dest=new Vector3(q.east,q.height,-q.north),delta=dest.clone().sub(eye);
  return delta.length()<=2.7&&delta.dot(dir)>0&&new Ray(eye,dir).distanceSqToPoint(dest)<.24**2;
 }
 show(false);parent.add(group);group.updateWorldMatrix(true,true);
 road.group.userData.colliders=[...solids,...boxes];
 let disposed=false;
 return {group,at,foot,boxes,parts,target,atSummit,aimed,show,get straight(){return straight;},dispose(){
  if(disposed)return;disposed=true;group.removeFromParent();
  road.group.userData.colliders=(road.group.userData.colliders as Box[]).filter(b=>!boxes.includes(b));
  group.traverse(o=>{if(o instanceof Mesh)o.geometry.dispose();});
  Object.values(mats).forEach(m=>{m.map?.dispose();m.dispose();});
 }};
}
export type BR30MoundFacts=Readonly<{flagStraight:boolean;overlookKnown:boolean}>;
export type BR30MoundIntent=Readonly<{kind:'reach-overlook';site:typeof moundOverlookId}|{kind:'straighten-flag';site:typeof moundWorkFlagId}>;
export type BR30MoundHost=Readonly<{
 pose():BR30MoundPose|undefined;facts():BR30MoundFacts|undefined;
 /** Recheck current accepted pose, atlas receipt and persisted flag on
  * the existing authority; never trust a client-provided state or award. */
 request(intent:BR30MoundIntent):Promise<{accepted:boolean;reason?:string}>;
}>;
export function createBR30MoundControls(model:ReturnType<typeof installBR30MoundWorkFlag>,host:BR30MoundHost){
 let pending=false;
 function facts(){const f=host.facts();return f&&typeof f.flagStraight==='boolean'&&typeof f.overlookKnown==='boolean'?f:undefined;}
 function refresh(){const f=facts();if(f)model.show(f.flagStraight);}
 function action(kind:BR30MoundIntent['kind']):BR30MoundIntent|undefined{
  const p=host.pose(),f=facts();if(pending||!p||!f)return;
  if(kind==='reach-overlook'&&!f.overlookKnown&&model.atSummit(p))return {kind,site:moundOverlookId};
  if(kind==='straighten-flag'&&!f.flagStraight&&model.aimed(p))return {kind,site:moundWorkFlagId};
 }
 async function interact(kind:BR30MoundIntent['kind']){
  const intent=action(kind);if(!intent)return {accepted:false,reason:'unavailable'};
  pending=true;
  try{const r=await host.request(intent);refresh();return r;}
  catch{return {accepted:false,reason:'receipt-unavailable'};}
  finally{pending=false;}
 }
 refresh();
 return {refresh,action,interact};
}
