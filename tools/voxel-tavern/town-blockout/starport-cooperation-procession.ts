import {BoxGeometry,Color,DynamicDrawUsage,Group,InstancedMesh,MeshLambertMaterial,Object3D,Vector3} from 'three';
import type {CombineSnapshot} from '../../../src/shared/town-combine-flags';
import {buildSwitchbackCenterline,type SwitchbackPoint} from './front-ridge-switchback-road';
import {voxelPersonParts} from './town-voxel-person';

/** D's part of the procession. A owns the town leg, C the return cage.
 * No new flag, time source, event start or ignition judgment.
 * B supplies the accepted event snapshot and route metres. */
export const starportCarryNames=['石九斤','温九','赵满仓','罗大年'] as const;
const palettes=[
 ['#bc956c','#584433','#647477','#bda273','#3e4548','#9c503a','#deb268','#6b4939'],
 ['#e4af86','#554135','#856449','#e2c698','#4b4742','#ac5644','#ebc183','#76543e'],
 ['#c99e72','#513e31','#4e6852','#a86a4b','#46423c','#ab854d','#b8bca1','#74553f'],
 ['#cb9b77','#41434b','#4e6372','#c0b39a','#3b464d','#a9654d','#d4b375','#6c4c3a'],
] as const;
export function buildStarportCarryMountainRoute(){
 const points=buildSwitchbackCenterline();
 for(const [east,north,height] of [[336,642,347],[336,645,347],[336,648,347],[336,651,347],[336,654,347],[336,655,347],[333,655,347],[330,655,347],[327,655,347],[324,655,347]] as const){
  const prev=points.at(-1)!;points.push({east,north,height,cum:prev.cum+Math.hypot(east-prev.east,north-prev.north)});
 }
 return points;
}
export function sampleStarportCarryRoute(route:readonly SwitchbackPoint[],metres:number){
 if(route.length<2||!Number.isFinite(metres))return;
 const m=Math.max(0,Math.min(route.at(-1)!.cum,metres));
 let lo=0,hi=route.length-1;
 while(hi-lo>1){const mid=(lo+hi)>>1;if(route[mid]!.cum<=m)lo=mid;else hi=mid}
 const a=route[lo]!,b=route[hi]!,f=(m-a.cum)/Math.max(1e-9,b.cum-a.cum);
 return {east:a.east+(b.east-a.east)*f,north:a.north+(b.north-a.north)*f,height:a.height+(b.height-a.height)*f,heading:Math.atan2(b.east-a.east,b.north-a.north),metres:m};
}
export function mountStarportCarryFormation(parent:Group){
 const group=new Group();group.name='starport-first-event-carry-formation';group.visible=false;parent.add(group);
 const geometry=new BoxGeometry(),material=new MeshLambertMaterial({color:'#ffffff'});
 const bodies=new InstancedMesh(geometry,material,starportCarryNames.length*voxelPersonParts.length);
 bodies.name='starport-carry-actors';bodies.instanceMatrix.setUsage(DynamicDrawUsage);bodies.frustumCulled=false;group.add(bodies);
 const cargo=new Group();cargo.name='starport-carried-booster-display';group.add(cargo);
 const cargoMaterial=new MeshLambertMaterial({color:'#ffffff'});
 const pieces=[
  {x:0,y:0,z:0,w:.72,h:.55,d:1.65,color:'#586b6a'},
  {x:0,y:.04,z:.62,w:.78,h:.65,d:.28,color:'#987b55'},
  {x:0,y:.04,z:-.62,w:.78,h:.65,d:.28,color:'#987b55'},
  {x:-.64,y:-.24,z:0,w:.10,h:.10,d:2.8,color:'#735238'},
  {x:.64,y:-.24,z:0,w:.10,h:.10,d:2.8,color:'#735238'},
  {x:0,y:.33,z:0,w:.36,h:.12,d:1.10,color:'#ad9b76'},
 ];
 const cargoBatch=new InstancedMesh(geometry,cargoMaterial,pieces.length),tmp=new Object3D(),color=new Color();
 pieces.forEach((p,i)=>{tmp.position.set(p.x,p.y,p.z);tmp.scale.set(p.w,p.h,p.d);tmp.updateMatrix();cargoBatch.setMatrixAt(i,tmp.matrix);cargoBatch.setColorAt(i,color.set(p.color))});cargoBatch.computeBoundingSphere();cargo.add(cargoBatch);
 let route:SwitchbackPoint[]|undefined;
 function hide(){group.visible=false}
 function apply(snapshot:Pick<CombineSnapshot,'mode'|'stage'|'handsEventPending'>,metres:number,strideSeconds:number){
   // Only the accepted first carrying phase may display the team. Nothing
   // here mutates flags, claims the item, or controls the player's view.
   if(snapshot.mode!=='first'||snapshot.stage!=='forged'||!snapshot.handsEventPending||!Number.isFinite(metres)||!Number.isFinite(strideSeconds)){hide();return false}
   route??=buildStarportCarryMountainRoute();const centre=sampleStarportCarryRoute(route,metres);
   if(!centre){hide();return false}
   // The caller mounts this in the currently accepted domain scene;
   // do not infer presence-domain ownership from the geometry coordinates.
   group.visible=true;let i=0;
   const turn=new Vector3(),sideOffset=.80;
   for(let a=0;a<4;a++){
     const side=a%2===0?-1:1,along=a<2?1.02:-1.02;
     const base=sampleStarportCarryRoute(route,metres+along)!;
     const yaw=base.heading+Math.PI;
     const phase=Math.sin(strideSeconds*6+a*Math.PI/2);
     const ex=base.east+Math.cos(base.heading)*side*sideOffset,nz=base.north-Math.sin(base.heading)*side*sideOffset;
     for(const [at,size,tint,swing] of voxelPersonParts){
       const [x,y,z]=at;
       const leg=y<.72&&swing!==undefined;
       const carry=y>.72&&y<1.40&&swing!==undefined;
       turn.set(x,y+(leg?Math.abs(phase)*.045:carry?.19:0),z+(leg?phase*swing*.12:carry?.20:0));
       tmp.position.set(ex+turn.x*Math.cos(yaw)+turn.z*Math.sin(yaw),base.height+turn.y,-nz-turn.x*Math.sin(yaw)+turn.z*Math.cos(yaw));
       tmp.rotation.set(leg?phase*swing*.19:carry?-0.55:0,yaw,0);tmp.scale.set(...size);tmp.updateMatrix();
       bodies.setMatrixAt(i,tmp.matrix);bodies.setColorAt(i,color.set(palettes[a]![tint]!));i++;
     }
   }
   cargo.position.set(centre.east,centre.height+1.16,-centre.north);cargo.rotation.y=centre.heading+Math.PI;
   bodies.instanceMatrix.needsUpdate=true;if(bodies.instanceColor)bodies.instanceColor.needsUpdate=true;
   return true;
 }
 return {group,apply,hide,route:()=>route??=buildStarportCarryMountainRoute(),dispose(){group.removeFromParent();geometry.dispose();material.dispose();cargoMaterial.dispose()}};
}
