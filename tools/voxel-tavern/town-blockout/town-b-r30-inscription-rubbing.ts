import {BufferGeometry,Float32BufferAttribute,Mesh,MeshLambertMaterial,Ray,Vector3} from 'three';
import {SHIP_EMBLEM_CELLS} from './ship-emblem';
import type {CraterInscriptionScene} from './town-c2-crater-inscription';
type Point=Readonly<{east:number;north:number;height:number}>;
type Pose=Point&Readonly<{heading:number;pitch:number;eyeHeight:number}>;
export type BR30RubbingFacts=Readonly<{progress:number;complete:boolean}>;
/** Same connected mark, printed onto the top existing paper sheet.
 * Geometry reveals rows in order; no extra text, lights or collectible. */
export function installBR30RubbingPaper(scene:CraterInscriptionScene){
 const table=scene.group.getObjectByName('town-c2-crater-inscription/rubbing-table');
 if(!table||table.getObjectByName('b-r30-rubbing-transfer'))throw Error('Missing or duplicate rubbing table');
 const pos:number[]=[],cells=[...SHIP_EMBLEM_CELLS].sort((a,b)=>b.y-a.y||a.x-b.x);
 for(const c of cells){
  const x=-.30+c.x*.28,z=.03-c.y*.28,y=.844,w=.0144;
  pos.push(x-w,y,z-w,x-w,y,z+w,x+w,y,z+w,x-w,y,z-w,x+w,y,z+w,x+w,y,z-w);
 }
 const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(pos,3));geometry.computeVertexNormals();
 const material=new MeshLambertMaterial({color:0x31302a});
 const print=new Mesh(geometry,material);print.name='b-r30-rubbing-transfer';table.add(print);
 let shown=0;
 function show(f:BR30RubbingFacts|undefined){
  // No valid receipt: hide partial print, preserve no invented result.
  const valid=f&&typeof f.complete==='boolean'&&Number.isFinite(f.progress)&&f.progress>=0&&f.progress<=1;
  shown=valid?(f.complete?cells.length:Math.floor(f.progress*cells.length)):0;
  geometry.setDrawRange(0,shown*6);print.visible=shown>0;
 }
 const paper={...scene.layout.paper,height:scene.layout.table.height+.844};
 function aimed(p:Pose){
  const foot=scene.layout.useFoot;
  if(![p.east,p.north,p.height,p.heading,p.pitch,p.eyeHeight].every(Number.isFinite)||p.eyeHeight<.5||p.eyeHeight>2.2)return false;
  if(Math.hypot(p.east-foot.east,p.north-foot.north)>1.1||Math.abs(p.height-foot.height)>.25)return false;
  const eye=new Vector3(p.east,p.height+p.eyeHeight,-p.north);
  const aim=new Vector3(Math.sin(p.heading)*Math.cos(p.pitch),Math.sin(p.pitch),-Math.cos(p.heading)*Math.cos(p.pitch));
  const target=new Vector3(paper.east,paper.height,-paper.north),delta=target.clone().sub(eye);
  return delta.length()<=scene.rubbingHostMarker.range&&delta.dot(aim)>0&&new Ray(eye,aim).distanceSqToPoint(target)<=.23**2;
 }
 show(undefined);
 return {paper,aimed,show,get shown(){return shown;},cellCount:cells.length,dispose(){print.removeFromParent();geometry.dispose();material.dispose();}};
}
/** The host advances the original hold/grace rule on accepted input.
 * This adapter never grants an atlas entry or advances its own clock. */
export type BR30RubbingHost=Readonly<{
 pose():Pose|undefined;facts():BR30RubbingFacts|undefined;
 setHeld(markerId:string,held:boolean):void;
}>;
export function createBR30RubbingControls(model:ReturnType<typeof installBR30RubbingPaper>,markerId:string,host:BR30RubbingHost){
 let held=false;
 function frame(keyHeld:boolean){
  const pose=host.pose(),facts=host.facts();
  const next=!!(keyHeld&&pose&&facts&&!facts.complete&&Number.isFinite(facts.progress)&&facts.progress>=0&&facts.progress<=1&&model.aimed(pose));
  if(next!==held){host.setHeld(markerId,next);held=next;}
  model.show(facts);
  return {aim:!!pose&&model.aimed(pose),held,shown:model.shown};
 }
 return {frame,release(){if(held)host.setHeld(markerId,false);held=false;}};
}
