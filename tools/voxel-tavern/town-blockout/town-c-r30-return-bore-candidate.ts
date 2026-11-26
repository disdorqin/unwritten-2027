import {BoxGeometry,Color,Group,InstancedMesh,Matrix4,Mesh,MeshLambertMaterial,Quaternion,Vector3} from 'three';
import {makeCampGrain} from './town-c-r30-camp-art.js';
import {firstMineConnectionDatum} from '../../../src/shared/underground-second-mine-presence-domain.js';
import {r30ReturnRelocationCandidate as plan,surveyR30ReturnRelocation} from './town-c-r30-return-relocation-candidate.js';
type Point=Readonly<{east:number;north:number;height:number}>;
/** Structural subset of B's surveyBR30ReturnHeadframe. No B import or
 * dependency until total control serially accepts both candidate packages. */
export type R30ReturnHeadframeSurvey=Readonly<{
 axis:Point;yaw:number;apertureSide:number;roofSpan:number;dockHeight:number;verticalSpan:number;
 productionReady:false;
}>;
type Family='rock'|'iron'|'wood';
type Part={family:Family;x:number;y:number;z:number;w:number;h:number;d:number;color:number};
const eps=1e-6;
export function mountR30ReturnBoreCandidate(parent:Group,upper:R30ReturnHeadframeSurvey){
 const lower=surveyR30ReturnRelocation().world,yaw=firstMineConnectionDatum.yaw;
 if(![upper.axis.east,upper.axis.north,upper.axis.height,upper.yaw,upper.apertureSide,upper.roofSpan,upper.dockHeight,upper.verticalSpan].every(Number.isFinite)||
 upper.productionReady!==false||Math.hypot(upper.axis.east-lower.east,upper.axis.north-lower.north)>eps||
 Math.abs(Math.atan2(Math.sin(upper.yaw-yaw),Math.cos(upper.yaw-yaw)))>eps||
 Math.abs(upper.apertureSide-2.2)>eps||upper.roofSpan<0||upper.roofSpan>.025||Math.abs(upper.dockHeight-lower.height)>eps||
 Math.abs(upper.verticalSpan-(upper.axis.height-lower.height))>eps||upper.verticalSpan<=plan.ceiling+4)
 return {kind:'blocked' as const,reason:'unaligned-return-headframe'};
 // The corridor roof follows the 5% original gallery. The shaft begins
 // outside the highest point of the 2.2m square. Keep both end caps solid
 // until an actual mesh cut and the existing lift authority are approved.
 const half=upper.apertureSide/2,lowerRoof=lower.height+plan.ceiling+half*plan.grade,top=upper.axis.height;
 const span=top-lowerRoof,group=new Group();group.name='r30-sealed-return-bore-candidate';
 group.position.set(lower.east,lowerRoof,-lower.north);group.rotation.y=yaw;parent.add(group);
 const parts:Part[]=[];
 const add=(family:Family,x:number,y:number,z:number,w:number,h:number,d:number,color:number)=>parts.push({family,x,y,z,w,h,d,color});
 const count=Math.ceil(span/2.4),height=span/count,stone=[0x41464b,0x505258,0x4d514f,0x53534e,0x394149];
 // Four actual continuous wall faces, chunked in 2.4m or smaller
 // bands. All surface irregularities stay OUTSIDE the 2.2m clear bore.
 for(let i=0;i<count;i++){
  const y=(i+.5)*height;
  for(const side of [-1,1]){
   add('rock',side*(half+.14),y,0,.28,height,2*(half+.28),stone[(i+(side+1)*2)%5]);
   add('rock',0,y,side*(half+.14),2*half,height,.28,stone[(i+2+(side+1)*2)%5]);
   // Recessed external timber ribs, no false traversal obstruction.
   for(const v of [-.78,.78]){
    add('wood',side*(half+.09),y,v,.18,.26,.20,0x604735);
    add('iron',side*(half+.09),y+.18,v,.16,.10,.23,0x80563d);
   }
   for(let k=0;k<3;k++){
    const z=-.75+k*.75;
    add('rock',side*(half+.013),y-.45+(k%2)*.32,z,.025,.12,.52,stone[(i+k+1)%5]);
   }
  }
  // Rails remain outside the existing 1.5m wood/iron cage envelope.
  // Mount on east/west shaft walls; the central 1.74m travel square is free.
  for(const side of [-1,1]){
   add('iron',side*1.02,y,0,.11,height,.12,0x505258);
   add('iron',side*1.02,y-.62,0,.16,.10,.34,0x80563d);
   for(const z of [-.13,.13])add('iron',side*1.02,y-.62,z,.14,.045,.065,0x947346);
  }
 }
 // Closed upper/lower cap art matches B's sealed cover and C's still
 // intact sloped gallery roof. It is not installed into either terrain.
 add('iron',0,.06,0,2.2,.12,2.2,0x45474a);
 add('iron',0,span-.06,0,2.2,.12,2.2,0x45474a);
 for(const y of [.14,span-.14])for(const side of [-1,1]){
  add('iron',side*1.09,y,0,.14,.13,2.34,0x80563d);
  add('iron',0,y,side*1.09,2.04,.13,.14,0x80563d);
 }
 const geo=new BoxGeometry(),resources:{mesh:InstancedMesh;mat:MeshLambertMaterial;map:ReturnType<typeof makeCampGrain>}[]=[];
 for(const family of ['rock','wood','iron'] as const){
  const map=makeCampGrain(family),mat=new MeshLambertMaterial({map});
  for(let start=0;start<span;start+=9.6){
   const list=parts.filter(p=>p.family===family&&p.y>=start&&p.y<start+9.6);if(!list.length)continue;
   const mesh=new InstancedMesh(geo,mat,list.length),m=new Matrix4(),q=new Quaternion(),color=new Color();
   list.forEach((p,i)=>{m.compose(new Vector3(p.x,p.y,p.z),q,new Vector3(p.w,p.h,p.d));mesh.setMatrixAt(i,m);mesh.setColorAt(i,color.setHex(p.color))});
   mesh.computeBoundingSphere();group.add(mesh);resources.push({mesh,mat,map});
  }
  if(!resources.some(r=>r.mat===mat)){mat.dispose();map.dispose()}
 }
 return {kind:'ready' as const,group,parts,span,lowerRoof,upper:top,clearSquare:1.74,apertureSide:2.2,
  productionReady:false as const,
  dispose(){group.removeFromParent();resources.forEach(r=>r.mesh.dispose());new Set(resources.map(r=>r.mat)).forEach(m=>m.dispose());new Set(resources.map(r=>r.map)).forEach(m=>m.dispose());geo.dispose();group.clear()}};
}
