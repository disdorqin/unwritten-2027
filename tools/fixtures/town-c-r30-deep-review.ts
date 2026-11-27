import {AmbientLight,Color,FogExp2,Group,PerspectiveCamera,PointLight,Scene,Vector3,WebGLRenderer} from 'three';
import {mountWestCraterRoad} from '../voxel-tavern/town-blockout/town-za22-crater-road.js';
import {mountUndergroundDomainHost} from '../voxel-tavern/town-blockout/underground-domain-host.js';
import {r30DeepDomains,r30LinkDomain} from '../voxel-tavern/town-blockout/town-c-r30-deep-assembly.js';
import {r30DeepFrames,r30DepthLinks,r30DeepWorldFeet,r30LayerWorld,r30LinkPoint,type R30Point} from '../voxel-tavern/town-blockout/town-c-r30-deep-layer-contract.js';
import {createUndergroundWaterState} from '../../src/presence/underground-water-state.js';
type Foot=R30Point&{domainId:string};
const scene=new Scene();scene.background=new Color(0x161e27);scene.fog=new FogExp2(0x161e27,.022);
const root=new Group();scene.add(root,new AmbientLight(0xaebfd8,.48));
const water=createUndergroundWaterState({dawnEpoch:0,now:()=>0});
let linksAccepted=false,foot:Foot={domainId:r30DeepDomains.minus140,...r30DeepWorldFeet.minus140.exit};
const m=mountUndergroundDomainHost({parent:root,road:mountWestCraterRoad(260,()=>10.7773),
 readAcceptedDomainFoot:()=>foot,waterBridge:{readWaterSnapshot:()=>water.tonight()},
 deepRooms:{acceptsRoom:()=>true,acceptsFrame:()=>true,acceptsLink:()=>linksAccepted,readNight:()=>true,readLightBudget:()=>1}});
if(m.kind!=='ready')throw Error(m.reason);const host=m;
const camera=new PerspectiveCamera(70,innerWidth/innerHeight,.05,90);
const torch=new PointLight(0xffdab0,32,20,2);camera.add(torch);scene.add(camera);
const renderer=new WebGLRenderer({antialias:false,powerPreference:'low-power'});renderer.setPixelRatio(Math.min(1,devicePixelRatio));renderer.setSize(innerWidth,innerHeight);
document.body.append(renderer.domElement);
const controls=document.createElement('div');controls.style.cssText='position:fixed;bottom:12px;left:12px;display:flex;gap:8px;z-index:2';
const stepButton=document.createElement('button');stepButton.textContent='前进';stepButton.style.cssText='min-width:72px;min-height:48px;touch-action:manipulation';
const seamButton=document.createElement('button');seamButton.textContent='穿过层界';seamButton.style.cssText=stepButton.style.cssText;
controls.append(stepButton,seamButton);document.body.append(controls);
const vec=(p:R30Point)=>new Vector3(p.east,p.height,-p.north);
const layers=r30DeepFrames,links=r30DepthLinks;
const l=(layer:keyof typeof layers,east:number,north:number,height=0)=>r30LayerWorld(layers[layer],{east,north,height});
const p=(i:number,t:number)=>r30LinkPoint(links[i],t)!;
const views={
 sealed:{domainId:r30DeepDomains.minus140,at:l('minus140',0,194),look:l('minus140',0,198,1.5),open:false},
 open:{domainId:r30DeepDomains.minus140,at:r30DeepWorldFeet.minus140.exit,look:p(0,9),open:true},
 corridor1:{domainId:r30LinkDomain(links[0]),at:p(0,62),look:p(0,78),open:true},
 city:{domainId:r30DeepDomains.minus165,at:l('minus165',25,0),look:l('minus165',38,6,1.3),open:true},
 corridor2:{domainId:r30LinkDomain(links[1]),at:p(1,49),look:p(1,63),open:true},
 palace:{domainId:r30DeepDomains.minus190,at:l('minus190',0,20,-2.4),look:l('minus190',0,45,-.9),open:true},
 palaceArena:{domainId:r30DeepDomains.minus190,at:l('minus190',0,112,-2.4),look:l('minus190',0,125.4,-.8),open:true},
} as const;
let view:keyof typeof views='sealed',frames=0,trustedKeys=0,trustedTaps=0,steps=0,transfers=0,rejected=0,stamp=performance.now(),last=stamp;
let frameMs:number[]=[];
function setView(name:keyof typeof views){
 const q=views[name];if(!q)return false;
 linksAccepted=q.open;foot={domainId:q.domainId,...q.at};host.mounted.sync();
 const floor=host.domainPassageAt(foot.domainId,foot.east,foot.north);
 if(!floor)return false;
 foot={...foot,height:floor.floor};camera.position.copy(vec(foot)).add(new Vector3(0,1.67,0));camera.lookAt(vec(q.look));view=name;return true;
}
function advance(metres:number){
 const dir=camera.getWorldDirection(new Vector3());dir.y=0;dir.normalize();
 for(let i=0;i<Math.ceil(metres/.08);i++){
  const d=metres/Math.ceil(metres/.08);
  const dest={east:foot.east+dir.x*d,north:foot.north-dir.z*d};
  const step=host.resolveUndergroundStep(foot,dest,'standing');
  if(!step){rejected++;return false}
  foot=step.foot;steps++;
  camera.position.copy(vec(foot)).add(new Vector3(0,1.67,0));
 }
 return true;
}
function cross(){
 const a=host.deepAssembly;
 for(const c of a.contracts){
  for(const target of [c.domainId,c.entry.domainId,c.exit.domainId]){
   const next=a.resolveHandoff(foot,target);
   if(!next)continue;
   // Review adapter commits a fixture foot; the real production host must
   // commit its own accepted Presence transition atomically.
   foot={...next.to};host.mounted.sync();camera.position.copy(vec(foot)).add(new Vector3(0,1.67,0));transfers++;return true;
  }
 }
 rejected++;return false;
}
addEventListener('keydown',e=>{
 if(e.key.toLowerCase()==='w'){if(e.isTrusted)trustedKeys++;advance(.4);e.preventDefault()}
 if(e.key.toLowerCase()==='e'){if(e.isTrusted)trustedKeys++;cross();e.preventDefault()}
});
stepButton.addEventListener('click',e=>{if(e.isTrusted)trustedTaps++;advance(.4)});
seamButton.addEventListener('click',e=>{if(e.isTrusted)trustedTaps++;cross()});
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
if(!setView('sealed'))throw Error('initial foot not supported');
function frame(t:number){
 host.mounted.sync();renderer.render(scene,camera);frames++;if(t-last>0&&frameMs.length<180)frameMs.push(t-last);last=t;requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
Object.assign(window,{deepReview:{setView,reset(){frames=0;stamp=performance.now();last=stamp;frameMs=[]},inspect(){
 const ordered=[...frameMs].sort((a,b)=>a-b);
 return {view,frames,steps,transfers,rejected,trustedKeys,trustedTaps,foot:{...foot},links:host.deepAssembly.openLinks(),
  calls:renderer.info.render.calls,tris:renderer.info.render.triangles,fps:frames*1000/Math.max(1,performance.now()-stamp),
  medianMs:ordered[Math.floor(ordered.length/2)],p95Ms:ordered[Math.floor(ordered.length*.95)],
  viewport:[innerWidth,innerHeight],scope:'review acceptance fixture, actual C/C2 geometry and movement'};
}}});
