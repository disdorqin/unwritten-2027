import {Color,DirectionalLight,Fog,HemisphereLight,PerspectiveCamera,Scene,WebGLRenderer,Vector3} from 'three';
import {createTerrainGrid,worldBounds} from './terrain';
import {mountWestCraterRoad} from './town-za22-crater-road';
import {buildCraterRailExtension} from './town-crater-rail-extension';
import {installCraterWorkshopWorld} from './town-crater-workstation-sites';

// Existing canonical crater and rail geometry, with the actual workshop mount.
// This review intentionally supplies no rule engine, no rewards, no fake E.
const scene=new Scene(),grid=createTerrainGrid();
const road=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n));
const rail=buildCraterRailExtension(grid,road);
const workshop=installCraterWorkshopWorld(road,rail);
scene.add(road.group,rail.group);
const renderer=new WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
document.body.prepend(renderer.domElement);
const camera=new PerspectiveCamera(70,1,.05,450);
const sky=new HemisphereLight(0xe3ecff,0x7a6a54,2.0),sun=new DirectionalLight(0xffedcc,2.1);
sun.position.set(-65,100,35);scene.add(sky,sun);
const ui=document.querySelector<HTMLSelectElement>('#site')!,lighting=document.querySelector<HTMLButtonElement>('#lighting')!,position=document.querySelector<HTMLElement>('#position')!;
for(const s of workshop.sites)ui.add(new Option(s.label,s.id));
let east=0,north=0,feet=0,yaw=0,pitch=0,night=false,last=performance.now(),ready=false,frame=0;
const keys=new Set<string>();
let drag=false;
const radius=.27;
const aim=new Vector3();
function light(){
  const color=new Color(night?0x26384f:0xa8bfd2);
  scene.background=color;scene.fog=new Fog(color,55,270);
  sky.intensity=night?1.02:2.0;sun.intensity=night?.33:2.1;
  sky.color.set(night?0x9eb9ed:0xe3ecff);
  road.craterActions.setNight(night);lighting.textContent=night?'雪夜':'白昼';
}
function choose(){
  const s=workshop.sites.find(s=>s.id===ui.value)!;
  // Surveyed operating feet, not a cinematic orbit or geometry close-up.
  ({east,north,height:feet}=s.foot);
  const de=s.target.east-east,dn=s.target.north-north;
  yaw=Math.atan2(de,dn);pitch=Math.atan2(s.target.height-feet-1.65,Math.hypot(de,dn));
}
function blocked(e:number,n:number,h:number){
  return (road.group.userData.colliders as {min:number[],max:number[]}[]).some(b=>{
    if(h+1.8<=b.min[1]||h>=b.max[1])return false;
    return Math.hypot(Math.max(b.min[0]-e,e-b.max[0],0),Math.max(b.min[2]+n,-n-b.max[2],0))<radius;
  });
}
function step(e:number,n:number){
  const h=road.heightAt(e,n);
  if(h===undefined||Math.abs(h-feet)>.43||blocked(e,n,h))return;
  east=e;north=n;feet=h;
}
function tick(now:number){
  const dt=Math.min(.05,(now-last)/1000);last=now;
  const fw=Number(keys.has('KeyW'))-Number(keys.has('KeyS')),side=Number(keys.has('KeyD'))-Number(keys.has('KeyA'));
  if(fw||side){const speed=3.2*dt/Math.hypot(fw,side);
    step(east+(Math.sin(yaw)*fw+Math.cos(yaw)*side)*speed,north+(Math.cos(yaw)*fw-Math.sin(yaw)*side)*speed);}
  camera.position.set(east,feet+1.65,-north);
  aim.set(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)).add(camera.position);
  camera.lookAt(aim);renderer.render(scene,camera);
  frame++;ready=true;
  position.textContent='东 '+east.toFixed(2)+' / 北 '+north.toFixed(2)+' / 高 '+feet.toFixed(2)+' · '+(workshop.aim({east,north,height:feet},yaw,pitch,1.65)??'未对准');
  requestAnimationFrame(tick);
}
function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}
addEventListener('resize',resize);addEventListener('keydown',e=>keys.add(e.code));addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>keys.clear());
renderer.domElement.addEventListener('pointerdown',e=>{drag=true;renderer.domElement.setPointerCapture(e.pointerId);});
renderer.domElement.addEventListener('pointerup',()=>drag=false);
renderer.domElement.addEventListener('pointermove',e=>{if(drag){yaw+=e.movementX*.003;pitch=Math.max(-1.2,Math.min(1.2,pitch-e.movementY*.003));}});
ui.addEventListener('change',choose);lighting.addEventListener('click',()=>{night=!night;light();});
resize();choose();light();
Object.defineProperty(window,'__craterWorkshopReview',{value:()=>({ready,frame,night,east,north,feet,yaw,pitch,site:ui.value,target:workshop.aim({east,north,height:feet},yaw,pitch,1.65),draws:renderer.info.render.calls,tris:renderer.info.render.triangles})});
requestAnimationFrame(tick);
