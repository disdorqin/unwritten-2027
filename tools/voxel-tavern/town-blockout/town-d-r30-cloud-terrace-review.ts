import {AmbientLight,Color,DirectionalLight,Fog,Group,PerspectiveCamera,Scene,Vector3,WebGLRenderer} from 'three';
import {createTerrainGrid} from './terrain';
import {buildFrontRidgeR30Field,mountFrontRidgeR30} from './town-d-r30-front-ridge';
import {mountRidgeCableFacilities} from './town-d-r30-cable-facilities';
import {mountRidgeCloudTerrace,ridgeCloudHandoff,type TerraceFoot} from './town-d-r30-cloud-terrace';
import {createFrontRidgeCloudBand} from './front-ridge-cloud-band';
import {cloudStoneRingAnchor} from './main-summit-cloud-terrace-ring';
import {summitAssemblyAnchor} from './main-summit-assembly';
import {mountCloudseaVista} from './town-d-r30-cloudsea-vista';
const grid=createTerrainGrid(),field=buildFrontRidgeR30Field(grid.groundHeightAt,(e,n)=>{
 const t=Math.min(1,Math.hypot(Math.max(0,Math.abs(e-526)-29),Math.max(0,Math.abs(n-329)-17))/15);return t*t*(3-2*t);
});
const scene=new Scene(),owner=new Group();scene.add(owner);
const mountain=mountFrontRidgeR30(field);owner.add(mountain.group);
const facilities=mountRidgeCableFacilities(owner,field),terrace=mountRidgeCloudTerrace(owner,field,facilities.blocked);
const clouds=createFrontRidgeCloudBand();owner.add(clouds.group);
const vista=mountCloudseaVista(field);owner.add(vista.group);
const ambient=new AmbientLight('#dbe8ef',1.4),sun=new DirectionalLight('#fff1da',2.0);sun.position.set(-200,440,-120);scene.add(ambient,sun);
const renderer=new WebGLRenderer({antialias:true});renderer.setPixelRatio(1);document.querySelector('#scene')!.append(renderer.domElement);
const camera=new PerspectiveCamera(64,1,.10,1550),look=new Vector3(),keys=new Set<string>();
const targets=[...ridgeCloudHandoff.lookouts.map((p,i)=>({...p,name:p.title,lookYaw:[Math.PI,Math.PI/2,-.42,1.12][i]!})),
 {...ridgeCloudHandoff.assemblyVisitor,name:'星港装配台',lookYaw:0},
 {east:300,north:665,height:347,name:'山门前沿（不跨域）',lookYaw:0},
 {...ridgeCloudHandoff.terminal,name:'缆车站',lookYaw:Math.PI}];
let foot:TerraceFoot={...ridgeCloudHandoff.terminal},yaw=-.25,pitch=.02,night=false,frames=0,walked=0,index=-1,path:TerraceFoot[]=[],cursor=0,arrived=false,reply='',last=performance.now();
function select(i:number){
 const goal=targets[i];if(!goal)return;
 const route=terrace.survey(foot,goal,1.2);
 if(!route.length){reply='该路线暂未通过碰撞检查';return}
 index=i;path=route;cursor=0;arrived=false;reply='';
 // Current foot is never teleported to survey grid; movement follows
 // small steps to the first actual sampled point.
}
function setNight(){const c=new Color(night?'#20304b':'#afc7d7');scene.background=c;scene.fog=new Fog(c,800,1400);
 ambient.intensity=night?.53:1.4;sun.intensity=night?.23:2;terrace.setNight(night);facilities.setNight(night);clouds.setNight(night);vista.setNight(night)}
