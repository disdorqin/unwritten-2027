import {BoxGeometry,Color,Group,InstancedMesh,Matrix4,MeshLambertMaterial,MeshBasicMaterial,PointLight,Quaternion,Vector3} from 'three';
import {makeCampGrain} from './town-c-r30-camp-art.js';
import type {DreamChainTrip} from './underground-dream-chain.js';

type Point=Readonly<{east:number;north:number;height:number}>;
type Family='rock'|'wood'|'iron'|'glow';
type Piece={family:Family;position:Vector3;size:Vector3;rotation:Quaternion;color:number};
const axisY=new Vector3(0,1,0),axisZ=new Vector3(0,0,1);
function part(family:Family,xyz:readonly [number,number,number],size:readonly [number,number,number],color:number,angle=0,axis=axisY):Piece{
 return {family,position:new Vector3(...xyz),size:new Vector3(...size),rotation:new Quaternion().setFromAxisAngle(axis,angle),color};
}
function batch(parent:Group,pieces:Piece[],name:string){
 const root=new Group();root.name=name;const geo=new BoxGeometry();
 const cleanup:(()=>void)[]=[];
 for(const family of ['rock','wood','iron','glow'] as const){
  const list=pieces.filter(p=>p.family===family);if(!list.length)continue;
  const map=family==='glow'?undefined:makeCampGrain(family);
  const mat=family==='glow'?new MeshBasicMaterial():new MeshLambertMaterial({map});
  const mesh=new InstancedMesh(geo,mat,list.length),m=new Matrix4(),color=new Color();
  list.forEach((p,i)=>{m.compose(p.position,p.rotation,p.size);mesh.setMatrixAt(i,m);mesh.setColorAt(i,color.setHex(p.color))});
  mesh.computeBoundingSphere();root.add(mesh);cleanup.push(()=>{mesh.dispose();mat.dispose();map?.dispose()});
 }
 parent.add(root);return {root,count:pieces.length,dispose(){root.removeFromParent();cleanup.forEach(f=>f());geo.dispose()}};
}
/** Permanent wreck beside the existing pool, not on the landing or main route.
 * The host uses the same conservative obstacle bounds for the player capsule. */
export function mountR30LiftWreck(parent:Group,pool:readonly [number,number,number],width:number,length:number,depth:number){
 const pieces:Piece[]=[];
 if(width<5.6||length<3.8||depth<.9)return {parts:0,blocks:()=>false,dispose(){}};
 const x=width/2-.69,z=length/2-.52,y=pool[1]-depth;
 const put=(family:Family,dx:number,dy:number,dz:number,w:number,h:number,d:number,c:number,a=0,axis=axisY)=>pieces.push(part(family,[x+dx,y+dy,z+dz],[w,h,d],c,a,axis));
 for(let i=0;i<5;i++)put('wood',0,.14+i*.016,(i-2)*.21,1.15,.14,.185,0x604735,(i-2)*.08);
 for(const dx of [-.49,.49])for(const dz of [-.49,.49]){
  put('iron',dx,.40,dz,.095,.78,.095,0x80563d,dx*.55,axisZ);
  put('iron',dx,.09,dz,.18,.18,.18,0x343940);
 }
 for(const dz of [-.46,.44])put('wood',0,.65,dz,.95,.14,.12,0x70543e,.31,axisZ);
 for(let i=0;i<5;i++)put('iron',-.40+i*.19,.46,.50,.042,.51,.045,0x505258,(i-2)*.12,axisZ);
 put('iron',0,.84,0,.11,.09,1.04,0x80563d,.26,axisZ);
 // A sheared door frame and snapped suspension rod break the water surface.
 put('wood',.25,.97,-.28,.15,1.36,.17,0x70543e,.35,axisZ);
 put('iron',.48,1.13,.32,.085,1.15,.085,0x80563d,-.25,axisZ);
 put('iron',.06,1.47,-.28,.62,.075,.09,0x505258,.29,axisZ);
 for(const dx of [-.39,.39]){
  put('wood',dx,1.26,.30,.11,1.28,.12,0x604735,dx*.32,axisZ);
  put('iron',dx,1.48,.30,.17,.18,.18,0x80563d);
 }
 put('wood',0,1.70,.30,.90,.13,.14,0x70543e,-.22,axisZ);
 put('wood',0,1.34,.30,.88,.12,.12,0x604735,-.22,axisZ);
 for(let j=0;j<4;j++)put('iron',-.3+j*.2,1.24,.32,.042,.62,.055,0x80563d,-.18,axisZ);
 put('iron',.35,1.68,-.05,.075,.075,.75,0x505258,.52);
 put('glow',.28,1.30,-.3,.13,.10,.13,0xe5a45d);
 const art=batch(parent,pieces,'r30-fallen-cage-wreck');
 // Keep the swept capsule away from the protruding wreck. Nothing in the
 // central landing or shore corridor is changed.
 const box={minX:x-.72,maxX:x+.72,minZ:z-.72,maxZ:z+.72};
 return {parts:art.count,blocks(px:number,pz:number,r:number){return px+r>box.minX&&px-r<box.maxX&&pz+r>box.minZ&&pz-r<box.maxZ},dispose:art.dispose};
}
/** Real Three.js shaft and cage, rendered only during an accepted ride.
 * No new renderer, clock, physics, entry authorization or transition state.
 * Coordinates below are derived from the existing shaft registration. */
