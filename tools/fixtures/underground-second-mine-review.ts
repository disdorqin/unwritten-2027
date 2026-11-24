import {AmbientLight,Color,PerspectiveCamera,PointLight,Scene,Vector3,WebGLRenderer} from 'three';
import {createSecondMineScene} from '../voxel-tavern/town-blockout/underground-second-mine.js';
import type {MineRiverState} from '../../src/shared/underground-second-mine-layout.js';
const mine=createSecondMineScene(),scene=new Scene();scene.background=new Color(0x10171e);scene.add(mine.group,new AmbientLight(0xa0b3c6,.62));
const camera=new PerspectiveCamera(65,innerWidth/innerHeight,.06,180),lamp=new PointLight(0xffd6ac,26,22,2);camera.add(lamp);scene.add(camera);
const renderer=new WebGLRenderer({antialias:false,powerPreference:'low-power'});renderer.setSize(innerWidth,innerHeight);document.body.append(renderer.domElement);
const views={gallery:[0,12,0,48],near:[0,115,0,142],bypass:[51.5,120,51.5,160],far:[0,153,21,164],support:[0,9,-5,9],workface:[0,46,-24,46],westWing:[-12,46,-27,48],eastWing:[15,79,29,82],collapse:[-52,167,-64,170],barracks:[55,174,63,176]} as const;
let frames=0,trustedW=0,walked=0,rejected=0,start=performance.now(),view='gallery';const keys=new Set<string>(),direction=new Vector3();
function setView(name:keyof typeof views){const [e,n,te,tn]=views[name];view=name;camera.position.set(e,(mine.floor(e,n)??0)+1.67,-n);camera.lookAt(te,1.67,-tn);return mine.canStand(e,n);}
function state(s:MineRiverState){mine.setRiverState(s);return true}
function step(seconds:number){if(!keys.has('w'))return false;camera.getWorldDirection(direction);direction.y=0;direction.normalize();const distance=seconds*3,count=Math.ceil(distance/.08);for(let i=0;i<count;i++){const next=camera.position.clone().addScaledVector(direction,distance/count);if(!mine.canStand(next.x,-next.z)){rejected++;return false;}next.y=(mine.floor(next.x,-next.z)??0)+1.67;camera.position.copy(next);walked+=distance/count;}return true}
addEventListener('keydown',e=>{if(e.key.toLowerCase()==='w'){keys.add('w');if(e.isTrusted)trustedW++;e.preventDefault()}});
addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));setView('gallery');
function frame(){renderer.render(scene,camera);frames++;requestAnimationFrame(frame)}requestAnimationFrame(frame);
Object.assign(window,{mineReview:{setView,state,step,resetFPS:()=>{frames=0;start=performance.now()},inspect:()=>({frames,view,state:mine.riverState,eye:camera.position.toArray(),trustedW,walked,rejected,pieces:mine.pieces,boat:mine.boat.visible,water:mine.water.visible,calls:renderer.info.render.calls,fps:frames*1000/Math.max(1,performance.now()-start)})}});
