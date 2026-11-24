import {AmbientLight,Color,PerspectiveCamera,PointLight,Scene,Vector3,WebGLRenderer} from 'three';
import {createWarriorForgeHall} from '../voxel-tavern/town-blockout/underground-warrior-forge-hall.js';
const hall=createWarriorForgeHall({east:0,north:0,height:0});
const scene=new Scene();scene.background=new Color(0x181e25);scene.add(hall.group,new AmbientLight(0x8399af,.38));
const camera=new PerspectiveCamera(65,innerWidth/innerHeight,.06,50);
const headlamp=new PointLight(0xffdbac,9,12,2);headlamp.position.set(0,.02,-.09);camera.add(headlamp);scene.add(camera);
const renderer=new WebGLRenderer({antialias:false,powerPreference:'low-power'});
renderer.setSize(innerWidth,innerHeight);document.body.append(renderer.domElement);
const views={
  entrance:{eye:[0,1.67,-.35],target:[0,1.67,-8.5]},
  hearth:{eye:[.4,1.67,-4.65],target:[2,1.88,-7.12]},
  quench:{eye:[-.2,1.67,-6.4],target:[-3.55,.76,-7.63]},
  rack:{eye:[-1.65,1.67,-2.5],target:[-4.28,1.2,-2.3]},
} as const;
type View=keyof typeof views;
let frames=0,view:View='entrance',trustedW=0,walked=0,rejected=0;
const keys=new Set<string>(),direction=new Vector3();
function setView(next:View){
  if(!Object.hasOwn(views,next))return false;
  view=next;camera.position.set(...views[next].eye);camera.lookAt(...views[next].target);
  return hall.canStand(camera.position.x,-camera.position.z);
}
function lamp(on:boolean){headlamp.visible=on;return true}
function step(seconds:number){
  if(!keys.has('w')||!Number.isFinite(seconds)||seconds<=0||seconds>2)return false;
  camera.getWorldDirection(direction);direction.y=0;direction.normalize();
  const distance=seconds*2.5,count=Math.ceil(distance/.05);
  for(let i=0;i<count;i++){
    const next=camera.position.clone().addScaledVector(direction,distance/count);
    if(!hall.canStand(next.x,-next.z)){rejected++;return false}
    camera.position.copy(next);walked+=distance/count;
  }
  return true;
}
addEventListener('keydown',e=>{if(e.key.toLowerCase()==='w'){keys.add('w');if(e.isTrusted)trustedW++;e.preventDefault()}});
addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
setView('entrance');
function frame(){renderer.render(scene,camera);frames++;requestAnimationFrame(frame)}requestAnimationFrame(frame);
Object.assign(window,{forgeReview:{setView,lamp,step,inspect:()=>({
  frames,view,lamp:headlamp.visible,eye:camera.position.toArray(),target:[...views[view].target],trustedW,walked,rejected,
  clear:hall.canStand(camera.position.x,-camera.position.z),pieces:hall.dressing.geometry.pieces.length,
  calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,
})}});