export function mountR30LiftPresentation(parent:Group,shaft:Point,landing:Point,mineYaw:number,roofY:number){
 const root=new Group();root.name='r30-registered-lift-presentation';root.visible=false;parent.add(root);
 // Cancel the mine root transform: build visual pieces in world ENY.
 root.rotation.y=-mineYaw;root.position.copy(parent.position).negate().applyAxisAngle(axisY,-mineYaw);
 const point=(t:number)=>new Vector3(shaft.east+(landing.east-shaft.east)*t,shaft.height+(roofY-shaft.height)*t,-(shaft.north+(landing.north-shaft.north)*t));
 const depth=shaft.height-roofY,steps=Math.max(1,Math.ceil(depth/2.15)),walls:Piece[]=[];
 // The visual lining ends above the narrower physical pool aperture;
 // a final black frame covers the actual authority handoff below it.
 const wallAt=(t:number)=>1.71+(1.24-1.71)*t;
 for(let i=0;i<steps;i++){
  const t=(i+.5)/steps,centre=point(t),r=wallAt(t);
  for(let k=0;k<12;k++){
   const a=k*Math.PI/6,shade=(i*7+k*11)%5;
   walls.push(part('rock',[centre.x+Math.cos(a)*r,centre.y,centre.z+Math.sin(a)*r],[.24,depth/steps+.08,r*.56],shade===0?0x505258:shade===1?0x45474a:0x343940,-a));
   if(i%3===0)walls.push(part('wood',[centre.x+Math.cos(a)*(r-.11),centre.y+.78,centre.z+Math.sin(a)*(r-.11)],[.16,.18,r*.53],0x70543e,-a));
  }
  for(const d of [-1,1])walls.push(part('iron',[centre.x+d*(r-.27),centre.y,centre.z],[.07,depth/steps+.02,.07],0x80563d));
 }
 const lining=batch(root,walls,'r30-bore-rock-timber');
 const cage=new Group();cage.name='r30-moving-wood-iron-cage';root.add(cage);
 const bits:Piece[]=[];
 for(let i=0;i<7;i++)bits.push(part('wood',[(i-3)*.205,.05,0],[.198,.13,1.46],i%2?0x70543e:0x594232));
 for(const x of [-.71,.71])for(const z of [-.71,.71]){
  bits.push(part('iron',[x,1.04,z],[.09,2.08,.09],0x80563d));
  bits.push(part('iron',[x,.15,z],[.16,.14,.16],0x343940));
 }
 for(const y of [.18,1.14,2.03]){
  for(const x of [-.71,.71])bits.push(part('wood',[x,y,0],[.09,.12,1.5],0x70543e));
  bits.push(part('wood',[0,y,-.71],[1.5,.12,.09],0x70543e));
 }
 for(let i=0;i<6;i++)for(const x of [-.71,.71])bits.push(part('iron',[x,1.07,(i-2.5)*.22],[.045,1.68,.045],0x505258));
 for(let i=0;i<7;i++)bits.push(part('iron',[(i-3)*.20,1.04,.71],[.045,1.78,.045],0x80563d));
 for(const x of [-.72,.72])bits.push(part('iron',[x,1.08,.71],[.075,2.02,.075],0x343940));
 bits.push(part('iron',[0,2.17,0],[.15,.36,.15],0x80563d),part('glow',[.56,1.65,-.56],[.12,.18,.12],0xe5a45d));
 const cabin=batch(cage,bits,'r30-cage-structure'),lamp=new PointLight(0xe5a45d,9,8,2);lamp.position.set(.56,1.65,-.56);lamp.visible=false;cage.add(lamp);
 let disposed=false;
 function sample(trip:DreamChainTrip,now:number){
  if(disposed||![now,trip.departedAt,trip.travelMs].every(Number.isFinite)||trip.travelMs<=0)return;
  const t=Math.max(0,Math.min(1,(now-trip.departedAt)/trip.travelMs));
  const u=trip.direction==='down'?t:1-t;
  const route=trip.ridePath;
  // The replacement bore is supplied by the actual A/B/C mount. Reuse
  // this original cage, never render the old slanted lining on the new axis.
  if(route&&(trip.first||![route.shaft.east,route.shaft.north,route.shaft.height,route.landing.east,route.landing.north,route.landing.height].every(Number.isFinite)||
    Math.hypot(route.shaft.east-route.landing.east,route.shaft.north-route.landing.north)>1e-6||route.shaft.height<=route.landing.height)){root.visible=false;lamp.visible=false;return}
  lining.root.visible=!route;
  const p=route?new Vector3(route.shaft.east,route.shaft.height+(route.landing.height-route.shaft.height)*u,-route.shaft.north):point(u),sway=trip.first?Math.sin(t*44)*Math.min(.055,t*.08):Math.sin(t*17)*.012;
  cage.position.copy(p);cage.rotation.z=sway;
  lamp.intensity=trip.first&&t>.66?9*(.35+.65*Math.abs(Math.sin(t*145))):9;
  root.visible=t<1;lamp.visible=root.visible;
  const eye={east:p.x,north:-p.z,height:p.y+1.59};
  return {eye,progress:t,blackout:trip.first&&t>=.88,visible:root.visible};
 }
 return {root,cage,parts:lining.count+cabin.count,sample,hide(){root.visible=false;lamp.visible=false},dispose(){if(disposed)return;disposed=true;lining.dispose();cabin.dispose();lamp.removeFromParent();root.removeFromParent()}};
}
