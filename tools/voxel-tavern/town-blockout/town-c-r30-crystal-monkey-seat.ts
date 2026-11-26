import {BoxGeometry,Color,Group,InstancedMesh,Matrix4,MeshStandardMaterial,Quaternion,Vector3} from 'three';
import {undergroundZodiacSites} from '../../../src/shared/underground-zodiac-sites.js';
import {makeCampGrain} from './town-c-r30-camp-art.js';
import {crystalCavernToWorld,CRYSTAL_CAVERN_CANT_RAD,type CrystalCavernFrame,type CrystalCavernPoint} from './underground-crystal-cavern.js';
import {crystalRouteFloor,crystalRoutePassage,r30CrystalDomain} from './town-c-r30-crystal-support.js';
type Point=CrystalCavernPoint;
type Site=Readonly<{id:'star-stone:monkey';domainId:string;base:Point;stand:Point;aim:Point;legacyBase:Point;legacyStand:Point}>;
type Foot=Point&Readonly<{domainId:string}>;
export type R30MonkeySeatBridge=Readonly<{
 acceptsSite(site:Site):boolean;
 read():Readonly<{atOrigin:boolean;resonant:boolean}>|undefined;
 readPlayerId():string|undefined;
 isAimingAt(point:Point):boolean;
 dispatch(playerId:string,id:Site['id']):void;
}>;
type Part={family:'rock'|'crystal'|'stone';e:number;n:number;y:number;w:number;h:number;d:number;a:number;color:number};
const anchor=undergroundZodiacSites.monkey,angle=CRYSTAL_CAVERN_CANT_RAD;
export function mountR30CrystalMonkeySeat(parent:Group,frame:CrystalCavernFrame,bridge:R30MonkeySeatBridge|undefined,readFoot:()=>Foot|undefined,existingBlocks:(e:number,n:number,y:number,r:number,h:number)=>boolean){
 const {east:e,north:n}=anchor.base,stand=anchor.stand,y=crystalRouteFloor(e,n),standY=crystalRouteFloor(stand.east,stand.north);
 if(y===undefined||standY===undefined||!crystalRoutePassage(stand.east,stand.north)||existingBlocks(stand.east,stand.north,standY,.27,1.8))return {kind:'blocked' as const,reason:'legacy-anchor-not-supported'};
 const world=(e:number,y:number,n:number)=>crystalCavernToWorld(frame,[e,y,n]);
 const site:Site={id:'star-stone:monkey',domainId:r30CrystalDomain,base:world(e,y-.025,n),stand:world(stand.east,standY,stand.north),aim:world(e,y+.48,n),legacyBase:world(e,anchor.base.height,n),legacyStand:world(stand.east,stand.height,stand.north)};
 const group=new Group();group.name='r30-monkey-stone-seat';parent.add(group);
 const parts:Part[]=[],solid:Part[]=[];
 const put=(family:Part['family'],e:number,n:number,y:number,w:number,h:number,d:number,color:number,a=0,collision=true)=>{
  const p={family,e,n,y,w,h,d,color,a};parts.push(p);if(collision)solid.push(p);
 };
 // Low socket follows actual ramp; stone is removable from it, not a
 // duplicate of the old town zodiac charm. No inscription.
 put('rock',e,n,y+.055,.76,.16,.76,0x454d4c);
 put('rock',e,n,y+.175,.61,.12,.62,0x777a6e);
 for(const s of [-1,1]){
  put('rock',e+s*.245,n,y+.265,.10,.12,.54,0x68736d);
  put('rock',e,n+s*.265,y+.265,.39,.12,.085,0x575f5e);
 }
 // Two high growths behind the seat, leaning at the canonical angle.
 // The seat faces west toward the original approach.
 for(const [de,dn,tall,w] of [[.55,.35,1.86,.31],[.67,-.31,1.52,.24],[.36,.51,.91,.19]] as const){
  const ex=e+de,nx=n+dn,base=crystalRouteFloor(ex,nx);if(base===undefined)continue;
  for(const [start,end,scale] of [[0,.42,1],[.42,.78,.72],[.78,1,.4]] as const){
   const m=(start+end)*.5*tall;
   put('crystal',ex-Math.sin(angle)*m,nx,base+.08+Math.cos(angle)*m,w*scale,(end-start)*tall+.008,w*.84*scale,0x78b0ad,angle);
  }
  put('rock',ex,nx,base+.05,.32,.12,.29,0x475c58);
 }
 // One authored stone plate, unlettered. An accepted at-origin fact is
 // required even for presentation; without the port only empty seat art.
 put('stone',e,n,y+.43,.33,.32,.17,0x536c68,0,false);
 put('stone',e-.015,n,y+.61,.28,.075,.15,0x758985,0,false);
 put('stone',e-.018,n,y+.248,.28,.05,.15,0x4b605e,0,false);
 for(const s of [-1,1])put('stone',e+s*.18,n,y+.43,.045,.25,.15,0x7d9089,0,false);
 // No new point light; weak material glow is driven only by accepted
 // resonance and does not mint a stone or make the socket an inventory.
 const geo=new BoxGeometry(),map=makeCampGrain('rock');
 const materials={
  rock:new MeshStandardMaterial({map,roughness:.95}),
  crystal:new MeshStandardMaterial({roughness:.41,emissive:0x365d5b,emissiveIntensity:.45}),
  stone:new MeshStandardMaterial({map,roughness:.68,emissive:0x365d5b,emissiveIntensity:0}),
 };
 const meshes:InstancedMesh[]=[];let stoneMesh:InstancedMesh|undefined;
 for(const family of ['rock','crystal','stone'] as const){
  const list=parts.filter(p=>p.family===family);if(!list.length)continue;
  const m=new Matrix4(),q=new Quaternion(),c=new Color(),mesh=new InstancedMesh(geo,materials[family],list.length);
  list.forEach((p,i)=>{m.compose(new Vector3(p.e,p.y,-p.n),q.setFromAxisAngle(new Vector3(0,0,1),p.a),new Vector3(p.w,p.h,p.d));mesh.setMatrixAt(i,m);mesh.setColorAt(i,c.setHex(p.color))});
  mesh.computeBoundingSphere();mesh.name='r30-monkey-seat/'+family;group.add(mesh);meshes.push(mesh);
  if(family==='stone'){stoneMesh=mesh;mesh.visible=false}
 }
 function blocks(ex:number,nx:number,fy:number,r:number,h:number){
  return solid.some(p=>{const c=Math.abs(Math.cos(p.a)),s=Math.abs(Math.sin(p.a)),dx=(c*p.w+s*p.h)/2,dy=(s*p.w+c*p.h)/2;
   return p.y+dy>fy+.025&&p.y-dy<fy+h&&Math.hypot(Math.max(0,Math.abs(ex-p.e)-dx),Math.max(0,Math.abs(nx-p.n)-p.d/2))<r});
 }
 if(blocks(stand.east,stand.north,standY,.27,1.8)){
  group.removeFromParent();meshes.forEach(m=>m.dispose());Object.values(materials).forEach(m=>m.dispose());geo.dispose();map.dispose();return {kind:'blocked' as const,reason:'seat-blocks-approach'};
 }
 function receipt(){const s=bridge?.acceptsSite(site)===true?bridge.read():undefined;return s&&typeof s.atOrigin==='boolean'&&typeof s.resonant==='boolean'?s:undefined}
 function sync(){const s=receipt();if(stoneMesh)stoneMesh.visible=s?.atOrigin===true;materials.stone.emissiveIntensity=s?.atOrigin&&s.resonant?.6:0}
 function prompt(){
  const s=receipt(),f=readFoot(),playerId=bridge?.readPlayerId();
  if(!s?.atOrigin||!s.resonant||!playerId?.trim()||!f||f.domainId!==r30CrystalDomain||
   Math.hypot(f.east-site.stand.east,f.north-site.stand.north)>.35||Math.abs(f.height-site.stand.height)>.08||!bridge?.isAimingAt(site.aim))return;
  return {id:site.id,playerId,label:'共鸣中取猴石'};
 }
 function press(expectedId:string){const p=prompt();if(!p||p.id!==expectedId)return false;bridge!.dispatch(p.playerId,p.id);return true}
 return {kind:'ready' as const,group,site,parts,blocks,sync,prompt,press,stoneMesh,
  dispose(){group.removeFromParent();meshes.forEach(m=>m.dispose());Object.values(materials).forEach(m=>m.dispose());geo.dispose();map.dispose();group.clear()}};
}