function move(e:number,n:number){
 const h=terrace.footAt(e,n),mid=terrace.footAt((e+foot.east)/2,(n+foot.north)/2);
 if(h===undefined||mid===undefined||terrace.blocked(e,n,h)||terrace.blocked((e+foot.east)/2,(n+foot.north)/2,mid))return false;
 walked+=Math.hypot(e-foot.east,n-foot.north);foot={east:e,north:n,height:h};return true;
}
function interact(){
 const a=terrace.action(foot);if(a){reply=a.title+'：'+a.message;return}
 const ring={east:summitAssemblyAnchor.east+cloudStoneRingAnchor.east,north:summitAssemblyAnchor.north+cloudStoneRingAnchor.north};
 if(Math.hypot(foot.east-ring.east,foot.north-ring.north)<=4.2){
  const r=terrace.art.inspect('ring','touch',{east:foot.east-summitAssemblyAnchor.east,north:foot.north-summitAssemblyAnchor.north,height:foot.height},true);reply=r.message;return
 }
 reply='此处没有可查看的观景提示。';
}
for(const [i,t]of targets.entries()){const b=document.createElement('button');b.textContent=(i+1)+' '+t.name;b.onclick=()=>select(i);document.querySelector('#buttons')!.append(b)}
addEventListener('keydown',ev=>{
 if(/^Digit[1-7]$/.test(ev.code)){select(Number(ev.code.slice(-1))-1);return}
 if(ev.code==='KeyN'&&!ev.repeat){night=!night;setNight();return}
 if(ev.code==='KeyE'&&!ev.repeat){interact();return}
 if(ev.code.startsWith('Arrow')||ev.code==='KeyA'||ev.code==='KeyD'||ev.code==='KeyS'){path=[];cursor=0}
 keys.add(ev.code)
});
addEventListener('keyup',ev=>keys.delete(ev.code));addEventListener('blur',()=>keys.clear());
function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix()}
addEventListener('resize',resize);resize();setNight();
let clock=0;
renderer.setAnimationLoop(now=>{
 const dt=Math.max(0,Math.min(.05,(now-last)/1000));last=now;frames++;clock+=dt;clouds.update(dt);facilities.update(clock*1000);
 if(path.length&&keys.has('KeyW')&&!arrived){
  let budget=dt*4.5;
  while(budget>1e-5&&cursor<path.length){
   const p=path[cursor]!,de=p.east-foot.east,dn=p.north-foot.north,d=Math.hypot(de,dn);
   if(d<1e-5){cursor++;continue}
   const step=Math.min(budget,d);yaw=Math.atan2(de,dn);
   if(!move(foot.east+de*step/d,foot.north+dn*step/d)){reply='实走遇阻，停止';path=[];break}
   budget-=step;if(step>=d-1e-6)cursor++;
  }
  if(path.length&&cursor>=path.length){arrived=true;yaw=targets[index]!.lookYaw;pitch=index===0?-.14:index===1?-.13:index===2?.16:.01;reply='已步行抵达 '+targets[index]!.name}
 }else if(!path.length){
  yaw+=(Number(keys.has('ArrowRight'))-Number(keys.has('ArrowLeft')))*dt*1.5;
  pitch=Math.max(-1.1,Math.min(1.1,pitch+(Number(keys.has('ArrowUp'))-Number(keys.has('ArrowDown')))*dt));
  const f=Number(keys.has('KeyW'))-Number(keys.has('KeyS')),s=Number(keys.has('KeyD'))-Number(keys.has('KeyA')),d=dt*4.5/Math.max(1,Math.hypot(f,s));
  if(f||s)move(foot.east+(Math.sin(yaw)*f+Math.cos(yaw)*s)*d,foot.north+(Math.cos(yaw)*f-Math.sin(yaw)*s)*d);
 }
 camera.position.set(foot.east,foot.height+1.65,-foot.north);look.set(foot.east+Math.sin(yaw)*Math.cos(pitch),foot.height+1.65+Math.sin(pitch),-foot.north-Math.cos(yaw)*Math.cos(pitch));camera.lookAt(look);
 mountain.updateView(foot.east,foot.north);renderer.render(scene,camera);
 document.querySelector('#status')!.textContent='E'+foot.east.toFixed(2)+' N'+foot.north.toFixed(2)+' Y'+foot.height.toFixed(2)+' · 步行 '+walked.toFixed(1)+'m · '+renderer.info.render.calls+' draws';
 document.querySelector('#reply')!.textContent=reply;
});
Object.defineProperty(window,'__cloudR30',{value:{state:()=>({reviewOnly:true,foot:{...foot},ground:field.heightAt(foot.east,foot.north),supported:terrace.footAt(foot.east,foot.north),blocked:terrace.blocked(foot.east,foot.north,foot.height),index,arrived,walked,frames,night,reply,paving:terrace.paving,vistaClouds:vista.count,draws:renderer.info.render.calls,tris:renderer.info.render.triangles,remaining:path.length-cursor})}});
addEventListener('pagehide',()=>{renderer.setAnimationLoop(null);terrace.dispose();facilities.dispose();clouds.dispose();vista.dispose();mountain.dispose();renderer.dispose()},{once:true});
