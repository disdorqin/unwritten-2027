import {AmbientLight,BufferAttribute,BufferGeometry,Color,DoubleSide,FogExp2,Group,Mesh,MeshLambertMaterial,PerspectiveCamera,PointLight,Scene,Vector3,WebGLRenderer} from 'three';
import {createUndergroundMineLayout} from '../../src/shared/underground-mine-layout.js';
import {undergroundMineSpec} from './underground-first-mine-survey-spec.js';
import {mountFirstMineWorkfaces} from '../voxel-tavern/town-blockout/town-c-first-mine-workfaces.js';
import {mountFirstMineDeepWorks} from '../voxel-tavern/town-blockout/town-c-first-mine-deep-works.js';
const mine=createUndergroundMineLayout(undergroundMineSpec),root=new Group(),scene=new Scene();
root.position.y=91;scene.add(root,new AmbientLight(0x8797ae,.48));scene.background=new Color(0x161d27);scene.fog=new FogExp2(0x161d27,.022);
for(const [surface,vertices] of Object.entries(mine.mesh)){
 const geo=new BufferGeometry();geo.setAttribute('position',new BufferAttribute(vertices,3));geo.computeVertexNormals();
 root.add(new Mesh(geo,new MeshLambertMaterial({side:DoubleSide,color:surface==='water'?0x29445b:surface==='rail'?0x77695b:0x544f49})));
}
const art=mountFirstMineWorkfaces(root,mine.workfaces,mine.supportStation);
const deep=mountFirstMineDeepWorks(root,mine.expansion?.deepWorks===true);
const camera=new PerspectiveCamera(68,innerWidth/innerHeight,.06,88),lamp=new PointLight(0xffd6ac,32,20,2);
camera.add(lamp);scene.add(camera);const renderer=new WebGLRenderer({antialias:false,powerPreference:'low-power'});
renderer.setSize(innerWidth,innerHeight);document.body.append(renderer.domElement);
const views=Object.fromEntries([...mine.workfaces,mine.supportStation!].map(s=>[s.id,{eye:s.id==='support-station'?[.1,s.z]:[s.x,s.foot[2]+2.1],target:[s.x,s.z]}]));
Object.assign(views,{'deep-west-entry':{eye:[0,131],target:[-20,131]},'collapse':{eye:[-37,131],target:[-45,131]},'dry-bypass':{eye:[45.5,110],target:[45.5,125]},'barracks':{eye:[38,132],target:[31.2,126.35]},'west-bank':{eye:[-5.6,136.1],target:[2,134.8]},'east-bank':{eye:[16.8,135.5],target:[7,135.5]}});
let frames=0,walked=0,rejected=0,trustedW=0,start=performance.now(),view='workface-1';const keys=new Set<string>(),direction=new Vector3();
function setView(name:string){
 const v=views[name];if(!v)return false;view=name;const [x,z]=v.eye;
 const p=mine.queryPassage(x,z,.27,1.8,'open');if(!p)return false;
 camera.position.set(x,p.floor+91+1.67,z);camera.lookAt(v.target[0],.83,v.target[1]);return true;
}
function step(seconds:number){
 if(!keys.has('w')||seconds<=0||seconds>3)return false;camera.getWorldDirection(direction);direction.y=0;direction.normalize();const d=seconds*3,count=Math.ceil(d/.08);
 for(let i=0;i<count;i++){const next=camera.position.clone().addScaledVector(direction,d/count),p=mine.queryPassage(next.x,next.z,.27,1.8,'open');if(!p){rejected++;return false;}camera.position.set(next.x,p.floor+91+1.67,next.z);walked+=d/count}return true;
}
addEventListener('keydown',e=>{if(e.key.toLowerCase()==='w'){keys.add('w');if(e.isTrusted)trustedW++;e.preventDefault()}});addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));setView('workface-1');
function frame(){renderer.render(scene,camera);frames++;requestAnimationFrame(frame)}requestAnimationFrame(frame);
Object.assign(window,{workfaceReview:{setView,step,resetFPS:()=>{frames=0;start=performance.now()},inspect:()=>({frames,view,eye:camera.position.toArray(),trustedW,walked,rejected,pieces:art.pieces,deepPieces:deep.pieces,calls:renderer.info.render.calls,fps:frames*1000/Math.max(1,performance.now()-start)})}});
