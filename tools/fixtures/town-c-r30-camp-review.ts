import {AmbientLight,Color,FogExp2,Group,PerspectiveCamera,PointLight,Scene,Vector3,WebGLRenderer} from 'three';
import {mountWestCraterRoad} from '../voxel-tavern/town-blockout/town-za22-crater-road.js';
import {mountUndergroundDomainHost} from '../voxel-tavern/town-blockout/underground-domain-host.js';
const scene=new Scene();scene.background=new Color(0x1c232a);scene.fog=new FogExp2(0x1c232a,.035);
const root=new Group();scene.add(root,new AmbientLight(0xb4c4de,.55));
const road=mountWestCraterRoad(260,()=>10.7773);
const host=mountUndergroundDomainHost({parent:root,road});
if(host.kind!=='ready')throw Error(host.reason);
const camp=host.mounted.camp!;
const camera=new PerspectiveCamera(70,innerWidth/innerHeight,.05,65);
const torch=new PointLight(0xffd1a0,35,16,2);camera.add(torch);scene.add(camera);
const render=new WebGLRenderer({antialias:false,powerPreference:'low-power'});render.setSize(innerWidth,innerHeight);document.body.append(render.domElement);
const vec=(local:readonly [number,number,number])=>{const p=host.mounted.toWorld(local)!;return new Vector3(p.east,p.height,-p.north)};
const eyes:Record<string,{eye:readonly [number,number,number];look:readonly [number,number,number]}>={
 entry:{eye:[0,-91,35.29],look:[0,-90.4,40]},
 hearth:{eye:[2.5,-91,40],look:[2.5,-90.42,38.7]},
 dorm:{eye:camp.rooms[3].approach,look:[6.4,-90.1,40.7]},
 canteen:{eye:[0,-91,42.45],look:[-1.4,-90.15,42.45]},
 memorial:{eye:[2.6,-91,43.76],look:[2.6,-89.65,44.6]},
 exit:{eye:[0,-91,43],look:[0,-90.1,35.4]},
 wreck:{eye:[0,-91.2,2],look:[2.31,-90.05,1.48]},
};
let frames=0,walked=0,rejected=0,trustedW=0,view='entry',stamp=performance.now();
const keys=new Set<string>(),direction=new Vector3();
function setView(name:string){
 const ride=host.mounted.shaftRide;
 if(name.startsWith('lift-')){
  if(!ride)return false;
  const at=name==='lift-upper'?4000:name==='lift-mid'?12500:20500;
  const cue=ride.sample({id:1,first:true,departedAt:0,travelMs:25000,direction:'down'},at);
  if(!cue)return false;
  camera.position.set(cue.eye.east,cue.eye.height,-cue.eye.north);
  camera.lookAt(camera.position.clone().add(new Vector3(.2,-.55,-1)));
  torch.intensity=5;view=name;return true;
 }
 ride?.hide();torch.intensity=35;
 const v=eyes[name];if(!v)return false;const p=vec(v.eye);
 if(!host.passageAt(p.x,-p.z))return false;
 camera.position.copy(p).add(new Vector3(0,1.67,0));camera.lookAt(vec(v.look));view=name;return true;
}
function step(seconds:number){
 if(!keys.has('w')||seconds<=0||seconds>2)return false;
 camera.getWorldDirection(direction);direction.y=0;direction.normalize();
 const distance=seconds*2.7,count=Math.ceil(distance/.05);
 for(let i=0;i<count;i++){
  const next=camera.position.clone().addScaledVector(direction,distance/count),p=host.passageAt(next.x,-next.z);
  if(!p){rejected++;return false}
  camera.position.set(next.x,p.floor+1.67,next.z);walked+=distance/count;
 }return true;
}
addEventListener('keydown',e=>{if(e.key.toLowerCase()==='w'){keys.add('w');if(e.isTrusted)trustedW++;e.preventDefault()}});
addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
if(!setView('entry'))throw Error('camp entry blocked');
function frame(){host.mounted.sync();render.render(scene,camera);frames++;requestAnimationFrame(frame)}requestAnimationFrame(frame);
Object.assign(window,{campR30:{setView,step,reset:()=>{frames=0;stamp=performance.now()},inspect:()=>({view,frames,walked,rejected,trustedW,calls:render.info.render.calls,tris:render.info.render.triangles,fps:frames*1000/Math.max(1,performance.now()-stamp),roofParts:camp.r30Roof.parts.length,props:camp.props.length})}});
