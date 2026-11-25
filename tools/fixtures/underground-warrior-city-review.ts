import {AmbientLight,Color,FogExp2,PerspectiveCamera,PointLight,Scene,Vector3,WebGLRenderer} from 'three';
import {createWarriorCityCandidate} from '../voxel-tavern/town-blockout/underground-warrior-city-candidate.js';
const city=createWarriorCityCandidate(),scene=new Scene();scene.background=new Color(0x202731);scene.fog=new FogExp2(0x202731,.013);scene.add(city.group,new AmbientLight(0x8a98ac,.48));
const camera=new PerspectiveCamera(68,innerWidth/innerHeight,.06,135),lamp=new PointLight(0xffdbbc,27,24,2);
camera.add(lamp);scene.add(camera);
const renderer=new WebGLRenderer({antialias:false,powerPreference:'low-power'});renderer.setSize(innerWidth,innerHeight);document.body.append(renderer.domElement);
const views={gate:[1,0,18,0],street:[26,0,75,0],square:[86,-2,104,-10],tavern:[125,16,125,23.15],forge:[142,3.6,142,10.8],market:[124,-15,153,-21],exit:[171,0,179,0]} as const;
let frames=0,trustedW=0,walked=0,rejected=0,start=performance.now(),view='gate';const keys=new Set<string>(),direction=new Vector3();
function setView(name:keyof typeof views){const [e,n,te,tn]=views[name];view=name;camera.position.set(e,1.67,-n);camera.lookAt(te,1.67,-tn);return city.canStand(e,n)}
function step(seconds:number){if(!keys.has('w')||seconds<=0||seconds>3)return false;camera.getWorldDirection(direction);direction.y=0;direction.normalize();const d=seconds*3,count=Math.ceil(d/.10);
 for(let i=0;i<count;i++){const next=camera.position.clone().addScaledVector(direction,d/count);if(!city.canStand(next.x,-next.z)){rejected++;return false;}camera.position.copy(next);walked+=d/count}return true}
addEventListener('keydown',e=>{if(e.key.toLowerCase()==='w'){keys.add('w');if(e.isTrusted)trustedW++;e.preventDefault()}});addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));setView('gate');
function frame(){renderer.render(scene,camera);frames++;requestAnimationFrame(frame)}requestAnimationFrame(frame);
Object.assign(window,{cityReview:{setView,step,light:(on:boolean)=>{lamp.visible=on;return true},resetFPS:()=>{frames=0;start=performance.now()},inspect:()=>({frames,view,eye:camera.position.toArray(),trustedW,walked,rejected,clear:city.canStand(camera.position.x,-camera.position.z),shell:city.shell.count,instanced:city.instancedPieces,calls:renderer.info.render.calls,fps:frames*1000/Math.max(1,performance.now()-start)})}});
